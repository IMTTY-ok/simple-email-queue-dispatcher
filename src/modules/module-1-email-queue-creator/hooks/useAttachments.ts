import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteObject, ref, uploadBytesResumable } from 'firebase/storage';
import { auth, getAttachmentStorage } from '../../../shared/lib/firebase';
import { api, errMessage } from '../../../shared/api/client';
import type { Attachment, AttachmentRules } from '../../../shared/types/email';
import { extensionOf, randomId, safeFileName } from '../utils/attachments';

/**
 * Module 1 — Email Queue Creator: attachments (client side).
 *
 * The files never travel through the API. The browser uploads them straight
 * to Cloud Storage, into the signed-in account's own folder, and hands the
 * server a small descriptor per file:
 *
 *   attachments/{uid}/{batch}/{file name}
 *
 * The rules — which types, how many, how large — come from the server, so
 * the composer never offers something the API would refuse. The server
 * validates the request again regardless.
 */

/** One file in the composer's list. */
export interface AttachmentItem {
  /** A stable id for this row. */
  id: string;
  /** The file the user picked. */
  file: File;
  /** 0–100 while the file is being uploaded. */
  progress: number;
  /** The descriptor — set once the file is safely in the bucket. */
  attachment: Attachment | null;
  /** Why this file cannot be used. */
  error: string | null;
}

/** The outcome of adding a batch of files. */
export interface AddFilesResult {
  accepted: number;
  rejected: number;
}

/**
 * Check one file against the server's rules.
 *
 * @returns the reason the file was refused, or `null` when it is fine
 */
function validateFile(
  file: File,
  current: { count: number; total: number },
  rules: AttachmentRules
): string | null {
  const ext = extensionOf(file.name);
  if (!rules.extensions.includes(ext)) {
    return `"${file.name}" is not a file type this dispatcher accepts.`;
  }
  if (file.size <= 0) {
    return `"${file.name}" is empty.`;
  }
  if (file.size > rules.maxFileBytes) {
    return `"${file.name}" is larger than ${Math.round(rules.maxFileBytes / (1024 * 1024))} MB.`;
  }
  if (current.count + 1 > rules.maxCount) {
    return `An email may carry at most ${rules.maxCount} files.`;
  }
  if (current.total + file.size > rules.maxTotalBytes) {
    return `The files of one email may not exceed ${Math.round(rules.maxTotalBytes / (1024 * 1024))} MB.`;
  }
  return null;
}

/**
 * The attachment state of the composer.
 *
 * The hook owns the list, the uploads and the cleanup. A file that is
 * removed — or an email that could not be created — takes its uploaded bytes
 * with it, so nothing is left behind in the bucket.
 */
