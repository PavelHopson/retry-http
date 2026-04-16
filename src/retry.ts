export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  jitter?: boolean;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  signal?: AbortSignal;
}

export class RetryError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: unknown,
  ) {
    super(message);
    this.name = 'RetryError';
  }
}

const DEFAULTS: Required<Omit<RetryOptions, 'shouldRetry' | 'onRetry' | 'signal'>> = {
  maxAttempts: 3,
  initialDelayMs: 300,
  maxDelayMs: 10_000,
  backoffFactor: 2,
  jitter: true,
};

export function computeDelay(
  attempt: number,
  initialDelayMs: number,
  backoffFactor: number,
  maxDelayMs: number,
  jitter: boolean,
): number {
  const exponential = initialDelayMs * Math.pow(backoffFactor, attempt - 1);
  const capped = Math.min(exponential, maxDelayMs);
  if (!jitter) return capped;
  return Math.floor(capped * (0.5 + Math.random() * 0.5));
}

export function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status < 600);
}

export async function retry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = DEFAULTS.maxAttempts,
    initialDelayMs = DEFAULTS.initialDelayMs,
    maxDelayMs = DEFAULTS.maxDelayMs,
    backoffFactor = DEFAULTS.backoffFactor,
    jitter = DEFAULTS.jitter,
    shouldRetry,
    onRetry,
    signal,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) {
      throw new RetryError('Retry aborted via signal', attempt - 1, signal.reason ?? new Error('aborted'));
    }

    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      const canRetry = attempt < maxAttempts && (shouldRetry ? shouldRetry(error, attempt) : true);

      if (!canRetry) {
        if (attempt >= maxAttempts) {
          throw new RetryError(
            `Retry exhausted after ${attempt} attempt${attempt === 1 ? '' : 's'}`,
            attempt,
            lastError,
          );
        }
        throw error;
      }

      const delayMs = computeDelay(attempt, initialDelayMs, backoffFactor, maxDelayMs, jitter);
      onRetry?.(error, attempt, delayMs);
      await sleep(delayMs, signal);
    }
  }

  throw new RetryError(`Retry exhausted after ${maxAttempts} attempts`, maxAttempts, lastError);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
