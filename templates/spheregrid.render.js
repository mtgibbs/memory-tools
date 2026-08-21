// spheregrid renderer — shared by the generated HTML page and the Obsidian
// plugin, so there is exactly one implementation of the map. The page inlines
// this file; the plugin imports it. Two renderers would drift, and the drift
// would be invisible until someone noticed the two views disagreed.
//
//   createSphereGrid({ canvas, data, tooltip?, onOpenNote, ambient?, storage? })
//     -> { P, N, E, R, flyTo, flyOut, setFocus, save, destroy }
//
// Everything about layout still comes from the generator. This draws it.

export function createSphereGrid(opts) {
const DATA = opts.data;
const AMBIENT = !!opts.ambient;
let stopped = false;
const store = opts.storage || {
  get: () => { try { return localStorage.getItem("spheregrid-opts"); } catch (e) { return null; } },
  set: v => { try { localStorage.setItem("spheregrid-opts", v); } catch (e) {} },
};

const N = DATA.nodes, E = DATA.edges, R = DATA.realms, CORR = DATA.corridors;
const GOLD = "#ffd54a", ASH = "#5c5c66", CHAL = "#ff5d3d", ACCENT = "#ff7a33";
const VOID = "#05060a";
const VIG = { c: null, w: 0, h: 0 };

// Deterministic starfield. Flat black reads as "nothing here"; a field with
// depth reads as space with things in it, which is the difference between a
// diagram and a place. Seeded so the sky is the same sky on every load.
function rng(seed) {
  return () => (seed = seed + 0x6D2B79F5 | 0,
    (Math.imul(seed ^ seed >>> 15, 1 | seed) ^ (seed + Math.imul(seed ^ seed >>> 7, 61 | seed))) >>> 0) / 4294967296;
}
const STARS = (() => {
  const r = rng(0x5EED), out = [];
  for (let i = 0; i < 900; i++)
    out.push({ x: (r() - 0.5) * 3400, y: (r() - 0.5) * 2400,
               s: 0.35 + r() * 1.05, tier: i % 8 });
  return out;
})();

// Node bodies are lit, not filled. Canvas shadowBlur costs too much per frame at
// this count, so each colour gets one cached sprite of stacked translucent
// discs — the same falloff, paid for once.
const glowCache = new Map();
function glowSprite(col) {
  let c = glowCache.get(col);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = c.height = 96;
  const g = c.getContext("2d");
  g.fillStyle = col;
  for (let i = 10; i >= 1; i--) {
    g.globalAlpha = 0.026;
    g.beginPath(); g.arc(48, 48, i * 4.8, 0, 7); g.fill();
  }
  glowCache.set(col, c);
  return c;
}

// ---- display options ------------------------------------------------------
// Ghosts default OFF. An inferred link is vocabulary overlap, and drawing it at
// the same weight as something you wrote is how machine echo starts looking
// like corroboration.
const DEFAULTS = { ghosts: false, lattice: true, chords: 0.17, realmLabels: true,
                   noteLabels: "auto", glow: true, motion: true };
const P = { ...DEFAULTS };
try { Object.assign(P, JSON.parse(store.get() || "{}")); } catch (e) {}
const save = () => store.set(JSON.stringify(P));

// ---- index ----------------------------------------------------------------
const realmOf = new Map(R.map(r => [r.name, r]));
R.forEach(r => { r.members = []; r.lit = 0; });
N.forEach((n, i) => {
  n.i = i; n.adj = new Set();
  n.hx = n.x; n.hy = n.y;              // the assigned slot — the map's actual claim
  n.vx = 0; n.vy = 0;
  n.R = realmOf.get(n.realm);
  n.R.members.push(n);
  n.rad = 3.6 + Math.min(11, Math.sqrt(n.conn) * 2.2);
  n.anchor = (n.hop === 0);
  n.ph = (i * 2.399963229728653) % (Math.PI * 2);   // wobble phase, stable per node
});
E.forEach(e => { N[e.s].adj.add(e.t); N[e.t].adj.add(e.s); });

// The pods ARE the track. Each is a small ring of notes of one type, chained
// outward from the anchor, which is the shape FFX actually draws — small circles
// joined by visible line, not a field of dots. The generator computes them
// because it is the thing that knows which type a note declared.

R.forEach(r => { if (r.centre) r.hue = 24; });   // the accent is reserved for home
R.forEach(r => { r.chord = "hsl(" + r.hue + ",42%,74%)"; });   // built once, not per edge per frame

// Lightness carries depth: notes near the anchor read brighter than the rim, so
// "how far from what this realm is about" survives even though POSITION now
// encodes type rather than distance.
function nodeFill(n) {
  if (n.dead) return null;                       // hollow — drawn as an outline
  const deep = n.R.rings ? Math.min(1, n.hop / Math.max(1, n.R.rings)) : 0;
  const sat = (n.R.centre ? 78 : 64) - deep * 10;
  return "hsl(" + n.R.hue + "," + sat.toFixed(0) + "%," + (76 - deep * 22).toFixed(0) + "%)";
}
N.forEach(n => {
  n.fill = nodeFill(n);
  // bloom takes a saturated, darker colour than the body — blooming the body's
  // near-white is what turned the map into fog the first time
  n.glow = n.gold ? "hsl(44,92%,52%)" : "hsl(" + n.R.hue + ",88%,52%)";
});

// hemisphere captions, only when the map actually has two hemispheres
const SIDES = (() => {
  const w = R.filter(r => r.work), p = R.filter(r => !r.work);
  if (!w.length || !p.length) return null;
  const mid = g => {
    const y0 = Math.min(...g.map(r => r.y - r.rad));
    return { x: g.reduce((s, r) => s + r.x, 0) / g.length, y: y0 - 34 };
  };
  return [{ ...mid(p), label: "PERSONAL" }, { ...mid(w), label: "WORK" }];
})();

// ---- camera ---------------------------------------------------------------
const cv = opts.canvas, ctx = cv.getContext("2d");
const tip = opts.tooltip || null;
let scale = 1, tx = 0, ty = 0, dpr = 1, vw = 1, vh = 1;
let tgtS = null, tgtX = 0, tgtY = 0;
let baseS = 1, baseX = 0, baseY = 0;

function bounds() {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const r of R) {
    x0 = Math.min(x0, r.x - r.rad); y0 = Math.min(y0, r.y - r.rad);
    x1 = Math.max(x1, r.x + r.rad); y1 = Math.max(y1, r.y + r.rad);
  }
  return [x0, y0, x1, y1];
}
// The canvas's own box, never the window's. Read fresh on pointer events
// because a pane can move without resizing — dragging a split, collapsing the
// sidebar — and a cached rect would silently go stale.
function box() { return cv.getBoundingClientRect(); }
function measure() {
  dpr = Math.min(1.5, window.devicePixelRatio || 1);
  const r = box();
  vw = Math.max(1, Math.round(r.width));
  vh = Math.max(1, Math.round(r.height));
  cv.width = vw * dpr; cv.height = vh * dpr;
  const [x0, y0, x1, y1] = bounds();
  baseS = Math.min(vw / (x1 - x0 + 120), vh / (y1 - y0 + 120));
  baseX = vw / 2 - (x0 + x1) / 2 * baseS;
  baseY = vh / 2 - (y0 + y1) / 2 * baseS;
  return baseS > 0 && isFinite(baseS);
}
// A window that reports zero width at script time — a background tab, an iframe
// that has not been laid out — produced baseS = 0, so scale was 0 and the canvas
// stayed black forever. Nothing later reset it: resize recomputes the base but
// never the live camera. Fit is retried until the viewport is real.
function fit() {
  const ok = measure();
  if (ok) { scale = baseS; tx = baseX; ty = baseY; }
  return ok;
}
if (!fit()) {
  const retry = () => { if (!fit()) requestAnimationFrame(retry); };
  requestAnimationFrame(retry);
}
const onResize = () => {
  const had = scale > 0;
  measure();
  if (!had) fit();                                  // first real layout: adopt it
};
addEventListener("resize", onResize);
// A pane can resize while the window does not — split dragged, sidebar toggled.
const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
if (ro) ro.observe(cv);
function flyTo(r, pad) {
  // the old 2.2 ceiling meant a twelve-note galaxy still sat small in the frame
  // after you asked to go into it, which is most of why zoom felt inert
  tgtS = Math.min(7, Math.min(vw, vh) / (r.rad * 2 + (pad || 220)));
  tgtX = vw / 2 - r.x * tgtS;
  tgtY = vh / 2 - r.y * tgtS;
}
function flyOut() { tgtS = baseS; tgtX = baseX; tgtY = baseY; }

