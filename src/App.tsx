import { useCallback, useState } from 'react';
import { AlertTriangle, WifiOff, FlaskConical, Send, ShieldCheck } from 'lucide-react';
import { useEmailDispatcher } from './shared/hooks/useEmailDispatcher';
import { useAuth } from './shared/auth/useAuth';
import { Header } from './shared/components/Header';
import { LoginScreen } from './shared/components/LoginScreen';
import { AdminPanel } from './shared/components/AdminPanel';
import { StatsCards } from './modules/module-5-summary-exporter/components/StatsCards';
import { AddEmailForm } from './modules/module-1-email-queue-creator/components/AddEmailForm';
import { DemoDataButton } from './modules/module-1-email-queue-creator/components/DemoDataButton';
import { QueuePanel } from './modules/module-1-email-queue-creator/components/QueuePanel';
import { SettingsPanel } from './modules/module-2-send-simulator/components/SettingsPanel';
import { ProcessingPanel } from './modules/module-3-retry-logic/components/ProcessingPanel';
import { RetrySettingsPanel } from './modules/module-3-retry-logic/components/RetrySettingsPanel';
import { ActivityLog } from './modules/module-4-final-status-logger/components/ActivityLog';
import { ExportPanel } from './modules/module-5-summary-exporter/components/ExportPanel';
import { ROLE_LABELS, SIMULATION_MODE_LABELS } from './shared/constants';

/**
 * The dashboard shell.
 *
 * It owns the page layout only — every piece of behaviour lives in one of
 * the five modules:
 *
 *   1. Email Queue Creator    → AddEmailForm, DemoDataButton, QueuePanel
 *   2. Send Simulator         → SettingsPanel (SMTP + simulation mode)
 *   3. Retry Logic Engine     → ProcessingPanel, RetrySettingsPanel
 *   4. Final Status Logger    → ActivityLog
 *   5. Summary Exporter       → StatsCards, ExportPanel
 */
