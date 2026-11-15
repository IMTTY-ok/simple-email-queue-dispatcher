import { useCallback, useState } from 'react';
import { AlertTriangle, WifiOff, LayoutDashboard, CalendarClock, Server } from 'lucide-react';
import { useEmailDispatcher } from './shared/hooks/useEmailDispatcher';
import { useAuth } from './shared/auth/useAuth';
import { Header } from './shared/components/Header';
import { LoginScreen } from './shared/components/LoginScreen';
import { AdminPanel } from './shared/components/AdminPanel';
import { ControlToolbar } from './shared/components/ControlToolbar';
import { Panel } from './shared/components/Panel';
import { StatsCards, StatsDetails } from './modules/module-5-summary-exporter/components/StatsCards';
import { AddEmailForm } from './modules/module-1-email-queue-creator/components/AddEmailForm';
import { DemoDataButton } from './modules/module-1-email-queue-creator/components/DemoDataButton';
import { QueuePanel } from './modules/module-1-email-queue-creator/components/QueuePanel';
import { SettingsPanel } from './modules/module-2-send-simulator/components/SettingsPanel';
import { ProcessingPanel } from './modules/module-3-retry-logic/components/ProcessingPanel';
import { RetrySettingsPanel } from './modules/module-3-retry-logic/components/RetrySettingsPanel';
import { ActivityLog } from './modules/module-4-final-status-logger/components/ActivityLog';
import { ExportPanel } from './modules/module-5-summary-exporter/components/ExportPanel';
import { ScheduledEmailsPanel } from './modules/module-6-scheduled-delivery/components/ScheduledEmailsPanel';
import { ROLE_LABELS } from './shared/constants';

type Tab = 'dashboard' | 'scheduled';

/**
 * The dashboard shell.
 *
 * It owns the page layout only — every piece of behaviour lives in one of the
 * modules:
 *
 *   1. Email Queue Creator    → AddEmailForm, DemoDataButton, QueuePanel
 *   2. Send Simulator         → SettingsPanel (SMTP + simulation mode)
 *   3. Retry Logic Engine     → ProcessingPanel, RetrySettingsPanel
 *   4. Final Status Logger    → ActivityLog
 *   5. Summary Exporter       → StatsCards, ExportPanel
 *   6. Scheduled Delivery     → SchedulePanel, ScheduledEmailsPanel
 */
