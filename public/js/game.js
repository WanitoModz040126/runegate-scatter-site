// public/js/game.js
// Client is intentionally "dumb": the server resolves the entire spin
// (including every tumble/cascade step and any free-spin rounds) and sends
// back a step log. The client's only job is to animate that log faithfully
// and keep the credit display in sync -- all math and RNG live server-side
// so the game can't be tampered with client-side.

const el = (id) => document.getElementById(id);
const reelGrid = el('reelGrid');
const creditsDisplay = el('creditsDisplay');
const userAvatar = el('userAvatar');
const userName = el('userName');
const betAmountEl = el('betAmount');
const lastWinEl = el('lastWin');
const freeSpinsLeftEl = el('freeSpinsLeft');
const spinBtn = el('spinBtn');
const autoSwitch = el('autoSwitch');
const toast = el('toast');
const winOverlay = el('winOverlay');

let CONFIG = null;
let credits = 0;
let bet = 10;
let spinning = false;
let autoSpin = false;

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

function iconUrl(name) {
  return `/assets/icons/${name}`;
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3200);
}

function formatNum(n) {
  return Math.round(n).toLocaleString('en-US');
}

async function loadMe() {
  const res = await fetch('/api/auth/me');
  if (!res.ok) { window.location.href = '/login.html'; return; }
  const { user } = await res.json();
  credits = user.credits;
  userName.textContent = user.username;
  userAvatar.textContent = user.username.slice(0, 1).toUpperCase();
  creditsDisplay.textContent = formatNum(credits);
}

async function loadConfig() {
  const res = await fetch('/api/game/config');
  CONFIG = await res.json();
}

function buildInitialGrid() {
  const cols = CONFIG.cols, rows = CONFIG.rows;
  const grid = [];
  for (let c = 0; c < cols; c++) {
    const col = [];
    for (let r = 0; r < rows; r++) {
      const p = CONFIG.paytable[Math.floor(Math.random() * CONFIG.paytable.length)];
      col.push(p.icon);
    }
    grid.push(col);
  }
  return grid;
}

function renderGrid(grid, winningIcons = new Set()) {
  reelGrid.innerHTML = '';
  const cols = CONFIG.cols, rows = CONFIG.rows;
  reelGrid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const icon = grid[c][r];
      const tile = document.createElement('div');
      tile.className = 'tile';
      if (winningIcons.has(icon)) tile.classList.add('win');
      if (icon === CONFIG.scatterIcon) tile.classList.add('scatter-tile');

      const img = document.createElement('img');
      img.src = iconUrl(icon);
      img.alt = icon === CONFIG.scatterIcon ? 'Scatter' : 'Symbol';
      tile.appendChild(img);
      reelGrid.appendChild(tile);
    }
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function animateStep(step) {
  const winSet = new Set((step.wins || []).map((w) => w.icon));
  renderGrid(step.grid, winSet);
  if (step.stepWin > 0) {
    lastWinEl.textContent = formatNum(step.stepWin);
    lastWinEl.classList.add('win-flash');
  }
  await sleep(winSet.size ? 650 : 150);
}

function showOverlay(title, eyebrow, amount) {
  el('overlayTitle').textContent = title;
  el('overlayEyebrow').textContent = eyebrow;
  el('overlayAmount').textContent = formatNum(amount);
  winOverlay.classList.add('show');
}
function hideOverlay() { winOverlay.classList.remove('show'); }
el('overlayClose').addEventListener('click', hideOverlay);

async function doSpin() {
  if (spinning) return;
  if (credits < bet) { showToast('Not enough credits. Ask an admin to top you up.'); return; }

  spinning = true;
  spinBtn.disabled = true;
  spinBtn.classList.add('spinning');
  lastWinEl.classList.remove('win-flash');
  lastWinEl.textContent = '0';

  try {
    const res = await fetch('/api/game/spin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': getCookie('csrf_token') || '',
      },
      body: JSON.stringify({ bet }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Spin failed.');
      spinning = false;
      spinBtn.disabled = false;
      spinBtn.classList.remove('spinning');
      return;
    }

    credits = data.credits;
    creditsDisplay.textContent = formatNum(credits - data.grandTotalWin);

    for (const step of data.steps) {
      await animateStep(step);
    }

    if (data.scatterCount >= 3) {
      showToast(`${data.scatterCount} Scatters landed! ${data.freeSpinsAwarded} free spins won.`);
      await sleep(900);
    }

    if (data.freeSpinRounds && data.freeSpinRounds.length > 0) {
      for (const round of data.freeSpinRounds) {
        freeSpinsLeftEl.textContent = data.freeSpinRounds.length - round.round + 1;
        for (const step of round.steps) {
          await animateStep(step);
        }
      }
      freeSpinsLeftEl.textContent = '0';
    }

    creditsDisplay.textContent = formatNum(credits);

    if (data.grandTotalWin > 0) {
      lastWinEl.textContent = formatNum(data.grandTotalWin);
      lastWinEl.classList.add('win-flash');
    }

    if (data.grandTotalWin >= bet * 20) {
      showOverlay('Rune Cascade!', data.grandTotalWin >= bet * 50 ? 'Legendary Win' : 'Big Win', data.grandTotalWin);
    }
  } catch (err) {
    console.error(err);
    showToast('Connection error. Please try again.');
  } finally {
    spinning = false;
    spinBtn.disabled = false;
    spinBtn.classList.remove('spinning');
    if (autoSpin && credits >= bet) {
      setTimeout(doSpin, 700);
    } else if (autoSpin) {
      autoSpin = false;
      autoSwitch.classList.remove('on');
    }
  }
}

function setBet(newBet) {
  bet = Math.max(CONFIG.minBet, Math.min(CONFIG.maxBet, newBet));
  betAmountEl.textContent = bet;
}

el('betUp').addEventListener('click', () => setBet(bet + (bet < 10 ? 1 : bet < 100 ? 10 : 50)));
el('betDown').addEventListener('click', () => setBet(bet - (bet <= 10 ? 1 : bet <= 100 ? 10 : 50)));
spinBtn.addEventListener('click', doSpin);
autoSwitch.addEventListener('click', () => {
  autoSpin = !autoSpin;
  autoSwitch.classList.toggle('on', autoSpin);
  if (autoSpin && !spinning) doSpin();
});

el('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', {
    method: 'POST',
    headers: { 'X-CSRF-Token': getCookie('csrf_token') || '' },
  });
  window.location.href = '/login.html';
});

(async function init() {
  await loadMe();
  await loadConfig();
  setBet(bet);
  renderGrid(buildInitialGrid());
})();
