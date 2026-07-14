// db.js
// Shared PostgreSQL connection. Both scatter-site and admin-site point at
// the SAME database (via DATABASE_URL) so credits/users stay perfectly in
// sync between the two deployments -- there is no other channel between
// them, which keeps the attack surface small (no internal API to secure).
//
// Schema creation is idempotent (CREATE TABLE IF NOT EXISTS) so it's safe
// for both services to run this on boot.

const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is not set. Add a PostgreSQL database and set this env var.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
  max: 10,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL error on idle client', err);
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      credits       BIGINT NOT NULL DEFAULT 0,
      is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
      is_banned     BOOLEAN NOT NULL DEFAULT FALSE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS spins (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      bet           INTEGER NOT NULL,
      win           INTEGER NOT NULL,
      scatter_count INTEGER NOT NULL DEFAULT 0,
      free_spins    INTEGER NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS credit_log (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      admin_id   INTEGER REFERENCES users(id),
      delta      INTEGER NOT NULL,
      reason     TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Tracks failed login attempts per-username for account lockout, and is
  // pruned periodically. Persisted in DB (not memory) so lockouts survive
  // restarts/redeploys.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      id           SERIAL PRIMARY KEY,
      username     TEXT NOT NULL,
      ip           TEXT NOT NULL,
      success      BOOLEAN NOT NULL,
      attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_login_attempts_username ON login_attempts(username, attempted_at);`);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_spins_user ON spins(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_credit_log_user ON credit_log(user_id);`);
}

module.exports = { pool, init };
