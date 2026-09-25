'use strict';
// In-game interface: HUD, toasts, the bottom panel ("sheet"), tap handling and map actions.

const UI = {sel:null, reach:null, targets:[], mode:null, valid:null, pend:null, busy:0, realmTab:'overview', confirm:null, lock:0, ev:null};
let REPORT = [];

// ---------- messages ----------
function toast(m, k = '') {
  const box = $('#toasts'); if (!box) return;
  const d = document.createElement('div'); d.className = 'toast ' + k; d.textContent = m; box.appendChild(d);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 450); }, 3400);
}
// During the enemy phase messages are collected into a turn report; otherwise shown at once.
function note(m, k = '') { logMsg(m); if (UI.busy) REPORT.push([m, k]); else toast(m, k); }
function showReport() {
  const bad = REPORT.filter(r => r[1] === 'bad'), rest = REPORT.filter(r => r[1] !== 'bad');
  const list = bad.concat(rest);
  list.slice(0, 4).forEach(([m, k]) => toast(m, k));
  if (list.length > 4) toast(`…and ${list.length - 4} more (Menu → Chronicle)`);
  REPORT = [];
}

// ---------- HUD ----------
const idleUnits = () => G.units.filter(u => u.o === 0 && u.mv > 0 && !u.fort);
function updateHUD() {
  if (!G) return;
  const f = G.f[0], e = econ();
  const chip = (r, val, d) => `<button class="chip" data-a="realm"><span class="ic">${RI[r]}</span><b>${fmt(val)}</b><i class="${d > .05 ? 'pos' : d < -.05 ? 'neg' : ''}">${sgn(d)}</i></button>`;
  $('#res').innerHTML = RES5.map(r => chip(r, f.res[r], e.net[r])).join('') + chip('know', f.prog, e.net.know);
  $('#st-turn').textContent = `Turn ${G.turn}`;
  $('#st-pop').textContent = `👥 ${f.pop}/${e.housing}`;
  $('#st-hap').textContent = `${e.happy >= 70 ? '😄' : e.happy >= 45 ? '🙂' : e.happy >= 25 ? '😐' : '😠'} ${e.happy}`;
  if (f.cur) {
    const t = TECH_BY[f.cur], turns = Math.max(1, Math.ceil((t.c - f.prog) / Math.max(.1, e.net.know)));
    $('#st-rbar').style.width = Math.min(100, f.prog / t.c * 100) + '%';
    $('#st-rtxt').textContent = `🔬 ${t.n} · ${f.prog >= t.c ? 'next turn' : turns + ' turns'}`;
    $('#st-res').classList.remove('pulse');
  } else {
    const any = TECH.some(t => !f.techs[t.id]);
    $('#st-rbar').style.width = '0'; $('#st-rtxt').textContent = any ? '🔬 Choose research' : '🔬 All researched';
    $('#st-res').classList.toggle('pulse', any);
  }
  const idle = idleUnits().length;
  $('#et-sub').textContent = idle ? `${idle} unit${idle > 1 ? 's' : ''} ready` : '';
  updateNextBtn();
}
function updateNextBtn() {
  const b = $('#nextu'); if (!G) return;
  const n = idleUnits().length, sheetOpen = !$('#sheet').classList.contains('hidden');
  b.textContent = `Next unit · ${n}`; b.classList.toggle('hidden', !n || sheetOpen);
  $('#homebtn').classList.toggle('hidden', sheetOpen);
}

