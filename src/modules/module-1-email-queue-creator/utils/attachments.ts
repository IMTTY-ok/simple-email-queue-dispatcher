/**
 * Module 1 — Email Queue Creator: attachment helpers.
 *
 * The small pure functions the composer needs: what a file is called, what
 * kind of file it is, and how big it is in words.
 *
 * The server owns the rules (which types are allowed, how large a file may
 * be) — these helpers only describe and format.
 */

/** The kinds of file the composer knows how to label. */
export type AttachmentKind =
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'image'
  | 'video'
  | 'file';

/** The lower-case extension of a file name, or `''` when it has none. */
export function extensionOf(name: string): string {
  const value = String(name || '');
  const dot = value.lastIndexOf('.');
  if (dot <= 0 || dot === value.length - 1) return '';
  return value.slice(dot + 1).toLowerCase();
}

/**
 * A file name that is safe to store and to put in a mail header: no path
 * separators, no control characters, nothing that could break out of the
 * `Content-Disposition` parameter.
 */
export function safeFileName(name: string): string {
  const base = String(name || '').split(/[\\/]/).pop() || 'file';
  const cleaned = Array.from(base)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      // Control characters would break the mail header.
      return code >= 32 && code !== 127;
    })
    .join('')
    .replace(/["\\]/g, '_')
    .trim();
  return cleaned.slice(0, 180) || 'file';
}

/**
 * The kind of a file, from its extension.
 *
 * The groups mirror what the user asked for: documents, spreadsheets,
 * presentations, images and video.
 */
export function kindOf(name: string): AttachmentKind {
  const ext = extensionOf(name);
  if (['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt'].includes(ext)) return 'document';
  if (['xls', 'xlsx', 'ods', 'csv'].includes(ext)) return 'spreadsheet';
  if (['ppt', 'pptx', 'odp'].includes(ext)) return 'presentation';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'heic', 'avif'].includes(ext)) {
    return 'image';
  }
  if (['mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi', 'mpg', 'mpeg', '3gp', 'wmv'].includes(ext)) {
    return 'video';
  }
  return 'file';
}

/** A file size in words — "1.4 MB", "812 KB". */
export function formatBytes(bytes: number): string {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value >= 1024 * 1024) return `${Math.round((value / (1024 * 1024)) * 10) / 10} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

/**
 * A short, unique id for one file in the list.
 *
 * `crypto.randomUUID` needs a secure context; the fallback keeps the
 * composer working when it is not available.
 */
export function randomId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
