'use strict';

// The index and image use the same four-star fingerprint. The image supplies
// the scale and attitude; independent stars must agree before a WCS is emitted.
globalThis.InstaSliceSolver = (() => {
  const DEG = Math.PI / 180;
  const PAIRS = [[0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 1, 2],
                 [1, 2, 0, 3], [1, 3, 0, 2], [2, 3, 0, 1]];
  const WIDE_FIELDS = [26, 20, 33, 50, 41, 60, 15, 69, 79, 11, 90];
  const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  const plus = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
  const minus = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
  const scale = (a, v) => [a[0]*v, a[1]*v, a[2]*v];
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const unit = a => scale(a, 1 / Math.sqrt(dot(a, a)));
  const distance2 = (a, b) => (a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2;

  function readIndex(buffer, wide = false) {
    const head = new DataView(buffer);
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
    // Collapse multiple maxima around bright stars and diffraction spikes.
    const best = [];
    const gap = Math.max(3.2, size / 420);
    for (const point of points) {
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

  function closestStar(index, target, cutoff) {
    const { stars, count } = index;
    const [x, y, z] = target;
    let id = -1;
    let best = cutoff;
    function search(lo, hi, axis) {
      if (lo >= hi) return;
      const mid = (lo + hi) >>> 1;
      const i = mid * 3;
      const dx = x-stars[i], dy = y-stars[i+1], dz = z-stars[i+2];
      const d2 = dx*dx + dy*dy + dz*dz;
      if (d2 < best) {
        best = d2;
        id = mid;
      }
      const ahead = axis === 0 ? dx : (axis === 1 ? dy : dz);
      const next = axis === 2 ? 0 : axis+1;
      if (ahead < 0) {
        search(lo, mid, next);
        if (ahead*ahead < best) search(mid+1, hi, next);
      } else {
        search(mid+1, hi, next);
        if (ahead*ahead < best) search(lo, mid, next);
      }
    }
    search(0, count, 0);
    return id;
  }

  function transform(from, to, vector, parity) {
    const u = dot(from[0], vector), v = parity*dot(from[1], vector), w = dot(from[2], vector);
    return [to[0][0]*u + to[1][0]*v + to[2][0]*w,
            to[0][1]*u + to[1][1]*v + to[2][1]*w,
            to[0][2]*u + to[1][2]*v + to[2][2]*w];
  }

  function poseFromAnchors(image, sky, focalGuess, wide, imageChord2) {
    const [a, b, c, d] = image;
    const trueChord2 = distance2(sky[0], sky[1]);
    const projected = Math.hypot(a.u-b.u, a.v-b.v);
    let focal = projected * Math.sqrt(1/trueChord2 - .25);
    if (wide) {
      if (trueChord2 < .63*imageChord2 || trueChord2 > 1.57*imageChord2) return null;
      const ar = a.u*a.u + a.v*a.v, br = b.u*b.u + b.v*b.v;
      const ab = a.u*b.u + a.v*b.v;
      let lo = .80*focalGuess, hi = 1.26*focalGuess;
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
    const chord2 = (1.22*tolerance/model.focal)**2;
    for (const point of points) {
      const p = warpPoint(model, point);
      const u = (model.a*p.u + model.b*p.v + model.originX)/model.focal;
      const v = (model.c*p.u + model.d*p.v + model.originY)/model.focal;
      const aim = unit(plus(model.pole, plus(scale(model.x,u), scale(model.y,v))));
      const id = closestStar(index, aim, chord2);
      if (id < 0) continue;
      const sky = skyStar(index, id);
      const [imageU,imageV] = project(model, sky);
      const residual = (imageU-p.u)**2+(imageV-p.v)**2;
      if (residual <= tolerance2 && residual < (accepted.get(id)?.residual ?? Infinity)) {
        accepted.set(id, { id, point, sky, residual });
      }
    }
    return [...accepted.values()];
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
    const firstTolerance = index.wide ? .0080 : Math.max(2.1/size, .0023);
    if (!model || error2(model,seedPoints[2],seedSky[2]) > firstTolerance**2 ||
                  error2(model,seedPoints[3],seedSky[3]) > firstTolerance**2) return null;
    if (index.wide) {
      const seeds = seedPoints.map((point,i) => ({point,sky:seedSky[i]}));
      model = fitAffine(model, seeds) || model;
    }
    let matches = findMatches(index, model, points.slice(0, 46), firstTolerance);
    if (matches.length < 8) return null;
    const sample = points.slice(0, index.wide ? 460 : 290);
    matches = findMatches(index, model, sample, firstTolerance);
    if (matches.length < 15 || !hasSkyCoverage(matches,size,width,height)) return null;
    model = fitAffine(model, matches);
    if (!model) return null;
    matches = findMatches(index, model, sample, firstTolerance*.74);
    if (matches.length < 15) return null;
    model = fitAffine(model, matches);
    if (!model) return null;
    if (index.wide) model = refineDistortion(model,matches,width,height);
    const finalTolerance = index.wide ? .0025 : firstTolerance*.50;
    matches = findMatches(index, model, sample, finalTolerance);
    if (matches.length < 15) return null;
    const seed = new Set(seedPoints);
    const independent = matches.filter(({point}) => !seed.has(point)).length;
    if (independent < 12 || !hasSkyCoverage(matches,size,width,height)) return null;
    // Adjacent, deliberately offset projections estimate the local rate of
    // chance coincidences, including crowded catalogue fields.
    const controls = [[.013,.010], [-.012,.014], [.009,-.016], [-.015,-.012]];
    let accidental = 0;
    for (const [dx,dy] of controls) {
      const offset = { ...model, originX:model.originX+dx, originY:model.originY+dy };
      accidental += findMatches(index,offset,sample,finalTolerance).length;
    }
    const expected = (accidental+5) / controls.length;
    const logBound = independent - expected + independent * Math.log(expected/independent);
    if (independent <= expected || logBound > -19) return null;
    const rms = Math.sqrt(matches.reduce((sum, item) => sum + item.residual, 0)/matches.length)*size;
    return { header: headerFor(model,width,height), stats: { matches:matches.length, rms_px:rms,
      field_deg:2*Math.atan(.5/model.focal)/DEG, custom_solver:true, wide_field:index.wide,
      distortion_refined:!!model.warp } };
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

  function findField(index, ranked, points, width, height, focal, depth, skip, diagnostics, deadline) {
    const selected = ranked.slice(0, depth);
    const rays = selected.map(({u,v}) => unit([u,v,focal]));
    const minBaseline = index.wide ? .19 : .17;
    const tolerance = index.wide ? .018 : .010;
    const { entries } = index;
    for (let m=Math.max(3,skip); m<selected.length; m++) {
      if (performance.now() > deadline) return null;
      for (let k=2; k<m; k++) for (let j=1; j<k; j++) for (let i=0; i<j; i++) {
        const indices = [i,j,k,m];
        const fingerprinted = fingerprint(indices.map(id => rays[id]));
        if (!fingerprinted) continue;
        const stars = fingerprinted.order.map(order => selected[indices[order]]);
        if (Math.hypot(stars[0].u-stars[1].u, stars[0].v-stars[1].v) < minBaseline) continue;
        diagnostics.quads++;
        const result = lookup(index, fingerprinted, tolerance, entry => {
          diagnostics.hypotheses++;
          const sky = [skyStar(index,entries[entry]), skyStar(index,entries[entry+1]),
                       skyStar(index,entries[entry+2]), skyStar(index,entries[entry+3])];
          const model = poseFromAnchors(stars,sky,focal,index.wide,fingerprinted.chord2);
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

  async function solve(image, loadIndex, onProgress = () => {}, options = {}) {
    const { width, height } = image;
    const points = detectStars(image, options.ignoreFooter);
    const diagnostics = { stars:points.length, quads:0, hypotheses:0 };
    const report = result => result ? { ...result, stats:{ ...result.stats, ...diagnostics } } : { diagnostics };
    if (points.length < 12) return { ...report(), sparse:true };
    const deadline = performance.now() + (options.timeLimit ?? 26_000);
    const ranks = balance(points,width,height);
    const sharp = rankByContrast(points);
    onProgress(1, 12);
    const regional = await loadIndex('deep');
    const tryRegional = (ranked, depth, skip = 0) => findField(regional,ranked,points,width,height,160,depth,skip,diagnostics,deadline);
    let result = tryRegional(points, 19) || tryRegional(sharp, 19) || tryRegional(ranks, 20);
    if (result) return report(result);
    onProgress(3, 12);
    const wide = await loadIndex('wide');
    const tryWide = (ranked, field, depth, skip = 0) =>
      findField(wide,ranked,points,width,height,.5/Math.tan(field*DEG/2),depth,skip,diagnostics,deadline);
    for (const field of WIDE_FIELDS.slice(0, 6)) {
      result = tryWide(sharp,field,14) || tryWide(ranks,field,14) || tryWide(points,field,14);
      if (result) return report(result);
    }
    onProgress(6, 12);
    if (height > 1.30*width && performance.now() < deadline) {
      const skyHeight = Math.round(height*.44);
      const upper = detectStars({ ...image, height:skyHeight });
      if (upper.length >= 15) {
        const upperSharp = rankByContrast(upper);
        const upperRanks = balance(upper,width,skyHeight);
        for (const field of WIDE_FIELDS) {
          const focal = .5/Math.tan(field*DEG/2);
          result = findField(wide,upperSharp,upper,width,skyHeight,focal,16,0,diagnostics,deadline) ||
                   findField(wide,upperRanks,upper,width,skyHeight,focal,15,0,diagnostics,deadline);
          if (!result) continue;
          result.header.CRPIX2 += height - skyHeight;
          result.header.IMAGEH = height;
          result.verified_height = skyHeight;
          return report(result);
        }
      }
    }
    result = tryRegional(sharp, 29, 19) || tryRegional(ranks, 29, 20) || tryRegional(points, 29, 19);
    if (result) return report(result);
    onProgress(8, 12);
    for (let i = 0; i < WIDE_FIELDS.length; i++) {
      const field = WIDE_FIELDS[i];
      const skip = i < 6 ? 14 : 0;
      result = tryWide(sharp,field,23,skip) || tryWide(ranks,field,23,skip) || tryWide(points,field,22,skip);
      if (result) return report(result);
    }
    onProgress(11, 12);
    return report();
  }

  return { detectStars, readIndex, solve };
})();