// ---------- sheet (bottom panel) ----------
function openSheet(h) { const s = $('#sheet'); s.innerHTML = h; s.classList.remove('hidden'); s.scrollTop = 0; updateNextBtn(); }
function closeSheet() { $('#sheet').classList.add('hidden'); updateNextBtn(); }
const head = (i, t, s) => `<div class="sh-h"><div class="sh-i">${i}</div><div style="min-width:0"><div class="sh-t">${t}</div><div class="sh-s">${s}</div></div><button class="x" data-a="close">✕</button></div>`;
function clearSel() { UI.sel = null; UI.reach = null; UI.targets = []; UI.pend = null; closeSheet(); requestRender(); }
function selUnit() { return UI.sel && UI.sel.u != null ? G.units.find(u => u.id === UI.sel.u) : null; }
function refreshSheet() {
  if (UI.mode) return sheetMode();
  const s = UI.sel; if (!s) return;
  if (s.u != null) { const u = selUnit(); if (u) selectUnit(u); else clearSel(); }
  else if (s.town != null) { const tw = G.towns.find(t => t.id === s.town); if (tw) sheetTown(tw); }
  else sheetTile(s.x, s.y);
}
function afterAction() { updateHUD(); refreshSheet(); requestRender(); }

function selectUnit(u) {
  UI.sel = {u:u.id, x:u.x, y:u.y}; UI.pend = null;
  if (u.o === 0) { UI.reach = reach(u); UI.targets = targetsFor(u).filter(g => VIS[idx(g.x, g.y)]); }
  else { UI.reach = null; UI.targets = []; }
  sheetUnit(u); requestRender();
}
function selectTown(tw) { UI.sel = {town:tw.id, x:tw.x, y:tw.y}; UI.reach = null; UI.targets = []; sheetTown(tw); requestRender(); }
function selectTile(x, y) { UI.sel = {x, y}; UI.reach = null; UI.targets = []; sheetTile(x, y); requestRender(); }

function onTap(x, y) {
  if (!inb(x, y) || UI.busy || G.over) return;
  const t = T(x, y), k = idx(x, y);
  if (UI.mode) {
    if (UI.valid.has(k)) { if (doBuild(UI.mode, x, y)) { const md = UI.mode; refreshValid(); updateHUD(); if (lacks(bCost(md, 1)) || !UI.valid.size) exitMode(); else sheetMode(); requestRender(); } }
    else if (t.seen) toast(buildReason(UI.mode, x, y) || 'Cannot build here', 'bad');
    return;
  }
  if (!t.seen) { clearSel(); return; }
  const su = selUnit();
  if (su && su.o === 0) {
    const tg = UI.targets.find(g => g.x === x && g.y === y);
    if (tg) { UI.pend = tg; sheetAttack(su, tg); return; }
    if (UI.reach && UI.reach.has(k)) {
      moveUnit(su, x, y, UI.reach.get(k)); computeVis(); updateHUD();
      if (G.units.includes(su)) selectUnit(su); else clearSel();
      runQueue(false); return;
    }
  }
  const u = unitAt(x, y);
  if (u && (u.o === 0 || VIS[k]) && !(UI.sel && UI.sel.u === u.id)) { selectUnit(u); return; }
  const tw = townAt(x, y);
  if (tw && !(UI.sel && UI.sel.town === tw.id)) { selectTown(tw); return; }
  if (UI.sel && UI.sel.x === x && UI.sel.y === y && UI.sel.u == null && UI.sel.town == null) { clearSel(); return; }
  selectTile(x, y);
}

