import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SubjectsService } from '../subjects/subjects.service';
import { PurposesService } from '../purposes/purposes.service';
import { PurposeVersionsService } from '../purpose-versions/purpose-versions.service';
import { NoticesService } from '../notices/notices.service';
import { AuditService } from '../audit/audit.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { Actor, SYSTEM_ACTOR } from '../audit/actor';
import { computeEventHash } from './event-hash';
import { computeReceiptHash, ConsentReceiptPayload } from './receipt-hash';

export interface GrantConsentInput {
  subjectId: string;
  purposeId: string;
  channel: string;
  purposeVersionId?: string;
  noticeVersionId?: string;
  language?: string;
  expiresAt?: string;
}

export interface WithdrawConsentInput {
  channel: string;
}

export interface RenewConsentInput {
  channel: string;
  expiresAt?: string;
}

const EVENT_HISTORY = { orderBy: { timestamp: 'asc' } } as const;

@Injectable()
export class ConsentService {
  constructor(
    private prisma: PrismaService,
    private subjectsService: SubjectsService,
    private purposesService: PurposesService,
    private purposeVersionsService: PurposeVersionsService,
    private noticesService: NoticesService,
    private auditService: AuditService,
    private webhooksService: WebhooksService,
  ) {}

  async grant(organizationId: string, actor: Actor, input: GrantConsentInput) {
    this.requireFields(input, ['subjectId', 'purposeId', 'channel']);
    const expiresAt = this.parseOptionalDate(input.expiresAt);

    await this.subjectsService.findOne(organizationId, input.subjectId);
    await this.purposesService.findOne(organizationId, input.purposeId);

    const purposeVersionId = await this.resolvePurposeVersionId(
      organizationId,
      input.purposeId,
      input.purposeVersionId,
    );
    const noticeVersionId = await this.resolveNoticeVersionId(
      organizationId,
      input.noticeVersionId,
      input.language ?? 'en',
    );

    return this.prisma.$transaction(async (tx) => {
      // The upsert takes a row lock on an existing state, serialising concurrent
      // events for it so the hash chain cannot fork
      const state = await tx.consentState.upsert({
        where: {
          subjectId_purposeId: {
            subjectId: input.subjectId,
            purposeId: input.purposeId,
          },
        },
        create: {
          organizationId,
          subjectId: input.subjectId,
          purposeId: input.purposeId,
          status: 'granted',
          purposeVersionId,
          noticeVersionId,
          expiresAt,
        },
        update: {
          status: 'granted',
          purposeVersionId,
          noticeVersionId,
          expiresAt: expiresAt ?? null,
        },
      });

      const event = await this.recordEvent(tx, {
        consentStateId: state.id,
        action: 'granted',
        actor,
        channel: input.channel,
        purposeVersionId,
        noticeVersionId,
        expiresAt: state.expiresAt,
      });

      await this.auditService.record(
        organizationId,
        actor,
        'consent_granted',
        'ConsentState',
        state.id,
        JSON.stringify({
          eventId: event.id,
          subjectId: input.subjectId,
          purposeId: input.purposeId,
          channel: input.channel,
          purposeVersionId,
          noticeVersionId,
        }),
        tx,
      );

      return { state, event };
    });
  }

  async withdraw(
    organizationId: string,
    actor: Actor,
    consentStateId: string,
    input: WithdrawConsentInput,
  ) {
    this.requireFields(input, ['channel']);

    return this.prisma.$transaction(async (tx) => {
      const current = await this.lockState(tx, organizationId, consentStateId);

      if (current.status === 'withdrawn') {
        throw new ConflictException('Consent has already been withdrawn');
      }

      const state = await tx.consentState.update({
        where: { id: consentStateId },
        data: { status: 'withdrawn', expiresAt: null },
      });

      const event = await this.recordEvent(tx, {
        consentStateId,
        action: 'withdrawn',
        actor,
        channel: input.channel,
        purposeVersionId: current.purposeVersionId,
        noticeVersionId: current.noticeVersionId,
        expiresAt: null,
      });

      await this.auditService.record(
        organizationId,
        actor,
        'consent_withdrawn',
        'ConsentState',
        consentStateId,
        JSON.stringify({ eventId: event.id, channel: input.channel }),
        tx,
      );

      return { state, event };
    });
  }

  async renew(
    organizationId: string,
    actor: Actor,
    consentStateId: string,
    input: RenewConsentInput,
  ) {
    this.requireFields(input, ['channel']);
    const expiresAt = this.parseOptionalDate(input.expiresAt);

    return this.prisma.$transaction(async (tx) => {
      const current = await this.lockState(tx, organizationId, consentStateId);

      if (current.status !== 'granted') {
        throw new ConflictException(
          `Only granted consent can be renewed (current status: ${current.status})`,
        );
      }

      const state = await tx.consentState.update({
        where: { id: consentStateId },
        data: { expiresAt },
      });

      const event = await this.recordEvent(tx, {
        consentStateId,
        action: 'renewed',
        actor,
        channel: input.channel,
        purposeVersionId: current.purposeVersionId,
        noticeVersionId: current.noticeVersionId,
        expiresAt: state.expiresAt,
      });

      await this.auditService.record(
        organizationId,
        actor,
        'consent_renewed',
        'ConsentState',
        consentStateId,
        JSON.stringify({
          eventId: event.id,
          channel: input.channel,
          expiresAt: state.expiresAt?.toISOString() ?? null,
        }),
        tx,
      );

      return { state, event };
    });
  }

