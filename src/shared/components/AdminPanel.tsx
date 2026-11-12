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
    <div
      className="rounded-2xl p-5 space-y-4"
      style={{
        background: 'linear-gradient(160deg, rgba(14,18,28,0.95) 0%, rgba(8,11,18,0.98) 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <h2 className="text-xs font-bold text-gray-300 uppercase tracking-widest flex items-center gap-2">
        <Users className="w-3.5 h-3.5 text-cyan-400" />
        Accounts &amp; Roles
      </h2>

      {message && (
        <p
          className="text-xs flex items-center gap-1.5 animate-fade-up"
          role="status"
          aria-live="polite"
          style={{ color: message.type === 'success' ? '#6ee7b7' : '#fca5a5' }}
        >
          {message.type === 'success'
            ? <CheckCircle2 className="w-3.5 h-3.5" />
            : <XCircle className="w-3.5 h-3.5" />}
          {message.text}
        </p>
      )}

      {loading ? (
        <p className="text-xs text-gray-600 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading accounts…
        </p>
      ) : users.length === 0 ? (
        <p className="text-xs text-gray-600">No accounts yet.</p>
      ) : (
        <ul className="space-y-2">
          {users.map((u) => {
            const isSelf = u.uid === currentUid;
            const busy = busyUid === u.uid;
            return (
              <li
                key={u.uid}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-200 truncate">
                    {u.displayName || u.email || u.uid}
                    {isSelf && <span className="ml-2 text-[10px] text-blue-400">(you)</span>}
                  </p>
                  <p className="text-[11px] text-gray-600 truncate">{u.email || u.uid}</p>
                </div>

                <span
                  className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0"
                  style={{
                    background: u.role === 'admin' ? 'rgba(124,58,237,0.18)' : 'rgba(255,255,255,0.05)',
                    border: u.role === 'admin' ? '1px solid rgba(167,139,250,0.35)' : '1px solid rgba(255,255,255,0.08)',
                    color: u.role === 'admin' ? '#c4b5fd' : '#6b7280',
                  }}
                >
                  {u.role === 'admin' ? 'Admin' : 'Operator'}
                </span>

                <button
                  type="button"
                  onClick={() => changeRole(u.uid, u.role === 'admin' ? 'operator' : 'admin')}
                  disabled={busy || isSelf}
                  title={isSelf ? 'You cannot change your own role' : `Make ${u.role === 'admin' ? 'an operator' : 'an administrator'}`}
                  aria-label={`Change the role of ${u.email || u.uid}`}
                  className="btn shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#9ca3af',
                  }}
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCog className="w-3.5 h-3.5" />}
                  {u.role === 'admin' ? 'Make operator' : 'Make admin'}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[11px] leading-snug flex items-start gap-2" style={{ color: '#374151' }}>
        <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px" style={{ color: '#4b5563' }} />
        <span>
          Operators can enqueue and dispatch emails but cannot read the SMTP configuration
          or manage accounts.
        </span>
      </p>
    </div>
  );
}
