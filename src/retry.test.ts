import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RetryError, computeDelay, isRetryableHttpStatus, retry } from './retry';

describe('computeDelay', () => {
  it('applies exponential backoff without jitter', () => {
    expect(computeDelay(1, 100, 2, 10_000, false)).toBe(100);
    expect(computeDelay(2, 100, 2, 10_000, false)).toBe(200);
    expect(computeDelay(3, 100, 2, 10_000, false)).toBe(400);
    expect(computeDelay(4, 100, 2, 10_000, false)).toBe(800);
  });

  it('caps at maxDelayMs', () => {
    expect(computeDelay(10, 100, 2, 500, false)).toBe(500);
  });

  it('applies jitter in the lower half range', () => {
    const samples = Array.from({ length: 50 }, () => computeDelay(1, 1000, 2, 10_000, true));
    for (const sample of samples) {
      expect(sample).toBeGreaterThanOrEqual(500);
      expect(sample).toBeLessThanOrEqual(1000);
    }
  });
});

describe('isRetryableHttpStatus', () => {
  it.each([408, 425, 429, 500, 502, 503, 504])('returns true for %i', (status) => {
    expect(isRetryableHttpStatus(status)).toBe(true);
  });

  it.each([200, 201, 301, 400, 401, 403, 404, 422])('returns false for %i', (status) => {
    expect(isRetryableHttpStatus(status)).toBe(false);
  });
});

describe('retry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the value from a successful first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const promise = retry(fn, { jitter: false });
    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1);
  });

  it('retries on failure up to maxAttempts and eventually succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('ok');

    const promise = retry(fn, { jitter: false, initialDelayMs: 10 });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws RetryError after all attempts exhaust', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));
    let caught: unknown;
    const promise = retry(fn, { maxAttempts: 3, jitter: false, initialDelayMs: 1 }).catch((e) => {
      caught = e;
    });
    await vi.runAllTimersAsync();
    await promise;
    expect(caught).toBeInstanceOf(RetryError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('passes the attempt number to fn starting from 1', async () => {
    const attempts: number[] = [];
    const fn = vi.fn().mockImplementation(async (attempt: number) => {
      attempts.push(attempt);
      if (attempt < 3) throw new Error('retry');
      return 'done';
    });

    const promise = retry(fn, { jitter: false, initialDelayMs: 1 });
    await vi.runAllTimersAsync();
    await promise;
    expect(attempts).toEqual([1, 2, 3]);
  });

  it('stops retrying when shouldRetry returns false', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('non-retryable'));
    const shouldRetry = vi.fn().mockReturnValue(false);

    await expect(retry(fn, { shouldRetry, jitter: false })).rejects.toThrow('non-retryable');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(shouldRetry).toHaveBeenCalledTimes(1);
  });

  it('invokes onRetry with error, attempt, and delayMs', async () => {
    const onRetry = vi.fn();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValue('ok');

    const promise = retry(fn, { onRetry, jitter: false, initialDelayMs: 100 });
    await vi.runAllTimersAsync();
    await promise;
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, 100);
  });

  it('aborts via AbortSignal', async () => {
    const controller = new AbortController();
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    controller.abort();
    await expect(retry(fn, { signal: controller.signal, jitter: false })).rejects.toBeInstanceOf(
      RetryError,
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it('RetryError preserves the last error and attempt count', async () => {
    const originalError = new Error('original');
    const fn = vi.fn().mockRejectedValue(originalError);

    let caught: unknown;
    const promise = retry(fn, { maxAttempts: 2, jitter: false, initialDelayMs: 1 }).catch((e) => {
      caught = e;
    });
    await vi.runAllTimersAsync();
    await promise;

    expect(caught).toBeInstanceOf(RetryError);
    const retryError = caught as RetryError;
    expect(retryError.attempts).toBe(2);
    expect(retryError.lastError).toBe(originalError);
  });
});
