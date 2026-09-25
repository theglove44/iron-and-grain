'use strict';
// Full-screen views and pop-ups: title, new game, research, army, realm, events, game over. Plus startup.

// ---------- modal plumbing ----------
let MQ = [];
function showModal(h, lock) { $('#mc').innerHTML = h; $('#modal').classList.remove('hidden'); $('#mc').scrollTop = 0; UI.lock = lock ? 1 : 0; }
function closeModal() { $('#modal').classList.add('hidden'); UI.lock = 0; setTimeout(nextModal, 80); }
function queueModal(fn) { MQ.push(fn); if ($('#modal').classList.contains('hidden')) nextModal(); }
function nextModal() { if (!$('#modal').classList.contains('hidden')) return; const fn = MQ.shift(); if (fn) fn(); }
function showConfirm(msg, fn) { UI.confirm = fn; showModal(`<p style="margin:4px 0 14px">${msg}</p><div class="row"><button class="btn" data-a="closeModal">Cancel</button><button class="btn red" data-a="confirmYes">Confirm</button></div>`); }
const mhead = t => `<div class="mh"><h2>${t}</h2><button class="x" data-a="closeModal">✕</button></div>`;
// Pop-ups that need the player's decision: commander skills, peace offers, random events.
function runQueue(withEvents) {
  if (!G || G.over) return;
  while (G.perkQ.length) { const q = G.perkQ.shift(); queueModal(() => showPerk(q)); }
  if (!withEvents) return;
  if (G.peaceOffer != null) { const id = G.peaceOffer; G.peaceOffer = null; if (G.f[id].alive && G.f[id].stance === 'war') queueModal(() => showPeaceOffer(id)); }
  if (G.turn >= G.nextEvent) queueModal(showEvent);
}

// ---------- research ----------
function showResearch() {
  if (!G) return;
  const f = G.f[0], rate = econ().net.know;
  let h = mhead('🔬 Research') + `<div class="hint" style="margin:-4px 0 8px">+${rate.toFixed(1)} 📖 per turn · ${Math.floor(f.prog)} stored. Knowledge is never wasted: it carries over.</div>`;
  const avail = t => !f.techs[t.id] && t.r.every(r => f.techs[r]);
  const groups = [['Available now', TECH.filter(avail)]];
  for (let tier = 1; tier <= 6; tier++) groups.push([`Era ${tier}`, TECH.filter(t => t.t === tier && !avail(t))]);
  for (const [title, list] of groups) {
    if (!list.length) continue;
    h += `<div class="sect">${title}</div><div class="opts">`;
    for (const t of list) {
      const done = f.techs[t.id], avail = !done && t.r.every(r => f.techs[r]), cur = f.cur === t.id;
      const turns = Math.max(0, Math.ceil((t.c - f.prog) / Math.max(.1, rate)));
      const needs = !done && !avail ? ' · needs ' + t.r.filter(r => !f.techs[r]).map(r => TECH_BY[r].n).join(', ') : '';
      h += `<button class="opt ${cur ? 'cur' : ''}" data-a="setTech" data-v="${t.id}" ${avail ? '' : 'disabled'}><span class="oi">${done ? '✅' : cur ? '⏳' : avail ? '📜' : '🔒'}</span><span class="on">${t.n}<small>${t.d}${needs}</small></span><span class="oc">${done ? '' : `${t.c}📖<br><small>${turns ? turns + ' turns' : 'ready'}</small>`}</span></button>`;
    }
    h += '</div>';
  }
  showModal(h);
}
ACT.research = () => showResearch();
ACT.setTech = id => { G.f[0].cur = id; closeModal(); toast(`🔬 Researching ${TECH_BY[id].n}`, 'good'); updateHUD(); };

