import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, limit, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { apiUrl } from '../api/client';
import type {
  ActivityEntry,
  DispatcherState,
  Email,
  EmailFormData,
  ServerConfig,
  Stats,
} from '../types/email';

/**
 * Firebase-backed client:
 *  - live state streams in from Firestore realtime listeners (emails, activity,
 *    stats, _meta, _config) instead of SSE
 *  - every action (enqueue, dispatch, config…) goes through the HTTPS Cloud
 *    Function, which is the only writer the Firestore rules allow
 *  - the queue is drained by "dispatch passes"; when a pass reports more work
 *    remaining, this hook keeps it alive by re-triggering /api/dispatch/continue
 */

export const INITIAL_STATS: Stats = {
  total: 0,
  queued: 0,
  sending: 0,
  delivered: 0,
  failed: 0,
  retrying: 0,
  totalAttempts: 0,
  totalRetries: 0,
  successRate: 0,
  failureRate: 0,
};

type UiState = {
  connected: boolean;
  emails: Email[];
  activityLog: ActivityEntry[];
  stats: Stats;
  dispatcher: DispatcherState;
  config: ServerConfig | null;
};

const DEFAULT_STATE: UiState = {
  connected: false,
  emails: [],
  activityLog: [],
  stats: INITIAL_STATS,
  dispatcher: { running: false, paused: false },
  config: null,
};

