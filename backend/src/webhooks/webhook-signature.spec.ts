import { buildSignatureHeader, verifySignatureHeader } from './webhook-signature';

const body = JSON.stringify({ id: 'evt-1', type: 'consent.granted' });
const now = new Date('2026-10-24T00:00:00.000Z');

describe('webhook signatures', () => {
  it('verifies a signature built with the same secret', () => {
    const header = buildSignatureHeader(['whsec_a'], body, now);
    expect(verifySignatureHeader(header, 'whsec_a', body, 300, now)).toBe(true);
  });

  it('rejects a wrong secret or a tampered body', () => {
    const header = buildSignatureHeader(['whsec_a'], body, now);
    expect(verifySignatureHeader(header, 'whsec_b', body, 300, now)).toBe(false);
    expect(verifySignatureHeader(header, 'whsec_a', body + ' ', 300, now)).toBe(false);
  });

  it('rejects a replay outside the tolerance window', () => {
    const header = buildSignatureHeader(['whsec_a'], body, now);
    const later = new Date(now.getTime() + 301_000);
    expect(verifySignatureHeader(header, 'whsec_a', body, 300, later)).toBe(false);
    const withinWindow = new Date(now.getTime() + 299_000);
    expect(verifySignatureHeader(header, 'whsec_a', body, 300, withinWindow)).toBe(true);
  });

  it('accepts either secret during rotation', () => {
    const header = buildSignatureHeader(['whsec_new', 'whsec_old'], body, now);
    expect(verifySignatureHeader(header, 'whsec_new', body, 300, now)).toBe(true);
    expect(verifySignatureHeader(header, 'whsec_old', body, 300, now)).toBe(true);
    expect(verifySignatureHeader(header, 'whsec_other', body, 300, now)).toBe(false);
  });

  it('rejects malformed headers', () => {
    expect(verifySignatureHeader('', 'whsec_a', body, 300, now)).toBe(false);
    expect(verifySignatureHeader('t=abc,v1=00', 'whsec_a', body, 300, now)).toBe(false);
    expect(verifySignatureHeader('v1=00', 'whsec_a', body, 300, now)).toBe(false);
  });
});