// ---------- army ----------
function showArmy() {
  if (!G) return;
  const us = G.units.filter(u => u.o === 0).sort((a, b) => (b.k === 'hero') - (a.k === 'hero') || b.rk - a.rk);
  let h = mhead('⚔️ Army') + `<div class="hint" style="margin:-4px 0 8px">${us.length} units · upkeep ${us.reduce((s, u) => s + upkeep(u), 0)} 🪙 per turn · strength ${Math.round(milStr(0))}</div><div class="opts">`;
  if (!us.length) h += '<div class="card">No units. Train some from a town.</div>';
  for (const u of us) {
    const sub = u.k === 'hero' ? `Level ${u.h.lvl} commander` : UNI[u.k].civ ? 'Civilians' : RANKS[u.rk];
    h += `<button class="opt" data-a="goto" data-v="${u.id}"><span class="oi">${UNI[u.k].i}</span><span class="on">${esc(unitName(u))}<small>${sub} · ❤️${Math.round(u.hp)}${u.perks.length ? ' · ' + u.perks.map(p => PERKS[p].n).join(', ') : ''}</small></span><span class="oc">${u.fort ? '🛡️' : u.mv > 0 ? '👣' + u.mv : '✓'}</span></button>`;
  }
  showModal(h + '</div>');
}
ACT.army = () => showArmy();
ACT.goto = id => { const u = G.units.find(u => u.id === +id); closeModal(); if (u) { centerOn(u.x, u.y); selectUnit(u); } };

