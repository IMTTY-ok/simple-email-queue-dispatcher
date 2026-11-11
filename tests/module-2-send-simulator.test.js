import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTOMATIC_SUCCESS_RATE,
  SIMULATION_MODES,
  makeDryRunner,
  normalizeSimulationMode,
  simulateOutcome,
  escapeHtml,
  wrapHtml,
  humanError,
} from '../functions/src/modules/module-2-send-simulator/simulator.js';

/**
 * Module 2 — Send Simulator.
 *
 * The simulator decides whether a delivery attempt succeeds or fails. The
 * three modes from the PRD are covered here, plus the HTML escaping that
 * keeps a message body from breaking out of the mail template.
 */
describe('Module 2 — Send Simulator / simulation modes', () => {
  it('exposes exactly the three PRD modes', () => {
    assert.deepEqual([...SIMULATION_MODES], ['AUTOMATIC', 'FORCE_SUCCESS', 'FORCE_FAILURE']);
  });

  it('normalises unknown modes to AUTOMATIC', () => {
    assert.equal(normalizeSimulationMode('force_success'), 'FORCE_SUCCESS');
    assert.equal(normalizeSimulationMode('nonsense'), 'AUTOMATIC');
    assert.equal(normalizeSimulationMode(undefined), 'AUTOMATIC');
  });

  it('FORCE_SUCCESS always succeeds', () => {
    for (let i = 0; i < 50; i++) {
      assert.equal(simulateOutcome('FORCE_SUCCESS'), true);
    }
  });

  it('FORCE_FAILURE always fails', () => {
    for (let i = 0; i < 50; i++) {
      assert.equal(simulateOutcome('FORCE_FAILURE'), false);
    }
  });

  it('AUTOMATIC mixes successes and failures', () => {
    const results = Array.from({ length: 400 }, () => simulateOutcome('AUTOMATIC'));
    const successes = results.filter(Boolean).length;
    // A deterministic assertion would flake; assert on the distribution.
    assert.ok(successes > 100 && successes < 320, `unexpected success count: ${successes}`);
    assert.ok(Math.abs(successes / results.length - AUTOMATIC_SUCCESS_RATE) < 0.15);
  });
});

describe('Module 2 — Send Simulator / dry-run transport', () => {
  it('resolves a successful attempt with a 250 response', async () => {
    const runner = makeDryRunner('FORCE_SUCCESS');
    const info = await runner.sendMail({ to: 'student@example.com' });
    assert.deepEqual(info.accepted, ['student@example.com']);
    assert.deepEqual(info.rejected, []);
    assert.match(info.response, /^250 2\.0\.0 OK/);
  });

  it('rejects a failed attempt with a 550 refusal', async () => {
    const runner = makeDryRunner('FORCE_FAILURE');
    await assert.rejects(
      () => runner.sendMail({ to: 'student@example.com' }),
      (err) => {
        assert.match(err.message, /^550 5\.1\.1/);
        assert.equal(err.responseCode, 550);
        return true;
      }
    );
  });

  it('verifies successfully without a network connection', async () => {
    const runner = makeDryRunner('AUTOMATIC');
    assert.equal(await runner.verify(), true);
  });
});

describe('Module 2 — Send Simulator / message rendering', () => {
  it('escapes HTML metacharacters', () => {
    assert.equal(escapeHtml('<b>&"</b>'), '&lt;b&gt;&amp;&quot;&lt;/b&gt;');
  });

  it('never emits raw tags from the message body', () => {
    const html = wrapHtml('<script>x</script>', '<img src=x onerror=alert(1)>', 'A');
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  it('formats errors with their code and response', () => {
    const err = Object.assign(new Error('Connection refused'), {
      code: 'ECONNREFUSED',
      response: '550 unavailable',
    });
    const message = humanError(err);
    assert.match(message, /\[ECONNREFUSED\]/);
    assert.match(message, /Connection refused/);
  });
});
