import { useCallback, useState } from 'react';
import { api, errMessage } from '../../../shared/api/client';
import type { ServerConfig, SimulationMode } from '../../../shared/types/email';

/**
 * Module 2 — Send Simulator (client side).
 *
 * Configures the transport and verifies it: host / port / credentials,
 * dry-run mode, the simulation mode, and the two connection tests.
 */

/** A configuration patch sent to the server. */
export interface ConfigPatch {
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
}

/** The result of verifying the SMTP connection. */
export interface VerifyResult {
  ok: boolean;
  error?: string;
  note?: string;
  mode?: string;
}

/** The result of saving the configuration. */
export interface SaveConfigResult {
  success: boolean;
  error?: string;
  changed?: string[];
  verify?: VerifyResult;
}

/**
 * Actions for reading and writing the transport configuration.
 */
export function useSimulatorConfig(onConfigChange: (config: ServerConfig) => void) {
  const [busy, setBusy] = useState<string | null>(null);

  const saveConfig = useCallback(async (patch: ConfigPatch): Promise<SaveConfigResult> => {
    try {
      const data = await api<{
        ok: boolean;
        changed: string[];
        config: ServerConfig;
        verify?: VerifyResult;
      }>('/api/config', { method: 'POST', body: JSON.stringify(patch) });
      onConfigChange(data.config);
      return { success: true, changed: data.changed, verify: data.verify };
    } catch (err) {
      return { success: false, error: errMessage(err) };
    }
  }, [onConfigChange]);

  const testConnection = useCallback(async (): Promise<{ success: boolean; error?: string; note?: string }> => {
    try {
      const data = await api<VerifyResult>('/api/config/test', { method: 'POST' });
      return data.ok
        ? { success: true, note: data.note }
        : { success: false, error: data.error };
    } catch (err) {
      return { success: false, error: errMessage(err) };
    }
  }, []);

  const testSend = useCallback(async (to: string): Promise<{ success: boolean; error?: string; smtp?: { accepted: string[]; rejected: string[]; response: string } }> => {
    try {
      const data = await api<{
        ok: boolean;
        step: string;
        error?: string;
        smtp?: { accepted: string[]; rejected: string[]; response: string };
      }>('/api/config/test-send', { method: 'POST', body: JSON.stringify({ to }) });
      if (!data.ok) return { success: false, error: data.error || 'Send failed.' };
      return { success: true, smtp: data.smtp };
    } catch (err) {
      return { success: false, error: errMessage(err) };
    }
  }, []);

  return { saveConfig, testConnection, testSend, busy, setBusy };
}
