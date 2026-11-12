// The home page's background as a 3D scene you can turn, pan and zoom, with its parameters on sliders.
// Same construction as bg.js: fibres of the Hopf fibration of the 3-sphere, turned through four
// dimensions, stereographically projected to 3D; here seen through a perspective camera.
(() => {
  const canvas = document.getElementById('viz');
  const ctx = canvas.getContext('2d');
  const TAU = Math.PI * 2;
  const STEPS = 220;
  const BASE_LATS = [0.9, 0.62, 0.3, -0.05, -0.4];   // bg.js's circles; other counts interpolate these
  const $ = id => document.getElementById(id);

  // ---- state -------------------------------------------------------------------------------
  const q = new URLSearchParams(location.search);
  const T0 = parseFloat(q.get('t') || '0') || 0;      // time the background was at when you left it
  const still = window.matchMedia('(prefers-reduced-motion: reduce)');
  const dark = window.matchMedia('(prefers-color-scheme: dark)');

  // Angles of the three 4D turns (planes xw, yw, zw), integrated so slider changes never jump.
  const RATE = { a: 0.021, g: 0.017, e: 0.0131 };     // rad/s at 1x (a and e as in bg.js)
  let A = RATE.a * T0 + 0.35, G = 0, E = RATE.e * T0 + 0.9;
  let playing = !still.matches;

  let fibres = [];
  function latitudes(n) {
    if (n === 1) return [0.3];
    const out = [];
    for (let i = 0; i < n; i++) {
      const u = (i / (n - 1)) * (BASE_LATS.length - 1), k = Math.min(Math.floor(u), BASE_LATS.length - 2);
      out.push(BASE_LATS[k] + (BASE_LATS[k + 1] - BASE_LATS[k]) * (u - k));
    }
    return out;
  }
  function buildFibres(nLat, nLon) {
    fibres = [];
    latitudes(nLat).forEach((z, li) => {
      const r = Math.sqrt(Math.max(0, 1 - z * z));
      for (let k = 0; k < nLon; k++) {
        const phi = ((k + (li % 2) * 0.5) / nLon) * TAU;
        const x = r * Math.cos(phi), y = r * Math.sin(phi);
        const a = Math.sqrt((1 + z) / 2), br = x / (2 * a), bi = -y / (2 * a);
        const pts = new Float32Array(STEPS * 4);
        for (let s = 0; s < STEPS; s++) {
          const t = (s / STEPS) * TAU, c = Math.cos(t), sn = Math.sin(t);
          pts[s * 4] = a * c; pts[s * 4 + 1] = a * sn;
          pts[s * 4 + 2] = br * c - bi * sn; pts[s * 4 + 3] = br * sn + bi * c;
        }
        fibres.push({ pts, hue: (phi / TAU) * 360, li, depth: 0,
                      sx: new Float32Array(STEPS), sy: new Float32Array(STEPS), ok: new Uint8Array(STEPS) });
      }
    });
    dirty = true;
  }

  // ---- camera ------------------------------------------------------------------------------
  // cam = M (p - target); screen = centre + F * cam.xy / (D - cam.z). M starts as bg.js's view at T0.
  const D0 = 6;
  let M, target, D, F = 1, W = 0, H = 0, dpr = 1, dirty = true;
  function bgView(T) {
    const B = 0.009 * T, C = 0.015 * T, P = 0.5;
    const cB = Math.cos(B), sB = Math.sin(B), cC = Math.cos(C), sC = Math.sin(C), cP = Math.cos(P), sP = Math.sin(P);
    const Rb = [1, 0, 0, 0, cB, -sB, 0, sB, cB];
    const Rc = [cC, 0, sC, 0, 1, 0, -sC, 0, cC];
    const Rp = [1, 0, 0, 0, cP, -sP, 0, sP, cP];
    return mul(Rp, mul(Rc, Rb));
  }
  function mul(a, b) {
    const o = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
      o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    return o;
  }
  function orthonormalize(m) {
    const r0 = [m[0], m[1], m[2]], r1 = [m[3], m[4], m[5]];
    const n0 = Math.hypot(...r0); r0.forEach((v, i) => r0[i] = v / n0);
    const d = r0[0] * r1[0] + r0[1] * r1[1] + r0[2] * r1[2]; r1.forEach((v, i) => r1[i] = v - d * r0[i]);
    const n1 = Math.hypot(...r1); r1.forEach((v, i) => r1[i] = v / n1);
    const r2 = [r0[1] * r1[2] - r0[2] * r1[1], r0[2] * r1[0] - r0[0] * r1[2], r0[0] * r1[1] - r0[1] * r1[0]];
    return [...r0, ...r1, ...r2];
  }
  function resetView() { M = bgView(T0); target = [0, 0, 0]; D = D0; dirty = true; }
  function orbit(dx, dy) {
    const a = dx * 0.006, b = dy * 0.006, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    const Ry = [ca, 0, sa, 0, 1, 0, -sa, 0, ca], Rx = [1, 0, 0, 0, cb, -sb, 0, sb, cb];
    M = orthonormalize(mul(Ry, mul(Rx, M))); dirty = true;
  }
  function pan(dx, dy) {
    const k = D / F, vx = -dx * k, vy = dy * k;     // camera-space shift, back to world with M^T
    target[0] += M[0] * vx + M[3] * vy; target[1] += M[1] * vx + M[4] * vy; target[2] += M[2] * vx + M[5] * vy;
    dirty = true;
  }
  function zoom(factor) { D = Math.min(80, Math.max(0.25, D * factor)); dirty = true; }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    F = 0.24 * Math.min(W, H) * D0;   // at the start, the same scale as the background
    dirty = true;
  }

  // ---- drawing -----------------------------------------------------------------------------
  let lineW = 1.2;
  function draw() {
    const cA = Math.cos(A), sA = Math.sin(A), cG = Math.cos(G), sG = Math.sin(G), cE = Math.cos(E), sE = Math.sin(E);
    const m = M, tx = target[0], ty = target[1], tz = target[2];
    const cx = W / 2, cy = H / 2, NEAR = 0.02;
    for (const f of fibres) {
      const p = f.pts; let dsum = 0, n = 0;
      for (let s = 0; s < STEPS; s++) {
        const x0 = p[s * 4], x1 = p[s * 4 + 1], x2 = p[s * 4 + 2], x3 = p[s * 4 + 3];
        const y0 = cA * x0 - sA * x3, w1 = sA * x0 + cA * x3;      // xw turn
        const y1 = cG * x1 - sG * w1, w2 = sG * x1 + cG * w1;      // yw turn
        const y2 = cE * x2 - sE * w2, y3 = sE * x2 + cE * w2;      // zw turn
        const den = 1 - y3;
        if (den < 1e-6) { f.ok[s] = 0; continue; }
        const px = y0 / den - tx, py = y1 / den - ty, pz = y2 / den - tz;   // stereographic projection
        const X = m[0] * px + m[1] * py + m[2] * pz, Y = m[3] * px + m[4] * py + m[5] * pz;
        const Z = m[6] * px + m[7] * py + m[8] * pz, dist = D - Z;
        if (dist < NEAR * D) { f.ok[s] = 0; continue; }
        f.sx[s] = cx + F * X / dist; f.sy[s] = cy - F * Y / dist; f.ok[s] = 1;
        dsum += Math.max(-3, Math.min(3, Z)); n++;
      }
      f.depth = n ? dsum / n : -9;
    }
    fibres.sort((a, b) => a.depth - b.depth);   // far first

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const isDark = dark.matches, jump = 3 * Math.hypot(W, H), lim = 50 * Math.hypot(W, H);
    for (const f of fibres) {
      const near = Math.max(0, Math.min(1, (f.depth + 1.5) / 3));
      const alpha = isDark ? 0.28 + 0.6 * near : 0.25 + 0.6 * near;
      const light = isDark ? 56 + 4 * Math.min(f.li, 8) : 36 + 4 * Math.min(f.li, 8);
      ctx.strokeStyle = `hsla(${f.hue.toFixed(1)}, ${isDark ? 62 : 55}%, ${light}%, ${alpha.toFixed(3)})`;
      ctx.lineWidth = lineW * (0.75 + 0.5 * near);
      ctx.beginPath();
      let pen = false, lx = 0, ly = 0;
      for (let s = 0; s <= STEPS; s++) {
        const i = s % STEPS;
        if (!f.ok[i]) { pen = false; continue; }
        const X = f.sx[i], Y = f.sy[i];
        if (Math.abs(X - cx) > lim || Math.abs(Y - cy) > lim) { pen = false; continue; }
        if (pen && Math.abs(X - lx) + Math.abs(Y - ly) < jump) ctx.lineTo(X, Y);
        else ctx.moveTo(X, Y);
        pen = true; lx = X; ly = Y;
      }
      ctx.stroke();
    }
    dirty = false;
  }

  // ---- controls ----------------------------------------------------------------------------
  const ctl = { speed: 1, ra: 1, rg: 0, re: 1 };
  function bindRange(id, fmt, onInput) {
    const el = $(id), out = el.parentElement.querySelector('output');
    const show = () => { out.textContent = fmt(+el.value); };
    el.addEventListener('input', () => { onInput(+el.value); show(); dirty = true; });
    show(); onInput(+el.value);
  }
  const times = v => (Math.abs(v) < 0.005 ? '0' : v.toFixed(2).replace(/\.?0+$/, '')) + '×';
  bindRange('speed', times, v => ctl.speed = v);
  bindRange('ra', times, v => ctl.ra = v);
  bindRange('rg', times, v => ctl.rg = v);
  bindRange('re', times, v => ctl.re = v);
  let nLat = 5, nLon = 48;
  bindRange('lats', v => String(v), v => { if (v !== nLat || !fibres.length) { nLat = v; buildFibres(nLat, nLon); } });
  bindRange('lons', v => String(v), v => { if (v !== nLon) { nLon = v; buildFibres(nLat, nLon); } });
  bindRange('lw', v => v.toFixed(1), v => lineW = v);

  const playBtn = $('play');
  function setPlaying(on) { playing = on; playBtn.textContent = on ? 'pause' : 'play'; playBtn.setAttribute('aria-pressed', String(!on)); }
  playBtn.addEventListener('click', () => setPlaying(!playing));
  $('reset').addEventListener('click', resetView);
  setPlaying(playing);

  // Pointer: drag turns; shift-drag, right-drag or two fingers pan; wheel or pinch zooms.
  const pointers = new Map();
  let hint = $('hint');
  if (window.matchMedia('(pointer: coarse)').matches) hint.textContent = 'drag to turn · two fingers to pan and zoom · double-tap to reset';
  function firstTouch() { if (hint) { hint.classList.add('gone'); hint = null; } }
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, pan: e.button === 2 || e.shiftKey || e.button === 1 });
    canvas.classList.add('dragging'); firstTouch();
  });
  canvas.addEventListener('pointermove', e => {
    const pt = pointers.get(e.pointerId);
    if (!pt) return;
    if (pointers.size === 1) {
      const dx = e.clientX - pt.x, dy = e.clientY - pt.y;
      if (pt.pan || e.shiftKey) pan(dx, dy); else orbit(dx, dy);
      pt.x = e.clientX; pt.y = e.clientY;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const before = Math.hypot(a.x - b.x, a.y - b.y), mx0 = (a.x + b.x) / 2, my0 = (a.y + b.y) / 2;
      pt.x = e.clientX; pt.y = e.clientY;
      const after = Math.hypot(a.x - b.x, a.y - b.y), mx1 = (a.x + b.x) / 2, my1 = (a.y + b.y) / 2;
      if (before > 0 && after > 0) zoom(before / after);
      pan(mx1 - mx0, my1 - my0);
    }
  });
  let lastTap = 0;   // double-tap to reset on touch screens (dblclick doesn't fire with touch-action: none)
  const up = e => {
    const pt = pointers.get(e.pointerId), alone = pointers.size === 1;
    pointers.delete(e.pointerId);
    if (!pointers.size) canvas.classList.remove('dragging');
    const tap = pt && alone && e.timeStamp - pt.t0 < 250 && Math.hypot(e.clientX - pt.x0, e.clientY - pt.y0) < 10;
    if (e.pointerType === 'touch' && e.type === 'pointerup' && tap) {
      if (e.timeStamp - lastTap < 320) { resetView(); lastTap = 0; } else lastTap = e.timeStamp;
    }
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => {
    e.preventDefault(); firstTouch();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    zoom(Math.exp(dy * 0.0012));
  }, { passive: false });
  canvas.addEventListener('dblclick', resetView);
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' && e.key !== ' ') return;
    if (e.key === ' ') { e.preventDefault(); setPlaying(!playing); }
    else if (e.key === 'r' || e.key === 'R') resetView();
  });
  window.addEventListener('resize', resize);
  dark.addEventListener('change', () => { dirty = true; });

  // ---- loop --------------------------------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (playing && ctl.speed > 0) {
      const k = ctl.speed * dt;
      A += RATE.a * ctl.ra * k; G += RATE.g * ctl.rg * k; E += RATE.e * ctl.re * k;
      dirty = true;
    }
    if (dirty) draw();
    requestAnimationFrame(frame);
  }
  resize(); resetView();
  if (!fibres.length) buildFibres(nLat, nLon);
  draw();
  requestAnimationFrame(frame);
})();
