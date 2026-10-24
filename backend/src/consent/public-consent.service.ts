import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubjectsService } from '../subjects/subjects.service';
import { ConsentService } from './consent.service';
import { Actor, subjectActorFrom } from '../audit/actor';

export interface SubjectRef {
  subjectId?: string;
  externalRef?: string;
}

export interface PurposeRef {
  purposeId?: string;
  purposeKey?: string;
}

export interface PublicGrantInput extends SubjectRef, PurposeRef {
  channel?: string;
  email?: string;
  phone?: string;
  locale?: string;
  noticeVersionId?: string;
  language?: string;
  expiresAt?: string;
}

export interface PublicWithdrawInput extends SubjectRef, PurposeRef {
  channel?: string;
}

const DEFAULT_CHANNEL = 'api';

// Consent API for an organization's own systems (website backend, mobile
// backend), authenticated by API key. Resolves the organization's own
// identifiers (externalRef, purposeKey) and delegates to ConsentService, so
// the state machine, hash chain, receipts and audit trail behave identically.
@Injectable()
export class PublicConsentService {
  constructor(
    private prisma: PrismaService,
    private subjectsService: SubjectsService,
    private consentService: ConsentService,
  ) {}

  async grant(organizationId: string, req: any, input: PublicGrantInput) {
    const apiKeyActor: Actor = { actorType: 'api', actorId: req.apiKey.id };
    const purposeId = await this.resolvePurposeId(organizationId, input);

    let subject = await this.findSubject(organizationId, input);
    if (!subject) {
      if (!input.externalRef) {
        throw new NotFoundException('Subject not found');
      }
      // First sighting of this person: create them from the identifiers supplied
      subject = await this.subjectsService.create(
        organizationId,
        {
          externalRef: input.externalRef,
          email: input.email,
          phone: input.phone,
          locale: input.locale,
        },
        apiKeyActor,
      );
    }

    return this.consentService.grant(
      organizationId,
      subjectActorFrom(req, subject.id),
      {
        subjectId: subject.id,
        purposeId,
        channel: input.channel ?? DEFAULT_CHANNEL,
        noticeVersionId: input.noticeVersionId,
        language: input.language ?? subject.locale,
        expiresAt: input.expiresAt,
      },
    );
  }

  async withdraw(organizationId: string, req: any, input: PublicWithdrawInput) {
    const subject = await this.requireSubject(organizationId, input);
    const purposeId = await this.resolvePurposeId(organizationId, input);

    const state = await this.prisma.consentState.findUnique({
      where: { subjectId_purposeId: { subjectId: subject.id, purposeId } },
    });
    if (!state) {
      throw new NotFoundException('No consent record for this subject and purpose');
    }

    return this.consentService.withdraw(
      organizationId,
      subjectActorFrom(req, subject.id),
      state.id,
      { channel: input.channel ?? DEFAULT_CHANNEL },
    );
  }

  async withdrawAll(
    organizationId: string,
    req: any,
    input: SubjectRef & { channel?: string },
  ) {
    const subject = await this.requireSubject(organizationId, input);

    return this.consentService.withdrawAll(
      organizationId,
      subjectActorFrom(req, subject.id),
      subject.id,
      { channel: input.channel ?? DEFAULT_CHANNEL },
    );
  }

  async status(organizationId: string, ref: SubjectRef) {
    const subject = await this.requireSubject(organizationId, ref);

    const states = await this.prisma.consentState.findMany({
      where: { organizationId, subjectId: subject.id },
      include: {
        purpose: { select: { id: true, key: true, name: true } },
        events: { orderBy: { timestamp: 'desc' }, take: 1, select: { id: true } },
      },
    });

    const now = new Date();
    return {
      subjectId: subject.id,
      externalRef: subject.externalRef,
      consents: states.map((state) => ({
        consentStateId: state.id,
        purpose: state.purpose,
        status: state.status,
        // A granted consent past its expiry no longer counts, even before any job marks it
        effectiveStatus:
          state.status === 'granted' && state.expiresAt && state.expiresAt <= now
            ? 'expired'
            : state.status,
        expiresAt: state.expiresAt,
        updatedAt: state.updatedAt,
        latestEventId: state.events[0]?.id ?? null,
      })),
    };
  }

  private async findSubject(organizationId: string, ref: SubjectRef) {
    if (ref.subjectId) {
      return this.prisma.subject.findFirst({
        where: { id: ref.subjectId, organizationId },
      });
    }
    if (ref.externalRef) {
      return this.prisma.subject.findFirst({
        where: { externalRef: ref.externalRef, organizationId },
      });
    }
    throw new BadRequestException('Provide subjectId or externalRef');
  }

  private async requireSubject(organizationId: string, ref: SubjectRef) {
    const subject = await this.findSubject(organizationId, ref);
    if (!subject) {
      throw new NotFoundException('Subject not found');
    }
    return subject;
  }

  private async resolvePurposeId(organizationId: string, ref: PurposeRef) {
    if (!ref.purposeId && !ref.purposeKey) {
      throw new BadRequestException('Provide purposeId or purposeKey');
    }

    const purpose = await this.prisma.purpose.findFirst({
      where: ref.purposeId
        ? { id: ref.purposeId, organizationId }
        : { key: ref.purposeKey, organizationId },
    });
    if (!purpose) {
      throw new NotFoundException('Purpose not found');
    }
    return purpose.id;
  }
}
