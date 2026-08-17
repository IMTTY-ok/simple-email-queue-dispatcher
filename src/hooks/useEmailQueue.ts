import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  Email,
  QueueState,
  SimulationMode,
  ProcessingSpeed,
  ActivityEntry,
  EmailFormData,
} from '../types/email';
import { generateEmailId, createEmail, isValidEmail } from '../utils/queue';
import { simulateDelivery } from '../utils/simulator';
import { getDelay, maxAttempts, sleep } from '../utils/retryLogic';

// ── localStorage keys ──────────────────────────────────────────────────────────
const LS_KEY = 'email-queue-dispatcher-state';

function loadState(): Partial<QueueState> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // Never restore active processing state across page reloads
    return {
      ...parsed,
      isProcessing: false,
      isPaused: false,
      currentProcessingId: null,
      // Reset PROCESSING / RETRYING emails back to PENDING so they can be reprocessed
      emails: (parsed.emails as Email[]).map((e: Email) =>
        e.status === 'PROCESSING' || e.status === 'RETRYING'
          ? { ...e, status: 'PENDING', attempts: 0, retries: 0, logs: [] }
          : e
      ),
    };
  } catch {
    return {};
  }
}

function saveState(state: QueueState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
}

// ── initial state ──────────────────────────────────────────────────────────────
const DEFAULT_STATE: QueueState = {
  emails: [],
  activityLog: [],
  isProcessing: false,
  isPaused: false,
  currentProcessingId: null,
  simulationMode: 'RANDOM',
  retryLimit: 3,
  processingSpeed: 'NORMAL',
  emailCounter: 0,
  activityCounter: 0,
};

function buildInitialState(): QueueState {
  const saved = loadState();
  return { ...DEFAULT_STATE, ...saved };
}

