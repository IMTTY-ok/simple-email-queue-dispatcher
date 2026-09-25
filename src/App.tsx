import { useState, useCallback } from 'react';
import { useEmailDispatcher } from './hooks/useEmailDispatcher';
import { Header } from './components/Header';
import { StatsCards } from './components/StatsCards';
import { AddEmailForm } from './components/AddEmailForm';
import { QueuePanel } from './components/QueuePanel';
import { ProcessingPanel } from './components/ProcessingPanel';
import { ActivityLog } from './components/ActivityLog';
import { SettingsPanel } from './components/SettingsPanel';
import { ExportPanel } from './components/ExportPanel';
import { AlertTriangle, WifiOff, FlaskConical, Send } from 'lucide-react';

export default function App() {
  const {
    state,
    currentEmail,
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
  } = useEmailDispatcher();

  const [startError, setStartError] = useState<string | null>(null);

  const { stats, emails, activityLog, dispatcher, config, connected } = state;
  const isProcessing = dispatcher.running && !dispatcher.paused;
  const isPaused = dispatcher.paused;
  const dryRun = Boolean(config?.dryRun);

  const handleStart = useCallback(async () => {
    setStartError(null);
    const result = isPaused ? await resume() : await start();
    if (!result.success && result.error) {
      setStartError(result.error);
      setTimeout(() => setStartError(null), 5000);
    }
  }, [isPaused, resume, start]);

  const handlePause = useCallback(async () => {
    await pause();
  }, [pause]);

  const handleReset = useCallback(async () => {
    if (dispatcher.running && !dispatcher.paused) {
      if (!window.confirm('Dispatch is currently live.\nAre you sure you want to reset?')) return;
    }
    await reset();
  }, [dispatcher.running, dispatcher.paused, reset]);

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
        onStart={handleStart}
        onPause={handlePause}
        onReset={handleReset}
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
          >
            <WifiOff className="w-4 h-4 shrink-0" style={{ color: '#f87171' }} />
            Dispatcher server unreachable. Run the API first:
            <code className="px-1.5 py-0.5 rounded bg-black/30 text-xs font-mono">npm run dev:server</code>
          </div>
        )}

        {/* Error banner */}
        {startError && (
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium animate-fade-up"
            style={{
              background: 'rgba(120,53,15,0.35)',
              border: '1px solid rgba(217,119,6,0.35)',
              color: '#fcd34d',
            }}
          >
            <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: '#fbbf24' }} />
            {startError}
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
          >
            {dryRun
              ? <FlaskConical className="w-4 h-4 shrink-0" />
              : <Send className="w-4 h-4 shrink-0" />
            }
            {dryRun
              ? 'DRY-RUN — delivery is simulated (no real emails). Click SMTP Dispatcher Settings to configure real sending.'
              : config?.smtpConfigured
                ? `LIVE — emails are sent for real via SMTP to ${config.smtp.host}:${config.smtp.port}.`
                : 'SMTP not configured — configure it in SMTP Dispatcher Settings to send real emails.'}
          </div>
        )}

        {/* Stats row */}
        <StatsCards stats={stats} />

        {/* Queue + Processing */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ minHeight: '420px' }}>
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
            <SettingsPanel
              config={config}
              isProcessing={isProcessing}
              onSaveConfig={saveConfig}
              onTestConnection={testConnection}
              onTestSend={testSend}
              onLoadDemo={loadDemoData}
            />
            <AddEmailForm onAdd={addEmail} disabled={isProcessing} />
          </div>

          <div style={{ minHeight: '500px', maxHeight: '640px' }} className="flex flex-col">
            <ActivityLog entries={activityLog} />
          </div>

          <div>
            <ExportPanel emails={emails} stats={stats} />
          </div>
        </div>
      </main>
    </div>
  );
}