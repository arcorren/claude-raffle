// Clawd pixel-art renderer. Deterministic variants from the entrant's name,
// so the same person gets the same critter on every page.

(function () {
  const GRID_W = 16;
  const GRID_H = 12;
  const BODY_TOP = 3; // rows 0-2 reserved for accessories

  // body rows relative to BODY_TOP (16 chars each)
  const BODY = [
    '...##########...',
    '..############..',
    '..############..',
    '################',
    '################',
    '..############..',
    '..############..',
    '..##...##...##..',
    '..##...##...##..',
  ];

  const BODY_COLORS = [
    '#d97757', // coral (canonical Clawd)
    '#cf4f33', // red-orange
    '#c86046', // rust
    '#c9855f', // tan
    '#e39a77', // peach
    '#d9a05b', // amber
  ];
  const DARK = '#2a1e16';

  // eye pixel sets: [x, y] relative to BODY_TOP
  const EYES = [
    // dots
    [[4, 2], [5, 2], [4, 3], [5, 3], [10, 2], [11, 2], [10, 3], [11, 3]],
    // sunglasses
    [[3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2],
     [3, 3], [4, 3], [5, 3], [10, 3], [11, 3], [12, 3]],
    // > < squint
    [[4, 2], [5, 3], [4, 4], [11, 2], [10, 3], [11, 4]],
    // sleepy (closed lids)
    [[4, 3], [5, 3], [6, 3], [9, 3], [10, 3], [11, 3]],
    // wink (left open, right closed)
    [[4, 2], [5, 2], [4, 3], [5, 3], [10, 3], [11, 3]],
    // surprised (tall eyes)
    [[4, 1], [5, 1], [4, 2], [5, 2], [4, 3], [5, 3], [10, 1], [11, 1], [10, 2], [11, 2], [10, 3], [11, 3]],
    // dizzy rings
    [[3, 1], [4, 1], [5, 1], [3, 2], [5, 2], [3, 3], [4, 3], [5, 3],
     [10, 1], [11, 1], [12, 1], [10, 2], [12, 2], [10, 3], [11, 3], [12, 3]],
    // happy ^ ^
    [[3, 3], [4, 2], [5, 3], [10, 3], [11, 2], [12, 3]],
    // beady (tiny close-set)
    [[5, 2], [10, 2]],
    // determined brows
    [[3, 1], [4, 1], [5, 1], [4, 3], [5, 3], [10, 1], [11, 1], [12, 1], [10, 3], [11, 3]],
    // spirals — one continuous whirl per eye, inset so the body outline stays visible:
    //   ####
    //   ...#
    //   ##.#
    //   #..#
    //   ####
    [[3, 1], [4, 1], [5, 1], [6, 1],
     [6, 2],
     [3, 3], [4, 3], [6, 3],
     [3, 4], [6, 4],
     [3, 5], [4, 5], [5, 5], [6, 5],
     [9, 1], [10, 1], [11, 1], [12, 1],
     [12, 2],
     [9, 3], [10, 3], [12, 3],
     [9, 4], [12, 4],
     [9, 5], [10, 5], [11, 5], [12, 5]],
    // third eye (dots plus one centered a row above, fully inside the face)
    [[4, 2], [5, 2], [4, 3], [5, 3], [10, 2], [11, 2], [10, 3], [11, 3], [7, 1], [8, 1], [7, 2], [8, 2]],
  ];

  function hashName(name) {
    let h = 2166136261;
    const s = name.toLowerCase();
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function variantFor(name) {
    const h = hashName(name);
    return {
      color: BODY_COLORS[h % BODY_COLORS.length],
      eyes: EYES[(h >>> 4) % EYES.length],
      size: 0.85 + ((h >>> 8) % 5) * 0.075, // 0.85 – 1.15
    };
  }

  // Draws a specific variant into a canvas. px = size of one grid pixel.
  function drawVariant(canvas, v, px) {
    px = px || 4;
    canvas.width = GRID_W * px;
    canvas.height = GRID_H * px;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = v.color;
    BODY.forEach((row, y) => {
      for (let x = 0; x < GRID_W; x++) {
        if (row[x] === '#') ctx.fillRect(x * px, (BODY_TOP + y) * px, px, px);
      }
    });

    // official Clawd is eyes-only: no nose, no mouth, no accessories
    ctx.fillStyle = DARK;
    v.eyes.forEach(([x, y]) => ctx.fillRect(x * px, (BODY_TOP + y) * px, px, px));
    return v;
  }

  // Variant for a name, with an optional custom look {c, e} (color/eye indexes)
  // overriding the hashed defaults. Size always stays hash-derived.
  function variantWithLook(name, look) {
    const v = variantFor(name);
    if (look && Number.isInteger(look.c) && Number.isInteger(look.e)) {
      v.color = BODY_COLORS[Math.abs(look.c) % BODY_COLORS.length];
      v.eyes = EYES[Math.abs(look.e) % EYES.length];
    }
    return v;
  }

  // Draws the deterministic critter for a name.
  function drawClawd(canvas, name, px) {
    return drawVariant(canvas, variantFor(name), px);
  }

  window.Clawd = { drawClawd, drawVariant, variantFor, variantWithLook, BODY_COLORS, EYES, GRID_W, GRID_H };
})();
