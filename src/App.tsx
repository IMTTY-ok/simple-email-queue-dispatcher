import { useState, useCallback } from 'react';
import { useEmailQueue } from './hooks/useEmailQueue';
import { Header } from './components/Header';
import { StatsCards } from './components/StatsCards';
import { AddEmailForm } from './components/AddEmailForm';
import { QueuePanel } from './components/QueuePanel';
import { ProcessingPanel } from './components/ProcessingPanel';
import { ActivityLog } from './components/ActivityLog';
import { SimulationControls } from './components/SimulationControls';
import { ExportPanel } from './components/ExportPanel';
import { computeStats } from './utils/queue';
import { AlertTriangle } from 'lucide-react';

export default function App() {
  const {
    state,
    addEmail,
    loadDemoData,
    startProcessing,
    pause,
    reset,
    setSimulationMode,
    setRetryLimit,
    setProcessingSpeed,
  } = useEmailQueue();

  const [startError, setStartError] = useState<string | null>(null);

  const stats = computeStats(state.emails);

  const currentEmail = state.currentProcessingId
    ? state.emails.find((e) => e.id === state.currentProcessingId) ?? null
    : null;

  const handleStart = useCallback(() => {
    setStartError(null);
    const result = startProcessing();
    if (!result.success && result.error) {
      setStartError(result.error);
      setTimeout(() => setStartError(null), 4000);
    }
  }, [startProcessing]);

  const handleReset = useCallback(() => {
    if (state.isProcessing && !state.isPaused) {
      if (!window.confirm('Processing is currently active.\nAre you sure you want to reset?')) return;
    }
    reset();
  }, [state.isProcessing, state.isPaused, reset]);

  const pendingCount = state.emails.filter((e) => e.status === 'PENDING').length;

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
        isProcessing={state.isProcessing}
        isPaused={state.isPaused}
        onStart={handleStart}
        onPause={pause}
        onReset={handleReset}
      />

      <main className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">

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

        {/* Stats row */}
        <StatsCards stats={stats} />

        {/* Queue + Processing */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ minHeight: '420px' }}>
          <QueuePanel
            emails={state.emails}
            currentProcessingId={state.currentProcessingId}
          />
          <ProcessingPanel
            currentEmail={currentEmail}
            isProcessing={state.isProcessing}
            isPaused={state.isPaused}
            pendingCount={pendingCount}
            retryLimit={state.retryLimit}
          />
        </div>

        {/* Bottom: Controls + Form | Log | Export */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="space-y-4">
            <SimulationControls
              mode={state.simulationMode}
              retryLimit={state.retryLimit}
              speed={state.processingSpeed}
              onModeChange={setSimulationMode}
              onRetryLimitChange={setRetryLimit}
              onSpeedChange={setProcessingSpeed}
              onLoadDemo={loadDemoData}
              isProcessing={state.isProcessing && !state.isPaused}
            />
            <AddEmailForm onAdd={addEmail} />
          </div>

          <div style={{ minHeight: '500px', maxHeight: '640px' }} className="flex flex-col">
            <ActivityLog entries={state.activityLog} />
          </div>

          <div>
            <ExportPanel emails={state.emails} stats={stats} />
          </div>
        </div>
      </main>
    </div>
  );
}