function sheetUnit(u) {
  const D = UNI[u.k], mine = u.o === 0, F = fac(u.o);
  const sub = u.k === 'hero' ? `Commander · Level ${u.h.lvl} · ${TRAITS[u.h.trait].n}` : `${D.civ ? 'Civilians' : RANKS[u.rk]} · ${esc(F.name)}`;
  let h = head(D.i, esc(unitName(u)), sub);
  const str = u.k === 'hero' ? 8 + u.h.val : D.str;
  h += `<div class="kv"><span>❤️ <b>${Math.round(u.hp)}</b>/100</span>${D.civ ? '' : `<span>⚔️ <b>${D.rstr ? D.rstr + ' ranged' : str}</b></span>`}
    ${D.rstr ? `<span>🎯 range <b>${unitRange(u)}</b></span>` : ''}<span>👣 <b>${mine ? u.mv : unitMv(u)}</b>/${unitMv(u)}</span>${mine ? `<span>🪙 upkeep <b>${upkeep(u)}</b></span>` : ''}</div>`;
  if (u.k === 'hero') {
    const bar = (n, v, d) => `<div class="attr"><span>${n}</span><div class="bar"><div style="width:${v / 20 * 100}%"></div></div><b>${v}</b></div><div class="hint" style="margin:-2px 0 4px">${d}</div>`;
    h += bar('Leadership', u.h.lead, `Neighbouring units +${u.h.lead + (u.h.trait === 'inspiring' ? 5 : 0)}% strength`) + bar('Tactics', u.h.tac, `Neighbouring units +${u.h.tac}% defence`) + bar('Valour', u.h.val, 'Own fighting strength');
    h += `<div class="hint">${TRAITS[u.h.trait].n}: ${TRAITS[u.h.trait].d} · XP ${Math.floor(u.h.xp)}/${heroNeed(u)} to level ${u.h.lvl + 1}</div><div class="bar"><div style="width:${u.h.xp / heroNeed(u) * 100}%"></div></div>`;
  } else if (!D.civ) {
    const nx = RXP[u.rk + 1];
    h += nx ? `<div class="hint">XP ${u.xp}/${nx} to ${RANKS[u.rk + 1]}${u.rk + 1 >= 2 ? ' (gains a perk)' : ''}</div><div class="bar"><div style="width:${u.xp / nx * 100}%"></div></div>` : '<div class="hint">Legend: maximum rank</div>';
  } else h += `<div class="hint">${D.d}</div>`;
  if (u.perks.length) h += `<div class="hint">${u.perks.map(p => `<span class="tag">${PERKS[p].n}</span> ${PERKS[p].d}`).join('<br>')}</div>`;
  if (mine) {
    const fr = u.k === 'settler' ? foundReason(u) : '';
    h += '<div class="row" style="margin-top:10px">';
    if (u.k === 'settler') h += `<button class="btn pri" data-a="found" ${fr ? 'disabled' : ''}>🏘️ Found town</button>`;
    h += `<button class="btn" data-a="fortify">${u.fort ? '🛡️ Wake' : '🛡️ Fortify'}</button><button class="btn" data-a="nextUnit">Next ▸</button><button class="btn red" data-a="disband">Disband</button></div>`;
    if (fr) h += `<div class="hint">${fr}</div>`;
    h += `<div class="hint">${u.mv > 0 ? 'Tap a lit tile to move' + (UI.targets.length ? ', or a red frame to attack' : '') + '.' : 'No moves left this turn.'}${u.fort ? ' Fortified units get +25% defence and are skipped by "Next unit".' : ''}</div>`;
  } else if (u.o !== BARB) h += `<div class="hint">${G.f[u.o].stance === 'war' ? 'At war with you.' : 'At peace with you.'}</div>`;
  openSheet(h);
}

