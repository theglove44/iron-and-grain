'use strict';
// Core rules: state, RNG, map generation, territory, vision, economy, building actions.

const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt = n => { n = Math.floor(n); return n >= 10000 ? (n/1000).toFixed(0)+'k' : n >= 1000 ? (n/1000).toFixed(1)+'k' : String(n); };
const sgn = n => { const r = Math.round(n*10)/10; return (r > 0 ? '+' : '') + (Math.abs(r) >= 10 ? Math.round(r) : r); };

let G = null, VIS = null, FC = new Map();

// ---------- profile (persists across games) ----------
function defProfile() { return {xp:0, games:0, wins:0, best:0, ach:{}, seenHelp:0}; }
function loadProfile() { try { return Object.assign(defProfile(), JSON.parse(localStorage.getItem(PROF_KEY) || '{}')); } catch (e) { return defProfile(); } }
let P = loadProfile();
function saveProfile() { try { localStorage.setItem(PROF_KEY, JSON.stringify(P)); } catch (e) {} }
const xpFor = l => 75 * (l - 1) * l;
function rulerLvl() { let l = 1; while (P.xp >= xpFor(l + 1)) l++; return l; }
function unlock(id) {
  if (P.ach[id]) return;
  const a = ACH.find(a => a.id === id); if (!a) return;
  const before = rulerLvl();
  P.ach[id] = Date.now(); P.xp += a.xp; saveProfile();
  note(`🏆 ${a.n}: +${a.xp} Ruler XP`, 'gold');
  if (rulerLvl() > before) note(`👑 Ruler level ${rulerLvl()}!`, 'gold');
}

// ---------- saving ----------
function save() { if (!G || G.over) return; try { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); } catch (e) { toast('Could not save the game', 'bad'); } }
function loadGame() {
  try { const s = localStorage.getItem(SAVE_KEY); if (!s) return false; G = JSON.parse(s); }
  catch (e) { return false; }
  TCOL = null; FC = new Map(); computeVis(); return true;
}

// ---------- seeded RNG (state lives in G so saves replay consistently) ----------
function rnd() { let t = (G.rs = (G.rs + 0x6D2B79F5) | 0); t = Math.imul(t ^ (t >>> 15), 1 | t); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = a => a[Math.floor(rnd() * a.length)];
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---------- grid helpers ----------
const idx = (x, y) => y * G.w + x;
const inb = (x, y) => x >= 0 && y >= 0 && x < G.w && y < G.h;
const T = (x, y) => G.tiles[y * G.w + x];
const dist = (a, b, c, d) => Math.max(Math.abs(a - c), Math.abs(b - d));
const fac = id => id === BARB ? BARBF : G.f[id];
function hostile(a, b) {
  if (a === b || a == null || b == null || a < 0 || b < 0) return false;
  if (a === BARB || b === BARB) return true;
  if (a === 0) return G.f[b].stance === 'war';
  if (b === 0) return G.f[a].stance === 'war';
  return false;
}
const has = t => !!G.f[0].techs[t];
const hasLegacy = id => G && G.legacy === id;
function hasB(k) { return G.tiles.some(t => t.b && t.b.k === k && t.b.o === 0 && !t.b.pil); }
function maxBLvl(k) { let m = 0; for (const t of G.tiles) if (t.b && t.b.k === k && t.b.o === 0 && !t.b.pil) m = Math.max(m, t.b.lvl); return m; }
function adjB(x, y, ks, o) { let n = 0; for (const [dx, dy] of N8) { const nx = x + dx, ny = y + dy; if (!inb(nx, ny)) continue; const b = T(nx, ny).b; if (b && ks.includes(b.k) && b.o === o) n++; } return n; }
function adjLv(x, y, k, o) { let n = 0; for (const [dx, dy] of N8) { const nx = x + dx, ny = y + dy; if (!inb(nx, ny)) continue; const b = T(nx, ny).b; if (b && b.k === k && b.o === o && !b.pil) n += b.lvl; } return n; }
function adjT(x, y, tt) { let n = 0; for (const [dx, dy] of N8) { const nx = x + dx, ny = y + dy; if (inb(nx, ny) && T(nx, ny).t === tt) n++; } return n; }
function unitAt(x, y) { for (const u of G.units) if (u.x === x && u.y === y) return u; return null; }
function townAt(x, y) { const b = T(x, y).b; return b && b.k === 'hall' ? G.towns.find(t => t.id === b.tid) : null; }
function campAt(x, y) { return G.camps.find(c => c.x === x && c.y === y) || null; }
function capital() { return G.towns.find(t => t.o === 0 && t.cap && t.orig === 0) || G.towns.find(t => t.o === 0); }
function monument() { for (const t of G.tiles) if (t.b && t.b.k === 'monument' && t.b.o === 0) return t.b; return null; }
const unitName = u => u.k === 'hero' ? u.h.name : UNI[u.k].n;

// ---------- map generation ----------
function noiseGrid(w, h, sc) {
  const gw = Math.ceil(w / sc) + 2, g = [];
  for (let i = 0; i < gw * (Math.ceil(h / sc) + 2); i++) g.push(rnd());
  const out = new Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const fx = x / sc, fy = y / sc, x0 = Math.floor(fx), y0 = Math.floor(fy);
    let tx = fx - x0, ty = fy - y0; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const a = g[y0*gw+x0], b = g[y0*gw+x0+1], c = g[(y0+1)*gw+x0], d = g[(y0+1)*gw+x0+1];
    out[y * w + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }
  return out;
}
const quant = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(p * (s.length - 1))]; };