  // Records that a consent has lapsed. Run by the scheduled expiry job, which
  // is what makes expiry an auditable event rather than a date nobody acts on.
  // Returns null if the consent is no longer due (renewed or withdrawn meanwhile).
  async expire(organizationId: string, consentStateId: string) {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.lockState(tx, organizationId, consentStateId);

      if (
        current.status !== 'granted' ||
        !current.expiresAt ||
        current.expiresAt > new Date()
      ) {
        return null;
      }

      const state = await tx.consentState.update({
        where: { id: consentStateId },
        data: { status: 'expired' },
      });

      const event = await this.recordEvent(tx, {
        consentStateId,
        action: 'expired',
        actor: SYSTEM_ACTOR,
        channel: 'system',
        purposeVersionId: current.purposeVersionId,
        noticeVersionId: current.noticeVersionId,
        expiresAt: current.expiresAt,
      });

      await this.auditService.record(
        organizationId,
        SYSTEM_ACTOR,
        'consent_expired',
        'ConsentState',
        consentStateId,
        JSON.stringify({ eventId: event.id }),
        tx,
      );

      return { state, event };
    });
  }

  // Withdraws every granted consent for a subject. Each withdrawal is its own
  // transaction with its own event and receipt, so a failure part-way leaves
  // earlier ones in place; repeating the call finishes the rest.
  async withdrawAll(
    organizationId: string,
    actor: Actor,
    subjectId: string,
    input: WithdrawConsentInput,
  ) {
    this.requireFields(input, ['channel']);
    await this.subjectsService.findOne(organizationId, subjectId);

    const granted = await this.prisma.consentState.findMany({
      where: { organizationId, subjectId, status: 'granted' },
      select: { id: true },
    });

    const withdrawn: { consentStateId: string; eventId: string }[] = [];
    for (const { id } of granted) {
      try {
        const { event } = await this.withdraw(organizationId, actor, id, input);
        withdrawn.push({ consentStateId: id, eventId: event.id });
      } catch (error) {
        // Withdrawn concurrently by someone else: the outcome we wanted
        if (!(error instanceof ConflictException)) {
          throw error;
        }
      }
    }

    return { subjectId, withdrawn };
  }

  async findBySubject(organizationId: string, subjectId: string) {
    if (!subjectId) {
      throw new BadRequestException('subjectId is required');
    }

    await this.subjectsService.findOne(organizationId, subjectId);

    return this.prisma.consentState.findMany({
      where: { organizationId, subjectId },
      include: { purpose: true, events: EVENT_HISTORY },
    });
  }

  async findOne(organizationId: string, consentStateId: string) {
    const state = await this.prisma.consentState.findFirst({
      where: { id: consentStateId, organizationId },
      include: { purpose: true, events: EVENT_HISTORY },
    });

    if (!state) {
      throw new NotFoundException('Consent state not found');
    }

    return state;
  }

  private async lockState(
    tx: Prisma.TransactionClient,
    organizationId: string,
    id: string,
  ) {
    await tx.$queryRaw`SELECT id FROM "ConsentState" WHERE id = ${id} AND "organizationId" = ${organizationId} FOR UPDATE`;

    const state = await tx.consentState.findFirst({
      where: { id, organizationId },
    });

    if (!state) {
      throw new NotFoundException('Consent state not found');
    }

    return state;
  }

  private async recordEvent(
    tx: Prisma.TransactionClient,
    event: {
      consentStateId: string;
      action: string;
      actor: Actor;
      channel: string;
      purposeVersionId: string | null;
      noticeVersionId: string | null;
      expiresAt: Date | null;
    },
  ) {
    const previous = await tx.consentEvent.findFirst({
      where: { consentStateId: event.consentStateId },
      orderBy: { timestamp: 'desc' },
    });

    const previousEventHash = previous?.eventHash ?? null;
    // Generated once so the hashed value is exactly what gets stored
    const timestamp = new Date();

    const eventHash = computeEventHash({
      consentStateId: event.consentStateId,
      action: event.action,
      actorType: event.actor.actorType,
      actorId: event.actor.actorId,
      channel: event.channel,
      purposeVersionId: event.purposeVersionId,
      noticeVersionId: event.noticeVersionId,
      previousEventHash,
      timestamp,
    });

    const created = await tx.consentEvent.create({
      data: {
        consentStateId: event.consentStateId,
        action: event.action,
        actorType: event.actor.actorType,
        actorId: event.actor.actorId,
        channel: event.channel,
        // Stored as evidence but not part of the event hash, so existing chains stay valid
        ipAddress: event.actor.ipAddress ?? null,
        userAgent: event.actor.userAgent ?? null,
        expiresAt: event.expiresAt,
        purposeVersionId: event.purposeVersionId,
        noticeVersionId: event.noticeVersionId,
        timestamp,
        previousEventHash,
        eventHash,
      },
    });

    await this.issueReceipt(tx, created);
    // Same transaction: a committed event always has its webhook deliveries queued
    await this.webhooksService.enqueueForEvent(tx, created.id);

    return created;
  }

  // Snapshots what was agreed to at event time. Subject email/phone are
  // deliberately left out so an erasure request is never blocked by a receipt.
  private async issueReceipt(
    tx: Prisma.TransactionClient,
    event: {
      id: string;
      consentStateId: string;
      action: string;
      channel: string;
      purposeVersionId: string | null;
      noticeVersionId: string | null;
      eventHash: string;
      timestamp: Date;
    },
  ) {
    const state = await tx.consentState.findUniqueOrThrow({
      where: { id: event.consentStateId },
      include: { purpose: true },
    });
    const purposeVersion = event.purposeVersionId
      ? await tx.purposeVersion.findUnique({
          where: { id: event.purposeVersionId },
        })
      : null;
    const notice = event.noticeVersionId
      ? await tx.noticeVersion.findUnique({
          where: { id: event.noticeVersionId },
        })
      : null;

    const payload: ConsentReceiptPayload = {
      receiptVersion: 1,
      organizationId: state.organizationId,
      subjectId: state.subjectId,
      consentStateId: state.id,
      eventId: event.id,
      eventHash: event.eventHash,
      action: event.action,
      channel: event.channel,
      timestamp: event.timestamp.toISOString(),
      purpose: {
        id: state.purpose.id,
        key: state.purpose.key,
        versionId: purposeVersion?.id ?? null,
        version: purposeVersion?.version ?? null,
        name: purposeVersion?.name ?? state.purpose.name,
        description: purposeVersion?.description ?? state.purpose.description,
        legalBasis: purposeVersion?.legalBasis ?? null,
      },
      notice: notice
        ? {
            versionId: notice.id,
            version: notice.version,
            language: notice.language,
          }
        : null,
    };

    return tx.consentReceipt.create({
      data: {
        consentEventId: event.id,
        receiptHash: computeReceiptHash(payload),
        payload: payload as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async findReceipt(organizationId: string, eventId: string) {
    const receipt = await this.prisma.consentReceipt.findFirst({
      where: {
        consentEventId: eventId,
        consentEvent: { consentState: { organizationId } },
      },
    });

    if (!receipt) {
      throw new NotFoundException('Receipt not found');
    }

    return receipt;
  }

  async findReceiptsForState(organizationId: string, consentStateId: string) {
    await this.findOne(organizationId, consentStateId);

    return this.prisma.consentReceipt.findMany({
      where: { consentEvent: { consentStateId } },
      orderBy: { issuedAt: 'asc' },
    });
  }

  async verifyReceipt(organizationId: string, eventId: string) {
    const receipt = await this.findReceipt(organizationId, eventId);
    const payload = receipt.payload as unknown as ConsentReceiptPayload;
    const event = await this.prisma.consentEvent.findUniqueOrThrow({
      where: { id: eventId },
    });

    const hashMatches = computeReceiptHash(payload) === receipt.receiptHash;
    const eventMatches = payload.eventHash === event.eventHash;

    return {
      receiptId: receipt.id,
      valid: hashMatches && eventMatches,
      hashMatches,
      eventMatches,
    };
  }

  private async resolvePurposeVersionId(
    organizationId: string,
    purposeId: string,
    suppliedId?: string,
  ): Promise<string | null> {
    if (suppliedId) {
      const version = await this.purposeVersionsService.findOne(
        organizationId,
        purposeId,
        suppliedId,
      );
      return version.id;
    }

    const latest = await this.purposeVersionsService.findLatest(
      organizationId,
      purposeId,
    );
    return latest?.id ?? null;
  }

  private async resolveNoticeVersionId(
    organizationId: string,
    suppliedId: string | undefined,
    language: string,
  ): Promise<string | null> {
    if (suppliedId) {
      const notice = await this.noticesService.findOne(
        organizationId,
        suppliedId,
      );
      return notice.id;
    }

    try {
      const current = await this.noticesService.findCurrent(
        organizationId,
        language,
      );
      return current.id;
    } catch (error) {
      if (error instanceof NotFoundException) {
        return null;
      }
      throw error;
    }
  }

  private requireFields<T extends object>(input: T, fields: (keyof T)[]) {
    const missing = fields.filter((field) => !input[field]);
    if (missing.length > 0) {
      throw new BadRequestException(
        `Missing required field(s): ${missing.join(', ')}`,
      );
    }
  }

  private parseOptionalDate(value?: string): Date | undefined {
    if (!value) {
      return undefined;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('expiresAt must be a valid date');
    }

    return date;
  }
}
