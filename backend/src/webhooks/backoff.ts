// Seconds to wait after the Nth failed attempt (index 0 = after attempt 1).
// Seven attempts over about 21 hours: long enough to ride out an overnight outage.
export const RETRY_DELAYS_SECONDS = [60, 300, 1800, 7200, 21600, 43200];

export const MAX_ATTEMPTS = RETRY_DELAYS_SECONDS.length + 1;

// Returns null when no attempts remain
export function nextRetryDelaySeconds(attemptsMade: number): number | null {
  return RETRY_DELAYS_SECONDS[attemptsMade - 1] ?? null;
}

// Consecutive failed attempts before a webhook is switched off automatically
export const AUTO_DISABLE_THRESHOLD = 30;
