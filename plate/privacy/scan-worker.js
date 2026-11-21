/* Local text check. Only warning categories and a possible footer boundary leave this worker. */
'use strict';

const VERSION = '?v=14';

async function asset(name) {
  const response = await fetch(new URL(name + VERSION, self.location.href), {
    mode: 'same-origin', credentials: 'same-origin', referrerPolicy: 'no-referrer', redirect: 'error'
  });
  if (!response.ok) throw new Error('The local text model could not be loaded.');
  return response;
}

function sensitiveText(text) {
  const groups = { location: false, contact: false };
  for (const line of text.normalize('NFKC').split(/\r?\n/)) {
    const s = line.replace(/[–−]/g, '-').replace(/([°º])\s*[€£]/g, '$1E').trim();
    if (!s) continue;
    const coordinates = [...s.matchAll(/(?<!\d)([+-]?\d{1,3}(?:[.,]\d{1,8})?)\s*(?:[°º˚’'′"`]\s*)?(?:\d{1,2}\s*['’′]\s*(?:\d{1,2}(?:[.,]\d+)?\s*["″])?\s*)?([NSEW])(?!\p{L})/giu)];
    for (let i = 1; i < coordinates.length; i++) {
      const [a, b] = coordinates.slice(i - 1, i + 1);
      const between = s.slice(a.index + a[0].length, b.index);
      if (!/^[\s,.;:/|()\-]{0,9}$/.test(between)) continue;
      const latitude = /[NS]/i.test(a[2]) ? a : b;
      const longitude = latitude === a ? b : a;
      if (/[NS]/i.test(latitude[2]) && /[EW]/i.test(longitude[2]) &&
          Math.abs(Number(latitude[1].replace(',', '.'))) <= 90 &&
          Math.abs(Number(longitude[1].replace(',', '.'))) <= 180) groups.location = true;
    }

    const hasSkyAxes = /\b(?:RA|DEC|ICRS|J2000|right ascension|declination|field of view|FOV)\b/i.test(s);
    if (!hasSkyAxes) {
      const decimal = s.match(/(?<![\d.])([+-]?\d{1,2}\.\d{3,})\s*[,;]\s*([+-]?\d{1,3}\.\d{3,})(?![\d.])/);
      if (decimal && Math.abs(Number(decimal[1])) <= 90 && Math.abs(Number(decimal[2])) <= 180) groups.location = true;
      if (/\b(?:loc(?:ation)?|shot at|observation site|gps|luogo|localit[aà]|lugar|standort|lieu|ubicaci[oó]n)\s*[:=]\s*(?!unknown\b|none\b|hidden\b|n\/a\b|disabled\b)[\p{L}\d][\p{L}\d .,'+-]{1,}/iu.test(s) ||
          /\b(?:lat(?:itude|itud|itudine)?|lon(?:gitude|gitud|gitudine)?|lng)\s*[:=]?\s*[+-]?\d{1,3}(?:[.,]\d{1,})?\s*(?:[°º]|[NSEW]\b|[,;]|$)/i.test(s)) groups.location = true;
      // Compact camera footers often print a handle, two degree values and a date.
      // Require that structure when OCR loses one of the compass letters.
      if (/\b[\w.-]{3,}\s*[\/|]\s*[+-]?\d{1,3}\s*[°º’'′]\s*[EW]\s*[,;\s]+\s*[+-]?\d{1,2}\s*[°º’'′!¢*]?\s*[NS]?\s*[\/|]\s*20\d{2}\b/i.test(s)) groups.location = true;
    }
    if (/\b[\w.%+-]+@[a-z\d.-]+\.[a-z]{2,}\b/i.test(s) ||
        /\b(?:phone|tel(?:ephone)?|mobile|whats\s*app)\s*[:=]?\s*\+?(?:[\d() .-]*\d){7,}/i.test(s)) groups.contact = true;
  }
  return groups;
}

function grayImage(rgba, width, height) {
  const gray = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
    gray[i] = (77 * rgba[j] + 150 * rgba[j + 1] + 29 * rgba[j + 2] + 128) >> 8;
  }
  return gray;
}

function patch(gray, width, height, rect, magnification) {
  const [left, top, right, bottom] = rect;
  const sw = Math.max(1, Math.round((right - left) * width));
  const sh = Math.max(1, Math.round((bottom - top) * height));
  const x0 = Math.round(left * width), y0 = Math.round(top * height);
  const w = Math.max(1, Math.round(sw * magnification)), h = Math.max(1, Math.round(sh * magnification));
  const values = new Uint8Array(w * h);
  const histogram = new Uint32Array(256);
  for (let j = 0; j < h; j++) {
    const sy = y0 + Math.max(0, Math.min(sh - 1, (j + 0.5) / magnification - 0.5));
    const r = Math.min(height - 1, Math.floor(sy)), rn = Math.min(height - 1, r + 1), t = sy - r;
    for (let i = 0; i < w; i++) {
      const sx = x0 + Math.max(0, Math.min(sw - 1, (i + 0.5) / magnification - 0.5));
      const c = Math.min(width - 1, Math.floor(sx)), cn = Math.min(width - 1, c + 1), u = sx - c;
      const a = gray[r * width + c], b = gray[r * width + cn];
      const d = gray[rn * width + c], e = gray[rn * width + cn];
      const v = Math.round((a + (b - a) * u) * (1 - t) + (d + (e - d) * u) * t);
      values[j * w + i] = v;
      histogram[v]++;
    }
  }
  let total = 0, median = 0;
  while (median < 255 && (total += histogram[median]) < values.length / 2) median++;
  return { values, w, h, median };
}

async function makeOcr() {
  if (typeof WebAssembly !== 'object' || typeof DecompressionStream !== 'function') {
    throw new Error('Local text recognition is unavailable.');
  }
  importScripts('./tesseract-core-lstm.js' + VERSION);
  const [wasm, model] = await Promise.all([
    asset('tesseract-core-lstm.wasm').then(response => response.arrayBuffer()),
    asset('eng.traineddata.gz').then(response => new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer())
  ]);
  const core = await TesseractCore({
    wasmBinary: new Uint8Array(wasm), print() {}, printErr() {}, TesseractProgress() {}
  });
  core.FS.writeFile('/eng.traineddata', new Uint8Array(model));
  const api = new core.TessBaseAPI();
  if (api.Init(null, 'eng', 1) !== 0) throw new Error('Could not initialise local text recognition.');
  api.SetVariable('user_defined_dpi', '150');
  return { api, core };
}

function read(ocr, tile, mode, cutoff) {
  const { api, core } = ocr;
  const { values, w, h } = tile;
  const size = values.length, ptr = core._malloc(size);
  if (!ptr) throw new Error('The local text check ran out of memory.');
  try {
    const bytes = core.HEAPU8.subarray(ptr, ptr + size);
    if (cutoff == null) bytes.set(values);
    else for (let i = 0; i < size; i++) bytes[i] = values[i] >= cutoff ? 0 : 255;
    api.SetPageSegMode(mode);
    api.SetImage(ptr, w, h, 1, w);
    return sensitiveText(api.GetUTF8Text().slice(0, 5000));
  } finally {
    api.Clear();
    core.HEAPU8.fill(0, ptr, ptr + size);
    core._free(ptr);
  }
}

async function scan({ rgba, width, height }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || Math.min(width, height) < 36 ||
      Math.max(width, height) > 2048 || rgba?.length !== width * height * 4) {
    return { location: false, contact: false, footer: false };
  }
  const gray = grayImage(rgba, width, height);
  const ocr = await makeOcr();
  const magnify = Math.max(1, Math.min(3.2, 2160 / width));
  try {
    // Try the lowest watermark line first, leaving extra room for short stamps.
    for (const rect of [[0, .956, .69, .991], [.02, .956, .61, .989], [.31, .956, 1, .991]]) {
      const tile = patch(gray, width, height, rect, magnify);
      for (const cutoff of [null, tile.median + 48, tile.median + 34, tile.median + 56]) {
        const flags = read(ocr, tile, 7, cutoff);
        if (flags.location || flags.contact) return { ...flags, footer: true };
      }
    }
    for (const rect of [[0, .85, 1, 1], [0, 0, 1, .16], [0, .16, 1, .85]]) {
      const factor = rect[3] - rect[1] > .5 ? Math.min(1, 1100 / Math.max(width, height)) : Math.min(2, magnify);
      const tile = patch(gray, width, height, rect, factor);
      const flags = read(ocr, tile, 11, null);
      if (flags.location || flags.contact) return { ...flags, footer: rect[1] >= .85 };
    }
    return { location: false, contact: false, footer: false };
  } finally {
    ocr.api.End();
  }
}

self.onmessage = async event => {
  try { self.postMessage(await scan(event.data)); }
  catch (_) { self.postMessage({ unavailable: true }); }
};
