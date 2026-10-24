import { Prisma } from '@prisma/client';
import { EVENT_API_VERSION, eventTypeForAction } from './event-types';

// What must be loaded to build a payload; shared by webhook delivery and the
// pull API so both always describe an event identically
export const EVENT_PAYLOAD_INCLUDE = {
  receipt: { select: { id: true, receiptHash: true } },
  purposeVersion: { select: { id: true, version: true } },
  consentState: {
    select: {
      id: true,
      organizationId: true,
      subjectId: true,
      subject: { select: { externalRef: true } },
      purpose: { select: { id: true, key: true } },
    },
  },
} satisfies Prisma.ConsentEventInclude;

export type EventForPayload = Prisma.ConsentEventGetPayload<{
  include: typeof EVENT_PAYLOAD_INCLUDE;
}>;

export interface ConsentEventPayload {
  id: string;
  type: string;
  apiVersion: string;
  created: string;
  organizationId: string;
  data: {
    consentStateId: string;
    subjectId: string;
    // The organization's own identifier; subject email/phone are never sent
    externalRef: string | null;
    purpose: {
      id: string;
      key: string;
      versionId: string | null;
      version: number | null;
    };
    noticeVersionId: string | null;
    status: string;
    expiresAt: string | null;
    channel: string;
    actorType: string;
    receiptId: string | null;
    // Lets a receiver verify the event sits in the unbroken per-consent chain
    chain: { eventHash: string; previousEventHash: string | null };
  };
}

const STATUS_AFTER_ACTION: Record<string, string> = {
  granted: 'granted',
  renewed: 'granted',
  withdrawn: 'withdrawn',
  expired: 'expired',
};

export function toEventPayload(event: EventForPayload): ConsentEventPayload {
  const state = event.consentState;

  return {
    id: event.id,
    type: eventTypeForAction(event.action),
    apiVersion: EVENT_API_VERSION,
    created: event.timestamp.toISOString(),
    organizationId: state.organizationId,
    data: {
      consentStateId: state.id,
      subjectId: state.subjectId,
      externalRef: state.subject.externalRef,
      purpose: {
        id: state.purpose.id,
        key: state.purpose.key,
        versionId: event.purposeVersion?.id ?? null,
        version: event.purposeVersion?.version ?? null,
      },
      noticeVersionId: event.noticeVersionId,
      // Point-in-time values taken from the event itself, so the same event
      // always reads the same however late it is fetched
      status: STATUS_AFTER_ACTION[event.action] ?? event.action,
      expiresAt: event.expiresAt?.toISOString() ?? null,
      channel: event.channel,
      actorType: event.actorType,
      receiptId: event.receipt?.id ?? null,
      chain: {
        eventHash: event.eventHash,
        previousEventHash: event.previousEventHash,
      },
    },
  };
}
