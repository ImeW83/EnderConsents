import { createHmac, timingSafeEqual } from 'crypto';

export const SIGNATURE_HEADER = 'EnderConsents-Signature';
export const DEFAULT_TOLERANCE_SECONDS = 300;

const sign = (secret: string, timestamp: number, body: string) =>
  createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');

// Header format: t=<unix seconds>,v1=<hex>[,v1=<hex>]
// A second v1 appears during secret rotation, so receivers holding either the
// old or the new secret can verify. The timestamp is signed, so a captured
// request cannot be replayed once it falls outside the receiver's tolerance.
export function buildSignatureHeader(
  secrets: string[],
  body: string,
  now: Date = new Date(),
): string {
  const timestamp = Math.floor(now.getTime() / 1000);
  const signatures = secrets.map((s) => `v1=${sign(s, timestamp, body)}`);
  return [`t=${timestamp}`, ...signatures].join(',');
}

// Reference implementation of the receiver's check; also what we publish in docs
export function verifySignatureHeader(
  header: string,
  secret: string,
  body: string,
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
  now: Date = new Date(),
): boolean {
  const parts = header.split(',').map((p) => p.trim().split('='));
  const timestamp = Number(parts.find(([k]) => k === 't')?.[1]);
  const candidates = parts.filter(([k]) => k === 'v1').map(([, v]) => v);

  if (!Number.isFinite(timestamp) || candidates.length === 0) {
    return false;
  }
  if (Math.abs(now.getTime() / 1000 - timestamp) > toleranceSeconds) {
    return false;
  }

  const expected = Buffer.from(sign(secret, timestamp, body), 'hex');
  return candidates.some((candidate) => {
    const given = Buffer.from(candidate ?? '', 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
