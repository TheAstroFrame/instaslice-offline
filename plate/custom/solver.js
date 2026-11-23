'use strict';

// The index and image use the same four-star fingerprint. The image supplies
// the scale and attitude; independent stars must agree before a WCS is emitted.
globalThis.InstaSliceSolver = (() => {
  const DEG = Math.PI / 180;
  const PAIRS = [[0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 1, 2],
                 [1, 2, 0, 3], [1, 3, 0, 2], [2, 3, 0, 1]];
  // Nominal field of view (long side, degrees) and the span of focal lengths each band accepts, relative to the nominal one.
  // The four-star code changes little with the assumed focal length, so three overlapping bands cover fields from about 5 to 100 degrees.
  const WIDE_BANDS = [{ field:22, range:[.50,2.20] }, { field:50, range:[.60,1.70] }, { field:80, range:[.70,1.45] }];
  // The same idea for the all-sky mid-depth index (fields of roughly 1.5 to 16 degrees).
  const MID_BANDS = [{ field:3.5, range:[.50,2.20] }, { field:8, range:[.50,2.20] }];
  // And for the narrow-field index (fields of roughly 0.5 to 2.5 degrees): the stars to G = 9.65 in small circles, for frames that no deep region covers.
  const FINE_BANDS = [{ field:1.0, range:[.50,2.20] }, { field:2.2, range:[.50,2.20] }];
  const WIDE_CODE_TOLERANCE = .006;
  const PAIR_FLAT = Int8Array.from(PAIRS.flat());
  const CONTROLS = [[.013,.010], [-.012,.014], [.009,-.016], [-.015,-.012]];
  // Twenty-four offsets on a spiral around the frame centre, at roughly 0.012-0.0195 of the longer side.
  const RING_CONTROLS = Array.from({ length:24 }, (_, i) => {
    const angle = i*2.399963, radius = .012 + .0075*((i*5)%7)/6;
    return [radius*Math.cos(angle), radius*Math.sin(angle)];
  });
  const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  const plus = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
  const minus = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
  const scale = (a, v) => [a[0]*v, a[1]*v, a[2]*v];
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const unit = a => scale(a, 1 / Math.sqrt(dot(a, a)));
  const distance2 = (a, b) => (a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2;

  // Four-star patterns of one sampling circle at a time, written the way the photograph is read. Every circle holds its brightest stars;
  // the code of each quad is computed here, not stored, so the index file only carries stars and circle lists.
  const QUARTETS = new Map();
  function quartetsOf(n) {
    if (!QUARTETS.has(n)) {
      const list = [];
      for (let m = 3; m < n; m++) for (let k = 2; k < m; k++) for (let j = 1; j < k; j++) for (let i = 0; i < j; i++) list.push(i, j, k, m);
      QUARTETS.set(n, Uint8Array.from(list));
    }
    return QUARTETS.get(n);
  }

  function buildIndex(buffer, wide = true) {
    const head = new DataView(buffer);
    const count = head.getUint32(4, true), levelCount = head.getUint32(8, true);
    if (buffer.byteLength < 20 || !count || count > 2e7 || !levelCount || levelCount > 16 ||
        buffer.byteLength < 20 + count*12 + levelCount*12) throw new Error('Incomplete InstaSlice star index.');
    const stars = new Float32Array(buffer, 20, count*3);
    const levels = [];
    let at = 20 + count*12 + levelCount*12, capacity = 0;
    for (let l = 0; l < levelCount; l++) {
      const entry = 20 + count*12 + l*12;
      const level = { radius: head.getFloat32(entry, true), depth: head.getUint32(entry+4, true), circles: head.getUint32(entry+8, true), at };
      if (level.depth < 4 || level.depth > 24 || !level.circles) throw new Error('Incomplete InstaSlice star index.');
      at += level.circles * level.depth * 4;
      capacity += level.circles * (quartetsOf(level.depth).length / 4);
      levels.push(level);
    }
    if (at !== buffer.byteLength) throw new Error('Incomplete InstaSlice star index.');
    // Quads refer to stars through a short table of the stars that appear in some circle, so the index stays 16-bit when it can.
    const slot = new Int32Array(count).fill(-1);
    const table = new Uint32Array(count);
    let used = 0;
    for (const level of levels) {
      const ids = new Uint32Array(buffer, level.at, level.circles*level.depth);
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        if (id !== 0xFFFFFFFF && id < count && slot[id] < 0) { slot[id] = used; table[used++] = id; }
      }
    }
    const pat = table.slice(0, used);
    const Slots = used <= 65535 ? Uint16Array : Uint32Array;
    const rawKeys = new Uint32Array(capacity), rawEntries = new Slots(capacity*4);
    let quads = 0;
    const p = new Float64Array(12), id4 = new Int32Array(4);
    for (const level of levels) {
      const ids = new Uint32Array(buffer, level.at, level.circles*level.depth);
      const combos = quartetsOf(level.depth);
      const lowest = (2*Math.sin(level.radius*DEG*.26))**2, highest = (2*Math.sin(level.radius*DEG*.99))**2;
      for (let c = 0; c < level.circles; c++) {
        const base = c*level.depth;
        let filled = 0;
        while (filled < level.depth && ids[base+filled] !== 0xFFFFFFFF) filled++;
        for (let q = 0; q < combos.length; q += 4) {
          if (combos[q+3] >= filled) continue;
          for (let k = 0; k < 4; k++) {
            const id = ids[base + combos[q+k]], j = id*3;
            id4[k] = id; p[k*3] = stars[j]; p[k*3+1] = stars[j+1]; p[k*3+2] = stars[j+2];
          }
          // Longest and second-longest side among the six pairs.
          let best = 0, second = 0, anchor = -1;
          for (let t = 0; t < 6; t++) {
            const A = PAIR_FLAT[t*4]*3, B = PAIR_FLAT[t*4+1]*3;
            const dx = p[A]-p[B], dy = p[A+1]-p[B+1], dz = p[A+2]-p[B+2];
            const d2 = dx*dx + dy*dy + dz*dz;
            if (d2 > best) { second = best; best = d2; anchor = t; } else if (d2 > second) second = d2;
          }
          if (anchor < 0 || second >= .991*best || best < lowest || best > highest) continue;
          let a = PAIRS[anchor][0], b = PAIRS[anchor][1], c4 = PAIRS[anchor][2], d4 = PAIRS[anchor][3];
          const ax = p[a*3], ay = p[a*3+1], az = p[a*3+2], bx = p[b*3], by = p[b*3+1], bz = p[b*3+2];
          let xx = bx-ax, xy = by-ay, xz = bz-az, norm = Math.sqrt(xx*xx + xy*xy + xz*xz);
          xx /= norm; xy /= norm; xz /= norm;
          let zx = ax+bx, zy = ay+by, zz = az+bz;
          norm = Math.sqrt(zx*zx + zy*zy + zz*zz); zx /= norm; zy /= norm; zz /= norm;
          const yx = zy*xz - zz*xy, yy = zz*xx - zx*xz, yz = zx*xy - zy*xx;
          const factor = Math.sqrt(1 - best/4) / Math.sqrt(best);
          const cx = p[c4*3], cy = p[c4*3+1], cz = p[c4*3+2], dx = p[d4*3], dy = p[d4*3+1], dz = p[d4*3+2];
          const cFactor = factor / (zx*cx + zy*cy + zz*cz), dFactor = factor / (zx*dx + zy*dy + zz*dz);
          let u = .5 + (xx*cx + xy*cy + xz*cz)*cFactor, v = (yx*cx + yy*cy + yz*cz)*cFactor;
          let r = .5 + (xx*dx + xy*dy + xz*dz)*dFactor, s = (yx*dx + yy*dy + yz*dz)*dFactor;
          if (u + r > 1) { const t = a; a = b; b = t; u = 1-u; r = 1-r; v = -v; s = -s; }
          if (u > r) { const t = c4; c4 = d4; d4 = t; let w = u; u = r; r = w; w = v; v = s; s = w; }
          if (v + s < 0) { v = -v; s = -s; }
          // The same rejection rules as fingerprint(): a catalogue quad must be one the photograph could also produce.
          if (u+r > .992 || r-u < .009 || v+s < .013 || Math.max(Math.abs(v), Math.abs(s)) < .10 ||
              u < .03 || r > .97 || (r-u)**2 + (s-v)**2 < .03**2) continue;
          rawKeys[quads] = ((Math.floor(u*32+.5) << 18) | (Math.floor((v+1)*32+.5) << 12) | (Math.floor(r*32+.5) << 6) | Math.floor((s+1)*32+.5)) >>> 0;
          const out = quads*4;
          rawEntries[out] = slot[id4[a]]; rawEntries[out+1] = slot[id4[b]]; rawEntries[out+2] = slot[id4[c4]]; rawEntries[out+3] = slot[id4[d4]];
          quads++;
        }
      }
    }
    // Two radix passes of twelve bits put the keys in order; the lookup scans bins that share the first three coordinates.
    let order = new Uint32Array(quads), spare = new Uint32Array(quads);
    for (let i = 0; i < quads; i++) order[i] = i;
    for (const shift of [0, 12]) {
      const counts = new Uint32Array(4097);
      for (let i = 0; i < quads; i++) counts[((rawKeys[order[i]] >>> shift) & 4095) + 1]++;
      for (let i = 0; i < 4096; i++) counts[i+1] += counts[i];
      for (let i = 0; i < quads; i++) { const id = order[i]; spare[counts[(rawKeys[id] >>> shift) & 4095]++] = id; }
      [order, spare] = [spare, order];
    }
    // The same quad is generated by every circle that holds its four stars: equal keys are adjacent, so repeats are dropped while copying.
    let keys = new Uint32Array(quads), entries = new Slots(quads*4);
    let kept = 0;
    for (let i = 0; i < quads; i++) {
      const id = order[i], key = rawKeys[id], e0 = rawEntries[id*4], e1 = rawEntries[id*4+1], e2 = rawEntries[id*4+2], e3 = rawEntries[id*4+3];
      let repeat = false;
      for (let back = kept-1; back >= 0 && back >= kept-24 && keys[back] === key; back--) {
        if (entries[back*4] === e0 && entries[back*4+1] === e1 && entries[back*4+2] === e2 && entries[back*4+3] === e3) { repeat = true; break; }
      }
      if (repeat) continue;
      keys[kept] = key;
      entries[kept*4] = e0; entries[kept*4+1] = e1; entries[kept*4+2] = e2; entries[kept*4+3] = e3;
      kept++;
    }
    quads = kept;
    keys = keys.slice(0, quads); entries = entries.slice(0, quads*4);
    const bins = new Uint32Array((1 << 18) + 1);
    let entry = 0;
    for (let prefix = 0; prefix < bins.length; prefix++) {
      while (entry < quads && keys[entry] >>> 6 < prefix) entry++;
      bins[prefix] = entry;
    }
    return { stars, count, keys, entries, bins, wide, pat, dense:(head.getUint32(12, true) & 1) === 1 };
  }

  function readIndex(buffer, wide = false) {
    const head = new DataView(buffer);
    if (buffer.byteLength >= 20 && head.getUint32(0) === 0x49535150) return buildIndex(buffer, true);
    if (buffer.byteLength < 16 || head.getUint32(0) !== 0x49535131) throw new Error('Invalid InstaSlice star index.');
    const count = head.getUint32(4, true);
    const quads = head.getUint32(8, true);
    if (!count || count > 65535 || !quads || buffer.byteLength !== 16 + (count + quads) * 12) {
      throw new Error('Incomplete InstaSlice star index.');
    }
    const stars = new Float32Array(buffer, 16, count * 3);
    const keys = new Uint32Array(buffer, 16 + count * 12, quads);
    const entries = new Uint16Array(buffer, 16 + count * 12 + quads * 4, quads * 4);
    // Jump straight to bins sharing the first three coordinates.
    const bins = new Uint32Array((1 << 18) + 1);
    let entry = 0;
    for (let prefix = 0; prefix < bins.length; prefix++) {
      while (entry < quads && keys[entry] >>> 6 < prefix) entry++;
      bins[prefix] = entry;
    }
    return { stars, count, keys, entries, bins, wide };
  }

  // Large saturated stars. A star that fills its pixels with the maximum value has a flat top, so the local-maximum test of detectStars keeps a
  // single corner pixel of it and the centroid test then rejects it. These are often the brightest stars of the frame, the ones a catalogue lists
  // first. They are found here as compact, round plateaus of saturated pixels on a darker surround and added to the list.
  function saturatedStars(brightest, luminance, width, height, outer, bottom, size) {
    const SAT = 250, MIN_AREA = 20, MAX_AREA = 1500, KEEP = 160;
    const total = width * height;
    let count = 0;
    for (let i = 0; i < total; i++) if (brightest[i] >= SAT) count++;
    // A frame that is mostly saturated (an overexposed shot, a bright Moon) has no such stars to find, and flooding it would be slow.
    if (count < MIN_AREA || count > .06 * total) return [];
    const seen = new Uint8Array(total), stack = new Int32Array(Math.min(total, 1 << 18));
    const found = [];
    for (let y0 = outer; y0 < bottom; y0++) for (let x0 = outer; x0 < width - outer; x0++) {
      const start = y0*width + x0;
      if (seen[start] || brightest[start] < SAT) continue;
      let top = 0, n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0, edge = false, overflow = false;
      stack[top++] = start; seen[start] = 1;
      while (top > 0) {
        const p = stack[--top], x = p % width, y = (p - x) / width;
        n++; sx += x; sy += y; sxx += x*x; sxy += x*y; syy += y*y;
        if (x <= outer || y <= outer || x >= width - outer - 1 || y >= bottom - 1) edge = true;
        if (x > 0 && !seen[p-1] && brightest[p-1] >= SAT) { if (top < stack.length) { stack[top++] = p-1; seen[p-1] = 1; } else overflow = true; }
        if (x < width-1 && !seen[p+1] && brightest[p+1] >= SAT) { if (top < stack.length) { stack[top++] = p+1; seen[p+1] = 1; } else overflow = true; }
        if (y > 0 && !seen[p-width] && brightest[p-width] >= SAT) { if (top < stack.length) { stack[top++] = p-width; seen[p-width] = 1; } else overflow = true; }
        if (y < height-1 && !seen[p+width] && brightest[p+width] >= SAT) { if (top < stack.length) { stack[top++] = p+width; seen[p+width] = 1; } else overflow = true; }
      }
      if (overflow || edge || n < MIN_AREA || n > MAX_AREA) continue;
      const cx = sx/n, cy = sy/n;
      const mxx = sxx/n - cx*cx, myy = syy/n - cy*cy, mxy = sxy/n - cx*cy;
      const spread = mxx + myy, elongation = Math.hypot(mxx - myy, 2*mxy) / Math.max(1e-6, spread);
      // A disc of area n has a variance sum of n/(2π); a ragged or hollow shape does not.
      const fill = (spread * 2 * Math.PI) / n;
      if (elongation > .5 || fill < .7 || fill > 1.4) continue;
      const radius = Math.sqrt(n / Math.PI);
      if (cx - radius - 9 < 0 || cy - radius - 9 < 0 || cx + radius + 9 >= width || cy + radius + 9 >= height) continue;
      // The surround must be darker than the saturated plateau: a star, not a patch of bright nebula or a galaxy core.
      let ring = 0, ringLum = 0;
      for (let k = 0; k < 24; k++) {
        const a = k * Math.PI / 12, rr = radius + (k & 1 ? 7 : 4);
        const q = Math.round(cy + rr*Math.sin(a)) * width + Math.round(cx + rr*Math.cos(a));
        ring += brightest[q]; ringLum += luminance[q];
      }
      ring /= 24; ringLum /= 24;
      if (ring > .85 * SAT) continue;
      const R = Math.ceil(radius) + 3, floor = ringLum;
      let flux = 0;
      for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
        if (i*i + j*j > R*R) continue;
        flux += Math.max(0, luminance[Math.round(cy + j)*width + Math.round(cx + i)] - floor);
      }
      found.push({ x:cx, y:cy, u:(cx-(width-1)/2)/size, v:(cy-(height-1)/2)/size, flux, contrast:255 - ring, elongation,
        score: flux * (1 - .72 * elongation), saturated:true, clear2:(radius + 1.5)**2 });
    }
    found.sort((a, b) => b.score - a.score);
    return found.slice(0, KEEP);
  }

  function detectStars({ width, height, rgba }, ignoreFooter = false) {
    const sumWidth = width + 1;
    const luminance = new Float32Array(width * height);
    const sum = new Float64Array(sumWidth * (height + 1));
    for (let y = 0; y < height; y++) {
      let row = 0;
      for (let x = 0; x < width; x++) {
        const pixel = y * width + x;
        const i = pixel * 4;
        const r = rgba[i], g = rgba[i+1], b = rgba[i+2];
        // Give single-channel narrowband stars some weight on coloured backgrounds.
        luminance[pixel] = .78 * (.24*r + .54*g + .22*b) + .22 * Math.max(r, g, b);
        row += luminance[pixel];
        sum[(y+1)*sumWidth+x+1] = row + sum[y*sumWidth+x+1];
      }
    }
    const areaSum = (x, y, r) => sum[(y+r+1)*sumWidth+x+r+1] - sum[(y-r)*sumWidth+x+r+1]
                                - sum[(y+r+1)*sumWidth+x-r] + sum[(y-r)*sumWidth+x-r];
    const points = [];
    const size = Math.max(width, height);
    const outer = size > 1350 ? 10 : 8;
    const bottom = Math.min(height - outer, ignoreFooter ? Math.floor(height * .89) : height);
    for (let y = outer; y < bottom; y++) for (let x = outer; x < width - outer; x++) {
      const p = y*width+x;
      const peak = luminance[p];
      if (peak < 7 || peak < luminance[p-1] || peak <= luminance[p+1] ||
          peak < luminance[p-width] || peak <= luminance[p+width] ||
          peak < luminance[p-width-1] || peak < luminance[p-width+1] ||
          peak < luminance[p+width-1] || peak < luminance[p+width+1]) continue;
      const total = areaSum(x, y, outer);
      const core = areaSum(x, y, 2);
      const background = (total - core) / ((2*outer+1)**2 - 25);
      const contrast = peak - background;
      if (contrast < 5 || core < 25 * (background + .36)) continue;
      // A horizon, building or cloud edge is brighter on one side of the window. A star sits in a level background.
      const band = (x0, y0, x1, y1) => (sum[(y1+1)*sumWidth+x1+1] - sum[y0*sumWidth+x1+1] - sum[(y1+1)*sumWidth+x0] + sum[y0*sumWidth+x0]) / ((x1-x0+1)*(y1-y0+1));
      const side = Math.max(Math.abs(band(x-outer, y-outer, x+outer, y-3) - band(x-outer, y+3, x+outer, y+outer)),
                            Math.abs(band(x-outer, y-2, x-3, y+2) - band(x+3, y-2, x+outer, y+2)));
      if (side > .9 * contrast + 3) continue;
      const halfRadius = contrast > 90 && core / 25 - background > contrast * .56 ? 5 : 3;
      const floor = background + contrast * .13;
      let flux = 0, sx = 0, sy = 0, xx = 0, xy = 0, yy = 0;
      for (let j = -halfRadius; j <= halfRadius; j++) for (let i = -halfRadius; i <= halfRadius; i++) {
        const weight = Math.max(0, luminance[p+j*width+i] - floor);
        flux += weight;
        sx += weight * i;
        sy += weight * j;
        xx += weight * i*i;
        xy += weight * i*j;
        yy += weight * j*j;
      }
      const dx = sx/flux, dy = sy/flux;
      if (Math.hypot(dx, dy) > 1.85) continue;
      const major = xx/flux - dx*dx, minor = yy/flux - dy*dy;
      const skew = xy/flux - dx*dy;
      const elongation = Math.hypot(major-minor, 2*skew) / Math.max(.1, major+minor);
      if (elongation > .66 || major+minor < .40) continue;
      const px = x+dx, py = y+dy;
      const u = (px-(width-1)/2) / size, v = (py-(height-1)/2) / size;
      points.push({ x:px, y:py, u, v, flux, contrast, elongation,
        score: flux * (1 - .72 * elongation) });
    }
    points.sort((a, b) => b.score - a.score);
    const best = collapse(points, size);
    // The saturated stars are added only if the ordinary list does not solve the frame: the plateau pass then runs once, on demand, and an
    // ordinary frame never sees it. The list is built from the same candidates, with each plateau replacing the maxima of its flat top.
    Object.defineProperty(best, 'augment', { enumerable:false, value:() => {
      const brightest = new Uint8Array(width * height);
      for (let pixel = 0, i = 0; pixel < brightest.length; pixel++, i += 4) brightest[pixel] = Math.max(rgba[i], rgba[i+1], rgba[i+2]);
      const plateaus = saturatedStars(brightest, luminance, width, height, outer, bottom, size);
      if (!plateaus.length) return null;
      const kept = points.filter(p => !plateaus.some(s => (p.x-s.x)**2 + (p.y-s.y)**2 < s.clear2));
      const merged = kept.concat(plateaus).sort((a, b) => b.score - a.score);
      return collapse(merged, size).map(p => ({ ...p }));
    } });
    return best;
  }

  // Collapse multiple maxima around bright stars and diffraction spikes.
  function collapse(sorted, size) {
    const best = [];
    const gap = Math.max(3.2, size / 420);
    for (const point of sorted) {
      if (best.some(p => (p.x-point.x)**2 + (p.y-point.y)**2 < gap*gap)) continue;
      best.push(point);
      if (best.length >= 520) break;
    }
    return best;
  }

  function basis(a, b) {
    const x = unit(minus(b, a));
    const z = unit(plus(a, b));
    return [x, cross(z, x), z];
  }

  function fingerprint(points) {
    let best = 0, second = 0, anchors;
    for (const pair of PAIRS) {
      const length2 = distance2(points[pair[0]], points[pair[1]]);
      if (length2 > best) {
        second = best;
        best = length2;
        anchors = pair;
      } else if (length2 > second) {
        second = length2;
      }
    }
    if (!anchors || second >= .991 * best) return null;
    let [a, b, c, d] = anchors;
    const [x, y, z] = basis(points[a], points[b]);
    const factor = Math.sqrt(1 - best / 4) / Math.sqrt(best);
    const cFactor = factor / dot(z, points[c]);
    const dFactor = factor / dot(z, points[d]);
    let u = .5 + dot(x, points[c]) * cFactor, v = dot(y, points[c]) * cFactor;
    let p = .5 + dot(x, points[d]) * dFactor, q = dot(y, points[d]) * dFactor;
    if (u+p > 1) {
      [a, b] = [b, a];
      [u, p, v, q] = [1-u, 1-p, -v, -q];
    }
    if (u > p) {
      [c, d] = [d, c];
      [u, p, v, q] = [p, u, q, v];
    }
    if (v+q < 0) [v, q] = [-v, -q];
    if (u+p > .992 || p-u < .009 || v+q < .013 || Math.max(Math.abs(v), Math.abs(q)) < .10 ||
        u < .03 || p > .97 || (p-u)**2+(q-v)**2 < .03**2) return null;
    return { order: [a,b,c,d], shape: [u,v+1,p,q+1], chord2:best };
  }

  function skyStar(index, id) {
    const i = id * 3;
    return [index.stars[i], index.stars[i+1], index.stars[i+2]];
  }

  // Nearest catalogue direction inside the implicit k-d tree. The search keeps
  // its own small stack, so a query allocates nothing.
  const stackLo = new Int32Array(96), stackHi = new Int32Array(96), stackAxis = new Int8Array(96);
  const stackGap = new Float64Array(96);
  function closestStar(index, x, y, z, cutoff) {
    const { stars } = index;
    let best = cutoff, id = -1, top = 1;
    stackLo[0] = 0; stackHi[0] = index.count; stackAxis[0] = 0; stackGap[0] = 0;
    while (top > 0) {
      top--;
      if (stackGap[top] >= best) continue;
      let lo = stackLo[top], hi = stackHi[top], axis = stackAxis[top];
      while (lo < hi) {
        const mid = (lo + hi) >>> 1, i = mid * 3;
        const dx = x-stars[i], dy = y-stars[i+1], dz = z-stars[i+2];
        const d2 = dx*dx + dy*dy + dz*dz;
        if (d2 < best) { best = d2; id = mid; }
        const ahead = axis === 0 ? dx : (axis === 1 ? dy : dz);
        const next = axis === 2 ? 0 : axis+1;
        if (ahead < 0) {
          stackLo[top] = mid+1; stackHi[top] = hi; stackAxis[top] = next; stackGap[top] = ahead*ahead; top++;
          hi = mid;
        } else {
          stackLo[top] = lo; stackHi[top] = mid; stackAxis[top] = next; stackGap[top] = ahead*ahead; top++;
          lo = mid + 1;
        }
        axis = next;
      }
    }
    return id;
  }

  function transform(from, to, vector, parity) {
    const u = dot(from[0], vector), v = parity*dot(from[1], vector), w = dot(from[2], vector);
    return [to[0][0]*u + to[1][0]*v + to[2][0]*w,
            to[0][1]*u + to[1][1]*v + to[2][1]*w,
            to[0][2]*u + to[1][2]*v + to[2][2]*w];
  }

  function poseFromAnchors(image, sky, focalGuess, wide, imageChord2, range = [.80, 1.26]) {
    const [a, b, c, d] = image;
    const trueChord2 = distance2(sky[0], sky[1]);
    const projected = Math.hypot(a.u-b.u, a.v-b.v);
    let focal = projected * Math.sqrt(1/trueChord2 - .25);
    if (wide) {
      if (trueChord2 < imageChord2/(range[1]*range[1]) || trueChord2 > imageChord2/(range[0]*range[0])) return null;
      const ar = a.u*a.u + a.v*a.v, br = b.u*b.u + b.v*b.v;
      const ab = a.u*b.u + a.v*b.v;
      let lo = range[0]*focalGuess, hi = range[1]*focalGuess;
      const chordAt = f => {
        const f2 = f*f;
        return 2-2*(ab+f2)/Math.sqrt((ar+f2)*(br+f2));
      };
      if (chordAt(lo) < trueChord2 || chordAt(hi) > trueChord2) return null;
      for (let i = 0; i < 12; i++) {
        focal = (lo+hi)/2;
        if (chordAt(focal) > trueChord2) lo = focal;
        else hi = focal;
      }
    } else if (focal < 8) {
      return null;
    }
    const ca = unit([a.u,a.v,focal]), cb = unit([b.u,b.v,focal]);
    const camera = basis(ca, cb);
    const world = basis(sky[0], sky[1]);
    const imageSide = dot(camera[1], plus(unit([c.u,c.v,focal]), unit([d.u,d.v,focal])));
    const skySide = dot(world[1], plus(sky[2], sky[3]));
    const parity = Math.sign(imageSide * skySide);
    return {
      pole: transform(camera, world, [0,0,1], parity),
      x: transform(camera, world, [1,0,0], parity),
      y: transform(camera, world, [0,1,0], parity),
      focal,
      originX: 0,
      originY: 0,
      a: 1, b: 0, c: 0, d: 1
    };
  }

  function project(model, sky) {
    const denominator = dot(model.pole, sky);
    if (denominator <= 0) return [Infinity, Infinity];
    const x = model.focal * dot(model.x, sky) / denominator - model.originX;
    const y = model.focal * dot(model.y, sky) / denominator - model.originY;
    const det = model.a*model.d - model.b*model.c;
    return [(model.d*x - model.b*y)/det, (-model.c*x + model.a*y)/det];
  }

  function error2(model, point, sky) {
    const [u, v] = project(model, sky);
    const corrected = warpPoint(model, point);
    return (u-corrected.u)**2 + (v-corrected.v)**2;
  }

  function warpTerms(u, v) {
    const uu = u*u, uv = u*v, vv = v*v;
    return [uu,uv,vv,uu*u,uu*v,uv*v,vv*v];
  }

  function warpPoint(model, point) {
    if (!model.warp) return point;
    const { u, v } = point;
    const terms = warpTerms(u-model.warp.u,v-model.warp.v);
    return { u:u+model.warp.x.reduce((s,c,i) => s+c*terms[i],0),
             v:v+model.warp.y.reduce((s,c,i) => s+c*terms[i],0) };
  }

  function findMatches(index, model, points, tolerance) {
    const accepted = new Map();
    const tolerance2 = tolerance*tolerance;
    const { pole, x:mx, y:my, focal, originX, originY, a, b, c, d } = model;
    const chord2 = (1.22*tolerance/focal)**2;
    const det = a*d - b*c;
    const { stars } = index;
    for (const point of points) {
      const p = warpPoint(model, point);
      const u = (a*p.u + b*p.v + originX)/focal;
      const v = (c*p.u + d*p.v + originY)/focal;
      let ax = pole[0] + mx[0]*u + my[0]*v;
      let ay = pole[1] + mx[1]*u + my[1]*v;
      let az = pole[2] + mx[2]*u + my[2]*v;
      const norm = 1 / Math.sqrt(ax*ax + ay*ay + az*az);
      ax *= norm; ay *= norm; az *= norm;
      const id = closestStar(index, ax, ay, az, chord2);
      if (id < 0) continue;
      const i = id*3, sx = stars[i], sy = stars[i+1], sz = stars[i+2];
      const denominator = pole[0]*sx + pole[1]*sy + pole[2]*sz;
      if (denominator <= 0) continue;
      const px = focal*(mx[0]*sx + mx[1]*sy + mx[2]*sz)/denominator - originX;
      const py = focal*(my[0]*sx + my[1]*sy + my[2]*sz)/denominator - originY;
      const imageU = (d*px - b*py)/det, imageV = (-c*px + a*py)/det;
      const residual = (imageU-p.u)**2 + (imageV-p.v)**2;
      if (residual <= tolerance2 && residual < (accepted.get(id)?.residual ?? Infinity)) {
        accepted.set(id, { id, point, sky:[sx,sy,sz], residual });
      }
    }
    return [...accepted.values()];
  }

  // A cheap first look at a hypothesis: do at least two of the brightest detections land on distinct catalogue stars? A true pose
  // reproduces most of them; a chance pose almost none, and it is rejected without building any match list.
  const SEEN = new Int32Array(16);
  function countNear(index, model, points, limit, tolerance) {
    const tolerance2 = tolerance*tolerance;
    const { pole, x:mx, y:my, focal, originX, originY, a, b, c, d } = model;
    const chord2 = (1.22*tolerance/focal)**2;
    const det = a*d - b*c;
    const { stars } = index;
    const end = Math.min(limit, points.length, SEEN.length);
    let found = 0;
    for (let k = 0; k < end; k++) {
      const p = model.warp ? warpPoint(model, points[k]) : points[k];
      const u = (a*p.u + b*p.v + originX)/focal;
      const v = (c*p.u + d*p.v + originY)/focal;
      let ax = pole[0] + mx[0]*u + my[0]*v;
      let ay = pole[1] + mx[1]*u + my[1]*v;
      let az = pole[2] + mx[2]*u + my[2]*v;
      const norm = 1 / Math.sqrt(ax*ax + ay*ay + az*az);
      ax *= norm; ay *= norm; az *= norm;
      const id = closestStar(index, ax, ay, az, chord2);
      if (id < 0) continue;
      const i = id*3, sx = stars[i], sy = stars[i+1], sz = stars[i+2];
      const denominator = pole[0]*sx + pole[1]*sy + pole[2]*sz;
      if (denominator <= 0) continue;
      const px = focal*(mx[0]*sx + mx[1]*sy + mx[2]*sz)/denominator - originX;
      const py = focal*(my[0]*sx + my[1]*sy + my[2]*sz)/denominator - originY;
      const imageU = (d*px - b*py)/det, imageV = (-c*px + a*py)/det;
      if ((imageU-p.u)**2 + (imageV-p.v)**2 > tolerance2) continue;
      let repeat = false;
      for (let j = 0; j < found; j++) if (SEEN[j] === id) { repeat = true; break; }
      if (!repeat) SEEN[found++] = id;
    }
    return found;
  }

  function leastSquares(rows, values) {
    const n = rows[0].length;
    const equations = Array.from({ length:n }, () => new Float64Array(n+1));
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      for (let j = 0; j < n; j++) {
        for (let k = 0; k < n; k++) equations[j][k] += row[j]*row[k];
        equations[j][n] += row[j]*values[i];
      }
    }
    for (let i = 0; i < n; i++) {
      let pivot = i;
      for (let j = i+1; j < n; j++) {
        if (Math.abs(equations[j][i]) > Math.abs(equations[pivot][i])) pivot = j;
      }
      if (Math.abs(equations[pivot][i]) < 1e-10) return null;
      [equations[i], equations[pivot]] = [equations[pivot], equations[i]];
      const factor = equations[i][i];
      for (let k = i; k <= n; k++) equations[i][k] /= factor;
      for (let j = 0; j < n; j++) if (j !== i) {
        const multiplier = equations[j][i];
        for (let k = i; k <= n; k++) equations[j][k] -= equations[i][k] * multiplier;
      }
    }
    return equations.map(row => row[n]);
  }

  function fitAffine(model, matches) {
    const rows = [], alongX = [], alongY = [];
    for (const { point, sky } of matches) {
      const t = model.focal / dot(model.pole, sky);
      rows.push([point.u, point.v, 1]);
      alongX.push(t * dot(model.x, sky));
      alongY.push(t * dot(model.y, sky));
    }
    const x = leastSquares(rows, alongX), y = leastSquares(rows, alongY);
    if (!x || !y) return null;
    const [a,b,originX] = x, [c,d,originY] = y;
    if (Math.abs(a*d-b*c-1) > .16 || Math.abs(a-d) > .12 || Math.abs(b+c) > .12) return null;
    return { ...model, a, b, c, d, originX, originY };
  }

  function hasSkyCoverage(matches, size, width, height) {
    const occupied = new Set();
    for (const {point} of matches) {
      const col = Math.min(3, Math.floor(4*point.x/width));
      const row = Math.min(3, Math.floor(4*point.y/height));
      occupied.add(row*4+col);
    }
    const xs = matches.map(({point}) => point.u);
    const ys = matches.map(({point}) => point.v);
    return occupied.size >= 5 && Math.max(...xs)-Math.min(...xs) > .29 * width/size &&
           Math.max(...ys)-Math.min(...ys) > .29 * height/size;
  }

  function refineDistortion(model, matches, width, height) {
    if (matches.length < 42) return model;
    const [u,v] = project(model, model.pole);
    const rows = [], dx = [], dy = [], check = [];
    for (let i = 0; i < matches.length; i++) {
      const { point, sky } = matches[i];
      if (i % 4 === 0) {
        check.push(matches[i]);
        continue;
      }
      const [x,y] = project(model, sky);
      rows.push(warpTerms(point.u-u,point.v-v));
      dx.push(x-point.u);
      dy.push(y-point.v);
    }
    const x = leastSquares(rows,dx), y = leastSquares(rows,dy);
    if (!x || !y) return model;
    const proposal = { ...model, warp:{ u,v,x,y } };
    const size = Math.max(width,height);
    // Bound extrapolation and confirm improvement on stars outside the fit.
    for (const cornerX of [-width/(2*size),0,width/(2*size)]) {
      for (const cornerY of [-height/(2*size),0,height/(2*size)]) {
        const p = warpPoint(proposal, {u:cornerX,v:cornerY});
        if (Math.hypot(p.u-cornerX,p.v-cornerY) > .025) return model;
      }
    }
    const error = (candidate) => check.reduce((sum,{point,sky}) => sum+error2(candidate,point,sky),0);
    return error(proposal) < .74 * error(model) ? proposal : model;
  }


  // A wide frame is rarely a perfect tangent projection. The pose above is fitted to the stars the search first finds, and on a frame of tens of degrees
  // the rest of the frame can be several pixels off (more at the edges), enough to move a nebula's marker away from its glow; the stars there lie too far
  // from their predicted places to count as matches, so the check above does not see it. When the star list of the labels is at hand, every bright star
  // of the frame is paired with the strongest detection near its predicted place, a pose and a cubic correction are fitted to the pairs that agree, and the
  // pairing is repeated at a growing and then a shrinking distance. The result replaces the pose only when it places clearly more stars on their detections.
  const POLISH_FIELD = 20, POLISH_MAGNITUDE = 6.4;
  const POLISH_VOTES = [.040, .030, .022, .016, .012];
  const POLISH_REACH = [.0094, .0070, .0055, .0045, .0040, .0035, .0035, .0030];
  function fitWarp(model, list, width, height, terms = 7, limit = .07) {
    const [u,v] = project(model, model.pole);
    const rows = [], dx = [], dy = [];
    for (const { point, sky } of list) {
      const [x,y] = project(model, sky);
      rows.push(warpTerms(point.u-u,point.v-v).slice(0,terms));
      dx.push(x-point.u);
      dy.push(y-point.v);
    }
    const fitted = [leastSquares(rows,dx), leastSquares(rows,dy)];
    if (!fitted[0] || !fitted[1]) return null;
    const [x,y] = fitted.map(c => c.concat(new Array(7-terms).fill(0)));
    const proposal = { ...model, warp:{ u,v,x,y } };
    const size = Math.max(width,height);
    for (const cornerX of [-width/(2*size),0,width/(2*size)]) {
      for (const cornerY of [-height/(2*size),0,height/(2*size)]) {
        const p = warpPoint(proposal, {u:cornerX,v:cornerY});
        if (Math.hypot(p.u-cornerX,p.v-cornerY) > limit) return null;
      }
    }
    return proposal;
  }

  // A fit to pairs, some of which are chance neighbours: the pairs that stay far from the fit are dropped and the fit repeated.
  function robustWarp(flat, list, width, height) {
    let keep = list, best = null;
    for (let turn = 0; turn < 4; turn++) {
      if (keep.length < 30) break;
      // The pose and the correction are fitted in turn: the pose to the corrected positions, the correction to what the pose leaves.
      let warped = null, affine = fitAffine(flat, keep);
      for (let round = 0; affine && round < 4; round++) {
        const next = fitWarp(affine, keep, width, height);
        if (!next) { warped = round ? warped : null; break; }
        warped = next;
        affine = fitAffine(flat, keep.map(({point,sky}) => ({ point:warpPoint(warped, point), sky })));
      }
      if (!warped) break;
      best = warped;
      const all = list.map(pair => Math.sqrt(error2(warped, pair.point, pair.sky)));
      const sorted = keep.map(pair => Math.sqrt(error2(warped, pair.point, pair.sky))).sort((p,q) => p-q);
      const limit = Math.max(2.5*sorted[sorted.length >> 1], .0005);
      keep = list.filter((_, i) => all[i] <= limit);
    }
    return best && { model:best, kept:keep };
  }


  // Peaks of the picture for the second fit: the bright stars of a phone photograph are saturated blobs, which the star search above sets aside as it
  // looks for sharp points, and these are the ones the bright-star list names.
  function brightPeaks({ width, height, rgba }, limit = 700) {
    const sumWidth = width + 1;
    const luminance = new Float32Array(width * height);
    const sum = new Float64Array(sumWidth * (height + 1));
    for (let y = 0; y < height; y++) {
      let row = 0;
      for (let x = 0; x < width; x++) {
        const pixel = y * width + x, i = pixel * 4;
        luminance[pixel] = (rgba[i] + rgba[i+1] + rgba[i+2]) / 3;
        row += luminance[pixel];
        sum[(y+1)*sumWidth+x+1] = row + sum[y*sumWidth+x+1];
      }
    }
    const areaSum = (x, y, r) => sum[(y+r+1)*sumWidth+x+r+1] - sum[(y-r)*sumWidth+x+r+1] - sum[(y+r+1)*sumWidth+x-r] + sum[(y-r)*sumWidth+x-r];
    const margin = 10, strength = new Float32Array(width * height);
    for (let y = margin; y < height - margin; y++) for (let x = margin; x < width - margin; x++) {
      strength[y*width+x] = areaSum(x, y, 1)/9 - areaSum(x, y, 9)/361;
    }
    const size = Math.max(width, height), found = [];
    for (let y = margin + 3; y < height - margin - 3; y++) for (let x = margin + 3; x < width - margin - 3; x++) {
      const p = y*width+x, value = strength[p];
      if (value < 25) continue;
      let top = true;
      for (let j = -2; j <= 2 && top; j++) for (let i = -2; i <= 2; i++) {
        if ((i || j) && strength[p + j*width + i] > value) { top = false; break; }
      }
      if (!top) continue;
      let weight = 0, sx = 0, sy = 0;
      for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
        const w = Math.max(0, strength[p + j*width + i]);
        weight += w; sx += w*i; sy += w*j;
      }
      const px = x + sx/weight, py = y + sy/weight;
      found.push({ x:px, y:py, u:(px-(width-1)/2)/size, v:(py-(height-1)/2)/size, flux:value });
    }
    found.sort((p, q) => q.flux - p.flux);
    return found.slice(0, limit).map((point, i) => ({ ...point, rank:i }));
  }


  // Each part of the frame holds a handful of bright stars that all moved by about the same amount from where the first pose put them. The offset
  // that most of them agree on is found in every part; it stays reliable where the first pose is off by tens of pixels and nearest-star pairing is not.
  function voteBrightStars(model, stars, detections, width, height, reach, pairs) {
    const size = Math.max(width,height), halfU = width/(2*size) + reach, halfV = height/(2*size) + reach;
    const catalogue = [];
    for (const sky of stars) {
      const [u,v] = project(model, sky);
      if (Math.abs(u) <= halfU && Math.abs(v) <= halfV) catalogue.push({ u, v, sky });
    }
    const cell = reach, rowsOf = Math.ceil(2*halfV/cell) + 2;
    const buckets = new Map();
    for (const star of catalogue) {
      const key = Math.floor((star.u+halfU)/cell) * rowsOf + Math.floor((star.v+halfV)/cell);
      (buckets.get(key) || buckets.set(key, []).get(key)).push(star);
    }
    const corrected = detections.map(point => ({ point, ...warpPoint(model, point) }));
    const binSize = reach/10, bins = 20, step = .17, half = .17;
    for (let cu = -width/(2*size) + step/2; cu < width/(2*size) + step/2; cu += step) {
      for (let cv = -height/(2*size) + step/2; cv < height/(2*size) + step/2; cv += step) {
        const here = corrected.filter(d => Math.abs(d.u-cu) <= half && Math.abs(d.v-cv) <= half);
        if (here.length < 5) continue;
        const grid = new Float32Array(bins*bins), members = [];
        for (const d of here) {
          const bu = Math.floor((d.u+halfU)/cell), bv = Math.floor((d.v+halfV)/cell);
          for (let i = bu-1; i <= bu+1; i++) for (let j = bv-1; j <= bv+1; j++) {
            const list = buckets.get(i*rowsOf + j);
            if (!list) continue;
            for (const star of list) {
              const du = d.u - star.u, dv = d.v - star.v;
              if (Math.abs(du) >= reach || Math.abs(dv) >= reach) continue;
              const bi = Math.floor((du+reach)/binSize), bj = Math.floor((dv+reach)/binSize);
              grid[bi*bins+bj]++;
              members.push([bi, bj, d, star]);
            }
          }
        }
        let best = -1, bestIndex = -1, total = 0;
        for (let i = 1; i < bins-1; i++) for (let j = 1; j < bins-1; j++) {
          let sum = 0;
          for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) sum += grid[(i+a)*bins+j+b];
          total += sum;
          if (sum > best) { best = sum; bestIndex = i*bins+j; }
        }
        const noise = total / ((bins-2)*(bins-2));
        if (best < 5 || best - noise < 4*Math.sqrt(noise) + 1) continue;
        const bi = Math.floor(bestIndex/bins), bj = bestIndex % bins;
        for (const [i, j, d, star] of members) {
          if (Math.abs(i-bi) > 1 || Math.abs(j-bj) > 1) continue;
          const key = star.sky.join();
          const miss = Math.hypot(d.u-star.u, d.v-star.v), kept = pairs.get(key);
          if (!kept || miss < kept.miss) pairs.set(key, { point:d.point, sky:star.sky, miss });
        }
      }
    }
  }

  function pairBrightStars(model, stars, detections, width, height, reach) {
    const size = Math.max(width,height), halfU = width/(2*size) + reach, halfV = height/(2*size) + reach;
    const corrected = detections.map(point => ({ point, ...warpPoint(model, point) }));
    const cell = reach, rowsOf = Math.ceil(2*halfV/cell) + 2;
    const buckets = new Map();
    for (const d of corrected) {
      const key = Math.floor((d.u+halfU)/cell) * rowsOf + Math.floor((d.v+halfV)/cell);
      (buckets.get(key) || buckets.set(key, []).get(key)).push(d);
    }
    const taken = new Map();
    for (const sky of stars) {
      const [u,v] = project(model, sky);
      if (!(Math.abs(u) <= halfU && Math.abs(v) <= halfV)) continue;
      const bu = Math.floor((u+halfU)/cell), bv = Math.floor((v+halfV)/cell);
      let best = null, bestScore = 0;
      for (let i = bu-1; i <= bu+1; i++) for (let j = bv-1; j <= bv+1; j++) {
        const list = buckets.get(i*rowsOf + j);
        if (!list) continue;
        for (const d of list) {
          const distance = Math.hypot(d.u-u, d.v-v);
          if (distance >= reach) continue;
          const score = d.point.flux / (1 + 2*distance/reach);
          if (score > bestScore) { bestScore = score; best = { point:d.point, sky, miss:distance }; }
        }
      }
      if (!best) continue;
      const held = taken.get(best.point);
      if (!held || best.miss < held.miss) taken.set(best.point, best);
    }
    return [...taken.values()];
  }

  function polishWide(result, image, brightRows) {
    const { width, height } = image;
    const model = result.model;
    if (!model || result.verified_height || result.stats.field_deg < POLISH_FIELD) return result;
    const size = Math.max(width,height);
    const stars = [], seen = new Set();
    for (const row of brightRows) {
      const [, , , ra, dec, mag] = row;
      if (!(mag <= POLISH_MAGNITUDE) || !Number.isFinite(ra) || !Number.isFinite(dec)) continue;
      const key = ra.toFixed(3) + ',' + dec.toFixed(3);
      if (seen.has(key)) continue;
      seen.add(key);
      const a = ra*DEG, d = dec*DEG;
      stars.push([Math.cos(d)*Math.cos(a), Math.cos(d)*Math.sin(a), Math.sin(d)]);
    }
    const detections = brightPeaks(image);
    const flat = { ...model };
    delete flat.warp;
    const close = (candidate, reach) => pairBrightStars(candidate, stars, detections, width, height, reach)
      .filter(({point,sky}) => Math.sqrt(error2(candidate, point, sky)) <= reach).length;
    const before = close(model, 2.6/size);
    let current = flat, fit = null;
    const voted = new Map();
    for (const reach of POLISH_VOTES) {
      voteBrightStars(current, stars, detections, width, height, reach, voted);
      if (voted.size < 30) return result;
      fit = robustWarp(flat, [...voted.values()], width, height);
      if (!fit) return result;
      current = fit.model;
    }
    for (const reach of POLISH_REACH) {
      const pairs = pairBrightStars(current, stars, detections, width, height, reach);
      if (pairs.length < 40) return result;
      fit = robustWarp(flat, pairs, width, height);
      if (!fit) return result;
      current = fit.model;
    }
    const final = pairBrightStars(current, stars, detections, width, height, 2.6/size)
      .filter(({point,sky}) => Math.sqrt(error2(current, point, sky)) <= 2.6/size);
    if (final.length < 1.15*before + 5) return result;
    const rms = Math.sqrt(final.reduce((sum, {point,sky}) => sum + error2(current, point, sky), 0)/final.length)*size;
    const out = { ...result, header: headerFor(current, width, height),
      matches: final.map(({point,sky}) => ({ x:point.x, y:point.y, rank:point.rank, sky })),
      stats: { ...result.stats, matches:final.length, rms_px:rms, distortion_refined:true, polished:true } };
    Object.defineProperty(out, 'model', { value:current });
    return out;
  }

  function headerFor(model, width, height) {
    const { pole, x, y, a, b, c, d, focal } = model;
    const east = unit([-pole[1], pole[0], 0]);
    const north = cross(pole, east);
    const [centerU, centerV] = project(model, pole);
    const size = Math.max(width, height);
    const angle = 1 / (focal * size * DEG);
    const deltaX = plus(scale(x,a),scale(y,c));
    const deltaY = plus(scale(x,b),scale(y,d));
    const header = { CTYPE1:'RA---TAN', CTYPE2:'DEC--TAN', CUNIT1:'deg', CUNIT2:'deg', RADESYS:'ICRS',
      IMAGEW:width, IMAGEH:height,
      CRVAL1:(Math.atan2(pole[1],pole[0])/DEG+360)%360,
      CRVAL2:Math.asin(Math.max(-1, Math.min(1, pole[2])))/DEG,
      // FITS pixel centres start at 1, and the second axis increases upwards.
      CRPIX1:(width+1)/2 + centerU*size, CRPIX2:(height+1)/2 - centerV*size,
      CD1_1:dot(deltaX,east)*angle, CD1_2:-dot(deltaY,east)*angle,
      CD2_1:dot(deltaX,north)*angle, CD2_2:-dot(deltaY,north)*angle };
    if (model.warp) {
      header.CTYPE1 = 'RA---TAN-SIP';
      header.CTYPE2 = 'DEC--TAN-SIP';
      header.A_ORDER = header.B_ORDER = 3;
      const powers = [[2,0],[1,1],[0,2],[3,0],[2,1],[1,2],[0,3]];
      powers.forEach(([i,j], k) => {
        // Camera y increases downwards, whereas FITS and SIP use upward y.
        const coefficientScale = (-1)**j / size**(i+j-1);
        header[`A_${i}_${j}`] = model.warp.x[k]*coefficientScale;
        header[`B_${i}_${j}`] = -model.warp.y[k]*coefficientScale;
      });
    }
    return header;
  }

  function verify(index, model, seedPoints, seedSky, points, width, height) {
    const size = Math.max(width, height);
    // The all-sky mid-depth index is dense (about eight catalogue stars per square degree), so chance coincidences are common at the loose
    // tolerance that suits wide frames; its fields are small enough for a tighter first test.
    const firstTolerance = index.dense ? .0045 : (index.wide ? .0080 : Math.max(2.1/size, .0023));
    if (!model || error2(model,seedPoints[2],seedSky[2]) > firstTolerance**2 ||
                  error2(model,seedPoints[3],seedSky[3]) > firstTolerance**2) return null;
    if (index.wide) {
      const seeds = seedPoints.map((point,i) => ({point,sky:seedSky[i]}));
      model = fitAffine(model, seeds) || model;
    }
    if (countNear(index, model, points, 12, firstTolerance) < 2) return null;
    let matches = findMatches(index, model, points.slice(0, 46), firstTolerance);
    if (matches.length < 8) return null;
    // A chance pose that picked up eight stars does not survive a fit to them: a true pose gets closer and keeps its matches at half the tolerance.
    const trial = fitAffine(model, matches);
    if (!trial || findMatches(index, trial, points.slice(0, 46), firstTolerance*.5).length < 11) return null;
    const sample = points.slice(0, index.wide ? 460 : 290);
    // The pose is refined on the brightest detections: faint ones are often not in the catalogue and, in a sparse frame, would dominate the fit.
    const brightest = list => { const bright = list.filter(({point}) => point.rank < 100); return bright.length >= 8 ? bright : list; };
    matches = findMatches(index, model, sample, firstTolerance);
    if (matches.length < 9 || !hasSkyCoverage(matches,size,width,height)) return null;
    model = fitAffine(model, brightest(matches));
    if (!model) return null;
    matches = findMatches(index, model, sample, firstTolerance*.74);
    if (matches.length < 9) return null;
    model = fitAffine(model, brightest(matches));
    if (!model) return null;
    if (index.wide) model = refineDistortion(model,matches,width,height);
    const finalTolerance = index.wide ? .0025 : firstTolerance*.50;
    matches = findMatches(index, model, sample, finalTolerance);
    if (matches.length < 9) return null;
    const seed = new Set(seedPoints);
    const independentIn = list => list.filter(({point}) => !seed.has(point)).length;
    // Adjacent, deliberately offset projections estimate the local rate of chance coincidences, including crowded catalogue fields.
    const chance = (offsets, subset) => offsets.reduce((sum,[dx,dy]) => sum +
      findMatches(index, { ...model, originX:model.originX+dx, originY:model.originY+dy }, subset, finalTolerance).length, 0);
    const bound = (independent, expected) => independent - expected + independent * Math.log(expected/independent);
    let accepted = null;
    const independent = independentIn(matches);
    if (matches.length >= 15 && independent >= 12 && hasSkyCoverage(matches,size,width,height)) {
      // One offset projection first: a pose that already finds half as many stars at a shifted position cannot pass the test below.
      const first = chance(CONTROLS.slice(0, 1), sample);
      if (first*2 > independent) return null;
      const expected = (first + chance(CONTROLS.slice(1), sample) + 5) / CONTROLS.length;
      if (independent > expected && bound(independent, expected) <= -19) accepted = matches;
    }
    // A sparse frame holds few real stars among many faint detections, which dilutes the test above. The same test is repeated over only the
    // brightest detections, with stricter evidence and twelve offset projections.
    if (!accepted) {
      for (const K of [40, 110]) {
        if (sample.length <= K) break;
        const kept = matches.filter(({point}) => point.rank < K);
        const keptIndependent = independentIn(kept);
        if (kept.length < 10 || keptIndependent < 8 || !hasSkyCoverage(kept,size,width,height)) continue;
        const subset = sample.slice(0, K);
        // A sparse frame has few chance coincidences, so many offset projections give a tight estimate of their rate.
        const first = chance(RING_CONTROLS, subset);
        if (bound(keptIndependent, (first+1)/RING_CONTROLS.length) > -21) continue;
        accepted = kept;
        break;
      }
    }
    if (!accepted) return null;
    matches = accepted;
    const rms = Math.sqrt(matches.reduce((sum, item) => sum + item.residual, 0)/matches.length)*size;
    const out = { header: headerFor(model,width,height), matches: matches.map(({point,sky}) => ({ x:point.x, y:point.y, rank:point.rank, sky })), stats: { matches:matches.length, rms_px:rms,
      field_deg:2*Math.atan(.5/model.focal)/DEG, custom_solver:true, wide_field:index.wide,
      distortion_refined:!!model.warp } };
    Object.defineProperty(out, 'model', { value:model });
    return out;
  }

  function lookup(index, fingerprint, tolerance, visit) {
    const { shape } = fingerprint;
    const min = shape.map(value => Math.max(0, Math.floor((value-tolerance)*32+.5)));
    const max = shape.map(value => Math.min(63, Math.floor((value+tolerance)*32+.5)));
    for (let a=min[0]; a<=max[0]; a++) for (let b=min[1]; b<=max[1]; b++) for (let c=min[2]; c<=max[2]; c++) {
      const prefix = (a<<12) | (b<<6) | c;
      const lo = (prefix<<6) | min[3], hi = (prefix<<6) | max[3];
      for (let i=index.bins[prefix], end=index.bins[prefix+1]; i<end && index.keys[i]<=hi; i++) {
        if (index.keys[i] < lo) continue;
        const result = visit(i*4);
        if (result) return result;
      }
    }
    return null;
  }

  function findField(index, ranked, points, width, height, focal, depth, skip, diagnostics, deadline, range = [.80, 1.26], codeTolerance = 0, tick = null) {
    const selected = ranked.slice(0, depth);
    const rays = selected.map(({u,v}) => unit([u,v,focal]));
    const minBaseline = index.wide ? .19 : .17;
    const tolerance = codeTolerance || (index.wide ? WIDE_CODE_TOLERANCE : .010);
    const { entries, pat } = index;
    // A procedural index keeps 16-bit slots into a table of pattern stars; the classic index stores star numbers directly.
    const starOf = pat ? slot => pat[slot] : slot => slot;
    const first = Math.max(3,skip);
    // The search visits C(m+1,4) quads once the fourth star reaches rank m, so progress is measured in quads, not in ranks.
    const choose4 = n => n*(n-1)*(n-2)*(n-3)/24;
    const span = choose4(selected.length) - choose4(first) || 1;
    for (let m=first; m<selected.length; m++) {
      if (performance.now() > deadline) return null;
      if (tick) tick((choose4(m) - choose4(first)) / span);
      for (let k=2; k<m; k++) for (let j=1; j<k; j++) for (let i=0; i<j; i++) {
        const indices = [i,j,k,m];
        const fingerprinted = fingerprint(indices.map(id => rays[id]));
        if (!fingerprinted) continue;
        const stars = fingerprinted.order.map(order => selected[indices[order]]);
        if (Math.hypot(stars[0].u-stars[1].u, stars[0].v-stars[1].v) < minBaseline) continue;
        diagnostics.quads++;
        const result = lookup(index, fingerprinted, tolerance, entry => {
          diagnostics.hypotheses++;
          if (index.wide) {
            const s = index.stars, p = starOf(entries[entry])*3, q = starOf(entries[entry+1])*3;
            const chord = (s[p]-s[q])**2 + (s[p+1]-s[q+1])**2 + (s[p+2]-s[q+2])**2;
            if (chord < fingerprinted.chord2/(range[1]*range[1]) || chord > fingerprinted.chord2/(range[0]*range[0])) return null;
          }
          const sky = [skyStar(index,starOf(entries[entry])), skyStar(index,starOf(entries[entry+1])),
                       skyStar(index,starOf(entries[entry+2])), skyStar(index,starOf(entries[entry+3]))];
          const model = poseFromAnchors(stars,sky,focal,index.wide,fingerprinted.chord2,range);
          return verify(index,model,stars,sky,points,width,height);
        });
        if (result) return result;
      }
    }
    return null;
  }

  function balance(points, width, height) {
    const cells = new Map();
    for (const point of points) {
      const cell = 5*Math.floor(5*point.y/height) + Math.floor(5*point.x/width);
      const count = cells.get(cell) || 0;
      cells.set(cell,count+1);
      point.balanced = point.score / (1 + count*.63);
    }
    return points.slice().sort((a,b) => b.balanced-a.balanced);
  }

  function rankByContrast(points) {
    return points.map(point => ({ point, score:point.score**.52*point.contrast }))
      .sort((a,b) => b.score-a.score).map(item => item.point);
  }

  // Iterative deepening: every index is searched with the brightest few stars first, then with more. A frame that has a clear match among its
  // brightest stars is solved in milliseconds whichever index holds the answer; only a hard frame pays for the full search. A search that
  // continues from a shallower one skips the quads it has already tried, so deepening repeats no work.
  async function solveCore(image, loadIndex, report_ = () => {}, options = {}) {
    const { width, height } = image;
    // The bar only ever moves forward, also while the saturated-star search repeats the shallow depths.
    let reached = 0;
    const onProgress = (value, total) => { if (value >= reached) { reached = value; report_(value, total); } };
    onProgress(.3, 12);
    const points = detectStars(image, options.ignoreFooter);
    points.forEach((point,i) => { point.rank = i; });
    const diagnostics = { stars:points.length, quads:0, hypotheses:0, stages:{} };
    const began = performance.now();
    let lapAt = began;
    const lap = name => { const now = performance.now(); diagnostics.stages[name] = (diagnostics.stages[name] || 0) + Math.round(now - lapAt); lapAt = now; };
    const report = result => {
      lap('last');
      diagnostics.total_ms = Math.round(performance.now() - began);
      if (!result) return { diagnostics };
      const out = { ...result, stats:{ ...result.stats, ...diagnostics } };
      if (result.model) Object.defineProperty(out, 'model', { value:result.model });
      Object.defineProperty(out, 'points', { value:points });
      return out;
    };
    if (points.length < 12) return { ...report(), sparse:true };
    const deadline = performance.now() + (options.timeLimit ?? 12_000);
    const ranks = balance(points,width,height);
    const sharp = rankByContrast(points);
    onProgress(1, 12);
    // A search reports its real progress: it covers its share of the stage, so the bar advances smoothly and never moves backwards.
    const tickOf = (from, to, parts, part) => fraction => onProgress(from + (to-from)*(part+Math.min(1,fraction))/parts, 12);
    lap('stars');
    // Frames that already hold a scale (the fields cut from a wide frame) go straight to the bright all-sky bands.
    const wideOnly = options.wideOnly === true;
    const wideBands = options.bands || WIDE_BANDS, midBands = options.midBands || MID_BANDS, fineBands = options.fineBands || FINE_BANDS;
    const opened = {};
    const need = async key => {
      if (!(key in opened)) { opened[key] = await loadIndex(key); lap('load_' + key); }
      return opened[key];
    };
    // The deep-sky fields are held in two packs (a pack holds at most 65,535 stars): the first, then the added regions, which are optional.
    const regionalJob = (ranked, depth, skip, set = points) => async tick => {
      const index = await need('deep');
      const found = findField(index,ranked,set,width,height,160,depth,skip,diagnostics,deadline,undefined,options.regionalTol||0,tick);
      if (found || options.regions === false) return found;
      const added = await need('regions');
      return added ? findField(added,ranked,set,width,height,160,depth,skip,diagnostics,deadline,undefined,options.regionalTol||0,tick) : null;
    };
    const bandJob = (key, ranked, band, depth, skip, set = points, w = width, h = height) => async tick => {
      const index = await need(key);
      if (!index) return null;
      return findField(index,ranked,set,w,h,.5/Math.tan(band.field*DEG/2),depth,skip,diagnostics,deadline,band.range,options.wideTol||0,tick);
    };
    const run = async (name, from, to, jobs) => {
      for (let i = 0; i < jobs.length; i++) {
        if (performance.now() > deadline) break;
        const result = await jobs[i](tickOf(from,to,jobs.length,i));
        lap(name);
        if (result) return result;
      }
      return null;
    };
    const wideRanks = [sharp, ranks, points];
    const bandJobs = (key, bands, depth, skip, view = null) => {
      const jobs = [], rankings = view ? [view.sharp, view.ranks, view.points] : wideRanks;
      for (const ranked of rankings) for (const band of bands) jobs.push(bandJob(key, ranked, band, depth(ranked), skip, view ? view.points : points));
      return jobs;
    };
    // A tall frame (a portrait photo) often holds its sky in the upper part and the ground below. After a first look at the whole frame with
    // the bright bands, that upper part is searched on its own; the whole-frame result is preferred because it covers the entire picture.
    const tall = height > 1.30*width;
    const upperPass = async () => {
      const skyHeight = Math.round(height*.44);
      const upper = detectStars({ ...image, height:skyHeight });
      upper.forEach((point,i) => { point.rank = i; });
      if (upper.length < 15) return null;
      const upperSharp = rankByContrast(upper);
      const upperRanks = balance(upper,width,skyHeight);
      const jobs = [];
      for (const band of wideBands) {
        jobs.push(bandJob('wide',upperSharp,band,16,0,upper,width,skyHeight), bandJob('wide',upperRanks,band,15,0,upper,width,skyHeight));
      }
      const found = await run('upper', 1.8, 2, jobs);
      if (found) {
        found.header.CRPIX2 += height - skyHeight;
        found.header.IMAGEH = height;
        found.verified_height = skyHeight;
      }
      return found;
    };
    // The same star list with the large saturated stars added. It is built only when the ordinary list has failed at the first depth, and is
    // searched after the ordinary list at each shallow depth, so a frame the ordinary list solves is solved exactly as before.
    let plateau = null, plateauBuilt = false;
    const plateauView = () => {
      if (!plateauBuilt) {
        plateauBuilt = true;
        const list = points.augment ? points.augment() : null;
        if (list) {
          list.forEach((point,i) => { point.rank = i; });
          plateau = { points:list, sharp:rankByContrast(list), ranks:balance(list,width,height) };
        }
        lap('plateau');
      }
      return plateau;
    };
    // Phase A: a few stars, then more. The deep fields keep their own three rankings; the all-sky indexes use the scale bands.
    let result = null, before = 0;
    for (const [depth, from, to, withRegional, withMid] of [[10,1,2,true,true], [14,2,4,true,true], [19,4,6,true,false]]) {
      const regionalJobs = [], midJobs = [], wideJobs = [];
      if (!wideOnly && withRegional) {
        const last = depth === 19;
        regionalJobs.push(regionalJob(points,depth,before), regionalJob(sharp,depth,before), regionalJob(ranks,last ? 20 : depth,before));
      }
      if (!wideOnly && withMid && options.mid !== false) midJobs.push(...bandJobs('mid', midBands, () => depth, before));
      if (depth <= 14) wideJobs.push(...bandJobs('wide', wideBands, () => depth, before));
      if (tall && depth === 10) {
        // The small-field indexes answer in milliseconds when they hold the field; only then are the bright bands and the upper part tried.
        result = await run('A10', from, from + .5, [...regionalJobs, ...midJobs]) || await run('A10w', from + .5, from + .8, wideJobs) || await upperPass();
      } else {
        result = await run('A' + depth, from, to, [...regionalJobs, ...midJobs, ...wideJobs]);
      }
      if (result) return report(result);
      if (depth <= 14) {
        const view = plateauView();
        if (view) {
          const regionalJobsP = [], midJobsP = [], wideJobsP = [];
          if (!wideOnly && withRegional) regionalJobsP.push(regionalJob(view.points,depth,before,view.points), regionalJob(view.sharp,depth,before,view.points), regionalJob(view.ranks,depth,before,view.points));
          if (!wideOnly && withMid && options.mid !== false) midJobsP.push(...bandJobs('mid', midBands, () => depth, before, view));
          wideJobsP.push(...bandJobs('wide', wideBands, () => depth, before, view));
          result = await run('P' + depth, from, to, [...regionalJobsP, ...midJobsP, ...wideJobsP]);
          if (result) return report(result);
        }
      }
      // The narrow-field index comes last at each shallow depth: every frame the other indexes can solve is solved by them, exactly as before, and
      // the index is not even opened for it. A frame they cannot solve (a nebula outside the deep regions, too narrow for the mid-depth pack) is tried here.
      if (depth <= 14 && !wideOnly && options.fine !== false) {
        result = await run('F' + depth, from, to, bandJobs('fine', fineBands, () => depth, before));
        if (result) return report(result);
        const view = plateauView();
        if (view) {
          result = await run('FP' + depth, from, to, bandJobs('fine', fineBands, () => depth, before, view));
          if (result) return report(result);
        }
      }
      before = depth;
    }
    onProgress(6, 12);
    onProgress(7, 12);
    // Phase B: the long search, over the deeper star lists.
    if (!wideOnly) {
      result = await run('B_regional', 7, 8, [regionalJob(sharp,29,19), regionalJob(ranks,29,20), regionalJob(points,29,19)]);
      if (result) return report(result);
      if (options.mid !== false) {
        result = await run('B_mid', 8, 9, bandJobs('mid', midBands, () => 20, 14));
        if (result) return report(result);
      }
    }
    onProgress(9, 12);
    for (let b = 0; b < wideBands.length; b++) {
      const band = wideBands[b], part = tickOf(9,11,wideBands.length,b);
      result = await run('B_wide', 0, 1, [
        bandJob('wide',sharp,band,23,14), bandJob('wide',ranks,band,23,14), bandJob('wide',points,band,22,14)
      ].map((job, i) => tick => job(fraction => part((i + Math.min(1,fraction))/3))));
      if (result) return report(result);
    }
    onProgress(11, 12);
    return report();
  }


  // The solve, then (for a frame of many degrees, when the caller can give the bright stars) the second fit described above.
  async function solve(image, loadIndex, report_ = () => {}, options = {}) {
    const result = await solveCore(image, loadIndex, report_, options);
    if (!result.header || typeof options.loadBrightStars !== 'function') return result;
    try {
      const rows = await options.loadBrightStars();
      return rows ? polishWide(result, image, rows) : result;
    } catch (_) {
      return result;
    }
  }

  // Nearest catalogue star to a direction, within a chord distance, for callers that already hold a model of the field.
  function nearestStar(index, vector, radius) {
    const id = closestStar(index, vector[0], vector[1], vector[2], radius*radius);
    return id < 0 ? null : { id, sky:skyStar(index, id) };
  }

  return { detectStars, readIndex, solve, nearestStar };
})();
