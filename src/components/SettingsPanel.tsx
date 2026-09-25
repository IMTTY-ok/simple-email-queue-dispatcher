import { useState } from 'react';
import {
  Server,
  Save,
  PlugZap,
  Send,
  FlaskConical,
  Database,
  CheckCircle2,
  XCircle,
  Gauge,
  Loader2,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { ServerConfig } from '../types/email';
import { isValidEmail } from '../utils/queue';

interface SettingsPanelProps {
  config: ServerConfig | null;
  isProcessing: boolean;
  onSaveConfig: (patch: Record<string, unknown> & { smtp?: Record<string, unknown> }) => Promise<{
    success: boolean;
    error?: string;
    changed?: string[];
    verify?: { ok: boolean; error?: string; note?: string; mode?: string };
  }>;
  onTestConnection: () => Promise<{ success: boolean; error?: string; note?: string }>;
  onTestSend: (to: string) => Promise<{ success: boolean; error?: string }>;
  onLoadDemo: () => Promise<{ success: boolean; error?: string; count?: number }>;
}

const PORT_OPTIONS = [
  { value: 587, label: '587 (StartTLS)', secure: false },
  { value: 465, label: '465 (SSL/TLS)', secure: true },
  { value: 25, label: '25 (plain)', secure: false },
];

export function SettingsPanel({
  config,
  isProcessing,
  onSaveConfig,
  onTestConnection,
  onTestSend,
  onLoadDemo,
}: SettingsPanelProps) {
  const [host, setHost] = useState('');
  const [port, setPort] = useState(587);
  const [secure, setSecure] = useState(false);
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [fromName, setFromName] = useState('Email Dispatcher');
  const [fromEmail, setFromEmail] = useState('');
  const [retryLimit, setRetryLimit] = useState(3);
  const [dryRun, setDryRun] = useState(false);
  const [testTo, setTestTo] = useState('');

  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // initialise the form when the server config first arrives
  const initFrom = config?.smtp;
  const [seeded, setSeeded] = useState(false);
  if (config && !seeded) {
    setSeeded(true);
    setHost(initFrom?.host ?? '');
    setPort(initFrom?.port ?? 587);
    setSecure(initFrom?.secure ?? false);
    setUser(initFrom?.user ?? '');
    setFromName(initFrom?.fromName ?? 'Email Dispatcher');
    setFromEmail(initFrom?.fromEmail ?? '');
    setRetryLimit(config.retryLimit);
    setDryRun(config.dryRun);
  }

  const show = (type: 'success' | 'error', message: string) => setFeedback({ type, message });
  const clear = () => setFeedback(null);

  const handleSave = async () => {
    setBusy('save');
    clear();
    const res = await onSaveConfig({
      smtp: {
        host,
        port,
        secure,
        user,
        pass,
        fromName,
        fromEmail,
      },
      dryRun,
      retryLimit,
    });
    setBusy(null);

    if (!res.success) {
      show('error', res.error ?? 'Failed to save settings.');
      return;
    }
    show('success', res.verify?.ok
      ? `Settings saved. SMTP connection verified — ${res.verify.note ?? 'OK'}`
      : res.verify?.error
        ? `Settings saved, but connection check failed: ${res.verify.error}`
        : 'Settings saved.');
    setPass('');
  };

  const handleTest = async () => {
    setBusy('test');
    clear();
    const res = await onTestConnection();
    setBusy(null);
    if (res.success) show('success', res.note ?? 'Connection OK');
    else show('error', res.error ?? 'Connection failed');
  };

  const handleTestSend = async () => {
    if (!isValidEmail(testTo.trim())) {
      show('error', 'Enter a valid recipient email for the test.');
      return;
    }
    setBusy('testsend');
    clear();
    const res = await onTestSend(testTo.trim());
    setBusy(null);
    if (res.success) show('success', `Test email accepted by SMTP → sent to ${testTo.trim()}`);
    else show('error', res.error ?? 'Test send failed');
  };

  const handleDemo = async () => {
    setBusy('demo');
    clear();
    const res = await onLoadDemo();
    setBusy(null);
    if (res.success) show('success', `Loaded ${res.count ?? 5} demo emails into the queue.`);
    else show('error', res.error ?? 'Failed to load demo data.');
  };

  const inputStyle = 'input-field w-full rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-700 focus:outline-none disabled:opacity-50 transition-all';

  return (
    <div
      className="rounded-2xl p-5 space-y-5"
      style={{
        background: 'linear-gradient(160deg, rgba(14,18,28,0.95) 0%, rgba(8,11,18,0.98) 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <h2 className="text-xs font-bold text-gray-300 uppercase tracking-widest flex items-center gap-2">
        <Server className="w-3.5 h-3.5 text-purple-400" />
        SMTP Dispatcher Settings
      </h2>

      {/* Feedback */}
      {feedback && (
        <div
          className="p-3 rounded-xl flex items-start gap-2.5 animate-fade-up text-sm"
          style={
            feedback.type === 'success'
              ? { background: 'rgba(5,46,22,0.6)', border: '1px solid rgba(52,211,153,0.25)' }
              : { background: 'rgba(69,10,10,0.6)', border: '1px solid rgba(248,113,113,0.25)' }
          }
        >
          {feedback.type === 'success'
            ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#34d399' }} />
            : <XCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#f87171' }} />
          }
          <p style={{ color: feedback.type === 'success' ? '#6ee7b7' : '#fca5a5' }}>{feedback.message}</p>
        </div>
      )}

      {/* Connection fields */}
      <div className="space-y-2.5">
        <label className="block text-xs text-gray-600 font-semibold uppercase tracking-widest">SMTP Server</label>
        <input
          value={host}
          onChange={(e) => { setHost(e.target.value); clear(); }}
          placeholder="smtp.gmail.com"
          className={inputStyle}
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
        />
        <div className="grid grid-cols-3 gap-2">
          {PORT_OPTIONS.map((opt) => {
            const active = port === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { setPort(opt.value); setSecure(opt.secure); clear(); }}
                className="btn py-2 rounded-xl text-xs font-semibold flex flex-col items-center gap-0.5 transition-all"
                style={{
                  background: active
                    ? 'linear-gradient(135deg, rgba(124,58,237,0.35), rgba(99,102,241,0.2))'
                    : 'rgba(255,255,255,0.04)',
                  border: active
                    ? '1px solid rgba(167,139,250,0.4)'
                    : '1px solid rgba(255,255,255,0.06)',
                  color: active ? '#c4b5fd' : '#6b7280',
                }}
              >
                <span className="font-mono">{opt.value}</span>
                <span className="text-[10px] opacity-70">{opt.label}</span>
              </button>
            );
          })}
        </div>

        <div className="space-y-2.5 pt-1">
          <div className="flex items-center gap-2">
            <input
              value={user}
              onChange={(e) => { setUser(e.target.value); clear(); }}
              placeholder="you@gmail.com"
              className={inputStyle}
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            />
          </div>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              value={pass}
              onChange={(e) => { setPass(e.target.value); clear(); }}
              placeholder={config?.hasPassword ? '•••••••• (keep blank to keep current)' : 'SMTP password / app password'}
              className={`${inputStyle} pr-10`}
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            />
            <button
              type="button"
              onClick={() => setShowPass((s) => !s)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400"
            >
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* From identity */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          <input
            value={fromName}
            onChange={(e) => { setFromName(e.target.value); clear(); }}
            placeholder="Sender Name"
            className={inputStyle}
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          />
          <input
            value={fromEmail}
            onChange={(e) => { setFromEmail(e.target.value); clear(); }}
            placeholder="From email (defaults to user)"
            className={inputStyle}
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          />
        </div>
      </div>

      {/* Retry limit */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-gray-600 font-semibold uppercase tracking-widest flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5" />
            Retry Limit
          </p>
          <span className="text-sm font-extrabold tabular-nums" style={{ color: '#a78bfa' }}>
            {retryLimit}
          </span>
        </div>
        <input
          type="range" min={0} max={5} value={retryLimit}
          onChange={(e) => { setRetryLimit(Number(e.target.value)); clear(); }}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
          style={{ accentColor: '#8b5cf6' }}
        />
        <p className="text-xs mt-1.5" style={{ color: '#374151' }}>
          Max {retryLimit + 1} total SMTP attempt{retryLimit + 1 !== 1 ? 's' : ''} per email
        </p>
      </div>

      {/* Dry-run / demo */}
      <div className="space-y-2 pt-1 border-t border-white/[0.05]">
        <label className="flex items-center justify-between gap-3 p-3 rounded-xl cursor-pointer transition-all"
          style={{
            background: dryRun ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.03)',
            border: dryRun ? '1px solid rgba(245,158,11,0.35)' : '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <FlaskConical className="w-4 h-4 shrink-0" style={{ color: dryRun ? '#fbbf24' : '#6b7280' }} />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-200">Dry-run (no real sending)</p>
              <p className="text-xs" style={{ color: '#4b5563' }}>
                Lets the queue + retry demo run without SMTP credentials
              </p>
            </div>
          </div>
          <input type="checkbox" checked={dryRun}
            onChange={(e) => { setDryRun(e.target.checked); clear(); }}
            className="w-4 h-4 shrink-0 accent-amber-500" />
        </label>

        <button
          onClick={handleDemo}
          disabled={isProcessing}
          className="btn w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'linear-gradient(135deg, #4338ca, #6d28d9)' }}
        >
          {busy === 'demo' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
          Load Demo Data
        </button>
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleSave}
            disabled={busy !== null}
            className="btn flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #2563eb, #4f46e5)' }}
          >
            {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Config
          </button>
          <button
            onClick={handleTest}
            disabled={busy !== null}
            className="btn flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #0e7490, #0891b2)' }}
          >
            {busy === 'test' ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
            Test Connection
          </button>
        </div>

        <div className="flex gap-2">
          <input
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="Send a test email to…"
            className={`${inputStyle} flex-1`}
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          />
          <button
            onClick={handleTestSend}
            disabled={busy !== null}
            className="btn flex items-center justify-center gap-2 px-4 rounded-xl text-sm font-semibold text-emerald-200 disabled:opacity-50"
            style={{
              background: 'rgba(5,150,105,0.15)',
              border: '1px solid rgba(52,211,153,0.3)',
            }}
            title="Send a real test email to verify end-to-end delivery"
          >
            {busy === 'testsend' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-[11px] leading-snug" style={{ color: '#374151' }}>
          {dryRun
            ? 'Dry-run mode is ON — the dispatcher simulates SMTP and reports delivered without sending.'
            : config?.smtpConfigured
              ? `Configured for ${config.smtp.host}:${config.smtp.port}. Emails are sent for real via SMTP.`
              : 'SMTP not configured yet. Add credentials above and click Save Config first.'}
        </p>
      </div>
    </div>
  );
}