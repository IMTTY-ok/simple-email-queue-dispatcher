import { useState } from 'react';
import { PlusCircle, X, CheckCircle, AlertCircle, AtSign, Type, MessageSquare, User } from 'lucide-react';
import type { EmailFormData } from '../types/email';

interface AddEmailFormProps {
  onAdd: (form: EmailFormData) => { success: boolean; error?: string; emailId?: string; position?: number };
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
  const baseClass = `input-field w-full rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none disabled:opacity-50 transition-all`;
  const style = {
    background: 'rgba(255,255,255,0.04)',
    border: error ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.08)',
  };

  return (
    <div>
      <label htmlFor={String(id)} className="flex items-center gap-1.5 text-xs text-gray-500 mb-1.5 font-medium">
        <span className="text-gray-700">{icon}</span>
        {label}
        {required && <span className="text-red-500">*</span>}
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
          className={`${baseClass} resize-none`}
          style={style}
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
          className={baseClass}
          style={style}
        />
      )}
      {error && (
        <p className="text-xs mt-1 animate-fade-up" style={{ color: '#f87171' }}>{error}</p>
      )}
    </div>
  );
}

export function AddEmailForm({ onAdd, disabled }: AddEmailFormProps) {
  const [form, setForm] = useState<EmailFormData>(EMPTY_FORM);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    emailId?: string;
    position?: number;
  } | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ recipient: true, subject: true, message: true });
    const result = onAdd(form);
    if (result.success) {
      setFeedback({ type: 'success', message: 'Email added to queue', emailId: result.emailId, position: result.position });
      setForm(EMPTY_FORM);
      setTouched({});
    } else {
      setFeedback({ type: 'error', message: result.error ?? 'Failed to add email.' });
    }
  };

  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: 'linear-gradient(160deg, rgba(14,18,28,0.95) 0%, rgba(8,11,18,0.98) 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <h2 className="text-xs font-bold text-gray-300 uppercase tracking-widest mb-4 flex items-center gap-2">
        <PlusCircle className="w-3.5 h-3.5 text-blue-400" />
        Add Email to Queue
      </h2>

      {/* Feedback */}
      {feedback && (
        <div
          className="mb-4 p-3 rounded-xl flex items-start gap-2.5 animate-fade-up"
          style={
            feedback.type === 'success'
              ? { background: 'rgba(5,46,22,0.6)', border: '1px solid rgba(52,211,153,0.25)' }
              : { background: 'rgba(69,10,10,0.6)', border: '1px solid rgba(248,113,113,0.25)' }
          }
        >
          {feedback.type === 'success'
            ? <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#34d399' }} />
            : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#f87171' }} />
          }
          <div>
            <p className="text-sm font-semibold" style={{ color: feedback.type === 'success' ? '#6ee7b7' : '#fca5a5' }}>
              {feedback.message}
            </p>
            {feedback.type === 'success' && (
              <p className="text-xs mt-0.5" style={{ color: '#4ade80' }}>
                ID: <strong>{feedback.emailId}</strong> &bull; Position: <strong>#{feedback.position}</strong>
              </p>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-3">
        <Field
          id="recipient" label="Recipient Email" required
          icon={<AtSign size={12} />}
          type="email" placeholder="student@example.com"
          value={form.recipient} error={getError('recipient')}
          disabled={disabled}
          onChange={(v) => handleChange('recipient', v)}
          onBlur={() => setTouched((p) => ({ ...p, recipient: true }))}
        />
        <Field
          id="subject" label="Subject" required
          icon={<Type size={12} />}
          placeholder="Assignment Submission"
          value={form.subject} error={getError('subject')}
          disabled={disabled}
          onChange={(v) => handleChange('subject', v)}
          onBlur={() => setTouched((p) => ({ ...p, subject: true }))}
        />
        <Field
          id="message" label="Message" required rows={3}
          icon={<MessageSquare size={12} />}
          placeholder="Your message content…"
          value={form.message} error={getError('message')}
          disabled={disabled}
          onChange={(v) => handleChange('message', v)}
          onBlur={() => setTouched((p) => ({ ...p, message: true }))}
        />
        <Field
          id="senderName" label="Sender Name"
          icon={<User size={12} />}
          placeholder="Your Name (optional)"
          value={form.senderName} error={null}
          disabled={disabled}
          onChange={(v) => handleChange('senderName', v)}
          onBlur={() => {}}
        />

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={disabled}
            className="btn flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #2563eb, #4f46e5)' }}
          >
            <PlusCircle className="w-4 h-4" />
            Add to Queue
          </button>
          <button
            type="button"
            onClick={() => { setForm(EMPTY_FORM); setFeedback(null); setTouched({}); }}
            disabled={disabled}
            className="btn px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#6b7280',
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
