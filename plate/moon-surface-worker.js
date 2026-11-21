/* Match visible lunar terrain to fixed, same-origin NASA atlas data. */
'use strict';

const RAD = Math.PI / 180;
const DESCRIPTOR = 32;
const KEY_BYTES = 148; // five floats followed by 128 RootSIFT bins
const KEY_LIMIT = 1100;
const ANGLE = a => ((a + 540) % 360) - 180;
const clamp = (x, low, high) => Math.max(low, Math.min(high, x));

async function asset(name) {
  const url = new URL(name, self.location.href);
  const response = await fetch(url, {
    mode: 'same-origin', credentials: 'same-origin', referrerPolicy: 'no-referrer', redirect: 'error'
  });
  if (!response.ok) throw new Error('The offline lunar surface atlas could not be loaded.');
  return response;
}

async function loadEngine() {
  if (typeof WebAssembly !== 'object' || typeof DecompressionStream !== 'function') {
    throw new Error('This browser cannot run lunar surface matching.');
  }
  const [pack, portable, simd] = await Promise.all([
    asset('./moon-surface-atlas.bin.gz?v=13'), asset('./moon-surface.wasm?v=13'),
    asset('./moon-surface-simd.wasm?v=13').then(response => response.arrayBuffer()).catch(() => null)
  ]);
  const atlas = await new Response(pack.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const module = simd && WebAssembly.validate(simd) ? simd : await portable.arrayBuffer();
  const { instance: { exports: wasm } } = await WebAssembly.instantiate(module);
  const mem = wasm.memory;
  function copy(bytes) {
    const pointer = wasm.malloc(bytes.byteLength);
    if (!pointer) throw new Error('The lunar solver ran out of memory.');
    new Uint8Array(mem.buffer, pointer, bytes.byteLength).set(bytes);
    return pointer;
  }

  const header = new DataView(atlas);
  const frames = [];
  const count = header.getUint32(4, true), side = header.getUint32(8, true);
  if (header.getUint32(0, true) !== 0x31414e4c || header.getUint32(12, true) !== DESCRIPTOR ||
      count < 1 || count > 60 || side < 512 || side > 4000) {
    throw new Error('The lunar surface atlas could not be read.');
  }
  const projectionBytes = DESCRIPTOR * 129 * 4;
  const projection = copy(new Uint8Array(atlas, 16, projectionBytes));
  let offset = 16 + projectionBytes;
  for (let i = 0; i < count; i++) {
    const id = header.getUint32(offset, true), n = header.getUint32(offset + 4, true);
    if (n < 12 || n > 12000) throw new Error('The lunar surface atlas is incomplete.');
    const [R, theta, lon, lat, sunLon, sunLat] = new Float32Array(atlas, offset + 8, 6);
    offset += 32;
    const points = new Uint16Array(atlas, offset, n * 2);
    const xy = copy(new Uint8Array(atlas, offset, points.byteLength));
    offset += points.byteLength;
    const descriptors = copy(new Uint8Array(atlas, offset, n * DESCRIPTOR));
    offset += n * DESCRIPTOR;
    frames.push({ id, side, n, R, theta, lon, lat, sunLon, sunLat, points, xy, descriptors });
  }
  if (offset !== atlas.byteLength) throw new Error('The lunar surface atlas contains extra data.');
  return { wasm, projection, frames, copy };
}

function downsample(gray, w, h, limit) {
  const scale = Math.min(1, limit / Math.max(w, h));
  if (scale === 1) return { pixels: gray, width: w, height: h, scale };
  const width = Math.round(w * scale), height = Math.round(h * scale);
  const pixels = new Uint8Array(width * height);
  // Four evenly spaced samples soften sharpening noise and avoid aliases.
  for (let y = 0; y < height; y++) {
    const dy = (y + 0.5 - height / 2) / scale + h / 2 - 0.5;
    const y0 = clamp(Math.round(dy - 0.25 / scale), 0, h - 1) * w;
    const y1 = clamp(Math.round(dy + 0.25 / scale), 0, h - 1) * w;
    for (let x = 0; x < width; x++) {
      const dx = (x + 0.5 - width / 2) / scale + w / 2 - 0.5;
      const x0 = clamp(Math.round(dx - 0.25 / scale), 0, w - 1);
      const x1 = clamp(Math.round(dx + 0.25 / scale), 0, w - 1);
      pixels[y * width + x] = (gray[y0 + x0] + gray[y1 + x0] + gray[y0 + x1] + gray[y1 + x1] + 2) >> 2;
    }
  }
  return { pixels, width, height, scale };
}

function pairsFrom(keys, hits, frame, n) {
  const matches = [];
  for (let i = 0; i < n; i++) {
    const index = hits[3 * i], d1 = hits[3 * i + 1], d2 = hits[3 * i + 2];
    if (index >= frame.n || d1 >= 0.75 * d2) continue;
    const a = frame.points[index * 2] / 16, b = frame.points[index * 2 + 1] / 16;
    const x = keys[i * KEY_BYTES / 4] + 0.5, y = keys[i * KEY_BYTES / 4 + 1] + 0.5;
    matches.push({ a, b, x, y, ratio: d1 / d2 });
  }
  matches.sort((a, b) => a.ratio - b.ratio);
  const refUsed = new Set(), queryUsed = new Set();
  return matches.filter(({ a, b, x, y }) => {
    const ref = (Math.round(a / 1.25) << 16) + Math.round(b / 1.25);
    const query = (Math.round(x / 1.25) << 16) + Math.round(y / 1.25);
    if (refUsed.has(ref) || queryUsed.has(query)) return false;
    refUsed.add(ref);
    queryUsed.add(query);
    return true;
  });
}

function localAffine(p, q, r) {
  const u = q.a - p.a, v = q.b - p.b, w = r.a - p.a, z = r.b - p.b;
  const det = u * z - v * w;
  if (Math.abs(det) < 12 || Math.abs(det) < 0.14 * Math.hypot(u, v) * Math.hypot(w, z)) return null;
  const dx = q.x - p.x, ex = r.x - p.x, dy = q.y - p.y, ey = r.y - p.y;
  const m = (dx * z - ex * v) / det, n = (ex * u - dx * w) / det;
  const s = (dy * z - ey * v) / det, t = (ey * u - dy * w) / det;
  const scale = m * t - n * s;
  // Allow moderate foreshortening from a different view of the Moon.
  if (scale < 0.0005 || scale > 144 || (m * m + n * n + s * s + t * t) > 2.42 * scale) return null;
  return [m, n, p.x - m * p.a - n * p.b, s, t, p.y - s * p.a - t * p.b];
}

function coverage(points, width, height) {
  let left = width, right = 0, top = height, bottom = 0, x = 0, y = 0;
  for (const p of points) {
    left = Math.min(left, p.x); right = Math.max(right, p.x);
    top = Math.min(top, p.y); bottom = Math.max(bottom, p.y);
    x += p.x / width; y += p.y / height;
  }
  const n = points.length;
  x /= n; y /= n;
  let xx = 0, xy = 0, yy = 0;
  for (const p of points) {
    const u = p.x / width - x, v = p.y / height - y;
    xx += u * u; xy += u * v; yy += v * v;
  }
  const thickness = (xx * yy - xy * xy) / (n * (xx + yy));
  return { x: x * width, y: y * height, w: (right - left) / width, h: (bottom - top) / height, thickness };
}

function consensus(matches, width, height, tolerance) {
  let seed = 53971;
  const index = n => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return Math.floor(seed / 4294967296 * n);
  };
  let best = [], bestLoss = Infinity;
  const tol2 = tolerance * tolerance;
  for (let it = 0; it < 1200; it++) {
    const n = it < 300 ? Math.min(matches.length, 30 + Math.floor(it / 6)) : matches.length;
    const i = index(n), j = index(n), k = index(n);
    if (i === j || i === k || j === k) continue;
    const M = localAffine(matches[i], matches[j], matches[k]);
    if (!M) continue;
    const inliers = [];
    let loss = 0;
    for (const p of matches) {
      const dx = p.a * M[0] + p.b * M[1] + M[2] - p.x;
      const dy = p.a * M[3] + p.b * M[4] + M[5] - p.y;
      const d = dx * dx + dy * dy;
      if (d < tol2) { inliers.push(p); loss += d; }
    }
    if (inliers.length > best.length || (inliers.length === best.length && loss < bestLoss)) {
      best = inliers;
      bestLoss = loss;
    }
  }
  const spread = coverage(best, width, height);
  return best.length >= 12 && best.length >= Math.min(26, 0.39 * matches.length) &&
    spread.w >= 0.21 && spread.h >= 0.21 && spread.thickness >= 0.0018 ? best : null;
}

