import { computeEventHash, ConsentEventHashInput } from './event-hash';

const base: ConsentEventHashInput = {
  consentStateId: 'state-1',
  action: 'granted',
  actorType: 'admin',
  actorId: 'user-1',
  channel: 'web',
  purposeVersionId: 'pv-1',
  noticeVersionId: null,
  previousEventHash: null,
  timestamp: new Date('2026-10-08T00:00:00.000Z'),
};

describe('computeEventHash', () => {
  it('is deterministic', () => {
    expect(computeEventHash(base)).toBe(computeEventHash({ ...base }));
    expect(computeEventHash(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when any hashed field changes', () => {
    const original = computeEventHash(base);
    expect(computeEventHash({ ...base, action: 'withdrawn' })).not.toBe(original);
    expect(computeEventHash({ ...base, previousEventHash: 'abc' })).not.toBe(original);
    expect(computeEventHash({ ...base, timestamp: new Date('2026-10-08T00:00:00.001Z') })).not.toBe(
      original,
    );
  });
});
