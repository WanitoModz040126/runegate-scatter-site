// config/gameEngine.js
//
// Pure game-logic module (no HTTP/DB concerns here) so it's easy to unit
// test and reason about. Implements:
//   1. Weighted random symbol draws
//   2. Scatter-pay matching (count-anywhere, not payline based)
//   3. Tumbling/cascade resolution (winning symbols removed, rest fall,
//      new symbols drop in from the top, repeat until no new wins)
//   4. Scatter-triggered free spins, resolved server-side in the same
//      request and returned as a step-by-step log the client can animate.

const {
  SCATTER,
  PAYTABLE,
  GRID_COLS,
  GRID_ROWS,
  payTierFor,
} = require('./paytable');

// Build a flat weighted pool once: [{icon,...}, ...] repeated by weight.
function buildWeightedPool() {
  const pool = [];
  for (const sym of PAYTABLE) {
    for (let i = 0; i < sym.weight; i++) pool.push(sym.icon);
  }
  for (let i = 0; i < SCATTER.weight; i++) pool.push(SCATTER.icon);
  return pool;
}

const WEIGHTED_POOL = buildWeightedPool();

function randomSymbol() {
  return WEIGHTED_POOL[Math.floor(Math.random() * WEIGHTED_POOL.length)];
}

function freshGrid() {
  const grid = [];
  for (let c = 0; c < GRID_COLS; c++) {
    const col = [];
    for (let r = 0; r < GRID_ROWS; r++) col.push(randomSymbol());
    grid.push(col);
  }
  return grid; // grid[col][row]
}

function countSymbols(grid) {
  const counts = {};
  for (let c = 0; c < GRID_COLS; c++) {
    for (let r = 0; r < GRID_ROWS; r++) {
      const s = grid[c][r];
      counts[s] = (counts[s] || 0) + 1;
    }
  }
  return counts;
}

// Returns { wins: [{icon,count,tier,payMult}], scatterCount, totalMult }
function evaluateGrid(grid, betAmount) {
  const counts = countSymbols(grid);
  const wins = [];
  let scatterCount = counts[SCATTER.icon] || 0;

  for (const sym of PAYTABLE) {
    const count = counts[sym.icon] || 0;
    const tier = payTierFor(count);
    if (tier) {
      const mult = sym.pays[tier];
      wins.push({
        icon: sym.icon,
        name: sym.name,
        count,
        tier,
        mult,
        amount: Math.round(mult * betAmount),
      });
    }
  }

  const totalWin = wins.reduce((sum, w) => sum + w.amount, 0);
  return { wins, scatterCount, totalWin, counts };
}

// Removes winning symbols (sets to null) then drops remaining symbols down
// within each column, filling empty top slots with fresh random symbols.
function tumble(grid, winningIcons) {
  const winSet = new Set(winningIcons);
  const newGrid = grid.map((col) => col.slice());

  for (let c = 0; c < GRID_COLS; c++) {
    // Keep non-winning symbols, in order, gravity pulls them to bottom.
    const survivors = newGrid[c].filter((s) => !winSet.has(s));
    const missing = GRID_ROWS - survivors.length;
    const fresh = [];
    for (let i = 0; i < missing; i++) fresh.push(randomSymbol());
    newGrid[c] = fresh.concat(survivors);
  }
  return newGrid;
}

// Resolves one full "spin" including cascading tumbles until no more wins.
// Returns a step-by-step log so the client can animate each cascade.
function resolveSpin(betAmount) {
  let grid = freshGrid();
  const steps = [];
  let totalWin = 0;
  let cascadeMultiplierSchedule = [1, 2, 3, 5, 8, 13]; // grows per cascade, caps out
  let cascadeIndex = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const evalResult = evaluateGrid(grid, betAmount);
    const cascadeMult = cascadeMultiplierSchedule[
      Math.min(cascadeIndex, cascadeMultiplierSchedule.length - 1)
    ];

    if (evalResult.wins.length === 0) {
      steps.push({
        grid: grid.map((c) => c.slice()),
        wins: [],
        scatterCount: evalResult.scatterCount,
        stepWin: 0,
        cascadeMult,
      });
      break;
    }

    const stepWin = evalResult.totalWin * cascadeMult;
    totalWin += stepWin;

    steps.push({
      grid: grid.map((c) => c.slice()),
      wins: evalResult.wins,
      scatterCount: evalResult.scatterCount,
      stepWin,
      cascadeMult,
    });

    const winningIcons = evalResult.wins.map((w) => w.icon);
    grid = tumble(grid, winningIcons);
    cascadeIndex++;

    if (cascadeIndex > 25) break; // safety valve, should never trigger
  }

  const finalScatterCount = steps[0].scatterCount; // scatter counted on initial drop only
  const freeSpinsAwarded = SCATTER.freeSpins[finalScatterCount] || 0;

  let freeSpinTotalWin = 0;
  const freeSpinRounds = [];
  if (freeSpinsAwarded > 0) {
    // Free spins use a small persistent multiplier bump for excitement,
    // resolved synchronously and summarized for the client.
    for (let fs = 0; fs < freeSpinsAwarded; fs++) {
      const fsSteps = [];
      let fsGrid = freshGrid();
      let fsCascade = 0;
      let fsWin = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const evalResult = evaluateGrid(fsGrid, betAmount);
        const cascadeMult = cascadeMultiplierSchedule[
          Math.min(fsCascade, cascadeMultiplierSchedule.length - 1)
        ] * 2; // free spins pay double multiplier
        if (evalResult.wins.length === 0) {
          fsSteps.push({ grid: fsGrid.map((c) => c.slice()), wins: [], stepWin: 0, cascadeMult });
          break;
        }
        const stepWin = evalResult.totalWin * cascadeMult;
        fsWin += stepWin;
        fsSteps.push({ grid: fsGrid.map((c) => c.slice()), wins: evalResult.wins, stepWin, cascadeMult });
        fsGrid = tumble(fsGrid, evalResult.wins.map((w) => w.icon));
        fsCascade++;
        if (fsCascade > 25) break;
      }
      freeSpinRounds.push({ round: fs + 1, steps: fsSteps, win: fsWin });
      freeSpinTotalWin += fsWin;
    }
  }

  return {
    steps,
    totalWin,
    scatterCount: finalScatterCount,
    freeSpinsAwarded,
    freeSpinRounds,
    freeSpinTotalWin,
    grandTotalWin: totalWin + freeSpinTotalWin,
  };
}

module.exports = {
  freshGrid,
  evaluateGrid,
  tumble,
  resolveSpin,
  WEIGHTED_POOL,
};
