import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Actor } from '../audit/actor';
import {
  EVENT_PAYLOAD_INCLUDE,
  toEventPayload,
} from '../events/event-payload';
import {
  CONSENT_EVENT_TYPES,
  EVENT_API_VERSION,
  TEST_EVENT_TYPE,
  WILDCARD,
  isSubscribable,
  subscribesTo,
} from '../events/event-types';
import { validateWebhookUrl } from './url-safety';

export interface CreateWebhookInput {
  url: string;
  events?: string[];
  description?: string;
}

export interface UpdateWebhookInput {
  url?: string;
  events?: string[];
  description?: string;
  isActive?: boolean;
}

const MAX_WEBHOOKS_PER_ORGANIZATION = 20;
const DEFAULT_GRACE_HOURS = 24;
const MAX_GRACE_HOURS = 168;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// The signing secret is returned once on create/rotate and never listed again
const SAFE_FIELDS = {
  id: true,
  url: true,
  description: true,
  events: true,
  isActive: true,
  disabledReason: true,
  consecutiveFailures: true,
  previousSecretExpiresAt: true,
  createdAt: true,
} as const;

const newSecret = () => `whsec_${randomBytes(32).toString('hex')}`;

@Injectable()
export class WebhooksService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async create(organizationId: string, actor: Actor, input: CreateWebhookInput) {
    const url = this.requireValidUrl(input.url);
    const events = this.validateEvents(input.events ?? [WILDCARD]);

    const count = await this.prisma.webhook.count({ where: { organizationId } });
    if (count >= MAX_WEBHOOKS_PER_ORGANIZATION) {
      throw new ConflictException(
        `An organization can have at most ${MAX_WEBHOOKS_PER_ORGANIZATION} webhooks`,
      );
    }

    const secret = newSecret();