// ---------- realm ----------
function advice(e) {
  const f = G.f[0], out = [];
  if (!f.cur && TECH.some(t => !f.techs[t.id])) out.push(['🔬', 'Choose something to research: tap the research bar at the top.']);
  if (e.net.food <= .5) out.push(['🌾', 'Food is barely growing. Build farms, ideally on fertile land and next to other farms.']);
  if (f.pop >= e.housing) out.push(['🏠', 'Your people have nowhere to live. Build houses to keep growing.']);
  if (e.jobs > f.pop + .5) out.push(['👷', `${Math.ceil(e.jobs - f.pop)} jobs are unfilled, so buildings run at ${Math.round(e.eff * 100)}%. Grow your population before adding workplaces.`]);
  if (e.unemployed >= 3) out.push(['💤', `${e.unemployed} citizens have no work. Farms, camps and quarries give them jobs.`]);
  if (e.happy < 40) out.push(['😠', 'Your people are unhappy, so output and growth suffer. Build a temple or lower taxes.']);
  if (e.net.gold < 0) out.push(['🪙', 'You lose gold every turn. When the treasury empties, soldiers desert. Raise taxes, build markets or disband units.']);
  if (!hasB('barracks') && G.turn > 5) out.push(['🛡️', 'Build a Barracks so you can train proper soldiers. Raiders are coming.']);
  const tw = G.towns.find(t => t.o === 0 && !townUpReason(t)); if (tw) out.push(['🏘️', `${tw.name} can grow. Tap it and upgrade to push your borders out.`]);
  if (G.f.some(g => g.id && g.alive && g.stance === 'war')) out.push(['⚔️', 'You are at war. Keep troops near your towns and bring siege units to attack theirs.']);
  if (G.tiles.some(t => t.b && t.b.o === 0 && t.b.pil)) out.push(['🔧', 'Some buildings are pillaged and produce nothing. Tap them to repair.']);
  if (!out.length) out.push(['✅', 'The realm is in good order. Expand, research and prepare for war.']);
  return out;
}
function showRealm(tab) {
  if (!G) return;
  tab = UI.realmTab = tab || UI.realmTab;
  const f = G.f[0], e = econ();
  const tabs = [['overview', 'Overview'], ['advisor', 'Advisor'], ['diplo', 'Diplomacy'], ['tavern', 'Tavern'], ['market', 'Market'], ['log', 'Chronicle']];
  let h = mhead('👑 ' + esc(f.name)) + `<div class="tabs">${tabs.map(([k, n]) => `<button class="${k === tab ? 'on' : ''}" data-a="realmTab" data-v="${k}">${n}</button>`).join('')}</div>`;
  const r1 = v => Math.round(v * 10) / 10;
  if (tab === 'overview') {
    h += `<div class="card"><table class="t"><tr><td>👥 Population / housing</td><td>${f.pop} / ${e.housing}</td></tr>
      <tr><td>🌱 Growth</td><td>${f.pop >= e.housing ? 'needs housing' : e.happy < 30 ? 'too unhappy' : e.net.food <= 0 ? 'needs food' : Math.floor(f.grow) + ' / ' + Math.ceil(growNeed())}</td></tr>
      <tr><td>👷 Jobs filled</td><td>${Math.min(f.pop, e.jobs)} / ${e.jobs} (${Math.round(e.eff * 100)}% output)</td></tr><tr><td>💤 Unemployed</td><td>${e.unemployed}</td></tr>
      <tr><td>😊 Happiness</td><td>${e.happy} (output ×${e.hf.toFixed(2)})</td></tr></table></div>`;
    h += `<div class="card"><table class="t"><tr><td>🌾 Food produced</td><td>+${r1(e.prod.food)}</td></tr><tr><td>🌾 Eaten by citizens</td><td>−${r1(e.foodUse)}</td></tr>
      <tr><td>🪙 From buildings</td><td>+${r1(e.prod.gold)}</td></tr><tr><td>🪙 Taxes</td><td>+${r1(e.tax)}</td></tr>${e.trade ? `<tr><td>🪙 Trade with neighbours</td><td>+${e.trade}</td></tr>` : ''}
      <tr><td>🪙 Army upkeep</td><td>−${e.upkeep}</td></tr><tr><td>🪵 🪨 🔩 per turn</td><td>+${r1(e.net.wood)} / +${r1(e.net.stone)} / +${r1(e.net.iron)}</td></tr><tr><td>📖 Knowledge</td><td>+${r1(e.net.know)}</td></tr></table></div>`;
    h += `<div class="card"><b>Happiness</b><table class="t">${e.parts.map(([n, v]) => `<tr><td>${n}</td><td class="${v > 0 ? 'pos' : v < 0 ? 'neg' : ''}">${v > 0 ? '+' : ''}${v}</td></tr>`).join('')}</table></div>`;
    h += `<div class="sect">Tax rate</div><div class="seg">${TAX.map((t, i) => `<button class="${f.tax === i ? 'on' : ''}" data-a="tax" data-v="${i}">${t.n}</button>`).join('')}</div>
      <div class="hint">${TAX[f.tax].g} 🪙 per citizen, ${TAX[f.tax].h >= 0 ? '+' : ''}${TAX[f.tax].h} happiness.</div>`;
  } else if (tab === 'advisor') {
    h += advice(e).map(([i, t]) => `<div class="card">${i} ${t}</div>`).join('');
  } else if (tab === 'diplo') {
    for (const g of G.f.slice(1)) {
      if (!g.alive) { h += `<div class="card">☠️ <b>${esc(g.name)}</b>: destroyed.</div>`; continue; }
      if (!g.met) { h += '<div class="card">❔ An unknown realm. Explore to make contact.</div>'; continue; }
      const att = g.att >= 30 ? 'Friendly' : g.att >= 5 ? 'Cordial' : g.att > -20 ? 'Wary' : 'Hostile';
      const trib = 40 + G.turn;
      h += `<div class="card"><div style="display:flex;justify-content:space-between"><b style="color:${g.c}">● ${esc(g.name)}</b><span class="${g.stance === 'war' ? 'neg' : 'pos'}">${g.stance === 'war' ? '⚔️ At war' : '🕊️ At peace'}</span></div>
        <div class="hint">Attitude: ${att} · Army strength ${Math.round(milStr(g.id))} (yours ${Math.round(milStr(0))}) · ${G.towns.filter(t => t.o === g.id).length} town(s)${g.stance === 'peace' && g.peaceT >= 10 ? ' · trade route active' : ''}</div><div class="row" style="margin-top:8px">`;
      if (g.stance === 'peace') h += `<button class="btn" data-a="gift" data-v="${g.id}" ${f.res.gold < 25 ? 'disabled' : ''}>🎁 Gift 25🪙</button><button class="btn red" data-a="war" data-v="${g.id}">⚔️ Declare war</button>`;
      else h += `<button class="btn" data-a="peace" data-v="${g.id}" ${g.lastAsk === G.turn ? 'disabled' : ''}>🕊️ Propose peace</button><button class="btn" data-a="tribute" data-v="${g.id}" ${f.res.gold < trib || g.warT < 3 ? 'disabled' : ''}>💰 Buy peace ${trib}🪙</button>`;
      h += '</div></div>';
    }
    h += '<div class="hint">Rivals keep the peace for the first turns, then may declare war if they think you are weak. A strong army and gifts keep them friendly. Long peace opens trade routes (+gold).</div>';
  } else if (tab === 'tavern') {
    const mx = maxHeroes(), n = heroCount();
    h += `<div class="hint" style="margin-bottom:8px">Commanders: ${n}/${mx}. New candidates every 12 turns (next in ${Math.max(0, 12 - (G.turn - G.tav.t))}). Potential is a scout's estimate: it predicts how fast they improve.</div>`;
    if (!G.tav.c.length) h += '<div class="card">No one is looking for work right now.</div>';
    G.tav.c.forEach((c, i) => {
      const stars = n2 => '★'.repeat(n2) + '☆'.repeat(5 - n2);
      const bar = (nm, v) => `<div class="attr"><span>${nm}</span><div class="bar"><div style="width:${v / 20 * 100}%"></div></div><b>${v}</b></div>`;
      const cost = c.free ? 0 : c.cost;
      h += `<div class="card"><div style="display:flex;justify-content:space-between"><b>🎖️ ${esc(c.name)}</b><span class="tag">${TRAITS[c.trait].n}</span></div><div class="hint">${TRAITS[c.trait].d}</div>
        ${bar('Leadership', c.lead)}${bar('Tactics', c.tac)}${bar('Valour', c.val)}<div class="hint">Potential: <span style="color:var(--gd)">${c.potLo === c.potHi ? stars(c.potLo) : stars(c.potLo) + ' – ' + stars(c.potHi)}</span></div>
        <button class="btn pri" style="width:100%;margin-top:8px" data-a="hire" data-v="${i}" ${n >= mx || f.res.gold < cost ? 'disabled' : ''}>${n >= mx ? 'No commander slots free' : cost ? `Hire for ${cost} 🪙` : 'Hire (free)'}</button></div>`;
    });
  } else if (tab === 'market') {
    if (!hasB('market')) h += '<div class="card">Build a Market (research Currency) to trade resources for gold.</div>';
    else {
      const rate = .5 + .1 * (maxBLvl('market') - 1);
      h += `<div class="hint" style="margin-bottom:8px">Trade in lots of 10. Upgrading markets improves selling prices (now ${Math.round(rate * 100)}%).</div>`;
      for (const r in TRADE) {
        const sell = Math.round(TRADE[r] * rate);
        h += `<div class="card" style="display:flex;align-items:center;gap:8px"><b style="flex:1">${RI[r]} ${RN[r]} <small class="hint">(${fmt(f.res[r])})</small></b><button class="btn" data-a="buy" data-v="${r}" ${f.res.gold < TRADE[r] ? 'disabled' : ''}>Buy for ${TRADE[r]}🪙</button><button class="btn" data-a="sell" data-v="${r}" ${f.res[r] < 10 ? 'disabled' : ''}>Sell for ${sell}🪙</button></div>`;
      }
    }
  } else {
    h += G.log.slice().reverse().map(([t, m]) => `<div style="padding:4px 0;border-bottom:1px solid var(--ln);font-size:13px"><span class="hint">T${t}</span> ${esc(m)}</div>`).join('') || '<div class="hint">Nothing yet.</div>';
  }
  showModal(h);
}
ACT.realm = () => showRealm();
ACT.realmTab = t => showRealm(t);
ACT.tax = v => { G.f[0].tax = +v; updateHUD(); showRealm('overview'); };
ACT.gift = id => { const g = G.f[+id]; if (G.f[0].res.gold < 25) return; G.f[0].res.gold -= 25; g.att += 12; toast(`🎁 The ${g.name} appreciate your gift.`, 'good'); updateHUD(); showRealm('diplo'); };
ACT.war = id => showConfirm(`Declare war on the ${esc(G.f[+id].name)}? Other realms will trust you less and your people will be unhappier.`, () => { declareWar(+id, true); updateHUD(); });
ACT.peace = id => {
  const g = G.f[+id]; g.lastAsk = G.turn;
  if (g.warT < 5) toast(`The ${g.name} refuse to talk yet. Try again in ${5 - g.warT} turns.`, 'bad');
  else if (milStr(0) > milStr(g.id) * 1.2 || rnd() < .25) makePeace(g.id);
  else toast(`The ${g.name} reject your offer.`, 'bad');
  updateHUD(); showRealm('diplo');
};
ACT.tribute = id => { const g = G.f[+id], c = 40 + G.turn; if (G.f[0].res.gold < c || g.warT < 3) return; G.f[0].res.gold -= c; makePeace(g.id); updateHUD(); showRealm('diplo'); };
ACT.hire = i => { const c = G.tav.c[+i]; if (c && hireHero(c, c.free)) { G.tav.c.splice(+i, 1); updateHUD(); requestRender(); } showRealm('tavern'); };
ACT.buy = r => { if (G.f[0].res.gold < TRADE[r]) return; G.f[0].res.gold -= TRADE[r]; G.f[0].res[r] += 10; updateHUD(); showRealm('market'); };
ACT.sell = r => { if (G.f[0].res[r] < 10) return; G.f[0].res[r] -= 10; G.f[0].res.gold += Math.round(TRADE[r] * (.5 + .1 * (maxBLvl('market') - 1))); updateHUD(); showRealm('market'); };

