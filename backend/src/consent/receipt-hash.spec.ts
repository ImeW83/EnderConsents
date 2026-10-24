import { computeReceiptHash, ConsentReceiptPayload } from './receipt-hash';

const payload: ConsentReceiptPayload = {
  receiptVersion: 1,
  organizationId: 'org-1',
  subjectId: 'sub-1',
  consentStateId: 'state-1',
  eventId: 'event-1',
  eventHash: 'abc',
  action: 'granted',
  channel: 'web',
  timestamp: '2026-10-08T00:00:00.000Z',
  purpose: {
    id: 'p-1',
    key: 'marketing',
    versionId: 'pv-1',
    version: 1,
    name: 'Marketing',
    description: 'Emails',
    legalBasis: 'consent',
  },
  notice: null,
};

describe('computeReceiptHash', () => {
  it('is deterministic and changes when content changes', () => {
    const hash = computeReceiptHash(payload);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(computeReceiptHash({ ...payload })).toBe(hash);
    expect(computeReceiptHash({ ...payload, action: 'withdrawn' })).not.toBe(
      hash,
    );
  });

  it('is independent of key order in the stored payload', () => {
    const reordered = JSON.parse(
      JSON.stringify(Object.fromEntries(Object.entries(payload).reverse())),
    );
    expect(computeReceiptHash(reordered)).toBe(computeReceiptHash(payload));
  });
});