    return this.prisma.$transaction(async (tx) => {
      const webhook = await tx.webhook.create({
        data: {
          organizationId,
          url,
          events,
          description: input.description ?? '',
          secret,
        },
        select: SAFE_FIELDS,
      });

      await this.auditService.record(
        organizationId,
        actor,
        'webhook_created',
        'Webhook',
        webhook.id,
        JSON.stringify({ events }),
        tx,
      );

      return { ...webhook, secret };
    });
  }

  async findAll(organizationId: string) {
    return this.prisma.webhook.findMany({
      where: { organizationId },
      select: SAFE_FIELDS,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const webhook = await this.prisma.webhook.findFirst({
      where: { id, organizationId },
      select: SAFE_FIELDS,
    });
    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }
    return webhook;
  }

  async update(
    organizationId: string,
    actor: Actor,
    id: string,
    input: UpdateWebhookInput,
  ) {
    await this.findOne(organizationId, id);

    const data: Prisma.WebhookUpdateInput = {};
    if (input.url !== undefined) data.url = this.requireValidUrl(input.url);
    if (input.events !== undefined) data.events = this.validateEvents(input.events);
    if (input.description !== undefined) data.description = input.description;
    if (input.isActive !== undefined) {
      data.isActive = input.isActive;
      if (input.isActive) {
        // Re-enabling is a fresh start; deliveries held while disabled resume
        data.consecutiveFailures = 0;
        data.disabledReason = null;
      } else {
        data.disabledReason = 'Disabled manually';
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const webhook = await tx.webhook.update({
        where: { id },
        data,
        select: SAFE_FIELDS,
      });

      await this.auditService.record(
        organizationId,
        actor,
        'webhook_updated',
        'Webhook',
        id,
        JSON.stringify({ fields: Object.keys(data) }),
        tx,
      );

      return webhook;
    });
  }

  async remove(organizationId: string, actor: Actor, id: string) {
    await this.findOne(organizationId, id);

    await this.prisma.$transaction(async (tx) => {
      await tx.webhook.delete({ where: { id } });
      await this.auditService.record(
        organizationId,
        actor,
        'webhook_deleted',
        'Webhook',
        id,
        undefined,
        tx,
      );
    });

    return { id, deleted: true };
  }

  // The old secret keeps verifying for the grace period, so receivers can
  // deploy the new one without dropping events in between
  async rotateSecret(
    organizationId: string,
    actor: Actor,
    id: string,
    graceHours?: number,
  ) {
    const grace = graceHours ?? DEFAULT_GRACE_HOURS;
    if (!Number.isFinite(grace) || grace < 0 || grace > MAX_GRACE_HOURS) {
      throw new BadRequestException(
        `gracePeriodHours must be between 0 and ${MAX_GRACE_HOURS}`,
      );
    }

    const current = await this.prisma.webhook.findFirst({
      where: { id, organizationId },
    });
    if (!current) {
      throw new NotFoundException('Webhook not found');
    }

    const secret = newSecret();

    return this.prisma.$transaction(async (tx) => {
      const webhook = await tx.webhook.update({
        where: { id },
        data: {
          secret,
          previousSecret: grace > 0 ? current.secret : null,
          previousSecretExpiresAt:
            grace > 0 ? new Date(Date.now() + grace * 3_600_000) : null,
        },
        select: SAFE_FIELDS,
      });

      await this.auditService.record(
        organizationId,
        actor,
        'webhook_secret_rotated',
        'Webhook',
        id,
        JSON.stringify({ gracePeriodHours: grace }),
        tx,
      );

      return { ...webhook, secret };
    });
  }

  // Queues a synthetic event so a customer can check their endpoint and
  // signature verification without waiting for real consent activity
  async sendTest(organizationId: string, id: string) {
    await this.findOne(organizationId, id);

    return this.prisma.webhookDelivery.create({
      data: {
        webhookId: id,
        organizationId,
        eventType: TEST_EVENT_TYPE,
        eventId: null,
        payload: {
          id: randomUUID(),
          type: TEST_EVENT_TYPE,
          apiVersion: EVENT_API_VERSION,
          created: new Date().toISOString(),
          organizationId,
          data: { message: 'This is a test event from EnderConsents.' },
        },
      },
    });
  }

  async listDeliveries(
    organizationId: string,
    id: string,
    query: { status?: string; limit?: string; offset?: string },
  ) {
    await this.findOne(organizationId, id);

    const limit = this.parseInteger(query.limit, 'limit', DEFAULT_LIMIT, 1, MAX_LIMIT);
    const offset = this.parseInteger(query.offset, 'offset', 0, 0);

    return this.prisma.webhookDelivery.findMany({
      where: { webhookId: id, ...(query.status && { status: query.status }) },
      select: {
        id: true,
        eventType: true,
        eventId: true,
        status: true,
        attempts: true,
        nextAttemptAt: true,
        lastStatusCode: true,
        lastError: true,
        createdAt: true,
        deliveredAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  async findDelivery(organizationId: string, id: string, deliveryId: string) {
    await this.findOne(organizationId, id);

    const delivery = await this.prisma.webhookDelivery.findFirst({
      where: { id: deliveryId, webhookId: id },
      include: { attemptLog: { orderBy: { createdAt: 'asc' } } },
    });
    if (!delivery) {
      throw new NotFoundException('Delivery not found');
    }
    return delivery;
  }

  async redeliver(
    organizationId: string,
    actor: Actor,
    id: string,
    deliveryId: string,
  ) {
    const webhook = await this.findOne(organizationId, id);
    const delivery = await this.findDelivery(organizationId, id, deliveryId);

    if (!webhook.isActive) {
      throw new ConflictException('Re-enable the webhook before redelivering');
    }

    // A pending delivery is waiting out its retry delay; this means "retry now"
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'pending',
          attempts: 0,
          nextAttemptAt: new Date(),
          lockedUntil: null,
          lastError: null,
          lastStatusCode: null,
          deliveredAt: null,
        },
      });

      await this.auditService.record(
        organizationId,
        actor,
        'webhook_delivery_redelivered',
        'WebhookDelivery',
        deliveryId,
        JSON.stringify({ webhookId: id }),
        tx,
      );

      return updated;
    });
  }

  // Called inside the consent transaction. Writing the outbox rows there is
  // what guarantees a committed event always has its notifications queued.
  async enqueueForEvent(tx: Prisma.TransactionClient, eventId: string) {
    const event = await tx.consentEvent.findUniqueOrThrow({
      where: { id: eventId },
      include: EVENT_PAYLOAD_INCLUDE,
    });
    const payload = toEventPayload(event);

    const webhooks = await tx.webhook.findMany({
      where: { organizationId: payload.organizationId, isActive: true },
      select: { id: true, events: true },
    });

    const targets = webhooks.filter((w) => subscribesTo(w.events, payload.type));
    if (targets.length === 0) {
      return;
    }

    await tx.webhookDelivery.createMany({
      data: targets.map((w) => ({
        webhookId: w.id,
        organizationId: payload.organizationId,
        eventType: payload.type,
        eventId,
        payload: payload as unknown as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    });
  }

  private requireValidUrl(url: string | undefined): string {
    if (!url) {
      throw new BadRequestException('Missing required field(s): url');
    }
    const problem = validateWebhookUrl(url);
    if (problem) {
      throw new BadRequestException(problem);
    }
    return url;
  }

  private validateEvents(events: string[]): string[] {
    if (!Array.isArray(events) || events.length === 0) {
      throw new BadRequestException('events must be a non-empty array');
    }
    const invalid = events.filter((e) => !isSubscribable(e));
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Unknown event type(s): ${invalid.join(', ')}. Allowed: ${[...CONSENT_EVENT_TYPES, WILDCARD].join(', ')}`,
      );
    }
    return [...new Set(events)];
  }

  private parseInteger(
    value: string | undefined,
    name: string,
    fallback: number,
    min: number,
    max?: number,
  ): number {
    if (value === undefined || value === '') {
      return fallback;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || (max !== undefined && parsed > max)) {
      throw new BadRequestException(
        `${name} must be an integer${max !== undefined ? ` between ${min} and ${max}` : ` >= ${min}`}`,
      );
    }
    return parsed;
  }
}