async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const init: RequestInit = {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json', ...options.headers } : options.headers,
  };
  const res = await fetch(apiUrl(path), init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function statsFromDoc(d: Record<string, unknown>): Stats {
  const delivered = Number(d.delivered) || 0;
  const failed = Number(d.failed) || 0;
  const processed = delivered + failed;
  const retrying = Number(d.retrying) || 0;
  return {
    total: Number(d.total) || 0,
    queued: Number(d.queued) || 0,
    sending: (Number(d.sending) || 0) + retrying,
    delivered,
    failed,
    retrying,
    totalAttempts: Number(d.totalAttempts) || 0,
    totalRetries: Number(d.totalRetries) || 0,
    successRate: processed > 0 ? Math.round((delivered / processed) * 100) : 0,
    failureRate: processed > 0 ? Math.round((failed / processed) * 100) : 0,
  };
}

function configFromDoc(data: Record<string, unknown>): ServerConfig | null {
  if (!data || Object.keys(data).length === 0) return null;
  const smtp = (data.smtp && typeof data.smtp === 'object' ? data.smtp : {}) as Record<string, unknown>;
  const host = String(smtp.host ?? '');
  const user = String(smtp.user ?? '');
  const hasPassword = data.passwordSet === true;
  return {
    smtp: {
      host,
      port: Number(smtp.port) || 587,
      secure: smtp.secure === true,
      user,
      pass: '',
      fromName: String(smtp.fromName ?? 'Email Dispatcher'),
      fromEmail: String(smtp.fromEmail ?? ''),
    },
    hasPassword,
    smtpConfigured: data.dryRun === true ? true : Boolean(host && user && hasPassword),
    dryRun: data.dryRun === true,
    retryLimit: Number(data.retryLimit) || 3,
    retryDelayMs: Number(data.retryDelayMs) || 3000,
    interEmailDelayMs: Number(data.interEmailDelayMs) || 1200,
  };
}

function toEmail(data: Record<string, unknown>): Email {
  const email = data as unknown as Email;
  // defensive: partial/legacy docs must not crash the queue render
  return {
    ...email,
    logs: Array.isArray(email.logs) ? email.logs : [],
  };
}

function toActivity(data: Record<string, unknown>): ActivityEntry {
  return data as unknown as ActivityEntry;
}

export function useEmailDispatcher() {
  const [state, setState] = useState<UiState>(DEFAULT_STATE);
  const connectedRef = useRef(false);
  const metaRef = useRef<DispatcherState>({ running: false, paused: false });
  const pumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markConnected = useCallback(() => {
    if (!connectedRef.current) {
      connectedRef.current = true;
      setState((p) => (p.connected ? p : { ...p, connected: true }));
    }
  }, []);

  const markOffline = useCallback(() => {
    connectedRef.current = false;
    setState((p) => (p.connected ? { ...p, connected: false } : p));
  }, []);

  const cancelPump = useCallback(() => {
    if (pumpTimerRef.current) {
      clearTimeout(pumpTimerRef.current);
      pumpTimerRef.current = null;
    }
  }, []);

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
    }, 1800);
  }, []);

  // ── Firestore live subscriptions ───────────────────────────────────────────
  useEffect(() => {
    const emailUnsub = onSnapshot(
      query(collection(db, 'emails'), orderBy('seq', 'asc')),
      (snap) => {
        markConnected();
        setState((p) => ({ ...p, connected: true, emails: snap.docs.map((d) => toEmail(d.data())) }));
      },
      markOffline
    );

    const activityUnsub = onSnapshot(
      query(collection(db, 'activity'), orderBy('seq', 'desc'), limit(250)),
      (snap) => {
        setState((p) => ({ ...p, activityLog: snap.docs.map((d) => toActivity(d.data())) }));
      },
      markOffline
    );

    const statsUnsub = onSnapshot(
      doc(db, 'stats', 'main'),
      (snap) => {
        markConnected();
        if (snap.exists()) {
          setState((p) => ({ ...p, connected: true, stats: statsFromDoc(snap.data() as Record<string, unknown>) }));
        }
      },
      markOffline
    );

    const metaUnsub = onSnapshot(
      doc(db, '_meta', 'main'),
      (snap) => {
        markConnected();
        if (snap.exists()) {
          const dispatch = (snap.data() as Record<string, unknown>).dispatch as DispatcherState | undefined;
          if (dispatch) {
            metaRef.current = dispatch;
            setState((p) => ({ ...p, connected: true, dispatcher: dispatch }));
            if (!dispatch.running || dispatch.paused) cancelPump();
          }
        } else {
          metaRef.current = { running: false, paused: false };
          setState((p) => ({ ...p, connected: true, dispatcher: { running: false, paused: false } }));
        }
      },
      markOffline
    );

    const configUnsub = onSnapshot(
      doc(db, '_config', 'main'),
      (snap) => {
        markConnected();
        const config = snap.exists()
          ? configFromDoc(snap.data() as Record<string, unknown>)
          : null;
        setState((p) => ({ ...p, connected: true, config }));
      },
      markOffline
    );

    // one-time authoritative config fetch (seeds _config + refreshes password flag)
    api<ServerConfig>('/api/config')
      .then((config) => setState((p) => ({ ...p, connected: true, config })))
      .catch(() => {
        // Firestore listener already keeps config fresh; ignore cold-start races
      });

    return () => {
      cancelPump();
      emailUnsub();
      activityUnsub();
      statsUnsub();
      metaUnsub();
      configUnsub();
    };
  }, [cancelPump, markConnected, markOffline]);

  // ── actions ────────────────────────────────────────────────────────────────

  const addEmail = useCallback(async (form: EmailFormData) => {
    try {
      const data = await api<{ ok: boolean; email: Email; position: number }>('/api/emails', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      return { success: true, emailId: data.email.id, position: data.position };
    } catch (err) {
      return { success: false, error: errMessage(err) };
    }
  }, []);

  const loadDemoData = useCallback(async () => {
    const demoItems = [
      { recipient: 'student1@example.com', subject: 'Assignment Submission', message: 'Your assignment has been received and is under review.' },
      { recipient: 'student2@example.com', subject: 'Exam Schedule', message: 'Your final exam is scheduled for next Monday at 10:00 AM.' },
      { recipient: 'student3@example.com', subject: 'Fee Reminder', message: 'This is a reminder that your fee payment is due by end of this week.' },
      { recipient: 'student4@example.com', subject: 'Library Notice', message: 'The books you borrowed are due for return. Please return them by Friday.' },
      { recipient: 'student5@example.com', subject: 'Result Announcement', message: 'Your semester results have been published on the student portal.' },
    ];
    try {
      const data = await api<{ count: number }>('/api/emails/batch', {
        method: 'POST',
        body: JSON.stringify({ items: demoItems }),
      });
      return { success: true, count: data.count };
    } catch (err) {
      return { success: false, error: errMessage(err) };
    }
  }, []);

  const start = useCallback(async () => {
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

  const pause = useCallback(async () => {
    try {
      await api('/api/dispatch/pause', { method: 'POST' });
      cancelPump();
      return { success: true };
    } catch (err) {
      return { success: false, error: errMessage(err) };
    }
  }, [cancelPump]);

  const resume = useCallback(async () => {
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

  const reset = useCallback(async () => {
    try {
      await api('/api/dispatch/reset', { method: 'POST' });
      cancelPump();
      return { success: true };
    } catch (err) {
      return { success: false, error: errMessage(err) };
    }
  }, [cancelPump]);

  const removeEmail = useCallback(async (id: string) => {
    try {
      await api(`/api/emails/${id}`, { method: 'DELETE' });
      return { success: true };
    } catch (err) {
      return { success: false, error: errMessage(err) };
    }
  }, []);

  const saveConfig = useCallback(async (patch: Record<string, unknown> & { smtp?: Record<string, unknown> }) => {
    try {
      const data = await api<{ ok: boolean; changed: string[]; config: ServerConfig; verify?: { ok: boolean; error?: string; note?: string; mode?: string } }>(
        '/api/config',
        { method: 'POST', body: JSON.stringify(patch) }
      );
      setState((p) => ({ ...p, config: data.config }));
      return { success: true, changed: data.changed, verify: data.verify };
    } catch (err) {
      return { success: false, error: errMessage(err) };
    }
  }, []);

  const testConnection = useCallback(async () => {
    try {
      const data = await api<{ ok: boolean; error?: string; note?: string; mode?: string }>('/api/config/test', { method: 'POST' });
      return data.ok
        ? { success: true, note: data.note }
        : { success: false, error: data.error };
    } catch (err) {
      return { success: false, error: errMessage(err) };
    }
  }, []);

  const testSend = useCallback(async (to: string) => {
    try {
      const data = await api<{ ok: boolean; step: string; error?: string; smtp?: { accepted: string[]; rejected: string[]; response: string } }>(
        '/api/config/test-send',
        { method: 'POST', body: JSON.stringify({ to }) }
      );
      if (!data.ok) return { success: false, error: data.error || 'Send failed.' };
      return { success: true, smtp: data.smtp };
    } catch (err) {
      return { success: false, error: errMessage(err) };
    }
  }, []);

  // ── computed views ─────────────────────────────────────────────────────────

  const queuedCount = state.emails.filter((e) => e.status === 'QUEUED').length;
  const currentEmail =
    state.emails.find((e) => e.status === 'SENDING') ??
    state.emails.find((e) => e.status === 'RETRYING') ??
    null;

  return {
    state,
    currentEmail,
    queuedCount,
    addEmail,
    loadDemoData,
    start,
    pause,
    resume,
    reset,
    removeEmail,
    saveConfig,
    testConnection,
    testSend,
  };
}