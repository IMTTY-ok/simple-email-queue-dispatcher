import { useCallback, useEffect, useState } from 'react';
import { Users, ShieldCheck, UserCog, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { api, errMessage } from '../api/client';
import type { AuthProfile, Role } from '../auth/useAuth';

interface AdminPanelProps {
  currentUid: string;
}

/**
 * The administrator's account list.
 *
 * An administrator can promote an operator to administrator and demote an
 * administrator back to operator. The server enforces this — the browser
 * cannot grant itself anything.
 */
export function AdminPanel({ currentUid }: AdminPanelProps) {
  const [users, setUsers] = useState<AuthProfile[]>([]);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ users: AuthProfile[] }>('/api/users');
      setUsers(data.users);
      setMessage(null);
    } catch (err) {
      setMessage({ type: 'error', text: errMessage(err) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const changeRole = async (uid: string, role: Role) => {
    setBusyUid(uid);
    setMessage(null);
    try {
      await api(`/api/users/${uid}/role`, { method: 'POST', body: JSON.stringify({ role }) });
      setMessage({ type: 'success', text: 'Role updated.' });
      await load();
    } catch (err) {
      setMessage({ type: 'error', text: errMessage(err) });
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <section className="card">
      <header className="card-head">
        <h2 className="card-title">
          <Users className="w-3.5 h-3.5 text-navy-700" />
          ACCOUNTS &amp; ROLES
        </h2>
        <span className="text-[11px] text-ink-muted">Administrator only</span>
      </header>
      <div className="card-body space-y-3">
        {message && (
          <p
            className="notice"
            role="status"
            aria-live="polite"
            style={{
              background: message.type === 'success' ? '#E7F4EE' : '#FBECEC',
              borderColor: message.type === 'success' ? '#BFE2D4' : '#EFCACA',
              color: message.type === 'success' ? '#16815B' : '#B24545',
            }}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-px" />
            ) : (
              <XCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
            )}
            {message.text}
          </p>
        )}

        {loading ? (
          <p className="text-[12px] text-ink-muted flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin-smooth" /> Loading accounts…
          </p>
        ) : users.length === 0 ? (
          <p className="text-[12px] text-ink-muted">No accounts yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {users.map((u) => {
              const isSelf = u.uid === currentUid;
              const busy = busyUid === u.uid;
              return (
                <li
                  key={u.uid}
                  className="flex items-center gap-3 rounded-control border border-hairline px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold text-navy-900 truncate">
                      {u.displayName || u.email || u.uid}
                      {isSelf && (
                        <span className="ml-2 text-[10.5px]" style={{ color: '#24436A' }}>
                          (you)
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-ink-faint truncate">{u.email || u.uid}</p>
                  </div>

                  <span className={`badge ${u.role === 'admin' ? 'badge-navy' : 'badge-slate'}`}>
                    {u.role === 'admin' ? 'Admin' : 'Operator'}
                  </span>

                  <button
                    type="button"
                    onClick={() => changeRole(u.uid, u.role === 'admin' ? 'operator' : 'admin')}
                    disabled={busy || isSelf}
                    title={isSelf ? 'You cannot change your own role' : `Make ${u.role === 'admin' ? 'an operator' : 'an administrator'}`}
                    aria-label={`Change the role of ${u.email || u.uid}`}
                    className="btn btn-ghost btn-sm shrink-0"
                  >
                    {busy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin-smooth" />
                    ) : (
                      <UserCog className="w-3.5 h-3.5" />
                    )}
                    {u.role === 'admin' ? 'Make operator' : 'Make admin'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-[11px] leading-snug flex items-start gap-2 text-ink-faint">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>
            Operators can enqueue, schedule and dispatch emails but cannot read the SMTP
            configuration or manage accounts.
          </span>
        </p>
      </div>
    </section>
  );
}
