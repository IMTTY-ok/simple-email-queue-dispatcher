import { useState } from 'react';
import {
  PlusCircle,
  X,
  CheckCircle,
  AlertCircle,
  AtSign,
  Type,
  MessageSquare,
  User,
  Send,
  CalendarClock,
  Loader2,
} from 'lucide-react';
import type { Attachment, EmailFormData, ScheduleResult } from '../../../shared/types/email';
import { SchedulePanel } from '../../module-6-scheduled-delivery/components/SchedulePanel';
import { useAttachments } from '../hooks/useAttachments';
import { AttachmentPicker } from './AttachmentPicker';

interface AddEmailFormProps {
  onAdd: (form: EmailFormData) => Promise<{ success: boolean; error?: string; emailId?: string; position?: number }>;
  /** Queue the email and start the dispatcher right away. */
  onSendNow: (form: EmailFormData) => Promise<{ success: boolean; error?: string; emailId?: string }>;
  /** Save the email as a scheduled delivery. */
  onSchedule: (
    form: EmailFormData,
    scheduledAt: string,
    timezone: string
  ) => Promise<ScheduleResult>;
  disabled?: boolean;
}

const EMPTY_FORM: EmailFormData = { recipient: '', subject: '', message: '', senderName: '' };

interface FieldProps {
  id: keyof EmailFormData;
  label: string;
  required?: boolean;
  icon: React.ReactNode;
  type?: string;
  placeholder?: string;
  rows?: number;
  value: string;
  error: string | null;
  disabled?: boolean;
  onChange: (val: string) => void;
  onBlur: () => void;
}

