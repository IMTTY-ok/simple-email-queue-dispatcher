import type { ProcessingSpeed } from '../types/email';

/**
 * Get delay in milliseconds for each processing speed setting.
 */
export function getDelay(speed: ProcessingSpeed): number {
  switch (speed) {
    case 'SLOW':
      return 2000;
    case 'FAST':
      return 400;
    case 'NORMAL':
    default:
      return 1000;
  }
}

/**
 * Returns the maximum number of attempts given a retry limit.
 * retryLimit = 3 means: 1 initial attempt + 3 retries = 4 total attempts
 */
export function maxAttempts(retryLimit: number): number {
  return retryLimit + 1;
}

/**
 * Sleep utility for async delays
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
