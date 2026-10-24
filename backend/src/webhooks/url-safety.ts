import { BlockList, isIP } from 'net';
import { lookup as dnsLookup } from 'dns';
import type { LookupFunction } from 'net';

// Webhook URLs are supplied by customers, so the server must not be usable to
// reach internal services (SSRF). Checked when the URL is saved AND on every
// connection: validating only at save time would miss DNS rebinding.

const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local, includes cloud metadata services
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv6');
}

export const allowPrivateTargets = () =>
  process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS === 'true';

export function isBlockedAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 0) {
    return true; // not an IP at all: refuse rather than guess
  }

  // ::ffff:10.0.0.1 is an IPv4 address in IPv6 clothing
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) {
    return blocked.check(mapped[1], 'ipv4');
  }

  return blocked.check(address, version === 4 ? 'ipv4' : 'ipv6');
}

// Returns an error message, or null when the URL is acceptable
export function validateWebhookUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'url must be a valid absolute URL';
  }

  const permissive = allowPrivateTargets();

  if (url.protocol !== 'https:' && !(permissive && url.protocol === 'http:')) {
    return 'url must use https';
  }
  if (url.username || url.password) {
    return 'url must not contain credentials';
  }
  if (permissive) {
    return null;
  }

  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    return 'url must not point at a local or internal host';
  }
  if (isIP(host) !== 0 && isBlockedAddress(host)) {
    return 'url must not point at a private or reserved address';
  }

  return null;
}

// Plugged into the HTTPS request so the check applies to the address actually
// connected to, closing the gap between "resolved" and "connected"
export const safeLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, options, (error, address, family) => {
    if (error) {
      return callback(error, address as never, family as never);
    }

    const addresses = Array.isArray(address)
      ? address.map((a) => a.address)
      : [address as string];

    if (!allowPrivateTargets() && addresses.some(isBlockedAddress)) {
      return callback(
        new Error(`Refusing to connect to private address for ${hostname}`),
        address as never,
        family as never,
      );
    }

    callback(null, address as never, family as never);
  });
};