// ---- level of detail ------------------------------------------------------
// One world, one coordinate space, camera moves — so a galaxy is always in the
// same place and you can build a memory of where things are. Detail is a
// function of on-screen size alone; nothing is re-laid-out on navigation.
//
// The threshold is deliberately low. Everything draws at the fitted view — the
// packed lattice is the picture, and a level-of-detail rule that hides it until
// you zoom in is answering a question this corpus does not ask. Blobs are the
// graceful degradation for zooming far out, not the resting state.
const BLOB_PX = 13, FULL_PX = 26;
function detail(r) {                                // 0 = blob, 1 = full grid
  const px = r.rad * scale;
  if (px <= BLOB_PX) return 0;
  if (px >= FULL_PX) return 1;
  return (px - BLOB_PX) / (FULL_PX - BLOB_PX);
}

// ---- motion: animation, never layout --------------------------------------
// Springs pull each node to the slot the generator assigned. Dragging displaces
// a node and letting go returns it. Nothing here can change where a node lives,
// which is the whole difference from the force map.
let settle = 1;
N.forEach(n => {                                    // assemble on load, then hold
  const a = n.ph, d = 90 + (n.i % 37) * 6;
  n.x = n.hx + Math.cos(a) * d; n.y = n.hy + Math.sin(a) * d;
});
function stepSim(t) {
  settle *= 0.995;
  for (const n of N) {
    if (n === dragNode) continue;
    const wob = P.motion ? 1.15 : 0;
    const hx = n.hx + Math.cos(t * 0.00021 + n.ph) * wob;
    const hy = n.hy + Math.sin(t * 0.00017 + n.ph) * wob;
    n.vx = (n.vx + (hx - n.x) * 0.055) * 0.86;
    n.vy = (n.vy + (hy - n.y) * 0.055) * 0.86;
    n.x += n.vx; n.y += n.vy;
  }
}