// ---------- decisions ----------
function showPerk(q) {
  const u = G.units.find(v => v.id === q.id); if (!u) return nextModal();
  UI.perkFor = u.id;
  showModal(`<div class="mh"><h2>🎖️ ${esc(u.h.name)}: level ${u.h.lvl}</h2></div><p class="hint">Leadership ${u.h.lead} · Tactics ${u.h.tac} · Valour ${u.h.val}. Choose a new skill:</p><div class="opts">${q.opts.map(p => `<button class="opt" data-a="pickPerk" data-v="${p}"><span class="oi">✨</span><span class="on">${PERKS[p].n}<small>${PERKS[p].d}</small></span></button>`).join('')}</div>`, true);
}
ACT.pickPerk = p => { const u = G.units.find(v => v.id === UI.perkFor); if (u && !u.perks.includes(p)) u.perks.push(p); closeModal(); refreshSheet(); };
function showPeaceOffer(id) {
  const g = G.f[id], gold = 20 + Math.floor(G.turn / 2); UI.offer = {id, gold};
  showModal(`<div class="mh"><h2>🕊️ Peace offer</h2></div><p>Battered by war, the <b style="color:${g.c}">${esc(g.name)}</b> sue for peace and offer ${gold} 🪙 in reparations.</p><div class="row"><button class="btn" data-a="peaceNo">Fight on</button><button class="btn pri" data-a="peaceYes">Accept peace</button></div>`, true);
}
ACT.peaceYes = () => { makePeace(UI.offer.id); G.f[0].res.gold += UI.offer.gold; closeModal(); updateHUD(); };
ACT.peaceNo = () => { closeModal(); };
function showEvent() {
  G.nextEvent = G.turn + ri(6, 11);
  const pool = EV.filter(e => (!e.min || G.turn >= e.min) && (!e.ok || e.ok()));
  let ev = pick(pool); if (ev.make) ev = ev.make();
  UI.ev = ev;
  const label = c => [c.p ? '−' + costH(c.p) : '', c.g ? '+' + costH(c.g) : '', c.fx || ''].filter(Boolean).join(' · ');
  showModal(`<div style="text-align:center;font-size:44px">${ev.i}</div><div class="mh" style="justify-content:center"><h2>${ev.t}</h2></div><p style="text-align:center;color:#e2d6c0">${esc(ev.d)}</p><div class="opts">${ev.c.map((c, i) => `<button class="opt" data-a="evChoice" data-v="${i}" ${c.p && lacks(c.p) ? 'disabled' : ''}><span class="on">${c.l}<small>${(c.p && lacks(c.p)) || label(c) || 'No effect'}</small></span></button>`).join('')}</div>`, true);
}
ACT.evChoice = i => {
  const ev = UI.ev, c = ev.c[+i]; if (c.p) { if (lacks(c.p)) return; pay(c.p); }
  if (c.g) gain(c.g); if (c.f) c.f();
  logMsg(`${ev.i} ${ev.t}: ${c.l}`); closeModal(); computeVis(); updateHUD(); requestRender();
};

