'use strict';
// InstaSlice projection model for panoramas and fisheye frames.
//
// A frame is described by a rotation of the sky into the camera, a family of map projections and a handful of numbers. In a
// cylindrical family the camera's y axis is the axis of the cylinder; in an azimuthal family the camera's z axis is the optical axis.
//   cylindrical: x = cx + f·λ              y = cy − f·ratio·g(φ)
//   azimuthal  : x = cx + f·r·cos ψ        y = cy − f·ratio·r·sin ψ      with r = g(θ)
// λ and φ are longitude and latitude about the axis, θ is the angle from the optical axis and ψ the direction around it.
// This file holds only the geometry. It is shared by the solver worker (which fits it) and by the page (which draws annotations with it).
(function (root) {
  const DEG = Math.PI / 180;
  const clamp = (v, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));

  // Named projections. g maps an angle to a plane distance in units of the focal length, inverse maps it back.
  const SHAPES = {
    cyl: {
      car: { name: 'Equirectangular', g: p => p, inverse: y => y },
      cyp: { name: 'Cylindrical (central)', g: Math.tan, inverse: Math.atan },
      mer: { name: 'Mercator', g: p => Math.log(Math.tan(Math.PI / 4 + p / 2)), inverse: y => 2 * Math.atan(Math.exp(y)) - Math.PI / 2 },
      cea: { name: 'Cylindrical equal-area', g: Math.sin, inverse: y => Math.asin(clamp(y)) },
      brn: { name: 'Cylindrical (stereographic)', g: p => 2 * Math.tan(p / 2), inverse: y => 2 * Math.atan(y / 2) }
    },
    azi: {
      tan: { name: 'Rectilinear', g: Math.tan, inverse: Math.atan },
      stg: { name: 'Stereographic fisheye', g: t => 2 * Math.tan(t / 2), inverse: r => 2 * Math.atan(r / 2) },
      eqd: { name: 'Equidistant fisheye', g: t => t, inverse: r => r },
      eqs: { name: 'Equisolid fisheye', g: t => 2 * Math.sin(t / 2), inverse: r => 2 * Math.asin(clamp(r / 2)) },
      sin: { name: 'Orthographic fisheye', g: Math.sin, inverse: r => Math.asin(clamp(r)) }
    }
  };

  // Between the named projections lies a one-parameter family: a perspective from a point at distance (1/k − 1) behind the sphere's centre.
  // k = 1 is the central (tangent) projection, k = 1/2 the stereographic one, and k → 0 the orthographic or equal-area one.
  const generic = k => ({
    name: 'Fitted',
    g: a => Math.sin(a) / ((1 - k) + k * Math.cos(a)),
    inverse: y => {
      let a = clamp(y, -1.4, 1.4);
      for (let i = 0; i < 40; i++) {
        const c = (1 - k) + k * Math.cos(a), f = Math.sin(a) / c - y;
        const d = (Math.cos(a) * c + k * Math.sin(a) * Math.sin(a)) / (c * c);
        const step = f / (d || 1);
        a -= step;
        if (Math.abs(step) < 1e-12) break;
      }
      return a;
    }
  });

  function shapeOf(family, shape) {
    if (typeof shape === 'number') return generic(shape);
    const found = SHAPES[family] && SHAPES[family][shape];
    if (!found) throw new Error('Unknown projection.');
    return found;
  }

  function rotationFromVector(r) {
    const angle = Math.hypot(r[0], r[1], r[2]);
    if (angle < 1e-14) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const k = [r[0] / angle, r[1] / angle, r[2] / angle], c = Math.cos(angle), s = Math.sin(angle), v = 1 - c;
    return [[c + k[0]*k[0]*v, k[0]*k[1]*v - k[2]*s, k[0]*k[2]*v + k[1]*s],
            [k[1]*k[0]*v + k[2]*s, c + k[1]*k[1]*v, k[1]*k[2]*v - k[0]*s],
            [k[2]*k[0]*v - k[1]*s, k[2]*k[1]*v + k[0]*s, c + k[2]*k[2]*v]];
  }
  const multiply = (A, B) => A.map(row => [0, 1, 2].map(j => row[0]*B[0][j] + row[1]*B[1][j] + row[2]*B[2][j]));
  const apply = (M, v) => [M[0][0]*v[0] + M[0][1]*v[1] + M[0][2]*v[2], M[1][0]*v[0] + M[1][1]*v[1] + M[1][2]*v[2], M[2][0]*v[0] + M[2][1]*v[1] + M[2][2]*v[2]];
  const applyTransposed = (M, v) => [M[0][0]*v[0] + M[1][0]*v[1] + M[2][0]*v[2], M[0][1]*v[0] + M[1][1]*v[1] + M[2][1]*v[2], M[0][2]*v[0] + M[1][2]*v[1] + M[2][2]*v[2]];

  const toVector = (ra, dec) => [Math.cos(dec*DEG)*Math.cos(ra*DEG), Math.cos(dec*DEG)*Math.sin(ra*DEG), Math.sin(dec*DEG)];
  const toSky = v => ({ ra: ((Math.atan2(v[1], v[0]) / DEG) % 360 + 360) % 360, dec: Math.asin(clamp(v[2])) / DEG });

  // model = { family, shape, R (sky → camera, 3×3), f, ratio, cx, cy }
  function prepare(model) {
    if (model._shape) return model;
    model._shape = shapeOf(model.family, model.shape);
    return model;
  }

  function correctionTerms(x, y) {
    return [1,x,y,x*x,x*y,y*y,x*x*x,x*x*y,x*y*y,y*y*y];
  }

  function correctPixel(correction, x, y) {
    const terms = correctionTerms((x-correction.cx)/correction.sx, (y-correction.cy)/correction.sy);
    let dx = 0, dy = 0;
    for (let i = 0; i < correction.x.length; i++) {
      dx += correction.x[i]*terms[i];
      dy += correction.y[i]*terms[i];
    }
    return [x+correction.sx*dx, y+correction.sy*dy];
  }

  function removeCorrection(correction, x, y) {
    let u = x, v = y;
    for (let i = 0; i < 16; i++) {
      const p = correctPixel(correction,u,v);
      if (!Number.isFinite(p[0]+p[1])) return null;
      const dx = x-p[0], dy = y-p[1];
      u += dx; v += dy;
      if (Math.max(Math.abs(dx),Math.abs(dy)) < 1e-4) return [u,v];
    }
    return null;
  }

  function scaleModel(model, sx, sy) {
    const out = { ...model, f:model.f*sx, ratio:model.ratio*sy/sx,
      cx:(model.cx+.5)*sx-.5, cy:(model.cy+.5)*sy-.5 };
    if (model.correction) {
      const c = model.correction;
      out.correction = { ...c, cx:(c.cx+.5)*sx-.5, cy:(c.cy+.5)*sy-.5, sx:c.sx*sx, sy:c.sy*sy };
    }
    return out;
  }

  // Sky direction (unit vector) → pixel, or null where the projection has no image of it.
  function project(model, vector) {
    const pixel = projectBase(model,vector);
    return pixel && model.correction ? correctPixel(model.correction,...pixel) : pixel;
  }

  function projectBase(model, vector) {
    prepare(model);
    const c = apply(model.R, vector), g = model._shape.g;
    if (model.family === 'cyl') {
      const lam = Math.atan2(c[0], c[2]), phi = Math.asin(clamp(c[1]));
      if (model.maxLongitude && Math.abs(lam) > model.maxLongitude) return null;
      if (model.maxLatitude && Math.abs(phi) > model.maxLatitude) return null;
      const y = g(phi);
      if (!Number.isFinite(y)) return null;
      return [model.cx + model.f * lam, model.cy - model.f * model.ratio * y];
    }
    const theta = Math.acos(clamp(c[2]));
    if (model.maxAngle && theta > model.maxAngle) return null;
    const r = g(theta);
    if (!Number.isFinite(r) || theta > 3.1) return null;
    const psi = Math.atan2(c[1], c[0]);
    return [model.cx + model.f * r * Math.cos(psi), model.cy - model.f * model.ratio * r * Math.sin(psi)];
  }

  // Pixel → sky direction.
  function unproject(model, x, y) {
    if (model.correction) {
      const pixel = removeCorrection(model.correction,x,y);
      if (!pixel) return null;
      [x,y] = pixel;
    }
    prepare(model);
    const inverse = model._shape.inverse;
    let c;
    if (model.family === 'cyl') {
      const lam = (x - model.cx) / model.f, phi = inverse((model.cy - y) / (model.f * model.ratio));
      if (!Number.isFinite(phi)) return null;
      c = [Math.sin(lam) * Math.cos(phi), Math.sin(phi), Math.cos(lam) * Math.cos(phi)];
    } else {
      const X = (x - model.cx) / model.f, Y = (model.cy - y) / (model.f * model.ratio), r = Math.hypot(X, Y);
      const theta = inverse(r);
      if (!Number.isFinite(theta)) return null;
      const s = Math.sin(theta), psi = Math.atan2(Y, X);
      c = [s * Math.cos(psi), s * Math.sin(psi), Math.cos(theta)];
    }
    return applyTransposed(model.R, c);
  }

  // Geometry shared by panorama crops and the local WCS for those same rectified crops.
  function cylinderLocal(mapping, cy) {
    const f = mapping.scale/DEG, dy = mapping.yEq-cy;
    const phi = mapping.kind === 'cyp' ? Math.atan(dy/f) : dy/f;
    return { f, sin:Math.sin(phi), cos:Math.cos(phi) };
  }

  function fromTangentPatch(mapping, cx, cy, size, u, v, local = cylinderLocal(mapping,cy)) {
    const X = (u+.5-size/2)/local.f, Y = (size/2-v-.5)/local.f;
    const length = Math.sqrt(1+X*X+Y*Y);
    const phi = Math.asin(clamp((local.sin+local.cos*Y)/length));
    const lambda = Math.atan2(X,local.cos-local.sin*Y);
    return [cx+lambda*local.f, mapping.yEq-(mapping.kind === 'cyp' ? Math.tan(phi) : phi)*local.f];
  }

  function toTangentPatch(mapping, cx, cy, size, x, y) {
    const local = cylinderLocal(mapping,cy), dl = (x-cx)/local.f;
    const dy = (mapping.yEq-y)/local.f, phi = mapping.kind === 'cyp' ? Math.atan(dy) : dy;
    const h = Math.cos(phi)*Math.cos(dl), z = Math.sin(phi)*local.sin+h*local.cos;
    if (z <= 0 || Math.abs(dl) > Math.PI) return null;
    const u = Math.cos(phi)*Math.sin(dl)/z*local.f;
    const v = (Math.sin(phi)*local.cos-h*local.sin)/z*local.f;
    return [size/2+u-.5,size/2-v-.5];
  }

  const separation = (a, b) => Math.acos(clamp(a[0]*b[0] + a[1]*b[1] + a[2]*b[2])) / DEG;

  // Local sampling in arc seconds per pixel, along x and y.
  function samplingAt(model, x, y) {
    const o = unproject(model, x, y), px = unproject(model, x + 1, y), py = unproject(model, x, y + 1);
    if (!o || !px || !py) return null;
    return { x: separation(o, px) * 3600, y: separation(o, py) * 3600 };
  }

  // Angular size of the part of the frame given by a rectangle, measured the way a person would: along the middle line of the frame.
  function extentOf(model, width, height, rect) {
    const { x0, y0, x1, y1 } = rect || { x0: 0, y0: 0, x1: width, y1: height };
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    if (model.family === 'cyl') {
      const left = model.correction && removeCorrection(model.correction,x0,my);
      const right = model.correction && removeCorrection(model.correction,x1,my);
      const lam = ((left && right ? Math.abs(right[0]-left[0]) : x1-x0) / model.f) / DEG;
      const top = unproject(model, mx, y0), bottom = unproject(model, mx, y1);
      return { width_deg: Math.min(360, lam), height_deg: top && bottom ? separation(top, bottom) : 0 };
    }
    // The widest and tallest angular distances between opposite edge points, taken along three lines each.
    const span = (pairsOfPoints) => {
      let best = 0;
      for (const [[ax, ay], [bx, by]] of pairsOfPoints) {
        const a = unproject(model, ax, ay), b = unproject(model, bx, by);
        if (a && b) best = Math.max(best, separation(a, b));
      }
      return best;
    };
    return {
      width_deg: span([y0, my, y1].map(y => [[x0, y], [x1, y]])),
      height_deg: span([x0, mx, x1].map(x => [[x, y0], [x, y1]]))
    };
  }

  root.InstaSliceProjection = { SHAPES, shapeOf, rotationFromVector, multiply, apply, applyTransposed, toVector, toSky, project, unproject, separation, samplingAt, extentOf, correctionTerms, correctPixel, scaleModel, cylinderLocal, fromTangentPatch, toTangentPatch, DEG, clamp };
})(typeof self !== 'undefined' ? self : globalThis);
