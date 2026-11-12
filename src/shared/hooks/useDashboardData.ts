import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, limit, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { api } from '../api/client';
import { configFromDoc, statsFromDoc, toActivity, toEmail, toDispatcherState } from '../mappers';
import type { ActivityEntry, DispatcherState, Email, ServerConfig, Stats } from '../types/email';
import type { Role } from '../auth/useAuth';

/**
 * The live dashboard state.
 *
 * Everything here is pushed by the server through Firestore realtime
 * listeners — the dashboard never polls.
 *
 * The Firestore rules decide what a caller may see: an administrator reads
 * the whole installation, an operator only their own emails and activity. The
 * queries below mirror that, so the browser never even asks for rows it is
 * not allowed to read.
 */
export interface DashboardState {
  connected: boolean;
  emails: Email[];
  activityLog: ActivityEntry[];
  stats: Stats;
  dispatcher: DispatcherState;
  config: ServerConfig | null;
}

/** The zeroed statistics used before the server sends its first snapshot. */
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

const DEFAULT_STATE: DashboardState = {
  connected: false,
  emails: [],
  activityLog: [],
  stats: INITIAL_STATS,
  dispatcher: { running: false, paused: false },
  config: null,
};

/**
 * Subscribe to every collection the dashboard renders.
 *
 * @param uid the signed-in account
 * @param role the account's server-assigned role
 */
export function useDashboardData(uid: string | null, role: Role | null) {
  const [state, setState] = useState<DashboardState>(DEFAULT_STATE);
  const connectedRef = useRef(false);
  const isAdmin = role === 'admin';

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

  useEffect(() => {
    // Nothing to subscribe to until somebody is signed in.
    if (!uid) {
      setState(DEFAULT_STATE);
      return;
    }

    // An operator only sees their own queue entries and activity.
    const emailsQuery = isAdmin
      ? query(collection(db, 'emails'), orderBy('seq', 'asc'))
      : query(collection(db, 'emails'), where('createdBy', '==', uid), orderBy('seq', 'asc'));

    const activityQuery = isAdmin
      ? query(collection(db, 'activity'), orderBy('seq', 'desc'), limit(250))
      : query(collection(db, 'activity'), where('createdBy', '==', uid), orderBy('seq', 'desc'), limit(250));

    const emailUnsub = onSnapshot(
      emailsQuery,
      (snap) => {
        markConnected();
        setState((p) => ({ ...p, connected: true, emails: snap.docs.map((d) => toEmail(d.data())) }));
      },
      markOffline
    );

    const activityUnsub = onSnapshot(
      activityQuery,
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
          const raw = (snap.data() as Record<string, unknown>).dispatch;
          const next = raw && typeof raw === 'object'
            ? toDispatcherState(raw as Record<string, unknown>)
            : { running: false, paused: false };
          setState((p) => ({ ...p, connected: true, dispatcher: next }));
        } else {
          setState((p) => ({ ...p, connected: true, dispatcher: { running: false, paused: false } }));
        }
      },
      markOffline
    );

    // The SMTP configuration is administrator-only, so only an administrator
    // subscribes to it.
    let configUnsub: (() => void) | null = null;
    if (isAdmin) {
      configUnsub = onSnapshot(
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
    } else {
      setState((p) => ({ ...p, config: null }));
    }

    // one-time authoritative config fetch (seeds _config + refreshes password flag)
    if (isAdmin) {
      api<ServerConfig>('/api/config')
        .then((config) => setState((p) => ({ ...p, connected: true, config })))
        .catch(() => {
          // Firestore listener already keeps config fresh; ignore cold-start races
        });
    }

    return () => {
      emailUnsub();
      activityUnsub();
      statsUnsub();
      metaUnsub();
      configUnsub?.();
    };
  }, [uid, isAdmin, markConnected, markOffline]);

  return { state, setState };
}