export default function App() {
  const auth = useAuth();

  const {
    state,
    currentEmail,
    addEmail,
    loadDemoData,
    removeEmail,
    saveConfig,
    testConnection,
    testSend,
    start,
    pause,
    resume,
    reset,
  } = useEmailDispatcher(auth.user?.uid ?? null, auth.role);

  const [dispatchError, setDispatchError] = useState<string | null>(null);

  const { stats, emails, activityLog, dispatcher, config, connected } = state;
  const isProcessing = dispatcher.running && !dispatcher.paused;
  const isPaused = dispatcher.paused;
  const dryRun = Boolean(config?.dryRun);
  const simulationMode = config?.simulationMode ?? 'AUTOMATIC';

  const handleStart = useCallback(async () => {
    setDispatchError(null);
    const result = isPaused ? await resume() : await start();
    if (!result.success && result.error) {
      setDispatchError(result.error);
      setTimeout(() => setDispatchError(null), 5000);
    }
  }, [isPaused, resume, start]);

  const handlePause = useCallback(async () => {
    const result = await pause();
    if (!result.success && result.error) {
      setDispatchError(result.error);
      setTimeout(() => setDispatchError(null), 5000);
    }
  }, [pause]);

  const handleReset = useCallback(async () => {
    if (dispatcher.running && !dispatcher.paused) {
      if (!window.confirm('Dispatch is currently live.\nAre you sure you want to reset?')) return;
    }
    const result = await reset();
    if (!result.success && result.error) {
      setDispatchError(result.error);
      setTimeout(() => setDispatchError(null), 5000);
    }
  }, [dispatcher.running, dispatcher.paused, reset]);

  // ── not signed in ──────────────────────────────────────────────────────────
  if (auth.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#080b12' }}>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          Checking your session…
        </div>
      </div>
    );
  }

  if (!auth.user) {
    return <LoginScreen onSignIn={auth.signIn} onSignUp={auth.signUp} error={auth.error} />;
  }

  return (
    <div className="min-h-screen" style={{ background: '#080b12' }}>
      {/* Ambient background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full blur-3xl opacity-[0.04]"
          style={{ background: 'radial-gradient(circle, #3b82f6, transparent)' }} />
        <div className="absolute top-1/2 -right-40 w-80 h-80 rounded-full blur-3xl opacity-[0.03]"
          style={{ background: 'radial-gradient(circle, #8b5cf6, transparent)' }} />
        <div className="absolute -bottom-20 left-1/3 w-72 h-72 rounded-full blur-3xl opacity-[0.03]"
          style={{ background: 'radial-gradient(circle, #10b981, transparent)' }} />
      </div>

      <Header
        isProcessing={isProcessing}
        isPaused={isPaused}
        connected={connected}
        accountLabel={auth.profile?.displayName || auth.user.email || 'Signed in'}
        roleLabel={auth.role ? ROLE_LABELS[auth.role] : ''}
        onStart={handleStart}
        onPause={handlePause}
        onReset={handleReset}
        onSignOut={auth.signOut}
      />

      <main className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">

        {/* Connection banner */}
        {!connected && (
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium animate-fade-up"
            style={{
              background: 'rgba(127,29,29,0.4)',
              border: '1px solid rgba(248,113,113,0.3)',
              color: '#fca5a5',
            }}
            role="status"
            aria-live="polite"
          >
            <WifiOff className="w-4 h-4 shrink-0" style={{ color: '#f87171' }} />
            Dispatcher data source unreachable. Start the Firebase emulators:
            <code className="px-1.5 py-0.5 rounded bg-black/30 text-xs font-mono">npm run dev</code>
          </div>
        )}

        {/* Error banner */}
        {dispatchError && (
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium animate-fade-up"
            style={{
              background: 'rgba(120,53,15,0.35)',
              border: '1px solid rgba(217,119,6,0.35)',
              color: '#fcd34d',
            }}
            role="alert"
          >
            <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: '#fbbf24' }} />
            {dispatchError}
          </div>
        )}

        {/* Mode notice */}
        {connected && (
          <div
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-medium animate-fade-up"
            style={{
              background: dryRun ? 'rgba(120,53,15,0.25)' : 'rgba(5,46,22,0.4)',
              border: dryRun ? '1px solid rgba(217,119,6,0.3)' : '1px solid rgba(52,211,153,0.25)',
              color: dryRun ? '#fcd34d' : '#6ee7b7',
            }}
            role="status"
            aria-live="polite"
          >
            {dryRun
              ? <FlaskConical className="w-4 h-4 shrink-0" />
              : <Send className="w-4 h-4 shrink-0" />
            }
            {dryRun
              ? `DRY-RUN — delivery is simulated (${SIMULATION_MODE_LABELS[simulationMode]}). Click SMTP Dispatcher Settings to configure real sending.`
              : config?.smtpConfigured
                ? `LIVE — emails are sent for real via SMTP to ${config.smtp.host}:${config.smtp.port}.`
                : 'SMTP not configured — configure it in SMTP Dispatcher Settings to send real emails.'}
          </div>
        )}

        {/* Module 5 — Summary Exporter: live statistics */}
        <StatsCards stats={stats} />

        {/* Module 1 — Email Queue Creator + Module 3 — Retry Logic Engine */}
        {/* The row has a bounded height, like the activity log below, so a long
            queue scrolls inside its panel instead of stretching the page. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 grid-rows-[minmax(420px,640px)]">
          <QueuePanel
            emails={emails}
            currentProcessingId={currentEmail?.id ?? null}
            onRemove={removeEmail}
          />
          <ProcessingPanel
            currentEmail={currentEmail}
            isProcessing={isProcessing}
            isPaused={isPaused}
            queuedCount={stats.queued}
            canSend={!dryRun}
          />
        </div>

        {/* Bottom: Settings + Form | Log | Export */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="space-y-4">
            {/* Module 2 — Send Simulator (administrator only) */}
            {auth.isAdmin ? (
              <SettingsPanel
                config={config}
                onSaveConfig={saveConfig}
                onTestConnection={testConnection}
                onTestSend={testSend}
              />
            ) : (
              <div
                className="rounded-2xl p-5 space-y-2"
                style={{
                  background: 'linear-gradient(160deg, rgba(14,18,28,0.95) 0%, rgba(8,11,18,0.98) 100%)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <h2 className="text-xs font-bold text-gray-300 uppercase tracking-widest flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                  SMTP Dispatcher Settings
                </h2>
                <p className="text-xs leading-snug" style={{ color: '#4b5563' }}>
                  The SMTP configuration holds the mailbox and the sender identity, so it is
                  restricted to administrators. Ask an administrator to change it.
                </p>
              </div>
            )}

            {/* Module 3 — Retry Logic Engine */}
            <RetrySettingsPanel
              retryLimit={config?.retryLimit ?? 3}
              retryDelayMs={config?.retryDelayMs ?? 3000}
              isProcessing={isProcessing}
              onSave={saveConfig}
            />

            {/* Module 1 — Email Queue Creator */}
            <AddEmailForm onAdd={addEmail} disabled={isProcessing} />
            <DemoDataButton disabled={isProcessing} onLoadDemo={loadDemoData} />
          </div>

          {/* Module 4 — Final Status Logger */}
          <div style={{ minHeight: '500px', maxHeight: '640px' }} className="flex flex-col">
            <ActivityLog entries={activityLog} />
          </div>

          {/* Module 5 — Summary Exporter */}
          <div className="space-y-4">
            <ExportPanel emails={emails} stats={stats} />
            {auth.isAdmin && auth.user && (
              <AdminPanel currentUid={auth.user.uid} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