function sheetAttack(u, tg) {
  const n = combatNums(u, tg), hpT = tg.u ? tg.u.hp : tg.town ? tg.town.hp : tg.camp.hp;
  const nameT = tg.u ? unitName(tg.u) : tg.town ? tg.town.name : 'Barbarian camp';
  const dd = Math.round(Math.min(n.dd, hpT)), da = Math.round(n.da);
  let v, cls;
  if (da >= u.hp) { v = 'Your unit will probably die!'; cls = 'neg'; }
  else if (n.dd >= hpT) { v = tg.town && !UNI[u.k].rstr ? 'You should capture the town!' : 'Decisive: target destroyed'; cls = 'pos'; }
  else if (n.r >= 1.2) { v = 'Favourable'; cls = 'pos'; } else if (n.r >= .85) { v = 'Even fight'; cls = ''; } else { v = 'Risky'; cls = 'neg'; }
  let h = head('⚔️', `Attack ${esc(nameT)}?`, `<span class="${cls}">${v}</span>`);
  h += `<table class="t"><tr><td>Your strength</td><td>${n.as.toFixed(1)}</td></tr><tr><td>Their strength</td><td>${n.ds.toFixed(1)}</td></tr>
    <tr><td>Expected damage to them</td><td>−${dd} (${Math.round(hpT)} → ${Math.max(0, Math.round(hpT - dd))})</td></tr>
    <tr><td>Expected damage to you</td><td>${da ? `−${da} (${Math.round(u.hp)} → ${Math.max(0, Math.round(u.hp - da))})` : 'none (ranged)'}</td></tr></table>`;
  if (tg.town && UNI[u.k].rstr) h += '<div class="hint">Ranged units can wear a town down, but only melee units can capture it.</div>';
  h += '<div class="row" style="margin-top:10px"><button class="btn" data-a="cancelAttack">Cancel</button><button class="btn pri" data-a="attack">⚔️ Attack!</button></div>';
  openSheet(h);
}

function sheetTown(tw) {
  const mine = tw.o === 0, F = fac(tw.o);
  let h = head(TOWN_I[tw.lvl], esc(tw.name), `${TOWN_LV[tw.lvl]}${tw.cap && tw.orig === tw.o ? ' · Capital' : ''} · ${esc(F.name)}`);
  h += `<div class="kv"><span>🏰 HP <b>${Math.round(tw.hp)}</b>/${townMaxHp(tw)}</span><span>🛡️ strength <b>${townStr(tw).toFixed(1)}</b></span><span>📐 border radius <b>${hallRadius(tw.lvl)}</b></span></div>`;
  if (!mine) {
    h += `<div class="hint">${tw.o === BARB ? '' : G.f[tw.o].stance === 'war' ? 'At war. Bring its HP to 0, then attack with a melee unit to capture it. Siege units help a lot.' : 'At peace with you.'}</div>`;
    return openSheet(h);
  }
  h += `<div class="hint">Town hall: +${2 * tw.lvl}🌾 +${2 * tw.lvl}🪙 +${1 + tw.lvl}📖 +${tw.lvl}🪨, housing ${TOWN_HOUSING[tw.lvl]}. Shoots at enemies within 2 tiles each turn.</div>`;
  if (tw.lvl < 4) {
    const U = TOWN_UP[tw.lvl + 1], r = townUpReason(tw);
    h += `<div class="sect">Grow</div><button class="opt" data-a="townUp" ${r ? 'disabled' : ''}><span class="oi">${TOWN_I[tw.lvl + 1]}</span><span class="on">Upgrade to ${TOWN_LV[tw.lvl + 1]}<small>${r || 'Wider borders, more housing, stronger defences'}</small></span><span class="oc">${costH(U.cost)}</span></button>`;
  }
  h += `<div class="sect">Train${tw.tr === G.turn ? ' (done this turn)' : ''}</div><div class="opts">`;
  for (const k of TRAIN_ORDER) {
    const D = UNI[k], r = trainReason(k, tw);
    h += `<button class="opt" data-a="train" data-v="${k}" ${r ? 'disabled' : ''}><span class="oi">${D.i}</span><span class="on">${D.n}<small>${r || D.d}</small></span><span class="oc">${costH(unitCost(k))}<br><small>${D.civ ? '' : '⚔️' + (D.rstr || D.str) + ' '}👣${D.mv}</small></span></button>`;
  }
  openSheet(h + '</div>');
}

