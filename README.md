# RuneGate — Scatter Site

The public-facing game: signup, login, and the scatter/tumble slot itself.
This is one of two services in the RuneGate platform — see the root
`README.md` (one level up, in `runegate-platform/`) for the full
architecture, deployment steps for both services together, and the
shared-database setup. This file covers just this service.

No real money anywhere in this codebase. Credits are virtual, start at 0
on signup, and only change through this game's spin outcomes or through
an admin using the separate admin-site.

## Quick start

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL + SESSION_SECRET
npm start
```

Visit `http://localhost:3000`. New accounts start at 0 credits — use the
admin-site (separate service, same database) to assign some.

## How the scatter/tumble logic works

- 6 columns × 5 rows = 30 tiles, **scatter-pay** model (not paylines): a
  symbol pays if it appears 8, 10, or 12+ times anywhere on the grid.
- Winning tiles are removed and the rest **tumble down**, refilling from
  the top, repeating (cascading) until a spin produces no new win. Each
  cascade step multiplies its win (1x → 2x → 3x → 5x → 8x → 13x).
- `1.png` is the scatter symbol; 3+ scatters on the initial drop award
  free spins, resolved server-side with a doubled cascade multiplier.
- Everything above lives in `config/gameEngine.js` + `config/paytable.js`
  and runs **only on the server**, inside a database transaction with the
  bet deduction — the client only animates what the server already
  decided, so outcomes can't be manipulated from the browser.

To change the game's difficulty/payout profile, edit the weights and
`pays` values in `config/paytable.js`, then re-check RTP:

```bash
node -e "
const { resolveSpin } = require('./config/gameEngine');
let totalBet=0, totalWin=0;
for (let i=0;i<40000;i++){ const r=resolveSpin(10); totalBet+=10; totalWin+=r.grandTotalWin; }
console.log('RTP:', ((totalWin/totalBet)*100).toFixed(2)+'%');
"
```

## Replacing the icons

Put your own art in `assets/icons/`, same filenames: `1.png` = scatter,
`2.png`–`13.png` = the 12 paying symbols, `14.png`–`133.png` = decorative
filler shown on the idle preview grid before the first spin. Square PNGs,
transparent background, 256×256+ recommended — tiles are clipped into
circles with a stroke ring by CSS automatically.

## Security notes specific to this service

- Rate limited: 15 auth attempts / 10 min per IP, 60 spins / min per IP
- Persistent (DB-backed) lockout after 8 failed logins for a username
  within 15 minutes
- CSRF token (double-submit cookie) required on `/api/game/spin` and
  `/api/auth/logout`
- Session cookie name `runegate_sid`, httpOnly + sameSite=strict + secure
  in production
- Every credit change happens inside one Postgres transaction with a row
  lock (`SELECT … FOR UPDATE`), so concurrent spins can't double-spend
