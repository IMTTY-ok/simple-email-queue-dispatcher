import { useRef, useState } from 'react';
import {
  Paperclip,
  FileText,
  FileSpreadsheet,
  Presentation,
  FileImage,
  Film,
  File,
  X,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import type { AttachmentRules } from '../../../shared/types/email';
import type { AttachmentItem } from '../hooks/useAttachments';
import { formatBytes, kindOf } from '../utils/attachments';

/**
 * Module 1 — Email Queue Creator: the attachment picker.
 *
 * The composer lets the user attach the files that are on their machine:
 * PDF and Office documents, spreadsheets, presentations, images and video.
 *
 * The picker is a real file input under a drop zone, so it works with the
 * keyboard and with the file dialog; dragging a file onto the zone is an
 * extra, never the only way in.
 */

interface AttachmentPickerProps {
  rules: AttachmentRules | null;
  rulesError: string | null;
  items: AttachmentItem[];
  uploading: boolean;
  totalBytes: number;
  disabled?: boolean;
  onAddFiles: (files: FileList | File[]) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

/** The icon that matches the kind of file. */
function iconFor(name: string) {
  switch (kindOf(name)) {
    case 'document':
      return <FileText className="w-3.5 h-3.5" />;
    case 'spreadsheet':
      return <FileSpreadsheet className="w-3.5 h-3.5" />;
    case 'presentation':
      return <Presentation className="w-3.5 h-3.5" />;
    case 'image':
      return <FileImage className="w-3.5 h-3.5" />;
    case 'video':
      return <Film className="w-3.5 h-3.5" />;
    default:
      return <File className="w-3.5 h-3.5" />;
  }
}

export function AttachmentPicker({
  rules,
  rulesError,
  items,
  uploading,
  totalBytes,
  disabled,
  onAddFiles,
  onRemove,
  onClear,
}: AttachmentPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const accept = rules
    ? [
        ...rules.extensions.map((ext) => `.${ext}`),
        ...Object.values(rules.contentTypes),
      ].join(',')
    : undefined;

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddFiles(e.target.files);
    }
    // Let the same file be picked again after it was removed.
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    if (e.dataTransfer?.files?.length) onAddFiles(e.dataTransfer.files);
  };

  const maxLabel = rules ? Math.round(rules.maxTotalBytes / (1024 * 1024)) : 0;
  const countLabel = rules ? rules.maxCount : 0;
  const readyCount = items.filter((i) => !i.error).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="field-label mb-0" id="attachments-label">
          Attachments
        </p>
        {items.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            className="btn btn-ghost btn-sm"
            title="Remove every attachment"
          >
            <X className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>

      {/* The file input — a real control, so the keyboard and the file dialog
          both work. The label below is what the user sees. */}
      <input
        ref={inputRef}
        id="attachment-input"
        type="file"
        multiple
        accept={accept}
        disabled={disabled || !rules}
        onChange={handleInput}
        className="hidden"
        aria-describedby="attachments-hint"
      />
      <label
        htmlFor="attachment-input"
        className={`dropzone ${dragging ? 'dropzone-active' : ''} ${disabled || !rules ? 'dropzone-disabled' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && rules) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <Paperclip className="w-4 h-4 shrink-0 text-ink-faint" />
        <span className="text-[12.5px] font-semibold text-navy-900">
          {rules ? 'Attach files' : 'Loading the attachment rules…'}
        </span>
        <span className="text-[11px] text-ink-faint">
          {rules
            ? `PDF, Word, Excel, PowerPoint, images and video · up to ${countLabel} files · ${maxLabel} MB in total`
            : 'or drop them here'}
        </span>
      </label>

      {rulesError && (
        <p className="field-error" role="alert">
          {rulesError}
        </p>
      )}

      {items.length > 0 && (
        <ul className="attachment-list" aria-label="Attached files" aria-busy={uploading}>
          {items.map((item) => (
            <li key={item.id} className="attachment-row animate-fade-up">
              <span className="attachment-icon" aria-hidden="true">
                {iconFor(item.file.name)}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-ink truncate" title={item.file.name}>
                  {item.file.name}
                </p>
                {item.error ? (
                  <p className="text-[11px] flex items-center gap-1" style={{ color: '#B24545' }}>
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    <span className="truncate">{item.error}</span>
                  </p>
                ) : item.attachment ? (
                  <p className="text-[11px] text-ink-faint">
                    {formatBytes(item.file.size)} · uploaded
                  </p>
                ) : (
                  <>
                    <p className="text-[11px] text-ink-faint flex items-center gap-1">
                    <Loader2 className="w-3 h-3 shrink-0 animate-spin-smooth" />
                    Uploading… {item.progress}%
                    </p>
                    <div className="attachment-progress" aria-hidden="true">
                      <div
                        className="attachment-progress-bar"
                        style={{ transform: `scaleX(${Math.max(item.progress, 0.04)})` }}
                      />
                    </div>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => onRemove(item.id)}
                disabled={disabled}
                className="btn btn-ghost btn-sm"
                style={{ color: '#B24545' }}
                aria-label={`Remove ${item.file.name}`}
                title={`Remove ${item.file.name}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <p className="text-[11px] text-ink-faint" id="attachments-hint">
          {readyCount} {readyCount === 1 ? 'file' : 'files'} · {formatBytes(totalBytes)} · the files
          are removed from storage once the email has been delivered.
        </p>
      )}
    </div>
  );
}
