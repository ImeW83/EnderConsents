// The event catalogue: the only place event types are defined. Webhook
// subscriptions are validated against it, and the pull API filters by it.
export const CONSENT_EVENT_TYPES = [
  'consent.granted',
  'consent.withdrawn',
  'consent.renewed',
  'consent.expired',
] as const;

export const TEST_EVENT_TYPE = 'webhook.test';

export type ConsentEventType = (typeof CONSENT_EVENT_TYPES)[number];

export const WILDCARD = '*';

// Bump when a payload field is removed or changes meaning; adding fields is not a bump
export const EVENT_API_VERSION = '2026-10-01';

const ACTION_TO_TYPE: Record<string, ConsentEventType> = {
  granted: 'consent.granted',
  withdrawn: 'consent.withdrawn',
  renewed: 'consent.renewed',
  expired: 'consent.expired',
};

export const eventTypeForAction = (action: string): ConsentEventType => {
  const type = ACTION_TO_TYPE[action];
  if (!type) {
    throw new Error(`No event type for consent action "${action}"`);
  }
  return type;
};

export const actionForEventType = (type: string): string | undefined =>
  Object.entries(ACTION_TO_TYPE).find(([, t]) => t === type)?.[0];

export const isSubscribable = (type: string) =>
  type === WILDCARD || (CONSENT_EVENT_TYPES as readonly string[]).includes(type);

export const subscribesTo = (subscribed: string[], type: string) =>
  subscribed.includes(WILDCARD) || subscribed.includes(type);
