export interface RetryOptions {
  retries: number;
  baseDelayMs: number;
}

export async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let attempt = 0;
  let lastError: unknown;
  while (attempt <= options.retries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === options.retries) {
        break;
      }
      const retryAfterMs = (error as any)?.retryAfterMs;
      const delay = typeof retryAfterMs === "number"
        ? retryAfterMs
        : options.baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt += 1;
    }
  }
  throw lastError;
}