// Returns a predicate telling whether a tile index is on the largest landmass.
function genMap() {
  const {w, h} = G, n = w * h;
  const e1 = noiseGrid(w, h, 6), e2 = noiseGrid(w, h, 2.5), m1 = noiseGrid(w, h, 5), m2 = noiseGrid(w, h, 2);
  const el = [], mo = [];
  for (let i = 0; i < n; i++) {
    const x = i % w, y = (i / w) | 0, edge = Math.min(x, y, w - 1 - x, h - 1 - y);
    el[i] = e1[i] * .7 + e2[i] * .3 - (edge < 1 ? .12 : edge < 2 ? .05 : 0);
    mo[i] = m1[i] * .65 + m2[i] * .35;
  }
  const wT = quant(el, .2), hT = quant(el, .8), mT = quant(el, .93);
  const landMo = mo.filter((_, i) => el[i] >= wT && el[i] < hT);
  const fT = quant(landMo, .66), dT = quant(landMo, .12);
  G.tiles = [];
  for (let i = 0; i < n; i++) {
    let t = 'plains';
    if (el[i] < wT) t = 'water'; else if (el[i] >= mT) t = 'mountain'; else if (el[i] >= hT) t = 'hills';
    else if (mo[i] >= fT) t = 'forest'; else if (mo[i] <= dT) t = 'desert';
    G.tiles.push({t, own:-1, seen:0});
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = T(x, y);
    if (t.t === 'plains' && ((adjT(x, y, 'water') && rnd() < .55) || rnd() < .08)) t.t = 'fertile';
    if (t.t === 'hills') { const r = rnd(); if (r < .14) t.dep = 'iron'; else if (r < .19) t.dep = 'gold'; }
    if (t.t === 'mountain') { const r = rnd(); if (r < .18) t.dep = 'iron'; else if (r < .28) t.dep = 'gold'; }
  }
  const comp = new Int32Array(n).fill(-1); let best = -1, bestSize = 0, cid = 0;
  for (let i = 0; i < n; i++) {
    if (comp[i] >= 0 || G.tiles[i].t === 'water') continue;
    let size = 0; const st = [i]; comp[i] = cid;
    while (st.length) {
      const j = st.pop(); size++; const x = j % w, y = (j / w) | 0;
      for (const [dx, dy] of N8) { const nx = x + dx, ny = y + dy; if (!inb(nx, ny)) continue; const k = idx(nx, ny); if (comp[k] < 0 && G.tiles[k].t !== 'water') { comp[k] = cid; st.push(k); } }
    }
    if (size > bestSize) { bestSize = size; best = cid; }
    cid++;
  }
  return i => comp[i] === best;
}

