import { createHash } from 'crypto';

export interface ConsentEventHashInput {
  consentStateId: string;
  action: string;
  actorType: string;
  actorId: string | null;
  channel: string;
  purposeVersionId: string | null;
  noticeVersionId: string | null;
  previousEventHash: string | null;
  timestamp: Date;
}

// Key order is fixed so the same event always serialises to the same string
export function computeEventHash(input: ConsentEventHashInput): string {
  const canonical = JSON.stringify({
    consentStateId: input.consentStateId,
    action: input.action,
    actorType: input.actorType,
    actorId: input.actorId,
    channel: input.channel,
    purposeVersionId: input.purposeVersionId,
    noticeVersionId: input.noticeVersionId,
    previousEventHash: input.previousEventHash,
    timestamp: input.timestamp.toISOString(),
  });

  return createHash('sha256').update(canonical).digest('hex');
}