function Field({ id, label, required, icon, type, placeholder, rows, value, error, disabled, onChange, onBlur }: FieldProps) {
  const className = `input ${error ? 'input-invalid' : ''}`;
  const describedBy = error ? `${String(id)}-error` : undefined;

  return (
    <div>
      <label htmlFor={String(id)} className="field-label flex items-center gap-1.5">
        <span className="text-ink-faint">{icon}</span>
        {label}
        {required && <span style={{ color: '#B24545' }}>*</span>}
      </label>
      {rows ? (
        <textarea
          id={String(id)}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${className} resize-none`}
        />
      ) : (
        <input
          id={String(id)}
          type={type ?? 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={className}
        />
      )}
      {error && (
        <p id={`${String(id)}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Module 1 — Email Queue Creator.
 *
 * The composer writes an email into the queue. Three ways out:
 *
 *   • **ADD TO QUEUE** — the email waits in the FIFO queue.
 *   • **SEND NOW** — the email is queued and the dispatcher starts at once.
 *   • **SCHEDULE FOR LATER** — the email is saved as a scheduled delivery and
 *     the server sends it at the chosen moment (Module 6).
 */
export function AddEmailForm({ onAdd, onSendNow, onSchedule, disabled }: AddEmailFormProps) {
  const [form, setForm] = useState<EmailFormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    emailId?: string;
    position?: number;
  } | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const attachments = useAttachments();

  const isDisabled = disabled || submitting !== null;

  const handleChange = (field: keyof EmailFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (feedback) setFeedback(null);
  };

  const getError = (field: keyof EmailFormData): string | null => {
    if (!touched[field]) return null;
    if (field === 'recipient') {
      if (!form.recipient.trim()) return 'Recipient email is required.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.recipient.trim())) return 'Please enter a valid email address.';
    }
    if (field === 'subject' && !form.subject.trim()) return 'Subject is required.';
    if (field === 'message' && !form.message.trim()) return 'Message is required.';
    return null;
  };

  /** Validate the whole form and return the first problem, or `null`. */
  const validateForm = (): string | null => {
    setTouched({ recipient: true, subject: true, message: true });
    if (!form.recipient.trim()) return 'Recipient email is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.recipient.trim())) {
      return 'Please enter a valid email address.';
    }
    if (!form.subject.trim()) return 'Subject is required.';
    if (!form.message.trim()) return 'Message is required.';
    return null;
  };

  /** Empty the form. The feedback is kept unless the caller says otherwise. */
  const resetForm = (clearFeedback = true, discardAttachments = false) => {
    setForm(EMPTY_FORM);
    if (clearFeedback) setFeedback(null);
    setTouched({});
    // The files that travelled with a delivered email must stay in storage;
    // the ones the user threw away must not.
    if (discardAttachments) attachments.clear();
    else attachments.reset();
  };

  /**
   * Wait for the attachment uploads and hand back the descriptors.
   *
   * Returns `null` when a file could not be attached — the email is not
   * created in that case, because a message that silently loses a file is
   * worse than one that was not sent.
   */
  const prepareAttachments = async (): Promise<Attachment[] | null> => {
    const { attachments: files, errors } = await attachments.whenReady();
    if (errors.length > 0) {
      setFeedback({
        type: 'error',
        message: `${errors.length} file(s) could not be attached. Remove them and try again.`,
      });
      return null;
    }
    return files;
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateForm();
    if (problem) {
      setFeedback({ type: 'error', message: problem });
      return;
    }
    setSubmitting('add');
    const files = await prepareAttachments();
    if (!files) {
      setSubmitting(null);
      return;
    }
    const result = await onAdd({ ...form, attachments: files });
    setSubmitting(null);
    if (result.success) {
      resetForm(false);
      setFeedback({ type: 'success', message: 'Email added to the queue', emailId: result.emailId, position: result.position });
    } else {
      // The files stay: the user only has to fix the form and try again.
      setFeedback({ type: 'error', message: result.error ?? 'Failed to add email.' });
    }
  };

  const handleSendNow = async () => {
    const problem = validateForm();
    if (problem) {
      setFeedback({ type: 'error', message: problem });
      return;
    }
    setSubmitting('send');
    const files = await prepareAttachments();
    if (!files) {
      setSubmitting(null);
      return;
    }
    const result = await onSendNow({ ...form, attachments: files });
    setSubmitting(null);
    if (result.success) {
      resetForm(false);
      setFeedback({ type: 'success', message: 'Email queued and the dispatcher started', emailId: result.emailId });
    } else {
      setFeedback({ type: 'error', message: result.error ?? 'Failed to send email.' });
    }
  };

  const handleSchedule = async (
    scheduledForm: EmailFormData,
    scheduledAt: string,
    timezone: string
  ): Promise<ScheduleResult> => {
    setSubmitting('schedule');
    const files = await prepareAttachments();
    if (!files) {
      setSubmitting(null);
      return { success: false, error: 'The attachments could not be prepared.' };
    }
    const result = await onSchedule({ ...scheduledForm, attachments: files }, scheduledAt, timezone);
    setSubmitting(null);
    if (result.success) {
      // The scheduling panel stays open — it shows the confirmation of what
      // was saved. The composer itself is emptied.
      resetForm(false);
    }
    return result;
  };

  return (
    <div className="space-y-3">
      {/* Feedback */}
      {feedback && (
        <div
          className={`notice ${feedback.type === 'success' ? 'notice-green' : 'notice-red'} animate-fade-up`}
          role="status"
          aria-live="polite"
        >
          {feedback.type === 'success' ? (
            <CheckCircle className="w-4 h-4 shrink-0 mt-px" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
          )}
          <div>
            <p className="font-semibold">{feedback.message}</p>
            {feedback.type === 'success' && feedback.emailId && (
              <p className="mt-0.5 text-[11.5px]">
                ID: <strong className="mono">{feedback.emailId}</strong>
                {feedback.position !== undefined && (
                  <>
                    {' '}· Position: <strong className="mono">#{feedback.position}</strong>
                  </>
                )}
              </p>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleAdd} noValidate className="space-y-3">
        <Field
          id="recipient" label="Recipient" required
          icon={<AtSign size={11} />}
          type="email" placeholder="student@example.com"
          value={form.recipient} error={getError('recipient')}
          disabled={isDisabled}
          onChange={(v) => handleChange('recipient', v)}
          onBlur={() => setTouched((p) => ({ ...p, recipient: true }))}
        />
        <Field
          id="subject" label="Subject" required
          icon={<Type size={11} />}
          placeholder="Project Update"
          value={form.subject} error={getError('subject')}
          disabled={isDisabled}
          onChange={(v) => handleChange('subject', v)}
          onBlur={() => setTouched((p) => ({ ...p, subject: true }))}
        />
        <Field
          id="message" label="Message" required rows={4}
          icon={<MessageSquare size={11} />}
          placeholder="Please check the latest project status."
          value={form.message} error={getError('message')}
          disabled={isDisabled}
          onChange={(v) => handleChange('message', v)}
          onBlur={() => setTouched((p) => ({ ...p, message: true }))}
        />

        {/* The files that travel with the message. */}
        <AttachmentPicker
          rules={attachments.rules}
          rulesError={attachments.rulesError}
          items={attachments.items}
          uploading={attachments.uploading}
          totalBytes={attachments.totalBytes}
          disabled={isDisabled}
          onAddFiles={attachments.addFiles}
          onRemove={attachments.removeItem}
          onClear={attachments.clear}
        />

        <Field
          id="senderName" label="Sender name"
          icon={<User size={11} />}
          placeholder="Your name (optional)"
          value={form.senderName} error={null}
          disabled={isDisabled}
          onChange={(v) => handleChange('senderName', v)}
          onBlur={() => {}}
        />

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="submit"
            disabled={isDisabled}
            className="btn btn-navy"
            title="Add the email to the FIFO queue"
          >
            {submitting === 'add' ? (
              <Loader2 className="w-4 h-4 animate-spin-smooth" />
            ) : (
              <PlusCircle className="w-4 h-4" />
            )}
            Add to Queue
          </button>

          <button
            type="button"
            onClick={handleSendNow}
            disabled={isDisabled}
            className="btn btn-primary"
            title="Queue the email and start the dispatcher immediately"
          >
            {submitting === 'send' ? (
              <Loader2 className="w-4 h-4 animate-spin-smooth" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Send Now
          </button>

          <button
            type="button"
            onClick={() => setScheduleOpen((open) => !open)}
            disabled={isDisabled}
            className="btn btn-ghost"
            aria-expanded={scheduleOpen}
            title="Save the email as a scheduled delivery"
          >
            <CalendarClock className="w-4 h-4" />
            Schedule for Later
          </button>

          <button
            type="button"
            onClick={() => resetForm(true, true)}
            disabled={isDisabled}
            className="btn btn-ghost"
            aria-label="Clear the form"
            title="Clear the form"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </form>

      {scheduleOpen && (
        <SchedulePanel
          form={form}
          validateForm={validateForm}
          onSchedule={handleSchedule}
          onCancel={() => setScheduleOpen(false)}
          disabled={isDisabled}
        />
      )}
    </div>
  );
}