// ---------- menu, help, achievements ----------
ACT.menu = () => showModal(mhead('☰ Menu') + `<div class="tbtns" style="margin:4px 0"><button class="btn" data-a="closeModal">▶ Resume</button><button class="btn" data-a="help">📖 How to Play</button><button class="btn" data-a="ach">🏆 Achievements & Legacies</button><button class="btn" data-a="logTab">📜 Chronicle</button><button class="btn" data-a="saveExit">💾 Save & exit to title</button><button class="btn red" data-a="abandon">Abandon this game</button></div><div class="hint">The game saves itself at the end of every turn and whenever you leave the app.</div>`);
ACT.logTab = () => showRealm('log');
ACT.saveExit = () => { save(); closeModal(); clearSel(); G = null; showTitle(); };
ACT.abandon = () => showConfirm('Abandon this game? It will be deleted and earn no XP.', () => { localStorage.removeItem(SAVE_KEY); G = null; showTitle(); });
ACT.help = () => showModal(mhead('📖 How to Play') + `<div class="help">${HELP}</div>`);
ACT.ach = () => {
  const lv = rulerLvl();
  let h = mhead('🏆 Achievements') + `<div class="hint" style="margin:-4px 0 8px">Ruler level ${lv} · ${Object.keys(P.ach).length}/${ACH.length} unlocked</div><div class="opts">`;
  for (const a of ACH) h += `<div class="opt" style="${P.ach[a.id] ? '' : 'opacity:.5'}"><span class="oi">${P.ach[a.id] ? '🏆' : '🔒'}</span><span class="on">${a.n}<small>${a.d}</small></span><span class="oc">+${a.xp} XP</span></div>`;
  h += '</div><div class="sect">Legacies (starting bonuses)</div><div class="opts">';
  for (const l of LEGACY.slice(1)) h += `<div class="opt" style="${lv >= l.lv ? '' : 'opacity:.5'}"><span class="oi">${lv >= l.lv ? '👑' : '🔒'}</span><span class="on">${l.n}<small>${l.d}</small></span><span class="oc">Lv ${l.lv}</span></div>`;
  h += '</div><div class="sect">Difficulties</div><div class="opts">';
  for (const d of DIFFS) h += `<div class="opt" style="${lv >= d.lv ? '' : 'opacity:.5'}"><span class="oi">${lv >= d.lv ? '⚔️' : '🔒'}</span><span class="on">${d.n}<small>${d.d} Score ×${d.score}</small></span><span class="oc">Lv ${d.lv}</span></div>`;
  showModal(h + '</div>');
};
ACT.closeModal = () => closeModal();
ACT.confirmYes = () => { const f = UI.confirm; UI.confirm = null; closeModal(); if (f) f(); };

