'use strict';
// Units, combat, rival and barbarian AI, and end-of-turn processing.

// ---------- units ----------
function spawnUnit(k, o, x, y) { const u = {id:G.nid++, k, o, x, y, hp:100, xp:0, rk:0, perks:[], mv:0, acted:0, fort:0}; G.units.push(u); return u; }
function freeSpot(x, y, o) {
  for (let r = 1; r <= 3; r++) {
    const c = [];
    for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) {
      if (!inb(xx, yy) || dist(x, y, xx, yy) !== r) continue;
      const t = T(xx, yy); if (!TERR[t.t].mv || unitAt(xx, yy) || campAt(xx, yy)) continue;
      const tw = townAt(xx, yy); if (tw && tw.o !== o) continue;
      c.push([xx, yy]);
    }
    if (c.length) return pick(c);
  }
  return null;
}
function spawnNear(tw, k, o) { if (!tw) return null; const s = freeSpot(tw.x, tw.y, o); return s ? spawnUnit(k, o, s[0], s[1]) : null; }
const unitMv = u => UNI[u.k].mv + (u.perks.includes('swift') ? 1 : 0);
function moveCost(u, t) { if (u.perks.includes('highland') && (t.t === 'hills' || t.t === 'mountain')) return 1; return TERR[t.t].mv; }
function canEnter(u, x, y) {
  if (!inb(x, y)) return false; const t = T(x, y);
  if (!TERR[t.t].mv || unitAt(x, y) || campAt(x, y)) return false;
  const tw = townAt(x, y); return !(tw && tw.o !== u.o);
}
// Tiles reachable this turn, mapped to the moves left on arrival. A unit can always take one step if it has any moves.
function reach(u) {
  const R = new Map(); if (u.mv <= 0) return R;
  const best = new Map([[idx(u.x, u.y), u.mv]]), q = [[u.x, u.y, u.mv]];
  while (q.length) {
    q.sort((a, b) => b[2] - a[2]); const [x, y, m] = q.shift();
    if (m <= 0 || best.get(idx(x, y)) > m) continue;
    for (const [dx, dy] of N8) {
      const nx = x + dx, ny = y + dy; if (!canEnter(u, nx, ny)) continue;
      const nm = Math.max(0, m - moveCost(u, T(nx, ny))), k = idx(nx, ny);
      if ((best.get(k) ?? -1) >= nm) continue;
      best.set(k, nm); R.set(k, nm); q.push([nx, ny, nm]);
    }
  }
  return R;
}
function unitRange(u) { const D = UNI[u.k]; return D.rstr ? D.rng + (u.perks.includes('sniper') ? 1 : 0) : 1; }
function targetsFor(u) {
  const out = []; if (u.mv <= 0 || UNI[u.k].civ) return out;
  const rng = unitRange(u);
  for (let y = u.y - rng; y <= u.y + rng; y++) for (let x = u.x - rng; x <= u.x + rng; x++) {
    if (!inb(x, y) || (x === u.x && y === u.y)) continue;
    const v = unitAt(x, y);
    if (v) { if (hostile(u.o, v.o)) out.push({x, y, u:v}); continue; }
    const tw = townAt(x, y); if (tw && hostile(u.o, tw.o)) { out.push({x, y, town:tw}); continue; }
    const c = campAt(x, y); if (c && u.o !== BARB) out.push({x, y, camp:c});
  }
  return out;
}
function onEnter(u) {
  const t = T(u.x, u.y);
  if (t.ruin) { if (u.o === 0) exploreRuin(u, t); else t.ruin = 0; }
  const b = t.b;
  if (b && b.k !== 'hall' && !b.pil && hostile(u.o, b.o) && !UNI[u.k].civ) {
    b.pil = 1;
    if (u.o === 0) { G.f[0].res.gold += 15; note(`🔥 Pillaged a ${BLD[b.k].n}: +15 🪙`, 'good'); giveXp(u, 3); }
    else if (b.o === 0) note(`🔥 The ${fac(u.o).name} pillaged your ${BLD[b.k].n}!`, 'bad');
  }
}
function moveUnit(u, x, y, left) {
  animMove(u); u.mv = left ?? Math.max(0, u.mv - moveCost(u, T(x, y)));
  u.x = x; u.y = y; u.acted = 1; u.fort = 0; onEnter(u);
}
function exploreRuin(u, t) {
  t.ruin = 0; G.stats.ruins++; if (G.stats.ruins >= 5) unlock('ruins');
  const f = G.f[0], r = rnd();
  if (r < .28) { const g = ri(30, 60) + G.turn; f.res.gold += g; note(`🏚️ A forgotten treasury: +${g} 🪙`, 'good'); }
  else if (r < .45) { const k = f.cur ? Math.round(TECH_BY[f.cur].c * .5) : 30; f.prog += k; note(`🏚️ Ancient scrolls: +${k} 📖`, 'good'); }
  else if (r < .60) {
    const s = freeSpot(u.x, u.y, 0);
    if (s) { const nu = spawnUnit(has('bronze') ? 'spear' : 'militia', 0, s[0], s[1]); nu.xp = 10; updateRank(nu, 1); note('🏚️ Survivors join your cause: a free unit!', 'good'); }
    else { f.res.gold += 40; note('🏚️ The ruins hold 40 🪙', 'good'); }
  }
  else if (r < .72) { for (let y = u.y - 6; y <= u.y + 6; y++) for (let x = u.x - 6; x <= u.x + 6; x++) if (inb(x, y)) T(x, y).seen = 1; note('🏚️ An old map reveals the surrounding lands.', 'good'); }
  else if (r < .82) { f.pop += 2; note('🏚️ Villagers hiding in the ruins join you: +2 👥', 'good'); }
  else if (r < .90) { const c = genCandidate(); c.free = 1; G.tav.c.unshift(c); note('🏚️ An exiled captain will serve you for free (Realm → Tavern).', 'good'); }
  else {
    for (let k = 0; k < 2; k++) { const s = freeSpot(u.x, u.y, BARB); if (s) spawnUnit(pick(TIERS[Math.min(4, Math.floor(G.turn / 40))]), BARB, s[0], s[1]); }
    note('🏚️ An ambush! Barbarians burst from the ruins.', 'bad');
  }
  giveXp(u, 2);
}