function pickStarts(k, isMain) {
  const c = [];
  for (let y = 2; y < G.h - 2; y++) for (let x = 2; x < G.w - 2; x++) {
    const t = T(x, y);
    if (!isMain(idx(x, y)) || !['plains','fertile','forest','hills'].includes(t.t)) continue;
    let s = 0;
    for (let yy = y - 2; yy <= y + 2; yy++) for (let xx = x - 2; xx <= x + 2; xx++) {
      const u = T(xx, yy).t; s += u === 'fertile' ? 3 : u === 'plains' ? 2 : (u === 'forest' || u === 'hills') ? 1.5 : u === 'desert' ? .2 : .5;
    }
    c.push({x, y, s});
  }
  c.sort((a, b) => b.s - a.s);
  const pool = c.slice(0, Math.max(12, Math.floor(c.length * .45)));
  const starts = [pick(pool)];
  while (starts.length < k) {
    let best = null, bd = -1;
    for (const p of pool) { const d = Math.min(...starts.map(s => dist(s.x, s.y, p.x, p.y))) + rnd() * 1.5; if (d > bd) { bd = d; best = p; } }
    starts.push(best);
  }
  return starts;
}

// Guarantee every start has wood, stone and farmland nearby so no game is unwinnable.
function prepStart(s) {
  const t = T(s.x, s.y); if (t.t !== 'fertile') t.t = 'plains'; delete t.dep;
  const ring = [];
  for (let y = s.y - 2; y <= s.y + 2; y++) for (let x = s.x - 2; x <= s.x + 2; x++) if (inb(x, y) && !(x === s.x && y === s.y)) ring.push([x, y]);
  const need = (type, from) => {
    if (ring.some(([x, y]) => T(x, y).t === type)) return;
    const c = shuffle(ring.filter(([x, y]) => from.includes(T(x, y).t) && dist(x, y, s.x, s.y) === 2));
    if (c.length) { const tt = T(c[0][0], c[0][1]); tt.t = type; delete tt.dep; }
  };
  need('forest', ['plains','desert','fertile']);
  need('hills', ['plains','desert']);
  const farm = ring.filter(([x, y]) => ['plains','fertile'].includes(T(x, y).t)).length;
  if (farm < 5) for (const [x, y] of ring) { const tt = T(x, y); if (tt.t === 'desert' || tt.t === 'mountain' || tt.t === 'water') { tt.t = 'plains'; delete tt.dep; } }
}

function townName() { for (let k = 0; k < 30; k++) { const n = pick(TN_A) + pick(TN_B); if (!G.towns.some(t => t.name === n)) return n; } return 'New ' + pick(TN_A); }
function randomRealm() { return REALM_A[Math.floor(Math.random() * REALM_A.length)] + ' of ' + REALM_B[Math.floor(Math.random() * REALM_B.length)]; }
const townMaxHp = tw => 100 + 40 * tw.lvl;
const hallRadius = l => [0, 2, 3, 3, 4][l];
function createTown(x, y, o, cap) {
  const tw = {id:G.nid++, x, y, o, name:townName(), lvl:1, hp:140, cap:cap ? 1 : 0, tr:-1, orig:o};
  G.towns.push(tw);
  const t = T(x, y); t.b = {k:'hall', o, tid:tw.id}; t.ruin = 0;
  return tw;
}

function spawnCamp(minD, isMain) {
  for (let k = 0; k < 300; k++) {
    const x = ri(1, G.w - 2), y = ri(1, G.h - 2), t = T(x, y);
    if (t.t === 'water' || t.t === 'mountain' || t.own >= 0 || t.b || t.ruin || unitAt(x, y)) continue;
    if (isMain && !isMain(idx(x, y))) continue;
    if (VIS && VIS[idx(x, y)]) continue;
    if (G.towns.some(tw => dist(tw.x, tw.y, x, y) < minD) || G.camps.some(c => dist(c.x, c.y, x, y) < 4)) continue;
    G.camps.push({id:G.nid++, x, y, hp:60, spawn:ri(5, 9)});
    return true;
  }
  return false;
}

