import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc, collection, getDocs, query, where } from 'firebase/firestore';

/**
 * Firestore security-rule tests.
 *
 * These run against the Firebase Emulator Suite and prove the access model:
 *
 *   • anonymous visitors cannot read the queue, the activity log, the
 *     configuration or the dispatcher state
 *   • an operator can read their own queue entries but not somebody else's
 *   • an operator cannot read the SMTP configuration
 *   • an administrator can read everything
 *   • nobody can write directly — every write goes through the Cloud Function
 *   • nobody can promote themselves to administrator
 */

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [FIRESTORE_HOST, FIRESTORE_PORT] = EMULATOR_HOST.split(':');
// A dedicated project id, so the seeded test documents never end up in
// the namespace the application (and the integration check) uses.
const PROJECT_ID = 'email-queue-rules-test';

const ADMIN_UID = 'admin-uid';
const OPERATOR_UID = 'operator-uid';
const OTHER_OPERATOR_UID = 'other-operator-uid';

let env: RulesTestEnvironment;

/** The rules under test, read straight from the file the app deploys. */
const RULES_SOURCE = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: FIRESTORE_HOST || '127.0.0.1',
      port: Number(FIRESTORE_PORT || 8080),
      rules: RULES_SOURCE,
    },
  });

  // Seed the documents the rules read.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', ADMIN_UID), {
      uid: ADMIN_UID, email: 'admin@example.com', displayName: 'Admin', role: 'admin',
    });
    await setDoc(doc(db, 'users', OPERATOR_UID), {
      uid: OPERATOR_UID, email: 'operator@example.com', displayName: 'Operator', role: 'operator',
    });
    await setDoc(doc(db, 'users', OTHER_OPERATOR_UID), {
      uid: OTHER_OPERATOR_UID, email: 'other@example.com', displayName: 'Other', role: 'operator',
    });

    await setDoc(doc(db, 'emails', 'EML-001'), {
      id: 'EML-001', seq: 1, recipient: 'mine@example.com', subject: 'Mine',
      message: 'Body', createdBy: OPERATOR_UID, status: 'QUEUED',
    });
    await setDoc(doc(db, 'emails', 'EML-002'), {
      id: 'EML-002', seq: 2, recipient: 'theirs@example.com', subject: 'Theirs',
      message: 'Body', createdBy: OTHER_OPERATOR_UID, status: 'QUEUED',
    });
    await setDoc(doc(db, 'activity', 'ACT-001'), {
      id: 'ACT-001', seq: 1, emailId: 'EML-001', message: 'queued', type: 'info',
      createdBy: OPERATOR_UID, timestamp: '2026-01-01T00:00:00.000Z',
    });
    await setDoc(doc(db, 'activity', 'ACT-002'), {
      id: 'ACT-002', seq: 2, emailId: 'EML-002', message: 'queued', type: 'info',
      createdBy: OTHER_OPERATOR_UID, timestamp: '2026-01-01T00:00:01.000Z',
    });
    await setDoc(doc(db, 'stats', 'main'), { total: 2, queued: 2, delivered: 0, failed: 0 });
    await setDoc(doc(db, '_meta', 'main'), { dispatch: { running: false, paused: false } });
    await setDoc(doc(db, '_meta', 'dispatchLease'), { owner: 'x', until: 0 });
    await setDoc(doc(db, '_config', 'main'), { smtp: { host: 'smtp.gmail.com', user: 'me@example.com' } });
    await setDoc(doc(db, '_secrets', 'main'), { smtpPass: 'super-secret' });
  });
});

after(async () => {
  await env.cleanup();
});

// ── anonymous visitors ─────────────────────────────────────────────────────────

describe('unauthenticated access', () => {
  it('cannot read the email queue', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'emails', 'EML-001')));
  });

  it('cannot list the email queue', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDocs(collection(db, 'emails')));
  });

  it('cannot read the activity log', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'activity', 'ACT-001')));
  });

  it('cannot read the statistics', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'stats', 'main')));
  });

  it('cannot read the dispatcher state', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, '_meta', 'main')));
  });

  it('cannot read the SMTP configuration', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, '_config', 'main')));
  });

  it('cannot read the stored secrets', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, '_secrets', 'main')));
  });

  it('cannot write to the queue', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(db, 'emails', 'EML-999'), { subject: 'Injected' }));
  });

  it('cannot write to the secrets', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(db, '_secrets', 'main'), { smtpPass: 'mine' }));
  });
});

// ── an ordinary operator ───────────────────────────────────────────────────────