function showWelcome() {
  showModal(`<div class="mh"><h2>👑 Welcome, ruler</h2></div><div class="help"><ul>
    <li>Your first town is outlined in blue. Tap any tile inside your borders to build on it.</li>
    <li>Start with <b>houses</b> 🏠 and <b>farms</b> 🌾 so your people grow, and a <b>lumber camp</b> 🪓 in the forest.</li>
    <li>Tap the <b>research bar</b> at the top to pick a technology.</li>
    <li>Your 🧭 scout can explore ruins 🏚️ for treasure. Green dots mark units that can still move.</li>
    <li>Barbarian camps ⛺ send raiders from about turn 8. Build a barracks and train soldiers.</li>
    <li>Stuck? Check <b>Realm → Advisor</b>.</li></ul></div><button class="btn pri" style="width:100%;margin-top:10px" data-a="closeModal">Let's begin</button>`);
}

// ---------- game over ----------
function gameOver(win, kind, text) {
  G.over = 1;
  const sc = score(win), xp = Math.round(sc.total * .5), before = rulerLvl();
  P.games++; P.best = Math.max(P.best, sc.total);
  if (win) { P.wins++; }
  P.xp += xp; saveProfile();
  if (win) { unlock('win'); if (G.diff >= 2) unlock('winhard'); if (kind === 'Wonder') unlock('wonder'); }
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  const after = rulerLvl();
  const newUnl = [...LEGACY.filter(l => l.lv > before && l.lv <= after).map(l => 'Legacy: ' + l.n), ...DIFFS.filter(d => d.lv > before && d.lv <= after).map(d => 'Difficulty: ' + d.n)];
  MQ = [];
  showModal(`<div style="text-align:center;font-size:54px">${win ? '👑' : '💀'}</div><div class="mh" style="justify-content:center"><h2>${win ? kind + ' Victory!' : 'Defeat'}</h2></div>
    <p style="text-align:center">${text}<br><span class="hint">Turn ${G.turn} · ${DIFFS[G.diff].n}</span></p>
    <div class="card"><table class="t">${sc.parts.map(([n, v]) => `<tr><td>${n}</td><td>${v}</td></tr>`).join('')}<tr><td>Difficulty multiplier</td><td>×${sc.mult}</td></tr><tr><td><b>Final score</b></td><td><b>${sc.total}</b></td></tr></table></div>
    <div class="card" style="text-align:center"><b>+${xp} Ruler XP</b>${after > before ? `<div style="color:var(--gd);margin-top:4px">👑 Ruler level ${after}!</div>` : ''}${newUnl.map(u => `<div class="pos">🔓 ${u}</div>`).join('')}</div>
    <button class="btn pri" style="width:100%" data-a="toTitle">Return to title</button>`, true);
}
ACT.toTitle = () => { closeModal(); clearSel(); G = null; showTitle(); };