function worldAt(x, y, frame) {
  const u = (x - frame.cx) / frame.R, v = (frame.cy - y) / frame.R;
  const z = Math.sqrt(Math.max(0, 1 - u * u - v * v));
  const t = frame.theta * RAD, p = frame.lat * RAD, l = frame.lon * RAD;
  const a = u * Math.cos(t) - v * Math.sin(t), b = u * Math.sin(t) + v * Math.cos(t);
  const eq = z * Math.cos(p) - b * Math.sin(p);
  return [eq * Math.cos(l) - a * Math.sin(l), eq * Math.sin(l) + a * Math.cos(l), z * Math.sin(p) + b * Math.cos(p)];
}

function cameraBasis(point, lon, lat) {
  const [a, b, c] = point.world;
  const cl = Math.cos(lon * RAD), sl = Math.sin(lon * RAD);
  const cp = Math.cos(lat * RAD), sp = Math.sin(lat * RAD);
  const eq = a * cl + b * sl;
  return { u: b * cl - a * sl, v: sp * eq - cp * c, z: cp * eq + sp * c };
}

function solveSimilarity(point, weights) {
  let weight = 0, u = 0, v = 0, x = 0, y = 0;
  for (let i = 0; i < point.length; i++) {
    const p = point[i], w = weights[i];
    weight += w; u += w * p.u; v += w * p.v; x += w * p.x; y += w * p.y;
  }
  if (weight === 0) return null;
  u /= weight; v /= weight; x /= weight; y /= weight;
  let var0 = 0, a = 0, b = 0;
  for (let i = 0; i < point.length; i++) {
    const p = point[i], w = weights[i], du = p.u - u, dv = p.v - v;
    var0 += w * (du * du + dv * dv);
    a += w * (du * (p.x - x) + dv * (p.y - y));
    b += w * (du * (p.y - y) - dv * (p.x - x));
  }
  if (var0 < 1e-8) return null;
  a /= var0; b /= var0;
  return { a, b, R: Math.hypot(a, b), theta: Math.atan2(b, a) / RAD, cx: x - a * u + b * v, cy: y - b * u - a * v };
}