function newGame(o) {
  const sz = {small:[18,24], medium:[22,30], large:[27,36]}[o.size] || [22,30];
  VIS = null; FC = new Map(); TCOL = null;
  G = {v:1, rs:(Math.random() * 4294967296) | 0, turn:1, w:sz[0], h:sz[1], diff:o.diff, legacy:o.legacy, nid:1,
       tiles:[], f:[], towns:[], units:[], camps:[], log:[], over:0, nextEvent:9, tav:{t:-99, c:[]}, perkQ:[],
       stats:{ruins:0}, monT:-1, peaceOffer:null};
  G.seed = G.rs;
  const isMain = genMap();
  const starts = shuffle(pickStarts(o.rivals + 1, isMain));
  starts.forEach(prepStart);
  G.f.push({id:0, human:1, name:o.name || 'Your Realm', c:PLAYER_COL, alive:1, res:{food:30, wood:40, stone:15, iron:0, gold:50 + (o.legacy === 'merchant' ? 60 : 0)},
            techs:{}, cur:null, prog:0, pop:4, grow:0, tax:1, hmod:0, kills:0, camps:0});
  const rv = shuffle(RIVALS.slice());
  for (let i = 1; i <= o.rivals; i++) G.f.push({id:i, name:rv[i-1].n, c:rv[i-1].c, alive:1, prod:5, tier:0, stance:'peace', att:ri(-10, 15),
            aggr:.02 + rnd() * .03, met:0, warT:0, peaceT:0, peaceUntil:0, attack:0, lastAsk:0});
  starts.forEach((s, i) => createTown(s.x, s.y, i, 1));
  claimTerritory();
  const cap = G.towns[0];
  spawnNear(cap, 'militia', 0); spawnNear(cap, 'scout', 0);
  if (o.legacy === 'guard') {
    const u = spawnNear(cap, 'militia', 0); if (u) { u.xp = 25; updateRank(u, 1); }
    const spot = shuffle(G.tiles.map((t, i) => i).filter(i => { const x = i % G.w, y = (i / G.w) | 0; return G.tiles[i].own === 0 && !G.tiles[i].b && FLAT.includes(G.tiles[i].t) && dist(x, y, cap.x, cap.y) <= 2; }))[0];
    if (spot != null) G.tiles[spot].b = {k:'barracks', lvl:1, o:0};
  }
  for (let i = 1; i <= o.rivals; i++) for (let k = 0; k < 2; k++) { const u = spawnNear(G.towns[i], 'militia', i); if (u) { u.home = G.towns[i].id; u.role = 'def'; } }
  const nc = Math.round(G.w * G.h / 130);
  for (let k = 0; k < nc; k++) spawnCamp(7, isMain);
  const nr = Math.round(G.w * G.h / 85);
  for (let tries = 0, placed = 0; placed < nr && tries < 600; tries++) {
    const x = ri(0, G.w - 1), y = ri(0, G.h - 1), t = T(x, y);
    if (t.t === 'water' || t.t === 'mountain' || t.ruin || t.b || t.own >= 0 || campAt(x, y) || !isMain(idx(x, y))) continue;
    if (G.towns.some(tw => dist(tw.x, tw.y, x, y) < 4)) continue;
    t.ruin = 1; placed++;
  }
  claimTerritory(); computeVis(); refreshTavern(true);
  logMsg(`👑 The ${G.f[0].name} is founded at ${cap.name}.`);
}

// ---------- territory & vision ----------
function claimTerritory() {
  for (const t of G.tiles) t.own = -1;
  const claim = (cx, cy, r, o) => {
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (!inb(x, y)) continue; const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > r * r + r) continue;
      const t = T(x, y); if (t.own === -1) t.own = o;
    }
  };
  for (const tw of G.towns) T(tw.x, tw.y).own = tw.o;
  for (const tw of [...G.towns].sort((a, b) => a.id - b.id)) claim(tw.x, tw.y, hallRadius(tw.lvl), tw.o);
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) { const b = T(x, y).b; if (b && b.k === 'tower' && T(x, y).own === b.o) claim(x, y, b.lvl >= 3 ? 2 : 1, b.o); }
  for (const t of G.tiles) { const b = t.b; if (!b || b.k === 'hall') continue; if (t.own === -1) t.b = null; else if (t.own !== b.o) b.o = t.own; }
}

function computeVis() {
  VIS = new Uint8Array(G.w * G.h);
  const see = (cx, cy, r) => {
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (!inb(x, y)) continue; const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > r * r + r) continue;
      VIS[idx(x, y)] = 1; T(x, y).seen = 1;
    }
  };
  for (const tw of G.towns) if (tw.o === 0) see(tw.x, tw.y, 2 + tw.lvl);
  for (const u of G.units) if (u.o === 0) see(u.x, u.y, UNI[u.k].sight || 2);
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) { const b = T(x, y).b; if (b && b.o === 0 && b.k !== 'hall') see(x, y, b.k === 'tower' ? 3 + b.lvl : 1); }
  const meet = o => { if (o > 0 && o !== BARB && !G.f[o].met) { G.f[o].met = 1; note(`🤝 You have made contact with the ${G.f[o].name}.`, 'gold'); } };
  for (const tw of G.towns) if (VIS[idx(tw.x, tw.y)]) meet(tw.o);
  for (const u of G.units) if (VIS[idx(u.x, u.y)]) meet(u.o);
}