// ---- draw -----------------------------------------------------------------
function draw(t) {
  if (!(scale > 0)) fit();                          // never render into a dead camera
  stepSim(t);
  if (tgtS !== null) {
    scale += (tgtS - scale) * 0.07;
    tx += (tgtX - tx) * 0.07; ty += (tgtY - ty) * 0.07;
    if (Math.abs(tgtS - scale) / tgtS < 0.002) { scale = tgtS; tx = tgtX; ty = tgtY; tgtS = null; }
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = VOID; ctx.fillRect(0, 0, vw, vh);
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * tx, dpr * ty);
  const k = 1 / scale;                              // keep strokes screen-constant

  // What is on screen, in world units. Everything below asks before it draws:
  // at 35 realms most of the map leaves the viewport the moment you zoom in, and
  // all of it was being drawn anyway.
  const vx0 = -tx * k, vy0 = -ty * k;
  const vx1 = (vw - tx) * k, vy1 = (vh - ty) * k;
  const onScreen = (x, y, pad) =>
    x + pad > vx0 && x - pad < vx1 && y + pad > vy0 && y - pad < vy1;
  for (const r of R) r.vis = onScreen(r.x, r.y, r.rad + 40 * k);

  // 900 stars cost 900 beginPath + 900 arc + 900 fill — a quarter of every
  // frame's draw calls, spent on the backdrop. Eight alpha tiers, one path each,
  // and the twinkle moves the tier instead of the star.
  ctx.fillStyle = "#dfe6ff";
  for (let tier = 0; tier < 8; tier++) {
    ctx.globalAlpha = (0.05 + tier * 0.055) * (0.68 + 0.32 * Math.sin(t * 0.0005 + tier));
    ctx.beginPath();
    for (const s of STARS) {
      if (s.tier !== tier || !onScreen(s.x, s.y, 2 * k)) continue;
      const rr = s.s * k;
      ctx.moveTo(s.x + rr, s.y);
      ctx.arc(s.x, s.y, rr, 0, 7);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // corridors first, under everything: realm to realm, weight by link count
  for (const c of CORR) {
    const a = realmOf.get(c.a), b = realmOf.get(c.b);
    if (!a || !b) continue;
    const hot = hoverRealm && (a === hoverRealm || b === hoverRealm);
    ctx.strokeStyle = c.auth ? (hot ? "rgba(255,170,120,.75)" : "rgba(186,168,224,.38)")
                             : "rgba(150,150,170,.14)";
    ctx.globalAlpha = Math.max(dim(a), dim(b));
    ctx.lineWidth = (hot ? 2.2 : Math.min(3, 0.7 + c.n * 0.28)) * k;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    if (a.work !== b.work) {                        // a lock sits on the crossing
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      ctx.strokeStyle = "rgba(255,190,90,.75)"; ctx.lineWidth = 1.6 * k;
      ctx.beginPath(); ctx.arc(mx, my, 7 * k, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx - 4 * k, my); ctx.lineTo(mx + 4 * k, my); ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
  for (const r of R) {
    const d = detail(r);
    r.d = d;
    if (!r.vis) continue;
    ctx.globalAlpha = dim(r);
    if (P.glow) {                                   // the field: a soft well per galaxy
      // geometry is fixed in world space, so this is built once per realm for
      // the life of the page instead of 35 times a frame
      if (!r._well) {
        r._well = ctx.createRadialGradient(r.x, r.y, r.rad * 0.15, r.x, r.y, r.rad * 1.25);
        r._well.addColorStop(0, "hsla(" + r.hue + ",75%,52%,.07)");
        r._well.addColorStop(1, "hsla(" + r.hue + ",70%,60%,0)");
      }
      ctx.fillStyle = r._well;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.rad * 1.25, 0, 7); ctx.fill();
    }
    if (d > 0) {                                    // rim of the disc
      ctx.globalAlpha = d * dim(r);
      // A dashed circle is a diagram. A fine ring with graduations is an
      // instrument, and it costs the same to draw.
      ctx.strokeStyle = "hsla(" + r.hue + ",50%,60%,.30)";
      ctx.lineWidth = 0.9 * k;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.rad, 0, 7); ctx.stroke();
      const ticks = r.rad * scale < 70 ? 0 : r.minor ? 12 : 36;
      ctx.strokeStyle = "hsla(" + r.hue + ",55%,68%,.34)";
      ctx.lineWidth = 0.9 * k;
      ctx.beginPath();
      for (let i = 0; i < ticks; i++) {
        const a = 2 * Math.PI * i / ticks;
        const long = i % (ticks / 4) === 0;
        const t0 = r.rad - (long ? 7 : 3.5) * k, t1 = r.rad + (long ? 2.5 : 0) * k;
        ctx.moveTo(r.x + t0 * Math.cos(a), r.y + t0 * Math.sin(a));
        ctx.lineTo(r.x + t1 * Math.cos(a), r.y + t1 * Math.sin(a));
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // the board, under the moves
  if (P.lattice) {
    for (const r of R) {
      if (r.d <= 0 || !r.pods || !r.vis) continue;
      const al = r.d * dim(r) * (hoverNode ? 0.4 : 1);
      ctx.strokeStyle = "#7d8496";                    // steel: structure, never data
      // spokes first, so a pod ring sits on top of the line that feeds it
      ctx.globalAlpha = al * 0.42;
      ctx.lineWidth = 1.0 * k;
      ctx.beginPath();
      for (const [from, to] of r.podLinks) {
        const b = r.pods[to];
        const ax = from < 0 ? r.x : r.x + r.pods[from].x;
        const ay = from < 0 ? r.y : r.y + r.pods[from].y;
        ctx.moveTo(ax, ay); ctx.lineTo(r.x + b.x, r.y + b.y);
      }
      ctx.stroke();
      ctx.globalAlpha = al * 0.62;
      ctx.lineWidth = 1.1 * k;
      ctx.beginPath();
      for (const pod of r.pods) {
        if (pod.r < 2) continue;
        ctx.moveTo(r.x + pod.x + pod.r, r.y + pod.y);
        ctx.arc(r.x + pod.x, r.y + pod.y, pod.r, 0, 7);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // chords — the link graph, drawn but weightless
  const hi = hoverNode ? hoverNode.i : -1;
  for (const e of E) {
    const a = N[e.s], b = N[e.t];
    const d = Math.min(a.R.d, b.R.d);
    if (d <= 0 || (!a.R.vis && !b.R.vis)) continue;
    if (e.g && !P.ghosts) continue;
    const hot = e.s === hi || e.t === hi;
    ctx.globalAlpha = (hot ? 0.9 : d * (e.g ? 0.16 : P.chords * (hoverNode ? 0.5 : 1)))
                    * Math.max(dim(a.R), dim(b.R));
    ctx.strokeStyle = hot ? "#fff"
      : e.g ? "#8f8fa8"
      : e.b ? "#c39bf5"
      : a.R.chord;
    ctx.lineWidth = (hot ? 1.7 : 0.9) * k;
    if (e.g) ctx.setLineDash([2 * k, 5 * k]); else ctx.setLineDash([]);
    const cx = (a.R.x + b.R.x) / 2, cy = (a.R.y + b.R.y) / 2;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const BEND = e.i ? 0.45 : 0.22;
    ctx.beginPath(); ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(mx + (cx - mx) * BEND, my + (cy - my) * BEND, b.x, b.y);
    ctx.stroke();
  }
  ctx.setLineDash([]); ctx.globalAlpha = 1;

  // nodes, or the blob that stands in for them
  for (const r of R) {
    if (!r.vis) { r.blobR = 0; continue; }
    if (r.d < 1) {                                  // zoomed out: one body per galaxy
      // screen-constant so a galaxy stays readable at any zoom, but modest:
      // a blob that grows in world units drags the whole fit out with it
      const a = 1 - r.d, br = (Math.sqrt(r.n) * 2.3 + 4.5) / scale;
      const rr = Math.min(br, r.rad * 0.9);
      ctx.globalAlpha = a;
      ctx.fillStyle = "hsl(" + r.hue + ",60%," + (r.minor ? 46 : 64) + "%)";
      ctx.beginPath(); ctx.arc(r.x, r.y, rr, 0, 7); ctx.fill();
      if (r === hoverRealm) {
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.6 * k;
        ctx.beginPath(); ctx.arc(r.x, r.y, rr + 5 * k, 0, 7); ctx.stroke();
      }
      r.blobR = rr;
      ctx.globalAlpha = 1;
    } else r.blobR = 0;
    if (r.d <= 0) continue;
    ctx.globalAlpha = r.d * dim(r);
    for (const n of r.members) {
      const rr = n.rad * (n.anchor ? 1.7 : 1);
      if (n.dead) {                                 // still terrain, just unlit
        ctx.strokeStyle = ASH; ctx.lineWidth = 1.2 * k;
        ctx.beginPath(); ctx.arc(n.x, n.y, rr, 0, 7); ctx.stroke();
      } else {
        const px = rr * scale;                    // how big this bead actually is
        if (P.glow && px > 2.2) {                   // it emits before it exists
          const G = rr * (n.anchor ? 3.6 : 2.7);
          ctx.drawImage(glowSprite(n.glow), n.x - G, n.y - G, G * 2, G * 2);
        }
        ctx.fillStyle = n.fill;
        ctx.beginPath(); ctx.arc(n.x, n.y, rr, 0, 7); ctx.fill();
        // a bead, not a dot: one offset highlight reads as a lit sphere and costs
        // one more arc, where a per-node gradient would allocate once per node a
        // frame. Below ~4px neither the highlight nor the rim is visible at all,
        // so both are skipped rather than drawn into a single pixel.
        if (px > 4) {
          ctx.fillStyle = "rgba(255,255,255,.20)";
          ctx.beginPath(); ctx.arc(n.x - rr * 0.3, n.y - rr * 0.34, rr * 0.44, 0, 7); ctx.fill();
          ctx.strokeStyle = "rgba(0,0,0,.32)"; ctx.lineWidth = 0.9 * k;
          ctx.beginPath(); ctx.arc(n.x, n.y, rr, 0, 7); ctx.stroke();
        }
      }
      if (n.gold && !n.dead) {                      // identity: a ring, not a repaint
        ctx.strokeStyle = GOLD; ctx.lineWidth = 1.4 * k;
        ctx.beginPath(); ctx.arc(n.x, n.y, rr + 2.4 * k, 0, 7); ctx.stroke();
      }
      if (n.anchor) {                               // what the realm is about
        ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 1.4 * k;
        ctx.beginPath(); ctx.arc(n.x, n.y, rr + 4.5 * k, 0, 7); ctx.stroke();
      }
      if (n.chal) {                                 // doubt is a broken ring, not a deletion
        ctx.strokeStyle = CHAL; ctx.lineWidth = 1.5 * k;
        for (let s = 0; s < 3; s++) {
          const a0 = s * 2.094 + 0.35;
          ctx.beginPath(); ctx.arc(n.x, n.y, rr + 3 * k, a0, a0 + 1.25); ctx.stroke();
        }
      }
      if (n === hoverNode) {
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.6 * k;
        ctx.beginPath(); ctx.arc(n.x, n.y, rr + 6 * k, 0, 7); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  // Zoom earns its keep by disclosing more, not by making the same dots bigger.
  // Tiers are measured against the fitted scale so they behave the same on a
  // laptop and on the wall display, where baseS differs by 3x.
  const z = scale / (baseS || 1);
  const tier = P.noteLabels !== "auto" ? P.noteLabels
             : z > 2.8 ? "all" : z > 1.5 ? "hubs" : "hover";

  // labels last so nothing paints over them
  ctx.textAlign = "center";
  ctx.lineJoin = "round";
  const label = (s, x, y) => {                      // halo, then fill
    ctx.strokeStyle = "rgba(8,8,11,.92)";
    ctx.lineWidth = 3.2 * k;
    ctx.strokeText(s, x, y);
    ctx.fillText(s, x, y);
  };
  for (const r of R) {
    if (!P.realmLabels) break;
    if (!r.vis) continue;
    // a one-note realm names itself twice — its realm label and its only note's
    // label say nearly the same thing on top of each other. The note wins.
    if (r.n === 1 && r !== hoverRealm) continue;
    if (r.d <= 0 && r.minor && r !== hoverRealm) continue;
    const inside = r.d > 0;
    const y = inside ? r.y - r.rad + 15 * k : r.y - (r.blobR || 6) - 11 * k;
    ctx.globalAlpha = dim(r);
    ctx.fillStyle = r.centre ? "rgba(255,168,105,.98)" : "hsla(" + r.hue + ",70%,80%,.94)";
    const fs = Math.max(9.5, Math.min(13, r.rad * 0.085));
    // tracked small caps for the place names, monospace for the file names —
    // the map should say out loud that one of these is territory and one is files
    ctx.font = "600 " + fs * k + "px var(--ui), sans-serif";
    ctx.letterSpacing = (fs * 0.16 * k) + "px";
    label(r.short.toUpperCase(), r.x, y);
    ctx.letterSpacing = "0px";
    if (!r.minor || r === hoverRealm) {
      ctx.fillStyle = "rgba(158,158,172,.6)";
      ctx.font = (fs * 0.68 * k) + "px var(--mono), monospace";
      label(r.n + " notes", r.x, y + fs * 1.05 * k);
    }
    ctx.globalAlpha = 1;
  }
  // Note labels are placed, not just drawn. The spiral packs nodes 21 units
  // apart while a name is ten times that wide, so a galaxy naming everything it
  // holds produced stacked, unreadable text. Candidates are ranked, then each is
  // dropped if its box overlaps one already placed — the important ones get the
  // room and the rest wait for you to zoom or hover.
  ctx.font = (10.5 / scale) + "px var(--mono), monospace";
  const cand = [];
  for (const r of R) {
    if (r.d <= 0 || !r.vis) continue;
    for (const n of r.members) {
      const near = hoverNode && (n === hoverNode || hoverNode.adj.has(n.i));
      const show = tier === "all" || near || n.anchor || r === focusRealm ||
                   (tier === "hubs" && n.conn >= 8);
      if (show) cand.push({ n, r, near, rank: near ? 0 : n.anchor ? 1 : 2 - n.conn / 1000 });
    }
  }
  cand.sort((a, b) => a.rank - b.rank);
  const taken = [];
  const pad = 3 / scale, lh = 13 / scale;
  for (const c of cand) {
    const n = c.n;
    const w = ctx.measureText(n.stem).width + pad * 2;
    const x = n.x, y = n.y + n.rad * (n.anchor ? 1.7 : 1) + 12 / scale;
    const box = [x - w / 2, y - lh * 0.8, x + w / 2, y + lh * 0.3];
    if (taken.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
    taken.push(box);
    ctx.globalAlpha = c.r.d * dim(c.r);
    ctx.fillStyle = c.near ? "#fff" : n.anchor ? "rgba(238,238,245,.94)" : "rgba(194,194,206,.78)";
    label(n.stem, x, y);
  }
  ctx.globalAlpha = 1;
  if (SIDES) {                                      // the split, said out loud
    ctx.textAlign = "center";
    ctx.font = "600 " + 26 * k + "px var(--ui), sans-serif";
    ctx.letterSpacing = (5 * k) + "px";
    for (const s of SIDES) {
      ctx.fillStyle = "rgba(154,160,184,.24)";
      ctx.fillText(s.label, s.x, s.y);
    }
    ctx.letterSpacing = "0px";
  }

  // vignette last, in screen space — pulls the eye to the middle and stops the
  // starfield from fighting the chrome at the corners
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!VIG.c || VIG.w !== vw || VIG.h !== vh) {
    VIG.w = vw; VIG.h = vh;
    VIG.c = document.createElement("canvas");
    VIG.c.width = Math.max(1, Math.ceil(vw / 4));
    VIG.c.height = Math.max(1, Math.ceil(vh / 4));
    const vc = VIG.c.getContext("2d"), W = VIG.c.width, H = VIG.c.height;
    const vg = vc.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32,
                                       W / 2, H / 2, Math.max(W, H) * 0.78);
    vg.addColorStop(0, "rgba(5,6,10,0)");
    vg.addColorStop(1, "rgba(5,6,10,.80)");
    vc.fillStyle = vg; vc.fillRect(0, 0, W, H);
  }
  ctx.drawImage(VIG.c, 0, 0, vw, vh);

  requestAnimationFrame(draw);
}

// ---- interaction ----------------------------------------------------------
let dragNode = null, panning = false, moved = 0, px = 0, py = 0;
let hoverNode = null, hoverRealm = null, focusRealm = null;
// "clicked on and zoomed to, where another galaxy opens as the new center in
// that space" — the camera move alone does not read as that, because the rest of
// the map keeps competing for the eye. Focus recedes everything else instead of
// re-laying anything out, so position stays stable and you can still see where
// the galaxy you are in sits relative to its neighbours.
const dim = r => (!focusRealm || r === focusRealm) ? 1 : 0.16;
function setFocus(r) {
  focusRealm = r;
  if (r) flyTo(r, 90); else flyOut();
}
const onKey = ev => { if (ev.key === "Escape") setFocus(null); };
addEventListener("keydown", onKey);
const lx = ev => ev.clientX - box().left;
const ly = ev => ev.clientY - box().top;
const world = ev => { const r = box();
  return [(ev.clientX - r.left - tx) / scale, (ev.clientY - r.top - ty) / scale]; };
function pick(ev) {
  const [wx, wy] = world(ev);
  let bn = null, bd = 1e9, br = null, brd = 1e9;
  for (const r of R) {
    const dr = Math.hypot(r.x - wx, r.y - wy);
    // A realm is hit by its DISC. This used to be gated on the blob level of
    // detail, so when blobs stopped triggering, click-to-fly quietly died and
    // zoom degraded to plain magnification with nothing to aim it at.
    const reach = r.d > 0 ? r.rad : Math.max(r.blobR + 8 / scale, 14 / scale);
    if (dr < reach && dr < brd) { br = r; brd = dr; }
    if (r.d <= 0 || dr > r.rad + 30) continue;
    for (const n of r.members) {
      const d = Math.hypot(n.x - wx, n.y - wy);
      if (d < Math.max(n.rad + 5 / scale, 10 / scale) && d < bd) { bn = n; bd = d; }
    }
  }
  return [bn, br];
}
cv.addEventListener("pointerdown", ev => {
  try { cv.setPointerCapture(ev.pointerId); } catch (e) {}
  cv.classList.add("grabbing");
  moved = 0; px = lx(ev); py = ly(ev);
  dragNode = pick(ev)[0];
  panning = !dragNode;
  tgtS = null;
});
cv.addEventListener("pointermove", ev => {
  const cx = lx(ev), cy = ly(ev);
  moved += Math.abs(cx - px) + Math.abs(cy - py);
  if (dragNode) {
    const [wx, wy] = world(ev);
    dragNode.x = wx; dragNode.y = wy; dragNode.vx = 0; dragNode.vy = 0;
  } else if (panning) { tx += cx - px; ty += cy - py; }
  px = cx; py = cy;
  if (!dragNode && !panning) {
    const [n, r] = pick(ev);
    hoverNode = n; hoverRealm = n ? n.R : r;
  }
  if (hoverNode && !panning && tip) {
    const n = hoverNode;
    tip.style.display = "block";
    tip.style.left = Math.min(vw - 350, lx(ev) + 14) + "px";
    tip.style.top = (ly(ev) + 16) + "px";
    tip.innerHTML = "<b>" + n.stem + "</b><br>" + n.short +
      " &middot; " + n.type + (n.anchor ? " &middot; anchor" : "") + " &middot; " + n.hop + " hop" + (n.hop === 1 ? "" : "s") + " out<br>" +
      n.conn + " links, " + n.deg + " authored inbound" +
      (n.gold ? "<br>identity note" : "") +
      (n.dead ? "<br><span style='color:#8a8a96'>EXPIRED — history, not current</span>" : "") +
      (n.chal ? "<br><span style='color:#ff5d3d'>" + n.chal + " open challenge(s)</span>" : "");
  } else if (tip) tip.style.display = "none";
});
cv.addEventListener("pointerup", ev => {
  cv.classList.remove("grabbing");
  if (moved < 5) {
    const [n, r] = pick(ev);
    if (!n && !r) setFocus(null);          // clicking the void backs all the way out
    else if (!n && r) setFocus(r === focusRealm ? null : r);
    else if (n) {
      opts.onOpenNote(n);
    }
  }
  dragNode = null; panning = false;
});
cv.addEventListener("wheel", ev => {
  ev.preventDefault(); tgtS = null;
  const f = Math.exp(-ev.deltaY * 0.0016);
  const [wx, wy] = world(ev);
  scale = Math.max(baseS * 0.35, Math.min(6, scale * f));
  tx = lx(ev) - wx * scale; ty = ly(ev) - wy * scale;
}, { passive: false });
cv.addEventListener("dblclick", () => setFocus(null));

requestAnimationFrame(draw);

return {
  P, N, E, R, flyTo, flyOut, setFocus, save,
  // world <-> canvas-local, exposed because it is the mapping that broke when
  // this renderer was first embedded in a pane, and a mapping you cannot read
  // is a mapping you cannot test
  /** Put every node on its assigned slot immediately, skipping the assembly
   *  animation. The slot is the map's actual claim; the flight to it is
   *  decoration, and anything that needs positions to be true right now — a
   *  test, a screenshot, a "reset layout" — should not have to wait for it. */
  settleNow() {
    for (const n of N) { n.x = n.hx; n.y = n.hy; n.vx = 0; n.vy = 0; }
  },
  screenOf: n => ({ x: n.x * scale + tx, y: n.y * scale + ty }),
  worldOf: (cx, cy) => ({ x: (cx - tx) / scale, y: (cy - ty) / scale }),
  get focusRealm() { return focusRealm; },
  destroy() {
    stopped = true;
    removeEventListener("resize", onResize);
    if (ro) ro.disconnect();
    removeEventListener("keydown", onKey);
  },
};
}
