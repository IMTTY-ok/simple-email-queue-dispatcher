import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMAIL_REGEX,
  LIMITS,
  validateEmail,
} from '../functions/src/modules/module-1-email-queue-creator/queue.js';

/**
 * Module 1 — Email Queue Creator: input validation.
 *
 * These are the rules the PRD puts on the "Add Email" form:
 *   • a valid recipient address is required
 *   • subject and message are required
 *   • an empty email is refused
 */
describe('Module 1 — Email Queue Creator / validation', () => {
  it('accepts a complete email', () => {
    const result = validateEmail({
      recipient: 'student@example.com',
      subject: 'Assignment',
      message: 'Hello there',
    });
    assert.equal(result.ok, true);
    assert.equal(result.value.recipient, 'student@example.com');
    assert.equal(result.value.subject, 'Assignment');
  });

  it('trims whitespace around every field', () => {
    const result = validateEmail({
      recipient: '  student@example.com  ',
      subject: '  Assignment  ',
      message: '  Hello  ',
      senderName: '  Ada  ',
    });
    assert.equal(result.ok, true);
    assert.equal(result.value.recipient, 'student@example.com');
    assert.equal(result.value.subject, 'Assignment');
    assert.equal(result.value.message, 'Hello');
    assert.equal(result.value.senderName, 'Ada');
  });

  it('refuses an empty email', () => {
    const result = validateEmail({ recipient: '', subject: '', message: '' });
    assert.equal(result.ok, false);
    assert.match(result.error, /Recipient email is required/);
  });

  it('refuses an invalid address', () => {
    const result = validateEmail({
      recipient: 'abc@',
      subject: 'S',
      message: 'M',
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /valid email address/i);
  });

  it('refuses a missing subject', () => {
    const result = validateEmail({
      recipient: 'a@b.com',
      subject: '   ',
      message: 'M',
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /Subject is required/);
  });

  it('refuses a missing message', () => {
    const result = validateEmail({
      recipient: 'a@b.com',
      subject: 'S',
      message: '',
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /Message is required/);
  });

  it('refuses over-long fields', () => {
    const result = validateEmail({
      recipient: 'a@b.com',
      subject: 'x'.repeat(LIMITS.subject + 1),
      message: 'M',
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /Subject is too long/);
  });

  it('exposes the same address pattern as the frontend', () => {
    assert.equal(EMAIL_REGEX.test('student@example.com'), true);
    assert.equal(EMAIL_REGEX.test('a@b.co'), true);
    assert.equal(EMAIL_REGEX.test('abc@'), false);
    assert.equal(EMAIL_REGEX.test('no-at-sign.com'), false);
  });
});