function sheetTile(x, y) {
  const t = T(x, y), b = t.b, TR = TERR[t.t], c = campAt(x, y);
  if (c) return openSheet(head('⛺', 'Barbarian camp', `Strength ${campStr(c).toFixed(1)} · HP ${c.hp}/60`) + '<div class="hint">Raiders come from here. Destroy it for gold. Archers and siege units help.</div>');
  const own = t.own, ownTxt = own < 0 ? 'Unclaimed land' : own === 0 ? 'Your land' : `${esc(fac(own).name)} land`;
  const depTxt = t.dep ? (t.dep === 'iron' ? ' · 🔩 iron deposit' : ' · ✨ gold vein') : '';
  if (b && b.k !== 'hall') {
    const D = BLD[b.k];
    let h = head(D.i, `${D.n}${b.k === 'monument' ? ` (stage ${b.stg}/5)` : ` · level ${b.lvl}`}${b.pil ? ' · 🔥 pillaged' : ''}`, ownTxt + ' · ' + TR.n + depTxt);
    if (b.o === 0) {
      const y2 = yieldOf(x, y, b);
      h += `<div class="kv"><span>Output <b>${b.pil ? 'none (pillaged)' : yStr(y2)}</b></span>${jobsOf(b) ? `<span>👷 jobs <b>${jobsOf(b)}</b></span>` : ''}</div><div class="hint">${D.d}</div>`;
      if (b.pil) { const cst = repairCost(b), r = lacks(cst); h += `<button class="opt" data-a="repair" ${r ? 'disabled' : ''} style="margin-top:8px"><span class="oi">🔧</span><span class="on">Repair<small>${r || 'Restore production'}</small></span><span class="oc">${costH(cst)}</span></button>`; }
      else if (b.k === 'monument') {
        const cst = bCost('monument', 1), r = G.monT === G.turn ? 'One stage per turn: come back next turn' : lacks(cst);
        h += `<button class="opt" data-a="stage" ${r ? 'disabled' : ''} style="margin-top:8px"><span class="oi">🗿</span><span class="on">Build stage ${b.stg + 1} of 5<small>${r || (b.stg === 4 ? 'Completing it wins the game!' : 'Each stage also adds +2 happiness')}</small></span><span class="oc">${costH(cst)}</span></button>`;
      } else if (b.lvl < 3) {
        const cst = bCost(b.k, b.lvl + 1), r = upReason(b) || lacks(cst), nb = {...b, lvl:b.lvl + 1};
        h += `<button class="opt" data-a="upgrade" ${r ? 'disabled' : ''} style="margin-top:8px"><span class="oi">⬆️</span><span class="on">Upgrade to level ${b.lvl + 1}<small>${r || 'Becomes ' + yStr(yieldOf(x, y, nb)) + (jobsOf(nb) ? ` · ${jobsOf(nb)} jobs` : '')}</small></span><span class="oc">${costH(cst)}</span></button>`;
      }
      h += '<div class="row" style="margin-top:8px"><button class="btn red" data-a="demolish">Demolish</button></div>';
    } else h += `<div class="hint">${D.d}</div>`;
    return openSheet(h);
  }
  let h = head(TR.i, TR.n, ownTxt + depTxt);
  h += `<div class="kv"><span>👣 move cost <b>${TR.mv || 'impassable'}</b></span>${TR.def ? `<span>🛡️ defence <b>+${TR.def * 100}%</b></span>` : ''}</div>`;
  if (t.ruin) h += '<div class="hint">🏚️ Ancient ruins. Move a unit here to explore them.</div>';
  if (own === 0 && !t.ruin && t.t !== 'water') {
    h += '<div class="sect">Build here</div><div class="opts">';
    for (const k of Object.keys(BLD).filter(k => (BLD[k].on || FLAT).includes(t.t))) {
      const D = BLD[k], cst = bCost(k, 1), r = buildReason(k, x, y) || lacks(cst), pv = yStr(yieldOf(x, y, {k, lvl:1, o:0}));
      h += `<button class="opt" data-a="build" data-v="${k}" ${r ? 'disabled' : ''}><span class="oi">${D.i}</span><span class="on">${D.n}<small>${r || (D.wonder ? D.d : pv + ' · ' + (D.jobs ? D.jobs + ' jobs' : 'no workers'))}</small></span><span class="oc">${costH(cst)}</span></button>`;
    }
    if (t.t === 'forest') h += `<button class="opt" data-a="clear" ${G.f[0].res.gold < 10 ? 'disabled' : ''}><span class="oi">🪓</span><span class="on">Clear forest<small>Turns it into plains and gives +20 🪵</small></span><span class="oc">10🪙</span></button>`;
    h += '</div>';
  } else if (own === -1 && t.t !== 'water') h += '<div class="hint">To build here, expand your borders: grow a town, build a watchtower, or found a settlement.</div>';
  openSheet(h);
}

