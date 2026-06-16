# retry-http

Exponential backoff retry for HTTP requests. Zero dependencies. TypeScript-first.

## Features

- Configurable max attempts, initial delay, max delay, and backoff factor
- Jitter (±50%) to prevent thundering-herd on shared rate limits
- `shouldRetry` predicate for conditional retry (e.g., only on 429/5xx)
- `onRetry` callback for telemetry / logging hooks
- `AbortSignal` support for cancellation
- `RetryError` class preserving attempt count and last error
- `isRetryableHttpStatus` helper (408, 425, 429, 500–599)
- Tree-shakable ESM, ships with type declarations

## Install

```bash
npm install retry-http
```

## Usage

```typescript
import { retry, isRetryableHttpStatus, RetryError } from 'retry-http';

// Basic usage — retry a fetch call up to 3 times
const response = await retry(
  async () => {
    const res = await fetch('https://api.example.com/data');
    if (!res.ok && isRetryableHttpStatus(res.status)) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res;
  },
  { maxAttempts: 3, initialDelayMs: 500, jitter: true },
);

// With shouldRetry predicate — only retry network errors
const data = await retry(
  async () => {
    const res = await fetch('https://api.example.com/data');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
  {
    maxAttempts: 3,
    shouldRetry: (error) => error instanceof TypeError, // network errors only
    onRetry: (error, attempt, delayMs) => {
      console.warn(`Retry ${attempt} in ${delayMs}ms:`, error);
    },
  },
);

// With AbortSignal
const controller = new AbortController();
setTimeout(() => controller.abort(), 10_000); // 10s global timeout

try {
  await retry(fetchData, { signal: controller.signal });
} catch (e) {
  if (e instanceof RetryError) {
    console.error(`Failed after ${e.attempts} attempts:`, e.lastError);
  }
}
```

## API

### `retry<T>(fn, options?): Promise<T>`

| Option | Type | Default | Description |
|---|---|---|---|
| `maxAttempts` | `number` | `3` | Total attempts (including first) |
| `initialDelayMs` | `number` | `300` | Delay before first retry |
| `maxDelayMs` | `number` | `10000` | Cap on computed delay |
| `backoffFactor` | `number` | `2` | Multiplier per attempt |
| `jitter` | `boolean` | `true` | Add ±50% randomness |
| `shouldRetry` | `(error, attempt) => boolean` | `() => true` | Return false to stop early |
| `onRetry` | `(error, attempt, delayMs) => void` | — | Hook for logging |
| `signal` | `AbortSignal` | — | Cancel retries |

### `isRetryableHttpStatus(status: number): boolean`

Returns `true` for HTTP 408, 425, 429, and 500–599.

### `RetryError`

Thrown when all attempts are exhausted. Properties:
- `.attempts: number` — how many attempts were made
- `.lastError: unknown` — the error from the final attempt

### `computeDelay(attempt, initialDelayMs, backoffFactor, maxDelayMs, jitter): number`

Exported for testing — computes the delay for a given attempt.

## Provenance

This module was developed inside [Eclipse Valhalla](https://github.com/PavelHopson/Eclipse-Valhalla) (Sprint 1), then ported **byte-identical** to [CryptoPulse](https://github.com/PavelHopson/CryptoPulse) and [eclipse-ai-hub](https://github.com/PavelHopson/eclipse-ai-hub) — 3 consumers, zero divergence, 26 tests passing on first run in each project. This npm package is the natural extraction.

## License

MIT