// ---------- title & new game ----------
const SETUP = {size:'medium', rivals:2, diff:1, legacy:'none', name:''};
function showTitle() {
  if (UI.updateReady) { save(); location.reload(); return; }
  const el = $('#title'); el.classList.remove('hidden'); $('#modal').classList.add('hidden');
  const lv = rulerLvl(), cur = P.xp - xpFor(lv), need = xpFor(lv + 1) - xpFor(lv), hasSave = !!localStorage.getItem(SAVE_KEY);
  const nxt = [...LEGACY.map(l => [l.lv, 'legacy ' + l.n]), ...DIFFS.map(d => [d.lv, d.n + ' difficulty'])].filter(([l]) => l > lv).sort((a, b) => a[0] - b[0])[0];
  el.innerHTML = `<div class="wrap"><div class="crest">⚔️🌾</div><div class="logo">IRON &amp; GRAIN</div><div class="tagline">Build · Research · Conquer</div>
    <div class="card" style="margin-top:22px"><div style="display:flex;justify-content:space-between;align-items:baseline"><b>👑 Ruler level ${lv}</b><small class="hint">${fmt(cur)} / ${fmt(need)} XP</small></div>
    <div class="bar" style="margin:6px 0"><div style="width:${cur / need * 100}%"></div></div>
    <small class="hint">${P.games} games · ${P.wins} victories · best score ${fmt(P.best)} · ${Object.keys(P.ach).length}/${ACH.length} achievements${nxt ? `<br>Level ${nxt[0]} unlocks ${nxt[1]}` : ''}</small></div>
    <div class="tbtns">${hasSave ? '<button class="btn pri" data-a="continue">▶ Continue</button>' : ''}<button class="btn ${hasSave ? '' : 'pri'}" data-a="setup">New Game</button><button class="btn" data-a="ach">🏆 Achievements &amp; Legacies</button><button class="btn" data-a="help">📖 How to Play</button></div>
    <div class="offline" id="offline"></div></div>`;
  checkOffline();
}
function showSetup() {
  const lv = rulerLvl(), el = $('#title');
  const seg = (k, opts) => `<div class="seg">${opts.map(([v, n, dis]) => `<button class="${SETUP[k] == v ? 'on' : ''}" data-a="set" data-v="${k}:${v}" ${dis ? 'disabled' : ''}>${n}</button>`).join('')}</div>`;
  if (!SETUP.name) SETUP.name = randomRealm();
  el.innerHTML = `<div class="wrap"><div class="mh" style="margin-top:6px"><button class="x" style="margin:0" data-a="back">‹</button><h2>New Game</h2></div>
    <div class="sect">Realm name</div><div style="display:flex;gap:6px"><input class="txt" id="rname" maxlength="32" value="${esc(SETUP.name)}"><button class="btn" data-a="rollName">🎲</button></div>
    <div class="sect">Map size</div>${seg('size', [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']])}
    <div class="sect">Rival realms</div>${seg('rivals', [[1, '1'], [2, '2'], [3, '3']])}
    <div class="sect">Difficulty</div>${seg('diff', DIFFS.map((d, i) => [i, d.n + (lv < d.lv ? ' 🔒' : ''), lv < d.lv]))}
    <div class="hint">${DIFFS[SETUP.diff].d} Score ×${DIFFS[SETUP.diff].score}.</div>
    <div class="sect">Legacy (starting bonus)</div><div class="opts">${LEGACY.map(l => `<button class="opt ${SETUP.legacy === l.id ? 'cur' : ''}" data-a="set" data-v="legacy:${l.id}" ${lv < l.lv ? 'disabled' : ''}><span class="oi">${lv < l.lv ? '🔒' : SETUP.legacy === l.id ? '👑' : '◻️'}</span><span class="on">${l.n}<small>${l.d}</small></span><span class="oc">${l.lv > 1 ? 'Lv ' + l.lv : ''}</span></button>`).join('')}</div>
    <div class="tbtns"><button class="btn pri" data-a="start">⚔️ Found your realm</button></div>
    <div class="hint" style="text-align:center">Every map is randomly generated.</div></div>`;
}
ACT.setup = () => { if (localStorage.getItem(SAVE_KEY)) showConfirm('Starting a new game replaces your saved game. Continue?', showSetup); else showSetup(); };
ACT.set = v => { const [k, val] = v.split(':'); const inp = $('#rname'); if (inp) SETUP.name = inp.value; SETUP[k] = (k === 'size' || k === 'legacy') ? val : +val; showSetup(); };
ACT.rollName = () => { SETUP.name = randomRealm(); showSetup(); };
ACT.back = () => showTitle();
ACT.continue = () => { if (loadGame()) startGame(); else toast('No saved game found', 'bad'); };
ACT.start = () => {
  SETUP.name = ($('#rname') ? $('#rname').value : '').trim() || randomRealm();
  newGame(SETUP); P.seenHelp++; saveProfile(); save(); startGame();
  if (P.seenHelp <= 3) queueModal(showWelcome);
};
function startGame() {
  $('#title').classList.add('hidden'); MQ = []; UI.mode = null; UI.valid = null; clearSel();
  resize(); cam.z = 1.15; const c = capital(); if (c) centerOn(c.x, c.y);
  updateHUD(); requestRender(); runQueue(false);
}

