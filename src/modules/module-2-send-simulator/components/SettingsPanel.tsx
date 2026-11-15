import { useEffect, useRef, useState } from 'react';
import {
  Server,
  Save,
  PlugZap,
  Send,
  FlaskConical,
  CheckCircle2,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  Dices,
  CircleCheck,
  CircleX,
} from 'lucide-react';
import type { ServerConfig, SimulationMode } from '../../../shared/types/email';
import { isValidEmail } from '../../../shared/utils/format';
import { SIMULATION_MODES, SIMULATION_MODE_LABELS, SMTP_PORT_OPTIONS } from '../../../shared/constants';

interface SettingsPanelProps {
  config: ServerConfig | null;
  onSaveConfig: (patch: {
    smtp?: {
      host?: string;
      port?: number;
      secure?: boolean;
      user?: string;
      pass?: string;
      fromName?: string;
      fromEmail?: string;
    };
    dryRun?: boolean;
    simulationMode?: SimulationMode;
    retryLimit?: number;
  }) => Promise<{
    success: boolean;
    error?: string;
    changed?: string[];
    verify?: { ok: boolean; error?: string; note?: string; mode?: string };
  }>;
  onTestConnection: () => Promise<{ success: boolean; error?: string; note?: string }>;
  onTestSend: (to: string) => Promise<{ success: boolean; error?: string }>;
  /**
   * `full` — the whole transport configuration (the default, unchanged).
   * `simulation` — only the dry-run switch and the simulation modes, which
   * is what the dashboard's "Module 2 + 3" card shows.
   * `transport` — only the SMTP server, the credentials and the tests.
   */
  variant?: 'full' | 'simulation' | 'transport';
  /** Render without the surrounding card, for use inside another panel. */
  embedded?: boolean;
}

const SIMULATION_MODE_ICONS: Record<SimulationMode, React.ReactNode> = {
  AUTOMATIC: <Dices className="w-3.5 h-3.5" />,
  FORCE_SUCCESS: <CircleCheck className="w-3.5 h-3.5" />,
  FORCE_FAILURE: <CircleX className="w-3.5 h-3.5" />,
};

/**
 * Module 2 — Send Simulator.
 *
 * Configures the transport the dispatcher uses: the SMTP server, the
 * credentials, the sender identity, and the simulation behaviour used while
 * dry-run mode is enabled.
 */
