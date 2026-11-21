/* On-device solver. Requests use fixed, same-origin public asset URLs. */
'use strict';

async function readAsset(path) {
  const url = new URL(path, self.location.href);
  const response = await fetch(url, {
    mode: 'same-origin',
    credentials: 'same-origin',
    referrerPolicy: 'no-referrer',
    redirect: 'error'
  });
  if (!response.ok) throw new Error('The offline solver file could not be loaded.');
  return response.arrayBuffer();
}

async function solveWithIndex(compressed, rgba, width, height, method, catalogue) {
  const decompressor = new DecompressionStream('gzip');
  const stream = new Blob([compressed]).stream().pipeThrough(decompressor);
  const index = await new Response(stream).arrayBuffer();
  const solver = new wasm_bindgen.PlateSolver(new Uint8Array(index));
  try {
    const result = method === 'solveQuick'
      ? solver.solveQuick(rgba, width, height, catalogue)
      : solver[method](rgba, width, height);
    return result ? JSON.parse(result) : null;
  } finally {
    solver.free();
  }
}

self.onmessage = async ({ data }) => {
  try {
    if (typeof WebAssembly !== 'object' || typeof DecompressionStream !== 'function') {
      throw new Error('This browser cannot run the offline solver. You can import a WCS from a local solver.');
    }
    self.postMessage({ type: 'status', message: 'Loading the offline solver and star indexes…' });
    importScripts('./tetra3-runtime.js?v=12');

    // Read the fixed public resources before examining the image. Catalogue
    // requests never reveal the selected search range or its result.
    const [wasm, wide, narrow, andromeda, deepSky, smallFields] = await Promise.allSettled([
      readAsset('./tetra3-runtime.wasm?v=12'),
      readAsset('./sky-index.bin.gz'),
      readAsset('./sky-index-narrow.bin.gz'),
      readAsset('./sky-index-andromeda.bin.gz'),
      readAsset('./sky-index-deepsky.bin.gz?v=8'),
      readAsset('./sky-index-small-fields.bin.gz?v=14')
    ]);
    const indexes = [wide, narrow, andromeda, deepSky, smallFields];
    if (wasm.status !== 'fulfilled' || indexes.every(index => index.status !== 'fulfilled')) {
      throw new Error('The offline star indexes could not be loaded. Connect once to save the app for offline use, or import a WCS from a local solver.');
    }
    await wasm_bindgen({ module_or_path: wasm.value });

    const rgba = new Uint8Array(data.rgba.buffer, data.rgba.byteOffset, data.rgba.byteLength);
    self.postMessage({ type: 'status', message: 'Looking for a reliable star match on this device…' });
    for (const catalogue of [0, 1, 3, 2]) {
      const pack = indexes[catalogue];
      if (pack.status !== 'fulfilled') continue;
      try {
        const result = await solveWithIndex(pack.value, rgba, data.width, data.height, 'solveQuick', catalogue);
        if (result) {
          self.postMessage({ type: 'solution', ...result });
          return;
        }
      } catch {
        // Retry with the full search before reporting an unreadable index.
      }
    }

    if (smallFields.status === 'fulfilled') {
      self.postMessage({ type: 'status', message: 'Checking smaller star patterns on this device…' });
      try {
        const variants = [rgba];
        if (data.footer === true) {
          // Clear the footer in a temporary copy. The image and WCS keep their full size.
          const masked = rgba.slice();
          masked.fill(0, Math.floor(data.height * 0.90) * data.width * 4);
          variants.unshift(masked);
        }
        for (const pixels of variants) {
          const result = await solveWithIndex(smallFields.value, pixels, data.width, data.height, 'solveSmallField');
          if (result) {
            result.stats.small_field_catalogue = true;
            if (pixels !== rgba) result.stats.footer_masked = true;
            self.postMessage({ type: 'solution', ...result });
            return;
          }
        }
      } catch {
        // The other indexes remain usable if the small-field index cannot be read.
      } finally {
        smallFields.value = null;
      }
    }

    let failure;
    const searches = [
      [wide, 'solve', 'Detecting stars and solving on this device…'],
      [narrow, 'solveNarrow', 'Checking smaller telescope fields on this device…'],
      [andromeda, 'solveCloseUp', 'Checking close-up fields near Andromeda…'],
      [deepSky, 'solveDeepSky', 'Checking close-up deep-sky fields on this device…']
    ];
    const upperSky = [wide, 'solveUpperSky', 'Checking the sky above the foreground on this device…'];
    // In a tall frame, the upper sky is often a better next attempt than a narrow-field search.
    searches.splice(data.height >= 1.35 * data.width ? 1 : searches.length, 0, upperSky);
    for (const [pack, method, status] of searches) {
      if (pack.status !== 'fulfilled') continue;
      self.postMessage({
        type: 'status',
        message: status
      });
      try {
        const result = await solveWithIndex(pack.value, rgba, data.width, data.height, method);
        if (!result) continue;
        self.postMessage({ type: 'solution', ...result });
        return;
      } catch (error) {
        failure = error;
      } finally {
        if (pack !== wide || method === 'solveUpperSky') pack.value = null;
      }
    }
    if (indexes.some(pack => pack.status !== 'fulfilled')) {
      throw new Error('No match in the available star indexes. Connect once to save the remaining star data, or import a WCS from a local solver.');
    }
    throw failure;
  } catch (error) {
    const message = typeof error === 'string' ? error : error && error.message;
    self.postMessage({ type: 'error', message: message || 'The offline solver could not complete the request.' });
  }
};
