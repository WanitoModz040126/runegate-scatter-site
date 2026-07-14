// middleware/auth.js
const { pool } = require('../db');

async function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Not logged in.' });
    }
    return res.redirect('/login.html');
  }
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.session.userId]);
    const user = rows[0];
    if (!user || user.is_banned) {
      req.session.destroy(() => {});
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Session invalid.' });
      }
      return res.redirect('/login.html');
    }
    req.user = user;
    next();
  } catch (err) {
    console.error('auth middleware error', err);
    res.status(500).json({ error: 'Internal error.' });
  }
}

module.exports = { requireAuth };
