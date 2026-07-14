// config/paytable.js
//
// This is the single source of truth for the game's math model.
// Grid: 6 columns x 5 rows = 30 cells, "scatter pays" style (Pragmatic-Play-like):
// a symbol pays if it appears N+ times ANYWHERE on the grid, no paylines needed.
//
// Icons live in /assets/icons and are referenced by filename only, so you can
// swap in your own 133 icons at any time without touching this file, AS LONG AS
// the filenames match what's listed below. If you add more icons later, add
// more entries to PAYTABLE (or SCATTER) and adjust weights.
//
// icon "1.png" is reserved as the SCATTER symbol (per your spec).

const SCATTER = {
  icon: '1.png',
  name: 'Rune of Summoning',
  weight: 2,        // relative appearance weight per cell
  // Free-spin awards based on scatter count landed in a single spin
  freeSpins: { 3: 8, 4: 10, 5: 12, 6: 15 },
};

// Paying symbols grouped into rarity tiers. Multipliers are "x bet" and apply
// per the count-tier the player lands (8-9, 10-11, 12+ of the same symbol).
// Tune `weight` (higher = more common) and `pays` to change difficulty/RTP.
const PAYTABLE = [
  // --- Low tier (common, small pays) ---
  { icon: '2.png',  name: 'Iron Sigil',    tier: 'low',    weight: 40, pays: { 8: 2,   10: 4,   12: 9 } },
  { icon: '3.png',  name: 'Stone Sigil',   tier: 'low',    weight: 40, pays: { 8: 2,   10: 4,   12: 9 } },
  { icon: '4.png',  name: 'Bronze Sigil',  tier: 'low',    weight: 38, pays: { 8: 2.5, 10: 5,   12: 11 } },
  { icon: '5.png',  name: 'Copper Sigil',  tier: 'low',    weight: 38, pays: { 8: 2.5, 10: 5,   12: 11 } },

  // --- Mid tier ---
  { icon: '6.png',  name: 'Azure Crest',   tier: 'mid',    weight: 24, pays: { 8: 4,   10: 9,   12: 22 } },
  { icon: '7.png',  name: 'Verdant Crest', tier: 'mid',    weight: 24, pays: { 8: 4,   10: 9,   12: 22 } },
  { icon: '8.png',  name: 'Crimson Crest', tier: 'mid',    weight: 20, pays: { 8: 6,   10: 13,  12: 34 } },
  { icon: '9.png',  name: 'Violet Crest',  tier: 'mid',    weight: 20, pays: { 8: 6,   10: 13,  12: 34 } },

  // --- High tier ---
  { icon: '10.png', name: 'Golden Emblem', tier: 'high',   weight: 12, pays: { 8: 9,   10: 22,  12: 65 } },
  { icon: '11.png', name: 'Phoenix Emblem',tier: 'high',   weight: 10, pays: { 8: 11,  10: 26,  12: 85 } },
  { icon: '12.png', name: 'Dragon Emblem', tier: 'high',   weight: 8,  pays: { 8: 13,  10: 35,  12: 108 } },

  // --- Premium (rare, big pays) ---
  { icon: '13.png', name: 'Ancient Relic', tier: 'premium',weight: 4,  pays: { 8: 22,  10: 65,  12: 215 } },
];

// Any icons from 14.png through 133.png that exist in /assets/icons but are
// NOT listed above are treated as pure decoration (used only in the "idle
// shimmer" preview strip on the login/landing page), so you can drop all 133
// files in without breaking the math model. To make more of them count
// toward wins, just add more objects to PAYTABLE above.
const DECORATIVE_ICON_COUNT = 133;

const GRID_COLS = 6;
const GRID_ROWS = 5;
const MIN_MATCH = 8; // minimum count anywhere on grid to pay

function payTierFor(count) {
  if (count >= 12) return 12;
  if (count >= 10) return 10;
  if (count >= 8) return 8;
  return null;
}

module.exports = {
  SCATTER,
  PAYTABLE,
  DECORATIVE_ICON_COUNT,
  GRID_COLS,
  GRID_ROWS,
  MIN_MATCH,
  payTierFor,
};
