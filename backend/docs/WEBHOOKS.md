# Webhooks, event feed and idempotency

How an organization's systems learn about consent changes, and how to call the
consent API safely. Everything here is implemented and covered by tests.

## Running it

Webhook delivery and consent expiry run in a **separate worker process**, so a
slow customer endpoint can never slow down consent capture.

```
npm run build
npm run start         # API (node dist/main)
npm run start:worker  # worker (node dist/worker) – needs Redis and Postgres
```

| Variable | Default | Meaning |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379` | Used by the worker only |
| `WEBHOOK_ALLOW_PRIVATE_TARGETS` | unset | `true` allows `http://` and localhost/private targets. **Development only.** |

If the worker is stopped, consent capture is unaffected: deliveries wait in the
database and are sent when it returns.

## Event types

`consent.granted`, `consent.withdrawn`, `consent.renewed`, `consent.expired`
(plus `webhook.test`, only from the test button). Subscribe to specific types or `*`.

## Payload

```json
{
  "id": "9f1c…",                      // the consent event id – use it to deduplicate
  "type": "consent.withdrawn",
  "apiVersion": "2026-10-01",
  "created": "2026-10-24T01:20:11.402Z",
  "organizationId": "…",
  "data": {
    "consentStateId": "…",
    "subjectId": "…",
    "externalRef": "customer-8841",   // your own identifier; email/phone are never sent
    "purpose": { "id": "…", "key": "marketing", "versionId": "…", "version": 3 },
    "noticeVersionId": "…",
    "status": "withdrawn",            // state right after THIS event, not now
    "expiresAt": null,
    "channel": "web",
    "actorType": "subject",
    "receiptId": "…",
    "chain": { "eventHash": "…", "previousEventHash": "…" }
  }
}
```

The same event reads identically whether pushed or pulled. `chain` lets you
verify the event belongs to the unbroken hash chain for that consent.

## Headers

```
EnderConsents-Signature: t=1792804111,v1=<hex>[,v1=<hex>]
EnderConsents-Delivery:  <delivery id>
EnderConsents-Event:     consent.withdrawn
EnderConsents-Api-Version: 2026-10-01
```

## Verifying the signature

`v1` = hex HMAC-SHA256, key = your `whsec_…` secret, message = `<t>.<raw body>`.
Use the **raw request body** (before JSON parsing) and reject old timestamps.

```js
const crypto = require('crypto');

function verify(header, rawBody, secret, toleranceSeconds = 300) {
  const parts = header.split(',').map((p) => p.split('='));
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest();
  return signatures.some((s) => {
    const given = Buffer.from(s, 'hex');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}
```

During a secret rotation the header carries two `v1` values; your check passes
if either matches, so you can deploy the new secret without dropping events.

## Delivery guarantees

- **At least once.** A committed consent event always has its deliveries queued
  (they are written in the same database transaction). Duplicates can happen:
  deduplicate on `id`.
- **Not strictly ordered** (retries). Use `created` and `chain` to ignore stale events.
- Success = any `2xx` within 10 seconds. Redirects are not followed.
- Retries after 1 min, 5 min, 30 min, 2 h, 6 h, 12 h (7 attempts, about 21 h).
  After that the delivery is `failed` and can be redelivered.
- 30 consecutive failed attempts disable the webhook (recorded in the audit log).
  Events are not queued while it is disabled; use the event feed below to catch up.

## Managing webhooks (dashboard users, `webhook:manage`)

```
POST   /api/v1/webhooks                      { url, events?, description? }  -> includes secret, once
GET    /api/v1/webhooks
PATCH  /api/v1/webhooks/:id                  { url?, events?, description?, isActive? }
DELETE /api/v1/webhooks/:id
POST   /api/v1/webhooks/:id/rotate-secret    { gracePeriodHours? }  default 24, max 168
POST   /api/v1/webhooks/:id/test
GET    /api/v1/webhooks/:id/deliveries?status=&limit=&offset=
GET    /api/v1/webhooks/:id/deliveries/:deliveryId        (includes every attempt)
POST   /api/v1/webhooks/:id/deliveries/:deliveryId/redeliver   (also "retry now")
```

URLs must be `https`, with no credentials, and must not resolve to a private,
loopback, link-local or metadata address. The address is checked again on every
connection, which defeats DNS-rebinding.

## Event feed (catch up after downtime)

```
GET /api/v1/public/events?after=<cursor>&limit=100&type=consent.withdrawn   (X-API-Key, consent:read)
GET /api/v1/events?...                                                       (dashboard JWT)
```

Returns `{ data: [...events, each with "cursor"], nextCursor, hasMore }`. Store
`nextCursor` and pass it as `after` next time; `nextCursor` stays put when there
is nothing new. Events from the last 5 seconds are held back so a cursor can
never skip an event that was still committing.

## Idempotency keys (public consent API)

Send `Idempotency-Key: <unique string, max 255>` on `POST /api/v1/public/consent/*`.

- Same key and same request: the original response is replayed (`Idempotent-Replayed: true`); nothing happens twice.
- Same key, different request: `422`.
- Same key while the first is still running: `409`.
- A request that fails releases the key, so you can retry it.
- Keys are remembered for 24 hours and scoped to your organization.
