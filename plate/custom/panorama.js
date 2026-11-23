'use strict';
// InstaSlice ultra-wide solver.
//
// A panorama or fisheye frame is far too wide for one flat (tangent-plane) solution, but a crop of it is not. The frame is therefore
// treated as five crops (centre and the four corners of the star-filled area). Each crop is solved by the same engine as any other photo.
// Where crops are solved, their matched stars give pixel ↔ sky pairs across the whole frame. Those pairs are fitted with a projection
// (see projection.js): its family, scale, centre and orientation. That model then places every catalogue object on the frame, and its
// scale and orientation are reported as the sampling and the viewing angle.
// A whole-frame fit must reproduce the crops and independently detected stars. If the stitched frame needs
// several separate projections, only the verified portions of the solved crops are made available.
(function (root) {
  const P = () => root.InstaSliceProjection;
  const DEG = Math.PI / 180;
  const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  const cross = (a, b) => [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]];
  const unit = v => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0]/n, v[1]/n, v[2]/n]; };
  const median = list => { const s = list.slice().sort((a, b) => a - b); return s.length ? s[s.length >> 1] : Infinity; };

  const FAMILIES = [
    ['cyl', 'car'], ['cyl', 'cyp'], ['cyl', 'mer'], ['cyl', 'cea'], ['cyl', 'brn'],
    ['azi', 'tan'], ['azi', 'stg'], ['azi', 'eqd'], ['azi', 'eqs'], ['azi', 'sin']
  ];

  function fibonacci(count) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const z = 1 - 2*(i + .5)/count, r = Math.sqrt(1 - z*z), a = Math.PI*(1 + Math.sqrt(5))*(i + .5);
      out.push([r*Math.cos(a), r*Math.sin(a), z]);
    }
    return out;
  }

  // An orthonormal frame whose z axis is the given direction (the optical axis of an azimuthal projection).
  function frameFromAxis(axis) {
    const helper = Math.abs(axis[0]) < .9 ? [1, 0, 0] : [0, 1, 0];
    const x = unit(cross(helper, axis));
    return { x, y: cross(axis, x), z: axis };
  }

  // Least squares for y ≈ a·u + b over paired samples.
  // Weighted straight line y = a·u + b.
  function line(us, ys, ws) {
    let sw = 0, su = 0, sy = 0, suu = 0, suy = 0;
    const n = us.length;
    for (let i = 0; i < n; i++) { const w = ws ? ws[i] : 1; sw += w; su += w*us[i]; sy += w*ys[i]; suu += w*us[i]*us[i]; suy += w*us[i]*ys[i]; }
    const d = sw*suu - su*su;
    if (Math.abs(d) < 1e-12 || sw <= 0) return null;
    const a = (sw*suy - su*sy) / d;
    return { a, b: (sy - a*su) / sw };
  }

  // A seed is fitted with Tukey weights, again and again: a handful of wrong pairs (stars matched on foreground glow) would otherwise decide
  // the fit, above all in an azimuthal projection where a star far from the axis has a huge lever arm.
  function trimmedSeed(n, valid, fitOn, errorsOf, rounds = 10) {
    let weights = valid.map(v => v ? 1 : 0);
    if (weights.reduce((a, b) => a + b, 0) < Math.max(8, .6*n)) return null;
    let fit = fitOn(weights);
    for (let round = 0; fit && round < rounds; round++) {
      const errors = errorsOf(fit);
      const finite = errors.filter(Number.isFinite);
      const reach = 4.7*Math.max(3, 1.4826*median(finite));
      weights = errors.map(e => Number.isFinite(e) && e < reach ? (1 - (e/reach)**2)**2 : 0);
      if (weights.reduce((a, b) => a + (b > 0 ? 1 : 0), 0) < 8) return null;
      fit = fitOn(weights);
    }
    if (!fit) return null;
    const errors = errorsOf(fit);
    return { fit, score: median(errors.map(e => Number.isFinite(e) ? e : 1e6)) };
  }

  // Closed-form starting points: for each candidate axis, the scale and offsets that suit it best. The search only has to be roughly right.
  function seedsFor(family, shapeName, sky, pix, axes, hints = {}) {
    const shape = P().shapeOf(family, shapeName), g = shape.g, found = [];
    const n = sky.length, rounds = hints.seedRounds ?? 4;
    for (const axis of axes) {
      if (family === 'cyl') {
        const h = [0, 0, 0];
        for (const s of sky) { const d = dot(s, axis); h[0] += s[0] - d*axis[0]; h[1] += s[1] - d*axis[1]; h[2] += s[2] - d*axis[2]; }
        if (Math.hypot(h[0], h[1], h[2]) < 1e-6) continue;
        const z = unit(h), y = axis, x = cross(y, z);
        const lam = new Array(n), gp = new Array(n), xs = new Array(n), ys = new Array(n), valid = new Array(n);
        for (let i = 0; i < n; i++) {
          lam[i] = Math.atan2(dot(sky[i], x), dot(sky[i], z));
          const phi = Math.asin(Math.max(-1, Math.min(1, dot(sky[i], y))));
          gp[i] = g(phi); xs[i] = pix[i][0]; ys[i] = pix[i][1];
          valid[i] = Number.isFinite(gp[i]);
        }
        const seed = trimmedSeed(n, valid, weights => {
          const fx = line(lam, xs, weights), fy = line(gp.map((v, i) => valid[i] ? v : 0), ys, weights);
          return fx && fy && fx.a > 0 && Math.abs(fy.a) > 1e-6 ? { fx, fy } : null;
        }, ({ fx, fy }) => lam.map((l, i) => valid[i] ? Math.hypot(xs[i] - fx.a*l - fx.b, ys[i] - fy.a*gp[i] - fy.b) : Infinity), rounds);
        if (!seed) continue;
        const { fx, fy } = seed.fit;
        found.push({ score: seed.score, R: [x, y, z], f: fx.a, ratio: -fy.a / fx.a, cx: fx.b, cy: fy.b });
      } else {
        const frame = frameFromAxis(axis);
        const th = new Array(n), psi = new Array(n), r = new Array(n), valid = new Array(n);
        for (let i = 0; i < n; i++) {
          th[i] = Math.acos(Math.max(-1, Math.min(1, dot(sky[i], frame.z))));
          psi[i] = Math.atan2(dot(sky[i], frame.y), dot(sky[i], frame.x));
          r[i] = th[i] > 2.3 ? NaN : g(th[i]);   // beyond 132° from the axis a pair is far likelier wrong than right, and it would carry a huge lever arm
          valid[i] = Number.isFinite(r[i]);
        }
        for (const mirror of [1, -1]) {
          // x = cx + f·r·cos(ψ+ρ), y = cy − m·f·r·sin(ψ+ρ): linear in (f·cosρ, f·sinρ, cx, cy)
          const rowsOf = i => {
            const c = Math.cos(psi[i]), s = Math.sin(psi[i]);
            return [[[r[i]*c, -r[i]*s, 1, 0], pix[i][0]], [[-mirror*r[i]*s, -mirror*r[i]*c, 0, 1], pix[i][1]]];
          };
          const seed = trimmedSeed(n, valid, weights => {
            const rows = [];
            for (let i = 0; i < n; i++) if (weights[i] > 0) for (const [row, value] of rowsOf(i)) rows.push([row, value, weights[i]]);
            const sol = solveNormal(rows, 4);
            return sol && Math.hypot(sol[0], sol[1]) > 0 ? sol : null;
          }, sol => {
            const errors = new Array(n);
            for (let i = 0; i < n; i++) {
              if (!valid[i]) { errors[i] = Infinity; continue; }
              const [[ra, va], [rb, vb]] = rowsOf(i);
              errors[i] = Math.hypot(ra[0]*sol[0] + ra[1]*sol[1] + ra[2]*sol[2] + ra[3]*sol[3] - va, rb[0]*sol[0] + rb[1]*sol[1] + rb[2]*sol[2] + rb[3]*sol[3] - vb);
            }
            return errors;
          }, rounds);
          if (!seed) continue;
          const sol = seed.fit, f = Math.hypot(sol[0], sol[1]), rho = Math.atan2(sol[1], sol[0]);
          const c = Math.cos(rho), s = Math.sin(rho);
          const x = [c*frame.x[0] - s*frame.y[0], c*frame.x[1] - s*frame.y[1], c*frame.x[2] - s*frame.y[2]];
          const y = [s*frame.x[0] + c*frame.y[0], s*frame.x[1] + c*frame.y[1], s*frame.x[2] + c*frame.y[2]];
          found.push({ score: seed.score, R: [x, y, frame.z], f, ratio: mirror, cx: sol[2], cy: sol[3] });
        }
      }
    }
    found.sort((a, b) => a.score - b.score);
    // Keep distinct candidates: neighbouring axes lead to the same minimum.
    const picks = [];
    for (const c of found) {
      if (picks.some(p => dot(p.R[family === 'cyl' ? 1 : 2], c.R[family === 'cyl' ? 1 : 2]) > Math.cos(6*DEG) && Math.abs(p.ratio - c.ratio) < .3)) continue;
      picks.push(c);
      if (picks.length >= 3) break;
    }
    return picks;
  }

  function solveNormal(rows, size) {
    const m = Array.from({ length: size }, () => new Float64Array(size + 1));
    for (const [row, value, weight = 1] of rows) {
      for (let j = 0; j < size; j++) { for (let k = 0; k < size; k++) m[j][k] += weight*row[j]*row[k]; m[j][size] += weight*row[j]*value; }
    }
    return gauss(m, size);
  }

  function gauss(m, size) {
    for (let i = 0; i < size; i++) {
      let pivot = i;
      for (let j = i + 1; j < size; j++) if (Math.abs(m[j][i]) > Math.abs(m[pivot][i])) pivot = j;
      if (Math.abs(m[pivot][i]) < 1e-14) return null;
      [m[i], m[pivot]] = [m[pivot], m[i]];
      const d = m[i][i];
      for (let k = i; k <= size; k++) m[i][k] /= d;
      for (let j = 0; j < size; j++) if (j !== i) { const f = m[j][i]; for (let k = i; k <= size; k++) m[j][k] -= m[i][k]*f; }
    }
    return m.map(row => row[size]);
  }

  // Parameters: three small rotations about the seed's axes, f, ratio, cx, cy and, for the fitted family, k.
  function modelFrom(seed, q, family, shape) {
    const dR = P().rotationFromVector([q[0], q[1], q[2]]);
    return { family, shape: typeof shape === 'number' ? q[7] : shape, R: P().multiply(dR, seed.R), f: q[3], ratio: q[4], cx: q[5], cy: q[6] };
  }

  function residuals(seed, q, family, shape, sky, pix, weights) {
    const model = modelFrom(seed, q, family, shape);
    const out = new Float64Array(2*sky.length);
    for (let i = 0; i < sky.length; i++) {
      const p = P().project(model, sky[i]);
      const w = weights ? weights[i] : 1;
      if (!p) { out[2*i] = 400*w; out[2*i + 1] = 400*w; continue; }
      out[2*i] = (p[0] - pix[i][0])*w; out[2*i + 1] = (p[1] - pix[i][1])*w;
    }
    return out;
  }

  const sumSquares = r => { let s = 0; for (let i = 0; i < r.length; i++) s += r[i]*r[i]; return s; };

  // Levenberg–Marquardt with biweight weights, so that a few wrong pairs do not pull the fit.
  function refine(seed, family, shape, sky, pix, hints = {}) {
    const generic = typeof shape === 'number';
    const initial = () => [0, 0, 0, seed.f, seed.ratio, seed.cx, seed.cy].concat(generic ? [shape] : []);
    const steps = [1e-6, 1e-6, 1e-6, 1e-4*Math.abs(seed.f), 1e-6, 1e-3, 1e-3, 1e-5];
    const lower = [-.6, -.6, -.6, seed.f*.5, Math.min(seed.ratio*.6, seed.ratio*1.6), -1e9, -1e9, .02];
    const upper = [.6, .6, .6, seed.f*2, Math.max(seed.ratio*.6, seed.ratio*1.6), 1e9, 1e9, 1];
    // With few crops the optical centre and the pixel aspect cannot be told apart from the scale, so they are held near their usual values.
    if (hints.center) {
      lower[5] = hints.center[0] - hints.centerTolerance; upper[5] = hints.center[0] + hints.centerTolerance;
      lower[6] = hints.center[1] - hints.centerTolerance; upper[6] = hints.center[1] + hints.centerTolerance;
      const sign = seed.ratio < 0 ? -1 : 1;
      lower[4] = Math.min(sign*.97, sign*1.03); upper[4] = Math.max(sign*.97, sign*1.03);
      seed = { ...seed, cx: Math.max(lower[5], Math.min(upper[5], seed.cx)), cy: Math.max(lower[6], Math.min(upper[6], seed.cy)), ratio: sign };
    }
    let q = initial();
    const n = q.length;
    let lambda = 1e-3;
    for (let iteration = 0; iteration < 70; iteration++) {
      const base = residuals(seed, q, family, shape, sky, pix);
      const dist = [];
      for (let i = 0; i < sky.length; i++) dist.push(Math.hypot(base[2*i], base[2*i + 1]));
      // Tukey's biweight: a pair that is far off (a star matched to the wrong catalogue entry) is ignored instead of merely discounted.
      const sigma = Math.max(1.2, 1.4826*median(dist)), reach = 4.7*sigma;
      const weights = dist.map(d => d >= reach ? 0 : 1 - (d/reach)**2);
      const r0 = residuals(seed, q, family, shape, sky, pix, weights);
      const cost0 = sumSquares(r0);
      const J = [];
      for (let j = 0; j < n; j++) {
        const h = steps[j] || 1e-5, qa = q.slice(), qb = q.slice();
        qa[j] += h; qb[j] -= h;
        const ra = residuals(seed, qa, family, shape, sky, pix, weights), rb = residuals(seed, qb, family, shape, sky, pix, weights);
        const col = new Float64Array(r0.length);
        for (let i = 0; i < col.length; i++) col[i] = (ra[i] - rb[i]) / (2*h);
        J.push(col);
      }
      const A = Array.from({ length: n }, () => new Float64Array(n + 1));
      for (let a = 0; a < n; a++) {
        for (let b = 0; b < n; b++) { let s = 0; for (let i = 0; i < r0.length; i++) s += J[a][i]*J[b][i]; A[a][b] = s; }
        let s = 0; for (let i = 0; i < r0.length; i++) s += J[a][i]*r0[i];
        A[a][n] = -s;
      }
      let improved = false;
      for (let attempt = 0; attempt < 10 && !improved; attempt++) {
        const M = A.map((row, a) => { const c = Float64Array.from(row); c[a] += lambda*(row[a] || 1); return c; });
        const delta = gauss(M, n);
        if (!delta) { lambda *= 10; continue; }
        const next = q.map((v, j) => Math.max(lower[j], Math.min(upper[j], v + delta[j])));
        const cost = sumSquares(residuals(seed, next, family, shape, sky, pix, weights));
        if (cost < cost0) {
          improved = true; lambda = Math.max(1e-9, lambda*.3);
          const change = Math.abs(cost0 - cost) / (cost0 + 1e-9);
          q = next;
          if (change < 1e-10) iteration = 1e9;
        } else lambda *= 5;
      }
      if (!improved) break;
    }
    const model = modelFrom(seed, q, family, shape);
    const final = residuals(seed, q, family, shape, sky, pix);
    const dist = [];
    for (let i = 0; i < sky.length; i++) dist.push(Math.hypot(final[2*i], final[2*i + 1]));
    return { model, distances: dist, median: median(dist) };
  }

  // Fit every projection family. Each family's best result is kept, best first. Named projections are preferred over the fitted one
  // when they are nearly as good, since they extrapolate correctly beyond the crops.
  function fitProjection(pairs, options = {}) {
    const sky = pairs.map(p => p.sky), pix = pairs.map(p => p.pixel);
    const axes = fibonacci(options.axes || 950);
    // The axis grid finds starting points. Refine those few candidates on all the matched stars.
    const stride = Math.ceil(sky.length / 58);
    const seedSky = sky.filter((_, i) => i % stride === 0), seedPix = pix.filter((_, i) => i % stride === 0);
    const hints = options.center ? { center: options.center, centerTolerance: options.centerTolerance } : {};
    const candidates = [];
    for (const [family, shape] of FAMILIES) {
      let best = null;
      for (const seed of seedsFor(family, shape, seedSky, seedPix, axes, hints)) {
        let fit;
        try { fit = refine(seed, family, shape, sky, pix, hints); } catch (_) { continue; }
        if (!best || fit.median < best.median) best = { family, shape, ...fit };
      }
      if (best) candidates.push(best);
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => a.median - b.median);
    const best = candidates[0];
    // The one-parameter family between the named ones, started from the best named projection of its kind.
    if (!hints.center) {
      const freeSeed = { R: best.model.R, f: best.model.f, ratio: best.model.ratio, cx: best.model.cx, cy: best.model.cy };
      try {
        const polished = refine(freeSeed, best.family, .5, sky, pix, hints);
        if (polished.median < best.median*.72) candidates.unshift({ family: best.family, shape: polished.model.shape, ...polished });
      } catch (_) { /* the named projections stand */ }
    }
    const describe = c => {
      const inlier = limit => c.distances.filter(d => d <= limit).length / c.distances.length;
      return { model: c.model, family: c.family, shape: c.model.shape, median: c.median, inlier: inlier(Math.max(5, 3*c.median)),
        rms: Math.sqrt(c.distances.reduce((sum, d) => sum + Math.min(d, 30)**2, 0) / c.distances.length) };
    };
    const list = candidates.map(describe);
    return { ...list[0], candidates: list };
  }

  // ---------------------------------------------------------------------------------------------------------------------------------------
  // Crops
  // ---------------------------------------------------------------------------------------------------------------------------------------

  // The star-filled area of the frame, from the stars found on the overview: its bounding box without outliers, cut above a ground-lit rim.
  function skyArea(stars, width, height) {
    const xs = stars.map(s => s.x).sort((a, b) => a - b), ys = stars.map(s => s.y).sort((a, b) => a - b);
    const q = (list, t) => list[Math.max(0, Math.min(list.length - 1, Math.round(t*(list.length - 1))))];
    let x0 = q(xs, .01), x1 = q(xs, .99), y0 = q(ys, .01), y1 = q(ys, .99);
    // The ground carries no point sources: the sky ends where the stars thin out.
    const rows = 12, counts = new Array(rows).fill(0);
    for (const s of stars) counts[Math.min(rows - 1, Math.floor(rows*s.y/height))]++;
    const reference = median(counts.slice(0, 4)) || 1;
    let last = rows - 1;
    while (last > 3 && counts[last] < .25*reference) last--;
    y1 = Math.min(y1, height*(last + 1)/rows);
    return { x0: Math.max(0, x0 - .01*width), y0: Math.max(0, y0 - .01*height), x1: Math.min(width, x1 + .01*width), y1: Math.min(height, y1 + .01*height) };
  }

  // Five crops: the centre and one in each corner of the sky. A corner crop slides toward the centre until it holds stars.
  function planCrops(stars, overview, full, options = {}) {
    const area = skyArea(stars, overview.width, overview.height);
    const k = full.width / overview.width;
    const skyW = (area.x1 - area.x0)*k, skyH = (area.y1 - area.y0)*k;
    let size = Math.round(Math.max(360, Math.min(options.fraction ? options.fraction*skyW : .235*skyW, skyH, options.maxSize || 1100)));
    size = Math.min(size, Math.floor(full.width), Math.floor(full.height));
    const ax0 = area.x0*k, ay0 = area.y0*k;
    const count = (x, y) => stars.filter(s => s.x*k >= x && s.x*k < x + size && s.y*k >= y && s.y*k < y + size).length;
    const place = (fx, fy) => {
      let x = ax0 + fx*(skyW - size), y = ay0 + fy*(skyH - size);
      x = Math.max(0, Math.min(full.width - size, x)); y = Math.max(0, Math.min(full.height - size, y));
      return { x: Math.round(x), y: Math.round(y), w: size, h: size };
    };
    const centre = place(.5, .5), reference = Math.max(8, count(centre.x, centre.y));
    const crops = [{ name: 'centre', ...centre }];
    for (const [name, fx, fy] of [['top-left', 0, 0], ['top-right', 1, 0], ['bottom-left', 0, 1], ['bottom-right', 1, 1]]) {
      let tx = fx, ty = fy, crop = place(tx, ty);
      for (let step = 0; step < 6 && count(crop.x, crop.y) < .45*reference; step++) {
        tx += (.5 - tx)*.18; ty += (.5 - ty)*.18; crop = place(tx, ty);
      }
      crops.push({ name, ...crop });
    }
    const spare = [];
    for (const [name, fx, fy] of [['top', .5, 0], ['bottom', .5, 1], ['left', 0, .5], ['right', 1, .5], ['upper-left', .25, .25], ['upper-right', .75, .25], ['lower-left', .25, .75], ['lower-right', .75, .75]]) {
      spare.push({ name, ...place(fx, fy) });
    }
    return { crops, spare, area, size };
  }


  // ---------------------------------------------------------------------------------------------------------------------------------------
  // Ground line and cylindrical panoramas
  // ---------------------------------------------------------------------------------------------------------------------------------------

  // Where the sky ends: the row at which the brightness of the frame falls most. Stars and lights are single pixels, so the median of each row
  // follows the sky glow and the dark ground below it. Null when there is no clear ground (a frame of pure sky).
  function findHorizon(overview) {
    const { width, height, rgba } = overview, step = 4, cols = Math.ceil(width/step);
    if (height < 60 || width < 60) return null;
    const row = new Float32Array(cols), profile = new Float32Array(height);
    for (let y = 0; y < height; y++) {
      let n = 0;
      for (let x = 0; x < width; x += step) { const i = (y*width + x)*4; row[n++] = .3*rgba[i] + .59*rgba[i + 1] + .11*rgba[i + 2]; }
      profile[y] = row.subarray(0, n).sort()[n >> 1];
    }
    const w = Math.max(3, Math.round(.012*height)), sum = new Float64Array(height + 1);
    for (let y = 0; y < height; y++) sum[y + 1] = sum[y] + profile[y];
    const mean = (a, b) => (sum[b] - sum[a])/(b - a);
    let best = 0, at = -1, above = 0;
    for (let y = Math.max(w, Math.round(.3*height)); y < height - w - 1; y++) {
      const drop = mean(y - w, y) - mean(y + 1, y + 1 + w);
      if (drop > best) { best = drop; at = y; above = mean(y - w, y); }
    }
    return at >= 0 && best >= 28 && best >= .22*above ? { y: at, strength: best } : null;
  }

  // A levelled panorama (equirectangular, or a cylinder seen in perspective) is flat in longitude and latitude, but the sky is not: a degree of
  // longitude is only cos(latitude) of a degree long. The stretch grows with the height above the horizon, so a crop high in the frame is not a
  // scaled copy of the sky and its stars cannot be matched as one. Such a crop is drawn again as the tangent plane of the sky at its centre,
  // from the row of the equator (the horizon) and the scale, and the ordinary engine solves that copy at once. Neither number has to be exact:
  // the horizon may be several degrees out and the scale a few percent, and the solver reports the true scale of the patch.
  // hyp: { kind: 'car' | 'cyp', yEq: row of the equator (frame pixels), scale: pixels per degree }
  const cylinderLocal = (...args) => P().cylinderLocal(...args);
  const cylinderBack = (...args) => P().fromTangentPatch(...args);
  // The rectangle of the frame that a patch is cut from, with the patch centre moved so that the patch stays inside the frame.
  function cylinderFootprint(hyp, cx, cy, size, full) {
    const bounds = (x, y) => {
      const L = cylinderLocal(hyp, y);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i <= 16; i++) {
        const t = Math.min(size - 1, size*i/16);
        for (const [u, v] of [[t, 0], [t, size - 1], [0, t], [size - 1, t]]) {
          const [px, py] = cylinderBack(hyp, x, y, size, u, v, L);
          if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
          x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
        }
      }
      return { x0, x1, y0, y1 };
    };
    let x = cx, y = cy, box = bounds(x, y);
    for (let pass = 0; box && pass < 3; pass++) {
      const sx = box.x0 < 0 ? -box.x0 : box.x1 > full.width ? full.width - box.x1 : 0;
      const sy = box.y0 < 0 ? -box.y0 : box.y1 > full.height ? full.height - box.y1 : 0;
      if (!sx && !sy) break;
      x += sx; y += sy; box = bounds(x, y);
    }
    if (!box) return null;
    const rx = Math.max(0, Math.floor(box.x0) - 1), ry = Math.max(0, Math.floor(box.y0) - 1);
    return { cx: x, cy: y, x: rx, y: ry, w: Math.max(8, Math.min(full.width - rx, Math.ceil(box.x1) + 2 - rx)), h: Math.max(8, Math.min(full.height - ry, Math.ceil(box.y1) + 2 - ry)) };
  }
  // The patch itself, drawn from a window of the frame ({ x, y, width, height, rgba } in frame pixels).
  function cylinderPatch(hyp, win, cx, cy, size) {
    const L = cylinderLocal(hyp, cy), out = new Uint8ClampedArray(size*size*4);
    for (let v = 0; v < size; v++) for (let u = 0; u < size; u++) {
      const [px, py] = cylinderBack(hyp, cx, cy, size, u, v, L);
      const fx = px - .5 - win.x, fy = py - .5 - win.y, ix = Math.floor(fx), iy = Math.floor(fy);
      if (!(ix >= 0 && iy >= 0 && ix + 1 < win.width && iy + 1 < win.height)) continue;
      const tx = fx - ix, ty = fy - iy, a = (iy*win.width + ix)*4, b = a + 4, c = a + win.width*4, d = c + 4, o = (v*size + u)*4;
      for (let k = 0; k < 3; k++) out[o + k] = (win.rgba[a + k]*(1 - tx) + win.rgba[b + k]*tx)*(1 - ty) + (win.rgba[c + k]*(1 - tx) + win.rgba[d + k]*tx)*ty;
      out[o + 3] = 255;
    }
    return { width: size, height: size, rgba: out };
  }

  // Moves the stars of a solved crop into the frame's pixel coordinates.
  const pairsFrom = (crop, result) => result.matches.map(m => ({ sky: m.sky, pixel: [crop.x + m.x, crop.y + m.y], crop: crop.name }));

  function localField(result, crop, mapping = null) {
    if (result.matches.length < 22 || result.stats.rms_px > 3.4) return null;
    const points = result.matches.map(({x,y}) => [x,y]).sort((a,b) => a[0]-b[0] || a[1]-b[1]);
    // The convex hull confines each projection to the part of its own frame that actually matched.
    const turn = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const chain = list => {
      const out = [];
      for (const p of list) {
        while (out.length >= 2 && turn(out.at(-2),out.at(-1),p) <= 0) out.pop();
        out.push(p);
      }
      out.pop();
      return out;
    };
    const hull = chain(points).concat(chain(points.reverse()));
    if (hull.length < 4) return null;
    return { header:result.header, x:crop.x, y:crop.y, mapping, hull };
  }

  // How well a model explains the stars found in the frame: detections that land on a catalogue star, against the same count for the
  // detections moved sideways, which is the number of coincidences to expect.
  function collectMatches(model, detections, index, solver, tolerance, dx = 0, dy = 0) {
    const matches = new Map();
    for (const [px, py] of detections) {
      const x = px + dx, y = py + dy;
      const vector = P().unproject(model, x, y), local = vector && P().samplingAt(model, x, y);
      if (!local) continue;
      const star = solver.nearestStar(index, vector, tolerance*Math.max(local.x,local.y)/3600*DEG);
      const projected = star && P().project(model, star.sky);
      if (!projected) continue;
      const error = Math.hypot(x-projected[0],y-projected[1]);
      if (error > tolerance || error >= (matches.get(star.id)?.error ?? Infinity)) continue;
      matches.set(star.id, { ...star, pixel:[x,y], error });
    }
    return [...matches.values()];
  }

  const occupiedBands = (matches, area) => area ? new Set(matches.map(({pixel}) =>
    Math.min(3,Math.floor(4*(pixel[0]-area.x0)/(area.x1-area.x0))))).size : 0;

  function scoreModel(model, detections, index, solver, tolerancePx = 4, scale = 1, area = null) {
    const matches = collectMatches(model,detections,index,solver,tolerancePx);
    const control = collectMatches(model,detections,index,solver,tolerancePx,32*scale,23*scale).length;
    return { hits:matches.length, control, excess:matches.length-control, count:detections.length,
      bands:occupiedBands(matches,area), median_px:median(matches.map(m=>m.error)) };
  }

  // The stars used for the crop fits cannot also confirm the all-frame projection. Estimate chance alignment
  // at several offsets with the same catalogue subset, including in the crowded Galactic plane.
  function verifySky(model, detections, seeds, index, solver, tolerance, scale, area) {
    const known = new Set(seeds.map(m=>m.sky.join()));
    const independent = matches => matches.filter(m=>!known.has(m.sky.join()));
    const hits = independent(collectMatches(model,detections,index,solver,tolerance));
    const offsets = [[32,23],[-28,16],[18,-27],[-18,-25]];
    const chance = offsets.map(([dx,dy]) =>
      independent(collectMatches(model,detections,index,solver,tolerance,dx*scale,dy*scale)).length);
    const expected = Math.max(...chance)+2, observed = hits.length;
    const significance = observed > expected ? observed*Math.log(observed/expected)-observed+expected : 0;
    return { hits:observed, expected, significance, bands:occupiedBands(hits,area) };
  }

  // A small, smooth correction can account for resampling or stitching left over after fitting a real map projection.
  // Accept it only when it also registers stars that were set aside from the fit.
  function correctProjection(candidate, pairs, area) {
    const { model } = candidate, Pj = P();
    const sx = (area.x1-area.x0)/2, sy = (area.y1-area.y0)/2;
    const cx = area.x0+sx, cy = area.y0+sy;
    const unique = new Map();
    for (const {sky,pixel} of pairs) {
      const p = Pj.project(model,sky);
      if (!p || Math.abs(p[0]-cx) > 1.3*sx || Math.abs(p[1]-cy) > 1.3*sy) continue;
      const error = Math.hypot(pixel[0]-p[0],pixel[1]-p[1]);
      const key = sky.join();
      if (error >= (unique.get(key)?.error ?? Infinity)) continue;
      unique.set(key, { p, pixel, error });
    }
    const samples = [...unique.values()];
    if (samples.length < 65 || Math.max(...samples.map(s=>s.p[0]))-Math.min(...samples.map(s=>s.p[0])) < 1.35*sx ||
        Math.max(...samples.map(s=>s.p[1]))-Math.min(...samples.map(s=>s.p[1])) < .95*sy) return null;
    const train = samples.filter((_,i) => i % 4 !== 0), test = samples.filter((_,i) => i % 4 === 0);
    const correction = { cx,cy,sx,sy };
    const misses = (fit,list) => list.map(({p,pixel}) => {
      const q = Pj.correctPixel(fit,...p);
      return Math.hypot(q[0]-pixel[0],q[1]-pixel[1]);
    });
    let best = null;
    for (const terms of [6,10]) {
      let fit, use = train;
      for (let pass = 0; pass < 5 && use.length >= 42; pass++) {
        const vectors = use.map(m => Pj.correctionTerms((m.p[0]-cx)/sx,(m.p[1]-cy)/sy).slice(0,terms));
        const x = solveNormal(use.map((m,i) => [vectors[i],(m.pixel[0]-m.p[0])/sx]),terms);
        const y = solveNormal(use.map((m,i) => [vectors[i],(m.pixel[1]-m.p[1])/sy]),terms);
        if (!x || !y) { fit = null; break; }
        fit = { ...correction, x,y };
        const distances = misses(fit, train), reach = Math.max(2.6, 3.8*median(distances));
        use = train.filter((_,i) => distances[i] <= reach);
      }
      if (!fit || use.length < 42) continue;
      const px = candidate.median;
      const errors = misses(fit,test), middle = median(errors);
      if (middle >= Math.min(.8*px, best?.median ?? Infinity) || middle >= .80*median(test.map(s=>s.error))) continue;
      let bounded = true;
      for (const x of [area.x0,cx,area.x1]) for (const y of [area.y0,cy,area.y1]) {
        const p = Pj.correctPixel(fit,x,y), dx = Pj.correctPixel(fit,x+1,y), dy = Pj.correctPixel(fit,x,y+1);
        if (Math.hypot(p[0]-x,p[1]-y) > .075*Math.max(sx,sy)*2 ||
            Math.abs(dx[0]-p[0]-1)+Math.abs(dy[0]-p[0]) > .38 ||
            Math.abs(dx[1]-p[1])+Math.abs(dy[1]-p[1]-1) > .38) bounded = false;
      }
      if (bounded) {
        best = { ...candidate, model:{ ...model, correction:fit }, median:middle,
          rms:Math.sqrt(errors.reduce((s,e)=>s+Math.min(e,30)**2,0)/errors.length),
          inlier:errors.filter(e=>e<=Math.max(5,3*middle)).length/errors.length };
      }
    }
    return best;
  }

  // Everything the frame's model says about how it was taken, for the summary: where it points, how much it covers and how finely.
  function describe(model, area, full) {
    const Pj = P();
    const x0 = area.x0, x1 = area.x1, y0 = area.y0, y1 = area.y1, mx = (x0 + x1)/2, my = (y0 + y1)/2;
    const centre = Pj.unproject(model, mx, my), up = Pj.unproject(model, mx, my - 1);
    const east = [-centre[1], centre[0], 0], norm = Math.hypot(east[0], east[1]) || 1;
    const e = [east[0]/norm, east[1]/norm, 0], n = cross(centre, e), d = [up[0] - centre[0], up[1] - centre[1], up[2] - centre[2]];
    const grid = [];
    for (let i = 0; i <= 8; i++) for (let j = 0; j <= 4; j++) {
      const sample = Pj.samplingAt(model, x0 + (x1 - x0)*i/8, y0 + (y1 - y0)*j/4);
      if (sample) grid.push(Math.sqrt(sample.x*sample.y));
    }
    const sky = Pj.toSky(centre);
    return { centre: sky, extent: Pj.extentOf(model, full.width, full.height, area),
      sampling_arcsec: { centre: (Pj.samplingAt(model, mx, my) || { x: 0, y: 0 }), min: Math.min(...grid), max: Math.max(...grid) },
      up_angle_deg: Math.atan2(dot(d, e), dot(d, n))/DEG,
      projection: typeof model.shape === 'number' ? (model.family === 'cyl' ? 'Cylindrical (fitted)' : 'Fisheye (fitted)') : Pj.shapeOf(model.family, model.shape).name,
      family: model.family };
  }

  // A plain copy of the model that can cross to the page, with the limits of the part of the projection the frame really uses. Without them a
  // projection that folds back (a tangent plane past 90 degrees, an orthographic disc) would draw ghosts of stars from behind the camera.
  function plainModel(model, area) {
    const Pj = P(), margin = 1.5*DEG;
    const out = { family: model.family, shape: model.shape, R: model.R.map(row => row.slice()), f: model.f, ratio: model.ratio, cx: model.cx, cy: model.cy };
    if (model.correction) out.correction = model.correction;
    let lam = 0, phi = 0, theta = 0;
    const steps = 48, clamp1 = v => Math.max(-1, Math.min(1, v));
    for (let i = 0; i <= steps; i++) {
      const t = i/steps, x = area.x0 + (area.x1 - area.x0)*t, y = area.y0 + (area.y1 - area.y0)*t;
      for (const [px, py] of [[x, area.y0], [x, area.y1], [area.x0, y], [area.x1, y]]) {
        const v = Pj.unproject(model, px, py);
        if (!v) continue;
        const c = Pj.apply(model.R, v);
        lam = Math.max(lam, Math.abs(Math.atan2(c[0], c[2])));
        phi = Math.max(phi, Math.abs(Math.asin(clamp1(c[1]))));
        theta = Math.max(theta, Math.acos(clamp1(c[2])));
      }
    }
    if (model.family === 'cyl') { out.maxLongitude = Math.min(Math.PI, lam + margin); out.maxLatitude = Math.min(Math.PI/2 - 1e-3, phi + margin); }
    else out.maxAngle = Math.min(3.1, theta + margin);
    return out;
  }

  async function solvePanorama(job) {
    const { overview, full, getCrop, loadIndex, solver, report = () => {}, cropLimit = 9000, budget = 120000 } = job;
    const started = performance.now();
    const cache = new Map();
    const cachedIndex = async key => { if (!cache.has(key)) cache.set(key, await loadIndex(key)); return cache.get(key); };
    report(.02, 'Finding the sky in the frame…');
    const k = full.width / overview.width, ky = full.height / overview.height;
    // Lights on the ground are point sources too and would fill the star list: the stars are taken from the sky above the ground line only.
    const ground = job.ground === undefined ? findHorizon(overview) : job.ground;
    const sky = ground ? { ...overview, height: Math.max(40, Math.min(overview.height, Math.round(ground.y))) } : overview;
    const stars = solver.detectStars(sky).map(s => ({ x: s.x, y: s.y }));
    if (stars.length < 40) return { error: 'The frame holds too few stars for an ultra-wide solve.' };
    const plan = planCrops(stars, sky, full, job.options);
    const queue = plan.crops.concat(plan.spare);
    const pairs = [], solved = [], tried = [], fields = [];
    const total = plan.crops.length + (ground ? 1 : 0);
    let spareUsed = 0, hyp = null, rectMiss = 0, lastFit = null;
    const remaining = () => budget - (performance.now() - started);
    const area = { x0:plan.area.x0*k, y0:plan.area.y0*ky, x1:plan.area.x1*k, y1:plan.area.y1*ky };
    const detections = stars.slice(0,420).map(s => [(s.x+.5)*k-.5,(s.y+.5)*ky-.5])
      .filter(([x,y]) => x >= area.x0 && x <= area.x1 && y >= area.y0 && y <= area.y1);
    // Fit, check against every star of the frame and decide. Called when the fields are done, and early once three of them are solved.
    const attempt = async (final = false) => {
      const progress = { solved: solved.length, tried: tried.length };
      if (!solved.length) return { error: 'None of the fields cut from this frame could be solved.', ...progress };
      if (pairs.length < 30) return { error: 'Too few stars were matched in the solved fields to find the projection.', ...progress };
      report(.84, 'Fitting the projection…');
      const lone = solved.length < 3;
      const hints = lone ? { center: [(area.x0+area.x1)/2,(area.y0+area.y1)/2],
        centerTolerance:.05*Math.max(area.x1-area.x0,area.y1-area.y0) } : {};
      const wide = await cachedIndex('wide');
      const tolerance = Math.max(2.6, 1.7*k);
      const chooseFit = fit => {
        if (!fit) return null;
        report(.9, 'Checking the projection against the stars…');
        const rank = (a,b) => Math.abs(b.score.excess-a.score.excess) > 3
          ? b.score.excess-a.score.excess : a.median-b.median;
        const score = candidate => {
          const value = scoreModel(candidate.model,detections,wide,solver,tolerance,k,area);
          return { ...candidate, score:value };
        };
        const candidates = fit.candidates.map(score).sort(rank);
        if (solved.length >= 3 && !verified(candidates[0])) {
          for (const seed of candidates.slice(0,3)) {
            const corrected = correctProjection(seed,pairs,area);
            if (corrected) candidates.push(score(corrected));
          }
          candidates.sort((a,b) => Number(verified(b))-Number(verified(a)) || rank(a,b));
        }
        return candidates[0];
      };
      const limit = Math.max(3.2, .0008*Math.max(full.width,full.height));
      const verified = fit => {
        if (!fit || fit.median > limit || fit.inlier < .4 || fit.score.bands < 3 ||
            fit.score.excess < Math.max(25,(lone ? .26 : .16)*fit.score.count)) return false;
        if (lone && fit.score.hits <= 3*fit.score.control) return false;
        fit.check ||= verifySky(fit.model,detections,pairs,wide,solver,tolerance,k,area);
        return fit.check.bands >= 3 && fit.check.significance >= 18 && fit.check.hits >= 24;
      };
      let chosen = chooseFit(fitProjection(pairs, { ...hints, axes:290 }));
      if (final && !verified(chosen)) {
        const fineFit = chooseFit(fitProjection(pairs, hints));
        if (fineFit && (!chosen || verified(fineFit) || fineFit.score.excess > chosen.score.excess)) chosen = fineFit;
      }
      if (!chosen) return { error: 'No projection could be fitted to the solved fields.', ...progress };
      const accepted = verified(chosen);
      const stats = { crops_solved:solved.length, crops_tried:tried.length, pairs:pairs.length,
        median_px:chosen.median, rms_px:chosen.rms, inlier:chosen.inlier, verified:chosen.score, independent:chosen.check,
        family:chosen.family, shape:chosen.shape, correction:!!chosen.model.correction,
        rectified:hyp ? { kind:hyp.kind, equator_row:Math.round(hyp.yEq), px_per_deg:+hyp.scale.toFixed(2) } : null };
      if (!accepted) {
        const reason = chosen.median > limit || chosen.inlier < .4
          ? 'The solved fields did not agree on a single projection.'
          : 'The fitted projection could not be confirmed against the stars of the whole frame.';
        return { error: reason, stats, ...progress };
      }
      report(.97, 'Placing the annotations…');
      return { model: plainModel(chosen.model, area), area, stats, info: describe(chosen.model, area, full), elapsed: performance.now() - started, pairs, ...progress };
    };

    // One field, solved as it is.
    const solvePlain = async (crop, limit, tick) => {
      const image = await getCrop({ x: crop.x, y: crop.y, w: crop.w, h: crop.h });
      const result = await solver.solve(image, cachedIndex, tick, { timeLimit: limit, ignoreFooter: false, wideOnly: true });
      return result && result.header && result.matches && result.matches.length >= 8
        ? { result, pairs:pairsFrom(crop,result), fieldWcs:localField(result,crop) } : null;
    };
    // One field of a levelled cylindrical panorama: drawn as the tangent plane of the sky, solved, and its stars put back in frame pixels.
    const solveRectified = async (hypothesis, name, cx, cy, size, limit, tick) => {
      const foot = cylinderFootprint(hypothesis, cx, cy, size, full);
      if (!foot) return null;
      const win = await getCrop({ x: foot.x, y: foot.y, w: foot.w, h: foot.h });
      if (win.width !== foot.w || win.height !== foot.h) return null;
      const patch = cylinderPatch(hypothesis, { x: foot.x, y: foot.y, width: win.width, height: win.height, rgba: win.rgba }, foot.cx, foot.cy, size);
      const result = await solver.solve(patch, cachedIndex, tick, { timeLimit: limit, ignoreFooter: false, wideOnly: true });
      if (!(result && result.header && result.matches && result.matches.length >= 8)) return null;
      const local = cylinderLocal(hypothesis, foot.cy);
      const found = result.matches.map(m => {
        const [px, py] = cylinderBack(hypothesis, foot.cx, foot.cy, size, m.x, m.y, local);
        return { sky: m.sky, pixel: [px - .5, py - .5], crop: name };
      });
      const mapping = { ...hypothesis, cx:foot.cx, cy:foot.cy, size };
      return { result, pairs:found, field:result.stats.field_deg, fieldWcs:localField(result,foot,mapping) };
    };

    // With a ground line the frame is probably a levelled panorama: the horizon is the equator of its cylinder. A field just above the horizon is
    // nearly undistorted, so it is solved first and tells the scale; the other fields are then drawn with that scale and the horizon.
    if (ground) {
      const size = plan.size, horizonRow = ground.y*k, H = full.height;
      const anchorX = (plan.area.x0 + plan.area.x1)/2*k;
      const hypotheses = [
        ['car', 0, 95, 1, .5], ['cyp', 0, 95, 1, .5],
        ['car', .045, 150, .76, .25], ['cyp', .045, 150, .76, .75],
        ['car', .09, 195, .74, .68]
      ];
      const t0 = performance.now();
      for (let a = 0; a < hypotheses.length && performance.now() - t0 < 14500 && remaining() > 0; a++) {
        const [kind, shift, span, fraction, col] = hypotheses[a];
        const guess = { kind, yEq: horizonRow + shift*H, scale:full.width/span };
        const patchSize = Math.max(360, Math.round(fraction*size));
        const x = fraction === 1 ? anchorX : (plan.area.x0 + col*(plan.area.x1-plan.area.x0))*k;
        const y = Math.max(plan.area.y0*ky + patchSize/2, Math.min(horizonRow - patchSize/2 - .02*H, H-patchSize/2));
        report(.06 + .02*a, 'Finding the projection of the panorama…');
        const found = await solveRectified(guess, 'anchor', x, y, patchSize, a < 2 ? 5200 : 2400,
          (c, t) => report(.06 + .02*a + .02*Math.min(1,c/t), 'Finding the projection of the panorama…'));
        tried.push('anchor');
        if (!found || !(found.field > 1)) continue;
        hyp = { kind, yEq: guess.yEq, scale: patchSize*DEG/(2*Math.tan(found.field*DEG/2)) };
        solved.push({ crop: { name: 'anchor' }, stats: found.result.stats, header: found.result.header, matches: found.result.matches.length });
        pairs.push(...found.pairs);
        if (found.fieldWcs) fields.push(found.fieldWcs);
        break;
      }
    }

    // An ordinary-shaped frame with no ground is most likely not a panorama: it gets shorter attempts, and is given up after three fields without a match.
    const roundish = !ground && Math.max(full.width, full.height) / Math.min(full.width, full.height) < 1.9;
    // The same goes for a frame whose ground line led nowhere: three fields without a match and the search ends.
    const hopeful = roundish || !!ground;
    let fieldTries = 0;
    for (let i = 0; i < queue.length; i++) {
      const crop = queue[i];
      const isSpare = i >= plan.crops.length;
      if (remaining() <= 0 || (hopeful && !solved.length && fieldTries >= 3)) break;
      // Try a few extra fields when the first set did not establish a verified projection.
      if (isSpare && (spareUsed >= 4 || (fields.length >= 4 && spareUsed >= 1))) break;
      if (isSpare) spareUsed++;
      // The five fields fill the bar from 6% to 80%; extra fields, when they are needed, stay inside the last stretch.
      const base = .06 + .74*Math.min(1, tried.length / total);
      const slice = .74 / total;
      const label = () => `Solving field ${Math.min(total, tried.length + 1)} of ${total}${isSpare ? ' (extra)' : ''}…`;
      report(base, label());
      const tick = (c, t) => report(Math.min(.8, base + slice*Math.min(1, c / t)), label());
      let got = null;
      if (hyp && remaining() > 0) {
        const size = Math.max(360, Math.min(crop.w, crop.h)), cx = crop.x + crop.w/2, cy = crop.y + crop.h/2;
        // Close to the horizon an equirectangular and a perspective cylinder look alike, so the anchor cannot tell them apart: a field that does not
        // solve is drawn again as the other kind, and then with the equator a little higher or lower (it is the most sensitive row far from the horizon).
        const trials = [hyp];
        if (solved.length < 3 && rectMiss < 1) {
          trials.push({ ...hyp, kind: hyp.kind === 'car' ? 'cyp' : 'car' });
          for (const d of [.03, -.03]) trials.push({ ...hyp, yEq: hyp.yEq + d*full.height });
        }
        for (let t = 0; t < trials.length && !got && remaining() > 0; t++) {
          const found = await solveRectified(trials[t], crop.name, cx, cy, size, Math.min(remaining(), t ? 1700 : 3200), tick);
          if (found) { got = found; hyp = trials[t]; }
        }
        // A ground line does not always mean a levelled cylinder: after two fields that fit no cylinder (or too much time) the fields are solved as they are.
        if (!got && (++rectMiss >= 2 || performance.now() - started > budget*.5)) hyp = null;
      }
      if (!got && remaining() > 0) got = await solvePlain(crop, Math.min(remaining(), cropLimit, 4400), tick);
      tried.push(crop.name);
      fieldTries++;
      if (got) {
        solved.push({ crop, stats: got.result.stats, header: got.result.header, matches: got.result.matches.length });
        pairs.push(...got.pairs);
        if (got.fieldWcs) fields.push(got.fieldWcs);
        // With three fields solved the whole frame can already confirm the projection, and the remaining fields are not needed.
        if (solved.length >= 3 && i < queue.length - 1 && solved.length !== lastFit) {
          const early = await attempt();
          if (!early.error) return early;
          lastFit = solved.length;
        }
      }
    }
    const final = await attempt(true);
    return final.error ? { ...final, fields } : final;
  }

  root.InstaSlicePanorama = { plainModel, fitProjection, planCrops, skyArea, solvePanorama, findHorizon, cylinderBack, cylinderPatch, cylinderFootprint, scoreModel, describe, FAMILIES, _refine: refine, _seeds: seedsFor, _fibonacci: fibonacci };
})(typeof self !== 'undefined' ? self : globalThis);