function sheetBuildMenu() {
  let h = head('🏗️', 'Build', 'Pick a building, then tap a green tile') + '<div class="opts">';
  for (const k in BLD) {
    const D = BLD[k], locked = D.tech && !has(D.tech), la = lacks(bCost(k, 1));
    h += `<button class="opt" data-a="mode" data-v="${k}" ${locked ? 'disabled' : ''}><span class="oi">${D.i}</span><span class="on">${D.n}<small>${locked ? 'Requires ' + TECH_BY[D.tech].n : (la ? la + ' · ' : '') + D.d}</small></span><span class="oc">${costH(bCost(k, 1))}</span></button>`;
  }
  openSheet(h + '</div>');
}
function refreshValid() { UI.valid = new Set(); for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) if (!buildReason(UI.mode, x, y)) UI.valid.add(idx(x, y)); }
function enterMode(k) { UI.mode = k; UI.sel = null; UI.reach = null; UI.targets = []; refreshValid(); sheetMode(); requestRender(); }
function sheetMode() {
  const D = BLD[UI.mode], cst = bCost(UI.mode, 1), la = lacks(cst);
  openSheet(`<div class="sh-h"><div class="sh-i">${D.i}</div><div style="min-width:0"><div class="sh-t">Placing: ${D.n}</div><div class="sh-s">${costH(cst)} · ${UI.valid.size ? UI.valid.size + ' green tiles' : 'no valid tiles in your borders'}${la ? ' · <span class="neg">' + la + '</span>' : ''}</div></div><button class="btn" data-a="exitMode" style="margin-left:auto">Done</button></div><div class="hint">${D.d}</div>`);
}
function exitMode() { UI.mode = null; UI.valid = null; closeSheet(); requestRender(); }