function displacement(fit, p) {
  if (p.z < 0.004) return 20;
  return Math.hypot(fit.cx + fit.a * p.u - fit.b * p.v - p.x,
    fit.cy + fit.b * p.u + fit.a * p.v - p.y);
}

function fitCamera(pairs, ref, tolerance) {
  let best = null;
  function visit(lon, lat) {
    if (Math.abs(lon) > 9 || Math.abs(lat) > 8) return;
    const points = pairs.map(p => ({ ...cameraBasis(p, lon, lat), x: p.x, y: p.y }));
    const initial = points.map(p => p.z > 0.004 ? 1 : 0);
    const seed = solveSimilarity(points, initial);
    if (!seed) return;
    const fit = solveSimilarity(points, initial.map((w, i) => w / Math.hypot(1, displacement(seed, points[i]) / tolerance)));
    if (!fit) return;
    const cost = points.reduce((total, p) => total + Math.min((2.4 * tolerance) ** 2, displacement(fit, p) ** 2), 0) / points.length +
      0.0015 * ((lon - ref.lon) ** 2 + (lat - ref.lat) ** 2);
    if (!best || cost < best.cost) best = { ...fit, lon, lat, cost };
  }
  visit(ref.lon, ref.lat);
  for (const lon of [-8, -4, 0, 4, 8]) for (const lat of [-7, -3.5, 0, 3.5, 7]) visit(lon, lat);
  if (!best) return null;
  for (const step of [2, 1, 0.5, 0.25]) {
    const { lon, lat } = best;
    for (const x of [-step, 0, step]) for (const y of [-step, 0, step]) {
      if (x || y) visit(lon + x, lat + y);
    }
  }
  return best;
}

function verifyFrame(matches, frame, width, height) {
  if (matches.length < 12) return null;
  const tolerance = Math.max(2.2, Math.max(width, height) * 0.005);
  const keep = consensus(matches, width, height, tolerance);
  if (!keep) return null;
  const ref = { ...frame, cx: frame.side / 2, cy: frame.side / 2 };
  const pairs = keep.map(p => ({ ...p, world: worldAt(p.a, p.b, ref) }));
  const fit = fitCamera(pairs.filter((_, i) => i % 4 !== 2), ref, tolerance);
  if (!fit || fit.R < 25 || fit.R > 14 * Math.max(width, height)) return null;
  const error = p => displacement(fit, { ...cameraBasis(p, fit.lon, fit.lat), x: p.x, y: p.y });
  const checks = pairs.filter((_, i) => i % 4 === 2).map(error).sort((a, b) => a - b);
  if (checks[Math.floor(checks.length * 0.65)] > 1.18 * tolerance) return null;
  const supported = pairs.filter(p => error(p) < 1.35 * tolerance);
  if (supported.length < 12 || supported.length < Math.max(0.75 * pairs.length, Math.min(23, 0.34 * matches.length))) return null;
  const spread = coverage(supported, width, height);
  if (spread.w < 0.20 || spread.h < 0.20 || spread.thickness < 0.0017) return null;
  const accurate = fitCamera(supported, ref, tolerance);
  if (!accurate) return null;
  const residuals = supported.map(p => displacement(accurate, { ...cameraBasis(p, accurate.lon, accurate.lat), x: p.x, y: p.y }))
    .sort((a, b) => a - b);
  const median = residuals[residuals.length >> 1];
  if (median > 0.82 * tolerance) return null;
  return {
    fit: accurate, count: supported.length, error: median, ratio: supported.length / matches.length,
    region: worldAt(spread.x, spread.y, accurate), spread: Math.min(spread.w, spread.h),
    phase: { lon: frame.sunLon, lat: frame.sunLat }, frame: frame.id,
    quality: supported.length * (0.6 + spread.w * spread.h) / (0.75 + median / tolerance)
  };
}