describe('an authenticated operator', () => {
  it('can read their own email', async () => {
    const db = env.authenticatedContext(OPERATOR_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'emails', 'EML-001')));
  });

  it('cannot read another account\'s email', async () => {
    const db = env.authenticatedContext(OPERATOR_UID).firestore();
    await assertFails(getDoc(doc(db, 'emails', 'EML-002')));
  });

  it('can list their own entries with the owner-scoped query', async () => {
    const db = env.authenticatedContext(OPERATOR_UID).firestore();
    const snap = await getDocs(
      query(collection(db, 'emails'), where('createdBy', '==', OPERATOR_UID))
    );
    const ids = snap.docs.map((d) => d.id);
    assert.deepEqual(ids, ['EML-001']);
  });

  it('cannot list the whole queue', async () => {
    const db = env.authenticatedContext(OPERATOR_UID).firestore();
    await assertFails(getDocs(collection(db, 'emails')));
  });

  it('cannot list another account\'s entries', async () => {
    const db = env.authenticatedContext(OPERATOR_UID).firestore();
    await assertFails(
      getDocs(query(collection(db, 'emails'), where('createdBy', '==', OTHER_OPERATOR_UID)))
    );
  });

  it('can read their own activity entry', async () => {
    const db = env.authenticatedContext(OPERATOR_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'activity', 'ACT-001')));
  });

  it('cannot read another account\'s activity entry', async () => {
    const db = env.authenticatedContext(OPERATOR_UID).firestore();
    await assertFails(getDoc(doc(db, 'activity', 'ACT-002')));
  });

  it('can read the statistics', async () => {
    const db = env.authenticatedContext(OPERATOR_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'stats', 'main')));
  });

  it('can read the dispatcher state', async () => {
    const db = env.authenticatedContext(OPERATOR_UID).firestore();
    await assertSucceeds(getDoc(doc(db, '_meta', 'main')));
  });

  it('cannot read the internal dispatch lease', async () => {
    const db = env.authenticatedContext(OPERATOR_UID).firestore();
    await assertFails(getDoc(doc(db, '_meta', 'dispatchLease')));
  });

  it('cannot read the SMTP configuration', async () => {
    const db = env.authenticatedContext(OPERATOR_UID).firestore();
    await assertFails(getDoc(doc(db, '_config', 'main')));
  });

  it('cannot read the stored secrets', async () => {
    const db = env.authenticatedContext(OPERATOR_UID).firestore();
    await assertFails(getDoc(doc(db, '_secrets', 'main')));
  });

  it('cannot write to the queue directly', async () => {
    const db = env.authenticatedContext(OPERATOR_UID).firestore();
    await assertFails(setDoc(doc(db, 'emails', 'EML-001'), { subject: 'Tampered' }));
  });

  it('cannot promote themselves to administrator', async () => {
    const db = env.authenticatedContext(OPERATOR_UID).firestore();
    await assertFails(setDoc(doc(db, 'users', OPERATOR_UID), { role: 'admin' }));
  });

  it('cannot change another account\'s role', async () => {
    const db = env.authenticatedContext(OPERATOR_UID).firestore();
    await assertFails(setDoc(doc(db, 'users', OTHER_OPERATOR_UID), { role: 'admin' }));
  });

  it('cannot write to the configuration', async () => {
    const db = env.authenticatedContext(OPERATOR_UID).firestore();
    await assertFails(setDoc(doc(db, '_config', 'main'), { dryRun: false }));
  });

  it('can read their own profile', async () => {
    const db = env.authenticatedContext(OPERATOR_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'users', OPERATOR_UID)));
  });

  it('cannot read another account\'s profile', async () => {
    const db = env.authenticatedContext(OPERATOR_UID).firestore();
    await assertFails(getDoc(doc(db, 'users', OTHER_OPERATOR_UID)));
  });
});

// ── an administrator ───────────────────────────────────────────────────────────

describe('an authenticated administrator', () => {
  it('can read every email', async () => {
    const db = env.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'emails', 'EML-001')));
    await assertSucceeds(getDoc(doc(db, 'emails', 'EML-002')));
  });

  it('can list the whole queue', async () => {
    const db = env.authenticatedContext(ADMIN_UID).firestore();
    const snap = await getDocs(collection(db, 'emails'));
    assert.equal(snap.docs.length, 2);
  });

  it('can read every activity entry', async () => {
    const db = env.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'activity', 'ACT-001')));
    await assertSucceeds(getDoc(doc(db, 'activity', 'ACT-002')));
  });

  it('can read the SMTP configuration', async () => {
    const db = env.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(getDoc(doc(db, '_config', 'main')));
  });

  it('still cannot read the stored secrets', async () => {
    const db = env.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(getDoc(doc(db, '_secrets', 'main')));
  });

  it('still cannot read the internal dispatch lease', async () => {
    const db = env.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(getDoc(doc(db, '_meta', 'dispatchLease')));
  });

  it('can read another account\'s profile', async () => {
    const db = env.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'users', OPERATOR_UID)));
  });

  it('still cannot write to the queue directly', async () => {
    const db = env.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(setDoc(doc(db, 'emails', 'EML-001'), { subject: 'Tampered' }));
  });

  it('cannot escalate through the rules — roles are server-managed', async () => {
    const db = env.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(setDoc(doc(db, 'users', OPERATOR_UID), { role: 'admin' }));
  });
});