// ---------- strength & combat ----------
function adjHero(u) {
  let a = 0, d = 0;
  for (const v of G.units) if (v !== u && v.o === u.o && v.k === 'hero' && dist(v.x, v.y, u.x, u.y) <= 1) {
    a = Math.max(a, v.h.lead + (v.h.trait === 'inspiring' ? 5 : 0)); d = Math.max(d, v.h.tac);
  }
  return {a:a / 100, d:d / 100};
}
// role: 'a' melee attack, 'r' ranged attack, 'd' defence. ctx.tile = battle tile, ctx.vs = opposing unit, ctx.vsStruct = 'town'|'camp'.
function unitStr(u, role, ctx = {}) {
  const D = UNI[u.k];
  let base = u.k === 'hero' ? 8 + u.h.val : role === 'r' ? D.rstr : D.str;
  if (!base) return .5;
  let m = 1 + (u.k === 'hero' ? .05 * (u.h.lvl - 1) : .1 * u.rk);
  const tile = ctx.tile || T(u.x, u.y), pk = u.perks;
  if (role === 'd') {
    m += TERR[tile.t].def || 0; if (u.fort) m += .25;
    const tw = townAt(u.x, u.y); if (tw && tw.o === u.o) m += .5;
    if (pk.includes('shield')) m += .25; if (u.h && u.h.trait === 'cautious') m += .1;
  } else { if (pk.includes('fury')) m += .25; if (u.h && u.h.trait === 'bold') m += .1; }
  if (pk.includes('woodsman') && tile.t === 'forest') m += .33;
  if (pk.includes('highland') && (tile.t === 'hills' || tile.t === 'mountain')) m += .33;
  const op = ctx.vs;
  if (op) { const OD = UNI[op.k]; if (D.anti && OD.mount) m += .5; if (pk.includes('lancer') && OD.rstr) m += .5; if (pk.includes('hunter') && op.o === BARB) m += .5; }
  if (ctx.vsStruct) { if (D.siege) m += 1; if (pk.includes('breaker')) m += .5; if (pk.includes('hunter') && ctx.vsStruct === 'camp') m += .5; }
  const hb = adjHero(u); m += role === 'd' ? hb.a * .5 + hb.d : hb.a;
  if (u.o === 0) { m += .08 * maxBLvl('smithy'); if (hasLegacy('warrior')) m += .1; }
  else m *= DIFFS[G.diff].ai;
  return base * m * (.5 + .5 * u.hp / 100);
}
function townStr(tw) {
  let s = 8 + 6 * tw.lvl;
  if (tw.o === 0) s += (has('masonry') ? 4 : 0) + (has('engineering') ? 6 : 0) + (has('gunpowder') ? 10 : 0);
  else s = (s + G.f[tw.o].tier * 5) * DIFFS[G.diff].ai;
  return s * (.6 + .4 * tw.hp / townMaxHp(tw));
}
const campStr = c => (8 + G.turn * .12) * DIFFS[G.diff].ai * (.6 + .4 * c.hp / 60);
function combatNums(a, tg) {
  const ranged = !!UNI[a.k].rstr, role = ranged ? 'r' : 'a', tile = T(tg.x, tg.y);
  let as, ds, retal = !ranged;
  if (tg.u) {
    as = unitStr(a, role, {tile, vs:tg.u}); ds = unitStr(tg.u, 'd', {tile, vs:a});
    if (UNI[tg.u.k].civ) { ds = .01; retal = false; }
  } else if (tg.town) { as = unitStr(a, role, {tile, vsStruct:'town'}); ds = townStr(tg.town); }
  else { as = unitStr(a, role, {tile, vsStruct:'camp'}); ds = campStr(tg.camp); }
  const r = as / ds;
  return {as, ds, r, dd:30 * Math.pow(r, .9), da:retal ? 30 * Math.pow(1 / r, .9) : 0};
}
function attack(a, tg) {
  const n = combatNums(a, tg), v = () => .85 + rnd() * .3;
  let dd = Math.max(1, Math.round(Math.min(n.dd, 200) * v()));
  const da = n.da ? Math.max(1, Math.round(Math.min(n.da, 200) * v())) : 0;
  a.mv = 0; a.acted = 1; a.fort = 0;
  const res = {dd, da, killed:false, died:false, capture:false};
  shot(a.x, a.y, tg.x, tg.y);
  if (tg.u) {
    const d = tg.u; if (UNI[d.k].civ) dd = 999; res.dd = Math.min(dd, Math.round(d.hp));
    d.hp -= dd; floatTxt(tg.x, tg.y, '-' + res.dd, '#ff8a70');
    if (d.hp <= 0) { res.killed = true; killUnit(d, a); } else giveXp(d, 3);
  } else if (tg.town) {
    const tw = tg.town; tw.hp = Math.max(0, tw.hp - dd); floatTxt(tg.x, tg.y, '-' + dd, '#ffb070');
    if (tw.hp <= 0 && !UNI[a.k].rstr) res.capture = true;
  } else {
    const c = tg.camp; c.hp -= dd; floatTxt(tg.x, tg.y, '-' + dd, '#ffb070');
    if (c.hp <= 0) { res.killed = true; destroyCamp(c, a); }
  }
  if (da) { a.hp -= da; floatTxt(a.x, a.y, '-' + da, '#ff8a70'); if (a.hp <= 0) { res.died = true; killUnit(a, tg.u || null); } }
  if (!res.died) {
    giveXp(a, 5 + (res.killed ? 5 : 0) + (tg.town || tg.camp ? 3 : 0));
    if (res.capture) captureTown(tg.town, a);
    else if (res.killed && !UNI[a.k].rstr && canEnter(a, tg.x, tg.y)) { animMove(a); a.x = tg.x; a.y = tg.y; onEnter(a); }
    if (a.o === 0 && (res.killed || res.capture)) { G.f[0].kills++; unlock('blood'); }
  }
  for (const h of G.units) if (h.k === 'hero' && h !== a && h.o === a.o && dist(h.x, h.y, a.x, a.y) <= 1) heroXp(h, 2);
  return res;
}
function killUnit(d, killer) {
  const i = G.units.indexOf(d); if (i >= 0) G.units.splice(i, 1);
  if (d.o === 0) note(d.k === 'hero' ? `💀 Commander ${d.h.name} has fallen!` : `💀 Your ${unitName(d)} was destroyed.`, 'bad');
  if (killer && killer.o === 0 && d.o === BARB) G.f[0].res.gold += 5;
  if (UI.sel && UI.sel.u === d.id) { UI.sel = null; UI.reach = null; UI.targets = []; }
}
function removeUnit(u) { const i = G.units.indexOf(u); if (i >= 0) G.units.splice(i, 1); }
function captureTown(tw, a) {
  const old = tw.o; tw.o = a.o; tw.hp = Math.round(townMaxHp(tw) * .35); tw.tr = G.turn;
  T(tw.x, tw.y).b.o = a.o; animMove(a); a.x = tw.x; a.y = tw.y;
  claimTerritory();
  if (a.o === 0) { note(`🏰 You captured ${tw.name}!`, 'good'); if (tw.cap && tw.orig !== 0) unlock('conquer'); G.f[0].hmod += 8; }
  if (old === 0) note(`💀 ${tw.name} has fallen to the ${fac(a.o).name}!`, 'bad');
  if (old !== 0 && old !== BARB && !G.towns.some(t => t.o === old)) {
    const f = G.f[old]; f.alive = 0; G.units = G.units.filter(u => u.o !== old);
    note(`☠️ The ${f.name} has been destroyed!`, 'gold');
  }
  logMsg(`🏰 ${tw.name} captured by the ${fac(a.o).name}.`);
}
function destroyCamp(c, a) {
  G.camps.splice(G.camps.indexOf(c), 1);
  if (a && a.o === 0) { const g = 25 + Math.floor(G.turn / 2); G.f[0].res.gold += g; G.f[0].camps++; note(`🔥 Barbarian camp destroyed! +${g} 🪙`, 'good'); unlock('camp'); }
}
function giveXp(u, n) { if (u.k === 'hero') heroXp(u, n); else { u.xp += n; updateRank(u); } }
function updateRank(u, silent) {
  if (u.k === 'hero') return;
  while (u.rk < 4 && u.xp >= RXP[u.rk + 1]) {
    u.rk++;
    if (u.rk >= 2) {
      const D = UNI[u.k];
      const pool = Object.keys(PERKS).filter(p => !u.perks.includes(p) && (!PERKS[p].r || D.rstr) && (!PERKS[p].m || !D.rstr));
      if (pool.length) u.perks.push(pick(pool));
    }
    if (!silent && u.o === 0) {
      note(`⭐ ${UNI[u.k].n} promoted to ${RANKS[u.rk]}${u.rk >= 2 ? ': gained ' + PERKS[u.perks[u.perks.length - 1]].n : ''}`, 'gold');
      if (u.rk === 4) unlock('legend');
    }
  }
}
const heroNeed = u => 12 * u.h.lvl;
function heroXp(u, n) {
  if (!u.h) return;
  u.h.xp += n * (u.o === 0 && hasB('academy') ? 1.5 : 1) * (u.h.trait === 'ambitious' ? 1.3 : 1);
  while (u.h.xp >= heroNeed(u)) {
    u.h.xp -= heroNeed(u); u.h.lvl++;
    for (const a of ['lead','tac','val']) if (rnd() < .3 + u.h.pot * .1) u.h[a] = Math.min(20, u.h[a] + 1);
    const a = pick(['lead','tac','val']); u.h[a] = Math.min(20, u.h[a] + 1);
    u.hp = Math.min(100, u.hp + 30);
    if (u.o === 0) {
      const opts = shuffle(Object.keys(PERKS).filter(p => !u.perks.includes(p) && p !== 'sniper')).slice(0, 2);
      if (opts.length) G.perkQ.push({id:u.id, opts});
      note(`🎖️ ${u.h.name} reached level ${u.h.lvl}!`, 'gold');
      if (u.h.lvl >= 5) unlock('hero5');
    }
  }
}
// Towns and watchtowers shoot automatically (no counter-attack).
function strike(x, y, str, target) {
  const ds = unitStr(target, 'd');
  const dmg = Math.max(1, Math.round(30 * Math.pow(str / ds, .9) * (.85 + rnd() * .3)));
  target.hp -= dmg; shot(x, y, target.x, target.y); floatTxt(target.x, target.y, '-' + dmg, '#ffb070');
  if (target.hp <= 0) { killUnit(target, null); if (T(x, y).own === 0) G.f[0].kills++; }
}
function weakestHostile(x, y, r, o) {
  let best = null;
  for (const u of G.units) if (hostile(o, u.o) && dist(u.x, u.y, x, y) <= r && (!best || u.hp < best.hp)) best = u;
  return best;
}
function townsFire(o) {
  for (const tw of G.towns) if (tw.o === o) { const tg = weakestHostile(tw.x, tw.y, 2, o); if (tg) strike(tw.x, tw.y, townStr(tw) * .7, tg); }
  if (o !== 0) return;
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
    const b = T(x, y).b; if (!b || b.k !== 'tower' || b.o !== 0 || b.pil) continue;
    const tg = weakestHostile(x, y, 2, 0); if (tg) strike(x, y, 8 + 6 * b.lvl, tg);
  }
}