export function useAttachments() {
  const [rules, setRules] = useState<AttachmentRules | null>(null);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [items, setItems] = useState<AttachmentItem[]>([]);
  const removedIds = useRef<Set<string>>(new Set());
  const pendingRef = useRef<Set<Promise<unknown>>>(new Set());
  const itemsRef = useRef<AttachmentItem[]>(items);
  itemsRef.current = items;

  // The rules are the server's, not the browser's.
  useEffect(() => {
    let cancelled = false;
    api<{ attachments: AttachmentRules }>('/api/attachments/config')
      .then((data) => {
        if (cancelled) return;
        setRules(data.attachments);
        setRulesError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setRulesError(errMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Patch one row of the list. */
  const updateItem = useCallback((id: string, patch: (item: AttachmentItem) => AttachmentItem) => {
    setItems((prev) => prev.map((item) => (item.id === id ? patch(item) : item)));
  }, []);

  /** Delete one uploaded file from the bucket. */
  const deleteUploaded = useCallback(async (attachment: Attachment | null) => {
    if (!attachment || !rules) return;
    try {
      const storage = getAttachmentStorage(rules.bucket);
      await deleteObject(ref(storage, attachment.path));
    } catch (err) {
      // A file that is already gone is not a problem.
      console.warn('[attachments] could not delete an uploaded file:', err);
    }
  }, [rules]);

  /** Upload one file to the bucket and record the descriptor. */
  const upload = useCallback(
    async (item: AttachmentItem) => {
      const uid = auth.currentUser?.uid;
      if (!uid || !rules) {
        updateItem(item.id, (i) => ({ ...i, error: 'Sign in to attach a file.' }));
        return;
      }

      const name = safeFileName(item.file.name);
      const contentType = rules.contentTypes[extensionOf(name)] ?? 'application/octet-stream';
      // One folder per file, so two uploads of the same file never overwrite
      // each other — and the React keys in the queue stay unique.
      const path = `${rules.uploadRoot}/${uid}/${randomId()}/${name}`;

      try {
        const storage = getAttachmentStorage(rules.bucket);
        const task = uploadBytesResumable(ref(storage, path), item.file, { contentType });

        await new Promise<void>((resolve, reject) => {
          task.on(
            'state_changed',
            (snapshot) => {
              const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
              updateItem(item.id, (i) => ({ ...i, progress: percent }));
            },
            (err) => reject(err),
            () => resolve()
          );
        });

        const attachment: Attachment = { name, size: item.file.size, contentType, path };

        // The file may have been removed while it was uploading.
        if (removedIds.current.has(item.id)) {
          removedIds.current.delete(item.id);
          await deleteUploaded(attachment);
          return;
        }

        updateItem(item.id, (i) => ({ ...i, progress: 100, attachment }));
      } catch {
        updateItem(item.id, (i) => ({
          ...i,
          progress: 0,
          error: `"${name}" could not be uploaded.`,
        }));
      }
    },
    [rules, updateItem, deleteUploaded]
  );

  /** Upload one file and record the descriptor. */
  const startUpload = useCallback(
    (item: AttachmentItem) => {
      const promise = upload(item);
      pendingRef.current.add(promise);
      void promise.finally(() => {
        pendingRef.current.delete(promise);
      });
    },
    [upload]
  );

  /** Add the files the user picked. */
  const addFiles = useCallback(
    (list: FileList | File[]): AddFilesResult => {
      if (!rules) return { accepted: 0, rejected: 0 };

      const accepted: AttachmentItem[] = [];
      const rejected: AttachmentItem[] = [];

      let count = items.filter((i) => !i.error).length;
      let total = items.filter((i) => !i.error).reduce((sum, i) => sum + i.file.size, 0);

      for (const file of Array.from(list)) {
        const error = validateFile(file, { count, total }, rules);
        const item: AttachmentItem = { id: randomId(), file, progress: 0, attachment: null, error };
        if (error) {
          rejected.push(item);
          continue;
        }
        count += 1;
        total += file.size;
        accepted.push(item);
      }

      setItems((prev) => [...prev, ...rejected, ...accepted]);
      for (const item of accepted) void startUpload(item);

      return { accepted: accepted.length, rejected: rejected.length };
    },
    [items, rules, startUpload]
  );

  /** Remove one file — and its uploaded bytes. */
  const removeItem = useCallback(
    async (id: string) => {
      const item = items.find((i) => i.id === id);
      if (!item) return;
      removedIds.current.add(id);
      await deleteUploaded(item.attachment);
      setItems((prev) => prev.filter((i) => i.id !== id));
    },
    [items, deleteUploaded]
  );

  /** Remove every file. */
  const clear = useCallback(async () => {
    for (const item of items) removedIds.current.add(item.id);
    await Promise.all(items.map((i) => deleteUploaded(i.attachment)));
    setItems([]);
  }, [items, deleteUploaded]);

  /**
   * Forget the list without touching the uploaded files.
   *
   * Used after the email was created: the files now travel with that email,
   * so they must stay in the bucket. The uploads have all settled by then —
   * the composer waits for them before it creates the email — so no upload
   * can be in flight and no file can be orphaned here.
   */
  const reset = useCallback(() => {
    setItems([]);
  }, []);

  /** The descriptors of the files that are ready to travel. */
  const descriptors = useCallback(
    (): Attachment[] => items.filter((i) => i.attachment).map((i) => i.attachment as Attachment),
    [items]
  );

  /**
   * Wait for the pending uploads and hand back the descriptors.
   *
   * The composer calls this before it creates the email: a file that is
   * still uploading must not be left out of the message, and a file that
   * failed must not be silently dropped.
   */
  const whenReady = useCallback(async (): Promise<{ attachments: Attachment[]; errors: string[] }> => {
    while (pendingRef.current.size > 0) {
      await Promise.allSettled([...pendingRef.current]);
    }
    const current = itemsRef.current;
    return {
      attachments: current.filter((i) => i.attachment).map((i) => i.attachment as Attachment),
      errors: current.filter((i) => i.error).map((i) => i.error as string),
    };
  }, []);

  /** True while at least one file is still being uploaded. */
  const uploading = items.some((i) => !i.error && !i.attachment);

  /** The total size of the files that are ready. */
  const totalBytes = items
    .filter((i) => !i.error)
    .reduce((sum, i) => sum + i.file.size, 0);

  return {
    rules,
    rulesError,
    items,
    uploading,
    totalBytes,
    addFiles,
    removeItem,
    clear,
    reset,
    descriptors,
    whenReady,
  };
}
