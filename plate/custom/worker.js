'use strict';

importScripts('./solver.js?v=9', './projection.js?v=3', './panorama.js?v=5');

// The deep pack is stored whole. The bright and mid-depth packs hold stars and circle lists only: their pattern tables are generated here, once.
const indexUrls = {
  deep: './deep.isq.gz?v=1',
  regions: './regions.isq.gz?v=2',
  closeups: './closeups.isq.gz?v=1',
  wide: './wide.isp.gz?v=1',
  mid: './mid.isp.gz?v=1',
  fine: './fine.isp.gz?v=1'
};
const optionalIndexes = new Set(['mid', 'fine', 'regions', 'closeups']);

async function readIndexFile(path) {
  const response = await fetch(new URL(path, self.location.href), {
    mode: 'same-origin',
    credentials: 'same-origin',
    referrerPolicy: 'no-referrer',
    redirect: 'error'
  });
  if (!response.ok) throw new Error('The InstaSlice star indexes could not be loaded. Connect once and use Download for offline.');
  return response.blob();
}

// The catalogue of bright stars the page already ships. A wide frame is solved first with one flat projection; these stars then refine it (lens
// distortion and the far corners). Optional: a missing file leaves the ordinary solution as it is.
let brightRows;
async function loadBrightStars() {
  if (brightRows !== undefined) return brightRows;
  try {
    const response = await fetch(new URL('../bright-stars.json', self.location.href), { mode:'same-origin', credentials:'same-origin', referrerPolicy:'no-referrer', redirect:'error' });
    const data = response.ok ? await response.json() : null;
    brightRows = data && Array.isArray(data.objects) ? data.objects : null;
  } catch (_) { brightRows = null; }
  return brightRows;
}

// Pixels for the ultra-wide pass are cut from the full picture by the page, one field at a time.
const pending = new Map();
let nextWindow = 1;
function requestWindow(rect) {
  return new Promise((resolve, reject) => {
    const id = nextWindow++;
    pending.set(id, { resolve, reject });
    self.postMessage({ type:'window', id, rect });
  });
}

// Throttles a progress report to about sixteen a second: the page only needs a steady stream.
function throttled(send) {
  let last = -1e9;
  return (...args) => {
    const now = performance.now();
    if (now - last < 60) return;
    last = now;
    send(...args);
  };
}

// Indexes are opened once per worker and kept: the next picture is solved without reading or generating anything again.
const opened = new Map();

function openIndex(key) {
  if (!opened.has(key)) {
    opened.set(key, (async () => {
      if (typeof DecompressionStream !== 'function') {
        throw new Error('This browser cannot open the InstaSlice star indexes. You can import a WCS from a local solver.');
      }
      try {
        const blob = await readIndexFile(indexUrls[key]);
        const magic = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
        const bytes = magic[0] === 31 && magic[1] === 139
          ? await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
          : await blob.arrayBuffer();
        return InstaSliceSolver.readIndex(bytes, key === 'wide');
      } catch (error) {
        // A failed read must not stay in the cache, so the next attempt starts again.
        opened.delete(key);
        if (optionalIndexes.has(key)) return null;
        throw error;
      }
    })());
  }
  return opened.get(key);
}

// The page asks for this as soon as an image is being prepared for the solver: the indexes are ready by the time the solve starts.
async function warmUp() {
  for (const key of ['deep', 'wide']) {
    try { await openIndex(key); } catch (_) { /* the solve reports it */ }
  }
}

async function run(job) {
  const loadIndex = openIndex;
  const onProgress = throttled((completed, total) => self.postMessage({ type:'progress', completed, total }));
  const mode = job.pano && job.pano.mode || 'off';
  const overview = { width:job.width, height:job.height, rgba:job.rgba };

  const canEnlarge = job.pano && Math.max(job.pano.width, job.pano.height) > Math.max(job.width, job.height) * 1.12;
  const ground = mode !== 'off' && job.width > 1.35*job.height ? InstaSlicePanorama.findHorizon(overview) : undefined;
  const preferPanorama = mode === 'auto' && (job.width >= 1.85*job.height || !!ground);
  const options = { ignoreFooter:job.footer === true, loadBrightStars };

  async function ordinary(fullSearch) {
    const first = await InstaSliceSolver.solve(overview, loadIndex, onProgress, fullSearch
      ? options : { ...options, wideOnly:true, timeLimit:2400 });
    if (first.header || !fullSearch || !canEnlarge) return first;
    try {
      const larger = await requestWindow({ whole:true, maxEdge:2400 });
      if (larger && larger.rgba && Math.max(larger.width, larger.height) > Math.max(job.width, job.height)*1.1) {
        const again = await InstaSliceSolver.solve(larger, loadIndex, () => {}, { ...options, timeLimit:8000 });
        if (again.header || !again.sparse) return again;
      }
    } catch (_) { /* the first result stands */ }
    return first;
  }

  const solved = result => self.postMessage({ type:'solution', ...result });
  const noMatch = (message, stats) => self.postMessage({ type:'error', recoverable:true, message, stats });
  const result = mode === 'force' ? null : await ordinary(!preferPanorama);
  if (result?.header) { solved(result); return; }
  if (result?.sparse && (!preferPanorama || !canEnlarge)) {
    noMatch('The InstaSlice solver found too few point-like stars. Try a sharper or wider image.');
    return;
  }
  if (mode === 'off') {
    noMatch('The InstaSlice solver found no verified match. Some small fields have too few indexed stars, and strong distortion can prevent matching. You can place pins by hand or import a WCS from a local solver.');
    return;
  }

  // The ordinary search is shortened for likely panoramas. If the panorama pass fails, give the standard search its full turn.
  self.postMessage({ type:'pano-start' });
  let lastReport = -1e9, lastLabel = '';
  const report = (fraction, label) => {            // a new label always goes through, so no stage is skipped
    const now = performance.now();
    if (label === lastLabel && now - lastReport < 60) return;
    lastReport = now; lastLabel = label;
    self.postMessage({ type:'pano', fraction, label });
  };
  const outcome = await InstaSlicePanorama.solvePanorama({
    overview, full:{ width:job.pano.width, height:job.pano.height },
    getCrop: async rect => {
      const reply = await requestWindow(rect);
      return { width:reply.width, height:reply.height, rgba:reply.rgba };
    },
    loadIndex, solver:InstaSliceSolver, report, ground, budget:54000
  });
  if (outcome.error) {
    if (preferPanorama && (outcome.fields?.length || 0) < 2) {
      report(.96, 'Checking the original projection…');
      const fallback = await ordinary(true);
      if (fallback.header) { solved(fallback); return; }
    }
    if (outcome.fields?.length) {
      self.postMessage({ type:'partial', fields:outcome.fields, stats:outcome.stats });
      return;
    }
    noMatch(outcome.error, outcome.stats);
    return;
  }
  const { model, area, info, stats } = outcome;
  self.postMessage({ type:'panorama', model, area, info, stats:{ ...stats, candidates:undefined }, solved:outcome.solved, tried:outcome.tried, elapsed:outcome.elapsed });
}

self.onmessage = async ({ data }) => {
  if (data && data.type === 'warm') { warmUp(); return; }
  if (data && data.type === 'window-pixels') {
    const waiting = pending.get(data.id);
    if (!waiting) return;
    pending.delete(data.id);
    if (data.error) waiting.reject(new Error(data.error));
    else waiting.resolve(data);
    return;
  }
  try {
    await run(data);
  } catch (error) {
    self.postMessage({ type:'error', message:error.message || 'The InstaSlice solver could not start.' });
  }
};
