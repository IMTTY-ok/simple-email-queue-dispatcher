'use strict';

/**
 * Module 1 — Email Queue Creator: attachments
 * ===========================================
 *
 * An email may carry files: PDF and Office documents, images and videos.
 *
 * The bytes never travel through the API and never live in Firestore — a
 * Firestore document is capped at 1 MiB and a video is far larger than that.
 * They live in Cloud Storage instead:
 *
 *   • the browser uploads straight to the bucket, into the signed-in
 *     account's own folder (`attachments/{uid}/{batch}/{file name}`)
 *   • the API stores only a small descriptor per file on the email document
 *   • the dispatcher downloads the files again when it delivers the email
 *
 * This module owns the rules: which file types are allowed, how large a
 * single file and a whole bundle may be, and where an attachment has to
 * live. The server is the only authority — the browser checks the same rules
 * for a faster answer, but every request is validated again here.
 */

const admin = require('firebase-admin');

/** How many files one email may carry. */
const MAX_ATTACHMENTS = 10;

/**
 * The largest single file — and the largest total for one email (16 MiB).
 *
 * A message is base64-encoded on its way through SMTP, which grows it by a
 * third, so 16 MiB of files stays comfortably below the 25 MB ceiling every
 * major mail server enforces.
 */
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_BYTES = 16 * 1024 * 1024;

/** The folder every attachment lives in. */
const ATTACHMENT_ROOT = 'attachments';

/**
 * The file types an email may carry, keyed by their extension.
 *
 * The extension is the authority, not the MIME type the browser reports:
 * Windows reports all sorts of things for Office files, and a MIME type can
 * be forged. The server derives the outgoing content type from this table.
 */
const CONTENT_TYPES = {
  // Documents
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  rtf: 'application/rtf',
  txt: 'text/plain',
  // Spreadsheets
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  csv: 'text/csv',
  // Presentations
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odp: 'application/vnd.oasis.opendocument.presentation',
  // Images
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  avif: 'image/avif',
  // Videos
  mp4: 'video/mp4',
  m4v: 'video/x-m4v',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  mpg: 'video/mpeg',
  mpeg: 'video/mpeg',
  '3gp': 'video/3gpp',
  wmv: 'video/x-ms-wmv',
};

/** The extensions the browser is allowed to offer. */
const ALLOWED_EXTENSIONS = Object.keys(CONTENT_TYPES);

/** The longest file name the server keeps. */
const MAX_NAME_LENGTH = 180;

// ── helpers ───────────────────────────────────────────────────────────────────

/** The lower-case extension of a file name, or `''` when it has none. */
function extensionOf(name) {
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
function safeFileName(name) {
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
  return cleaned.slice(0, MAX_NAME_LENGTH) || 'file';
}

/** The content type the server sends a file with. */
function contentTypeFor(name) {
  return CONTENT_TYPES[extensionOf(name)] || 'application/octet-stream';
}

/** True when a file name carries an extension the server accepts. */
function isAllowedType(name) {
  return Object.prototype.hasOwnProperty.call(CONTENT_TYPES, extensionOf(name));
}

/** The folder an account's uploads live in. */
function uploadRoot(uid) {
  return `${ATTACHMENT_ROOT}/${uid}`;
}

/** The full storage path of one uploaded file. */
function uploadPath(uid, batch, name) {
  return `${uploadRoot(uid)}/${batch}/${safeFileName(name)}`;
}

// ── storage ───────────────────────────────────────────────────────────────────

/** The Firebase configuration the runtime handed to this function. */
function firebaseConfig() {
  try {
    return process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG) : {};
  } catch {
    return {};
  }
}

/**
 * The bucket the attachment files live in.
 *
 * The browser is told the same name by `/api/attachments/config`, so the two
 * sides never disagree about which bucket holds the files. `STORAGE_BUCKET`
 * overrides it for a deployment whose bucket is not the project default.
 */
function bucketName() {
  const explicit = String(process.env.STORAGE_BUCKET || '').trim();
  if (explicit) return explicit;
  const config = firebaseConfig();
  if (config.storageBucket) return config.storageBucket;
  const app = admin.apps[0];
  const projectId =
    config.projectId ||
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    (app && app.options && app.options.projectId);
  return projectId ? `${projectId}.appspot.com` : '';
}

let bucketCache = null;

/** The Storage bucket handle. */
function bucket() {
  if (!bucketCache) {
    const name = bucketName();
    if (!name) throw new Error('No Cloud Storage bucket is configured for this deployment.');
    bucketCache = admin.storage().bucket(name);
  }
  return bucketCache;
}

// ── validation ────────────────────────────────────────────────────────────────

/**
 * Validate the attachment descriptors a request carries.
 *
 * @param {unknown} input the `attachments` field of a request body
 * @param {string} uid the uid of the signed-in account
 * @returns {{ ok: true, value: object[] } | { ok: false, error: string }}
 */
