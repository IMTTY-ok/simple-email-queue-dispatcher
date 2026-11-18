'use strict';

/**
 * Shared HTTP helpers for the REST layer.
 *
 * Keeping them here means every route reports failures in the same shape
 * (`{ ok: false, error }`) and no route handler can forget its error path.
 */

const { humanError } = require('../modules/module-2-send-simulator/simulator.js');

/** 200 JSON response. */
function ok(res, payload) {
  res.json(payload);
}

/** Error response with an explicit status code. */
function fail(res, status, error) {
  res.status(status).json({ ok: false, error });
}

/**
 * Wrap an async route handler so a rejected promise becomes an error
 * response instead of an unhandled rejection.
 *
 * A thrown error may carry a `status` (a refused request is a 400, not a
 * server fault), so the handler can explain what the client got wrong
 * without inventing a second error channel.
 */
function h(fn) {
  return (req, res) =>
    fn(req, res).catch((err) => {
      console.error('[functions] route error:', err);
      if (!res.headersSent) {
        const status = Number(err && err.status) || 500;
        fail(res, status, humanError(err));
      }
    });
}

module.exports = { ok, fail, h };