// ---------- offline support ----------
async function checkOffline() {
  const el = $('#offline'); if (!el) return;
  if (!('serviceWorker' in navigator) || !window.caches) { el.textContent = 'Offline mode is not available in this browser.'; return; }
  try {
    const keys = await caches.keys(), k = keys.filter(k => k.startsWith('ironGrain-')).sort().pop();
    const ok = k && await (await caches.open(k)).match('js/screens.js', {ignoreSearch:true});
    el.textContent = ok ? `✓ Ready to play offline · version ${k.split('-v')[1]}` : 'Preparing offline mode… reopen in a moment.';
    el.classList.toggle('ok', !!ok);
  } catch (e) { el.textContent = ''; }
}

// ---------- boot ----------
function boot() {
  CV = $('#map'); CX = CV.getContext('2d');
  bindInput();
  document.addEventListener('click', onClick);
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal' && !UI.lock) closeModal(); });
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe($('#mapwrap'));
  if (navigator.standalone || matchMedia('(display-mode: standalone)').matches) document.documentElement.classList.add('sa');
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('pagehide', save);
  showTitle();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js', {updateViaCache: 'none'}).then(reg => {
      reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
      return navigator.serviceWorker.ready;
    }).then(() => setTimeout(checkOffline, 800)).catch(() => {});
    // A new version took over: restart into it straight away on the title screen, or at the next return to the title.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) return;
      if (!G) location.reload();
      else { UI.updateReady = 1; toast('⬆️ Update downloaded. It applies when you return to the title screen.', 'gold'); }
    });
  }
}
boot();