function validateAttachments(input, uid) {
  if (input === undefined || input === null) {
    return { ok: true, value: [] };
  }
  if (!Array.isArray(input)) {
    return { ok: false, error: 'Attachments must be sent as a list.' };
  }
  if (input.length === 0) {
    return { ok: true, value: [] };
  }
  if (input.length > MAX_ATTACHMENTS) {
    return { ok: false, error: `An email may carry at most ${MAX_ATTACHMENTS} files.` };
  }

  const owner = String(uid || '');
  const root = `${ATTACHMENT_ROOT}/${owner}/`;
  const value = [];
  let total = 0;

  for (const raw of input) {
    if (!raw || typeof raw !== 'object') {
      return { ok: false, error: 'Each attachment must be an object.' };
    }

    const name = safeFileName(raw.name);
    if (!name) {
      return { ok: false, error: 'Each attachment needs a file name.' };
    }
    if (!isAllowedType(name)) {
      return { ok: false, error: `"${name}" is not an attachment type this dispatcher accepts.` };
    }

    const size = Number(raw.size);
    if (!Number.isFinite(size) || size <= 0) {
      return { ok: false, error: `"${name}" has no readable size.` };
    }
    if (size > MAX_FILE_BYTES) {
      return {
        ok: false,
        error: `"${name}" is larger than ${describeBytes(MAX_FILE_BYTES)}.`,
      };
    }
    total += size;
    if (total > MAX_TOTAL_BYTES) {
      return {
        ok: false,
        error: `The attachments of one email may not exceed ${describeBytes(MAX_TOTAL_BYTES)}.`,
      };
    }

    const path = String(raw.path || '');
    if (!path.startsWith(root) || path.includes('..')) {
      return { ok: false, error: `"${name}" was not uploaded by this account.` };
    }

    value.push({
      name,
      size,
      contentType: contentTypeFor(name),
      path,
    });
  }

  return { ok: true, value };
}

/**
 * Check that every attachment really is in the bucket, and that it is the
 * size the client claimed.
 *
 * The client says how big a file is; the bucket is the truth.
 */
async function assertStored(list) {
  if (!Array.isArray(list) || list.length === 0) return;
  for (const item of list) {
    let meta;
    try {
      [meta] = await bucket().file(item.path).getMetadata();
    } catch {
      const error = new Error(`"${item.name}" is no longer in storage. Attach it again.`);
      error.status = 400;
      throw error;
    }
    const stored = Number(meta.size);
    if (Number.isFinite(stored) && stored !== Number(item.size)) {
      throw new Error(`"${item.name}" changed while it was uploading. Attach it again.`);
    }
  }
}

/**
 * Download the attachment files of one email.
 *
 * @returns {Promise<{filename:string, content:Buffer, contentType:string}[]>}
 *   Nodemailer attachment objects.
 */
async function loadForDelivery(list) {
  if (!Array.isArray(list) || list.length === 0) return [];
  const out = [];
  for (const item of list) {
    const [buffer] = await bucket().file(item.path).download();
    out.push({
      filename: item.name,
      content: buffer,
      contentType: item.contentType || contentTypeFor(item.name),
    });
  }
  return out;
}

/**
 * Delete the attachment files of one email.
 *
 * The bytes are only needed until the email has been delivered. The
 * descriptor stays on the email document, so the queue and the report keep
 * showing what was attached.
 */
async function release(list) {
  if (!Array.isArray(list) || list.length === 0) return;
  await Promise.all(
    list.map(async (item) => {
      try {
        await bucket().file(item.path).delete({ ignoreNotFound: true });
      } catch (err) {
        // A file that is already gone is not a problem — the queue must not
        // fail because of a leftover file.
        console.warn(`[attachments] could not delete "${item.name}":`, err.message);
      }
    })
  );
}

/** The rules the browser needs, in one payload. */
function describe() {
  return {
    bucket: bucketName(),
    maxCount: MAX_ATTACHMENTS,
    maxFileBytes: MAX_FILE_BYTES,
    maxTotalBytes: MAX_TOTAL_BYTES,
    extensions: ALLOWED_EXTENSIONS,
    contentTypes: CONTENT_TYPES,
    uploadRoot: ATTACHMENT_ROOT,
  };
}

/** A human-readable file size. */
function describeBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

module.exports = {
  MAX_ATTACHMENTS,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  MAX_NAME_LENGTH,
  ATTACHMENT_ROOT,
  CONTENT_TYPES,
  ALLOWED_EXTENSIONS,
  extensionOf,
  safeFileName,
  contentTypeFor,
  isAllowedType,
  uploadRoot,
  uploadPath,
  bucketName,
  bucket,
  validateAttachments,
  assertStored,
  loadForDelivery,
  release,
  describe,
  describeBytes,
};
