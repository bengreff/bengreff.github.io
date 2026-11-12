// Background: the Hopf fibration of the 3-sphere (every fibre a circle, any two linked), turning
// through four dimensions and stereographically projected into 3D. Rotations in planes that include
// the fourth axis carry fibres through the projection point, so circles swell past the screen edge,
// pass through infinity as straight lines, and come back from the other side.
(() => {
  const canvas = document.createElement('canvas');
  canvas.id = 'bg';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d');
  const TAU = Math.PI * 2;

  const LATS = [0.9, 0.62, 0.3, -0.05, -0.4];   // circles of latitude on the base 2-sphere
  const LONS = 48, STEPS = 220;
  const fibres = [];
  LATS.forEach((z, li) => {
    const r = Math.sqrt(1 - z * z);
    for (let k = 0; k < LONS; k++) {
      const phi = ((k + (li % 2) * 0.5) / LONS) * TAU;
      const x = r * Math.cos(phi), y = r * Math.sin(phi);
      // Point of S^3 over (x, y, z), as complex pair: z0 = sqrt((1+z)/2), z1 = (x - iy) / (2 z0).
      const a = Math.sqrt((1 + z) / 2), br = x / (2 * a), bi = -y / (2 * a);
      const pts = new Float32Array(STEPS * 4);
      for (let s = 0; s < STEPS; s++) {
        const t = (s / STEPS) * TAU, c = Math.cos(t), sn = Math.sin(t);
        pts[s * 4] = a * c; pts[s * 4 + 1] = a * sn;                         // z0 e^{it}
        pts[s * 4 + 2] = br * c - bi * sn; pts[s * 4 + 3] = br * sn + bi * c; // z1 e^{it}
      }
      fibres.push({ pts, hue: (phi / TAU) * 360, li,
                    sx: new Float32Array(STEPS), sy: new Float32Array(STEPS), ok: new Uint8Array(STEPS), depth: 0 });
    }
  });

  let W = 0, H = 0, dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }

  const dark = window.matchMedia('(prefers-color-scheme: dark)');
  const still = window.matchMedia('(prefers-reduced-motion: reduce)');
  const t0 = parseFloat(new URLSearchParams(location.search).get('t') || '0') || 0;  // ?t= jumps ahead (s)

  let shownT = t0;
  function draw(T) {
    shownT = T;
    // A and E: full turns in the 4D planes (x0, x3) and (x2, x3). B, C: slow 3D turns. P: fixed tilt.
    const A = 0.021 * T + 0.35, E = 0.0131 * T + 0.9, B = 0.009 * T, C = 0.015 * T, P = 0.5;
    const cA = Math.cos(A), sA = Math.sin(A), cE = Math.cos(E), sE = Math.sin(E);
    const cB = Math.cos(B), sB = Math.sin(B), cC = Math.cos(C), sC = Math.sin(C);
    const cP = Math.cos(P), sP = Math.sin(P);
    const S = Math.min(W, H) * 0.24, cx = W * 0.5, cy = H * 0.5;
    const LIM = 40 * Math.hypot(W, H);

    for (const f of fibres) {
      const p = f.pts; let dsum = 0, n = 0;
      for (let s = 0; s < STEPS; s++) {
        const x0 = p[s * 4], x1 = p[s * 4 + 1], x2 = p[s * 4 + 2], x3 = p[s * 4 + 3];
        const y0 = cA * x0 - sA * x3, w = sA * x0 + cA * x3;
        const u2 = cE * x2 - sE * w, y3 = sE * x2 + cE * w;
        const y1 = cB * x1 - sB * u2, y2 = sB * x1 + cB * u2;
        const den = 1 - y3;
        if (den < 1e-5) { f.ok[s] = 0; continue; }
        const px = y0 / den, py = y1 / den, pz = y2 / den;      // stereographic projection
        const qx = cC * px + sC * pz, qz = -sC * px + cC * pz;
        const ry = cP * py - sP * qz, rz = sP * py + cP * qz;
        const X = cx + S * qx, Y = cy - S * ry;                   // orthographic view
        if (Math.abs(X - cx) > LIM || Math.abs(Y - cy) > LIM) { f.ok[s] = 0; continue; }
        f.sx[s] = X; f.sy[s] = Y; f.ok[s] = 1;
        dsum += Math.max(-3, Math.min(3, rz)); n++;
      }
      f.depth = n ? dsum / n : 0;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1;
    ctx.lineJoin = 'round';
    const isDark = dark.matches;
    const jump = 3 * Math.hypot(W, H);   // a longer step means the curve went through infinity
    for (const f of fibres) {
      const near = Math.max(0, Math.min(1, (f.depth + 1.5) / 3));
      const alpha = isDark ? 0.20 + 0.42 * near : 0.18 + 0.40 * near;
      const light = isDark ? 56 + 4 * f.li : 38 + 4 * f.li;
      ctx.strokeStyle = `hsla(${f.hue.toFixed(1)}, ${isDark ? 60 : 52}%, ${light}%, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      let pen = false, lx = 0, ly = 0;
      for (let s = 0; s <= STEPS; s++) {
        const i = s % STEPS;
        if (!f.ok[i]) { pen = false; continue; }
        const X = f.sx[i], Y = f.sy[i];
        if (pen && Math.abs(X - lx) + Math.abs(Y - ly) < jump) ctx.lineTo(X, Y);
        else ctx.moveTo(X, Y);
        pen = true; lx = X; ly = Y;
      }
      ctx.stroke();
    }
  }

  let running = false;
  const start = performance.now();
  const now = () => t0 + (performance.now() - start) / 1000;
  function loop() {
    if (!running) return;
    draw(now());
    requestAnimationFrame(loop);
  }
  function setRunning() {
    const on = !still.matches;
    if (on === running) return;
    running = on;
    if (on) requestAnimationFrame(loop);
  }

  // "Open in 3D" links carry the moment you left, so the interactive view starts where the background was.
  document.querySelectorAll('a.enter').forEach(a => a.addEventListener('click', () => {
    a.href = '/hopf/?t=' + shownT.toFixed(2);
  }));

  resize();
  draw(t0);
  window.addEventListener('resize', () => { resize(); draw(now()); });
  dark.addEventListener('change', () => draw(now()));
  still.addEventListener('change', setRunning);
  setRunning();
})();