// ---------- AI pathing ----------
function hpush(h, it) { h.push(it); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } }
function hpop(h) {
  const top = h[0], last = h.pop();
  if (h.length) { h[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r; if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; } }
  return top;
}
// Distance-to-target field over terrain (cached per turn), used to walk units around lakes and mountains.
function field(tx, ty) {
  const key = ty * G.w + tx; let d = FC.get(key); if (d) return d;
  d = new Float32Array(G.w * G.h).fill(1e9); d[key] = 0; const h = [[0, key]];
  while (h.length) {
    const [c, i] = hpop(h); if (c > d[i]) continue;
    const x = i % G.w, y = (i / G.w) | 0, enter = i === key ? 1 : TERR[G.tiles[i].t].mv;
    for (const [dx, dy] of N8) {
      const nx = x + dx, ny = y + dy; if (!inb(nx, ny)) continue;
      const j = ny * G.w + nx; if (!TERR[G.tiles[j].t].mv) continue;
      if (c + enter < d[j]) { d[j] = c + enter; hpush(h, [c + enter, j]); }
    }
  }
  FC.set(key, d); return d;
}
function stepToward(u, tx, ty, stop) {
  const d = field(tx, ty);
  for (let g = 0; g < 8 && u.mv > 0 && dist(u.x, u.y, tx, ty) > stop; g++) {
    let best = null, bv = d[idx(u.x, u.y)];
    for (const [dx, dy] of N8) { const nx = u.x + dx, ny = u.y + dy; if (!canEnter(u, nx, ny)) continue; const v = d[idx(nx, ny)]; if (v < bv - .01) { bv = v; best = [nx, ny]; } }
    if (!best) break;
    moveUnit(u, best[0], best[1]);
  }
}
function nearestHostile(o, cx, cy, r, withBld) {
  let best = null, bd = 1e9;
  const consider = (x, y) => { const d = dist(x, y, cx, cy); if (d <= r && d < bd) { bd = d; best = {x, y}; } };
  for (const v of G.units) if (hostile(o, v.o)) consider(v.x, v.y);
  for (const tw of G.towns) if (hostile(o, tw.o)) consider(tw.x, tw.y);
  if (o !== BARB) for (const c of G.camps) consider(c.x, c.y);
  if (withBld) for (let y = Math.max(0, cy - r); y <= Math.min(G.h - 1, cy + r); y++) for (let x = Math.max(0, cx - r); x <= Math.min(G.w - 1, cx + r); x++) {
    const b = T(x, y).b; if (b && b.k !== 'hall' && !b.pil && hostile(o, b.o)) consider(x, y);
  }
  if (best) { const b = T(best.x, best.y).b; best.bld = !!(b && b.k !== 'hall' && !unitAt(best.x, best.y) && !townAt(best.x, best.y)); }
  return best;
}
function tryAttackAI(u) {
  if (u.mv <= 0) return false;
  const ts = targetsFor(u); if (!ts.length) return false;
  const thr = u.o === BARB ? .5 : .7; let best = null, bs = -1e9;
  for (const tg of ts) {
    const n = combatNums(u, tg), civ = tg.u && UNI[tg.u.k].civ;
    const hp = tg.u ? tg.u.hp : tg.town ? tg.town.hp : tg.camp.hp;
    if (n.r < thr && !civ) continue;
    let s = n.dd - n.da; if (n.dd >= hp) s += 40; if (civ) s += 50; if (tg.town) s += 10; if (n.da >= u.hp) s -= 80;
    if (s > bs) { bs = s; best = tg; }
  }
  if (!best) return false;
  const tgtOwner = best.u ? best.u.o : best.town ? best.town.o : -1;
  const res = attack(u, best);
  if (tgtOwner === 0 && best.u && !res.killed) note(`⚔️ The ${fac(u.o).name} attacked your ${unitName(best.u)} (−${res.dd}).`, 'bad');
  if (tgtOwner === 0 && best.town && !res.capture) note(`⚔️ ${best.town.name} is under attack! (−${res.dd})`, 'bad');
  return true;
}
function warTarget(u) {
  let best = null, bd = 1e9;
  for (const tw of G.towns) if (hostile(u.o, tw.o)) { const d = dist(u.x, u.y, tw.x, tw.y); if (d < bd) { bd = d; best = {x:tw.x, y:tw.y}; } }
  for (const v of G.units) if (hostile(u.o, v.o) && v.o !== BARB) { const d = dist(u.x, u.y, v.x, v.y) + 3; if (d < bd) { bd = d; best = {x:v.x, y:v.y}; } }
  return best;
}
function aiUnit(u) {
  if (!G.units.includes(u) || UNI[u.k].civ) return;
  u.mv = unitMv(u);
  if (tryAttackAI(u)) return;
  let tgt = null, stop = UNI[u.k].rstr ? UNI[u.k].rng : 1;
  if (u.o === BARB) {
    tgt = nearestHostile(BARB, u.x, u.y, 9, true);
    if (tgt && tgt.bld) stop = 0;
    if (!tgt) {
      const c = G.camps.find(c => c.id === u.home);
      if (c && dist(u.x, u.y, c.x, c.y) > 3) { tgt = c; stop = 2; }
      else { const [dx, dy] = pick(N8); if (canEnter(u, u.x + dx, u.y + dy)) moveUnit(u, u.x + dx, u.y + dy); return; }
    }
  } else {
    const f = G.f[u.o];
    const home = G.towns.find(t => t.id === u.home && t.o === u.o) || G.towns.find(t => t.o === u.o);
    if (!home) return;
    const threat = nearestHostile(u.o, home.x, home.y, 5, false);
    if (threat && (u.role === 'def' || !f.attack)) tgt = threat;
    else if (f.stance === 'war' && f.attack && u.role === 'atk') tgt = warTarget(u);
    if (!tgt && dist(u.x, u.y, home.x, home.y) > 2) { tgt = {x:home.x, y:home.y}; stop = 2; }
    if (!tgt) { u.fort = 1; return; }
  }
  stepToward(u, tgt.x, tgt.y, stop);
  tryAttackAI(u);
}

