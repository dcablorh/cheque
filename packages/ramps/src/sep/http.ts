import { logger } from '@cheque/shared';

export interface HttpRetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  timeoutMs?: number;
}

export class HttpError extends Error {
  public readonly status: number;
  public readonly statusText: string;
  public readonly body: unknown;
  public readonly url: string;

  constructor(params: { message: string; status: number; statusText: string; body: unknown; url: string }) {
    super(params.message);
    this.name = 'HttpError';
    this.status = params.status;
    this.statusText = params.statusText;
    this.body = params.body;
    this.url = params.url;
  }
}

/**
 * Masks sensitive PII and secret values from strings/objects for logging.
 */
export function maskSensitiveData(input: unknown): unknown {
  if (typeof input === 'string') {
    return input
      // Mask Bearer tokens / JWTs
      .replace(/(Bearer\s+)[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/gi, '$1[REDACTED_JWT]')
      // Mask Stellar secret keys (S...)
      .replace(/\bS[A-Z0-9]{55}\b/g, '[REDACTED_STELLAR_SECRET]')
      // Mask Ghana phone numbers
      .replace(/(\+?233|0)[235]\d{2}(\d{3})(\d{3})/g, '$1XX-XXX-$3')
      // Mask national IDs / passwords
      .replace(/(password|secret|api_key|apiKey)["']?\s*[:=]\s*["']?[^"',\s}]+/gi, '$1=[REDACTED]');
  }

  if (input !== null && typeof input === 'object') {
    if (Array.isArray(input)) {
      return input.map(maskSensitiveData);
    }
    const masked: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      const lower = key.toLowerCase();
      if (
        lower.includes('secret') ||
        lower.includes('password') ||
        lower.includes('token') ||
        lower.includes('authorization') ||
        lower.includes('privatekey') ||
        lower.includes('keypair')
      ) {
        masked[key] = '[REDACTED]';
      } else if (lower.includes('phone') || lower.includes('mobile')) {
        masked[key] = typeof value === 'string' ? maskSensitiveData(value) : '[REDACTED_PHONE]';
      } else if (lower.includes('id_number') || lower.includes('national_id')) {
        masked[key] = '[REDACTED_ID]';
      } else {
        masked[key] = maskSensitiveData(value);
      }
    }
    return masked;
  }

  return input;
}

/**
 * Robust HTTP client with real network dispatch, retry with randomized jitter,
 * and PII-masking request/response logging.
 */
export async function fetchWithRetry<T>(
  url: string,
  options: RequestInit = {},
  retryOpts: HttpRetryOptions = {}
): Promise<T> {
  const maxRetries = retryOpts.maxRetries ?? 3;
  const initialDelayMs = retryOpts.initialDelayMs ?? 300;
  const maxDelayMs = retryOpts.maxDelayMs ?? 4000;
  const backoffFactor = retryOpts.backoffFactor ?? 2;
  const timeoutMs = retryOpts.timeoutMs ?? 15000;

  let attempt = 0;
  let delay = initialDelayMs;

  while (true) {
    attempt++;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const maskedHeaders = maskSensitiveData(options.headers || {});
    logger.debug(`[HTTP Request] ${options.method || 'GET'} ${url} (Attempt ${attempt}/${maxRetries + 1})`, {
      headers: maskedHeaders,
    });

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') || '';
      let data: unknown;

      if (contentType.includes('application/json')) {
        data = await response.json().catch(() => null);
      } else {
        data = await response.text().catch(() => '');
      }

      if (response.ok) {
        logger.debug(`[HTTP Response] ${response.status} from ${url}`);
        return data as T;
      }

      // Check if retryable error (Rate limited 429 or Server Error 5xx)
      const isRetryable = response.status === 429 || (response.status >= 500 && response.status <= 599);

      if (isRetryable && attempt <= maxRetries) {
        // Full jitter exponential backoff: random between 0 and min(maxDelay, delay)
        const jitter = Math.random() * delay;
        logger.warn(
          `[HTTP Retryable Error] ${response.status} from ${url}. Retrying in ${Math.round(jitter)}ms... (Attempt ${attempt})`
        );
        await new Promise((resolve) => setTimeout(resolve, jitter));
        delay = Math.min(maxDelayMs, delay * backoffFactor);
        continue;
      }

      logger.error(`[HTTP Failed] ${response.status} ${response.statusText} from ${url}`, {
        responseBody: maskSensitiveData(data),
      });

      throw new HttpError({
        message: `HTTP ${response.status} ${response.statusText}: ${typeof data === 'string' ? data : JSON.stringify(data)}`,
        status: response.status,
        statusText: response.statusText,
        body: data,
        url,
      });
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      const isNetworkError =
        err instanceof TypeError ||
        (err as any)?.name === 'AbortError' ||
        (err as any)?.code === 'ECONNRESET' ||
        (err as any)?.code === 'ENOTFOUND';

      if (isNetworkError && attempt <= maxRetries) {
        const jitter = Math.random() * delay;
        logger.warn(
          `[HTTP Network Failure] ${(err as Error).message} for ${url}. Retrying in ${Math.round(jitter)}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, jitter));
        delay = Math.min(maxDelayMs, delay * backoffFactor);
        continue;
      }

      throw err;
    }
  }
}
