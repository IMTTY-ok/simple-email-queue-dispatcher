import { useCallback } from 'react';
import { api, errMessage } from '../../../shared/api/client';
import type { Email, ScheduleResult, SchedulerProvider } from '../../../shared/types/email';

/**
 * Module 6 — Scheduled Delivery (client side).
 *
 * Every write goes through the Cloud Function, which is the only writer the
 * Firestore rules allow. The browser never talks to Cloud Tasks itself and
 * never decides when an email is sent.
 */

/** The result of cancelling or rescheduling a scheduled email. */
export interface ScheduleActionResult {
  success: boolean;
  error?: string;
  warning?: string;
  scheduler?: SchedulerProvider;
}

/** The result of asking the server to sweep for due deliveries. */
export interface SweepResult {
  success: boolean;
  error?: string;
  scanned?: number;
  dispatched?: number;
}

export function useScheduledEmails() {
  /**
   * Schedule an email for later.
   *
   * The browser sends the *local* wall-clock time together with the IANA
   * zone it was picked in; the server converts it to UTC and stores it as a
   * Firestore Timestamp.
   */
  const scheduleEmail = useCallback(
    async (
      form: { recipient: string; subject: string; message: string; senderName?: string },
      scheduledAt: string,
      timezone: string
    ): Promise<ScheduleResult> => {
      try {
        const data = await api<{ ok: boolean; email: Email; scheduler: SchedulerProvider; warning?: string }>(
          '/api/scheduled-emails',
          {
            method: 'POST',
            body: JSON.stringify({ ...form, scheduledAt, timezone }),
          }
        );
        return {
          success: true,
          emailId: data.email?.id,
          scheduler: data.scheduler,
          warning: data.warning,
        };
      } catch (err) {
        return { success: false, error: errMessage(err) };
      }
    },
    []
  );

  /** Cancel a scheduled email. */
  const cancelEmail = useCallback(async (id: string): Promise<ScheduleActionResult> => {
    try {
      await api(`/api/scheduled-emails/${id}/cancel`, { method: 'POST' });
      return { success: true };
    } catch (err) {
      return { success: false, error: errMessage(err) };
    }
  }, []);

  /** Move a scheduled email to a new moment. */
  const rescheduleEmail = useCallback(
    async (id: string, scheduledAt: string, timezone: string): Promise<ScheduleActionResult> => {
      try {
        const data = await api<{ ok: boolean; email: Email; scheduler: SchedulerProvider; warning?: string }>(
          `/api/scheduled-emails/${id}/reschedule`,
          { method: 'POST', body: JSON.stringify({ scheduledAt, timezone }) }
        );
        return { success: true, scheduler: data.scheduler, warning: data.warning };
      } catch (err) {
        return { success: false, error: errMessage(err) };
      }
    },
    []
  );

  /**
   * Ask the server to look for deliveries that are due right now.
   *
   * The Cloud Tasks queue is the primary trigger; this is the safety net.
   * The *server* decides what is due and sends it — the browser only asks.
   */
  const runSweep = useCallback(async (): Promise<SweepResult> => {
    try {
      const data = await api<{ ok: boolean; scanned: number; dispatched: number }>(
        '/api/scheduled-emails/sweep',
        { method: 'POST' }
      );
      return { success: true, scanned: data.scanned, dispatched: data.dispatched };
    } catch (err) {
      return { success: false, error: errMessage(err) };
    }
  }, []);

  return { scheduleEmail, cancelEmail, rescheduleEmail, runSweep };
}
