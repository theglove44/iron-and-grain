'use strict';
// Canvas rendering, camera, touch input, and small animations.

let CV, CX, DPR = Math.min(3, window.devicePixelRatio || 1), VW = 0, VH = 0, TCOL = null, rq = false;
const cam = {x:0, y:0, z:1.15};
const ANIM = new Map(); // unit id -> {fx, fy, t0}
let FX = [];            // floating numbers and shot lines

function requestRender() { if (!rq) { rq = true; requestAnimationFrame(render); } }
function resize() {
  if (!CV) return;
  const r = CV.getBoundingClientRect(); VW = r.width; VH = r.height;
  CV.width = Math.round(VW * DPR); CV.height = Math.round(VH * DPR);
  if (G) clampCam(); requestRender();
}
function clampCam() {
  const vw = VW / cam.z, vh = VH / cam.z, mw = G.w * TS, mh = G.h * TS, pad = TS * 1.5;
  cam.x = mw + 2 * pad < vw ? (mw - vw) / 2 : clamp(cam.x, -pad, mw - vw + pad);
  cam.y = mh + 2 * pad < vh ? (mh - vh) / 2 : clamp(cam.y, -pad, mh - vh + pad + vh * .45); // extra room so tiles can be scrolled above the panel
}
function centerOn(x, y) { cam.x = (x + .5) * TS - VW / 2 / cam.z; cam.y = (y + .5) * TS - VH / 2.6 / cam.z; clampCam(); requestRender(); }

function animMove(u) { if (VIS && (u.o === 0 || VIS[idx(u.x, u.y)])) ANIM.set(u.id, {fx:u.x, fy:u.y, t0:performance.now()}); }
function shot(x, y, x2, y2) { if (VIS && (VIS[idx(x, y)] || VIS[idx(x2, y2)])) FX.push({k:'shot', x, y, x2, y2, t0:performance.now()}); }
function floatTxt(x, y, txt, col) { if (VIS && VIS[idx(x, y)]) FX.push({k:'txt', x, y, txt, col, t0:performance.now()}); }

