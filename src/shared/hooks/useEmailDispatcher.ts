import { useCallback, useMemo } from 'react';
import { useDashboardData } from './useDashboardData';
import { useQueueActions } from '../../modules/module-1-email-queue-creator/hooks/useQueueActions';
import { useSimulatorConfig } from '../../modules/module-2-send-simulator/hooks/useSimulatorConfig';
import { useDispatchControls } from '../../modules/module-3-retry-logic/hooks/useDispatchControls';
import { useScheduledEmails } from '../../modules/module-6-scheduled-delivery/hooks/useScheduledEmails';
import type { Email, EmailFormData, ServerConfig } from '../types/email';
import type { Role } from '../auth/useAuth';

/**
 * The dashboard's single orchestration hook.
 *
 * It wires the live Firestore state to the five modules:
 *
 *   Module 1  Email Queue Creator     → add / remove emails, load demo data
 *   Module 2  Send Simulator          → SMTP config, connection tests
 *   Module 3  Retry Logic Engine      → start / pause / resume / stop / reset
 *   Module 4  Final Status Logger     → the live activity log (via state)
 *   Module 5  Summary Exporter        → live statistics (via state)
 *   Module 6  Scheduled Delivery      → schedule / cancel / reschedule
 *
 * All state arrives through Firestore realtime listeners; every mutation
 * goes through the Cloud Function, which is the only writer the Firestore
 * rules allow.
 */
export function useEmailDispatcher(uid: string | null, role: Role | null) {
  const { state, setState } = useDashboardData(uid, role);

  const applyConfig = useCallback((config: ServerConfig) => {
    setState((p) => ({ ...p, config }));
  }, [setState]);

  const { addEmail, removeEmail, loadDemoData } = useQueueActions();
  const { saveConfig, testConnection, testSend } = useSimulatorConfig(applyConfig);
  const { start, pause, resume, stop, reset } = useDispatchControls(state.dispatcher);
  const { scheduleEmail, cancelEmail, rescheduleEmail, runSweep } = useScheduledEmails();

  /**
   * Queue an email and start the dispatcher straight away.
   *
   * The email still travels through the ordinary queue — the dispatcher is
   * simply started in the same breath, so the user does not have to click
   * "Start Dispatch" as well.
   */
  const sendNow = useCallback(
    async (form: EmailFormData): Promise<{ success: boolean; error?: string; emailId?: string }> => {
      const queued = await addEmail(form);
      if (!queued.success) return { success: false, error: queued.error };

      const dispatch = await start();
      if (!dispatch.success) {
        return {
          success: false,
          error: `${queued.emailId ?? 'The email'} is queued, but the dispatcher did not start: ${dispatch.error ?? 'unknown error'}`,
          emailId: queued.emailId,
        };
      }
      return { success: true, emailId: queued.emailId };
    },
    [addEmail, start]
  );

  /** The email currently being dispatched, if any. */
  const currentEmail = useMemo<Email | null>(
    () =>
      state.emails.find((e) => e.status === 'SENDING') ??
      state.emails.find((e) => e.status === 'RETRYING') ??
      null,
    [state.emails]
  );

  /** How many emails are still waiting in the queue. */
  const queuedCount = useMemo(
    () => state.emails.filter((e) => e.status === 'QUEUED').length,
    [state.emails]
  );

  return {
    state,
    currentEmail,
    queuedCount,
    // Module 1 — Email Queue Creator
    addEmail,
    sendNow,
    removeEmail,
    loadDemoData,
    // Module 2 — Send Simulator
    saveConfig,
    testConnection,
    testSend,
    // Module 3 — Retry Logic Engine
    start,
    pause,
    resume,
    stop,
    reset,
    // Module 6 — Scheduled Delivery
    scheduleEmail,
    cancelEmail,
    rescheduleEmail,
    runSweep,
  };
}