// ---------- economy ----------
const jobsOf = b => Math.round(BLD[b.k].jobs * (1 + .5 * (b.lvl - 1)));
function yieldOf(x, y, b) {
  const t = T(x, y), L = b.lvl || 1, m = [0, 1, 1.6, 2.2][L], o = b.o, r = {};
  switch (b.k) {
    case 'house': r.housing = [0, 5, 10, 16][L]; break;
    case 'farm': { let v = t.t === 'fertile' ? 5 : t.t === 'desert' ? 1 : 3; v += Math.min(2, adjB(x, y, ['farm'], o)); if (o === 0 && has('agri')) v++; if (o === 0 && hasLegacy('fertile')) v++; r.food = v * m; break; }
    case 'lumber': r.wood = (3 + Math.min(3, adjT(x, y, 'forest'))) * m; break;
    case 'quarry': r.stone = (4 + (adjT(x, y, 'mountain') ? 1 : 0)) * m; break;
    case 'mine': if (t.dep === 'iron') r.iron = 3 * m; else if (t.dep === 'gold') { r.gold = 5 * m; r.lux = 1; } else { r.iron = m; r.stone = m; } break;
    case 'library': r.know = (3 + Math.min(2, adjB(x, y, ['library','academy'], o))) * m; break;
    case 'market': r.gold = (3 + Math.min(4, adjLv(x, y, 'house', o))) * m; break;
    case 'temple': r.happy = [0, 8, 13, 18][L]; break;
    case 'harbor': r.food = 3 * m; r.gold = 2 * m; break;
    case 'academy': r.know = 6 * m; break;
    case 'bank': r.gold = 3 * m; r.goldPct = .15 * L; break;
  }
  return r;
}
function upkeep(u) { return u.k === 'hero' ? (u.h.trait === 'frugal' ? 1 : 3) : UNI[u.k].up; }

function econ() {
  const f = G.f[0], pop = f.pop;
  const e = {prod:{}, housing:0, jobs:0, lux:0, temple:0, bankPct:0, bld:0};
  const hall = {food:0, gold:0, know:0, stone:0}, bp = {food:0, wood:0, stone:0, iron:0, gold:0, know:0};
  const my = G.towns.filter(t => t.o === 0);
  for (const tw of my) { hall.food += 2 * tw.lvl; hall.gold += 2 * tw.lvl; hall.know += 1 + tw.lvl; hall.stone += tw.lvl; e.housing += TOWN_HOUSING[tw.lvl]; }
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
    const b = T(x, y).b; if (!b || b.o !== 0 || b.k === 'hall' || b.pil) continue;
    e.bld++;
    const yy = yieldOf(x, y, b); e.jobs += jobsOf(b);
    e.housing += yy.housing || 0; e.temple += yy.happy || 0; e.lux += yy.lux || 0; e.bankPct += yy.goldPct || 0;
    for (const r in bp) if (yy[r]) bp[r] += yy[r];
  }
  e.eff = e.jobs > 0 ? Math.min(1, pop / e.jobs) : 1;
  e.unemployed = Math.max(0, pop - e.jobs);
  const wars = G.f.filter(g => g.id && g.alive && g.stance === 'war').length;
  const parts = [['Base contentment', 55], ['Temples', e.temple], ['Tax rate', TAX[f.tax].h], ['Crowding', -Math.floor(pop / 5)]];
  if (my.length > 1) parts.push(['Many towns', -4 * (my.length - 1)]);
  if (e.lux) parts.push(['Luxuries (gold)', Math.min(3, e.lux) * 4]);
  if (wars) parts.push(['War weariness', -3 * wars]);
  if (has('economics')) parts.push(['Economics', 8]);
  if (hasLegacy('golden')) parts.push(['Golden Age', 10]);
  const mon = monument(); if (mon) parts.push(['Grand Monument', mon.stg * 2]);
  if (Math.round(f.hmod)) parts.push(['Recent events', Math.round(f.hmod)]);
  e.parts = parts;
  e.happy = clamp(Math.round(parts.reduce((s, p) => s + p[1], 0)), 0, 100);
  e.hf = .75 + e.happy / 200;
  for (const r in bp) e.prod[r] = ((hall[r] || 0) + bp[r] * e.eff) * e.hf;
  e.prod.know = (e.prod.know + pop * .1) * (has('philosophy') ? 1.2 : 1) * (hasLegacy('scholar') ? 1.25 : 1);
  e.prod.gold *= 1 + e.bankPct + (has('economics') ? .25 : 0) + (hasLegacy('merchant') ? .15 : 0);
  e.foodUse = pop * .5;
  e.tax = pop * TAX[f.tax].g;
  e.upkeep = G.units.filter(u => u.o === 0).reduce((s, u) => s + upkeep(u), 0);
  e.trade = G.f.filter(g => g.id && g.alive && g.met && g.stance === 'peace' && g.peaceT >= 10).length * (hasB('market') ? 4 : 2);
  e.net = {food:e.prod.food - e.foodUse, wood:e.prod.wood, stone:e.prod.stone, iron:e.prod.iron,
           gold:e.prod.gold + e.tax + e.trade - e.upkeep, know:e.prod.know};
  return e;
}
const growNeed = () => 8 + G.f[0].pop * .8;

