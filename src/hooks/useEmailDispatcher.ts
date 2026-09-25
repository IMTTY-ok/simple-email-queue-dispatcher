import { useCallback, useEffect, useRef, useState } from 'react';
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
 * Real dispatcher client:
 *  - reads the full dashboard state from the Express server (REST)
 *  - subscribes to live updates over Server-Sent Events
 *  - exposes actions that drive the server-side queue + SMTP sender
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

function upsertEmail(list: Email[], incoming: Email): Email[] {
  const idx = list.findIndex((e) => e.id === incoming.id);
  if (idx === -1) return [...list, incoming];
  const next = [...list];
  next[idx] = incoming;
  return next;
}

export function useEmailDispatcher() {
  const [state, setState] = useState<UiState>(DEFAULT_STATE);
  const connectedRef = useRef(false);

  // Subscribe to live server events
  useEffect(() => {
    const es = new EventSource(apiUrl('/api/events'));
    let closed = false;

    const markConnected = () => {
      if (!closed) {
        connectedRef.current = true;
        setState((p) => (p.connected ? p : { ...p, connected: true }));
      }
    };

    es.addEventListener('snapshot', (ev) => {
      if (closed) return;
      markConnected();
      const snap = JSON.parse((ev as MessageEvent).data);
      setState((p) => ({
        ...p,
        connected: true,
        emails: Array.isArray(snap.emails) ? snap.emails : p.emails,
        activityLog: Array.isArray(snap.activity) ? snap.activity : p.activityLog,
        stats: snap.stats ?? p.stats,
        dispatcher: snap.dispatcher ?? p.dispatcher,
        config: snap.config ?? p.config,
      }));
    });

    es.addEventListener('email', (ev) => {
      if (closed) return;
      markConnected();
      const email = JSON.parse((ev as MessageEvent).data) as Email;
      setState((p) => ({ ...p, connected: true, emails: upsertEmail(p.emails, email) }));
    });

    es.addEventListener('email:clear', () => {
      if (closed) return;
      setState((p) => ({ ...p, emails: [] }));
    });

    es.addEventListener('activity', (ev) => {
      if (closed) return;
      markConnected();
      const entry = JSON.parse((ev as MessageEvent).data) as ActivityEntry;
      setState((p) => ({ ...p, connected: true, activityLog: [entry, ...p.activityLog].slice(0, 250) }));
    });

    es.addEventListener('stats', (ev) => {
      if (closed) return;
      markConnected();
      const stats = JSON.parse((ev as MessageEvent).data) as Stats;
      setState((p) => ({ ...p, connected: true, stats }));
    });

    es.addEventListener('dispatcher', (ev) => {
      if (closed) return;
      markConnected();
      const d = JSON.parse((ev as MessageEvent).data) as DispatcherState;
      setState((p) => ({ ...p, connected: true, dispatcher: d }));
    });

    es.addEventListener('config', (ev) => {
      if (closed) return;
      markConnected();
      const config = JSON.parse((ev as MessageEvent).data) as ServerConfig;
      setState((p) => ({ ...p, connected: true, config }));
    });

    // fired when the connection drops / the server restarts
    es.addEventListener('error', () => {
      if (closed) return;
      connectedRef.current = false;
      setState((p) => ({ ...p, connected: false }));
    });

    return () => {
      closed = true;
      es.close();
    };
  }, []);

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
      await api('/api/dispatch/start', { method: 'POST' });
      return { success: true };
    } catch (err) {
      return { success: false, error: errMessage(err) };
    }
  }, []);

  const pause = useCallback(async () => {
    try {
      await api('/api/dispatch/pause', { method: 'POST' });
      return { success: true };
    } catch (err) {
      return { success: false, error: errMessage(err) };
    }
  }, []);

  const resume = useCallback(async () => {
    try {
      await api('/api/dispatch/resume', { method: 'POST' });
      return { success: true };
    } catch (err) {
      return { success: false, error: errMessage(err) };
    }
  }, []);

  const reset = useCallback(async () => {
    try {
      await api('/api/dispatch/reset', { method: 'POST' });
      return { success: true };
    } catch (err) {
      return { success: false, error: errMessage(err) };
    }
  }, []);

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