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
 * Wrap an async route handler so a rejected promise becomes a 500 response
 * instead of an unhandled rejection.
 */
function h(fn) {
  return (req, res) =>
    fn(req, res).catch((err) => {
      console.error('[functions] route error:', err);
      if (!res.headersSent) fail(res, 500, humanError(err));
    });
}

module.exports = { ok, fail, h };
