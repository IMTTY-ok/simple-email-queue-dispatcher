import { useCallback } from 'react';
import { api, errMessage } from '../../../shared/api/client';
import { DEMO_EMAILS } from '../../../shared/constants';
import type { Email, EmailFormData } from '../../../shared/types/email';

/**
 * Module 1 — Email Queue Creator (client side).
 *
 * Creates email tasks and puts them at the rear of the FIFO queue.
 */

/** The result of adding one email to the queue. */
export interface AddEmailResult {
  success: boolean;
  error?: string;
  emailId?: string;
  position?: number;
}

/** The result of loading the demo data set. */
export interface DemoDataResult {
  success: boolean;
  error?: string;
  count?: number;
}

/**
 * Actions for creating and removing queued emails.
 */
export function useQueueActions() {
  const addEmail = useCallback(async (form: EmailFormData): Promise<AddEmailResult> => {
    try {
      const data = await api<{ ok: boolean; email: Email; position: number }>('/api/emails', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      return { success: true, emailId: data.email.id, position: data.position };
    } catch (err) {
      return { success: false, error: errMessage(err) };
    }
  }, []);

  const removeEmail = useCallback(async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await api(`/api/emails/${id}`, { method: 'DELETE' });
      return { success: true };
    } catch (err) {
      return { success: false, error: errMessage(err) };
    }
  }, []);

  const loadDemoData = useCallback(async (): Promise<DemoDataResult> => {
    try {
      const data = await api<{ count: number }>('/api/emails/batch', {
        method: 'POST',
        body: JSON.stringify({ items: DEMO_EMAILS }),
      });
      return { success: true, count: data.count };
    } catch (err) {
      return { success: false, error: errMessage(err) };
    }
  }, []);

  return { addEmail, removeEmail, loadDemoData };
}
