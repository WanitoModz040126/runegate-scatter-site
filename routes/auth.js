// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const {
  authLimiter,
  recordLoginAttempt,
  isLockedOut,
  issueCsrfToken,
  requireCsrf,
  MAX_FAILS,
  LOCKOUT_WINDOW_MIN,
} = require('../middleware/security');

const router = express.Router();

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

router.post('/signup', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Username and password are required.' });
    }
    if (!USERNAME_RE.test(username)) {
      return res.status(400).json({
        error: 'Username must be 3-20 characters: letters, numbers, underscore only.',
      });
    }
    if (password.length < 6 || password.length > 128) {
      return res.status(400).json({ error: 'Password must be 6-128 characters.' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'That username is already taken.' });
    }

    const hash = await bcrypt.hash(password, 12);
    // New accounts start at 0 credits by design -- an admin assigns credits afterward.
    const result = await pool.query(
      'INSERT INTO users (username, password_hash, credits, is_admin) VALUES ($1, $2, 0, FALSE) RETURNING id',
      [username, hash]
    );

    req.session.userId = result.rows[0].id;
    req.session.regenerate?.(() => {}); // no-op guard if unavailable
    const csrfToken = issueCsrfToken(req, res);
    return res.json({
      ok: true,
      user: { id: result.rows[0].id, username, credits: 0, is_admin: false },
      csrfToken,
    });
  } catch (err) {
    console.error('signup error', err);
    return res.status(500).json({ error: 'Something went wrong creating your account.' });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  const ip = req.ip;
  try {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    if (await isLockedOut(username)) {
      return res.status(429).json({
        error: `Too many failed attempts. Try again in ${LOCKOUT_WINDOW_MIN} minutes.`,
      });
    }

    const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = rows[0];

    if (!user) {
      await recordLoginAttempt(username, ip, false);
      return res.status(401).json({ error: 'Invalid username or password.' });
    }
    if (user.is_banned) {
      return res.status(403).json({ error: 'This account has been suspended.' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    await recordLoginAttempt(username, ip, ok);

    if (!ok) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    req.session.userId = user.id;
    const csrfToken = issueCsrfToken(req, res);
    return res.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        credits: user.credits,
        is_admin: !!user.is_admin,
      },
      csrfToken,
    });
  } catch (err) {
    console.error('login error', err);
    return res.status(500).json({ error: 'Something went wrong logging in.' });
  }
});

router.post('/logout', requireCsrf, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.clearCookie('csrf_token');
    res.json({ ok: true });
  });
});

router.get('/me', requireAuth, (req, res) => {
  const csrfToken = req.session.csrfToken || issueCsrfToken(req, res);
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      credits: req.user.credits,
      is_admin: !!req.user.is_admin,
    },
    csrfToken,
  });
});

module.exports = router;
