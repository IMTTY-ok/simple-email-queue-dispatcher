import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_EXTENSIONS,
  MAX_ATTACHMENTS,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  contentTypeFor,
  extensionOf,
  isAllowedType,
  safeFileName,
  validateAttachments,
  describe as describeRules,
} from '../functions/src/modules/module-1-email-queue-creator/attachments.js';

/**
 * Module 1 — Email Queue Creator: attachments.
 *
 * The rules the server applies to the files an email may carry:
 *
 *   • only the file types a mail server accepts (documents, spreadsheets,
 *     presentations, images, video)
 *   • a limit on how many files, how large one file and how large the whole
 *     bundle may be
 *   • a file has to live in the storage folder of the account that attaches
 *     it — nobody can attach somebody else's file
 *   • the content type is derived from the file name, never taken from the
 *     client
 */
const UID = 'uid-1';

/** A descriptor of a file that was uploaded by `uid`. */
function descriptor(name: string, size = 1024, path?: string) {
  return {
    name,
    size,
    path: path ?? `attachments/${UID}/batch-1/${name}`,
  };
}

describe('Module 1 — Email Queue Creator / attachment names', () => {
  it('reads the extension of a file name', () => {
    assert.equal(extensionOf('report.pdf'), 'pdf');
    assert.equal(extensionOf('Quarterly Report.DOCX'), 'docx');
    assert.equal(extensionOf('no-extension'), '');
    assert.equal(extensionOf('trailing.'), '');
  });

  it('keeps only the file name of a path', () => {
    assert.equal(safeFileName('C:\\Users\\Imtiyaz\\Documents\\notes.txt'), 'notes.txt');
    assert.equal(safeFileName('report.pdf'), 'report.pdf');
  });

  it('never lets a quote through', () => {
    assert.equal(safeFileName('a"b.pdf'), 'a_b.pdf');
  });

  it('treats a backslash as a path separator', () => {
    assert.equal(safeFileName('C:\\Users\\Imtiyaz\\report.pdf'), 'report.pdf');
  });

  it('falls back to a usable name', () => {
    assert.equal(safeFileName(''), 'file');
    assert.equal(safeFileName('   '), 'file');
  });
});

describe('Module 1 — Email Queue Creator / attachment types', () => {
  it('accepts the file types a mail server accepts', () => {
    for (const name of [
      'report.pdf',
      'letter.doc',
      'letter.docx',
      'sheet.xlsx',
      'sheet.xls',
      'deck.pptx',
      'deck.ppt',
      'photo.png',
      'photo.jpeg',
      'clip.mp4',
      'clip.mov',
    ]) {
      assert.equal(isAllowedType(name), true, `${name} should be allowed`);
    }
  });

  it('refuses anything else', () => {
    for (const name of ['installer.exe', 'script.sh', 'archive.zip', 'notes', 'page.html']) {
      assert.equal(isAllowedType(name), false, `${name} should be refused`);
    }
  });

  it('derives the content type from the name, not from the client', () => {
    assert.equal(contentTypeFor('report.pdf'), 'application/pdf');
    assert.equal(contentTypeFor('sheet.xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    assert.equal(contentTypeFor('clip.mp4'), 'video/mp4');
    assert.equal(contentTypeFor('mystery.bin'), 'application/octet-stream');
  });

  it('lists every accepted extension', () => {
    assert.ok(ALLOWED_EXTENSIONS.includes('pdf'));
    assert.ok(ALLOWED_EXTENSIONS.includes('docx'));
    assert.ok(ALLOWED_EXTENSIONS.includes('mp4'));
    assert.equal(ALLOWED_EXTENSIONS.includes('exe'), false);
  });
});

describe('Module 1 — Email Queue Creator / attachment validation', () => {
  it('accepts an email without attachments', () => {
    const result = validateAttachments(undefined, UID);
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, []);
  });

  it('accepts a list of files', () => {
    const result = validateAttachments([descriptor('report.pdf'), descriptor('clip.mp4', 2048)], UID);
    assert.equal(result.ok, true);
    assert.equal(result.value.length, 2);
    assert.equal(result.value[0].name, 'report.pdf');
    assert.equal(result.value[0].contentType, 'application/pdf');
    assert.equal(result.value[1].size, 2048);
  });

  it('refuses a file type that is not allowed', () => {
    const result = validateAttachments([descriptor('installer.exe')], UID);
    assert.equal(result.ok, false);
    assert.match(result.error, /not an attachment type/i);
  });

  it('refuses more files than one email may carry', () => {
    const many = Array.from({ length: MAX_ATTACHMENTS + 1 }, (_, i) => descriptor(`file-${i}.pdf`));
    const result = validateAttachments(many, UID);
    assert.equal(result.ok, false);
    assert.match(result.error, /at most/i);
  });

  it('refuses a file that is too large', () => {
    const result = validateAttachments([descriptor('huge.pdf', MAX_FILE_BYTES + 1)], UID);
    assert.equal(result.ok, false);
    assert.match(result.error, /larger than/i);
  });

  it('refuses a bundle that is too large', () => {
    const half = Math.floor(MAX_TOTAL_BYTES / 2) + 1;
    const result = validateAttachments(
      [descriptor('a.pdf', half), descriptor('b.pdf', half)],
      UID
    );
    assert.equal(result.ok, false);
    assert.match(result.error, /may not exceed/i);
  });

  it('refuses a file that was uploaded by another account', () => {
    const result = validateAttachments(
      [descriptor('report.pdf', 1024, 'attachments/someone-else/batch-1/report.pdf')],
      UID
    );
    assert.equal(result.ok, false);
    assert.match(result.error, /not uploaded by this account/i);
  });

  it('refuses a path that tries to climb out of the folder', () => {
    const result = validateAttachments(
      [descriptor('report.pdf', 1024, `attachments/${UID}/../../other/report.pdf`)],
      UID
    );
    assert.equal(result.ok, false);
    assert.match(result.error, /not uploaded by this account/i);
  });

  it('ignores the content type the client claims', () => {
    const result = validateAttachments(
      [{ ...descriptor('report.pdf'), contentType: 'application/x-msdownload' }],
      UID
    );
    assert.equal(result.ok, true);
    assert.equal(result.value[0].contentType, 'application/pdf');
  });

  it('refuses a file with no readable size', () => {
    const result = validateAttachments([descriptor('report.pdf', 0)], UID);
    assert.equal(result.ok, false);
    assert.match(result.error, /readable size/i);
  });

  it('refuses a list that is not a list', () => {
    const result = validateAttachments({ name: 'report.pdf' }, UID);
    assert.equal(result.ok, false);
    assert.match(result.error, /must be sent as a list/i);
  });
});

describe('Module 1 — Email Queue Creator / attachment rules', () => {
  it('publishes the limits and the bucket to the browser', () => {
    const rules = describeRules();
    assert.equal(rules.maxCount, MAX_ATTACHMENTS);
    assert.equal(rules.maxFileBytes, MAX_FILE_BYTES);
    assert.equal(rules.maxTotalBytes, MAX_TOTAL_BYTES);
    assert.equal(rules.uploadRoot, 'attachments');
    assert.ok(rules.extensions.includes('pdf'));
    // The bucket name depends on the environment the function runs in.
    assert.equal(typeof rules.bucket, 'string');
  });
});