export function SettingsPanel({
  config,
  onSaveConfig,
  onTestConnection,
  onTestSend,
  variant = 'full',
  embedded = false,
}: SettingsPanelProps) {
  const [host, setHost] = useState('');
  const [port, setPort] = useState(587);
  const [secure, setSecure] = useState(false);
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [fromName, setFromName] = useState('Email Dispatcher');
  const [fromEmail, setFromEmail] = useState('');
  const [dryRun, setDryRun] = useState(false);
  const [simulationMode, setSimulationMode] = useState<SimulationMode>('AUTOMATIC');
  const [testTo, setTestTo] = useState('');

  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Seed the form once the server config arrives for the first time.
  // A ref (not a state flag) keeps later config changes from overwriting
  // whatever the user is currently typing.
  const seededRef = useRef(false);
  // Whether the user has edited the dry-run switch / simulation mode in *this*
  // panel. While untouched, the panel follows the server; while touched, the
  // user's choice wins until it is saved.
  const dryRunTouchedRef = useRef(false);
  const simModeTouchedRef = useRef(false);
  useEffect(() => {
    if (!config) return;
    if (!seededRef.current) {
      seededRef.current = true;
      setHost(config.smtp.host ?? '');
      setPort(config.smtp.port ?? 587);
      setSecure(config.smtp.secure ?? false);
      setUser(config.smtp.user ?? '');
      setFromName(config.smtp.fromName ?? 'Email Dispatcher');
      setFromEmail(config.smtp.fromEmail ?? '');
      setDryRun(config.dryRun ?? false);
      setSimulationMode(config.simulationMode ?? 'AUTOMATIC');
      return;
    }
    // The server is the single source of truth. If the dry-run switch or the
    // simulation mode changed elsewhere (another panel, another tab, the
    // server itself), follow it — unless the user is mid-edit right here.
    if (!dryRunTouchedRef.current) setDryRun(config.dryRun ?? false);
    if (!simModeTouchedRef.current) setSimulationMode(config.simulationMode ?? 'AUTOMATIC');
  }, [config]);

  const show = (type: 'success' | 'error', message: string) => setFeedback({ type, message });
  const clear = () => setFeedback(null);

  const showSmtp = variant === 'full' || variant === 'transport';
  const showSimulation = variant === 'full' || variant === 'simulation';

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
      // Only send the simulation fields when this panel actually renders
      // them. The transport variant hides the dry-run switch, so sending its
      // invisible copy would silently undo a change made in the simulation
      // card — the config would flip back to dry-run behind the user's back.
      ...(showSimulation ? { dryRun, simulationMode } : {}),
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
    // The saved values are now the baseline again.
    dryRunTouchedRef.current = false;
    simModeTouchedRef.current = false;
  };

  /** Save only the simulation settings (the "Module 2 + 3" card). */
  const handleSaveSimulation = async () => {
    setBusy('simulation');
    clear();
    const res = await onSaveConfig({ dryRun, simulationMode });
    setBusy(null);
    if (!res.success) {
      show('error', res.error ?? 'Failed to save the simulation settings.');
      return;
    }
    show('success', 'Simulation settings saved.');
    dryRunTouchedRef.current = false;
    simModeTouchedRef.current = false;
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

  const inputClass = 'input';

  const body = (
    <div className="space-y-4">
      {/* Feedback */}
      {feedback && (
        <div
          className={`notice ${feedback.type === 'success' ? 'notice-green' : 'notice-red'} animate-fade-up`}
          role="status"
          aria-live="polite"
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" />
          ) : (
            <XCircle className="w-4 h-4 shrink-0 mt-px" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Dry-run + simulation mode */}
      {showSimulation && (
        <div className="space-y-2.5">
          <label
            className="flex items-center justify-between gap-3 p-2.5 rounded-control cursor-pointer transition-colors"
            style={{
              background: dryRun ? '#FDF3E3' : '#FBFCFE',
              border: `1px solid ${dryRun ? '#ECD8B1' : '#CCD6E3'}`,
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <FlaskConical className="w-4 h-4 shrink-0" style={{ color: dryRun ? '#A56B18' : '#465F7B' }} />
              <div className="min-w-0">
                <p className="text-[12.5px] font-semibold text-navy-900">Dry-run (no real sending)</p>
                <p className="text-[11.5px] text-ink-muted">
                  Lets the queue + retry demo run without SMTP credentials
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => { dryRunTouchedRef.current = true; setDryRun(e.target.checked); clear(); }}
              aria-label="Enable dry-run mode"
              className="w-6 h-6 shrink-0 accent-[#16815B]"
            />
          </label>

          {/* Simulation modes — only meaningful in dry-run */}
          <div className={dryRun ? 'space-y-2' : 'space-y-2 opacity-50'}>
            <p className="field-label">Simulation mode</p>
            <div className="segment grid-cols-3">
              {SIMULATION_MODES.map((mode) => {
                const active = simulationMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => { simModeTouchedRef.current = true; setSimulationMode(mode); clear(); }}
                    disabled={!dryRun}
                    aria-pressed={active}
                    title={
                      mode === 'AUTOMATIC'
                        ? 'Randomly succeeds or fails each attempt'
                        : mode === 'FORCE_SUCCESS'
                          ? 'Every attempt succeeds'
                          : 'Every attempt fails — demonstrates the retry engine'
                    }
                    className="segment-btn flex flex-col items-center gap-1"
                  >
                    {SIMULATION_MODE_ICONS[mode]}
                    <span className="leading-tight text-center">{SIMULATION_MODE_LABELS[mode]}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] leading-snug text-ink-faint">
              Used while dry-run is enabled. “Force Failure” makes every attempt fail so the
              retry engine can be demonstrated.
            </p>
          </div>

          {variant === 'simulation' && (
            <button
              type="button"
              onClick={handleSaveSimulation}
              disabled={busy !== null}
              className="btn btn-navy"
            >
              {busy === 'simulation' ? (
                <Loader2 className="w-4 h-4 animate-spin-smooth" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Simulation Settings
            </button>
          )}
        </div>
      )}

      {/* SMTP transport configuration */}
      {showSmtp && (
        <>
          <div className="space-y-2.5 pt-1 border-t border-hairline-soft">
            <p className="field-label flex items-center gap-1.5">
              <Server className="w-3 h-3" />
              SMTP transport
            </p>
            <p
              className="text-[11.5px] rounded-control px-2.5 py-2"
              style={{
                background: dryRun ? '#FDF3E3' : '#E7F4EE',
                border: `1px solid ${dryRun ? '#ECD8B1' : '#BFE2D4'}`,
                color: dryRun ? '#A56B18' : '#16815B',
              }}
            >
              {dryRun
                ? `Dry-run mode is active; no external email is sent (${SIMULATION_MODE_LABELS[simulationMode]}).`
                : config?.smtpConfigured
                  ? `Configured for ${config.smtp.host}:${config.smtp.port}. Emails are sent for real via SMTP.`
                  : 'SMTP not configured yet. Add credentials below and click Save Config first.'}
            </p>
            <input
              id="smtp-host"
              value={host}
              onChange={(e) => { setHost(e.target.value); clear(); }}
              placeholder="smtp.gmail.com"
              aria-label="SMTP host"
              className={inputClass}
            />
            <div className="grid grid-cols-3 gap-2">
              {SMTP_PORT_OPTIONS.map((opt) => {
                const active = port === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setPort(opt.value); setSecure(opt.secure); clear(); }}
                    className="segment-btn flex flex-col items-center gap-0.5"
                    aria-pressed={active}
                  >
                    <span className="mono">{opt.value}</span>
                    <span className="text-[10px] opacity-70">{opt.label}</span>
                  </button>
                );
              })}
            </div>

            <input
              id="smtp-user"
              value={user}
              onChange={(e) => { setUser(e.target.value); clear(); }}
              placeholder="you@gmail.com"
              aria-label="SMTP username"
              className={inputClass}
            />
            <div className="relative">
              <input
                id="smtp-pass"
                type={showPass ? 'text' : 'password'}
                value={pass}
                onChange={(e) => { setPass(e.target.value); clear(); }}
                placeholder={config?.hasPassword ? '•••••••• (keep blank to keep current)' : 'SMTP password / app password'}
                aria-label="SMTP password"
                autoComplete="off"
                className={`${inputClass} pr-10`}
              />
              <button
                type="button"
                className="affix-toggle"
                onClick={() => setShowPass((s) => !s)}
                aria-label={showPass ? 'Hide password' : 'Show password'}
                aria-pressed={showPass}
                title={showPass ? 'Hide password' : 'Show password'}
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] leading-snug text-ink-faint">
              Stored server-side in Firebase — never sent back to the browser or committed to the repo.
              Leave blank to keep the current password.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <input
                id="smtp-from-name"
                value={fromName}
                onChange={(e) => { setFromName(e.target.value); clear(); }}
                placeholder="Sender Name"
                aria-label="Sender name"
                className={inputClass}
              />
              <input
                id="smtp-from-email"
                value={fromEmail}
                onChange={(e) => { setFromEmail(e.target.value); clear(); }}
                placeholder="From email (defaults to user)"
                aria-label="From email address"
                className={inputClass}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2 pt-1 border-t border-hairline-soft">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={busy !== null}
                className="btn btn-navy"
              >
                {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin-smooth" /> : <Save className="w-4 h-4" />}
                Save Config
              </button>
              <button
                type="button"
                onClick={handleTest}
                disabled={busy !== null}
                className="btn btn-ghost"
              >
                {busy === 'test' ? <Loader2 className="w-4 h-4 animate-spin-smooth" /> : <PlugZap className="w-4 h-4" />}
                Test Connection
              </button>
            </div>

            <div className="flex gap-2">
              <input
                id="test-send-to"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="Send a test email to…"
                aria-label="Test email recipient"
                className={`${inputClass} flex-1`}
              />
              <button
                type="button"
                onClick={handleTestSend}
                disabled={busy !== null}
                className="btn btn-ghost"
                style={{ color: '#16815B' }}
                title="Send a real test email to verify end-to-end delivery"
                aria-label="Send test email"
              >
                {busy === 'testsend' ? <Loader2 className="w-4 h-4 animate-spin-smooth" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  if (embedded) return body;

  return (
    <section className="card">
      <header className="card-head">
        <h2 className="card-title">
          <Server className="w-3.5 h-3.5 text-navy-700" />
          SMTP CONFIGURATION
        </h2>
        <span className="text-[11px] text-ink-muted">Administrator only</span>
      </header>
      <div className="card-body">{body}</div>
    </section>
  );
}
