import { isBlockedAddress, validateWebhookUrl } from './url-safety';

describe('isBlockedAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254', // cloud metadata
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    'not-an-ip',
  ])('blocks %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(['8.8.8.8', '172.32.0.1', '1.1.1.1', '2606:4700:4700::1111'])(
    'allows %s',
    (address) => {
      expect(isBlockedAddress(address)).toBe(false);
    },
  );
});

describe('validateWebhookUrl', () => {
  const original = process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS;
  afterEach(() => {
    if (original === undefined) delete process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS;
    else process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS = original;
  });

  it('accepts a normal https URL', () => {
    expect(validateWebhookUrl('https://example.com/hooks/consent')).toBeNull();
  });

  it.each([
    'http://example.com/hook',
    'https://localhost/hook',
    'https://app.localhost/hook',
    'https://metadata.internal/x',
    'https://127.0.0.1/hook',
    'https://[::1]/hook',
    'https://169.254.169.254/latest/meta-data',
    'https://user:pass@example.com/hook',
    'not a url',
    'ftp://example.com/hook',
  ])('rejects %s', (url) => {
    expect(validateWebhookUrl(url)).not.toBeNull();
  });

  it('allows local http targets only when explicitly enabled', () => {
    process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS = 'true';
    expect(validateWebhookUrl('http://localhost:9999/hook')).toBeNull();
    expect(validateWebhookUrl('http://user:pass@localhost/hook')).not.toBeNull();
  });
});
