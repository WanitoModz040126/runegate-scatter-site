// server.js
require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const { pool, init } = require('./db');
const { requireAuth } = require('./middleware/auth');
const { apiLimiter } = require('./middleware/security');
const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

app.disable('x-powered-by');
app.set('trust proxy', 1); // required on Railway so req.ip / secure cookies work behind the proxy

// ---------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"], // blocks embedding in an iframe (clickjacking / "deface via overlay" defense)
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);
app.use(helmet.frameguard({ action: 'deny' }));

app.use(express.json({ limit: '32kb' })); // small limit -- this app never needs big payloads
app.use(cookieParser());
app.use(apiLimiter);

app.use(
  session({
    store: new pgSession({ pool, tableName: 'session_scatter', createTableIfMissing: true }),
    name: 'runegate_sid', // non-default cookie name (don't advertise the framework)
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      sameSite: 'strict',
      secure: IS_PROD,
    },
  })
);

// Static assets. No directory listing (express.static doesn't do that by
// default), no dotfiles served.
const staticOpts = { dotfiles: 'deny', index: false };
app.use('/assets', express.static(path.join(__dirname, 'assets'), staticOpts));
app.use('/css', express.static(path.join(__dirname, 'public/css'), staticOpts));
app.use('/js', express.static(path.join(__dirname, 'public/js'), staticOpts));

// Public pages
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));
app.get('/signup.html', (req, res) => res.sendFile(path.join(__dirname, 'public/signup.html')));

// Protected pages
app.get('/', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

// Centralized error handler -- never leak stack traces to the client.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

if (!process.env.SESSION_SECRET) {
  console.error('FATAL: SESSION_SECRET is not set.');
  process.exit(1);
}

init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`RuneGate scatter-site running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