// ---------- rival realms ----------
const aiCost = k => { const c = UNI[k].cost; return (c.gold || 0) + ((c.food || 0) + (c.wood || 0) + (c.stone || 0) + (c.iron || 0)) * .5; };
function milStr(o) {
  return G.units.filter(u => u.o === o && !UNI[u.k].civ).reduce((s, u) => s + (u.k === 'hero' ? 8 + u.h.val : (UNI[u.k].rstr || UNI[u.k].str)) * (1 + .1 * u.rk) * u.hp / 100, 0);
}
function aiDecor(f) {
  const lim = G.towns.filter(t => t.o === f.id).reduce((s, t) => s + 2 + t.lvl * 3, 0);
  let n = 0; const free = [];
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
    const t = T(x, y); if (t.own !== f.id) continue;
    if (t.b) { if (t.b.k !== 'hall') { n++; if (t.b.pil && rnd() < .3) t.b.pil = 0; } continue; }
    if (t.t !== 'water' && !t.ruin) free.push(t);
  }
  f.nb = n;
  if (n >= lim || !free.length) return;
  const t = pick(free);
  const k = t.t === 'forest' ? 'lumber' : t.t === 'hills' ? (t.dep ? 'mine' : 'quarry') : t.t === 'mountain' ? 'mine' : t.t === 'desert' ? 'house'
    : rnd() < .5 ? 'farm' : rnd() < .6 ? 'house' : pick(['temple','library','market','barracks']);
  t.b = {k, lvl:Math.min(3, 1 + Math.floor(f.tier / 2)), o:f.id};
}
function declareWar(id, byPlayer) {
  const f = G.f[id]; f.stance = 'war'; f.warT = 0; f.peaceT = 0; f.att -= 30;
  if (byPlayer) { G.f[0].hmod -= 4; G.f.forEach(g => { if (g.id && g !== f) g.att -= 10; }); note(`⚔️ You declared war on the ${f.name}.`, 'bad'); }
  else note(`⚔️ The ${f.name} has declared war on you!`, 'bad');
  logMsg(`⚔️ War with the ${f.name}.`);
}
function makePeace(id) {
  const f = G.f[id]; f.stance = 'peace'; f.peaceUntil = G.turn + 15; f.peaceT = 0; f.warT = 0; f.attack = 0; f.att += 10;
  note(`🕊️ Peace with the ${f.name}.`, 'good'); logMsg(`🕊️ Peace with the ${f.name}.`);
}
function aiDiplo(f) {
  const D = DIFFS[G.diff];
  if (f.stance === 'peace') {
    f.peaceT++;
    if (G.turn <= D.grace || G.turn < f.peaceUntil) return;
    if (!f.met) { if (G.turn > D.grace + 30) f.met = 1; else return; }
    const ratio = (milStr(f.id) + 1) / (milStr(0) + 1);
    const p = f.aggr * D.aggr * (ratio > 1.3 ? 2 : ratio < .7 ? .4 : 1) - f.att * .0004;
    if (rnd() < p) declareWar(f.id, false);
  } else {
    f.warT++;
    if (f.warT > 10 && rnd() < .12 && milStr(f.id) < milStr(0) * .6 && G.peaceOffer == null) G.peaceOffer = f.id;
  }
}
function aiTurn(f) {
  const D = DIFFS[G.diff], towns = G.towns.filter(t => t.o === f.id);
  if (!towns.length) { f.alive = 0; return; }
  f.tier = Math.min(4, Math.floor(G.turn * D.ai / 38));
  for (const tw of towns) {
    if (tw.lvl < Math.min(4, 1 + Math.floor(G.turn * D.ai / 45))) { tw.lvl++; tw.hp += 40; }
    tw.hp = Math.min(townMaxHp(tw), tw.hp + 10);
  }
  f.prod += (towns.reduce((s, t) => s + 2 + 2 * t.lvl, 0) + G.turn * .04 + (f.nb || 0) * .15) * D.ai;
  const mine = G.units.filter(u => u.o === f.id);
  const cap = Math.floor((2 + towns.reduce((s, t) => s + t.lvl, 0) + G.turn / 18) * D.ai);
  if (mine.length < cap) {
    const k = pick(TIERS[f.tier]), c = aiCost(k);
    if (f.prod >= c) {
      const tw = pick(towns), u = spawnNear(tw, k, f.id);
      if (u) { f.prod -= c; u.home = tw.id; u.role = mine.filter(v => v.role === 'def').length < towns.length + 1 ? 'def' : 'atk'; u.xp = f.tier * 8; updateRank(u, 1); }
    }
  } else f.prod = Math.min(f.prod, 120);
  if ((G.turn + f.id) % 4 === 0) aiDecor(f);
  aiDiplo(f);
  const atk = G.units.filter(u => u.o === f.id && u.role === 'atk').length;
  if (f.stance === 'war') { if (!f.attack && atk >= 2 + G.diff) f.attack = 1; if (f.attack && atk === 0) f.attack = 0; } else f.attack = 0;
  for (const u of G.units.filter(u => u.o === f.id)) aiUnit(u);
}
function barbTurn() {
  const D = DIFFS[G.diff];
  for (const c of G.camps) {
    c.hp = Math.min(60, c.hp + 5);
    if (--c.spawn > 0 || G.turn < 5) continue;
    c.spawn = Math.max(4, ri(8, 12) - Math.floor(G.turn / 25));
    const live = G.units.filter(u => u.o === BARB && u.home === c.id).length;
    if (live < 1 + Math.floor(G.turn * D.ai / 35)) {
      const s = freeSpot(c.x, c.y, BARB);
      if (s) { const u = spawnUnit(pick(TIERS[Math.min(4, Math.floor(G.turn * D.ai / 40))]), BARB, s[0], s[1]); u.home = c.id; }
    }
  }
  if (G.turn % 18 === 0 && G.camps.length < Math.round(G.w * G.h / 110)) spawnCamp(6);
  for (const u of G.units.filter(u => u.o === BARB)) aiUnit(u);
}
function raidBorder(n) {
  const c = [];
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
    const t = T(x, y); if (t.own !== -1 || !TERR[t.t].mv || unitAt(x, y) || campAt(x, y)) continue;
    if (N8.some(([dx, dy]) => inb(x + dx, y + dy) && T(x + dx, y + dy).own === 0)) c.push([x, y]);
  }
  shuffle(c);
  const tier = Math.min(4, Math.floor(G.turn * DIFFS[G.diff].ai / 40));
  for (let i = 0; i < n && i < c.length; i++) spawnUnit(pick(TIERS[tier]), BARB, c[i][0], c[i][1]);
  computeVis();
}

