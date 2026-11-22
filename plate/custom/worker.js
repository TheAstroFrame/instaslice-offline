'use strict';

importScripts('./solver.js?v=1');

const indexUrls = {
  deep: './deep.isq.gz?v=1',
  wide: './wide.isq.gz?v=1'
};

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

self.onmessage = async ({ data }) => {
  try {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('This browser cannot open the InstaSlice star indexes. You can import a WCS from a local solver.');
    }
    // Request both public files at fixed URLs before looking at the pixels.
    const keys = Object.keys(indexUrls);
    const files = await Promise.all(keys.map(key => readIndexFile(indexUrls[key])));
    const packs = new Map(keys.map((key, index) => [key, files[index]]));
    const loadIndex = async key => {
      const blob = packs.get(key);
      const magic = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
      let bytes;
      if (magic[0] === 31 && magic[1] === 139) {
        bytes = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      } else {
        bytes = await blob.arrayBuffer();
      }
      packs.delete(key);
      return InstaSliceSolver.readIndex(bytes, key === 'wide');
    };
    const onProgress = (completed, total) => self.postMessage({ type:'progress', completed, total });
    const result = await InstaSliceSolver.solve(data, loadIndex, onProgress, { ignoreFooter:data.footer === true });
    if (result.header) self.postMessage({ type:'solution', ...result });
    else self.postMessage({ type:'error', message: result.sparse
      ? 'InstaSlice Beta found too few point-like stars. Try a sharper or wider image.'
      : 'InstaSlice Beta found no verified match. Try the Standard solver or import a WCS from a local solver.' });
  } catch (error) {
    self.postMessage({ type:'error', message:error.message || 'The InstaSlice solver could not start.' });
  }
};
