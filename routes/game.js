// routes/game.js
const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireCsrf, spinLimiter } = require('../middleware/security');
const { resolveSpin } = require('../config/gameEngine');
const { GRID_COLS, GRID_ROWS, SCATTER, PAYTABLE } = require('../config/paytable');

const router = express.Router();

const MIN_BET = 1;
const MAX_BET = 1000;

router.get('/config', requireAuth, (req, res) => {
  res.json({
    cols: GRID_COLS,
    rows: GRID_ROWS,
    scatterIcon: SCATTER.icon,
    paytable: PAYTABLE.map((p) => ({
      icon: p.icon, name: p.name, tier: p.tier, pays: p.pays,
    })),
    minBet: MIN_BET,
    maxBet: MAX_BET,
  });
});

router.post('/spin', requireAuth, spinLimiter, requireCsrf, async (req, res) => {
  const client = await pool.connect();
  try {
    const bet = parseInt(req.body && req.body.bet, 10);
    if (!Number.isFinite(bet) || bet < MIN_BET || bet > MAX_BET) {
      client.release();
      return res.status(400).json({ error: `Bet must be between ${MIN_BET} and ${MAX_BET}.` });
    }

    await client.query('BEGIN');

    // Lock the user's row for the duration of this transaction so two
    // concurrent spins from the same account can't double-spend credits.
    const { rows } = await client.query(
      'SELECT * FROM users WHERE id = $1 FOR UPDATE',
      [req.user.id]
    );
    const user = rows[0];
    if (!user || user.is_banned) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(401).json({ error: 'Account not available.' });
    }
    if (user.credits < bet) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({ error: 'Not enough credits. Ask an admin to top you up.' });
    }

    // Game math is resolved server-side, entirely independent of the DB.
    const result = resolveSpin(bet);
    const netChange = result.grandTotalWin - bet;

    const updated = await client.query(
      'UPDATE users SET credits = credits + $1 WHERE id = $2 RETURNING credits',
      [netChange, user.id]
    );

    await client.query(
      'INSERT INTO spins (user_id, bet, win, scatter_count, free_spins) VALUES ($1, $2, $3, $4, $5)',
      [user.id, bet, result.grandTotalWin, result.scatterCount, result.freeSpinsAwarded]
    );

    await client.query('COMMIT');

    return res.json({
      ok: true,
      bet,
      ...result,
      credits: updated.rows[0].credits,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('spin error', err);
    return res.status(500).json({ error: 'Something went wrong resolving the spin.' });
  } finally {
    client.release();
  }
});

module.exports = router;