// ---------- colour helpers ----------
const RGB = new Map();
function hexRgb(h) { let c = RGB.get(h); if (!c) { const n = parseInt(h.slice(1), 16); c = [n >> 16, (n >> 8) & 255, n & 255]; RGB.set(h, c); } return c; }
function rgba(h, a) { const [r, g, b] = hexRgb(h); return `rgba(${r},${g},${b},${a})`; }
function shade(h, amt) { const c = hexRgb(h).map(v => Math.round(amt > 0 ? v + (255 - v) * amt : v * (1 + amt))); return `rgb(${c[0]},${c[1]},${c[2]})`; }
function hsh(x, y, k = 0) { let h = (x * 374761393 + y * 668265263 + (G.seed | 0) + k * 1013904223) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function buildTCol() { TCOL = G.tiles.map((t, i) => shade(TERR[t.t].c, (hsh(i % G.w, (i / G.w) | 0) - .5) * .14)); }

// Emoji are pre-rendered into small canvases once per size; drawing images is much faster than drawing text.
const SPR = new Map();
function spr(ch, px) {
  px = Math.max(6, Math.round(px / 2) * 2); const k = ch + px; let c = SPR.get(k); if (c) return c;
  const s = Math.ceil(px * 1.3 * DPR); c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d'); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `${px * DPR}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  g.fillText(ch, s / 2, s / 2 + px * DPR * .07);
  if (SPR.size > 700) SPR.clear(); SPR.set(k, c); return c;
}
function dspr(ctx, ch, px, x, y, a) { const c = spr(ch, px), w = c.width / DPR; if (a != null) ctx.globalAlpha = a; ctx.drawImage(c, x - w / 2, y - w / 2, w, w); if (a != null) ctx.globalAlpha = 1; }
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function hpBar(ctx, cx, y, w, frac, col) { ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(cx - w / 2 - 1, y - 1, w + 2, 5); ctx.fillStyle = col || (frac > .6 ? '#6fd36a' : frac > .3 ? '#e8c34a' : '#ff6b55'); ctx.fillRect(cx - w / 2, y, w * clamp(frac, 0, 1), 3); }

function terrDetail(ctx, t, x, y, px, py, s) {
  const h1 = hsh(x, y, 1), h2 = hsh(x, y, 2), h3 = hsh(x, y, 3);
  switch (t.t) {
    case 'water': {
      ctx.strokeStyle = 'rgba(200,230,255,.18)'; ctx.lineWidth = Math.max(1, s * .035); ctx.beginPath();
      for (let k = 0; k < 2; k++) { const wy = py + s * (.3 + .38 * k + h1 * .08), wx = px + s * (.12 + (k ? h2 : h3) * .3), a = s * .11; ctx.moveTo(wx, wy); ctx.quadraticCurveTo(wx + a, wy - a * .6, wx + 2 * a, wy); ctx.quadraticCurveTo(wx + 3 * a, wy + a * .6, wx + 4 * a, wy); }
      ctx.stroke(); break;
    }
    case 'plains': case 'fertile': {
      if (s < 18) break;
      ctx.strokeStyle = t.t === 'fertile' ? 'rgba(30,70,20,.45)' : 'rgba(60,80,30,.4)'; ctx.lineWidth = Math.max(1, s * .03); ctx.beginPath();
      for (let k = 0; k < 3; k++) { const gx = px + s * (.18 + hsh(x, y, k + 4) * .64), gy = py + s * (.2 + hsh(x, y, k + 8) * .6), a = s * .06; ctx.moveTo(gx - a, gy - a); ctx.lineTo(gx, gy); ctx.lineTo(gx + a, gy - a * 1.2); }
      ctx.stroke();
      if (t.t === 'fertile' && h1 > .55) { ctx.fillStyle = 'rgba(255,230,120,.75)'; ctx.beginPath(); ctx.arc(px + s * (.2 + h2 * .6), py + s * (.2 + h3 * .6), s * .035, 0, 7); ctx.fill(); }
      break;
    }
    case 'desert': { ctx.fillStyle = 'rgba(150,120,60,.4)'; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(px + s * (.15 + hsh(x, y, k + 4) * .7), py + s * (.15 + hsh(x, y, k + 9) * .7), Math.max(.8, s * .025), 0, 7); ctx.fill(); } break; }
    case 'forest': {
      dspr(ctx, h1 > .5 ? '🌲' : '🌳', s * .44, px + s * .3, py + s * .34);
      dspr(ctx, h2 > .4 ? '🌲' : '🌳', s * .44, px + s * .7, py + s * .4);
      dspr(ctx, '🌲', s * .42, px + s * .48, py + s * .7); break;
    }
    case 'hills': {
      const hill = (cx, by, w, hh) => { ctx.fillStyle = 'rgba(95,75,40,.5)'; ctx.beginPath(); ctx.ellipse(cx, by, w, hh, 0, Math.PI, 0); ctx.fill(); ctx.fillStyle = 'rgba(255,240,200,.2)'; ctx.beginPath(); ctx.ellipse(cx - w * .15, by - hh * .3, w * .45, hh * .35, 0, Math.PI, 0); ctx.fill(); };
      hill(px + s * .32, py + s * .72, s * .25, s * .22); hill(px + s * .68, py + s * .56, s * .23, s * .2); break;
    }
    case 'mountain': {
      const m = (cx, by, w, hh) => {
        ctx.fillStyle = '#5d574d'; ctx.beginPath(); ctx.moveTo(cx - w / 2, by); ctx.lineTo(cx, by - hh); ctx.lineTo(cx + w / 2, by); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#8b8377'; ctx.beginPath(); ctx.moveTo(cx - w / 2, by); ctx.lineTo(cx, by - hh); ctx.lineTo(cx - w * .05, by); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#f1efe9'; ctx.beginPath(); ctx.moveTo(cx - w * .14, by - hh * .72); ctx.lineTo(cx, by - hh); ctx.lineTo(cx + w * .14, by - hh * .72); ctx.lineTo(cx + w * .03, by - hh * .64); ctx.closePath(); ctx.fill();
      };
      m(px + s * .3, py + s * .86, s * .5, s * .5); m(px + s * .63, py + s * .86, s * .62, s * .68); break;
    }
  }
}

