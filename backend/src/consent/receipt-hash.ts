import { createHash } from 'crypto';

export interface ConsentReceiptPayload {
  receiptVersion: 1;
  organizationId: string;
  subjectId: string;
  consentStateId: string;
  eventId: string;
  eventHash: string;
  action: string;
  channel: string;
  timestamp: string;
  purpose: {
    id: string;
    key: string;
    versionId: string | null;
    version: number | null;
    name: string;
    description: string;
    legalBasis: string | null;
  };
  notice: {
    versionId: string;
    version: number;
    language: string;
  } | null;
}

// Payloads are built with a fixed key order, so the same receipt always
// serialises to the same string. Postgres jsonb reorders keys on read, so
// verification re-canonicalises before hashing.
export function canonicalReceiptPayload(
  payload: ConsentReceiptPayload,
): string {
  return JSON.stringify({
    receiptVersion: payload.receiptVersion,
    organizationId: payload.organizationId,
    subjectId: payload.subjectId,
    consentStateId: payload.consentStateId,
    eventId: payload.eventId,
    eventHash: payload.eventHash,
    action: payload.action,
    channel: payload.channel,
    timestamp: payload.timestamp,
    purpose: {
      id: payload.purpose.id,
      key: payload.purpose.key,
      versionId: payload.purpose.versionId,
      version: payload.purpose.version,
      name: payload.purpose.name,
      description: payload.purpose.description,
      legalBasis: payload.purpose.legalBasis,
    },
    notice: payload.notice
      ? {
          versionId: payload.notice.versionId,
          version: payload.notice.version,
          language: payload.notice.language,
        }
      : null,
  });
}

export function computeReceiptHash(payload: ConsentReceiptPayload): string {
  return createHash('sha256')
    .update(canonicalReceiptPayload(payload))
    .digest('hex');
}
