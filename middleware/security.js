// middleware/security.js
//
// App-layer defenses. These do NOT replace real DDoS protection (that has
// to live in front of the app -- see README for the Cloudflare
// recommendation), but they do stop credential stuffing, brute force, and
// casual scripted abuse, and they stop CSRF against the credit/spin
// endpoints.

const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { pool } = require('../db');

// ---------------------------------------------------------------------
// Rate limiters
// ---------------------------------------------------------------------

// Generic API limiter -- generous, just to blunt scripted hammering.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

// Tight limiter for auth endpoints (login/signup) -- brute force defense.
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts from this network. Try again later.' },
});

// Spin endpoint -- generous enough for real play, tight enough to block
// scripted farming/spam.
const spinLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Spinning too fast. Please slow down.' },
});

// ---------------------------------------------------------------------
// Per-username account lockout (persisted in DB, survives restarts)
// ---------------------------------------------------------------------

const MAX_FAILS = 8;
const LOCKOUT_WINDOW_MIN = 15;

async function recordLoginAttempt(username, ip, success) {
  await pool.query(
    'INSERT INTO login_attempts (username, ip, success) VALUES ($1, $2, $3)',
    [username.toLowerCase(), ip, success]
  );
}

async function isLockedOut(username) {
  const { rows } = await pool.query(
    `SELECT success, attempted_at FROM login_attempts
     WHERE username = $1 AND attempted_at > now() - interval '${LOCKOUT_WINDOW_MIN} minutes'
     ORDER BY attempted_at DESC LIMIT ${MAX_FAILS}`,
    [username.toLowerCase()]
  );
  if (rows.length < MAX_FAILS) return false;
  return rows.every((r) => r.success === false);
}

// ---------------------------------------------------------------------
// CSRF protection (double-submit cookie pattern)
// A random token is set on a readable cookie at login and mirrored into
// the session. State-changing requests must echo it back in the
// X-CSRF-Token header; same-origin JS can read the cookie, cross-origin
// pages cannot, which is what stops CSRF.
// ---------------------------------------------------------------------

function issueCsrfToken(req, res) {
  const token = crypto.randomBytes(24).toString('hex');
  req.session.csrfToken = token;
  res.cookie('csrf_token', token, {
    httpOnly: false,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
  return token;
}

function requireCsrf(req, res, next) {
  const header = req.headers['x-csrf-token'];
  if (!req.session || !req.session.csrfToken || !header || header !== req.session.csrfToken) {
    return res.status(403).json({ error: 'Invalid or missing CSRF token.' });
  }
  next();
}

module.exports = {
  apiLimiter,
  authLimiter,
  spinLimiter,
  recordLoginAttempt,
  isLockedOut,
  issueCsrfToken,
  requireCsrf,
  MAX_FAILS,
  LOCKOUT_WINDOW_MIN,
};
