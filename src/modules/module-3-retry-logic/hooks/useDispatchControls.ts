import { useCallback, useEffect, useRef } from 'react';
import { api, errMessage } from '../../../shared/api/client';
import type { DispatcherState } from '../../../shared/types/email';

/**
 * Module 3 — Retry Logic Engine (client side).
 *
 * Cloud Functions are ephemeral, so the server drains the queue in *bounded
 * dispatch passes* rather than one endless loop. Each pass reports whether
 * work remains; this hook keeps the pass alive by re-triggering
 * `POST /api/dispatch/continue` while there is still work to do.
 *
 * The pause flag is read from the live `_meta/main` document, so the pump
 * stops the moment the server reports `running: false` or `paused: true`.
 */

/** How long to wait before asking the server to continue the pass. */
const PUMP_INTERVAL_MS = 1800;

/** The result of a dispatcher action. */
export interface DispatchActionResult {
  success: boolean;
  error?: string;
}

/** The result of a dispatch action that also reports remaining work. */
export interface DispatchPassResult extends DispatchActionResult {
  remaining?: number;
  done?: boolean;
}

/**
 * Drives the dispatcher lifecycle.
 *
 * @param dispatcher the live dispatcher flags from `_meta/main`
 */
export function useDispatchControls(dispatcher: DispatcherState) {
  const metaRef = useRef<DispatcherState>(dispatcher);
  const pumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPump = useCallback(() => {
    if (pumpTimerRef.current) {
      clearTimeout(pumpTimerRef.current);
      pumpTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    metaRef.current = dispatcher;
    if (!dispatcher.running || dispatcher.paused) {
      cancelPump();
    }
  }, [dispatcher, cancelPump]);

  const schedulePump = useCallback((remaining: number) => {
    if (pumpTimerRef.current || remaining <= 0) return;
    pumpTimerRef.current = setTimeout(async () => {
      pumpTimerRef.current = null;
      if (!metaRef.current.running || metaRef.current.paused) return;
      try {
        const r = await api<{ ok: boolean; done: boolean; remaining: number }>('/api/dispatch/continue', {
          method: 'POST',
        });
        if (r.done === false && r.remaining > 0) schedulePump(r.remaining);
      } catch {
        // backend cold start or transient network blip — retry once
        if (metaRef.current.running && !metaRef.current.paused) schedulePump(1);
      }
    }, PUMP_INTERVAL_MS);
  }, []);

  const start = useCallback(async (): Promise<DispatchPassResult> => {
    try {
      const data = await api<{ ok: boolean; done: boolean; remaining: number }>('/api/dispatch/start', {
        method: 'POST',
      });
      if (data.done === false && data.remaining > 0) schedulePump(data.remaining);
      return { success: true };
    } catch (err) {
      return { success: false, error: errMessage(err) };
    }
  }, [schedulePump]);

  const pause = useCallback(async (): Promise<DispatchActionResult> => {
    try {
      await api('/api/dispatch/pause', { method: 'POST' });
      cancelPump();
      return { success: true };
    } catch (err) {
      return { success: false, error: errMessage(err) };
    }
  }, [cancelPump]);

  const resume = useCallback(async (): Promise<DispatchPassResult> => {
    try {
      const data = await api<{ ok: boolean; done: boolean; remaining: number }>('/api/dispatch/resume', {
        method: 'POST',
      });
      if (data.done === false && data.remaining > 0) schedulePump(data.remaining);
      return { success: true };
    } catch (err) {
      return { success: false, error: errMessage(err) };
    }
  }, [schedulePump]);

  const stop = useCallback(async (): Promise<DispatchActionResult> => {
    try {
      await api('/api/dispatch/stop', { method: 'POST' });
      cancelPump();
      return { success: true };
    } catch (err) {
      return { success: false, error: errMessage(err) };
    }
  }, [cancelPump]);

  const reset = useCallback(async (): Promise<DispatchActionResult> => {
    try {
      await api('/api/dispatch/reset', { method: 'POST' });
      cancelPump();
      return { success: true };
    } catch (err) {
      return { success: false, error: errMessage(err) };
    }
  }, [cancelPump]);

  useEffect(() => cancelPump, [cancelPump]);

  return { start, pause, resume, stop, reset, cancelPump };
}