// ---------- action handlers (buttons use data-a / data-v) ----------
const ACT = {};
ACT.close = () => { if (UI.mode) exitMode(); else clearSel(); };
ACT.buildMenu = () => { if (!G) return; UI.mode = null; UI.valid = null; UI.sel = null; UI.reach = null; UI.targets = []; sheetBuildMenu(); requestRender(); };
ACT.mode = k => enterMode(k);
ACT.exitMode = () => exitMode();
ACT.build = k => { const s = UI.sel; if (s && doBuild(k, s.x, s.y)) { toast(`${BLD[k].i} ${BLD[k].n} built`, 'good'); afterAction(); } };
ACT.upgrade = () => { const s = UI.sel, b = T(s.x, s.y).b, c = bCost(b.k, b.lvl + 1); if (upReason(b) || lacks(c)) return; pay(c); b.lvl++; if (b.k === 'tower') { claimTerritory(); computeVis(); } toast(`⬆️ ${BLD[b.k].n} upgraded to level ${b.lvl}`, 'good'); afterAction(); };
ACT.repair = () => { const s = UI.sel, b = T(s.x, s.y).b, c = repairCost(b); if (lacks(c)) return; pay(c); b.pil = 0; toast('🔧 Repaired', 'good'); afterAction(); };
ACT.stage = () => { const s = UI.sel, b = T(s.x, s.y).b, c = bCost('monument', 1); if (G.monT === G.turn || lacks(c)) return; pay(c); b.stg++; G.monT = G.turn; note(`🗿 Grand Monument: stage ${b.stg} of 5 complete.`, 'gold'); afterAction(); checkEnd(); };
ACT.demolish = () => { const s = UI.sel; showConfirm(`Demolish this ${BLD[T(s.x, s.y).b.k].n}? You get nothing back.`, () => { T(s.x, s.y).b = null; claimTerritory(); computeVis(); afterAction(); }); };
ACT.clear = () => { const s = UI.sel, t = T(s.x, s.y); if (G.f[0].res.gold < 10 || t.t !== 'forest') return; G.f[0].res.gold -= 10; G.f[0].res.wood += 20; t.t = 'plains'; TCOL = null; afterAction(); };
ACT.townUp = () => {
  const tw = G.towns.find(t => t.id === UI.sel.town); if (!tw || townUpReason(tw)) return;
  pay(TOWN_UP[tw.lvl + 1].cost); tw.lvl++; tw.hp = townMaxHp(tw); claimTerritory(); computeVis();
  note(`${TOWN_I[tw.lvl]} ${tw.name} is now a ${TOWN_LV[tw.lvl]}!`, 'gold'); logMsg(`${tw.name} grew into a ${TOWN_LV[tw.lvl]}.`);
  unlock(['', '', 'town', 'city', 'metro'][tw.lvl]); afterAction();
};
ACT.train = k => { const tw = G.towns.find(t => t.id === UI.sel.town); if (tw && trainUnit(k, tw)) { toast(`${UNI[k].i} ${UNI[k].n} ready next turn`, 'good'); afterAction(); } };
ACT.cancelAttack = () => { UI.pend = null; const u = selUnit(); if (u) sheetUnit(u); };
ACT.attack = () => {
  const u = selUnit(), tg = UI.pend; if (!u || !tg) return; UI.pend = null;
  const name = tg.u ? unitName(tg.u) : tg.town ? tg.town.name : 'the camp';
  const res = attack(u, tg);
  if (res.died) toast(`💀 Your ${unitName(u)} fell attacking ${name}.`, 'bad');
  else if (res.killed && tg.u) toast(`⚔️ Victory! ${name} destroyed.`, 'good');
  else if (!res.capture && !res.killed) toast(`⚔️ You dealt ${res.dd} damage${res.da ? ` and took ${res.da}` : ''}.`);
  claimTerritory(); computeVis(); checkEnd(); if (G.over) return;
  if (G.units.includes(u)) selectUnit(u); else clearSel();
  updateHUD(); runQueue(false);
};
ACT.fortify = () => { const u = selUnit(); if (!u) return; u.fort = u.fort ? 0 : 1; if (u.fort) ACT.nextUnit(); else selectUnit(u); updateHUD(); };
ACT.nextUnit = () => {
  const list = idleUnits(); if (!list.length) { clearSel(); toast('All units have moved. End the turn when ready.'); return; }
  const cur = UI.sel && UI.sel.u, i = list.findIndex(u => u.id === cur), u = list[(i + 1) % list.length];
  centerOn(u.x, u.y); selectUnit(u);
};
ACT.disband = () => { const u = selUnit(); if (u) showConfirm(`Disband your ${esc(unitName(u))}? This cannot be undone.`, () => { removeUnit(u); clearSel(); computeVis(); updateHUD(); }); };
ACT.found = () => {
  const u = selUnit(); if (!u || foundReason(u)) return;
  const tw = createTown(u.x, u.y, 0, 0); removeUnit(u); claimTerritory(); computeVis();
  note(`🏘️ ${tw.name} has been founded!`, 'gold'); logMsg(`🏘️ Founded ${tw.name}.`); unlock('found');
  selectTown(tw); updateHUD();
};
ACT.home = () => { const c = capital(); if (c) centerOn(c.x, c.y); };
ACT.endTurn = () => endTurn();

function onClick(e) {
  const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
  const f = ACT[b.dataset.a]; if (f) { e.preventDefault(); f(b.dataset.v); }
}
