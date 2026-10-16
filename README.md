# retry-http

<!-- project-links:start -->
[Документация](docs/repository-guide.md) · [Код](https://github.com/PavelHopson/retry-http/tree/main) · [История изменений](https://github.com/PavelHopson/retry-http/commits/main/)
<!-- project-links:end -->

![retry-http: Запрос → Повтор → Ответ](docs/assets/repository-cover.svg)

**TypeScript-библиотека.** Небольшая библиотека HTTP-повторов с backoff для устойчивых сетевых клиентов.

<!-- repository-guide:start -->
[Первый запуск](#readme-start) · [Что внутри](#readme-map) · [Путеводитель](docs/repository-guide.md#start) · [Карта кода](docs/repository-guide.md#map) · [Проверки](docs/repository-guide.md#checks) · [Границы и права](docs/repository-guide.md#boundaries)

<a id="readme-map"></a>

## Проект за минуту

- **[Retry API](<src/retry.ts>)** — Backoff, jitter, отмена и условия повторного запроса.
- **[Поведение под тестом](<src/retry.test.ts>)** — Проверки повторов, задержек и обработки ошибок.
- **[Пакет](<package.json>)** — ESM export, декларации типов и команды сборки.

<a id="readme-start"></a>

## Начать локально

**Среда:** Node.js и npm. **Источник:** [package.json](<package.json>).

Из корня клонированного репозитория:

```bash
npm ci
npm run test
```

Это библиотека: dev-сервера нет. После установки тесты запускаются локально; сборка пакета — `npm run build`.

<details>
<summary><strong>Перед первым запуском и изменением кода</strong></summary>

- Команды сверены с исходниками 8 сентября 2026. Это инструкция, а не отметка об успешном запуске или текущем production.
- Установка зависимостей может обращаться в registry и выполнять lifecycle scripts. Используйте отдельную рабочую среду и демонстрационные данные.
- Повтор изменяющего запроса требует идемпотентности; retry не заменяет timeout, отмену и ограничения нагрузки.


</details>
<!-- repository-guide:end -->

<a id="features"></a>

## Возможности

- Настраиваемые число попыток, начальная и максимальная задержка, коэффициент backoff
- Jitter (±50%) для распределения повторов во времени
- Предикат `shouldRetry` для выбора повторяемых ошибок, например 429/5xx
- Обработчик `onRetry` для метрик и журналов
- Отмена через `AbortSignal`
- Класс `RetryError` с числом попыток и последней ошибкой
- Функция `isRetryableHttpStatus` для кодов 408, 425, 429 и 500–599
- ESM с поддержкой tree shaking и декларациями типов

<a id="install"></a>

## Установка

```bash
npm install @pavelhopson/retry-http
```

<a id="usage"></a>

## Использование

```typescript
import { retry, isRetryableHttpStatus, RetryError } from '@pavelhopson/retry-http';

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

| Параметр | Тип | По умолчанию | Назначение |
|---|---|---|---|
| `maxAttempts` | `number` | `3` | Всего попыток, включая первую |
| `initialDelayMs` | `number` | `300` | Задержка перед первым повтором |
| `maxDelayMs` | `number` | `10000` | Верхняя граница задержки |
| `backoffFactor` | `number` | `2` | Множитель для каждой попытки |
| `jitter` | `boolean` | `true` | Случайное отклонение ±50% |
| `shouldRetry` | `(error, attempt) => boolean` | `() => true` | Возвращает false для прекращения повторов |
| `onRetry` | `(error, attempt, delayMs) => void` | — | Обработчик для журналирования |
| `signal` | `AbortSignal` | — | Отмена повторов |

### `isRetryableHttpStatus(status: number): boolean`

Возвращает `true` для HTTP 408, 425, 429 и 500–599.

### `RetryError`

Ошибка после исчерпания попыток. Свойства:
- `.attempts: number` — число выполненных попыток
- `.lastError: unknown` — ошибка последней попытки

### `computeDelay(attempt, initialDelayMs, backoffFactor, maxDelayMs, jitter): number`

Вычисляет задержку для заданной попытки; экспортируется для тестирования.

<a id="provenance"></a>

## Происхождение

Модуль выделен из разработки [Eclipse Valhalla](https://github.com/PavelHopson/Eclipse-Valhalla). Связанные реализации есть в [CryptoPulse](https://github.com/PavelHopson/CryptoPulse) и [Eclipse AI Hub](https://github.com/PavelHopson/eclipse-ai-hub). Это история происхождения, а не доказательство побайтового совпадения текущих версий. Актуальное поведение пакета проверяется его собственными тестами в [src/retry.test.ts](src/retry.test.ts).

<a id="license"></a>

## Лицензия

MIT
