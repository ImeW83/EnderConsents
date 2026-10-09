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
import { computeEventHash } from './event-hash';

export interface Actor {
  actorType: string;
  actorId: string | null;
}

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
          subjectId_purposeId: { subjectId: input.subjectId, purposeId: input.purposeId },
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
      });

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
      });

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
      });

      return { state, event };
    });
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

  private async lockState(tx: Prisma.TransactionClient, organizationId: string, id: string) {
    await tx.$queryRaw`SELECT id FROM "ConsentState" WHERE id = ${id} AND "organizationId" = ${organizationId} FOR UPDATE`;

    const state = await tx.consentState.findFirst({ where: { id, organizationId } });

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

    return tx.consentEvent.create({
      data: {
        consentStateId: event.consentStateId,
        action: event.action,
        actorType: event.actor.actorType,
        actorId: event.actor.actorId,
        channel: event.channel,
        purposeVersionId: event.purposeVersionId,
        noticeVersionId: event.noticeVersionId,
        timestamp,
        previousEventHash,
        eventHash,
      },
    });
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

    const latest = await this.purposeVersionsService.findLatest(organizationId, purposeId);
    return latest?.id ?? null;
  }

  private async resolveNoticeVersionId(
    organizationId: string,
    suppliedId: string | undefined,
    language: string,
  ): Promise<string | null> {
    if (suppliedId) {
      const notice = await this.noticesService.findOne(organizationId, suppliedId);
      return notice.id;
    }

    try {
      const current = await this.noticesService.findCurrent(organizationId, language);
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
      throw new BadRequestException(`Missing required field(s): ${missing.join(', ')}`);
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