export default function App() {
  const auth = useAuth();

  const {
    state,
    currentEmail,
    addEmail,
    sendNow,
    scheduleEmail,
    cancelEmail,
    rescheduleEmail,
    runSweep,
    removeEmail,
    loadDemoData,
    saveConfig,
    testConnection,
    testSend,
    start,
    pause,
    resume,
    stop,
    reset,
  } = useEmailDispatcher(auth.user?.uid ?? null, auth.role);

  const [tab, setTab] = useState<Tab>('dashboard');
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const { stats, emails, activityLog, dispatcher, config, connected, status } = state;
  const isProcessing = dispatcher.running && !dispatcher.paused;
  const isPaused = dispatcher.paused;

  // The operating mode comes from the server's status endpoint, so the header
  // always shows the real state — never a hardcoded indicator.
  const dryRun = status ? status.dryRun : Boolean(config?.dryRun);
  const mode: 'DRY-RUN' | 'LIVE' = dryRun ? 'DRY-RUN' : 'LIVE';

  const reportError = useCallback((error?: string) => {
    if (!error) return;
    setDispatchError(error);
    setTimeout(() => setDispatchError(null), 6000);
  }, []);

  const handleStart = useCallback(async () => {
    setDispatchError(null);
    setBusy('start');
    const result = isPaused ? await resume() : await start();
    setBusy(null);
    reportError(result.success ? undefined : result.error);
  }, [isPaused, resume, start, reportError]);

  const handlePause = useCallback(async () => {
    setBusy('pause');
    const result = await pause();
    setBusy(null);
    reportError(result.success ? undefined : result.error);
  }, [pause, reportError]);

  const handleStop = useCallback(async () => {
    setBusy('stop');
    const result = await stop();
    setBusy(null);
    reportError(result.success ? undefined : result.error);
  }, [stop, reportError]);

  const handleReset = useCallback(async () => {
    // Resetting removes every queued email, so it always asks first.
    const confirmed = window.confirm(
      'Reset the queue?\n\nThis removes every queued email, the activity log and the statistics.\nScheduled deliveries that have not gone out yet are cancelled too.'
    );
    if (!confirmed) return;
    setBusy('reset');
    const result = await reset();
    setBusy(null);
    reportError(result.success ? undefined : result.error);
  }, [reset, reportError]);

  // ── not signed in ──────────────────────────────────────────────────────────
  if (auth.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F4F6F9' }}>
        <div className="flex items-center gap-3 text-sm text-ink-muted">
          <span className="w-4 h-4 rounded-full border-2 border-navy-700 border-t-transparent animate-spin" />
          Checking your session…
        </div>
      </div>
    );
  }

  if (!auth.user) {
    return <LoginScreen onSignIn={auth.signIn} onSignUp={auth.signUp} error={auth.error} />;
  }

  return (
    <div className="min-h-screen" style={{ background: '#F4F6F9' }}>
      <Header
        connected={connected}
        mode={mode}
        isProcessing={isProcessing}
        isPaused={isPaused}
        accountLabel={auth.profile?.displayName || auth.user.email || 'Signed in'}
        roleLabel={auth.role ? ROLE_LABELS[auth.role] : ''}
        onSignOut={auth.signOut}
      />

      <main className="mx-auto max-w-[1400px] px-3 sm:px-5 py-3 space-y-3">
        {/* Connection banner */}
        {!connected && (
          <div className="notice notice-red" role="status" aria-live="polite">
            <WifiOff className="w-4 h-4 shrink-0 mt-px" />
            <span>
              Dispatcher data source unreachable. Start the Firebase emulators:
              <code className="mono px-1.5 py-0.5 rounded bg-white/60 text-[11.5px]">npm run dev</code>
            </span>
          </div>
        )}

        {/* Error banner */}
        {dispatchError && (
          <div className="notice notice-red" role="alert">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
            <span>{dispatchError}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="toolbar justify-between">
          <div className="tabs" role="tablist" aria-label="Dashboard sections">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'dashboard'}
              className="tab"
              onClick={() => setTab('dashboard')}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              Dashboard
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'scheduled'}
              className="tab"
              onClick={() => setTab('scheduled')}
            >
              <CalendarClock className="w-3.5 h-3.5" />
              Scheduled Emails
              {stats.scheduled > 0 && (
                <span className="badge badge-navy tabular">{stats.scheduled}</span>
              )}
            </button>
          </div>

          {status && (
            <p
              className="hidden md:flex items-center gap-1.5 text-[11.5px] text-ink-muted"
              title={status.scheduler.reason ?? 'The Cloud Tasks queue is configured.'}
            >
              <Server className="w-3.5 h-3.5 shrink-0" />
              Scheduler:{' '}
              <strong
                style={{ color: status.scheduler.configured ? '#16815B' : '#A56B18' }}
              >
                {status.scheduler.configured ? 'Cloud Tasks' : 'Sweep only'}
              </strong>
              {!status.scheduler.configured && status.scheduler.reason && (
                <span className="hidden lg:inline">— {status.scheduler.reason}</span>
              )}
            </p>
          )}
        </div>

        {tab === 'dashboard' ? (
          <>
            {/* Control toolbar */}
            <ControlToolbar
              isProcessing={isProcessing}
              isPaused={isPaused}
              queuedCount={stats.queued}
              dryRun={dryRun}
              busy={busy}
              onStart={handleStart}
              onPause={handlePause}
              onStop={handleStop}
              onReset={handleReset}
            />

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
              {/* ── left column ─────────────────────────────────────────────── */}
              <div className="space-y-3">
                <Panel
                  title="MODULE 1 | EMAIL QUEUE CREATOR"
                  hint="FIFO"
                  actions={
                    <span className="badge badge-slate tabular">{stats.queued} queued</span>
                  }
                >
                  <AddEmailForm
                    onAdd={addEmail}
                    onSendNow={sendNow}
                    onSchedule={scheduleEmail}
                    disabled={isProcessing}
                  />

                  <hr className="my-3 border-hairline-soft" />

                  <QueuePanel
                    emails={emails}
                    currentProcessingId={currentEmail?.id ?? null}
                    onRemove={removeEmail}
                  />

                  <hr className="my-3 border-hairline-soft" />

                  <DemoDataButton disabled={isProcessing} onLoadDemo={loadDemoData} />
                </Panel>

                <Panel title="MODULE 2 + 3 | SIMULATION & RETRY SETTINGS">
                  <SettingsPanel
                    variant="simulation"
                    embedded
                    config={config}
                    onSaveConfig={saveConfig}
                    onTestConnection={testConnection}
                    onTestSend={testSend}
                  />

                  <hr className="my-3 border-hairline-soft" />

                  <RetrySettingsPanel
                    embedded
                    retryLimit={status?.retryLimit ?? config?.retryLimit ?? 3}
                    retryDelayMs={status?.retryDelayMs ?? config?.retryDelayMs ?? 3000}
                    isProcessing={isProcessing}
                    onSave={saveConfig}
                  />
                </Panel>

                {auth.isAdmin && auth.user && <AdminPanel currentUid={auth.user.uid} />}
              </div>

              {/* ── right column ────────────────────────────────────────────── */}
              <div className="space-y-3">
                <Panel
                  title="MODULE 4 | PROCESSING & ACTIVITY"
                  actions={
                    <span className="badge badge-slate tabular">{activityLog.length} events</span>
                  }
                >
                  <ProcessingPanel
                    embedded
                    currentEmail={currentEmail}
                    isProcessing={isProcessing}
                    isPaused={isPaused}
                    queuedCount={stats.queued}
                    canSend={!dryRun}
                  />

                  <hr className="my-3 border-hairline-soft" />

                  <p className="field-label">Processing events</p>
                  <ActivityLog embedded entries={activityLog} />
                </Panel>

                <Panel title="MODULE 5 | SUMMARY EXPORTER">
                  <StatsCards stats={stats} />

                  <hr className="my-3 border-hairline-soft" />

                  <StatsDetails stats={stats} />

                  <hr className="my-3 border-hairline-soft" />

                  <ExportPanel emails={emails} stats={stats} />
                </Panel>

                {auth.isAdmin && auth.user && (
                  <SettingsPanel
                    variant="transport"
                    config={config}
                    onSaveConfig={saveConfig}
                    onTestConnection={testConnection}
                    onTestSend={testSend}
                  />
                )}
              </div>
            </div>
          </>
        ) : (
          /* ── Module 6 — Scheduled Emails ──────────────────────────────── */
          <div className="space-y-3">
            <ScheduledEmailsPanel
              emails={emails}
              loading={!connected}
              error={connected ? null : 'The backend is unreachable.'}
              onCancel={cancelEmail}
              onReschedule={rescheduleEmail}
              onRunDue={runSweep}
            />
          </div>
        )}
      </main>
    </div>
  );
}
