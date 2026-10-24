import { MAX_ATTEMPTS, nextRetryDelaySeconds, RETRY_DELAYS_SECONDS } from './backoff';

describe('retry backoff', () => {
  it('waits longer after each failure', () => {
    const delays = Array.from({ length: MAX_ATTEMPTS - 1 }, (_, i) =>
      nextRetryDelaySeconds(i + 1),
    );
    expect(delays).toEqual(RETRY_DELAYS_SECONDS);
    expect([...delays].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual(delays);
  });

  it('gives up after the final attempt', () => {
    expect(nextRetryDelaySeconds(MAX_ATTEMPTS)).toBeNull();
    expect(nextRetryDelaySeconds(MAX_ATTEMPTS + 5)).toBeNull();
  });
});