function search(engine, picture, mirrored) {
  const { wasm, projection, frames, copy } = engine;
  const { pixels, width, height } = picture, mem = wasm.memory;
  const raw = copy(pixels);
  const features = wasm.malloc(KEY_BYTES * KEY_LIMIT);
  const query = wasm.malloc(DESCRIPTOR * KEY_LIMIT), results = wasm.malloc(12 * KEY_LIMIT);
  try {
    if (!features || !query || !results) throw new Error('The lunar solver ran out of memory.');
    const n = wasm.lunar_extract(raw, width, height, features, KEY_LIMIT, mirrored ? 1 : 0);
    if (n < 16) return [];
    wasm.lunar_compact(features, n, projection, query);
    const keys = new Float32Array(mem.buffer, features, KEY_BYTES * n / 4);
    const hits = new Uint32Array(mem.buffer, results, 3 * n);
    const found = [];
    for (const atlas of frames) {
      wasm.lunar_match(query, n, atlas.descriptors, atlas.xy, atlas.n, results);
      const result = verifyFrame(pairsFrom(keys, hits, atlas, n), atlas, width, height);
      if (result) found.push({ ...result, mirrored, picture });
    }
    return found;
  } finally {
    [raw, features, query, results].forEach(wasm.free);
  }
}

function choose(candidates) {
  const sorted = candidates.sort((a, b) => b.quality - a.quality);
  const best = sorted[0];
  if (!best) return null;
  for (const candidate of sorted.slice(1)) {
    if (candidate.quality < 0.68 * best.quality) break;
    const samePlace = candidate.region.reduce((dot, value, i) => dot + value * best.region[i], 0) > Math.cos(14 * RAD);
    const sameRoll = Math.abs(ANGLE(candidate.fit.theta - best.fit.theta)) < 25;
    if (candidate.mirrored !== best.mirrored || !samePlace || !sameRoll) return null;
  }
  return best;
}

async function recognize(engine, gray, width, height) {
  const candidates = [];
  let prevScale = 0;
  for (const limit of [424, 736]) {
    const picture = downsample(gray, width, height, limit);
    if (picture.scale === prevScale) break;
    prevScale = picture.scale;
    for (const mirrored of [false, true]) {
      candidates.push(...search(engine, picture, mirrored));
      const verified = choose(candidates);
      if (verified && verified.count >= 28 && verified.spread >= 0.43 && verified.ratio >= 0.48) break;
    }
    const best = choose(candidates);
    if (best && best.count >= 28 && best.spread >= 0.43 && best.ratio >= 0.48) break;
  }
  const best = choose(candidates);
  if (!best) return null;
  const p = best.picture, f = best.fit;
  return {
    fit: {
      cx: width / 2 + ((best.mirrored ? p.width - f.cx : f.cx) - p.width / 2) / p.scale,
      cy: height / 2 + (f.cy - p.height / 2) / p.scale,
      R: f.R / p.scale, theta: ANGLE(best.mirrored ? -f.theta : f.theta),
      mirror: best.mirrored ? 1 : 0, lon0: f.lon, lat0: f.lat
    },
    phase: best.phase, count: best.count, error: best.error / p.scale, frame: best.frame
  };
}

self.onmessage = async ({ data: { gray, width, height } }) => {
  try {
    if (!(gray instanceof Uint8Array) || gray.length !== width * height ||
        Math.min(width, height) < 48 || Math.max(width, height) > 2200) {
      self.postMessage({ surface: null });
      return;
    }
    const engine = await loadEngine();
    self.postMessage({ surface: await recognize(engine, gray, width, height) });
  } catch (error) {
    self.postMessage({ error: error.message || 'The lunar surface could not be matched.' });
  }
};