// ---------- end of turn ----------
function playerEconomy() {
  const f = G.f[0], e = econ();
  for (const r of RES5) f.res[r] += e.net[r];
  if (f.res.food < 0) { f.res.food = 0; if (f.pop > 1) { f.pop--; f.hmod -= 5; note('🌾 Famine! A citizen starved. Build more farms.', 'bad'); } }
  if (f.res.gold < 0) {
    f.res.gold = 0; f.hmod -= 5;
    const us = G.units.filter(u => u.o === 0 && u.k !== 'hero' && !UNI[u.k].civ);
    if (us.length) { const u = pick(us); removeUnit(u); note(`🪙 The treasury is empty: your ${unitName(u)} deserted!`, 'bad'); }
  }
  if (e.net.food > 0 && f.pop < e.housing && e.happy >= 30) {
    f.grow += e.net.food * (e.happy / 60) * (has('medicine') ? 1.5 : 1) * (hasLegacy('golden') ? 1.1 : 1) * (G.diff === 0 ? 1.2 : 1);
    while (f.grow >= growNeed() && f.pop < e.housing) { f.grow -= growNeed(); f.pop++; }
    if (f.pop >= e.housing) f.grow = Math.min(f.grow, growNeed());
  } else if (e.happy < 20 && f.pop > 2 && rnd() < .35) { f.pop--; note('😠 Unrest: citizens are leaving your realm.', 'bad'); }
  if (f.pop > e.housing + 2 && rnd() < .5) { f.pop--; note('🏠 Homeless citizens left. Build more houses.', 'bad'); }
  f.prog += e.net.know;
  if (f.cur) {
    const t = TECH_BY[f.cur];
    if (f.prog >= t.c) { f.prog -= t.c; f.techs[f.cur] = 1; f.cur = null; note(`🔬 Discovered ${t.n}! Choose your next research.`, 'good'); logMsg(`🔬 Discovered ${t.n}.`); }
  }
  f.hmod = Math.abs(f.hmod) < .5 ? 0 : f.hmod * .9;
}
function endTurn() {
  if (!G || G.over || UI.busy) return;
  UI.busy = 1; if (UI.mode) exitMode(); clearSel(); FC = new Map();
  try {
    townsFire(0);
    for (const f of G.f) if (f.id && f.alive) { townsFire(f.id); aiTurn(f); }
    barbTurn();
    playerEconomy();
    const med = has('medicine');
    for (const u of G.units) {
      if (u.acted && !u.perks.includes('march')) continue;
      let h = 10; if (T(u.x, u.y).own === u.o) h = 15;
      const tw = townAt(u.x, u.y); if (tw && tw.o === u.o) h = 25;
      if (u.o === 0 && med) h += 10;
      u.hp = Math.min(100, u.hp + h);
    }
    for (const u of G.units) if (u.perks.includes('medic')) for (const v of G.units) if (v !== u && v.o === u.o && dist(u.x, u.y, v.x, v.y) <= 1) v.hp = Math.min(100, v.hp + 10);
    for (const u of G.units) { u.acted = 0; if (u.o === 0) u.mv = unitMv(u); }
    for (const tw of G.towns) if (tw.o === 0) tw.hp = Math.min(townMaxHp(tw), tw.hp + 10 + 5 * tw.lvl);
    G.turn++;
    claimTerritory(); computeVis(); refreshTavern(false); checkAch(); checkEnd();
  } finally { UI.busy = 0; }
  save(); updateHUD(); requestRender(); showReport();
  if (!G.over) runQueue(true);
}
function checkAch() {
  const f = G.f[0], nt = Object.keys(f.techs).length;
  if (f.pop >= 50) unlock('pop50'); if (f.pop >= 120) unlock('pop120');
  if (nt >= 10) unlock('tech10'); if (nt >= TECH.length) unlock('techall');
  if (f.res.gold >= 1000) unlock('rich'); if (econ().happy >= 90) unlock('bliss');
}
function checkEnd() {
  if (G.over) return;
  if (!G.towns.some(t => t.o === 0)) return gameOver(false, 'Defeat', 'Your last town has fallen. Your dynasty is ended.');
  if (G.f.every(f => f.id === 0 || !f.alive)) return gameOver(true, 'Conquest', 'Every rival realm has fallen before your armies.');
  const m = monument(); if (m && m.stg >= 5) return gameOver(true, 'Wonder', 'The Grand Monument stands complete. Your legend will outlive the ages.');
}
function score(win) {
  const f = G.f[0];
  const parts = [
    ['Population', f.pop * 2], ['Technologies', Object.keys(f.techs).length * 8],
    ['Towns', G.towns.filter(t => t.o === 0).reduce((s, t) => s + 15 * t.lvl, 0)],
    ['Buildings', G.tiles.reduce((s, t) => s + (t.b && t.b.o === 0 && t.b.k !== 'hall' ? 2 * t.b.lvl : 0), 0)],
    ['Enemies defeated', f.kills * 3], ['Camps destroyed', f.camps * 10],
  ];
  if (win) parts.push(['Victory', 300], ['Speed bonus', Math.max(0, (250 - G.turn) * 2)]);
  const base = parts.reduce((s, p) => s + p[1], 0), mult = DIFFS[G.diff].score;
  return {parts, base, mult, total:Math.round(base * mult)};
}
