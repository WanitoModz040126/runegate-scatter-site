#!/usr/bin/env python3
"""
Generates 133 placeholder circular icons into assets/icons/ so the game is
fully testable before the real 133 icons are dropped in.

Filenames match config/paytable.js exactly:
  1.png            -> scatter symbol
  2.png - 13.png    -> the 12 paying symbols (tiered colors)
  14.png - 133.png  -> decorative filler icons (idle shimmer strip)

Replace any/all of these files with your own artwork later -- just keep the
same filenames and square dimensions (recommended 256x256, transparent PNG).
"""
import math
import os
import random
from PIL import Image, ImageDraw, ImageFont

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets', 'icons')
os.makedirs(OUT_DIR, exist_ok=True)

SIZE = 256
random.seed(42)

def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

TIER_COLORS = {
    'scatter':  ('#ff4d5e', '#2a0508'),
    'low':      ('#9fb0c9', '#1c2230'),
    'mid':      ('#3ee6d8', '#0c2624'),
    'high':     ('#e8b84b', '#2e2308'),
    'premium':  ('#c084fc', '#241030'),
    'deco':     ('#5a6478', '#12141c'),
}

def draw_ring_icon(fname, ring_hex, bg_hex, label, glyph='rune'):
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy, r = SIZE / 2, SIZE / 2, SIZE / 2 - 10

    bg = hex_to_rgb(bg_hex)
    ring = hex_to_rgb(ring_hex)

    # Filled dark circle
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=bg + (255,))
    # Outer stroke ring (double ring for a "professional" bevel feel)
    for width, alpha in [(6, 255), (2, 140)]:
        rr = r - width / 2
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=ring + (alpha,), width=width)

    # Inner glyph: simple geometric rune mark unique-ish per icon
    inner_r = r * 0.55
    sides = 6 if glyph == 'rune' else 3
    pts = []
    rot = random.uniform(0, math.pi)
    for i in range(sides):
        ang = rot + i * (2 * math.pi / sides)
        pts.append((cx + inner_r * math.cos(ang), cy + inner_r * math.sin(ang)))
    d.polygon(pts, outline=ring + (255,), width=4)

    # Small center dot
    dot_r = r * 0.10
    d.ellipse([cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r], fill=ring + (255,))

    # Label text (small, bottom) for placeholder identification
    try:
        font = ImageFont.load_default()
    except Exception:
        font = None
    text = label
    bbox = d.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text((cx - tw / 2, cy + r * 0.62 - th / 2), text, fill=(255, 255, 255, 230), font=font)

    img.save(os.path.join(OUT_DIR, fname))

# 1.png = scatter
ring, bg = TIER_COLORS['scatter']
draw_ring_icon('1.png', ring, bg, 'SCATTER', glyph='rune')

# 2-13.png = paytable tiers (matches config/paytable.js ordering)
tier_map = ['low','low','low','low','mid','mid','mid','mid','high','high','high','premium']
for i, tier in enumerate(tier_map, start=2):
    ring, bg = TIER_COLORS[tier]
    draw_ring_icon(f'{i}.png', ring, bg, tier.upper(), glyph='rune')

# 14-133.png = decorative filler, cycling through a soft palette
deco_palette = ['#5a6478', '#4a5568', '#6b7280', '#3ee6d8', '#e8b84b', '#c084fc', '#9fb0c9']
for i in range(14, 134):
    ring = deco_palette[i % len(deco_palette)]
    draw_ring_icon(f'{i}.png', ring, '#12141c', str(i), glyph='tri')

print(f"Generated {len(os.listdir(OUT_DIR))} icons in {OUT_DIR}")
