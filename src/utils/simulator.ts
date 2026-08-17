import type { SimulationMode } from '../types/email';

/**
 * Simulate a single delivery attempt.
 * Returns true for success, false for failure.
 */
export function simulateDelivery(mode: SimulationMode): boolean {
  switch (mode) {
    case 'FORCE_SUCCESS':
      return true;
    case 'FORCE_FAILURE':
      return false;
    case 'RANDOM':
    default:
      return Math.random() < 0.6; // 60% success rate for interesting demos
  }
}