function render() {
  rq = false; if (!G || !VW) return;
  if (!TCOL) buildTCol();
  const now = performance.now(), ctx = CX, z = cam.z, s = TS * z;
  let more = false;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#0c0a08'; ctx.fillRect(0, 0, VW, VH);
  const x0 = Math.max(0, Math.floor(cam.x / TS)), y0 = Math.max(0, Math.floor(cam.y / TS));
  const x1 = Math.min(G.w - 1, Math.floor((cam.x + VW / z) / TS)), y1 = Math.min(G.h - 1, Math.floor((cam.y + VH / z) / TS));
  const SX = x => (x * TS - cam.x) * z, SY = y => (y * TS - cam.y) * z;
  const each = fn => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) fn(x, y, T(x, y), SX(x), SY(y)); };

  // terrain
  each((x, y, t, px, py) => {
    if (!t.seen) { ctx.fillStyle = '#110f0c'; ctx.fillRect(px, py, s + 1, s + 1); return; }
    ctx.fillStyle = TCOL[idx(x, y)]; ctx.fillRect(px, py, s + .6, s + .6);
    terrDetail(ctx, t, x, y, px, py, s);
  });
  if (z > .7) {
    ctx.strokeStyle = 'rgba(0,0,0,.07)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = x0; x <= x1 + 1; x++) { ctx.moveTo(SX(x), SY(y0)); ctx.lineTo(SX(x), SY(y1 + 1)); }
    for (let y = y0; y <= y1 + 1; y++) { ctx.moveTo(SX(x0), SY(y)); ctx.lineTo(SX(x1 + 1), SY(y)); }
    ctx.stroke();
  }
  // territory tint, ruins, buildings, deposits
  each((x, y, t, px, py) => {
    if (!t.seen) return;
    if (t.own >= 0) { ctx.fillStyle = rgba(fac(t.own).c, .13); ctx.fillRect(px, py, s, s); }
    if (t.ruin) dspr(ctx, '🏚️', s * .52, px + s / 2, py + s / 2);
    const b = t.b;
    if (b && b.k !== 'hall') {
      ctx.fillStyle = 'rgba(25,20,14,.3)'; rr(ctx, px + s * .08, py + s * .08, s * .84, s * .84, s * .14); ctx.fill();
      dspr(ctx, BLD[b.k].i, s * .52, px + s / 2, py + s * .47, b.pil ? .4 : 1);
      if (b.k === 'monument') { ctx.font = `700 ${Math.max(8, s * .22)}px -apple-system,sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#ffe39a'; ctx.fillText(`${b.stg}/5`, px + s / 2, py + s * .9); }
      else for (let k = 0; k < b.lvl; k++) { ctx.fillStyle = '#ffd966'; ctx.beginPath(); ctx.arc(px + s * (.2 + k * .13), py + s * .86, Math.max(1.5, s * .045), 0, 7); ctx.fill(); }
      if (b.pil) dspr(ctx, '🔥', s * .32, px + s * .76, py + s * .24);
    }
    if (t.dep) dspr(ctx, t.dep === 'iron' ? '🔩' : '✨', s * .24, px + s * .83, py + s * .83);
  });
  for (const c of G.camps) {
    if (!inb(c.x, c.y) || !T(c.x, c.y).seen) continue;
    const px = SX(c.x), py = SY(c.y);
    ctx.fillStyle = 'rgba(120,20,10,.45)'; ctx.beginPath(); ctx.arc(px + s / 2, py + s / 2, s * .4, 0, 7); ctx.fill();
    dspr(ctx, '⛺', s * .6, px + s / 2, py + s / 2);
    if (c.hp < 60) hpBar(ctx, px + s / 2, py + s * .9, s * .6, c.hp / 60, '#ff6b55');
  }
  for (const tw of G.towns) {
    if (!T(tw.x, tw.y).seen) continue;
    const px = SX(tw.x), py = SY(tw.y), col = fac(tw.o).c;
    ctx.fillStyle = rgba(col, .38); rr(ctx, px + s * .05, py + s * .05, s * .9, s * .9, s * .18); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, s * .06); ctx.stroke();
    dspr(ctx, TOWN_I[tw.lvl], s * .66, px + s / 2, py + s / 2);
  }
  // fog of war: explored but not currently watched
  ctx.fillStyle = 'rgba(8,6,4,.5)';
  each((x, y, t, px, py) => { if (t.seen && !VIS[idx(x, y)]) ctx.fillRect(px, py, s + .6, s + .6); });
  // borders
  ctx.lineWidth = Math.max(1.5, 2.3 * z); ctx.lineCap = 'round';
  each((x, y, t, px, py) => {
    if (!t.seen || t.own < 0) return;
    const o = t.own; ctx.strokeStyle = fac(o).c; ctx.beginPath();
    if (y === 0 || T(x, y - 1).own !== o) { ctx.moveTo(px, py); ctx.lineTo(px + s, py); }
    if (y === G.h - 1 || T(x, y + 1).own !== o) { ctx.moveTo(px, py + s); ctx.lineTo(px + s, py + s); }
    if (x === 0 || T(x - 1, y).own !== o) { ctx.moveTo(px, py); ctx.lineTo(px, py + s); }
    if (x === G.w - 1 || T(x + 1, y).own !== o) { ctx.moveTo(px + s, py); ctx.lineTo(px + s, py + s); }
    ctx.stroke();
  });
  // highlights
  if (UI.valid) {
    for (const k of UI.valid) { const x = k % G.w, y = (k / G.w) | 0; if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      ctx.fillStyle = 'rgba(110,230,120,.28)'; ctx.fillRect(SX(x) + 1, SY(y) + 1, s - 2, s - 2);
      ctx.strokeStyle = 'rgba(160,255,170,.8)'; ctx.lineWidth = 1.5; ctx.strokeRect(SX(x) + 2, SY(y) + 2, s - 4, s - 4); }
  }
  if (UI.reach) {
    for (const [k] of UI.reach) { const x = k % G.w, y = (k / G.w) | 0; if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(SX(x) + 1, SY(y) + 1, s - 2, s - 2);
      ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(SX(x) + s / 2, SY(y) + s / 2, Math.max(3, s * .09), 0, 7); ctx.fill(); }
  }
  for (const g of UI.targets) {
    ctx.strokeStyle = '#ff5a45'; ctx.lineWidth = Math.max(2, s * .07);
    rr(ctx, SX(g.x) + 3, SY(g.y) + 3, s - 6, s - 6, s * .15); ctx.stroke();
  }
  // units
  for (const u of G.units) {
    if (u.o !== 0 && !VIS[idx(u.x, u.y)]) continue;
    let ux = u.x, uy = u.y; const a = ANIM.get(u.id);
    if (a) { const k = Math.min(1, (now - a.t0) / 200), e = 1 - (1 - k) * (1 - k); ux = a.fx + (u.x - a.fx) * e; uy = a.fy + (u.y - a.fy) * e; if (k >= 1) ANIM.delete(u.id); else more = true; }
    const cx = SX(ux) + s / 2, cy = SY(uy) + s / 2, r = s * .36, col = fac(u.o).c;
    if (ux < x0 - 1 || ux > x1 + 1 || uy < y0 - 1 || uy > y1 + 1) continue;
    if (u.k === 'hero') { ctx.fillStyle = '#e9b44c'; ctx.beginPath(); ctx.arc(cx, cy, r + Math.max(2, s * .06), 0, 7); ctx.fill(); }
    ctx.fillStyle = 'rgba(18,14,10,.9)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
    ctx.lineWidth = Math.max(2, s * .075); ctx.strokeStyle = col; ctx.stroke();
    dspr(ctx, UNI[u.k].i, s * .42, cx, cy);
    if (u.hp < 100) hpBar(ctx, cx, cy + r + 1, s * .6, u.hp / 100);
    const rk = u.k === 'hero' ? Math.min(4, Math.floor((u.h.lvl - 1) / 2)) : u.rk;
    for (let k = 0; k < rk; k++) { ctx.fillStyle = '#ffd966'; ctx.beginPath(); const qx = cx + r * .65 - k * s * .1, qy = cy - r - 1; ctx.moveTo(qx - s * .05, qy); ctx.lineTo(qx, qy - s * .07); ctx.lineTo(qx + s * .05, qy); ctx.fill(); }
    if (u.o === 0 && u.mv > 0 && !u.fort) { ctx.fillStyle = '#7dff72'; ctx.beginPath(); ctx.arc(cx - r * .8, cy - r * .8, Math.max(2.5, s * .07), 0, 7); ctx.fill(); ctx.strokeStyle = '#123'; ctx.lineWidth = 1; ctx.stroke(); }
    if (u.fort) dspr(ctx, '🛡️', s * .24, cx - r * .8, cy + r * .75);
  }
  // selection
  if (UI.sel && UI.sel.x != null) {
    const su = UI.sel.u != null ? G.units.find(u => u.id === UI.sel.u) : null;
    const sx = su ? su.x : UI.sel.x, sy = su ? su.y : UI.sel.y;
    ctx.strokeStyle = '#ffd966'; ctx.lineWidth = Math.max(2, s * .07);
    rr(ctx, SX(sx) + 1.5, SY(sy) + 1.5, s - 3, s - 3, s * .16); ctx.stroke();
  }
  // town labels
  const fs = Math.round(clamp(10.5 * z, 9, 13));
  ctx.font = `700 ${fs}px -apple-system,system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const tw of G.towns) {
    if (!T(tw.x, tw.y).seen) continue;
    const px = SX(tw.x), py = SY(tw.y); if (px < -s * 2 || px > VW + s || py < -s || py > VH + s) continue;
    const label = tw.name + (tw.lvl > 1 ? ' ' + tw.lvl : ''), w = ctx.measureText(label).width + 10, lx = px + s / 2, ly = py - fs * .35;
    ctx.fillStyle = 'rgba(15,12,9,.88)'; rr(ctx, lx - w / 2, ly - fs * .7, w, fs * 1.4, fs * .5); ctx.fill();
    ctx.strokeStyle = fac(tw.o).c; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillText(label, lx, ly + .5);
    if (tw.hp < townMaxHp(tw)) hpBar(ctx, px + s / 2, py + s - 4, s * .7, tw.hp / townMaxHp(tw));
  }
  // effects
  FX = FX.filter(f => now - f.t0 < 1100);
  for (const f of FX) {
    const k = (now - f.t0) / 1100;
    if (f.k === 'shot') { if (k > .35) continue; ctx.strokeStyle = `rgba(255,220,140,${1 - k / .35})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(SX(f.x) + s / 2, SY(f.y) + s / 2); ctx.lineTo(SX(f.x2) + s / 2, SY(f.y2) + s / 2); ctx.stroke(); }
    else { ctx.globalAlpha = 1 - k * k; ctx.font = `800 ${Math.round(clamp(14 * z, 12, 20))}px -apple-system,sans-serif`; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)'; const tx = SX(f.x) + s / 2, ty = SY(f.y) + s * .2 - k * s * .6; ctx.strokeText(f.txt, tx, ty); ctx.fillStyle = f.col; ctx.fillText(f.txt, tx, ty); ctx.globalAlpha = 1; }
  }
  if (FX.length || more) requestRender();
}

// ---------- input: drag to pan, pinch to zoom, tap to select ----------
function bindInput() {
  const ptrs = new Map(); let drag = null, pinch = null;
  const rect = () => CV.getBoundingClientRect();
  CV.addEventListener('pointerdown', e => {
    CV.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if (ptrs.size === 1) drag = {sx:e.clientX, sy:e.clientY, cx:cam.x, cy:cam.y, moved:false};
    else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], r = rect(), mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
      pinch = {d:Math.hypot(a.x - b.x, a.y - b.y) || 1, z:cam.z, wx:mx / cam.z + cam.x, wy:my / cam.z + cam.y}; drag = null;
    }
  });
  CV.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId) || !G) return;
    ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if (pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()], r = rect(), mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
      cam.z = clamp(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, .4, 2.6);
      cam.x = pinch.wx - mx / cam.z; cam.y = pinch.wy - my / cam.z; clampCam(); requestRender();
    } else if (drag) {
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 8) drag.moved = true;
      if (drag.moved) { cam.x = drag.cx - dx / cam.z; cam.y = drag.cy - dy / cam.z; clampCam(); requestRender(); }
    }
  });
  const up = e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (drag && !drag.moved && ptrs.size === 0 && e.type === 'pointerup' && G) {
      const r = rect(), wx = (e.clientX - r.left) / cam.z + cam.x, wy = (e.clientY - r.top) / cam.z + cam.y;
      onTap(Math.floor(wx / TS), Math.floor(wy / TS));
    }
    if (ptrs.size < 2) pinch = null;
    if (ptrs.size === 1) { const p = [...ptrs.values()][0]; drag = {sx:p.x, sy:p.y, cx:cam.x, cy:cam.y, moved:true}; }
    if (ptrs.size === 0) drag = null;
  };
  CV.addEventListener('pointerup', up); CV.addEventListener('pointercancel', up);
  CV.addEventListener('wheel', e => {
    e.preventDefault(); if (!G) return;
    const r = rect(), mx = e.clientX - r.left, my = e.clientY - r.top, wx = mx / cam.z + cam.x, wy = my / cam.z + cam.y;
    cam.z = clamp(cam.z * (e.deltaY < 0 ? 1.1 : .9), .4, 2.6); cam.x = wx - mx / cam.z; cam.y = wy - my / cam.z; clampCam(); requestRender();
  }, {passive:false});
  document.addEventListener('gesturestart', e => e.preventDefault());
}