// ---------- costs ----------
const costH = c => Object.entries(c).filter(([, v]) => v > 0).map(([r, v]) => `${v}${RI[r]}`).join(' ');
function lacks(c) { const f = G.f[0]; for (const r in c) if ((f.res[r] || 0) < c[r]) return `Need ${Math.ceil(c[r] - (f.res[r] || 0))} more ${RN[r].toLowerCase()}`; return ''; }
function pay(c) { const f = G.f[0]; for (const r in c) f.res[r] -= c[r]; }
function gain(c) { const f = G.f[0]; for (const r in c) f.res[r] = (f.res[r] || 0) + c[r]; }
const yStr = y => ['food','wood','stone','iron','gold','know'].filter(r => y[r]).map(r => `+${Math.round(y[r] * 10) / 10}${RI[r]}`)
  .concat(y.housing ? [`+${y.housing}🏠`] : [], y.happy ? [`+${y.happy}😊`] : [], y.goldPct ? [`+${Math.round(y.goldPct * 100)}%🪙`] : []).join(' ') || 'No direct output';
function bCost(k, lvl = 1) {
  const m = (lvl === 1 ? 1 : lvl === 2 ? 2 : 4) * (hasLegacy('builder') ? .8 : 1), o = {};
  for (const r in BLD[k].cost) o[r] = Math.ceil(BLD[k].cost[r] * m);
  if (lvl > 1) o.stone = (o.stone || 0) + 10 * lvl;
  return o;
}
function repairCost(b) { const c = bCost(b.k, 1), o = {}; for (const r in c) o[r] = Math.ceil(c[r] / 2); return o; }
function unitCost(k) { return UNI[k].cost || {}; }