// ── hook ───────────────────────────────────────────────────────────────────────
export function useEmailQueue() {
  const [state, setState] = useState<QueueState>(buildInitialState);

  // Ref so async processing loop always sees latest state
  const stateRef = useRef(state);
  stateRef.current = state;

  // Pause flag ref (mutable, checked inside the async loop)
  const pausedRef = useRef(state.isPaused);
  const processingRef = useRef(false);

  // Persist to localStorage whenever state changes
  useEffect(() => {
    saveState(state);
  }, [state]);

  // ── public actions ─────────────────────────────────────────────────────────

  const addEmail = useCallback(
    (form: EmailFormData): { success: boolean; error?: string; emailId?: string; position?: number } => {
      const { recipient, subject, message, senderName } = form;

      if (!recipient.trim()) return { success: false, error: 'Recipient email is required.' };
      if (!isValidEmail(recipient.trim())) return { success: false, error: 'Please enter a valid email address.' };
      if (!subject.trim()) return { success: false, error: 'Subject is required.' };
      if (!message.trim()) return { success: false, error: 'Message is required.' };

      let newEmailId = '';
      let position = 0;

      setState((prev) => {
        const newCounter = prev.emailCounter + 1;
        const actCounter = prev.activityCounter + 1;
        newEmailId = generateEmailId(newCounter);
        const email = createEmail(newEmailId, recipient.trim(), subject.trim(), message.trim(), senderName.trim() || undefined);
        const pendingCount = prev.emails.filter((e) => e.status === 'PENDING').length;
        position = pendingCount + 1;

        const activity: ActivityEntry = {
          id: `ACT-${actCounter}`,
          emailId: newEmailId,
          message: `${newEmailId} added to queue (position ${position})`,
          type: 'info',
          timestamp: new Date().toISOString(),
        };

        return {
          ...prev,
          emails: [...prev.emails, email],
          emailCounter: newCounter,
          activityCounter: actCounter,
          activityLog: [activity, ...prev.activityLog],
        };
      });

      return { success: true, emailId: newEmailId, position };
    },
    []
  );

  const loadDemoData = useCallback(() => {
    const demoEmails = [
      { recipient: 'student1@example.com', subject: 'Assignment Submission', message: 'Your assignment has been received and is under review.' },
      { recipient: 'student2@example.com', subject: 'Exam Schedule', message: 'Your final exam is scheduled for next Monday at 10:00 AM.' },
      { recipient: 'student3@example.com', subject: 'Fee Reminder', message: 'This is a reminder that your fee payment is due by end of this week.' },
      { recipient: 'student4@example.com', subject: 'Library Notice', message: 'The books you borrowed are due for return. Please return them by Friday.' },
      { recipient: 'student5@example.com', subject: 'Result Announcement', message: 'Your semester results have been published on the student portal.' },
    ];

    setState((prev) => {
      let counter = prev.emailCounter;
      let actCounter = prev.activityCounter;
      const newEmails: Email[] = [];
      const newActivities: ActivityEntry[] = [];

      for (const d of demoEmails) {
        counter++;
        actCounter++;
        const id = generateEmailId(counter);
        const email = createEmail(id, d.recipient, d.subject, d.message);
        newEmails.push(email);
        newActivities.push({
          id: `ACT-${actCounter}`,
          emailId: id,
          message: `${id} added to queue (demo data)`,
          type: 'info',
          timestamp: new Date().toISOString(),
        });
      }

      return {
        ...prev,
        emails: [...prev.emails, ...newEmails],
        emailCounter: counter,
        activityCounter: actCounter,
        activityLog: [...newActivities.reverse(), ...prev.activityLog],
      };
    });
  }, []);

  const setSimulationMode = useCallback((mode: SimulationMode) => {
    setState((prev) => ({ ...prev, simulationMode: mode }));
  }, []);

  const setRetryLimit = useCallback((limit: number) => {
    setState((prev) => ({ ...prev, retryLimit: Math.max(0, Math.min(10, limit)) }));
  }, []);

  const setProcessingSpeed = useCallback((speed: ProcessingSpeed) => {
    setState((prev) => ({ ...prev, processingSpeed: speed }));
  }, []);

  const pause = useCallback(() => {
    pausedRef.current = true;
    setState((prev) => ({ ...prev, isPaused: true }));
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
    setState((prev) => ({ ...prev, isPaused: false }));
  }, []);

  const reset = useCallback(() => {
    processingRef.current = false;
    pausedRef.current = false;
    setState((prev) => ({
      ...DEFAULT_STATE,
      simulationMode: prev.simulationMode,
      retryLimit: prev.retryLimit,
      processingSpeed: prev.processingSpeed,
    }));
  }, []);

  // ── processing engine ──────────────────────────────────────────────────────

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    pausedRef.current = false;
    setState((prev) => ({ ...prev, isProcessing: true, isPaused: false }));

    while (processingRef.current) {
      // Wait if paused
      while (pausedRef.current && processingRef.current) {
        await sleep(200);
      }
      if (!processingRef.current) break;

      // Get next PENDING email from current state
      const currentState = stateRef.current;
      const nextEmail = currentState.emails.find((e) => e.status === 'PENDING');

      if (!nextEmail) {
        // Queue exhausted
        break;
      }

      const emailId = nextEmail.id;
      const retryLimit = currentState.retryLimit;
      const speed = currentState.processingSpeed;
      const mode = currentState.simulationMode;
      const totalAttempts = maxAttempts(retryLimit);
      const delay = getDelay(speed);

      // Mark as PROCESSING
      setState((prev) => {
        const actId = `ACT-${prev.activityCounter + 1}`;
        return {
          ...prev,
          activityCounter: prev.activityCounter + 1,
          currentProcessingId: emailId,
          emails: prev.emails.map((e) =>
            e.id === emailId ? { ...e, status: 'PROCESSING', updatedAt: new Date().toISOString() } : e
          ),
          activityLog: [
            { id: actId, emailId, message: `${emailId} — processing started`, type: 'info', timestamp: new Date().toISOString() },
            ...prev.activityLog,
          ],
        };
      });

      await sleep(delay / 2);
      if (!processingRef.current) break;

      let delivered = false;

      for (let attempt = 1; attempt <= totalAttempts; attempt++) {
        // Wait if paused mid-attempt
        while (pausedRef.current && processingRef.current) {
          await sleep(200);
        }
        if (!processingRef.current) break;

        const success = simulateDelivery(stateRef.current.simulationMode !== mode ? stateRef.current.simulationMode : mode);
        const attemptResult = success ? 'SUCCESS' : 'FAILURE';
        const attemptLog = { attempt, result: attemptResult as 'SUCCESS' | 'FAILURE', timestamp: new Date().toISOString() };

        if (success) {
          // Delivered
          setState((prev) => {
            const actId = `ACT-${prev.activityCounter + 1}`;
            const actId2 = `ACT-${prev.activityCounter + 2}`;
            return {
              ...prev,
              activityCounter: prev.activityCounter + 2,
              emails: prev.emails.map((e) =>
                e.id === emailId
                  ? {
                      ...e,
                      status: 'DELIVERED',
                      attempts: attempt,
                      retries: attempt - 1,
                      finalStatus: 'DELIVERED',
                      updatedAt: new Date().toISOString(),
                      logs: [...e.logs, attemptLog],
                    }
                  : e
              ),
              activityLog: [
                { id: actId2, emailId, message: `${emailId} — DELIVERED successfully`, type: 'success', timestamp: new Date().toISOString() },
                { id: actId, emailId, message: `${emailId} — Attempt ${attempt}: SUCCESS`, type: 'success', timestamp: new Date().toISOString() },
                ...prev.activityLog,
              ],
            };
          });
          delivered = true;
          void delivered;
          await sleep(delay / 2);
          break;
        } else {
          // Failed attempt
          const isLastAttempt = attempt === totalAttempts;

          setState((prev) => {
            const actCounter = prev.activityCounter + 1;
            const newActivities: ActivityEntry[] = [
              {
                id: `ACT-${actCounter}`,
                emailId,
                message: `${emailId} — Attempt ${attempt}: FAILED`,
                type: 'failure',
                timestamp: new Date().toISOString(),
              },
            ];

            if (!isLastAttempt) {
              newActivities.unshift({
                id: `ACT-${actCounter + 1}`,
                emailId,
                message: `${emailId} — retrying (attempt ${attempt + 1} of ${totalAttempts})`,
                type: 'retry',
                timestamp: new Date().toISOString(),
              });
            }

            return {
              ...prev,
              activityCounter: actCounter + (isLastAttempt ? 0 : 1),
              emails: prev.emails.map((e) =>
                e.id === emailId
                  ? {
                      ...e,
                      status: isLastAttempt ? 'FAILED' : 'RETRYING',
                      attempts: attempt,
                      retries: attempt - 1,
                      finalStatus: isLastAttempt ? 'FAILED' : null,
                      updatedAt: new Date().toISOString(),
                      logs: [...e.logs, attemptLog],
                    }
                  : e
              ),
              activityLog: [...newActivities, ...prev.activityLog],
            };
          });

          if (isLastAttempt) {
            await sleep(delay / 2);
            break;
          }

          // Wait before retry
          await sleep(delay);
          if (!processingRef.current) break;
        }
      }

      if (!processingRef.current) break;
      await sleep(delay / 2);
    }

    processingRef.current = false;
    setState((prev) => ({
      ...prev,
      isProcessing: false,
      isPaused: false,
      currentProcessingId: null,
    }));
  }, []);

  const startProcessing = useCallback(() => {
    const pending = stateRef.current.emails.filter((e) => e.status === 'PENDING');
    if (pending.length === 0) return { success: false, error: 'No emails in queue. Add an email before starting processing.' };

    if (stateRef.current.isPaused) {
      resume();
      return { success: true };
    }

    processQueue();
    return { success: true };
  }, [processQueue, resume]);

  return {
    state,
    addEmail,
    loadDemoData,
    startProcessing,
    pause,
    resume,
    reset,
    setSimulationMode,
    setRetryLimit,
    setProcessingSpeed,
  };
}