// ---------- building actions ----------
function buildReason(k, x, y) {
  const D = BLD[k], t = T(x, y);
  if (D.tech && !has(D.tech)) return 'Requires ' + TECH_BY[D.tech].n;
  if (t.own !== 0) return 'Outside your borders';
  if (t.b) return 'Tile already has a building';
  if (t.ruin) return 'Explore the ruins first';
  const u = unitAt(x, y); if (u && u.o !== 0) return 'Enemy on this tile';
  const on = D.on || FLAT;
  if (!on.includes(t.t)) return 'Needs ' + on.map(z => TERR[z].n.toLowerCase()).join(' or ');
  if (D.coast && !adjT(x, y, 'water')) return 'Must be next to water';
  if (D.wonder && monument()) return 'Only one allowed';
  return '';
}
function doBuild(k, x, y) {
  const r = buildReason(k, x, y) || lacks(bCost(k, 1));
  if (r) { toast(r, 'bad'); return false; }
  pay(bCost(k, 1));
  T(x, y).b = {k, lvl:1, o:0};
  if (BLD[k].wonder) { T(x, y).b.stg = 1; G.monT = G.turn; note('🗿 Work begins on the Grand Monument (stage 1 of 5).', 'gold'); }
  if (k === 'tower') claimTerritory();
  computeVis();
  return true;
}
function upReason(b) {
  if (b.lvl >= 3) return 'Maximum level';
  if (b.pil) return 'Repair it first';
  if (b.lvl === 1 && !has('masonry')) return 'Level 2 requires Masonry';
  if (b.lvl === 2 && !has('engineering')) return 'Level 3 requires Engineering';
  return '';
}
function townUpReason(tw) {
  if (tw.lvl >= 4) return 'Maximum size';
  const U = TOWN_UP[tw.lvl + 1];
  const others = G.towns.filter(t => t !== tw && t.o === 0 && t.lvl >= tw.lvl + 1).length;
  const need = U.pop + others * Math.round(U.pop * .5);
  if (G.f[0].pop < need) return `Needs ${need} population (you have ${G.f[0].pop})`;
  if (U.tech && !has(U.tech)) return 'Requires ' + TECH_BY[U.tech].n;
  return lacks(U.cost);
}
function trainReason(k, tw) {
  const D = UNI[k], f = G.f[0];
  if (D.tech && !has(D.tech)) return 'Requires ' + TECH_BY[D.tech].n;
  if (!['scout','militia','settler'].includes(k) && !hasB('barracks')) return 'Needs a Barracks';
  if (D.need && !hasB(D.need)) return 'Needs ' + BLD[D.need].n;
  if (D.pop && f.pop < D.pop + 3) return `Needs ${D.pop + 3} population`;
  if (tw.tr === G.turn) return 'This town already trained this turn';
  if (!freeSpot(tw.x, tw.y, 0)) return 'No free space around the town';
  return lacks(unitCost(k));
}
function trainUnit(k, tw) {
  const r = trainReason(k, tw); if (r) { toast(r, 'bad'); return null; }
  pay(unitCost(k));
  const u = spawnNear(tw, k, 0); u.mv = 0; tw.tr = G.turn;
  if (UNI[k].pop) G.f[0].pop -= UNI[k].pop;
  if (!UNI[k].civ && k !== 'scout') { u.xp = [0, 0, 10, 25][maxBLvl('barracks')] + (has('tactics') ? 15 : 0); updateRank(u, 1); }
  computeVis();
  if (G.units.filter(v => v.o === 0 && !UNI[v.k].civ && v.k !== 'scout').length >= 10) unlock('army10');
  return u;
}
function foundReason(u) {
  const t = T(u.x, u.y);
  if (t.t === 'water' || t.t === 'mountain') return 'Cannot settle on this terrain';
  if (t.own > 0) return 'This land belongs to another realm';
  if (t.b) return 'Tile already has a building';
  if (G.towns.some(tw => dist(tw.x, tw.y, u.x, u.y) < 4)) return 'Too close to another town (4 tiles minimum)';
  return '';
}

// ---------- commanders ----------
function genCandidate() {
  const pot = ri(1, 5);
  const c = {name:pick(FIRST) + ' ' + pick(LAST), pot, lead:ri(2, 6) + pot, tac:ri(1, 5) + ri(0, pot), val:ri(2, 6) + ri(0, pot), trait:pick(Object.keys(TRAITS))};
  c.potLo = clamp(pot - ri(0, 1), 1, 5); c.potHi = clamp(pot + ri(0, 1), 1, 5); // scouting report is fuzzy
  c.cost = Math.round(30 + (c.lead + c.tac + c.val) * 3 + pot * 8);
  return c;
}
function maxHeroes() { return 1 + (has('tactics') ? 1 : 0) + (G.towns.some(t => t.o === 0 && t.lvl >= 3) ? 1 : 0); }
function heroCount() { return G.units.filter(u => u.o === 0 && u.k === 'hero').length; }
function refreshTavern(force) {
  if (force || G.turn - G.tav.t >= 12) {
    G.tav.t = G.turn; G.tav.c = [genCandidate(), genCandidate(), genCandidate()];
    if (!force) note('🍺 New commanders seek service in your tavern (Realm → Tavern).', '');
  }
}
function hireHero(c, free) {
  if (heroCount() >= maxHeroes()) { note('You cannot lead more commanders yet.', 'bad'); return false; }
  if (!free) { if (G.f[0].res.gold < c.cost) return false; G.f[0].res.gold -= c.cost; }
  const u = spawnNear(capital(), 'hero', 0); if (!u) return false;
  u.h = {name:c.name, pot:c.pot, lead:c.lead, tac:c.tac, val:c.val, trait:c.trait, lvl:1, xp:0};
  u.mv = 0; computeVis();
  note(`🎖️ ${c.name} joins your army.`, 'good');
  return true;
}

function logMsg(m) { if (!G) return; G.log.push([G.turn, m]); if (G.log.length > 120) G.log.shift(); }
