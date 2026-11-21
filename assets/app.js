(() => {
  const canvas = document.getElementById('editorCanvas');
  const ctx = canvas.getContext('2d');
  const collageCanvas = document.getElementById('collageCanvas');
  const colCtx = collageCanvas.getContext('2d');

  // App State
  const state = {
    appMode: 'slicer', // 'slicer' | 'collage'
    img: null,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    rot90: 0,
    fineAngle: 0,
    direction: 'horiz', // 'horiz' | 'vert'
    reverseOrder: false,
    aspect: '3:4',
    sliceCount: 3,
    fitMargin: 0.06,
    fitBg: 'blur',
    fitBlur: 38,        // 0..100 px
    showBlurOnMain: false,
    exportWidth: 1080,
    exportFormat: 'jpeg',
    slides: [],
    detailBoxes: [],
    // Image Annotations & Telemetry State (Pro Observatory Suite)
    annotations: [],    // { id, nx, ny, title, sub, style, color, fontFamily, bgStyle, dir, sizeMult, radMult }
    markersVisible: true,
    annotationAspect: 'original',
    annZoom: 1,
    annCx: 0.5,
    annCy: 0.5,
    starSolve: null,
    starCandidates: [],
    skyMode: 'stars',        // Annotate > Solve: 'stars' | 'moon'
    moon: null,              // detected lunar disc + orientation (working-canvas pixels)
    moonCandidates: [],
    moonRefs: [],            // craters the user tapped to fine-tune the fit
    moonTap: null,           // feature the next tap on the picture belongs to
    starSolveController: null,
    starSolveToken: 0,
    selectedPinId: null,
    syncAllPins: true,
    annDraftStyle: 'atlas',
    annDraftColor: '#EAF2FF',
    annBaseColor: '#EAF2FF',   // the colour the person chose for general use (type colours are applied on top of it)
    annDraftFont: "'Inter', -apple-system, 'Segoe UI', Roboto, sans-serif",
    annDraftBg: 'shelf',   // 'shelf' (line) | 'glass' | 'pure' (none) | 'solid'
    annDraftDir: 'tr',     // preferred side: 'tr' | 'tl' | 'br' | 'bl'
    annDraftSize: 1.0,     // 0.5 .. 2.2
    annDraftRadius: 1.0,   // 0.2 .. 8
    annDraftWeight: 600,   // 300 .. 700
    annDraftCase: 'normal', // 'normal' | 'upper'
    annDraftTrack: 0,      // letter spacing in em, 0 .. 0.3
    annDraftTextMode: 'light', // 'light' | 'marker' | 'dark' | 'custom'
    annDraftTextHex: '#FFFFFF',
    annDraftLine: 1,       // line weight multiplier, 0.5 .. 4
    annDraftIn: 'out',     // label 'out'side or 'in'side the circle
    annShowSub: true,
    annLayoutMode: 'auto', // 'auto' | 'near' | 'columns'
    annColorByType: false,
    moonRing: 'guide',     // Moon outline: 'off' | 'guide' (preview only) | 'image' (also on the saved picture)
    placingPinMode: false,
    draggingPinId: null,
    telemetryMode: 'off',  // 'off' | 'bar' | 'top' | 'corner' | 'frame'
    telemetryTitle: 'Melotte 15 • Heart Nebula',
    telemetrySpecs: 'Seestar S50 • 12h Dual-Band',
    telemetryCatalog: 'IC 1805 • SHO',
    // 3D CineReel Video State
    reelPreset: 'monolithrise',
    reelDest: null,          // arrival photo for Hyperjump / Warp Spiral: { canvas, name, thumb, id }
    reelFraming: 'original', // 'original' | 'cover916' | 'cover45' | 'fitblur'
    reelGrid: 6,
    reelDuration: 7,
    reelZoomMax: 2.4,        // 1.2x - 5.0x
    reelCurve: {},           // speed curve chosen per preset, e.g. { stardive: 'quint' }; a preset without an entry uses its own
    reelStarSize: 1.2,       // 0.5x - 3.5x Star Diameter Multiplier
    reelStarGlow: 1.2,       // 0.0x - 3.0x Star Photometric Intensity Multiplier
    undoStack: [],           // History stack for undoing frame/image movements
    reelSpikes: true,        // Toggle diffraction spikes On / Off (Apo pinpoint)
    reelFps: 30,             // 30 FPS (TikTok CFR Smooth Standard) | 60 FPS
    reelVideoRes: 1080,      // 1080 (FHD) | 1440 (2K QHD) | 2160 (4K UHD)
    reelTargetX: 0.5,
    reelTargetY: 0.48,
    reelPlaying: false,
    reelRecording: false,
    lastVideoFile: null,
    lastVideoUrl: null
  };

  const ASPECT_MAP = {
    '4:5': 4 / 5,
    '3:4': 3 / 4,
    '1:1': 1,
    '9:16': 9 / 16
  };

  // True Planckian Blackbody Stellar Spectral Colors (O, B, A, F, G, K, M classes)
  const SPECTRAL_PALETTE = [
    { name: 'OBlue',   r: 155, g: 192, b: 255 }, // 30,000K O-type
    { name: 'BCyan',   r: 185, g: 218, b: 255 }, // 15,000K B-type
    { name: 'AWhite',  r: 242, g: 247, b: 255 }, // 9,500K A-type
    { name: 'FCream',  r: 255, g: 249, b: 238 }, // 6,800K F-type
    { name: 'GGold',   r: 255, g: 230, b: 182 }, // 5,800K G-type
    { name: 'KOrange', r: 255, g: 196, b: 138 }, // 4,400K K-type
    { name: 'MRed',    r: 255, g: 166, b: 118 }  // 3,400K M-type giant
  ];

  // Restore saved Notch Padding
  const savedNotch = localStorage.getItem('instaslice_notch') || '52px';
  document.documentElement.style.setProperty('--notch-pad', savedNotch);
  document.querySelectorAll('#notchGroup .seg-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.notch === savedNotch);
  });

  function showToast(msg, ms) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => t.classList.remove('show'), ms || 1600);
  }

  // =========================================================================
  // UNDO MOVEMENT HISTORY ENGINE (Multi-Step Snapshot Stack)
  // =========================================================================
  let pendingGestureSnapshot = null;
  let burstUndoArmed = false;
  let burstUndoTimer = null;

  function getTransformSnapshot() {
    annSyncView();
    return {
      scale: state.scale,
      offsetX: state.offsetX,
      offsetY: state.offsetY,
      rot90: state.rot90,
      fineAngle: state.fineAngle,
      direction: state.direction,
      reverseOrder: state.reverseOrder,
      aspect: state.aspect,
      sliceCount: state.sliceCount,
      annotationAspect: state.annotationAspect,
      annZoom: state.annZoom,
      annCx: state.annCx,
      annCy: state.annCy,
      annotations: JSON.parse(JSON.stringify(state.annotations))
    };
  }

  function snapshotsEqual(a, b) {
    if (!a || !b) return false;
    return Math.abs(a.scale - b.scale) < 1e-4 &&
           Math.abs(a.offsetX - b.offsetX) < 0.5 &&
           Math.abs(a.offsetY - b.offsetY) < 0.5 &&
           a.rot90 === b.rot90 &&
           Math.abs(a.fineAngle - b.fineAngle) < 0.05 &&
           a.direction === b.direction &&
           a.reverseOrder === b.reverseOrder &&
           a.aspect === b.aspect &&
           a.sliceCount === b.sliceCount &&
           a.annotationAspect === b.annotationAspect &&
           (a.annotationAspect === 'original' ||
            (Math.abs(a.annZoom - b.annZoom) < 1e-4 &&
             Math.abs(a.annCx - b.annCx) < 1e-5 &&
             Math.abs(a.annCy - b.annCy) < 1e-5)) &&
           JSON.stringify(a.annotations) === JSON.stringify(b.annotations);
  }

  function updateUndoButtonUI() {
    const btn = document.getElementById('btnUndoMove');
    if (!btn) return;
    const hasHistory = state.undoStack.length > 0;
    btn.disabled = !hasHistory;
    btn.classList.toggle('undo-ready', hasHistory);
    const ab = document.getElementById('btnAnnUndo');
    if (ab) { ab.disabled = !hasHistory; ab.classList.toggle('undo-ready', hasHistory); }
  }

  function pushUndoSnapshot(snap) {
    if (!snap) return;
    const top = state.undoStack[state.undoStack.length - 1];
    if (top && snapshotsEqual(top, snap)) return;
    state.undoStack.push(snap);
    if (state.undoStack.length > 40) state.undoStack.shift();
    updateUndoButtonUI();
  }

  function saveUndoBeforeAction() {
    if (!state.img) return;
    pushUndoSnapshot(getTransformSnapshot());
  }

  function saveUndoBurst() {
    if (!state.img) return;
    if (!burstUndoArmed) {
      pushUndoSnapshot(getTransformSnapshot());
      burstUndoArmed = true;
    }
    clearTimeout(burstUndoTimer);
    burstUndoTimer = setTimeout(() => {
      burstUndoArmed = false;
    }, 450);
  }

  function undoLastMove() {
    if (state.undoStack.length === 0) return;
    const prev = state.undoStack.pop();
    turnReelAimCW(((((prev.rot90 - state.rot90) % 360) + 360) % 360) / 90);   // the Reel's target follows an undone turn
    state.scale = prev.scale;
    state.offsetX = prev.offsetX;
    state.offsetY = prev.offsetY;
    state.rot90 = prev.rot90;
    state.fineAngle = prev.fineAngle;
    state.direction = prev.direction;
    state.reverseOrder = prev.reverseOrder;
    state.aspect = prev.aspect;
    state.sliceCount = prev.sliceCount;
    cancelAnimationFrame(annAnim);
    annSyncView();
    state.annotationAspect = prev.annotationAspect;
    state.annZoom = prev.annZoom;
    state.annCx = prev.annCx;
    state.annCy = prev.annCy;
    state.annotations = JSON.parse(JSON.stringify(prev.annotations));

    // Sync UI controls with restored state
    document.getElementById('dirHoriz').classList.toggle('active', state.direction === 'horiz');
    document.getElementById('dirVert').classList.toggle('active', state.direction === 'vert');
    const revBtn = document.getElementById('btnRevOrder');
    revBtn.textContent = state.reverseOrder ? 'N→1' : '1→N';
    revBtn.classList.toggle('toggle-on', state.reverseOrder);

    document.querySelectorAll('#ratioGroup .seg-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.ratio === state.aspect);
    });
    document.querySelectorAll('#countGroup .seg-btn').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.count, 10) === state.sliceCount);
    });
    document.getElementById('rngAngle').value = state.fineAngle;
    document.getElementById('lblAngle').textContent = `${state.fineAngle.toFixed(1)}°`;
    document.getElementById('annotationAspect').value = state.annotationAspect;

    updatePrimaryButtonLabel();
    renderAnnotationList();
    updateUndoButtonUI();
    if (state.appMode === 'annotate') updateAnnotationExportUI();
    renderCanvas();
    if (state.appMode === 'reel') { setupReelPreviewCanvas(); updateReelAimHintUI(); }
    showToast('Undid last movement');
  }

  // ---- Turning the whole picture: Slicer button, R key and the 3D Reel button all come through here ----
  // Everything stored relative to the picture (marker pins, the Reel's zoom target) turns with it, so each
  // marker stays on its object and the Reel keeps aiming at the same spot.
  const ANN_DIR_CW = { tr: 'br', br: 'bl', bl: 'tl', tl: 'tr' };
  function turnReelAimCW(quarterTurns) {
    for (let k = 0; k < quarterTurns; k++) {
      const px = state.reelTargetX;
      state.reelTargetX = clamp01(1 - state.reelTargetY);
      state.reelTargetY = clamp01(px);
    }
  }
  function turnPictureSpaceCW(quarterTurns) {
    for (let k = 0; k < quarterTurns; k++) {
      state.annotations.forEach(a => {
        const px = a.nx;
        a.nx = 1 - a.ny;
        a.ny = px;
        if (a.lman && Number.isFinite(a.lx) && Number.isFinite(a.ly)) {
          const labelX = a.lx;
          a.lx = 1 - a.ly;
          a.ly = labelX;
        }
        if (ANN_DIR_CW[a.dir]) a.dir = ANN_DIR_CW[a.dir];
      });
    }
    turnReelAimCW(quarterTurns);
    try { annHist.clear(); } catch (_) {}
  }
  function straightenImage(angle) {
    const delta = (angle - state.fineAngle) * Math.PI / 180;
    if (state.img && delta) {
      const { w, h } = getTransformedDims();
      const cos = Math.cos(delta), sin = Math.sin(delta);
      const rotatePoint = (nx, ny) => {
        const x = (nx - 0.5) * w, y = (ny - 0.5) * h;
        return [(x * cos - y * sin) / w + 0.5, (x * sin + y * cos) / h + 0.5];
      };
      for (const pin of state.annotations) {
        // Keep anchors beyond the frame so returning the slider brings them back.
        [pin.nx, pin.ny] = rotatePoint(pin.nx, pin.ny);
        if (pin.lman && Number.isFinite(pin.lx) && Number.isFinite(pin.ly)) {
          [pin.lx, pin.ly] = rotatePoint(pin.lx, pin.ly);
        }
      }
      annHist.clear();
    }
    state.fineAngle = angle;
  }
  function rotateMainImage90() {
    if (!state.img) return false;
    if (state.reelRecording) { showToast('Wait for the video render to finish before rotating'); return false; }
    saveUndoBeforeAction();
    state.showBlurOnMain = false;
    state.rot90 = (state.rot90 + 90) % 360;
    turnPictureSpaceCW(1);
    if (state.appMode === 'slicer') fitImageToCrop();
    else {
      state._refitOnEnter = true;
      if (state.appMode === 'annotate') {
        updateAnnotationExportUI();
        renderCanvas();
      }
    }
    if (state.appMode === 'reel') {
      setupReelPreviewCanvas();                           // new picture shape, new texture
      document.getElementById('btnSaveRenderedVideo').classList.remove('visible');
      reelAccumMs = 0; reelLastTickTime = performance.now();
      updateReelAimHintUI();
    }
    return true;
  }

  // CSS pixels at the bottom of the stage that the toolbar covers (the picture is kept clear of it)
  function stageBottomPad() {
    const ws = document.getElementById('workspace');
    if (!ws) return 44;
    const wr = ws.getBoundingClientRect();
    let top = wr.bottom;
    document.querySelectorAll('.canvas-hud').forEach(h => {
      if (!h.offsetWidth) return;
      const r = h.getBoundingClientRect();
      if (r.top < top) top = r.top;
    });
    const pad = wr.bottom - top;
    return pad > 0 ? Math.ceil(pad) + 8 : 44;
  }

  // CSS pixels at the top of the stage that the floating hint / status pills cover (only worth reserving on roomy stages)
  function stageTopPad() {
    const ws = document.getElementById('workspace');
    return ws && ws.clientHeight >= 560 ? 46 : 12;
  }

  function syncCanvasSize() {
    const ws = document.getElementById('workspace');
    const rect = ws.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.dpr = dpr;
    const targetW = Math.round(rect.width * dpr);
    const targetH = Math.round(rect.height * dpr);
    let changed = false;
    if (canvas.width !== targetW || canvas.height !== targetH) {
      if (!state._resizePrev && state._lastCrop) state._resizePrev = state._lastCrop;
      canvas.width = targetW;
      canvas.height = targetH;
      changed = true;
    }
    if (collageCanvas.width !== targetW || collageCanvas.height !== targetH) {
      collageCanvas.width = targetW;
      collageCanvas.height = targetH;
      changed = true;
    }
    return changed;
  }

  // when the stage changes size the picture keeps its framing (scaled with the crop box) instead of snapping back to "fit"
  function refitKeepingView(prev) {
    if (!state.img || !canvas.width) return;
    const crop = getCropRect();
    if (prev && prev.w > 20 && prev.h > 20 && crop.w > 20 && crop.h > 20) {
      const kw = crop.w / prev.w, kh = crop.h / prev.h;
      if (isFinite(kw) && kw > 0.15 && kw < 6 && Math.abs(kw - kh) / kw < 0.03) {
        state.scale *= kw;
        state.offsetX *= kw;
        state.offsetY *= kw;
        clampSlicerTransform();
        renderCanvas();
        return;
      }
    }
    fitImageToCrop();
  }

  const wsObserver = new ResizeObserver(() => {
    const changed = syncCanvasSize() || !!state._resizePrev;
    const prev = state._resizePrev;
    state._resizePrev = null;
    if (changed && state.img) {
      if (state.appMode === 'collage') {
        renderCollagePreview();
      } else if (state.appMode === 'reel') {
        if (!state.reelRecording) setupReelPreviewCanvas();
      } else {
        refitKeepingView(prev);
      }
    }
  });
  wsObserver.observe(document.getElementById('workspace'));

  // =========================================================================
  // TRUE MOFFAT PSF STAR KERNEL GENERATOR (PixInsight / Optical Telescope Grade)
  // =========================================================================
  let moffatKernels = null;
  let moffatSpikeKernels = null;

  function buildMoffatStarKernels() {
    if (moffatKernels && moffatSpikeKernels) return moffatKernels;
    moffatKernels = [];
    moffatSpikeKernels = [];

    const size = 48;
    const half = size / 2;
    const alpha = 3.2;
    const beta = 2.65;

    const spikeCanvasSize = 96;
    const spikeHalf = spikeCanvasSize / 2;

    SPECTRAL_PALETTE.forEach(spec => {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const kctx = c.getContext('2d');
      const imgData = kctx.createImageData(size, size);
      const data = imgData.data;

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const dx = x - half + 0.5;
          const dy = y - half + 0.5;
          const r = Math.hypot(dx, dy);
          if (r >= half) continue;

          const moffat = Math.pow(1 + (r * r) / (alpha * alpha), -beta);
          const windowEdge = Math.pow(Math.max(0, 1 - r / half), 2);
          const flux = moffat * windowEdge;

          const coreMix = Math.exp(-(r * r) / 4.2);
          const pr = Math.round(255 * coreMix + spec.r * (1 - coreMix));
          const pg = Math.round(255 * coreMix + spec.g * (1 - coreMix));
          const pb = Math.round(255 * coreMix + spec.b * (1 - coreMix));

          const idx = (y * size + x) * 4;
          data[idx] = pr;
          data[idx + 1] = pg;
          data[idx + 2] = pb;
          data[idx + 3] = Math.min(255, Math.round(Math.pow(flux, 0.72) * 255));
        }
      }
      kctx.putImageData(imgData, 0, 0);
      moffatKernels.push(c);

      // Pre-bake high-precision Diffraction Spikes + Moffat Core into a 96x96 GPU texture (Zero per-frame GC!)
      const sc = document.createElement('canvas');
      sc.width = spikeCanvasSize;
      sc.height = spikeCanvasSize;
      const sctx = sc.getContext('2d');
      sctx.drawImage(c, spikeHalf - half * 0.65, spikeHalf - half * 0.65, size * 0.65, size * 0.65);

      const mainLen = spikeHalf * 0.94;
      for (let a = 0; a < 2; a++) {
        sctx.save();
        sctx.translate(spikeHalf, spikeHalf);
        sctx.rotate(a * Math.PI / 2);
        const grad = sctx.createLinearGradient(-mainLen, 0, mainLen, 0);
        grad.addColorStop(0.0, `rgba(${spec.r}, ${spec.g}, ${spec.b}, 0)`);
        grad.addColorStop(0.26, `rgba(${spec.r}, ${spec.g}, ${spec.b}, 0.36)`);
        grad.addColorStop(0.46, `rgba(255, 255, 255, 0.92)`);
        grad.addColorStop(0.50, `rgba(255, 255, 255, 1.0)`);
        grad.addColorStop(0.54, `rgba(255, 255, 255, 0.92)`);
        grad.addColorStop(0.74, `rgba(${spec.r}, ${spec.g}, ${spec.b}, 0.36)`);
        grad.addColorStop(1.0, `rgba(${spec.r}, ${spec.g}, ${spec.b}, 0)`);
        sctx.strokeStyle = grad;
        sctx.lineWidth = 1.35;
        sctx.beginPath();
        sctx.moveTo(-mainLen, 0);
        sctx.lineTo(mainLen, 0);
        sctx.stroke();
        sctx.restore();
      }

      const diagLen = mainLen * 0.36;
      for (let a = 0; a < 2; a++) {
        sctx.save();
        sctx.translate(spikeHalf, spikeHalf);
        sctx.rotate(Math.PI / 4 + a * Math.PI / 2);
        const grad2 = sctx.createLinearGradient(-diagLen, 0, diagLen, 0);
        grad2.addColorStop(0.0, `rgba(${spec.r}, ${spec.g}, ${spec.b}, 0)`);
        grad2.addColorStop(0.5, `rgba(255, 255, 255, 0.55)`);
        grad2.addColorStop(1.0, `rgba(${spec.r}, ${spec.g}, ${spec.b}, 0)`);
        sctx.strokeStyle = grad2;
        sctx.lineWidth = 0.9;
        sctx.beginPath();
        sctx.moveTo(-diagLen, 0);
        sctx.lineTo(diagLen, 0);
        sctx.stroke();
        sctx.restore();
      }

      moffatSpikeKernels.push(sc);
    });

    return moffatKernels;
  }

  // Analytical Razor-Thin Diffraction Spikes (Only called when state.reelSpikes === true)
  function drawOpticalDiffractionSpikes(targetCtx, sx, sy, spikeLen, spec, alpha, angleOffset = 0) {
    if (!state.reelSpikes || spikeLen < 4 || alpha <= 0.03) return;
    targetCtx.save();
    targetCtx.translate(sx, sy);
    targetCtx.rotate(angleOffset);

    for (let a = 0; a < 2; a++) {
      targetCtx.save();
      targetCtx.rotate(a * Math.PI / 2);

      const grad = targetCtx.createLinearGradient(-spikeLen, 0, spikeLen, 0);
      grad.addColorStop(0.0, `rgba(${spec.r}, ${spec.g}, ${spec.b}, 0)`);
      grad.addColorStop(0.28, `rgba(${spec.r}, ${spec.g}, ${spec.b}, ${alpha * 0.38})`);
      grad.addColorStop(0.46, `rgba(255, 255, 255, ${alpha * 0.92})`);
      grad.addColorStop(0.50, `rgba(255, 255, 255, ${alpha})`);
      grad.addColorStop(0.54, `rgba(255, 255, 255, ${alpha * 0.92})`);
      grad.addColorStop(0.72, `rgba(${spec.r}, ${spec.g}, ${spec.b}, ${alpha * 0.38})`);
      grad.addColorStop(1.0, `rgba(${spec.r}, ${spec.g}, ${spec.b}, 0)`);

      targetCtx.strokeStyle = grad;
      targetCtx.lineWidth = 0.9;
      targetCtx.beginPath();
      targetCtx.moveTo(-spikeLen, 0);
      targetCtx.lineTo(spikeLen, 0);
      targetCtx.stroke();
      targetCtx.restore();
    }

    const subLen = spikeLen * 0.36;
    if (subLen > 5) {
      for (let a = 0; a < 2; a++) {
        targetCtx.save();
        targetCtx.rotate(Math.PI / 4 + a * Math.PI / 2);
        const grad2 = targetCtx.createLinearGradient(-subLen, 0, subLen, 0);
        grad2.addColorStop(0.0, `rgba(${spec.r}, ${spec.g}, ${spec.b}, 0)`);
        grad2.addColorStop(0.5, `rgba(255, 255, 255, ${alpha * 0.55})`);
        grad2.addColorStop(1.0, `rgba(${spec.r}, ${spec.g}, ${spec.b}, 0)`);
        targetCtx.strokeStyle = grad2;
        targetCtx.lineWidth = 0.65;
        targetCtx.beginPath();
        targetCtx.moveTo(-subLen, 0);
        targetCtx.lineTo(subLen, 0);
        targetCtx.stroke();
        targetCtx.restore();
      }
    }

    targetCtx.restore();
  }

  // Generate Procedural Deep-Sky Nebula Demo Image
  function loadDemoImage(autoSlice = true) {
    const kernels = buildMoffatStarKernels();
    const off = document.createElement('canvas');
    off.width = 2400;
    off.height = 1500;
    const octx = off.getContext('2d');

    const bg = octx.createRadialGradient(1200, 750, 100, 1200, 750, 1450);
    bg.addColorStop(0, '#1a102e');
    bg.addColorStop(0.5, '#090b17');
    bg.addColorStop(1, '#020307');
    octx.fillStyle = bg;
    octx.fillRect(0, 0, off.width, off.height);

    const clouds = [
      { x: 850, y: 780, r: 680, c1: 'rgba(249, 115, 22, 0.44)', c2: 'rgba(236, 72, 153, 0.14)' },
      { x: 1480, y: 680, r: 650, c1: 'rgba(56, 189, 248, 0.38)', c2: 'rgba(139, 92, 246, 0.15)' },
      { x: 1180, y: 740, r: 440, c1: 'rgba(251, 191, 36, 0.38)', c2: 'rgba(244, 63, 94, 0.10)' }
    ];
    octx.globalCompositeOperation = 'screen';
    clouds.forEach(c => {
      const g = octx.createRadialGradient(c.x, c.y, 20, c.x, c.y, c.r);
      g.addColorStop(0, c.c1);
      g.addColorStop(0.6, c.c2);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      octx.fillStyle = g;
      octx.beginPath();
      octx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      octx.fill();
    });

    octx.globalCompositeOperation = 'source-over';
    const pillars = [
      { x: 960, y: 1150, w: 95, h: 520 },
      { x: 1170, y: 1150, w: 130, h: 640 },
      { x: 1380, y: 1150, w: 85, h: 430 }
    ];
    pillars.forEach(p => {
      const pg = octx.createLinearGradient(p.x, p.y - p.h, p.x, p.y);
      pg.addColorStop(0, 'rgba(251, 146, 60, 0.85)');
      pg.addColorStop(0.15, 'rgba(15, 12, 22, 0.92)');
      pg.addColorStop(1, 'rgba(4, 5, 10, 0.98)');
      octx.fillStyle = pg;
      octx.beginPath();
      octx.roundRect(p.x - p.w / 2, p.y - p.h, p.w, p.h, 48);
      octx.fill();
    });

    octx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 1800; i++) {
      const sx = Math.random() * off.width;
      const sy = Math.random() * off.height;
      const spec = SPECTRAL_PALETTE[i % SPECTRAL_PALETTE.length];
      const r = 0.55 + Math.pow(Math.random(), 3.2) * 1.4;
      octx.fillStyle = `rgba(${spec.r}, ${spec.g}, ${spec.b}, ${0.22 + Math.random() * 0.65})`;
      octx.beginPath();
      octx.arc(sx, sy, r, 0, Math.PI * 2);
      octx.fill();
    }

    for (let i = 0; i < 420; i++) {
      const sx = Math.random() * off.width;
      const sy = Math.random() * off.height;
      const specIdx = (i * 11) % SPECTRAL_PALETTE.length;
      const spec = SPECTRAL_PALETTE[specIdx];
      const isCatalog = i < 32;
      const kSize = isCatalog ? (16 + Math.random() * 16) : (5 + Math.pow(Math.random(), 2.6) * 11);
      const alpha = isCatalog ? (0.85 + Math.random() * 0.15) : (0.35 + Math.random() * 0.65);

      octx.globalAlpha = alpha;
      octx.drawImage(kernels[specIdx], sx - kSize / 2, sy - kSize / 2, kSize, kSize);

      if (isCatalog && state.reelSpikes) {
        drawOpticalDiffractionSpikes(octx, sx, sy, kSize * 1.85, spec, alpha * 0.85, 0);
      }
    }
    octx.globalAlpha = 1;
    octx.globalCompositeOperation = 'source-over';

    const img = new Image();
    img.onload = () => {
      state.img = img;
      resetStarSolveUI();
      state.rot90 = 0;
      state.fineAngle = 0;
      state.detailBoxes = [];
      state.undoStack = [];
      updateUndoButtonUI();
      document.getElementById('rngAngle').value = 0;
      document.getElementById('lblAngle').textContent = '0.0°';
      syncCanvasSize();
      fitImageToCrop();
      if (autoSlice) generateSlices();
    };
    img.src = off.toDataURL('image/jpeg', 0.96);
  }

  function getCropRect() {
    syncCanvasSize();
    const dpr = state.dpr;
    const cw = canvas.width;
    const ch = canvas.height;
    const padX = 18 * dpr;
    const padTop = stageTopPad() * dpr;
    const padBot = stageBottomPad() * dpr;
    const availW = Math.max(60 * dpr, cw - padX * 2);
    const availH = Math.max(60 * dpr, ch - padTop - padBot);

    const singleAspect = ASPECT_MAP[state.aspect];
    const totalAspect = state.direction === 'horiz'
      ? singleAspect * state.sliceCount
      : singleAspect / state.sliceCount;

    let boxW = availW;
    let boxH = boxW / totalAspect;
    if (boxH > availH) {
      boxH = availH;
      boxW = boxH * totalAspect;
    }

    const boxX = (cw - boxW) / 2;
    const boxY = padTop + (availH - boxH) / 2;
    state._lastCrop = { w: boxW, h: boxH };
    return { x: boxX, y: boxY, w: boxW, h: boxH, singleAspect, totalAspect };
  }

  function getTransformedDims() {
    if (!state.img) return { w: 1920, h: 1200 };
    const swapped = (state.rot90 % 180) !== 0;
    return {
      w: swapped ? state.img.height : state.img.width,
      h: swapped ? state.img.width : state.img.height
    };
  }

  function normalizeHexColor(raw) {
    let clean = String(raw || '').trim().replace(/[^0-9a-fA-F]/g, '').toUpperCase();
    if (clean.length === 3) {
      clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
    }
    return clean.length === 6 ? `#${clean}` : null;
  }

  // Strict Mathematical Boundary Clamping for Slicer (Prevents empty borders/bands even when rotated)
  function clampSlicerTransform() {
    if (!state.img || !canvas.width) return;
    const crop = getCropRect();
    const dims = getTransformedDims();
    const rad = (Math.abs(state.fineAngle || 0) * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);

    const reqW = crop.w * cosA + crop.h * sinA;
    const reqH = crop.w * sinA + crop.h * cosA;
    const minScale = Math.max(reqW / dims.w, reqH / dims.h);

    if (state.scale < minScale) state.scale = minScale;
    if (state.scale > 30) state.scale = 30;

    const maxOffX = Math.max(0, (dims.w * state.scale - reqW) / 2);
    const maxOffY = Math.max(0, (dims.h * state.scale - reqH) / 2);

    state.offsetX = Math.max(-maxOffX, Math.min(maxOffX, state.offsetX));
    state.offsetY = Math.max(-maxOffY, Math.min(maxOffY, state.offsetY));
  }

  function fitImageToCrop() {
    if (!state.img) return;
    syncCanvasSize();
    if (!canvas.width) return;
    const crop = getCropRect();
    const dims = getTransformedDims();
    const scaleX = crop.w / dims.w;
    const scaleY = crop.h / dims.h;
    state.scale = Math.max(scaleX, scaleY);
    state.offsetX = 0;
    state.offsetY = 0;
    clampSlicerTransform();
    renderCanvas();
  }

  function setZoom100() {
    if (!state.img || !canvas.width) return;
    const crop = getCropRect();
    const sliceScreenW = state.direction === 'horiz' ? (crop.w / state.sliceCount) : crop.w;
    state.scale = sliceScreenW / state.exportWidth;
    clampSlicerTransform();
    renderCanvas();
  }

  // =========================================================================
  // ASTROPHOTOGRAPHY & OBJECT ANNOTATION RENDERER
  // =========================================================================
  // Draws source image AND any active Target Annotation Pins locked to normalized (nx, ny)
  function drawSourceTransformed(targetCtx, cx, cy, scale, includeAnnotations = true) {
    if (!state.img) return;
    targetCtx.save();
    targetCtx.translate(cx, cy);
    const totalRad = ((state.rot90 + state.fineAngle) * Math.PI) / 180;
    targetCtx.rotate(totalRad);
    targetCtx.scale(scale, scale);
    targetCtx.drawImage(state.img, -state.img.width / 2, -state.img.height / 2);
    targetCtx.restore();

    if (includeAnnotations && annHasOverlay()) {
      drawAnnotationsOverlay(targetCtx, cx, cy, scale);
    }
  }

  function hexToRgba(hex, alpha) {
    const clean = (hex || '#38BDF8').replace('#', '');
    if (clean.length !== 6) return `rgba(56, 189, 248, ${alpha})`;
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // Draw Astrophotography Telemetry Bar / Corner Badge / Museum Frame on Exported Slides or Video
  function drawTelemetryOverlay(targetCtx, outW, outH) {
    const fontFam = state.annDraftFont || "'JetBrains Mono', monospace";
    if (state.telemetryMode === 'off') return;
    const title = (state.telemetryTitle || '').trim();
    const specs = (state.telemetrySpecs || '').trim();
    const catBadge = (state.telemetryCatalog || '').trim();
    if (!title && !specs && !catBadge) return;

    const u = Math.max(14, outW * 0.022);
    targetCtx.save();

    // MODE 1 & 2: BOTTOM GLASS BAR ('bar') OR TOP EDITORIAL BAR ('top')
    if (state.telemetryMode === 'bar' || state.telemetryMode === 'top') {
      const isTop = state.telemetryMode === 'top';
      const barH = u * 3.0;
      const barY = isTop ? 0 : (outH - barH);

      const grad = targetCtx.createLinearGradient(0, isTop ? 0 : (barY - u * 1.2), 0, isTop ? (barH + u * 1.2) : outH);
      if (isTop) {
        grad.addColorStop(0, 'rgba(4, 6, 11, 0.94)');
        grad.addColorStop(0.65, 'rgba(4, 6, 11, 0.76)');
        grad.addColorStop(1, 'rgba(4, 6, 11, 0)');
        targetCtx.fillStyle = grad;
        targetCtx.fillRect(0, 0, outW, barH + u * 1.2);
      } else {
        grad.addColorStop(0, 'rgba(4, 6, 11, 0)');
        grad.addColorStop(0.35, 'rgba(4, 6, 11, 0.78)');
        grad.addColorStop(1, 'rgba(4, 6, 11, 0.94)');
        targetCtx.fillStyle = grad;
        targetCtx.fillRect(0, barY - u * 1.2, outW, barH + u * 1.2);
      }

      const lineY = isTop ? (barH - u * 0.25) : (barY + u * 0.2);
      targetCtx.strokeStyle = 'rgba(56, 189, 248, 0.38)';
      targetCtx.lineWidth = Math.max(1, outW / 720);
      targetCtx.beginPath();
      targetCtx.moveTo(u * 1.2, lineY);
      targetCtx.lineTo(outW - u * 1.2, lineY);
      targetCtx.stroke();

      const textTopY = isTop ? (u * 0.52) : (barY + u * 0.55);
      targetCtx.fillStyle = '#F8FAFC';
      targetCtx.font = `700 ${Math.round(u * 0.80)}px ${fontFam}`;
      targetCtx.textBaseline = 'top';
      targetCtx.textAlign = 'left';
      targetCtx.fillText(title, u * 1.2, textTopY);

      if (specs) {
        targetCtx.fillStyle = '#38BDF8';
        targetCtx.font = `600 ${Math.round(u * 0.58)}px ${fontFam}`;
        targetCtx.fillText(specs, u * 1.2, textTopY + u * 1.02);
      }

      if (catBadge) {
        targetCtx.font = `700 ${Math.round(u * 0.54)}px ${fontFam}`;
        const bw = targetCtx.measureText(catBadge).width + u * 0.9;
        const bh = u * 1.15;
        const bx = outW - u * 1.2 - bw;
        const by = textTopY + u * 0.25;

        targetCtx.fillStyle = 'rgba(56, 189, 248, 0.14)';
        targetCtx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
        targetCtx.lineWidth = Math.max(1, outW / 800);
        targetCtx.beginPath();
        targetCtx.roundRect(bx, by, bw, bh, u * 0.25);
        targetCtx.fill();
        targetCtx.stroke();

        targetCtx.fillStyle = '#38BDF8';
        targetCtx.textAlign = 'center';
        targetCtx.textBaseline = 'middle';
        targetCtx.fillText(catBadge, bx + bw / 2, by + bh / 2 + 0.5);
      }
    }

    // MODE 3: CORNER TELEMETRY CARD ('corner')
    else if (state.telemetryMode === 'corner') {
      targetCtx.font = `700 ${Math.round(u * 0.72)}px ${fontFam}`;
      const tw = targetCtx.measureText(title).width;
      targetCtx.font = `600 ${Math.round(u * 0.56)}px ${fontFam}`;
      const subLine = [specs, catBadge].filter(Boolean).join(' • ');
      const sw = targetCtx.measureText(subLine).width;

      const bw = Math.max(tw, sw) + u * 1.65;
      const bh = subLine ? u * 2.25 : u * 1.45;
      const bx = u * 0.95;
      const by = outH - bh - u * 0.95;

      targetCtx.fillStyle = 'rgba(6, 9, 16, 0.82)';
      targetCtx.strokeStyle = 'rgba(56, 189, 248, 0.42)';
      targetCtx.lineWidth = Math.max(1.2, outW / 640);
      targetCtx.beginPath();
      targetCtx.roundRect(bx, by, bw, bh, u * 0.35);
      targetCtx.fill();
      targetCtx.stroke();

      // Left cyan accent bar
      targetCtx.fillStyle = '#38BDF8';
      targetCtx.beginPath();
      targetCtx.roundRect(bx, by, Math.max(3, u * 0.16), bh, [u * 0.35, 0, 0, u * 0.35]);
      targetCtx.fill();

      targetCtx.fillStyle = '#F8FAFC';
      targetCtx.textBaseline = 'top';
      targetCtx.textAlign = 'left';
      targetCtx.font = `700 ${Math.round(u * 0.72)}px ${fontFam}`;
      targetCtx.fillText(title, bx + u * 0.65, by + u * 0.34);

      if (subLine) {
        targetCtx.fillStyle = '#38BDF8';
        targetCtx.font = `600 ${Math.round(u * 0.54)}px ${fontFam}`;
        targetCtx.fillText(subLine, bx + u * 0.65, by + u * 1.24);
      }
    }

    // MODE 4: OBSERVATORY / MUSEUM TECHNICAL BORDER FRAME ('frame')
    else if (state.telemetryMode === 'frame') {
      const inset = Math.round(u * 0.95);
      const fw = outW - inset * 2;
      const fh = outH - inset * 2;

      // Subtle dark vignette at bottom for legibility
      const grad = targetCtx.createLinearGradient(0, outH - u * 3.6, 0, outH);
      grad.addColorStop(0, 'rgba(4, 6, 11, 0)');
      grad.addColorStop(1, 'rgba(4, 6, 11, 0.86)');
      targetCtx.fillStyle = grad;
      targetCtx.fillRect(0, outH - u * 3.6, outW, u * 3.6);

      // Crisp inner observatory frame border
      targetCtx.strokeStyle = 'rgba(248, 250, 252, 0.28)';
      targetCtx.lineWidth = Math.max(1, outW / 720);
      targetCtx.strokeRect(inset, inset, fw, fh);

      // 4 Cyan Corner L-Ticks on the frame
      const cLen = u * 0.75;
      targetCtx.strokeStyle = '#38BDF8';
      targetCtx.lineWidth = Math.max(1.8, outW / 480);
      [[-1, -1, inset, inset], [1, -1, inset + fw, inset], [1, 1, inset + fw, inset + fh], [-1, 1, inset, inset + fh]].forEach(([sx, sy, x0, y0]) => {
        targetCtx.beginPath();
        targetCtx.moveTo(x0 - sx * cLen, y0);
        targetCtx.lineTo(x0, y0);
        targetCtx.lineTo(x0, y0 - sy * cLen);
        targetCtx.stroke();
      });

      const baseLineY = inset + fh - u * 0.45;
      targetCtx.textBaseline = 'bottom';
      targetCtx.textAlign = 'left';
      targetCtx.fillStyle = '#F8FAFC';
      targetCtx.font = `700 ${Math.round(u * 0.72)}px ${fontFam}`;
      targetCtx.fillText(title, inset + u * 0.55, baseLineY - (specs ? u * 0.72 : 0));

      if (specs) {
        targetCtx.fillStyle = '#38BDF8';
        targetCtx.font = `600 ${Math.round(u * 0.54)}px ${fontFam}`;
        targetCtx.fillText(specs, inset + u * 0.55, baseLineY);
      }

      if (catBadge) {
        targetCtx.textAlign = 'right';
        targetCtx.fillStyle = 'rgba(248, 250, 252, 0.85)';
        targetCtx.font = `700 ${Math.round(u * 0.54)}px ${fontFam}`;
        targetCtx.fillText(catBadge, inset + fw - u * 0.55, baseLineY);
      }
    }

    targetCtx.restore();
  }

  // Cross-Platform Blur Renderer
  // src (optional) = { img, rot90, flipH }: blur that picture instead of the main image (used by Collage "Blur Fit")
  function drawCustomBlurredBackground(targetCtx, outW, outH, blurAmount, src) {
    const own = !!(src && src.img);
    let dims;
    if (own) {
      const iw0 = src.img.naturalWidth || src.img.width || 1, ih0 = src.img.naturalHeight || src.img.height || 1;
      const turned = ((src.rot90 || 0) % 180) !== 0;
      dims = { w: turned ? ih0 : iw0, h: turned ? iw0 : ih0 };
    } else {
      dims = getTransformedDims();
    }
    const paint = (c, cx, cy, sc) => {
      if (!own) { drawSourceTransformed(c, cx, cy, sc, false); return; }
      const iw = src.img.naturalWidth || src.img.width || 1, ih = src.img.naturalHeight || src.img.height || 1;
      c.save();
      c.translate(cx, cy);
      if (src.flipH) c.scale(-1, 1);
      c.rotate(((src.rot90 || 0) * Math.PI) / 180);
      c.scale(sc, sc);
      c.drawImage(src.img, -iw / 2, -ih / 2, iw, ih);
      c.restore();
    };
    targetCtx.fillStyle = '#05070b';
    targetCtx.fillRect(0, 0, outW, outH);

    if (!own && !state.img) return;

    if (blurAmount <= 0) {
      const coverScale = Math.max(outW / dims.w, outH / dims.h) * 1.04;
      paint(targetCtx, outW / 2, outH / 2, coverScale);
      targetCtx.fillStyle = 'rgba(4, 6, 12, 0.25)';
      targetCtx.fillRect(0, 0, outW, outH);
      return;
    }

    const normBlur = Math.max(1, Math.min(100, blurAmount));
    const bufferW = Math.max(36, Math.round(220 - normBlur * 1.45));
    const bufferH = Math.max(36, Math.round(bufferW * (outH / outW)));

    const b1 = document.createElement('canvas');
    b1.width = bufferW;
    b1.height = bufferH;
    const c1 = b1.getContext('2d');
    c1.imageSmoothingEnabled = true;
    c1.imageSmoothingQuality = 'high';

    const coverScale = Math.max(bufferW / dims.w, bufferH / dims.h) * (1.06 + normBlur * 0.0015);
    paint(c1, bufferW / 2, bufferH / 2, coverScale);

    const imgData = c1.getImageData(0, 0, bufferW, bufferH);
    const radius = Math.max(1, Math.round(normBlur * 0.18));
    boxBlurImageData(imgData.data, bufferW, bufferH, radius);
    boxBlurImageData(imgData.data, bufferW, bufferH, radius);
    c1.putImageData(imgData, 0, 0);

    targetCtx.save();
    targetCtx.imageSmoothingEnabled = true;
    targetCtx.imageSmoothingQuality = 'high';
    targetCtx.drawImage(b1, 0, 0, bufferW, bufferH, 0, 0, outW, outH);

    targetCtx.fillStyle = 'rgba(4, 6, 12, 0.32)';
    targetCtx.fillRect(0, 0, outW, outH);
    targetCtx.restore();
  }

  function boxBlurImageData(pixels, w, h, r) {
    if (r < 1) return;
    const copy = new Uint8ClampedArray(pixels);
    const iarr = 1 / (r + r + 1);

    for (let y = 0; y < h; y++) {
      let rSum = 0, gSum = 0, bSum = 0;
      const rowOffset = y * w * 4;
      for (let x = -r; x <= r; x++) {
        const cx = Math.min(w - 1, Math.max(0, x));
        const idx = rowOffset + cx * 4;
        rSum += copy[idx];
        gSum += copy[idx + 1];
        bSum += copy[idx + 2];
      }
      for (let x = 0; x < w; x++) {
        const outIdx = rowOffset + x * 4;
        pixels[outIdx] = rSum * iarr;
        pixels[outIdx + 1] = gSum * iarr;
        pixels[outIdx + 2] = bSum * iarr;

        const leftX = Math.max(0, x - r);
        const rightX = Math.min(w - 1, x + r + 1);
        const lIdx = rowOffset + leftX * 4;
        const rIdx = rowOffset + rightX * 4;
        rSum += copy[rIdx] - copy[lIdx];
        gSum += copy[rIdx + 1] - copy[lIdx + 1];
        bSum += copy[rIdx + 2] - copy[lIdx + 2];
      }
    }

    copy.set(pixels);
    for (let x = 0; x < w; x++) {
      let rSum = 0, gSum = 0, bSum = 0;
      for (let y = -r; y <= r; y++) {
        const cy = Math.min(h - 1, Math.max(0, y));
        const idx = (cy * w + x) * 4;
        rSum += copy[idx];
        gSum += copy[idx + 1];
        bSum += copy[idx + 2];
      }
      for (let y = 0; y < h; y++) {
        const outIdx = (y * w + x) * 4;
        pixels[outIdx] = rSum * iarr;
        pixels[outIdx + 1] = gSum * iarr;
        pixels[outIdx + 2] = bSum * iarr;

        const topY = Math.max(0, y - r);
        const botY = Math.min(h - 1, y + r + 1);
        const tIdx = (topY * w + x) * 4;
        const bIdx = (botY * w + x) * 4;
        rSum += copy[bIdx] - copy[tIdx];
        gSum += copy[bIdx + 1] - copy[tIdx + 1];
        bSum += copy[bIdx + 2] - copy[tIdx + 2];
      }
    }
  }

  function updateStatusBadge(crop) {
    const sliceScreenW = state.direction === 'horiz' ? (crop.w / state.sliceCount) : crop.w;
    const srcPxPerSliceW = Math.round(sliceScreenW / state.scale);
    const ratio = Math.round((srcPxPerSliceW / state.exportWidth) * 100);
    const outW = state.exportWidth;
    const outH = Math.round(outW / crop.singleAspect);

    document.getElementById('resDims').textContent = `${outW}×${outH}`;
    const zoomEl = document.getElementById('resZoom');
    zoomEl.textContent = `${ratio}%`;

    const isLowRes = ratio < 85;
    document.getElementById('qDot').classList.toggle('warn', isLowRes);
    zoomEl.classList.toggle('warn', isLowRes);
  }

  function renderCanvas() {
    syncCanvasSize();
    if (!canvas.width || !canvas.height) return;
    if (state.appMode === 'annotate') { renderAnnotateStage(); return; }
    const dpr = state.dpr;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (state.showBlurOnMain && state.img) {
      const singleAspect = ASPECT_MAP[state.aspect];
      const padX = 20 * dpr;
      const padTop = stageTopPad() * dpr;
      const padBot = stageBottomPad() * dpr;
      const availW = canvas.width - padX * 2;
      const availH = canvas.height - padTop - padBot;
      let fw = availW;
      let fh = fw / singleAspect;
      if (fh > availH) {
        fh = availH;
        fw = fh * singleAspect;
      }
      const fx = (canvas.width - fw) / 2;
      const fy = padTop + (availH - fh) / 2;

      const { off } = createFullFitCanvas(Math.round(fw));
      ctx.drawImage(off, fx, fy, fw, fh);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2 * dpr;
      ctx.strokeRect(fx, fy, fw, fh);
      return;
    }

    clampSlicerTransform();
    const crop = getCropRect();
    const centerX = crop.x + crop.w / 2 + state.offsetX;
    const centerY = crop.y + crop.h / 2 + state.offsetY;

    state._annUI = !!state.draggingPinId;      // selection ring only while a pin is being held
    try {
      ctx.save();
      ctx.globalAlpha = 0.28;
      drawSourceTransformed(ctx, centerX, centerY, state.scale, false);
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.rect(crop.x, crop.y, crop.w, crop.h);
      ctx.clip();
      drawSourceTransformed(ctx, centerX, centerY, state.scale, false);
      for (let index = 0; index < state.sliceCount; index++) {
        drawCroppedAnnotationLayer(ctx, centerX, centerY, state.scale, slicerFrame(crop, index));
      }
      drawTelemetryOverlay(ctx, canvas.width, canvas.height);
      ctx.restore();
    } finally { state._annUI = false; }

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1 * dpr;
    for (let i = 1; i <= 2; i++) {
      const gx = crop.x + (crop.w * i) / 3;
      const gy = crop.y + (crop.h * i) / 3;
      ctx.beginPath();
      ctx.moveTo(gx, crop.y); ctx.lineTo(gx, crop.y + crop.h);
      ctx.moveTo(crop.x, gy); ctx.lineTo(crop.x + crop.w, gy);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    const n = state.sliceCount;
    for (let i = 0; i < n; i++) {
      const idxLabel = state.reverseOrder ? (n - i) : (i + 1);
      let sx, sy, sw, sh;
      if (state.direction === 'horiz') {
        sw = crop.w / n;
        sh = crop.h;
        sx = crop.x + i * sw;
        sy = crop.y;
      } else {
        sw = crop.w;
        sh = crop.h / n;
        sx = crop.x;
        sy = crop.y + i * sh;
      }

      if (i > 0) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5 * dpr;
        ctx.setLineDash([6 * dpr, 5 * dpr]);
        ctx.beginPath();
        if (state.direction === 'horiz') {
          ctx.moveTo(sx, crop.y);
          ctx.lineTo(sx, crop.y + crop.h);
        } else {
          ctx.moveTo(crop.x, sy);
          ctx.lineTo(crop.x + crop.w, sy);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      const pillW = 26 * dpr;
      const pillH = 18 * dpr;
      const pad = 6 * dpr;
      ctx.fillStyle = 'rgba(6, 8, 13, 0.84)';
      ctx.beginPath();
      ctx.roundRect(sx + pad, sy + pad, pillW, pillH, 5 * dpr);
      ctx.fill();

      ctx.fillStyle = '#38bdf8';
      ctx.font = `700 ${Math.round(11 * dpr)}px -apple-system, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(`#${idxLabel}`, sx + pad + pillW / 2, sy + pad + pillH / 2 + 0.5 * dpr);
    }

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2 * dpr;
    ctx.strokeRect(crop.x, crop.y, crop.w, crop.h);
    ctx.restore();

    updateStatusBadge(crop);
  }

  // Convert screen canvas pointer (x, y) to normalized image coordinates (nx, ny)
  function screenToImageNorm(scrX, scrY) {
    const v = annView();
    const centerX = v.cx, centerY = v.cy, imgW = v.w, imgH = v.h;
    return {
      nx: clamp01((scrX - centerX) / imgW + 0.5),
      ny: clamp01((scrY - centerY) / imgH + 0.5)
    };
  }

  // MULTI-TOUCH GESTURES + DIRECT ANNOTATION PIN DRAGGING / PLACEMENT
  const pointers = new Map();
  let prevPinchDist = null;
  let prevMid = null;
  let lastTapTime = 0;

  canvas.addEventListener('pointerdown', e => {
    state.showBlurOnMain = false;
    canvas.setPointerCapture(e.pointerId);
    const rect = canvas.getBoundingClientRect();
    const dpr = state.dpr;
    const pt = { x: (e.clientX - rect.left) * dpr, y: (e.clientY - rect.top) * dpr };
    const annotating = state.appMode === 'annotate';
    if (annotating) cancelAnimationFrame(annAnim);
    if (pointers.size === 0 && state.img) pendingGestureSnapshot = getTransformSnapshot();

    // A second finger begins a pinch even when it lands on a marker.
    // While placing a marker, a drag can still move the photo before the next tap.
    if (annotating && (pointers.size > 0 || state.moonTap || (state.placingPinMode && !annGrabbable(pt.x, pt.y)))) {
      pointers.set(e.pointerId, pt);
      annTap = pointers.size === 1 ? { id: e.pointerId, x: pt.x, y: pt.y, t: Date.now(), moved: false } : null;
      if (pointers.size === 2) annStartPinch();
      return;
    }

    // Hit testing and marker editing are confined to the annotation workspace.
    if (annotating && state.markersVisible && state.annotations.length > 0 && annFrameContains(pt.x, pt.y)) {
      const v = annView();
      const centerX = v.cx, centerY = v.cy, imgW = v.w, imgH = v.h;
      const hitRadius = 30 * dpr;
      const labHit = annLabelHit(pt.x, pt.y);
      let hit = null, hitD = Infinity;
      for (let i = state.annotations.length - 1; i >= 0; i--) {
        const ann = state.annotations[i];
        const dd = Math.hypot(pt.x - (centerX + (ann.nx - 0.5) * imgW), pt.y - (centerY + (ann.ny - 0.5) * imgH));
        if (dd <= hitRadius && dd < hitD) { hit = ann; hitD = dd; }
      }
      if (labHit && (labHit.d === 0 || !hit)) {                       // a finger on a label takes the label: it moves on its own, its marker stays
        state.draggingLabelId = labHit.id;
        state._labGrab = { dx: labHit.cx - pt.x, dy: labHit.cy - pt.y };
        state._labDown = { x: pt.x, y: pt.y, moved: false };
        state.selectedPinId = labHit.id;
        annPulse(labHit.id);
        syncAnnotationModalUI(); renderAnnotationList();
        pointers.set(e.pointerId, pt);
        renderCanvas();
        return;
      }
      if (hit) {
        state.draggingPinId = hit.id;
        // keep the marker where it is under the finger (no jump), and show a magnifier when a finger covers the spot
        state._pinGrab = { dx: (centerX + (hit.nx - 0.5) * imgW) - pt.x, dy: (centerY + (hit.ny - 0.5) * imgH) - pt.y };
        state._annLoupe = state.appMode === 'annotate' && e.pointerType !== 'mouse';
        state.selectedPinId = hit.id;
        annPulse(hit.id);
        if (state.appMode === 'annotate') { syncAnnotationModalUI(); renderAnnotationList(); }
        pointers.set(e.pointerId, pt);
        renderCanvas();                       // show the selection right away, not only once the pin moves
        return;
      }
    }

    pointers.set(e.pointerId, pt);
    if (state.appMode === 'annotate') annTap = pointers.size === 1 ? { id: e.pointerId, x: pt.x, y: pt.y, t: Date.now(), moved: false } : null;

    if (pointers.size === 1) {
      const now = Date.now();
      if (now - lastTapTime < 260 && state.appMode !== 'annotate') {
        if (pendingGestureSnapshot) {
          pushUndoSnapshot(pendingGestureSnapshot);
          pendingGestureSnapshot = null;
        }
        fitImageToCrop();
      }
      lastTapTime = now;
    }
    if (pointers.size === 2) {
      state.draggingPinId = null; state.draggingLabelId = null; state._labDown = null;
      const pts = Array.from(pointers.values());
      prevPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      prevMid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    }
  });

  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = state.dpr;
    const prev = pointers.get(e.pointerId);
    const curr = { x: (e.clientX - rect.left) * dpr, y: (e.clientY - rect.top) * dpr };
    pointers.set(e.pointerId, curr);

    if (state.appMode === 'annotate' && state.markersVisible && state.draggingLabelId && pointers.size === 1) {                // a label is being dragged: it moves on its own, its marker stays
      const labAnn = state.annotations.find(a => a.id === state.draggingLabelId), dn = state._labDown;
      if (labAnn && dn) {
        if (!dn.moved && Math.hypot(curr.x - dn.x, curr.y - dn.y) < 6 * dpr) return;     // still a tap
        dn.moved = true;
        const g = state._labGrab || { dx: 0, dy: 0 }, v = annView();
        labAnn.lx = clamp01((curr.x + g.dx - v.cx) / v.w + 0.5);
        labAnn.ly = clamp01((curr.y + g.dy - v.cy) / v.h + 0.5);
        labAnn.lman = true;
        renderCanvas();
      }
      return;
    }
    if (state.appMode === 'annotate' && state.markersVisible && state.draggingPinId && pointers.size === 1) {
      const targetAnn = state.annotations.find(a => a.id === state.draggingPinId);
      if (targetAnn) {
        const grab = state._pinGrab || { dx: 0, dy: 0 };
        const norm = screenToImageNorm(curr.x + grab.dx, curr.y + grab.dy);
        if (!state._pinStart) state._pinStart = { x: prev.x, y: prev.y };
        if (Math.hypot(curr.x - state._pinStart.x, curr.y - state._pinStart.y) > 5 * dpr) targetAnn.pMoved = true;      // (moved by hand: "Update pins" from the Moon atlas will leave it where it is)
        targetAnn.nx = norm.nx;
        targetAnn.ny = norm.ny;
        renderCanvas();
      }
      return;
    }

    if (state.appMode === 'annotate') { annMove(prev, curr); return; }
    if (pointers.size === 1) {
      state.offsetX += curr.x - prev.x;
      state.offsetY += curr.y - prev.y;
      renderCanvas();
    } else if (pointers.size === 2) {
      const pts = Array.from(pointers.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };

      if (prevPinchDist && prevPinchDist > 10) {
        const zoomFactor = dist / prevPinchDist;
        const crop = getCropRect();
        const imgCenterX = crop.x + crop.w / 2 + state.offsetX;
        const imgCenterY = crop.y + crop.h / 2 + state.offsetY;

        const newScale = Math.max(0.05, Math.min(25, state.scale * zoomFactor));
        const actualFactor = newScale / state.scale;

        state.offsetX += (mid.x - prevMid.x) + (imgCenterX - mid.x) * (actualFactor - 1);
        state.offsetY += (mid.y - prevMid.y) + (imgCenterY - mid.y) * (actualFactor - 1);
        state.scale = newScale;
        renderCanvas();
      }
      prevPinchDist = dist;
      prevMid = mid;
    }
  });

  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    const labId = state.draggingLabelId, labTap = !!(labId && state._labDown && !state._labDown.moved && e.type === 'pointerup' && pointers.size === 0);
    const tap = annTap;
    if (tap && tap.id === e.pointerId) {
      annTap = null;
      if (!tap.moved && e.type === 'pointerup' && state.appMode === 'annotate' && pointers.size === 0) annTapped(tap);
    }
    const wasHoldingPin = !!state.draggingPinId;
    const loupeWasOn = !!state._annLoupe;
    if (pointers.size === 0) {
      state.draggingPinId = null;
      state.draggingLabelId = null;
      state._labDown = null;
      state._pinGrab = null;
      state._pinStart = null;
      state._annLoupe = false;
      if (wasHoldingPin && (state.appMode !== 'annotate' || loupeWasOn)) renderCanvas();
      if (labId) { if (labTap) pinDockOpen(labId); else { pinDockSync(); renderCanvas(); } }     // a tap on a label edits it; after a drag the layout is solved properly once more
      if (pendingGestureSnapshot) {
        const currSnap = getTransformSnapshot();
        if (!snapshotsEqual(pendingGestureSnapshot, currSnap)) {
          pushUndoSnapshot(pendingGestureSnapshot);
        }
        pendingGestureSnapshot = null;
      }
    }
    if (pointers.size < 2) {
      prevPinchDist = null;
      prevMid = null;
    }
  }
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  // Cursor-Anchored Mouse Wheel Zoom for PC / Desktop Browsers
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (state.appMode === 'annotate') {
      const rect = canvas.getBoundingClientRect(), dpr = state.dpr;
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 100 : e.deltaY;
      cancelAnimationFrame(annAnim);
      if (state.img && state.annotationAspect !== 'original' && dy) saveUndoBurst();
      annZoomAt((e.clientX - rect.left) * dpr, (e.clientY - rect.top) * dpr, Math.exp(-annClamp(dy, -200, 200) * 0.0018));
      return;
    }
    saveUndoBurst();
    state.showBlurOnMain = false;
    const rect = canvas.getBoundingClientRect();
    const dpr = state.dpr;
    const mouseX = (e.clientX - rect.left) * dpr;
    const mouseY = (e.clientY - rect.top) * dpr;

    const factor = e.deltaY < 0 ? 1.10 : 0.90;
    const newScale = Math.max(0.05, Math.min(30, state.scale * factor));
    const actualFactor = newScale / state.scale;

    const crop = getCropRect();
    const imgCenterX = crop.x + crop.w / 2 + state.offsetX;
    const imgCenterY = crop.y + crop.h / 2 + state.offsetY;

    state.offsetX += (imgCenterX - mouseX) * (actualFactor - 1);
    state.offsetY += (imgCenterY - mouseY) * (actualFactor - 1);
    state.scale = newScale;
    renderCanvas();
  }, { passive: false });

  // Desktop Drag-and-Drop File Support on Workspace (Routes to Slicer OR specific Collage Box!)
  const workspaceEl = document.getElementById('workspace');
  ['dragenter', 'dragover'].forEach(evtName => {
    window.addEventListener(evtName, e => {
      e.preventDefault();
      if (state.appMode === 'collage') {
        workspaceEl.classList.remove('drag-over');
        const rect = collageCanvas.getBoundingClientRect();
        const stage = getCollageStageRect();
        const localX = (e.clientX - rect.left) * state.dpr - stage.x;
        const localY = (e.clientY - rect.top) * state.dpr - stage.y;
        const hit = hitTestCollageCell(localX, localY, stage.w, stage.h);
        const newHover = hit ? hit.idx : collageState.activeCell;
        if (collageState.hoverDropCell !== newHover) {
          collageState.hoverDropCell = newHover;
          renderCollagePreview();
        }
      } else {
        workspaceEl.classList.add('drag-over');
      }
    });
  });
  ['dragleave', 'drop'].forEach(evtName => {
    window.addEventListener(evtName, e => {
      e.preventDefault();
      workspaceEl.classList.remove('drag-over');
      if (state.appMode === 'collage' && evtName === 'dragleave') {
        collageState.hoverDropCell = -1;
        renderCollagePreview();
      }
    });
  });
  window.addEventListener('drop', async e => {
    const dt = e.dataTransfer;
    if (!dt || !dt.files || dt.files.length === 0) return;
    if (state.appMode === 'collage') {
      const targetIdx = collageState.hoverDropCell >= 0 ? collageState.hoverDropCell : collageState.activeCell;
      collageState.hoverDropCell = -1;
      await loadFilesIntoCollageBoxes(Array.from(dt.files), targetIdx);
    } else {
      processSelectedFile(dt.files[0], null);
    }
  });

  // Desktop Keyboard Shortcuts (Ctrl+Z Undo, Arrow keys nudge, F fit, 1 1:1, C center, R rotate)
  window.addEventListener('keydown', e => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.isContentEditable)) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (state.appMode === 'collage') undoCollageAction();
      else undoLastMove();
      return;
    }
    if (state.appMode === 'annotate') {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.target && /^(SELECT|TEXTAREA)$/.test(e.target.tagName))) return;
      const pan = (e.shiftKey ? 90 : 30) * state.dpr;
      const framed = state.annotationAspect !== 'original';
      if (e.key === '+' || e.key === '=') { e.preventDefault(); annZoomStep(1.5); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); annZoomStep(1 / 1.5); }
      else if (e.key === '0' || e.key === 'f' || e.key === 'F') { e.preventDefault(); annFitView(); }
      else if (state.img && (framed || state.annZoom > 1.001)) {
        const offset = { ArrowLeft: [pan, 0], ArrowRight: [-pan, 0], ArrowUp: [0, pan], ArrowDown: [0, -pan] }[e.key];
        if (offset && e.key.startsWith('Arrow')) {
          e.preventDefault();
          if (framed) saveUndoBurst();
          annPanBy(...offset);
        }
      }
      return;
    }
    if (state.appMode === 'collage') {
      const cell = collageState.cells[collageState.activeCell];
      if (!cell) return;
      const stepNorm = e.shiftKey ? 0.03 : 0.005;
      if (e.key === 'ArrowLeft') { e.preventDefault(); saveCollageUndo(); cell.panX -= stepNorm; renderCollagePreview(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); saveCollageUndo(); cell.panX += stepNorm; renderCollagePreview(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); saveCollageUndo(); cell.panY -= stepNorm; renderCollagePreview(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); saveCollageUndo(); cell.panY += stepNorm; renderCollagePreview(); }
      else if (e.key === 'f' || e.key === 'F') { saveCollageUndo(); cell.zoom = 1.0; cell.panX = 0; cell.panY = 0; syncCollageUI(); renderCollagePreview(); }
      else if (e.key === 'r' || e.key === 'R') { saveCollageUndo(); cell.rot90 = (cell.rot90 + 90) % 360; renderCollagePreview(); }
      return;
    }
    const step = e.shiftKey ? 15 : 2;
    if (e.key === 'ArrowLeft') { e.preventDefault(); saveUndoBurst(); state.offsetX -= step; renderCanvas(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); saveUndoBurst(); state.offsetX += step; renderCanvas(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); saveUndoBurst(); state.offsetY -= step; renderCanvas(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); saveUndoBurst(); state.offsetY += step; renderCanvas(); }
    else if (e.key === 'f' || e.key === 'F') { saveUndoBeforeAction(); fitImageToCrop(); }
    else if (e.key === '1') { saveUndoBeforeAction(); setZoom100(); }
    else if (e.key === 'c' || e.key === 'C') { saveUndoBeforeAction(); state.offsetX = 0; state.offsetY = 0; renderCanvas(); }
    else if (e.key === 'r' || e.key === 'R') { rotateMainImage90(); }
  });

  // ANNOTATION MANAGEMENT FUNCTIONS (Live Selection, Sync & Preset Plate-Solve)
  function getSelectedAnnotation() {
    if (!state.selectedPinId) return null;
    return state.annotations.find(a => a.id === state.selectedPinId) || null;
  }

  function syncAnnotationModalUI() {
    const sel = getSelectedAnnotation();
    const statusEl = document.getElementById('lblActivePinStatus');
    const syncBtn = document.getElementById('btnSyncAllPins');
    const $ = id => document.getElementById(id);

    if (syncBtn) {
      syncBtn.classList.toggle('active', state.syncAllPins);
      syncBtn.textContent = state.syncAllPins ? 'Sync All Pins: ON' : 'Sync All Pins: OFF';
    }

    if (sel) {
      const idx = state.annotations.indexOf(sel) + 1;
      if (statusEl) statusEl.textContent = `Pin #${idx}: ${sel.title || 'Target'}`;
      $('annTitleInput').value = sel.title || '';
      $('annSubInput').value = sel.sub || '';
      state.annDraftStyle = sel.style || 'atlas';
      state.annDraftColor = (sel.color || '#EAF2FF').toUpperCase();
      state.annDraftFont = sel.fontFamily || "'Inter', -apple-system, 'Segoe UI', Roboto, sans-serif";
      state.annDraftBg = sel.bgStyle || 'shelf';
      state.annDraftDir = sel.dir || 'tr';
      state.annDraftSize = sel.sizeMult || 1.0;
      state.annDraftRadius = sel.radMult || 1.0;
      state.annDraftWeight = sel.fontWeight || 600;
      state.annDraftCase = sel.textCase === 'upper' ? 'upper' : 'normal';
      state.annDraftTrack = Number.isFinite(sel.track) ? sel.track : 0;
      state.annDraftTextMode = sel.textMode || 'light';
      state.annDraftTextHex = sel.textHex || '#FFFFFF';
      state.annDraftLine = sel.lineMult || 1;
      state.annDraftIn = sel.labelIn === 'in' ? 'in' : 'out';
    } else {
      if (statusEl) statusEl.textContent = state.annotations.length > 0 ? 'All Pins' : 'New Pin';
    }

    document.querySelectorAll('#annStyleGroup .ann-style-card').forEach(b => {
      b.classList.toggle('active', b.dataset.astyle === state.annDraftStyle);
    });

    const hexCol = (state.annDraftColor || '#EAF2FF').toUpperCase();
    $('annHexInput').value = hexCol;
    $('annHexChip').style.background = hexCol;
    if (/^#[0-9A-F]{6}$/i.test(hexCol)) {
      $('annColorPicker').value = hexCol;
    }
    document.querySelectorAll('#annColorGroup .color-swatch').forEach(sw => {
      sw.classList.toggle('active', sw.dataset.acolor.toUpperCase() === hexCol);
    });

    $('annFontSelect').value = state.annDraftFont;
    const act = (group, attr, val) => document.querySelectorAll(group + ' .seg-btn').forEach(b => b.classList.toggle('active', String(b.dataset[attr]) === String(val)));
    act('#annBgGroup', 'abg', state.annDraftBg);
    act('#annDirGroup', 'adir', state.annDraftDir);
    act('#annWeightGroup', 'w', state.annDraftWeight);
    act('#annCaseGroup', 'case', state.annDraftCase);
    act('#annTextModeGroup', 'tm', state.annDraftTextMode);
    act('#annInGroup', 'in', state.annDraftIn);
    act('#annSubGroup', 'sub', state.annShowSub === false ? '0' : '1');
    act('#annLayoutGroup', 'lay', state.annLayoutMode || 'auto');
    act('#annCoordGroup', 'c', state.skyCoords ? '1' : '0');
    const well = $('annTextWell');
    if (well) well.hidden = state.annDraftTextMode !== 'custom';
    if ($('annTextColor') && /^#[0-9A-F]{6}$/i.test(state.annDraftTextHex)) $('annTextColor').value = state.annDraftTextHex;

    $('rngAnnSize').value = state.annDraftSize;
    $('lblAnnSize').textContent = `${Number(state.annDraftSize).toFixed(2)}×`;
    $('rngAnnRadius').value = state.annDraftRadius;
    $('lblAnnRadius').textContent = `${Number(state.annDraftRadius).toFixed(2)}×`;
    $('rngAnnLine').value = state.annDraftLine;
    $('lblAnnLine').textContent = `${Number(state.annDraftLine).toFixed(2)}×`;
    $('rngAnnTrack').value = state.annDraftTrack;
    $('lblAnnTrack').textContent = `${Math.round(state.annDraftTrack * 100)}%`;
    $('rngAnnLabel').value = state.annLabelScale || 1;
    $('lblAnnLabel').textContent = `${Number(state.annLabelScale || 1).toFixed(2)}×`;
    const byType = $('annByType');
    if (byType) byType.setAttribute('aria-checked', state.annColorByType ? 'true' : 'false');
    moonSyncGuides();
    pinDockSync();
  }

  function applyStyleChangeToPins(prop, value) {
    const sel = getSelectedAnnotation();
    if (state.syncAllPins) {
      state.annotations.forEach(a => {
        // Don't overwrite each pin's quadrant direction if syncing general visual style, unless dir itself was clicked on a single selected pin
        if (prop === 'dir' && sel) {
          sel.dir = value;
        } else {
          a[prop] = value;
          if (prop === 'radMult') a.autoR = false;
        }
      });
    } else if (sel) {
      sel[prop] = value;
      if (prop === 'radMult') sel.autoR = false;
    }
    renderAnnotationList();
    renderCanvas();
  }

  function addAnnotationAt(nx, ny, customProps = null) {
    const dirs = ['tr', 'tl', 'br', 'bl'];
    const autoDir = customProps && customProps.dir ? customProps.dir : (state.annotations.length === 0 ? state.annDraftDir : dirs[state.annotations.length % dirs.length]);
    const title = customProps && customProps.title !== undefined
      ? customProps.title
      : (document.getElementById('annTitleInput').value.trim() || `Target #${state.annotations.length + 1}`);
    const sub = customProps && customProps.sub !== undefined
      ? customProps.sub
      : document.getElementById('annSubInput').value.trim();

    const newAnn = {
      id: 'ann_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      nx,
      ny,
      title,
      sub,
      style: (customProps && customProps.style) || state.annDraftStyle,
      color: (customProps && customProps.color) || state.annDraftColor,
      fontFamily: (customProps && customProps.fontFamily) || state.annDraftFont,
      bgStyle: (customProps && customProps.bgStyle) || state.annDraftBg,
      dir: autoDir,
      sizeMult: (customProps && customProps.sizeMult) || state.annDraftSize,
      radMult: (customProps && customProps.radMult) || state.annDraftRadius,
      fontWeight: (customProps && customProps.fontWeight) || state.annDraftWeight,
      textCase: (customProps && customProps.textCase) || state.annDraftCase,
      track: customProps && Number.isFinite(customProps.track) ? customProps.track : state.annDraftTrack,
      textMode: (customProps && customProps.textMode) || state.annDraftTextMode,
      textHex: (customProps && customProps.textHex) || state.annDraftTextHex,
      lineMult: (customProps && customProps.lineMult) || state.annDraftLine,
      labelIn: (customProps && customProps.labelIn) || state.annDraftIn,
      autoR: !!(customProps && customProps.autoR),
      catalogId: customProps && customProps.catalogId ? customProps.catalogId : null,
      ra: customProps && Number.isFinite(customProps.ra) ? customProps.ra : null,
      dec: customProps && Number.isFinite(customProps.dec) ? customProps.dec : null,
      objectType: customProps && customProps.objectType ? customProps.objectType : null,
      mag: customProps && Number.isFinite(customProps.mag) ? customProps.mag : null,
      skyId: customProps && customProps.skyId ? customProps.skyId : null,
      annotationSource: customProps && customProps.annotationSource ? customProps.annotationSource : null
    };
    state.annotations.push(newAnn);
    state.selectedPinId = newAnn.id;
    state.reelTargetX = nx;
    state.reelTargetY = ny;
    if (!(customProps && customProps.silent)) {
      syncAnnotationModalUI();
      renderAnnotationList();
      renderCanvas();
      showToast(`Added "${title}" marker`);
    }
    return newAnn;
  }

  // =========================================================================
  // BLIND PLATE SOLVE + AUTOMATIC CATALOGUE TARGET SUGGESTIONS
  // Solving and catalogue projection run on the device.
  // =========================================================================
  let photoReview = null;

  function scanPhotoPrivacy(image, signal) {
    return new Promise(resolve => {
      if (signal.aborted) { resolve(null); return; }
      let worker;
      try {
        worker = new Worker('./plate/privacy/scan-worker.js?v=14');
      } catch (_) {
        resolve({ unavailable: true });
        return;
      }
      const finish = result => {
        clearTimeout(timeout);
        signal.removeEventListener('abort', cancel);
        worker.terminate();
        resolve(result);
      };
      const cancel = () => finish(null);
      const timeout = setTimeout(() => finish({ unavailable: true }), 16000);
      signal.addEventListener('abort', cancel, { once: true });
      worker.onerror = () => finish({ unavailable: true });
      worker.onmessageerror = () => finish({ unavailable: true });
      worker.onmessage = ({ data }) => finish({
        location: data.location === true, contact: data.contact === true,
        footer: data.footer === true, unavailable: data.unavailable === true
      });
      try {
        const pixels = makePlateSolvePixels(image, 2048);
        worker.postMessage(pixels, [pixels.rgba.buffer]);
      } catch (_) {
        finish({ unavailable: true });
      }
    });
  }

  function updatePhotoPrivacyReview() {
    const image = state.img;
    if (photoReview?.image === image) return photoReview;
    photoReview?.controller.abort();
    photoReview = null;
    const notice = document.getElementById('photoPrivacyNotice');
    notice.hidden = true;
    notice.textContent = '';
    if (!image || state.reelRecording) return null;
    const controller = new AbortController();
    const review = { image, controller, result: null, allowed: false };
    photoReview = review;
    review.done = new Promise(resolve => setTimeout(resolve, 0))
      .then(() => scanPhotoPrivacy(image, controller.signal))
      .catch(() => ({ unavailable: true }))
      .then(result => {
        if (photoReview !== review || !result) return null;
        review.result = result;
        if (result.location || result.contact) {
          notice.textContent = result.location
            ? 'This photo may show a location in its visible text. Review the watermark before sharing.'
            : 'This photo may show contact details in its visible text. Review the watermark before sharing.';
          notice.hidden = false;
          showToast(notice.textContent, 4600);
        } else if (result.unavailable) {
          notice.textContent = 'The text check is unavailable. Review any watermark before sharing.';
          notice.hidden = false;
        }
        return result;
      });
    return review;
  }

  function confirmLocalPhotoSolve(result, signal) {
    const modal = document.getElementById('photoPrivacyModal');
    const proceed = document.getElementById('btnPhotoPrivacyContinue');
    const stop = document.getElementById('btnPhotoPrivacyCancel');
    const trigger = document.activeElement;
    document.getElementById('photoPrivacyDescription').textContent =
      result.location && result.contact ? 'The visible text may include a location and contact details.' :
        result.location ? 'The visible text may reveal where this photo was taken.' :
          'The visible text may include contact details.';

    return new Promise(resolve => {
      function finish(accepted) {
        modal.classList.remove('open');
        proceed.removeEventListener('click', accept);
        stop.removeEventListener('click', cancel);
        modal.removeEventListener('click', clickOutside);
        document.removeEventListener('keydown', key, true);
        signal.removeEventListener('abort', cancel);
        if (trigger?.isConnected && !trigger.disabled) trigger.focus({ preventScroll: true });
        else document.querySelector('#skyModeGroup [aria-selected="true"]')?.focus({ preventScroll: true });
        resolve(accepted);
      }
      const accept = () => finish(true);
      const cancel = () => finish(false);
      const clickOutside = event => { if (event.target === modal) cancel(); };
      const key = event => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          cancel();
        } else if (event.key === 'Tab') {
          event.preventDefault();
          (document.activeElement === proceed ? stop : proceed).focus();
        }
      };
      if (signal.aborted) { resolve(false); return; }
      proceed.addEventListener('click', accept);
      stop.addEventListener('click', cancel);
      modal.addEventListener('click', clickOutside);
      document.addEventListener('keydown', key, true);
      signal.addEventListener('abort', cancel, { once: true });
      modal.classList.add('open');
      stop.focus({ preventScroll: true });
    });
  }

  async function allowPhotoSolve(image, signal, onStatus) {
    const review = updatePhotoPrivacyReview();
    if (!review?.result) onStatus('Checking visible text on your device…');
    const result = await review?.done;
    if (!result || signal.aborted || state.img !== image) return false;
    if ((result?.location || result?.contact) && !review.allowed) {
      review.allowed = await confirmLocalPhotoSolve(result, signal);
      return review.allowed && !signal.aborted && state.img === image;
    }
    return true;
  }

  function resetStarSolveUI() {
    updatePhotoPrivacyReview();
    if (state.starSolveController) {
      try { state.starSolveController.abort(); } catch (_) {}
      state.starSolveController = null;
    }
    state.starSolveToken = (state.starSolveToken || 0) + 1;
    state.starSolve = null;
    state.starCandidates = [];
    state.starAllCandidates = [];
    state.starCatalogMore = 0;
    document.getElementById('starCatalogueFilters').hidden = true;
    document.getElementById('btnStarCatalogMore').hidden = true;
    document.getElementById('starCatalogueSearch').value = '';
    document.getElementById('starCatalogueType').value = 'all';
    setStarSolveBusy(false);
    const status = document.getElementById('starSolveStatus');
    const summary = document.getElementById('starSolveSummary');
    const list = document.getElementById('starCandidateList');
    const actions = document.getElementById('starSolveActions');
    if (status) {
      status.className = 'star-solve-status';
      status.textContent = state.img ? 'Image ready. Run Identify targets to solve this star field.' : 'Load an astronomical image, then run Identify targets.';
    }
    if (summary) { summary.hidden = true; summary.textContent = ''; }
    if (list) { list.hidden = true; list.replaceChildren(); }
    if (actions) actions.hidden = true;
    document.getElementById('starSolveNetNote').textContent = 'On-device';
    updateAnnotationExportUI();
  }

  function setStarSolveStatus(message, kind = '') {
    const el = document.getElementById('starSolveStatus');
    if (!el) return;
    el.className = 'star-solve-status' + (kind ? ' ' + kind : '');
    el.textContent = message;
  }

  function setStarSolveBusy(busy) {
    const scan = document.getElementById('btnFindStarTargets');
    scan.disabled = !state.img;
    scan.textContent = busy ? 'Cancel solve' : 'Identify targets';
    document.getElementById('btnImportStarWcs').disabled = busy || !state.img;
    document.getElementById('btnFlipStarWcs').hidden =
      busy || state.starSolve?.source !== 'Imported WCS' || !state.starAllCandidates.length;
  }

  function makePlateSolvePixels(img, maxEdge = 1800) {
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const width = Math.round(img.width * scale);
    const height = Math.round(img.height * scale);
    if (Math.min(width, height) < 32) throw new Error('Use a star-field image at least 32 pixels wide and tall.');
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    if (!ctx) throw new Error('This browser could not read the image pixels.');
    ctx.drawImage(img, 0, 0, width, height);
    const rgba = ctx.getImageData(0, 0, width, height).data;
    return { width, height, rgba };
  }

  function solvePlateInWorker(image, signal, onStatus) {
    return new Promise((resolve, reject) => {
      const worker = new Worker('./plate/solve-worker.js?v=14');
      function finish(error, solution) {
        worker.terminate();
        signal.removeEventListener('abort', abort);
        if (error) reject(error);
        else resolve(solution);
      }
      const abort = () => finish(new DOMException('Solve stopped.', 'AbortError'));
      if (signal.aborted) { abort(); return; }
      signal.addEventListener('abort', abort, { once: true });
      worker.onerror = () => finish(new Error('The browser could not start the solver. Check this site’s solver files, or import a WCS from a local solver.'));
      worker.onmessageerror = () => finish(new Error('The browser could not read the solver result.'));
      worker.onmessage = ({ data }) => {
        if (data.type === 'status') onStatus(data.message);
        if (data.type === 'error') finish(new Error(data.message));
        if (data.type === 'solution') finish(null, data);
      };
      try { worker.postMessage(image, [image.rgba.buffer]); }
      catch (error) { finish(error); }
    });
  }

  let plateModuleReady;
  function ensurePlateAnnotationsModule() {
    if (!plateModuleReady) {
      plateModuleReady = (async () => {
        if (!window.PlateAnnotations) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = './plate/catalogues.js';
            script.onload = () => { script.remove(); resolve(); };
            script.onerror = () => { script.remove(); reject(new Error('The local annotation module could not be loaded.')); };
            document.head.append(script);
          });
        }
      })().catch(error => { plateModuleReady = null; throw error; });
    }
    return plateModuleReady;
  }

  function initPlateOffline() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    const button = document.getElementById('btnSaveOffline');
    const status = document.getElementById('starOfflineStatus');
    const explanation = document.getElementById('starOfflineExplain');
    const scriptURL = new URL('./offline-sw.js?v=14', location.href).href;
    const activeWorker = navigator.serviceWorker.register(scriptURL, { updateViaCache: 'none' })
      .then(registration => waitForPlateOfflineWorker(registration, scriptURL));
    activeWorker.then(async worker => {
      const reply = await plateOfflineMessage(worker, 'check');
      button.hidden = reply.ready;
      explanation.hidden = reply.ready;
      if (reply.ready) status.textContent = 'Ready for offline use';
    }).catch(() => {});
    button.addEventListener('click', async () => {
      button.disabled = true;
      status.textContent = 'Downloading the app and its public catalogues…';
      try {
        const worker = await activeWorker;
        const reply = await plateOfflineMessage(worker, 'prepare');
        if (!reply.ready) throw new Error('The download was incomplete.');
        button.hidden = true;
        explanation.hidden = true;
        status.textContent = 'Ready for offline use';
      } catch (_) {
        status.textContent = 'Could not save for offline use. Check the connection and browser storage, then try again.';
      } finally {
        button.disabled = false;
      }
    });
  }

  function waitForPlateOfflineWorker(registration, scriptURL) {
    if (registration.active?.scriptURL === scriptURL && registration.active.state === 'activated') {
      return registration.active;
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        navigator.serviceWorker.removeEventListener('controllerchange', check);
        reject(new Error('Offline setup did not activate.'));
      }, 30000);
      function check() {
        const worker = navigator.serviceWorker.controller;
        if (!worker || worker.scriptURL !== scriptURL) return;
        clearTimeout(timeout);
        navigator.serviceWorker.removeEventListener('controllerchange', check);
        resolve(worker);
      }
      navigator.serviceWorker.addEventListener('controllerchange', check);
      check();
    });
  }

  function plateOfflineMessage(worker, action) {
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timeout = setTimeout(() => {
        channel.port1.close();
        reject(new Error('Offline preparation timed out.'));
      }, 180000);
      channel.port1.onmessage = ({ data }) => {
        clearTimeout(timeout);
        channel.port1.close();
        resolve(data);
      };
      worker.postMessage(action, [channel.port2]);
    });
  }

  function formatSkyRA(degrees) {
    if (!Number.isFinite(degrees)) return '—';
    const tenthsPerDay = 864000;
    const total = ((Math.round(degrees * 2400) % tenthsPerDay) + tenthsPerDay) % tenthsPerDay;
    const h = Math.floor(total / 36000);
    const m = Math.floor(total / 600) % 60;
    const s = (total % 600 / 10).toFixed(1);
    return `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}m${s.padStart(4, '0')}s`;
  }

  function formatSkyDec(degrees) {
    if (!Number.isFinite(degrees)) return '—';
    const sign = degrees < 0 ? '−' : '+';
    const total = Math.round(Math.abs(degrees) * 3600);
    const d = Math.floor(total / 3600);
    const m = Math.floor(total / 60) % 60;
    const s = total % 60;
    return `${sign}${String(d).padStart(2, '0')}°${String(m).padStart(2, '0')}′${String(s).padStart(2, '0')}″`;
  }

  function getSkyObjectTitle(obj) {
    const name = (obj.name || '').trim();
    const id = (obj.id || obj.label || 'Uncatalogued target').trim();
    if (name && name.toLowerCase() !== id.toLowerCase() && name.toLowerCase() !== (obj.catalogue_name || '').toLowerCase()) return name;
    return id;
  }

  function getSkyObjectColor(obj) {
    const group = String(obj.group || obj.type || '').toLowerCase();
    if (group.includes('galaxy')) return '#F2C46D';
    if (group.includes('cluster')) return '#7CC4F5';
    if (group.includes('planetary')) return '#7FDCB5';
    if (group.includes('dark') || group.includes('globule') || group.includes('molecular cloud')) return '#C3CCDA';
    if (group.includes('reflection')) return '#9CC7F7';
    if (group.includes('star')) return '#F4E4A1';
    if (group.includes('emission') || group.includes('nebula')) return '#B7A4F5';
    if (group.includes('remnant')) return '#F0899A';
    return '#7CC4F5';
  }

  function renderStarCandidates() {
    const list = document.getElementById('starCandidateList');
    const actions = document.getElementById('starSolveActions');
    const applyBtn = document.getElementById('btnApplyStarTargets');
    const countEl = document.getElementById('starSelectedCount');
    if (!list || !actions || !applyBtn || !countEl) return;
    list.replaceChildren();

    if (!state.starCandidates.length) {
      list.hidden = true;
      actions.hidden = true;
      return;
    }

    state.starCandidates.forEach((candidate, index) => {
      const label = document.createElement('label');
      label.className = 'star-candidate';
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = candidate.selected;
      check.dataset.starIndex = String(index);
      check.setAttribute('aria-label', `Select ${candidate.title}`);
      check.addEventListener('change', () => {
        candidate.selected = check.checked;
        updateStarCandidateSelectionUI();
      });

      const info = document.createElement('span');
      info.className = 'star-candidate-info';
      const title = document.createElement('strong');
      title.textContent = candidate.title;
      const meta = document.createElement('span');
      const coords = Number.isFinite(candidate.ra) && Number.isFinite(candidate.dec)
        ? `${formatSkyRA(candidate.ra)} / ${formatSkyDec(candidate.dec)}` : 'Position solved';
      const mag = Number.isFinite(candidate.mag) ? ` · mag ${candidate.mag.toFixed(1)}` : '';
      const idPart = starSearchKey(candidate.id) === starSearchKey(candidate.title) ? '' : candidate.id + ' · ';
      meta.textContent = `${idPart}${coords}${mag}`;
      info.append(title, meta);

      const type = document.createElement('span');
      type.className = 'star-candidate-type';
      type.textContent = candidate.type || candidate.group || 'Target';
      label.append(check, info, type);
      list.appendChild(label);
    });
    list.hidden = false;
    actions.hidden = false;
    updateStarCandidateSelectionUI();
  }

  function updateStarCandidateSelectionUI() {
    const selected = state.starCandidates.filter(item => item.selected).length;
    const countEl = document.getElementById('starSelectedCount');
    const applyBtn = document.getElementById('btnApplyStarTargets');
    if (countEl) countEl.textContent = `${selected} of ${state.starCandidates.length} selected`;
    if (applyBtn) {
      applyBtn.disabled = selected === 0;
      applyBtn.textContent = selected ? `Add ${selected} selected target${selected === 1 ? '' : 's'}` : 'Add selected to annotations';
    }
    const selectAllBtn = document.getElementById('btnStarSelectAll');
    const deselectAllBtn = document.getElementById('btnStarDeselectAll');
    if (selectAllBtn) selectAllBtn.disabled = selected === state.starCandidates.length;
    if (deselectAllBtn) deselectAllBtn.disabled = selected === 0;
  }

  function setAllStarCandidatesSelected(selected) {
    state.starCandidates.forEach(candidate => { candidate.selected = Boolean(selected); });
    renderStarCandidates();
  }

  async function identifyStarfieldTargets(wcsFile) {
    if (!state.img) {
      setStarSolveStatus('Load an astronomical image first.', 'error');
      return;
    }
    if (state.starSolveController) {
      resetStarSolveUI();
      setStarSolveStatus('Solve cancelled.');
      return;
    }

    resetStarSolveUI();
    const original = state.img;
    const token = state.starSolveToken;
    const controller = new AbortController();
    state.starSolveController = controller;
    setStarSolveBusy(true);
    const isCurrent = () => token === state.starSolveToken && original === state.img;
    let timeout;
    try {
      if (!(await allowPhotoSolve(original, controller.signal, setStarSolveStatus))) {
        if (isCurrent()) setStarSolveStatus('Solve cancelled. Your photo is still open.');
        return;
      }
      timeout = setTimeout(() => {
        if (!isCurrent()) return;
        resetStarSolveUI();
        setStarSolveStatus('The operation timed out. Try again, or import a WCS from a local solver.', 'error');
      }, 90000);
      setStarSolveStatus('Loading the public object catalogue…');
      await ensurePlateAnnotationsModule();
      if (!isCurrent() || controller.signal.aborted) return;
      const catalogueURL = './plate/catalogue-bundle.json';
      const catalogue = window.PlateAnnotations;
      await catalogue.loadCatalogueBundle(catalogueURL, controller.signal);
      if (!isCurrent() || controller.signal.aborted) return;
      const brightStars = wcsFile && window.PlateWcsOrientation
        ? await catalogue.loadBrightStars('./plate/bright-stars.json', controller.signal)
        : null;
      if (!isCurrent() || controller.signal.aborted) return;

      setStarSolveStatus(wcsFile ? 'Reading the WCS file on your device…' : 'Preparing the star field on your device…');
      const result = wcsFile
        ? { header: await wcsFile.slice(0, 1024 * 1024).arrayBuffer() }
        : await solvePlateInWorker({
          ...makePlateSolvePixels(original), footer: photoReview?.result?.footer === true
        }, controller.signal, message => {
          if (isCurrent() && !controller.signal.aborted) setStarSolveStatus(message);
        });
      if (!isCurrent() || controller.signal.aborted) return;

      setStarSolveStatus('Checking the local object catalogue…');
      const wcsOptions = { rowOrigin: 'bottom' };
      if (wcsFile) {
        wcsOptions.width = original.sourceWidth || original.width;
        wcsOptions.height = original.sourceHeight || original.height;
      }
      let solution = window.PlateAnnotations.parseWcs(result.header, wcsOptions);
      const { width, height } = solution;
      if (Math.abs(width * original.height - height * original.width) > Math.max(width, height, original.width, original.height)) {
        throw new Error('The WCS dimensions do not match the image framing. Use a WCS for the same image.');
      }
      if (brightStars) {
        let pixels;
        if (Math.min(original.width, original.height) >= 32) {
          try { pixels = makePlateSolvePixels(original); }
          catch (_) { /* fall back to the header convention if pixel access is unavailable */ }
        }
        const orientation = window.PlateWcsOrientation.resolve(result.header, solution, pixels, brightStars);
        if (orientation.rowOrigin === 'top') {
          solution = window.PlateAnnotations.parseWcs(result.header, { ...wcsOptions, rowOrigin: 'top' });
        }
      }

      const upperSky = Number.isInteger(result.verified_height) && result.verified_height > 0 && result.verified_height < height;
      const field = upperSky ? catalogue.parseWcs({
        ...result.header,
        IMAGEH: result.verified_height,
        CRPIX2: result.header.CRPIX2 - (height - result.verified_height)
      }, wcsOptions) : solution;
      const catalog = await catalogue.loadCatalogForWcs(field, catalogueURL, controller.signal);
      if (!isCurrent() || controller.signal.aborted) return;
      const annotations = catalogue.annotate(field, catalog);
      const { center, fov, scale_arcsec: scale } = field;
      const wide = Math.max(fov.width_deg, fov.height_deg) >= 12;
      const shorterEdge = Math.min(width, height);
      const titled = annotations.objects.map(obj => ({ obj, name: getSkyObjectTitle(obj) }));
      const titleCounts = new Map();
      for (const { name } of titled) {
        const key = starSearchKey(name);
        titleCounts.set(key, (titleCounts.get(key) || 0) + 1);
      }
      const candidates = titled.map(({ obj, name }) => {
        const title = titleCounts.get(starSearchKey(name)) > 1 ? obj.id : name;
        const candidate = {
          id: obj.id, title, type: obj.type, group: obj.type, category: obj.category,
          ra: obj.ra, dec: obj.dec, mag: obj.mag, x: obj.x, y: obj.y,
          radiusPx: obj.radius_px, aliases: obj.aliases, priority: obj.priority,
          searchKey: [obj.id, name, ...obj.aliases].map(starSearchKey).join(' '),
          selected: false
        };
        candidate.rank = catalogueScore(candidate, shorterEdge, wide);
        return candidate;
      }).sort((a, b) => b.rank - a.rank);

      const source = wcsFile ? 'Imported WCS' : 'On-device plate solve';
      state.starSolve = { width, height, source, wide };
      state.starAllCandidates = candidates;
      document.getElementById('starCatalogueFilters').hidden = !candidates.length;
      const stats = result.stats || {};
      const summary = document.getElementById('starSolveSummary');
      const fieldText = `RA ${formatSkyRA(center.ra)} · Dec ${formatSkyDec(center.dec)}`;
      const fovText = ` · FOV ${fov.width_deg.toFixed(2)}° × ${fov.height_deg.toFixed(2)}°`;
      const scaleText = ` · ${(scale * width / original.width).toFixed(2)}″/px`;
      const matches = Number.isFinite(stats.matches) ? ` · ${stats.matches} star matches` : '';
      summary.textContent = (upperSky ? 'Upper sky · ' : '') + fieldText + fovText + scaleText + matches;
      summary.hidden = false;
      if (candidates.length) applyCatalogDepth(true);
      else setStarSolveStatus('Field solved. No targets from the local catalogues fall inside the frame.', 'success');
    } catch (error) {
      if (isCurrent() && !controller.signal.aborted) setStarSolveStatus(error.message || 'The star field could not be solved.', 'error');
    } finally {
      clearTimeout(timeout);
      if (isCurrent()) {
        state.starSolveController = null;
        setStarSolveBusy(false);
      }
    }
  }

  function applyStarCandidatesAsPins() {
    if (!state.starSolve || !state.starCandidates.length) return;
    const selected = state.starCandidates.filter(item => item.selected);
    if (!selected.length) return;
    const dims = getTransformedDims();
    const angle = ((state.rot90 || 0) + (state.fineAngle || 0)) * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const { width, height } = state.starSolve;
    const positions = selected.map(obj => {
      const x = ((obj.x + 0.5) / width - 0.5) * state.img.width;
      const y = ((obj.y + 0.5) / height - 0.5) * state.img.height;
      return { obj, nx: (x * cos - y * sin) / dims.w + 0.5, ny: (x * sin + y * cos) / dims.h + 0.5 };
    }).filter(({ nx, ny }) => nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1);
    if (!positions.length) {
      showToast('The selected targets are outside the rotated frame.');
      return;
    }
    saveUndoBeforeAction();
    let added = 0;
    let updated = 0;
    const baseUnit = Math.max(13, Math.min(dims.w, dims.h) * 0.030);
    const radiusFactor = Math.min(dims.w, dims.h) / Math.min(width, height);
    positions.forEach(({ obj, nx, ny }) => {
      const sub = buildSkySub(obj, obj.title, state.skyCoords);
      const color = state.annColorByType ? getSkyObjectColor(obj) : (state.annBaseColor || state.annDraftColor);
      const direction = ['tr', 'tl', 'br', 'bl'][state.annotations.length % 4];
      let radiusScale;
      if (obj.radiusPx > 0) {
        const targetRadius = obj.radiusPx * radiusFactor;
        radiusScale = Math.max(0.18, Math.min(8, targetRadius / (baseUnit * 1.05)));
      } else if (obj.category === 'stars') {
        const m = Number.isFinite(obj.mag) ? obj.mag : 6.0;
        radiusScale = Math.max(0.18, Math.min(0.56, 0.56 - Math.max(0, m + 1) * 0.042));
      } else {
        radiusScale = 0.38;
      }
      const existing = state.annotations.find(pin => pin.catalogId === obj.id);
      if (existing) {
        existing.nx = nx;
        existing.ny = ny;
        existing.title = obj.title;
        existing.sub = sub;
        existing.ra = obj.ra;
        existing.dec = obj.dec;
        existing.objectType = obj.type;
        existing.annotationSource = state.starSolve.source;
        existing.mag = obj.mag;
        existing.skyId = obj.id;
        existing.radMult = radiusScale;
        existing.autoR = true;
        updated++;
        state.selectedPinId = existing.id;
      } else {
        addAnnotationAt(nx, ny, {
          title: obj.title,
          sub,
          style: state.annDraftStyle || 'atlas',
          color,
          fontFamily: state.annDraftFont,
          bgStyle: state.annDraftBg || 'shelf',
          dir: direction,
          sizeMult: state.annDraftSize || 1.0,
          radMult: radiusScale,
          autoR: true,
          catalogId: obj.id,
          ra: obj.ra,
          dec: obj.dec,
          objectType: obj.type,
          mag: obj.mag,
          skyId: obj.id,
          annotationSource: state.starSolve.source,
          silent: true
        });
        added++;
      }
    });
    syncAnnotationModalUI();
    renderAnnotationList();
    renderCanvas();
    const parts = [];
    if (added) parts.push(`${added} added`);
    if (updated) parts.push(`${updated} updated`);
    const skipped = selected.length - positions.length;
    if (skipped) parts.push(`${skipped} outside the rotated frame`);
    showToast(parts.join(' · '));
  }

  function updateAnnotationResolution(crop) {
    const resolution = document.getElementById('annotationExportResolution');
    const text = crop
      ? `${Math.max(1, Math.round(crop.w)).toLocaleString()} × ${Math.max(1, Math.round(crop.h)).toLocaleString()} PX`
      : 'NO IMAGE LOADED';
    if (resolution.textContent !== text) resolution.textContent = text;
  }

  function updateAnnotationExportUI() {
    const button = document.getElementById('btnExportAnnotatedFull');
    button.disabled = !state.img;
    updateAnnotationResolution(state.img ? getAnnotationCrop() : null);
  }

  function createFullAnnotatedFrameCanvas() {
    if (!state.img) throw new Error('Load an image before exporting.');
    const source = getTransformedDims();
    const crop = getAnnotationCrop(source);
    const width = Math.max(1, Math.round(crop.w));
    const height = Math.max(1, Math.round(crop.h));
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const outCtx = out.getContext('2d', { alpha: false });
    if (!outCtx) throw new Error('The browser could not allocate the export canvas.');
    outCtx.fillStyle = '#000000';
    outCtx.fillRect(0, 0, width, height);
    outCtx.scale(width / crop.w, height / crop.h);
    drawAnnotatedFrame(outCtx, { x: 0, y: 0, w: crop.w, h: crop.h },
      source.w / 2 - crop.x, source.h / 2 - crop.y, 1);
    return out;
  }

  // ---- Saving the annotated picture ----------------------------------------------------------------------------------
  // A computer simply downloads the file. A phone cannot "download into the gallery": the picture has to be handed to the system
  // share sheet (iPhone: "Save Image", Android: the Gallery or Photos app), and the browser only allows that straight after a tap.
  // Encoding a big picture takes longer than that, so on a phone the file is prepared first and a sheet with a fresh button follows.
  // Nothing is reported as saved unless the phone itself said so.
  function annIsTouchDevice() {
    const ua = navigator.userAgent || '';
    if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
    return /Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1;      // an iPad presents itself as a Mac
  }
  function annCanShareFile(file) {
    try { return !!(file && typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })); }
    catch (_) { return false; }
  }
  function annMakeFile(blob, name, mime) {
    try { return new File([blob], name, { type: mime, lastModified: Date.now() }); } catch (_) { return null; }
  }
  function annFileSize(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function annDownloadBlob(url, name) {
    const a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
  }
  let saveJob = null;
  function saveSheetStatus(text, kind) {
    const el = document.getElementById('saveSheetStatus');
    if (!el) return;
    el.textContent = text || '';
    el.dataset.kind = kind || '';
  }
  function saveSheetClose() {
    const m = document.getElementById('saveSheetModal');
    if (m) m.classList.remove('open');
    const img = document.getElementById('saveSheetImg');
    if (img) img.removeAttribute('src');
    const job = saveJob; saveJob = null;
    if (job && job.url) setTimeout(() => URL.revokeObjectURL(job.url), 30000);     // (a download that has just been started may still be reading it)
  }
  function saveSheetOpen(job) {
    if (saveJob) saveSheetClose();
    saveJob = job;
    const $ = id => document.getElementById(id);
    $('saveSheetImg').src = job.url;
    $('saveSheetMeta').textContent = job.w + ' × ' + job.h + ' px · ' + job.kind + ' · ' + annFileSize(job.blob.size);
    const canShare = annCanShareFile(job.file);
    $('btnSaveShare').hidden = !canShare;
    $('btnSaveDownload').classList.toggle('tone-accent', !canShare);                  // without a share sheet, Download file is the main action
    $('saveSheetHint').textContent = canShare
      ? 'Save to gallery opens your phone’s share sheet: choose Save Image (iPhone) or your Gallery or Photos app (Android). You can also press and hold the picture and choose Save to Photos or Download image.'
      : 'This browser cannot open the share sheet. Press and hold the picture and choose Save to Photos or Download image, or use Download file.';
    saveSheetStatus('');
    $('btnSaveShare').disabled = false;
    $('saveSheetModal').classList.add('open');
    const first = canShare ? $('btnSaveShare') : $('btnSaveDownload');
    if (first) first.focus({ preventScroll: true });
  }
  function saveShareNow() {                                                         // runs inside the tap itself: that is what lets the phone open its share sheet
    const job = saveJob;
    if (!job) return;
    if (!annCanShareFile(job.file)) { saveSheetStatus('This browser cannot open the share sheet. Use Download file, or press and hold the picture.', 'warn'); return; }
    const btn = document.getElementById('btnSaveShare');
    btn.disabled = true;
    saveSheetStatus('Opening the share sheet…');
    let p;
    try { p = navigator.share({ files: [job.file], title: job.name }); } catch (err) { p = Promise.reject(err); }
    p.then(() => saveSheetStatus('The share sheet closed. If you chose Save Image or your Gallery app, the picture is in your gallery now.', 'ok'))
      .catch(err => {
        if (err && err.name === 'AbortError') saveSheetStatus('Cancelled. Nothing was saved.');
        else saveSheetStatus('Your phone did not open the share sheet' + (err && err.name ? ' (' + err.name + ')' : '') + '. Use Download file, or press and hold the picture.', 'warn');
      })
      .then(() => { btn.disabled = false; });
  }
  function saveDownloadNow() {
    const job = saveJob;
    if (!job) return;
    annDownloadBlob(job.url, job.name);
    saveSheetStatus('Download started. Look for ' + job.name + ' in your Downloads folder or the Files app; it may not appear in the gallery by itself.');
  }
  document.getElementById('btnSaveShare').addEventListener('click', saveShareNow);
  document.getElementById('btnSaveDownload').addEventListener('click', saveDownloadNow);
  document.getElementById('btnSaveClose').addEventListener('click', saveSheetClose);
  document.getElementById('saveSheetModal').addEventListener('click', e => { if (e.target === e.currentTarget) saveSheetClose(); });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && saveJob && document.getElementById('saveSheetModal').classList.contains('open')) { saveSheetClose(); e.preventDefault(); }
  });

  async function exportFullAnnotatedImage() {
    const button = document.getElementById('btnExportAnnotatedFull');
    if (!state.img || !button || button.disabled) return;
    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = 'Preparing full frame…';
    try {
      const canvasOut = createFullAnnotatedFrameCanvas();
      const format = document.getElementById('annotationExportFormat').value;
      const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const extension = format === 'jpeg' ? 'jpg' : 'png';
      const w = canvasOut.width, h = canvasOut.height;
      const blob = await new Promise((resolve, reject) => {
        if (typeof canvasOut.toBlob !== 'function') {
          try {
            const dataUrl = canvasOut.toDataURL(mime, format === 'jpeg' ? 0.96 : undefined);
            const binary = atob(dataUrl.split(',')[1]);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            resolve(new Blob([bytes], { type: mime }));
          } catch (error) { reject(error); }
          return;
        }
        canvasOut.toBlob(result => {
          if (result) resolve(result);
          else reject(new Error('The browser could not encode this image. Try JPEG or a smaller source frame.'));
        }, mime, format === 'jpeg' ? 0.96 : undefined);
      });
      canvasOut.width = 1;                                                           // (the big canvas is released as soon as the file exists)
      canvasOut.height = 1;
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
      const name = `InstaSlice_FullFrame_Annotated_${stamp}.${extension}`;
      if (annIsTouchDevice()) {
        saveSheetOpen({ blob, file: annMakeFile(blob, name, mime), name, mime, w, h, kind: format === 'jpeg' ? 'JPEG' : 'PNG', url: URL.createObjectURL(blob) });
      } else {
        const url = URL.createObjectURL(blob);
        annDownloadBlob(url, name);
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        showToast('Download started · ' + name + ' · ' + w + '×' + h);
      }
    } catch (error) {
      showToast(error && error.message ? error.message : 'Full-frame export failed.');
    } finally {
      button.disabled = !state.img;
      button.textContent = oldText;
    }
  }

  function renderAnnotationList() {
    pinDockSync();
    if (state.moonCandidates && state.moonCandidates.length) moonUpdateSelectionUI();     // (the label of "Add features" depends on which of them are pinned)
    const list = document.getElementById('annList');
    document.getElementById('annCountLabel').textContent = state.annotations.length;

    if (state.annotations.length === 0) {
      list.innerHTML = `<div class="strip-empty">No target pins yet. Tap "Tap Image to Place" or "+ Add at Center".</div>`;
      return;
    }

    list.innerHTML = '';
    state.annotations.forEach((ann, idx) => {
      const isSel = ann.id === state.selectedPinId;
      const row = document.createElement('div');
      row.className = 'ann-item' + (isSel ? ' selected' : '');
      const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      row.innerHTML = `
        <div class="ann-item-left">
          <span class="ann-dot" style="background:${esc(ann.color)}"></span>
          <div class="ann-texts">
            <strong>#${idx + 1} ${esc(ann.title || 'Target')}</strong>
            <span>${esc(ann.sub || String(ann.style || 'classic').toUpperCase())} • ${ann.dir ? ann.dir.toUpperCase() : 'TR'} • (${Math.round(ann.nx * 100)}%, ${Math.round(ann.ny * 100)}%)</span>
          </div>
        </div>
        <div class="ann-actions">
          <button class="blur-mini-btn btn-flip-dir" title="Cycle Callout Quadrant Direction (TR / TL / BR / BL)">${(ann.dir || 'tr').toUpperCase()}</button>
          <button class="blur-mini-btn btn-aim-pin" title="Set as CineReel 3D Zoom Target">Aim</button>
          <button class="blur-mini-btn btn-del-pin" style="color:var(--rose)" title="Delete Pin">×</button>
        </div>
      `;
      row.addEventListener('click', () => {
        state.selectedPinId = ann.id;
        annPulse(ann.id);
        if (annDockOnRowTap()) { pinDockOpen(ann.id); return; }        // (on a phone the fields of the Pins tab are far below the list: the quick-edit card is right here)
        syncAnnotationModalUI();
        renderAnnotationList();
        renderCanvas();
      });
      row.querySelector('.btn-flip-dir').addEventListener('click', e => {
        e.stopPropagation();
        const order = ['tr', 'tl', 'br', 'bl'];
        const curIdx = order.indexOf(ann.dir || 'tr');
        ann.dir = order[(curIdx + 1) % order.length];
        state.selectedPinId = ann.id;
        syncAnnotationModalUI();
        renderAnnotationList();
        renderCanvas();
      });
      row.querySelector('.btn-aim-pin').addEventListener('click', e => {
        e.stopPropagation();
        state.reelTargetX = ann.nx;
        state.reelTargetY = ann.ny;
        showToast(`3D CineReel aimed at "${ann.title}"`);
      });
      row.querySelector('.btn-del-pin').addEventListener('click', e => {
        e.stopPropagation();
        state.annotations.splice(idx, 1);
        if (state.selectedPinId === ann.id) {
          state.selectedPinId = state.annotations.length > 0 ? state.annotations[state.annotations.length - 1].id : null;
        }
        syncAnnotationModalUI();
        renderAnnotationList();
        renderCanvas();
      });
      list.appendChild(row);
    });
    if (state._annListFor !== state.selectedPinId) {                // the row of the annotation that was just selected comes into view
      state._annListFor = state.selectedPinId;
      const rowSel = list.querySelector('.ann-item.selected'), pane = list.closest('.ann-pane');
      if (rowSel && pane && pane.scrollHeight > pane.clientHeight) {
        const pr = pane.getBoundingClientRect(), rr = rowSel.getBoundingClientRect();
        if (rr.top < pr.top + 4 || rr.bottom > pr.bottom - 4) pane.scrollTop += (rr.top - pr.top) - Math.max(8, (pr.height - rr.height) / 2);
      }
    }
  }

  // SLIDE GENERATION ENGINE
  function canvasToSlideObj(offCanvas, title, kind) {
    const mime = state.exportFormat === 'png' ? 'image/png' : 'image/jpeg';
    const dataUrl = offCanvas.toDataURL(mime, 1.0);
    return {
      id: Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      title,
      kind,
      dataUrl
    };
  }

  function slicerFrame(crop, index) {
    const across = state.direction === 'horiz', count = state.sliceCount;
    const w = across ? crop.w / count : crop.w, h = across ? crop.h : crop.h / count;
    return {
      x: crop.x + (across ? index * w : 0), y: crop.y + (across ? 0 : index * h),
      w, h, fitMarkers: true, openEdge: index < count - 1 ? (across ? 'x' : 'y') : null
    };
  }

  function generateSlices() {
    if (!state.img) return;
    state.showBlurOnMain = false;
    const crop = getCropRect();
    const outW = state.exportWidth;
    const outH = Math.round(outW / crop.singleAspect);
    const n = state.sliceCount;

    state.slides = state.slides.filter(s => s.kind !== 'slice');

    const newSlices = [];
    for (let i = 0; i < n; i++) {
      const off = document.createElement('canvas');
      off.width = outW;
      off.height = outH;
      const octx = off.getContext('2d');
      octx.imageSmoothingEnabled = true;
      octx.imageSmoothingQuality = 'high';

      const frame = slicerFrame(crop, i);
      const ratioToOut = outW / frame.w, exportScale = state.scale * ratioToOut;
      const frameH = frame.h * ratioToOut;
      const imgCenterScreenX = crop.x + crop.w / 2 + state.offsetX;
      const imgCenterScreenY = crop.y + crop.h / 2 + state.offsetY;
      const cx = (imgCenterScreenX - frame.x) * ratioToOut;
      const cy = (imgCenterScreenY - frame.y) * ratioToOut;
      // Round the canvas size without changing which photo points belong to the slice.
      octx.scale(1, outH / frameH);
      drawSourceTransformed(octx, cx, cy, exportScale, false);
      drawCroppedAnnotationLayer(octx, cx, cy, exportScale, {
        ...frame, x: 0, y: 0, w: outW, h: frameH
      }, i === 0);

      if (i === 0) {
        drawTelemetryOverlay(octx, outW, frameH);
      }

      newSlices.push(canvasToSlideObj(off, `Slice ${i + 1}`, 'slice'));
    }

    if (state.reverseOrder) newSlices.reverse();
    state.slides = [...newSlices, ...state.slides];
    renderFilmstrip();
    renderCanvas();
    showToast(`Generated ${n} ${state.direction === 'horiz' ? 'Horizontal' : 'Vertical'} slide${n > 1 ? 's' : ''}`);
  }

  function addDetailSlide() {
    if (!state.img) return;
    state.showBlurOnMain = false;
    const crop = getCropRect();
    const outW = state.exportWidth;
    const outH = Math.round(outW / crop.singleAspect);

    const singleW = state.direction === 'horiz' ? (crop.w / state.sliceCount) : crop.w;
    const singleH = state.direction === 'vert' ? (crop.h / state.sliceCount) : crop.h;

    const off = document.createElement('canvas');
    off.width = outW;
    off.height = outH;
    const octx = off.getContext('2d');
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';

    const ratioToOut = outW / singleW;
    const cx = outW / 2 + state.offsetX * ratioToOut, cy = outH / 2 + state.offsetY * ratioToOut;
    const exportScale = state.scale * ratioToOut;
    drawSourceTransformed(octx, cx, cy, exportScale, false);
    drawCroppedAnnotationLayer(octx, cx, cy, exportScale, { x: 0, y: 0, w: outW, h: outH, fitMarkers: true }, true);
    drawTelemetryOverlay(octx, outW, outH);

    const dims = getTransformedDims();
    const boxImgW = singleW / state.scale;
    const boxImgH = singleH / state.scale;
    const boxImgCenterX = dims.w / 2 - state.offsetX / state.scale;
    const boxImgCenterY = dims.h / 2 - state.offsetY / state.scale;

    state.detailBoxes.push({
      nx: (boxImgCenterX - boxImgW / 2) / dims.w,
      ny: (boxImgCenterY - boxImgH / 2) / dims.h,
      nw: boxImgW / dims.w,
      nh: boxImgH / dims.h
    });

    const detailIdx = state.detailBoxes.length;
    state.slides.push(canvasToSlideObj(off, `Detail #${detailIdx}`, 'detail'));
    renderFilmstrip();
    renderCanvas();
    showToast(`Added Detail #${detailIdx} (logged for Box Map)`);
  }

  function createFullFitCanvas(customWidth) {
    const singleAspect = ASPECT_MAP[state.aspect];
    const outW = customWidth || state.exportWidth;
    const outH = Math.round(outW / singleAspect);
    const off = document.createElement('canvas');
    off.width = outW;
    off.height = outH;
    const octx = off.getContext('2d');
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';

    const dims = getTransformedDims();

    if (state.fitBg === 'white') {
      octx.fillStyle = '#f8fafc';
      octx.fillRect(0, 0, outW, outH);
    } else if (state.fitBg === 'black') {
      octx.fillStyle = '#05070b';
      octx.fillRect(0, 0, outW, outH);
    } else {
      drawCustomBlurredBackground(octx, outW, outH, state.fitBlur);
    }

    const pad = outW * state.fitMargin;
    const availW = outW - pad * 2;
    const availH = outH - pad * 2;
    const fitScale = Math.min(availW / dims.w, availH / dims.h);
    const drawW = dims.w * fitScale;
    const drawH = dims.h * fitScale;
    const drawX = (outW - drawW) / 2;
    const drawY = (outH - drawH) / 2;

    octx.save();
    octx.beginPath();
    octx.rect(drawX, drawY, drawW, drawH);
    octx.clip();
    drawSourceTransformed(octx, outW / 2, outH / 2, fitScale, true);
    octx.restore();

    octx.strokeStyle = state.fitBg === 'white' ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.22)';
    octx.lineWidth = Math.max(1.5, Math.round(outW / 540));
    octx.strokeRect(drawX, drawY, drawW, drawH);

    drawTelemetryOverlay(octx, outW, outH);

    return { off, octx, drawX, drawY, drawW, drawH, outW, outH };
  }

  function setFitBackgroundStyle(style) {
    state.fitBg = style;
    document.querySelectorAll('#bgStyleGroup .seg-btn').forEach(button => {
      button.classList.toggle('active', button.dataset.bg === style);
    });
    document.getElementById('blurSliderRow').style.opacity = style === 'blur' ? '1' : '0.35';
  }

  function syncBlurControls(val) {
    state.fitBlur = val;
    document.getElementById('lblMainBlur').textContent = `${val}px`;
    document.getElementById('rngMainBlur').value = val;
    document.getElementById('lblBlur').textContent = `${val}px`;
    document.getElementById('rngBlur').value = val;
    document.getElementById('lblReelBlur').textContent = `${val}px`;
    document.getElementById('rngReelBlur').value = val;
    const colBlur = document.getElementById('rngColBlur');
    if (colBlur) { const cb = collageBlur(); colBlur.value = cb; document.getElementById('lblColBlur').textContent = `${cb}px`; }
  }

  function updateFitStylePreview() {
    if (!state.img) return;
    const prevCanvas = document.getElementById('fitPreviewCanvas');
    const { off } = createFullFitCanvas(360);
    prevCanvas.width = off.width;
    prevCanvas.height = off.height;
    const pctx = prevCanvas.getContext('2d');
    pctx.drawImage(off, 0, 0);
  }

  function addFullFitSlide() {
    if (!state.img) return;
    state.showBlurOnMain = false;
    const { off } = createFullFitCanvas();
    state.slides.push(canvasToSlideObj(off, 'Full Fit', 'fit'));
    renderFilmstrip();
    renderCanvas();
    showToast(`Added Full-Fit (${state.fitBg === 'blur' ? 'Blur ' + state.fitBlur + 'px' : state.fitBg})`);
  }

  function addBoxMapSlide() {
    if (!state.img) return;
    state.showBlurOnMain = false;
    const { off, octx, drawX, drawY, drawW, drawH, outW } = createFullFitCanvas();

    const boxes = state.detailBoxes.length > 0
      ? state.detailBoxes
      : [{ nx: 0.32, ny: 0.28, nw: 0.36, nh: 0.44 }];

    octx.save();
    octx.fillStyle = 'rgba(4, 6, 12, 0.42)';
    octx.beginPath();
    octx.rect(drawX, drawY, drawW, drawH);
    boxes.forEach(b => {
      const bx = drawX + b.nx * drawW;
      const by = drawY + b.ny * drawH;
      const bw = b.nw * drawW;
      const bh = b.nh * drawH;
      octx.rect(bx + bw, by, -bw, bh);
    });
    octx.fill('evenodd');
    octx.restore();

    const strokeW = Math.max(3, Math.round(outW / 320));
    boxes.forEach((b, idx) => {
      const bx = Math.max(drawX, drawX + b.nx * drawW);
      const by = Math.max(drawY, drawY + b.ny * drawH);
      const bw = Math.min(drawW - (bx - drawX), b.nw * drawW);
      const bh = Math.min(drawH - (by - drawY), b.nh * drawH);

      octx.strokeStyle = '#38bdf8';
      octx.lineWidth = strokeW;
      octx.strokeRect(bx, by, bw, bh);

      const tagH = Math.round(outW * 0.036);
      const tagW = Math.round(tagH * 1.45);
      octx.fillStyle = '#38bdf8';
      octx.fillRect(bx - strokeW / 2, Math.max(drawY, by - tagH), tagW, tagH);

      octx.fillStyle = '#041019';
      octx.font = `800 ${Math.round(tagH * 0.64)}px -apple-system, sans-serif`;
      octx.fillText(`#${idx + 1}`, bx + tagW * 0.18, Math.max(drawY + tagH * 0.76, by - tagH * 0.24));
    });

    state.slides.push(canvasToSlideObj(off, 'Box Map', 'map'));
    renderFilmstrip();
    renderCanvas();
    showToast('Added Callout Box Map slide');
  }

  function renderFilmstrip() {
    const strip = document.getElementById('filmstrip');
    const count = state.slides.length;
    document.getElementById('slideCountLabel').textContent = count;
    document.getElementById('exportCount').textContent = count;

    if (count === 0) {
      strip.innerHTML = `<div class="strip-empty">Tap "Slice", "3D CineReel" or "+ Detail" below</div>`;
      return;
    }

    strip.innerHTML = '';
    state.slides.forEach((s, i) => {
      const item = document.createElement('div');
      item.className = 'thumb-item';
      item.innerHTML = `
        <img src="${s.dataUrl}" alt="${s.title}">
        <span class="thumb-num">#${i + 1}</span>
        <button class="thumb-del" title="Remove">×</button>
      `;
      item.querySelector('img').addEventListener('click', () => openExportModal(i));
      item.querySelector('.thumb-del').addEventListener('click', e => {
        e.stopPropagation();
        state.slides.splice(i, 1);
        renderFilmstrip();
      });
      strip.appendChild(item);
    });
  }

  function updatePrimaryButtonLabel() {
    const dirWord = state.direction === 'horiz' ? 'Horiz' : 'Vert';
    document.getElementById('sliceBtnLabel').textContent =
      state.sliceCount === 1
        ? `Slice 1× Frame`
        : `Slice ${state.sliceCount}× ${dirWord}`;
  }

  // =========================================================================
  // TRUE 3D PERSPECTIVE ENGINE & 3-TIER ASTROPHOTOGRAPHY STARFIELD
  // =========================================================================
  const reelCanvas = document.getElementById('reelCanvas');
  const rctx = reelCanvas.getContext('2d');
  let reelAnimId = null;
  let reelStartTime = 0;
  let reelSourceImgCanvas = null;
  let reelBgCanvas = null;
  let reelStars3D = [];
  let reelExportProfile = null;

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeInOutSine(t) { return -(Math.cos(Math.PI * t) - 1) / 2; }
  function easeOutBack(t) {
    const c1 = 1.15;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  function getReelAspectRatio() {
    const dims = getTransformedDims();
    if (state.reelFraming === 'original') {
      return dims.w / dims.h;
    } else if (state.reelFraming === 'cover916') {
      return 9 / 16;
    } else if (state.reelFraming === 'cover34') {
      return 3 / 4;
    } else if (state.reelFraming === 'cover45') {
      return 4 / 5;
    } else {
      return ASPECT_MAP[state.aspect] || (3 / 4);
    }
  }

  function rotate3D(x, y, z, pitch, yaw, roll) {
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const y1 = y * cp - z * sp;
    const z1 = y * sp + z * cp;
    const x1 = x;

    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const x2 = x1 * cy + z1 * sy;
    const z2 = -x1 * sy + z1 * cy;
    const y2 = y1;

    const cr = Math.cos(roll), sr = Math.sin(roll);
    const x3 = x2 * cr - y2 * sr;
    const y3 = x2 * sr + y2 * cr;
    return { x: x3, y: y3, z: z2 };
  }

  function project3D(pt, cx, cy, fov) {
    const safeZ = Math.max(-fov * 0.88, pt.z);
    const scale = fov / (fov + safeZ);
    return {
      x: cx + pt.x * scale,
      y: cy + pt.y * scale,
      scale,
      z: safeZ,
      X: pt.x, Y: pt.y, cx, cy, fv: fov   // camera-space position + camera, kept so quads can be subdivided perspective-correctly
    };
  }

  // ---------------------------------------------------------------------------
  // Seam-free textured quads.
  // Each quad is laid out as one or a few affine cells (no diagonal split), and every cell reaches ~1px over its
  // neighbours, so touching panels overlap instead of leaving a hairline gap. Translucent quads are stamped opaque
  // into a scratch canvas and blended once, so the overlap never double-darkens or double-brightens. Big or
  // strongly tilted quads are cut into a few strips so the perspective stays true across them.
  // ---------------------------------------------------------------------------
  // kept exactly as before: the Canvas2D fallback of the two photo effects (Hyperjump / Warp Spiral) still draws with it
  function drawTexturedTriangle(targetCtx, img, u0, v0, u1, v1, u2, v2, x0, y0, x1, y1, x2, y2, seamExpand = 0.65) {
    // Sub-rect UV bounding box so the GPU only samples the small tile instead of the entire full-res canvas!
    const minU = Math.max(0, Math.floor(Math.min(u0, u1, u2)) - 1);
    const minV = Math.max(0, Math.floor(Math.min(v0, v1, v2)) - 1);
    const maxU = Math.min(img.width, Math.ceil(Math.max(u0, u1, u2)) + 1);
    const maxV = Math.min(img.height, Math.ceil(Math.max(v0, v1, v2)) + 1);
    const subW = maxU - minU;
    const subH = maxV - minV;
    if (subW <= 0 || subH <= 0) return;

    const lu0 = u0 - minU, lv0 = v0 - minV;
    const lu1 = u1 - minU, lv1 = v1 - minV;
    const lu2 = u2 - minU, lv2 = v2 - minV;

    const du1 = lu1 - lu0, dv1 = lv1 - lv0;
    const du2 = lu2 - lu0, dv2 = lv2 - lv0;
    const det = du1 * dv2 - du2 * dv1;
    if (Math.abs(det) < 1e-5) return;
    const idet = 1 / det;

    const dx1 = x1 - x0, dy1 = y1 - y0;
    const dx2 = x2 - x0, dy2 = y2 - y0;

    const a = (dv2 * dx1 - dv1 * dx2) * idet;
    const b = (dv2 * dy1 - dv1 * dy2) * idet;
    const c = (-du2 * dx1 + du1 * dx2) * idet;
    const d = (-du2 * dy1 + du1 * dy2) * idet;
    const e = x0 - a * lu0 - c * lv0;
    const f = y0 - b * lu0 - d * lv0;

    const cx = (x0 + x1 + x2) * 0.333333;
    const cy = (y0 + y1 + y2) * 0.333333;
    const ex0 = x0 + Math.sign(x0 - cx) * seamExpand;
    const ey0 = y0 + Math.sign(y0 - cy) * seamExpand;
    const ex1 = x1 + Math.sign(x1 - cx) * seamExpand;
    const ey1 = y1 + Math.sign(y1 - cy) * seamExpand;
    const ex2 = x2 + Math.sign(x2 - cx) * seamExpand;
    const ey2 = y2 + Math.sign(y2 - cy) * seamExpand;

    targetCtx.save();
    targetCtx.beginPath();
    targetCtx.moveTo(ex0, ey0);
    targetCtx.lineTo(ex1, ey1);
    targetCtx.lineTo(ex2, ey2);
    targetCtx.closePath();
    targetCtx.clip();
    targetCtx.transform(a, b, c, d, e, f);
    targetCtx.drawImage(img, minU, minV, subW, subH, 0, 0, subW, subH);
    targetCtx.restore();
  }

  let reelBleed = 0.9;   // how far (screen px) every panel reaches over its neighbours; set per frame from the output size
  let reelStamp = null, reelStampCtx = null;
  function getReelStamp(w, h) {
    if (!reelStamp) { reelStamp = document.createElement('canvas'); reelStampCtx = reelStamp.getContext('2d'); }
    if (reelStamp.width < w || reelStamp.height < h) {
      reelStamp.width = Math.max(reelStamp.width, Math.ceil(w / 64) * 64 + 64);
      reelStamp.height = Math.max(reelStamp.height, Math.ceil(h / 64) * 64 + 64);
    }
    reelStampCtx.setTransform(1, 0, 0, 1, 0, 0);
    reelStampCtx.globalAlpha = 1;
    reelStampCtx.globalCompositeOperation = 'source-over';
    reelStampCtx.clearRect(0, 0, w, h);
    return reelStampCtx;
  }

  let reelLayer = null, reelLayerCtx = null;
  function beginReelLayer(w, h) {
    if (!reelLayer) { reelLayer = document.createElement('canvas'); reelLayerCtx = reelLayer.getContext('2d'); }
    if (reelLayer.width !== w || reelLayer.height !== h) { reelLayer.width = w; reelLayer.height = h; }
    else { reelLayerCtx.setTransform(1, 0, 0, 1, 0, 0); reelLayerCtx.clearRect(0, 0, w, h); }
    reelLayerCtx.globalAlpha = 1;
    return reelLayerCtx;
  }
  function endReelLayer(target, alpha) {
    if (alpha <= 0.004) return;
    target.save();
    target.globalAlpha = clamp01(alpha);
    target.drawImage(reelLayer, 0, 0);
    target.restore();
  }

  // One affine cell: the picture rectangle (u0,v0)-(u1,v1) is laid onto the screen quad (x0,y0 top-left, then clockwise)
  // by the "mean parallelogram" of its four corners. The source rectangle is widened by ~1 screen px on every side
  // with the neighbouring picture, so cells that touch overlap instead of leaving a hairline gap (no clip path needed,
  // no diagonal split, nothing to anti-alias against).
  function drawTexturedCell(ctx, img, u0, v0, u1, v1, x0, y0, x1, y1, x2, y2, x3, y3) {
    const w = u1 - u0, h = v1 - v0;
    if (!(w > 0 && h > 0)) return;
    const a = ((x1 - x0) + (x2 - x3)) / (2 * w), b = ((y1 - y0) + (y2 - y3)) / (2 * w);
    const c = ((x3 - x0) + (x2 - x1)) / (2 * h), d = ((y3 - y0) + (y2 - y1)) / (2 * h);
    if (!(Math.abs(a * d - b * c) > 1e-7)) return;                      // edge-on or collapsed
    const e = (x0 + x1 + x2 + x3) * 0.25 - a * (w / 2) - c * (h / 2);
    const f = (y0 + y1 + y2 + y3) * 0.25 - b * (w / 2) - d * (h / 2);
    const capT = Math.max(4, reelBleed * 1.3);
    const mu = Math.min(capT, reelBleed / Math.max(Math.hypot(a, b), 1e-3));   // the bleed, expressed in texels
    const mv = Math.min(capT, reelBleed / Math.max(Math.hypot(c, d), 1e-3));
    const sx0 = Math.max(0, u0 - mu), sy0 = Math.max(0, v0 - mv);
    const sx1 = Math.min(img.width, u1 + mu), sy1 = Math.min(img.height, v1 + mv);
    if (sx1 <= sx0 || sy1 <= sy0) return;
    ctx.save();
    ctx.transform(a, b, c, d, e, f);
    ctx.drawImage(img, sx0, sy0, sx1 - sx0, sy1 - sy0, sx0 - u0, sy0 - v0, sx1 - sx0, sy1 - sy0);
    ctx.restore();
  }

  // How many strips (along u, along v) keep the affine error of this quad below ~0.35px.
  function reelQuadSplit(p0, p1, p2, p3) {
    if (!p0.fv) return [1, 1];
    const fv = p0.fv, cx = p0.cx, cy = p0.cy, zmin = -fv * 0.88;
    const P = (u, v) => {
      const X = p0.X + u * (p1.X - p0.X) + v * (p3.X - p0.X);
      const Y = p0.Y + u * (p1.Y - p0.Y) + v * (p3.Y - p0.Y);
      let Z = p0.z + u * (p1.z - p0.z) + v * (p3.z - p0.z);
      if (Z < zmin) Z = zmin;
      const s = fv / (fv + Z);
      return [cx + X * s, cy + Y * s];
    };
    let errU = 0, errV = 0;
    for (let k = 0; k < 3; k++) {
      const t = k * 0.5;
      const l = P(0, t), m = P(0.5, t), r = P(1, t);
      errU = Math.max(errU, Math.hypot(m[0] - (l[0] + r[0]) / 2, m[1] - (l[1] + r[1]) / 2));
      const tp = P(t, 0), mm = P(t, 0.5), bt = P(t, 1);
      errV = Math.max(errV, Math.hypot(mm[0] - (tp[0] + bt[0]) / 2, mm[1] - (tp[1] + bt[1]) / 2));
    }
    const wPx = Math.hypot(p1.x - p0.x, p1.y - p0.y), hPx = Math.hypot(p3.x - p0.x, p3.y - p0.y);
    const nU = Math.max(1, Math.min(6, Math.ceil(Math.sqrt(errU / 0.35)), Math.floor(wPx / 6) || 1));
    const nV = Math.max(1, Math.min(6, Math.ceil(Math.sqrt(errV / 0.35)), Math.floor(hPx / 6) || 1));
    return [nU, nV];
  }

  function reelQuadFill(ctx, img, sx, sy, sw, sh, p0, p1, p2, p3, nU, nV, ox, oy) {
    if (nU === 1 && nV === 1) {
      drawTexturedCell(ctx, img, sx, sy, sx + sw, sy + sh,
        p0.x - ox, p0.y - oy, p1.x - ox, p1.y - oy, p2.x - ox, p2.y - oy, p3.x - ox, p3.y - oy);
      return;
    }
    const fv = p0.fv, cx = p0.cx, cy = p0.cy, zmin = -fv * 0.88;
    const gx = [], gy = [];
    for (let j = 0; j <= nV; j++) {
      const v = j / nV;
      for (let i = 0; i <= nU; i++) {
        const u = i / nU;
        const X = p0.X + u * (p1.X - p0.X) + v * (p3.X - p0.X);
        const Y = p0.Y + u * (p1.Y - p0.Y) + v * (p3.Y - p0.Y);
        let Z = p0.z + u * (p1.z - p0.z) + v * (p3.z - p0.z);
        if (Z < zmin) Z = zmin;
        const s = fv / (fv + Z);
        gx.push(cx + X * s - ox);
        gy.push(cy + Y * s - oy);
      }
    }
    const row = nU + 1;
    for (let j = 0; j < nV; j++) {
      const v0 = sy + sh * j / nV, v1 = sy + sh * (j + 1) / nV;
      for (let i = 0; i < nU; i++) {
        const u0 = sx + sw * i / nU, u1 = sx + sw * (i + 1) / nU;
        const a = j * row + i, b = a + 1, c = a + row + 1, d = a + row;
        drawTexturedCell(ctx, img, u0, v0, u1, v1, gx[a], gy[a], gx[b], gy[b], gx[c], gy[c], gx[d], gy[d]);
      }
    }
  }

  // A panel is drawn opaque into a scratch canvas first when it is translucent or carries a sheen; the sheen / fade is then
  // applied once to exactly the pixels the panel covers (borders and bleed included), so panel edges are never a shade
  // darker or lighter than their middle.
  function drawPerspectiveQuad(targetCtx, img, sx, sy, sw, sh, p0, p1, p2, p3, alpha, specSheen = 0) {
    if (!(alpha > 0.01)) return;
    const cw = targetCtx.canvas.width, ch = targetCtx.canvas.height;
    const minX = Math.min(p0.x, p1.x, p2.x, p3.x), maxX = Math.max(p0.x, p1.x, p2.x, p3.x);
    const minY = Math.min(p0.y, p1.y, p2.y, p3.y), maxY = Math.max(p0.y, p1.y, p2.y, p3.y);
    if (!(maxX > -3 && minX < cw + 3 && maxY > -3 && minY < ch + 3)) return;   // off-screen (also rejects NaN)
    if (maxX - minX < 0.15 && maxY - minY < 0.15) return;
    const split = reelQuadSplit(p0, p1, p2, p3);
    const nU = split[0], nV = split[1];
    const sheenTop = typeof specSheen === 'number' ? specSheen : Math.max(specSheen.a0, specSheen.a1, specSheen.am || 0);
    const sheen = sheenTop > 0.01;

    const bx = Math.max(-2, Math.floor(minX) - 3), by = Math.max(-2, Math.floor(minY) - 3);
    const bw = Math.min(cw + 2, Math.ceil(maxX) + 3) - bx, bh = Math.min(ch + 2, Math.ceil(maxY) + 3) - by;
    if (bw < 1 || bh < 1) return;
    if (alpha >= 0.995 && (!sheen || bw * bh > 2.5e6)) {
      reelQuadFill(targetCtx, img, sx, sy, sw, sh, p0, p1, p2, p3, nU, nV, 0, 0);
      return;
    }
    if (bw * bh > 9e6) return;
    const st = getReelStamp(bw, bh);
    reelQuadFill(st, img, sx, sy, sw, sh, p0, p1, p2, p3, nU, nV, bx, by);
    if (sheen) {
      st.save();
      st.globalCompositeOperation = 'source-atop';
      const tint = a => `rgba(235, 246, 255, ${Math.max(0, Math.min(0.45, a))})`;
      if (typeof specSheen === 'number') {
        st.fillStyle = tint(specSheen);
      } else {
        // gradient between two opposite panel edges (top→bottom, or left→right with axis 'u')
        const alongU = specSheen.axis === 'u';
        const gx0 = alongU ? (p0.x + p3.x) / 2 : (p0.x + p1.x) / 2, gy0 = alongU ? (p0.y + p3.y) / 2 : (p0.y + p1.y) / 2;
        const gx1 = alongU ? (p1.x + p2.x) / 2 : (p3.x + p2.x) / 2, gy1 = alongU ? (p1.y + p2.y) / 2 : (p3.y + p2.y) / 2;
        const g = st.createLinearGradient(gx0 - bx, gy0 - by, gx1 - bx, gy1 - by);
        g.addColorStop(0, tint(specSheen.a0));
        if (specSheen.am !== undefined) g.addColorStop(0.5, tint(specSheen.am));
        g.addColorStop(1, tint(specSheen.a1));
        st.fillStyle = g;
      }
      st.fillRect(0, 0, bw, bh);
      st.restore();
    }
    targetCtx.save();
    targetCtx.globalAlpha = alpha;
    targetCtx.drawImage(reelStamp, 0, 0, bw, bh, bx, by, bw, bh);
    targetCtx.restore();
  }

  // ---- smooth-motion helpers --------------------------------------------------
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(t) { t = clamp01(t); return t * t * (3 - 2 * t); }
  function smootherstep(t) { t = clamp01(t); return t * t * t * (t * (t * 6 - 15) + 10); }
  function easeInOutQuint(t) { return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2; }

  // speed curves offered for Starlight Dive and Cosmic Pullback (progress 0→1 as a function of time 0→1)
  const REEL_CURVES = {
    sine:   { label: 'Smooth',       fn: easeInOutSine },
    cubic:  { label: 'Cinematic',    fn: easeInOutCubic },
    quint:  { label: 'Dramatic',     fn: easeInOutQuint },
    in:     { label: 'Slow burn',    fn: t => t * t * t },
    out:    { label: 'Soft landing', fn: easeOutCubic },
    linear: { label: 'Constant',     fn: t => t }
  };
  function reelCurveId(preset) {
    const own = state.reelCurve && state.reelCurve[preset];
    return REEL_CURVES[own] ? own : (preset === 'zoomout' ? 'cubic' : 'sine');
  }

  // soft-edged rounded window used by the Warp Portal layers (built once)
  let reelPortalMask = null;
  function getPortalMask() {
    if (reelPortalMask) return reelPortalMask;
    const S = 160, m = document.createElement('canvas');
    m.width = S; m.height = S;
    const mc = m.getContext('2d');
    const id = mc.createImageData(S, S), d = id.data;
    const half = S / 2, rad = S * 0.16, feather = S * 0.12;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const qx = Math.abs(x + 0.5 - half) - (half - rad), qy = Math.abs(y + 0.5 - half) - (half - rad);
        const sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad;   // < 0 inside
        const a = smoothstep(-sd / feather);
        const o = (y * S + x) * 4;
        d[o] = 255; d[o + 1] = 255; d[o + 2] = 255; d[o + 3] = Math.round(a * 255);
      }
    }
    mc.putImageData(id, 0, 0);
    reelPortalMask = m;
    return m;
  }

  // Softens the edge of a painted window: only the border band is multiplied by the mask (inside the band's inner edge the
  // mask is fully opaque), so the work is a fraction of masking the whole window.
  function reelPortalSoften(st, bw, bh) {
    const mask = getPortalMask();
    const ix = Math.min(bw >> 1, Math.ceil(bw * 0.14)), iy = Math.min(bh >> 1, Math.ceil(bh * 0.14));
    const strips = [[0, 0, bw, iy], [0, bh - iy, bw, iy], [0, iy, ix, bh - 2 * iy], [bw - ix, iy, ix, bh - 2 * iy]];
    for (let k = 0; k < 4; k++) {
      const r = strips[k];
      if (!(r[2] > 0 && r[3] > 0)) continue;
      st.save();
      st.beginPath(); st.rect(r[0], r[1], r[2], r[3]); st.clip();
      st.globalCompositeOperation = 'destination-in';
      st.drawImage(mask, 0, 0, bw, bh);
      st.restore();
    }
  }

  function buildRealistic3DStarfield(srcCanvas) {
    buildMoffatStarKernels();
    const sw = 200;
    const sh = Math.max(60, Math.round(sw * (srcCanvas.height / srcCanvas.width)));
    const temp = document.createElement('canvas');
    temp.width = sw;
    temp.height = sh;
    const tctx = temp.getContext('2d');
    tctx.drawImage(srcCanvas, 0, 0, sw, sh);
    const data = tctx.getImageData(0, 0, sw, sh).data;

    const detected = [];
    for (let y = 2; y < sh - 2; y++) {
      for (let x = 2; x < sw - 2; x++) {
        const idx = (y * sw + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const upIdx = ((y - 2) * sw + x) * 4;
        const dnIdx = ((y + 2) * sw + x) * 4;
        const leftIdx = (y * sw + (x - 2)) * 4;
        const rightIdx = (y * sw + (x + 2)) * 4;
        const avgNeighbor = (data[upIdx] + data[dnIdx] + data[leftIdx] + data[rightIdx]) * 0.25;
        if (lum > 118 && (lum - avgNeighbor) > 13) {
          const brDiff = b - r;
          let specIdx = 2;
          if (brDiff > 35) specIdx = 0;
          else if (brDiff > 12) specIdx = 1;
          else if (brDiff < -55) specIdx = 6;
          else if (brDiff < -30) specIdx = 5;
          else if (brDiff < -12) specIdx = 4;
          else specIdx = 3;

          detected.push({ nx: x / sw, ny: y / sh, lum, specIdx });
        }
      }
    }

    detected.sort((a, b) => b.lum - a.lum);
    const chosen = detected.slice(0, 260);

    const totalStars = state.reelGrid === 8 ? 2200 : (state.reelGrid === 4 ? 800 : 1400);
    const opticsLabel = state.reelSpikes ? 'Spikes On' : 'Apo Pinpoint';
    if (!state.reelRecording && !document.getElementById('btnSaveRenderedVideo').classList.contains('visible')) {
      document.getElementById('reelStatusBadge').textContent = `${totalStars} ★ • ${opticsLabel}`;
    }

    const stars = [];
    // Deterministic pseudo-random sequence keeps the same stars in the same
    // places whenever the preview is resized or rebuilt.
    let seed = ((srcCanvas.width * 73856093) ^ (srcCanvas.height * 19349663) ^ 0x5f3759df) >>> 0;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < totalStars; i++) {
      const fromReal = i < chosen.length && (i % 2 === 0);
      const base = fromReal ? chosen[i] : null;

      const nx = base ? base.nx : (-0.45 + rand() * 1.90);
      const ny = base ? base.ny : (-0.45 + rand() * 1.90);
      const specIdx = base ? base.specIdx : ((i * 19 + 5) % SPECTRAL_PALETTE.length);

      let tier = 0;
      if (i < 38 || (base && base.lum > 235 && i < 65)) {
        tier = 2;
      } else if (i % 4 === 0 || fromReal) {
        tier = 1;
      }

      const magFlux = tier === 2
        ? (0.78 + rand() * 0.22)
        : (tier === 1 ? (0.35 + Math.pow(rand(), 1.8) * 0.60) : (0.18 + Math.pow(rand(), 2.2) * 0.65));

      stars.push({
        nx,
        ny,
        z0: 0.06 + ((i * 43) % 1000) / 1000 * 1.85,
        specIdx,
        tier,
        magFlux,
        twinklePhase: rand() * Math.PI * 2,
        twinkleSpeed: 1.2 + rand() * 2.8
      });
    }
    return stars;
  }

  function releaseReelCanvas(buffer) {
    if (buffer) buffer.width = buffer.height = 1;
  }

  function makeReelBackdrop(outW, outH, srcW, srcH, source) {
    if (getReelImageLayout(outW, outH, srcW, srcH).isFullBleed) return null;
    const solid = state.reelFraming === 'fitblur' ? { white: '#f8fafc', black: '#020307' }[state.fitBg] : null;
    const scale = Math.min(1, 720 / Math.max(outW, outH));
    const buffer = document.createElement('canvas');
    buffer.width = solid ? 1 : Math.max(1, Math.round(outW * scale));
    buffer.height = solid ? 1 : Math.max(1, Math.round(outH * scale));
    const ctx = buffer.getContext('2d');
    if (solid) {
      ctx.fillStyle = solid;
      ctx.fillRect(0, 0, buffer.width, buffer.height);
    } else {
      drawCustomBlurredBackground(ctx, buffer.width, buffer.height, Math.max(10, state.fitBlur), source);
    }
    return buffer;
  }

  function prepareReelBuffers(targetW, targetH) {
    releaseReelCanvas(reelSourceImgCanvas);
    releaseReelCanvas(reelBgCanvas);
    reelSourceImgCanvas = reelBgCanvas = null;
    if (!state.img) return;
    const dims = getTransformedDims();
    const longEdge = Math.max(targetW, targetH);
    const profile = reelExportProfile;
    const headroom = Math.max(1, Math.min(3, state.reelZoomMax || 1));
    const maxEdge = profile ? Math.min(profile.sourceEdge, longEdge * headroom) : Math.min(960, longEdge * 1.45);
    const srcScale = Math.min(profile ? 3 : 1, maxEdge / Math.max(dims.w, dims.h),
      profile ? Math.sqrt(profile.sourcePixels / (dims.w * dims.h)) : 1);
    reelSourceImgCanvas = document.createElement('canvas');
    reelSourceImgCanvas.width = Math.max(64, Math.round(dims.w * srcScale));
    reelSourceImgCanvas.height = Math.max(64, Math.round(dims.h * srcScale));
    const sctx = reelSourceImgCanvas.getContext('2d');
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = state.reelRecording ? 'high' : 'medium';
    drawSourceTransformed(sctx, reelSourceImgCanvas.width / 2, reelSourceImgCanvas.height / 2, srcScale, true);

    reelBgCanvas = makeReelBackdrop(targetW, targetH, reelSourceImgCanvas.width, reelSourceImgCanvas.height);
    reelStars3D = buildRealistic3DStarfield(reelSourceImgCanvas);
  }

  function getReelImageLayout(outW, outH, srcW, srcH) {
    if (state.reelFraming === 'original') {
      return { x: 0, y: 0, w: outW, h: outH, isFullBleed: true };
    } else if (state.reelFraming === 'cover916' || state.reelFraming === 'cover34' || state.reelFraming === 'cover45') {
      const scale = Math.max(outW / srcW, outH / srcH);
      const w = srcW * scale;
      const h = srcH * scale;
      return { x: (outW - w) / 2, y: (outH - h) / 2, w, h, isFullBleed: true };
    } else {
      const pad = outW * state.fitMargin;
      const availW = outW - pad * 2;
      const availH = outH - pad * 2;
      const scale = Math.min(availW / srcW, availH / srcH);
      const w = srcW * scale;
      const h = srcH * scale;
      return { x: (outW - w) / 2, y: (outH - h) / 2, w, h, isFullBleed: false };
    }
  }

  function renderOpticalStarfield3D(targetCtx, outW, outH, layout, travelDist, camPitchOffset, camYawOffset, progress, intensityMult = 1) {
    const starSizeMult = state.reelStarSize || 1.2;
    const starGlowMult = state.reelStarGlow !== undefined ? state.reelStarGlow : 1.2;
    if (starGlowMult <= 0.01) return;

    const kernels = buildMoffatStarKernels();
    const txNorm = state.reelTargetX;
    const tyNorm = state.reelTargetY;
    const vanishX = layout.x + txNorm * layout.w + camYawOffset * outW * 0.45;
    const vanishY = layout.y + tyNorm * layout.h + camPitchOffset * outH * 0.45;
    const resScale = outW / 720;

    targetCtx.save();
    targetCtx.globalCompositeOperation = 'screen';

    const maxZ = 1.85;
    for (let i = 0; i < reelStars3D.length; i++) {
      const st = reelStars3D[i];
      let z = ((st.z0 - travelDist) % maxZ + maxZ) % maxZ;
      if (z < 0.04) z += maxZ;

      const projScale = 1 / z;
      const relX = (st.nx - txNorm) * layout.w;
      const relY = (st.ny - tyNorm) * layout.h;

      const sx = vanishX + relX * projScale;
      const sy = vanishY + relY * projScale;

      if (sx < -60 || sx > outW + 60 || sy < -60 || sy > outH + 60) continue;

      // Fade at BOTH ends of the depth cycle. This prevents stars popping back
      // at full brightness when modulo depth wraps from the near plane to far.
      const smooth = (a, b, v) => { const q = clamp01((v - a) / (b - a)); return q * q * (3 - 2 * q); };
      const nearFade = smooth(0.035, 0.24, z);
      const farFade = smooth(0.015, 0.42, maxZ - z);
      const depthFade = nearFade * farFade;
      const twinkle = 0.91 + 0.09 * Math.sin(progress * Math.PI * 2 * st.twinkleSpeed + st.twinklePhase);
      const apparentFlux = clamp01(st.magFlux * depthFade * twinkle * intensityMult * Math.min(1.65, Math.pow(projScale, 0.28)));
      if (apparentFlux <= 0.006) continue;

      // Every star uses a pre-baked chromatic Moffat PSF. Even faint stars
      // retain a soft halo instead of degrading into flat geometric dots.
      const kernel = kernels[st.specIdx];
      const tierBase = st.tier === 2 ? (9.5 + st.magFlux * 8.0) : (st.tier === 1 ? (5.8 + st.magFlux * 5.0) : (3.4 + st.magFlux * 3.0));
      const kSize = Math.min(st.tier === 2 ? 38 : 25, tierBase * Math.pow(projScale, 0.30) * resScale * starSizeMult);
      targetCtx.globalAlpha = clamp01(apparentFlux * (0.20 + starGlowMult * 0.20));
      targetCtx.drawImage(kernel, sx - kSize * 1.55, sy - kSize * 1.55, kSize * 3.1, kSize * 3.1);
      targetCtx.globalAlpha = apparentFlux;
      if (st.tier === 2 && state.reelSpikes && moffatSpikeKernels) {
        const spkSize = kSize * 2.45;
        targetCtx.drawImage(moffatSpikeKernels[st.specIdx], sx - spkSize / 2, sy - spkSize / 2, spkSize, spkSize);
      } else {
        targetCtx.drawImage(kernel, sx - kSize / 2, sy - kSize / 2, kSize, kSize);
      }
      // Bright, restrained central glint gives stars a luminous optical core.
      if (st.tier === 2) {
        targetCtx.globalAlpha = clamp01(apparentFlux * 0.48);
        const core = Math.max(2, kSize * 0.34);
        targetCtx.drawImage(kernel, sx - core / 2, sy - core / 2, core, core);
      }
    }

    targetCtx.restore();
  }

  // ===== WARP CINEMA : camera paths, speed laws, small 3D helpers (pure math, no DOM) =====
  const WC_DEG = Math.PI / 180;
  function wcClamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function wcSmooth(x) { x = wcClamp(x, 0, 1); return x * x * (3 - 2 * x); }
  function wcSmoother(x) { x = wcClamp(x, 0, 1); return x * x * x * (x * (x * 6 - 15) + 10); }
  function wcMix(a, b, t) { return a + (b - a) * t; }
  function wcWin(p, a, b) { return wcClamp((p - a) / (b - a), 0, 1); }
  function wcEaseIO(x) { x = wcClamp(x, 0, 1); return 0.5 - 0.5 * Math.cos(Math.PI * x); }

  // 3x3 row-major matrices. Columns of a camera matrix are (right, down, forward) in world space.
  function wcRy(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
  function wcRx(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; }
  function wcRz(a) { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; }
  function wcMul(A, B) {
    const C = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
    }
    return C;
  }
  function wcRot(axis, ang) {
    let x = axis[0], y = axis[1], z = axis[2]; const n = Math.hypot(x, y, z) || 1; x /= n; y /= n; z /= n;
    const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
    return [c + t * x * x, t * x * y - s * z, t * x * z + s * y,
            t * x * y + s * z, c + t * y * y, t * y * z - s * x,
            t * x * z - s * y, t * y * z + s * x, c + t * z * z];
  }
  function wcCol(R, k) { return [R[k], R[3 + k], R[6 + k]]; }
  function wcEuler(yaw, pitch, roll) { return wcMul(wcMul(wcRy(yaw), wcRx(pitch)), wcRz(roll)); }
  function wcNorm3(v) { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; }

  // underdamped spring 0 -> 1 with a small overshoot (a camera operator "catching" the new heading)
  function wcSpring(u) {
    u = wcClamp(u, 0, 1);
    const a = 4.6, w = 6.6;
    const v = 1 - Math.exp(-a * u) * (Math.cos(w * u) + (a / w) * Math.sin(w * u));
    return wcMix(v, 1, wcSmooth((u - 0.8) / 0.2));
  }

  // Apparent log-zoom rate of the arrival photo over the arrival window (t in 0..1):
  // a fast "drop out of light speed" part that decays exponentially + a gentle zoom that glides to rest.
  const WC_ARR = { alpha: 0.7, tau: 0.30, pow: 1.8 };
  function wcRhoShape(t) { return WC_ARR.alpha * Math.exp(-t / WC_ARR.tau) + (1 - WC_ARR.alpha) * Math.pow(Math.max(0, 1 - t), WC_ARR.pow); }

  // Everything that does not change from frame to frame.
  // o: { kind, W, H, wA, hLay, wB, hB, zoomMax, aim:[x,y], aimB:[x,y], dur, fov0 }
  function wcBuildPlan(o) {
    const P = { kind: o.kind, W: o.W, H: o.H, dur: o.dur };
    P.fov0 = (o.fov0 || 46) * WC_DEG;
    P.F0 = (o.H / 2) / Math.tan(P.fov0 / 2);
    P.D0 = 1;                                   // world unit == the distance at which plane A exactly fills its layout rectangle
    P.hA = o.layA.h / P.F0; P.wA = o.layA.w / P.F0;
    P.hB = o.layB.h / P.F0; P.wB = o.layB.w / P.F0;
    P.Zm = Math.max(1.05, o.zoomMax);
    P.TA = [(o.aim[0] - 0.5) * P.wA, (o.aim[1] - 0.5) * P.hA, 0];
    P.offB = [(o.aimB[0] - 0.5) * P.wB, (o.aimB[1] - 0.5) * P.hB];
    const seq1 = o.kind === 'hyperjump';
    P.seq1 = seq1;
    P.vmax = seq1 ? 95 : 105;                    // light speed, world units per unit of progress (a slower stream keeps every star in view for several frames)
    P.pa = 0.72;                                // start of the arrival (brake) window
    P.pw0 = seq1 ? 0.45 : 0.0;                  // start of acceleration
    P.pw1 = seq1 ? 0.56 : 0.30;                 // reaches light speed
    const rampV = (p) => {
      if (p <= P.pw0) return 0;
      const x = wcClamp((p - P.pw0) / (P.pw1 - P.pw0), 0, 1);
      return seq1 ? wcSmoother(x) : Math.pow(wcSmoother(x), 1.5);
    };
    P.rampV = rampV;

    // ---- arrival: the brake is solved so that speed is continuous with the cruise and the photo ends at exactly Zm
    const durA = 1 - P.pa;
    const Nint = 600;
    let Ft = 0; for (let i = 0; i < Nint; i++) Ft += wcRhoShape((i + 0.5) / Nint) / Nint;
    // rho(t) = amp * shape(t) / durA (log-zoom per unit progress);  z_j = Zm * exp(-amp * Ft);  speed at brake start = r_j * rho(0)
    let lo = 0, hi = 80;
    for (let it = 0; it < 100; it++) {
      const amp = 0.5 * (lo + hi);
      const zj = P.Zm * Math.exp(-amp * Ft);
      const f = (amp * wcRhoShape(0) / durA) * (P.D0 / zj) - P.vmax;
      if (f > 0) hi = amp; else lo = amp;
    }
    P.ampA = 0.5 * (lo + hi);
    P.zj = P.Zm * Math.exp(-P.ampA * Ft);
    P.rj = P.D0 / P.zj;
    P.durA = durA;
    const Mn = 800;
    const arrZ = new Float64Array(Mn + 1), arrR = new Float64Array(Mn + 1);
    let acc = 0; arrZ[0] = P.zj; arrR[0] = P.rj;
    for (let i = 1; i <= Mn; i++) {
      acc += P.ampA * 0.5 * (wcRhoShape((i - 1) / Mn) + wcRhoShape(i / Mn)) / Mn;
      arrZ[i] = P.zj * Math.exp(acc); arrR[i] = P.D0 / arrZ[i];
    }
    P.arrZ = arrZ; P.arrR = arrR; P.arrM = Mn;

    // cumulative ramp integral up to the brake
    const NR = 6000; const cum = new Float64Array(NR + 1);
    for (let i = 1; i <= NR; i++) {
      const q0 = (i - 1) / NR * P.pa, q1 = i / NR * P.pa;
      cum[i] = cum[i - 1] + 0.5 * (rampV(q0) + rampV(q1)) * (q1 - q0);
    }
    P.sAtPa = P.vmax * cum[NR];
    const sOf = (p) => {
      if (p <= P.pa) { const k = p / P.pa * NR, i = Math.min(NR - 1, Math.floor(k)), f = k - i; return P.vmax * (cum[i] * (1 - f) + cum[i + 1] * f); }
      const t = wcClamp((p - P.pa) / durA, 0, 1) * Mn, j = Math.min(Mn - 1, Math.floor(t)), f = t - j;
      return P.sAtPa + (P.rj - (arrR[j] * (1 - f) + arrR[j + 1] * f));
    };
    const N = 4096; P.N = N;
    P.tabS = new Float64Array(N + 1); P.tabV = new Float64Array(N + 1); P.tabZ = new Float64Array(N + 1);
    for (let i = 0; i <= N; i++) {
      const p = i / N;
      P.tabS[i] = sOf(p);
      if (p <= P.pa) { P.tabV[i] = P.vmax * rampV(p); P.tabZ[i] = P.D0 / (P.rj + (P.sAtPa - P.tabS[i])); }
      else {
        const t = wcClamp((p - P.pa) / durA, 0, 1);
        const k = t * Mn, j = Math.min(Mn - 1, Math.floor(k)), f = k - j;
        const z = arrZ[j] * (1 - f) + arrZ[j + 1] * f;
        P.tabZ[i] = z; P.tabV[i] = (P.D0 / z) * P.ampA * wcRhoShape(t) / durA;
      }
    }
    P.sEnd = P.tabS[N];

    // ---- orientation / path constants per sequence
    if (seq1) {
      P.zA1 = Math.max(1.45, 1 + (P.Zm - 1) * 0.85);
      P.yawTrack = -0.36; P.yawF = 0.50; P.pitchF = 0.11;
      P.Ly = -0.08; P.Lz = 0;
      // truck far enough that A leaves the frame on the left
      const D1 = P.D0 / P.zA1;
      const halfH = Math.atan(Math.tan(P.fov0 / 2) * (o.W / o.H));
      const xOff = P.TA[0] * (1 - 1 / P.zA1);
      P.Ls = Math.max(0.45, P.wA / 2 + D1 * Math.tan(Math.abs(P.yawTrack) + halfH) - xOff + 0.06);
      P.RB = wcEuler(P.yawF, P.pitchF, 0);              // B's frame == final camera frame
      P.u = wcCol(P.RB, 2);
      const x1 = P.TA[0] * (1 - 1 / P.zA1) + P.Ls, y1 = P.TA[1] * (1 - 1 / P.zA1) + P.Ly, z1 = -D1 + P.Lz;
      P.Bc = [x1 + P.u[0] * (P.sEnd + P.D0 / P.Zm), y1 + P.u[1] * (P.sEnd + P.D0 / P.Zm), z1 + P.u[2] * (P.sEnd + P.D0 / P.Zm)];
    } else {
      const C0 = [0, 0, -P.D0];
      P.dA = wcNorm3([C0[0] - P.TA[0], C0[1] - P.TA[1], C0[2] - P.TA[2]]);
      P.DT0 = Math.hypot(C0[0] - P.TA[0], C0[1] - P.TA[1], C0[2] - P.TA[2]);
      const fla = [-P.dA[0], -P.dA[1], -P.dA[2]];       // look at the target while backing away
      P.yawLA = Math.atan2(fla[0], fla[2]); P.pitchLA = Math.asin(-wcClamp(fla[1], -1, 1));
      P.Rla = wcMul(wcRy(P.yawLA), wcRx(P.pitchLA));
      const chi = 22 * WC_DEG;
      const dn = wcCol(P.Rla, 1), rt = wcCol(P.Rla, 0);
      P.swingAxis = [Math.cos(chi) * dn[0] + Math.sin(chi) * rt[0], Math.cos(chi) * dn[1] + Math.sin(chi) * rt[1], Math.cos(chi) * dn[2] + Math.sin(chi) * rt[2]];
      P.rollTotal = 1.15 * 2 * Math.PI;
      P.RB = wcMul(wcMul(wcRot(P.swingAxis, Math.PI), P.Rla), wcRz(P.rollTotal));
      P.u = wcCol(P.RB, 2);                              // travel direction == final look direction
      const L = P.DT0 + P.sEnd + P.D0 / P.Zm;
      P.Bc = [P.TA[0] + P.dA[0] * L, P.TA[1] + P.dA[1] * L, P.TA[2] + P.dA[2] * L];
    }
    return P;
  }

  function wcTravel(P, p) {
    const k = wcClamp(p, 0, 1) * P.N, i = Math.min(P.N - 1, Math.floor(k)), f = k - i;
    return { s: P.tabS[i] * (1 - f) + P.tabS[i + 1] * f, v: P.tabV[i] * (1 - f) + P.tabV[i + 1] * f, z: P.tabZ[i] * (1 - f) + P.tabZ[i + 1] * f };
  }

  // Camera pose at progress p: { pos[3], R[9], speed (0..1 of light speed), zB (apparent zoom of the arrival photo) }
  function wcCamera(P, p, out) {
    out = out || {};
    const tr = wcTravel(P, p);
    let pos, R;
    if (P.seq1) {
      const zA = wcMix(1, P.zA1, wcEaseIO(wcWin(p, 0, 0.23)));
      const su = wcSmoother(wcWin(p, 0.17, 0.43));
      pos = [P.TA[0] * (1 - 1 / zA) + P.Ls * su + P.u[0] * tr.s,
             P.TA[1] * (1 - 1 / zA) + P.Ly * su + P.u[1] * tr.s,
             -P.D0 / zA + P.Lz * su + P.u[2] * tr.s];
      const track = wcSmooth(wcWin(p, 0.10, 0.34));
      const whip = wcSpring(wcWin(p, 0.36, 0.50));
      const yaw = P.yawTrack * track + (P.yawF - P.yawTrack) * whip;
      const pitch = P.pitchF * wcSmooth(wcWin(p, 0.34, 0.50)) - 0.03 * Math.sin(Math.PI * wcWin(p, 0.17, 0.43));
      const bank = 0.05 * Math.sin(Math.PI * wcWin(p, 0.17, 0.42)) + 0.13 * Math.sin(Math.PI * wcWin(p, 0.35, 0.53));
      R = wcEuler(yaw, pitch, bank);
    } else {
      pos = [P.TA[0] + P.dA[0] * (P.DT0 + tr.s), P.TA[1] + P.dA[1] * (P.DT0 + tr.s), P.TA[2] + P.dA[2] * (P.DT0 + tr.s)];
      const b = wcSmoother(wcWin(p, 0.0, 0.20));
      const Rla = wcMul(wcRy(P.yawLA * b), wcRx(P.pitchLA * b));
      const roll = P.rollTotal * wcSmoother(wcWin(p, 0.13, 0.60));
      const swing = Math.PI * wcSmoother(wcWin(p, 0.385, 0.585));
      R = wcMul(wcMul(wcRot(P.swingAxis, swing), Rla), wcRz(roll));
    }
    if (p > P.pa) {                                       // gentle lateral drift toward the aim point of the arrival photo
      const z = tr.z, Lz = (1 - 1 / z) * wcSmooth((z - 0.5) / 0.7);
      const ex = wcCol(P.RB, 0), ey = wcCol(P.RB, 1);
      for (let k = 0; k < 3; k++) pos[k] += (ex[k] * P.offB[0] + ey[k] * P.offB[1]) * Lz;
    }
    out.pos = pos; out.R = R; out.speed = wcClamp(tr.v / P.vmax, 0, 1); out.zB = tr.z; out.v = tr.v;
    return out;
  }

  // ===== WARP CINEMA : renderer (uses the Reel helpers of the app) =====
  const WCS = { built: false, S: 3.4, nLat: 0, nSky: 0 };
  const WC_CAP = 9000;
  const WC_AL = 12;                      // brightness levels of the batched streaks
  const WCR = {
    n: 0,
    x: new Float32Array(WC_CAP), y: new Float32Array(WC_CAP), tx: new Float32Array(WC_CAP), ty: new Float32Array(WC_CAP),
    sz: new Float32Array(WC_CAP), a: new Float32Array(WC_CAP), spec: new Uint8Array(WC_CAP), tier: new Uint8Array(WC_CAP), bin: new Uint8Array(WC_CAP)
  };
  const WCE = { key: '', P: null, W: 0, H: 0, layer: null, lctx: null, bA: null, bB: null, bAc: null, bBc: null, destKey: '', dest: null, qual: 1, ms: 0,
                camH: {}, camT: {}, camE: {}, camK: {}, camP: {}, layer2: null, l2ctx: null, destA: null, mips: new WeakMap(), glowSprite: null };
  const WC_SPEC_W = [0.07, 0.13, 0.22, 0.20, 0.17, 0.13, 0.08];

  function wcRng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
  function wcPickSpec(r) { let a = 0; for (let k = 0; k < 7; k++) { a += WC_SPEC_W[k]; if (r < a) return k; } return 6; }

  function wcBuildStarSets() {
    if (WCS.built) return;
    const rnd = wcRng(20260611);
    const nL = 13500, nS = 15000;
    WCS.nLat = nL; WCS.nSky = nS;
    const mk = (n) => ({ mag: new Float32Array(n), spec: new Uint8Array(n), tier: new Uint8Array(n), tw: new Float32Array(n), tws: new Float32Array(n), rk: new Float32Array(n) });
    const L = mk(nL), K = mk(nS);
    L.pos = new Float32Array(nL * 3); K.dir = new Float32Array(nS * 3);
    const fill = (T, n) => {
      for (let i = 0; i < n; i++) {
        const u = rnd();
        const tier = u < 0.035 ? 2 : (u < 0.20 ? 1 : 0);
        T.tier[i] = tier;
        T.mag[i] = tier === 2 ? 0.80 + 0.20 * rnd() : (tier === 1 ? 0.45 + 0.35 * rnd() : 0.20 + 0.34 * rnd());
        T.spec[i] = wcPickSpec(rnd());
        T.tw[i] = rnd() * 6.2832; T.tws[i] = 0.6 + rnd() * 1.8;
        const m = T.mag[i];   // brightness rank: 0 = brightest; used to thin the field out at light speed
        T.rk[i] = tier === 2 ? 0.035 * (1 - (m - 0.80) / 0.20) : (tier === 1 ? 0.035 + 0.165 * (1 - (m - 0.45) / 0.35) : 0.20 + 0.80 * (1 - (m - 0.20) / 0.34));
      }
    };
    fill(L, nL); fill(K, nS);
    for (let i = 0; i < nL; i++) { L.pos[i * 3] = rnd() * WCS.S; L.pos[i * 3 + 1] = rnd() * WCS.S; L.pos[i * 3 + 2] = rnd() * WCS.S; }
    for (let i = 0; i < nS; i++) {
      const z = 2 * rnd() - 1, ph = rnd() * 6.2831853, r = Math.sqrt(Math.max(0, 1 - z * z));
      K.dir[i * 3] = r * Math.cos(ph); K.dir[i * 3 + 1] = z; K.dir[i * 3 + 2] = r * Math.sin(ph);
    }
    WCS.L = L; WCS.K = K;
    WCS.RL = wcRot([0.37, 0.81, 0.45], 1.12);            // lattice orientation (keeps straight flights from lining up with the cell axes)
    WCS.col = SPECTRAL_PALETTE.map(s => { const a = []; for (let b = 0; b < WC_AL; b++) a.push(`rgba(${s.r},${s.g},${s.b},${((b + 1) / WC_AL).toFixed(3)})`); return a; });
    WCS.built = true;
  }

  function wcMip(tex, lvl) {
    if (lvl <= 0) return tex;
    let m = WCE.mips.get(tex);
    if (!m) { m = [tex]; WCE.mips.set(tex, m); }
    while (m.length <= lvl) {
      const prev = m[m.length - 1];
      const c = document.createElement('canvas');
      c.width = Math.max(2, prev.width >> 1); c.height = Math.max(2, prev.height >> 1);
      const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      x.drawImage(prev, 0, 0, c.width, c.height);
      m.push(c);
      if (c.width <= 2 || c.height <= 2) break;
    }
    return m[Math.min(lvl, m.length - 1)];
  }

  function wcAvgColor(cnv) {
    try {
      const c = document.createElement('canvas'); c.width = 6; c.height = 6;
      const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      x.drawImage(cnv, 0, 0, 6, 6);
      const d = x.getImageData(0, 0, 6, 6).data; let r = 0, g = 0, b = 0, n = 0, wsum = 0;
      for (let i = 0; i < d.length; i += 4) { const l = d[i] + d[i + 1] + d[i + 2] + 30; r += d[i] * l; g += d[i + 1] * l; b += d[i + 2] * l; wsum += l; n++; }
      return [Math.round(r / wsum), Math.round(g / wsum), Math.round(b / wsum)];
    } catch (e) { return [170, 190, 255]; }
  }

  // The photo the camera arrives at. Uses the picture chosen in the panel; without one, a mirrored copy of the main photo.
  function wcEnsureDest(outW, outH) {
    const A = reelSourceImgCanvas;
    const own = state.reelDest && state.reelDest.canvas ? state.reelDest : null;
    const key = [A ? A.width + 'x' + A.height : '0', outW, outH, state.reelRecording ? 1 : 0, own ? own.id : 'mirror', state.reelFraming, state.fitBg, state.fitBlur, state.fitMargin].join('|');
    if (WCE.dest && WCE.destKey === key && WCE.destA === A) return WCE.dest;
    if (WCE.dest) {
      releaseReelCanvas(WCE.dest.tex);
      releaseReelCanvas(WCE.dest.bg);
    }
    const rec = !!state.reelRecording;
    const maxEdge = reelExportProfile?.sourceEdge || Math.min(960, Math.max(outW, outH) * 1.45);
    let tex, aim, mirror = false;
    if (own) {
      const srcC = own.canvas;
      let sx = 0, sy = 0, sw = srcC.width, sh = srcC.height;
      // smart aim: brightness-weighted centre of the picture
      const sm = document.createElement('canvas'); sm.width = 48; sm.height = Math.max(8, Math.round(48 * sh / sw));
      const sx2 = sm.getContext('2d'); sx2.imageSmoothingEnabled = true; sx2.imageSmoothingQuality = 'high'; sx2.drawImage(srcC, 0, 0, sm.width, sm.height);
      let ax = 0.5, ay = 0.5;
      try {
        const d = sx2.getImageData(0, 0, sm.width, sm.height).data; let mx = 0, my = 0, ms = 0;
        for (let j = 0; j < sm.height; j++) for (let i = 0; i < sm.width; i++) {
          const nx = (i + 0.5) / sm.width, ny = (j + 0.5) / sm.height;
          if (nx < 0.15 || nx > 0.85 || ny < 0.15 || ny > 0.85) continue;
          const k = (j * sm.width + i) * 4, l = (d[k] * 0.3 + d[k + 1] * 0.59 + d[k + 2] * 0.11) / 255, w = l * l * l;
          mx += nx * w; my += ny * w; ms += w;
        }
        if (ms > 1e-6) { ax = 0.5 + wcClamp((mx / ms - 0.5) * 0.6, -0.14, 0.14); ay = 0.5 + wcClamp((my / ms - 0.5) * 0.6, -0.14, 0.14); }
      } catch (e) { /* keep centre */ }
      if (state.reelFraming === 'original' && A) {            // the video frame follows the main photo: crop the arrival photo to the same shape
        const ta = A.width / A.height, sa = sw / sh;
        if (sa > ta) { sw = sh * ta; sx = wcClamp(ax * srcC.width - sw / 2, 0, srcC.width - sw); }
        else { sh = sw / ta; sy = wcClamp(ay * srcC.height - sh / 2, 0, srcC.height - sh); }
        ax = 0.5 + (ax - (sx + sw / 2) / srcC.width) * (srcC.width / sw); ay = 0.5 + (ay - (sy + sh / 2) / srcC.height) * (srcC.height / sh);
        ax = wcClamp(ax, 0.36, 0.64); ay = wcClamp(ay, 0.36, 0.64);
      }
      const sc = Math.min(1, maxEdge / Math.max(sw, sh), Math.sqrt((reelExportProfile?.sourcePixels || 8e6) / (sw * sh)));
      tex = document.createElement('canvas'); tex.width = Math.max(64, Math.round(sw * sc)); tex.height = Math.max(64, Math.round(sh * sc));
      const tx = tex.getContext('2d'); tx.imageSmoothingEnabled = true; tx.imageSmoothingQuality = 'high';
      tx.drawImage(srcC, sx, sy, sw, sh, 0, 0, tex.width, tex.height);
      aim = [ax, ay];
    } else {
      mirror = true;
      tex = document.createElement('canvas'); tex.width = A.width; tex.height = A.height;
      const dims = getTransformedDims();
      const tx = tex.getContext('2d');
      tx.imageSmoothingQuality = rec ? 'high' : 'medium';
      tx.translate(tex.width, 0); tx.scale(-1, 1);
      drawSourceTransformed(tx, tex.width / 2, tex.height / 2, tex.width / dims.w, false);
      aim = [wcClamp(1 - state.reelTargetX, 0.3, 0.7), wcClamp(state.reelTargetY, 0.3, 0.7)];
    }
    const bg = makeReelBackdrop(outW, outH, tex.width, tex.height, { img: tex, rot90: 0, flipH: false });
    WCE.dest = { tex, bg, aim, mirror, avg: wcAvgColor(tex) };
    WCE.destKey = key; WCE.destA = A;
    return WCE.dest;
  }

  function wcEnsureEnv(W, H, kind) {
    wcBuildStarSets(); buildMoffatStarKernels();
    const dest = wcEnsureDest(W, H);
    const A = reelSourceImgCanvas;
    const layA = getReelImageLayout(W, H, A.width, A.height);
    const layB = getReelImageLayout(W, H, dest.tex.width, dest.tex.height);
    const key = [kind, W, H, Math.round(layA.w), Math.round(layA.h), Math.round(layB.w), Math.round(layB.h), state.reelZoomMax, state.reelTargetX, state.reelTargetY,
                 dest.aim[0].toFixed(3), dest.aim[1].toFixed(3), state.reelDuration].join('|');
    if (key !== WCE.key || !WCE.P) {
      WCE.P = wcBuildPlan({ kind, W, H, layA, layB, zoomMax: state.reelZoomMax, aim: [state.reelTargetX, state.reelTargetY], aimB: dest.aim, dur: state.reelDuration });
      WCE.key = key;
    }
    if (WCE.W !== W || WCE.H !== H) {
      WCE.W = W; WCE.H = H;
      WCE.layer = null; WCE.layer2 = null;               // photo motion-blur layers are made on demand
      const w1 = Math.max(16, Math.round(W / 4)), h1 = Math.max(16, Math.round(H / 4)), w2 = Math.max(8, Math.round(W / 14)), h2 = Math.max(8, Math.round(H / 14));
      WCE.bA = document.createElement('canvas'); WCE.bA.width = w1; WCE.bA.height = h1; WCE.bAc = WCE.bA.getContext('2d');
      WCE.bB = document.createElement('canvas'); WCE.bB.width = w2; WCE.bB.height = h2; WCE.bBc = WCE.bB.getContext('2d');
    }
    return { P: WCE.P, dest, layA, layB, A };
  }

  // ---------- planes (the two photographs) ----------
  const WC_NEAR = 0.035;
  // Draw one photo plane with exact perspective. Subdivides only as much as the foreshortening needs.
  function wcDrawPlane(ctx, W, H, cam, F, pl, alpha, subScale) {
    const pos = cam.pos, R = cam.R;
    const hw = pl.w / 2, hh = pl.h / 2;
    const dx = pl.c[0] - pos[0], dy = pl.c[1] - pos[1], dz = pl.c[2] - pos[2];
    const c0 = R[0] * dx + R[3] * dy + R[6] * dz, c1 = R[1] * dx + R[4] * dy + R[7] * dz, c2 = R[2] * dx + R[5] * dy + R[8] * dz;
    const ex0 = R[0] * pl.ex[0] + R[3] * pl.ex[1] + R[6] * pl.ex[2], ex1 = R[1] * pl.ex[0] + R[4] * pl.ex[1] + R[7] * pl.ex[2], ex2 = R[2] * pl.ex[0] + R[5] * pl.ex[1] + R[8] * pl.ex[2];
    const ey0 = R[0] * pl.ey[0] + R[3] * pl.ey[1] + R[6] * pl.ey[2], ey1 = R[1] * pl.ey[0] + R[4] * pl.ey[1] + R[7] * pl.ey[2], ey2 = R[2] * pl.ey[0] + R[5] * pl.ey[1] + R[8] * pl.ey[2];
    // corner depths
    const zc = [c2 - ex2 * hw - ey2 * hh, c2 + ex2 * hw - ey2 * hh, c2 + ex2 * hw + ey2 * hh, c2 - ex2 * hw + ey2 * hh];
    const zmin = Math.min(zc[0], zc[1], zc[2], zc[3]), zmax = Math.max(zc[0], zc[1], zc[2], zc[3]);
    if (zmax < WC_NEAR) return false;
    const cx0 = W / 2, cy0 = H / 2;

    // texture detail level from the on-screen size of a texel
    const zRef = Math.max(WC_NEAR * 4, c2);
    const pxPerTexel = (F / zRef) * pl.w / pl.tex.width;
    const lvl = pxPerTexel >= 0.72 ? 0 : Math.min(9, Math.floor(Math.log2(0.72 / Math.max(1e-4, pxPerTexel))));
    const tex = wcMip(pl.tex, lvl);
    const tw = tex.width, th = tex.height;

    const ratio = zmax / Math.max(zmin, WC_NEAR);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    // frontal enough -> one affine blit
    if (zmin >= WC_NEAR && ratio < 1.012) {
      const P0 = [cx0 + F * (c0 - ex0 * hw - ey0 * hh) / zc[0], cy0 + F * (c1 - ex1 * hw - ey1 * hh) / zc[0]];
      const P1 = [cx0 + F * (c0 + ex0 * hw - ey0 * hh) / zc[1], cy0 + F * (c1 + ex1 * hw - ey1 * hh) / zc[1]];
      const P3 = [cx0 + F * (c0 - ex0 * hw + ey0 * hh) / zc[3], cy0 + F * (c1 - ex1 * hw + ey1 * hh) / zc[3]];
      const a = (P1[0] - P0[0]) / tw, b = (P1[1] - P0[1]) / tw, c = (P3[0] - P0[0]) / th, d = (P3[1] - P0[1]) / th;
      ctx.transform(a, b, c, d, P0[0], P0[1]);
      ctx.drawImage(tex, 0, 0);
      ctx.restore();
      return true;
    }
    let nb = zmin < WC_NEAR ? 12 : Math.ceil(Math.log(ratio) / Math.log(1.075));
    nb = Math.max(2, Math.min(18, Math.round(nb * (subScale || 1))));
    const asp = pl.w / pl.h;
    const nx = Math.max(2, Math.min(20, Math.round(nb * Math.sqrt(asp)))), ny = Math.max(2, Math.min(20, Math.round(nb / Math.sqrt(asp))));
    const NX = nx + 1, NY = ny + 1;
    const vx = new Float64Array(NX * NY), vy = new Float64Array(NX * NY), vz = new Float64Array(NX * NY);
    for (let j = 0; j < NY; j++) {
      const v = (j / ny - 0.5) * pl.h;
      for (let i = 0; i < NX; i++) {
        const u = (i / nx - 0.5) * pl.w, k = j * NX + i;
        vx[k] = c0 + ex0 * u + ey0 * v; vy[k] = c1 + ex1 * u + ey1 * v; vz[k] = c2 + ex2 * u + ey2 * v;
      }
    }
    const px = new Float64Array(8), py = new Float64Array(8), pu = new Float64Array(8), pv = new Float64Array(8);
    const qx = new Float64Array(8), qy = new Float64Array(8), qz = new Float64Array(8);
    const pad = Math.max(W, H) * 0.05;
    const emit = (k0, k1, k2, i0, j0, i1, j1, i2, j2) => {
      const ids = [k0, k1, k2], us = [i0 / nx, i1 / nx, i2 / nx], vs = [j0 / ny, j1 / ny, j2 / ny];
      let m = 0, allIn = true;
      for (let t = 0; t < 3; t++) { qx[t] = vx[ids[t]]; qy[t] = vy[ids[t]]; qz[t] = vz[ids[t]]; pu[t] = us[t]; pv[t] = vs[t]; if (qz[t] < WC_NEAR) allIn = false; }
      if (allIn) {
        m = 3;
        for (let t = 0; t < 3; t++) { px[t] = cx0 + F * qx[t] / qz[t]; py[t] = cy0 + F * qy[t] / qz[t]; }
      } else {
        // clip the polygon against the near plane
        let n = 0; const ox = [], oy = [], oz = [], ou = [], ov = [];
        for (let t = 0; t < 3; t++) {
          const s = (t + 1) % 3; const ina = qz[t] >= WC_NEAR, inb = qz[s] >= WC_NEAR;
          if (ina) { ox.push(qx[t]); oy.push(qy[t]); oz.push(qz[t]); ou.push(pu[t]); ov.push(pv[t]); }
          if (ina !== inb) {
            const f = (WC_NEAR - qz[t]) / (qz[s] - qz[t]);
            ox.push(qx[t] + (qx[s] - qx[t]) * f); oy.push(qy[t] + (qy[s] - qy[t]) * f); oz.push(WC_NEAR); ou.push(pu[t] + (pu[s] - pu[t]) * f); ov.push(pv[t] + (pv[s] - pv[t]) * f);
          }
        }
        m = ox.length; if (m < 3) return;
        for (let t = 0; t < m; t++) { px[t] = cx0 + F * ox[t] / oz[t]; py[t] = cy0 + F * oy[t] / oz[t]; pu[t] = ou[t]; pv[t] = ov[t]; }
      }
      for (let t = 1; t + 1 < m; t++) {
        const xa = px[0], ya = py[0], xb = px[t], yb = py[t], xc = px[t + 1], yc = py[t + 1];
        const mnx = Math.min(xa, xb, xc), mxx = Math.max(xa, xb, xc), mny = Math.min(ya, yb, yc), mxy = Math.max(ya, yb, yc);
        if (mxx < -pad || mnx > W + pad || mxy < -pad || mny > H + pad) continue;
        if (Math.abs((xb - xa) * (yc - ya) - (xc - xa) * (yb - ya)) < 0.02) continue;
        drawTexturedTriangle(ctx, tex, pu[0] * tw, pv[0] * th, pu[t] * tw, pv[t] * th, pu[t + 1] * tw, pv[t + 1] * th, xa, ya, xb, yb, xc, yc, 0.6);
      }
    };
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k00 = j * NX + i, k10 = k00 + 1, k01 = k00 + NX, k11 = k01 + 1;
        emit(k00, k10, k01, i, j, i + 1, j, i, j + 1);
        emit(k10, k11, k01, i + 1, j, i + 1, j + 1, i, j + 1);
      }
    }
    ctx.restore();
    return true;
  }

  function wcProject(cam, F, W, H, x, y, z) {
    const dx = x - cam.pos[0], dy = y - cam.pos[1], dz = z - cam.pos[2], R = cam.R;
    const cz = R[2] * dx + R[5] * dy + R[8] * dz;
    if (cz < WC_NEAR) return null;
    return [W / 2 + F * (R[0] * dx + R[3] * dy + R[6] * dz) / cz, H / 2 + F * (R[1] * dx + R[4] * dy + R[7] * dz) / cz, cz];
  }

  // ---------- stars: a true 3D field (periodic lattice around the camera + a far sky sphere) ----------
  const WC_T4 = new Float64Array(4);
  // relativistic aberration of a unit direction d about unit velocity v (both in camera space); writes x,y,z,cos'
  function wcAber(dx, dy, dz, v0, v1, v2, beta) {
    const cosA = dx * v0 + dy * v1 + dz * v2;
    const cosB = (cosA + beta) / (1 + beta * cosA);
    const s2 = 1 - cosA * cosA;
    if (s2 < 1e-9) { WC_T4[0] = v0; WC_T4[1] = v1; WC_T4[2] = v2; WC_T4[3] = cosB; return; }
    const k = Math.sqrt(Math.max(0, 1 - cosB * cosB) / s2);
    WC_T4[0] = cosB * v0 + k * (dx - cosA * v0); WC_T4[1] = cosB * v1 + k * (dy - cosA * v1); WC_T4[2] = cosB * v2 + k * (dz - cosA * v2); WC_T4[3] = cosB;
  }
  function wcSm(x) { x = x < 0 ? 0 : (x > 1 ? 1 : x); return x * x * (3 - 2 * x); }

  // Collect every visible star (head position now, tail position one shutter earlier) into WCR.
  // planes: array of { act, nL:[3], d } already expressed in the lattice frame; bins = number of active planes.
  function wcCollectStars(W, H, cH, cT, F, Ft, beta, vW, inten, tSec, planes, resScale, dens, keep, fx) {
    const S = WCS.S, half = S / 2, RL = WCS.RL, L = WCS.L, K = WCS.K;
    const Rh = cH.R, Rt = cT.R, ph = cH.pos, pt = cT.pos;
    const Mh = WC_Mh, Mt = WC_Mt;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      Mh[i * 3 + j] = Rh[i] * RL[j * 3] + Rh[3 + i] * RL[j * 3 + 1] + Rh[6 + i] * RL[j * 3 + 2];
      Mt[i * 3 + j] = Rt[i] * RL[j * 3] + Rt[3 + i] * RL[j * 3 + 1] + Rt[6 + i] * RL[j * 3 + 2];
    }
    const cl0 = RL[0] * ph[0] + RL[1] * ph[1] + RL[2] * ph[2], cl1 = RL[3] * ph[0] + RL[4] * ph[1] + RL[5] * ph[2], cl2 = RL[6] * ph[0] + RL[7] * ph[1] + RL[8] * ph[2];
    const d0 = cl0 - (RL[0] * pt[0] + RL[1] * pt[1] + RL[2] * pt[2]), d1 = cl1 - (RL[3] * pt[0] + RL[4] * pt[1] + RL[5] * pt[2]), d2 = cl2 - (RL[6] * pt[0] + RL[7] * pt[1] + RL[8] * pt[2]);
    const vh0 = Rh[0] * vW[0] + Rh[3] * vW[1] + Rh[6] * vW[2], vh1 = Rh[1] * vW[0] + Rh[4] * vW[1] + Rh[7] * vW[2], vh2 = Rh[2] * vW[0] + Rh[5] * vW[1] + Rh[8] * vW[2];
    const vt0 = Rt[0] * vW[0] + Rt[3] * vW[1] + Rt[6] * vW[2], vt1 = Rt[1] * vW[0] + Rt[4] * vW[1] + Rt[7] * vW[2], vt2 = Rt[2] * vW[0] + Rt[5] * vW[1] + Rt[8] * vW[2];
    const doAb = beta > 0.02;
    const cx0 = W / 2, cy0 = H / 2, marg = Math.max(W, H) * 0.45;
    const sizeMult = state.reelStarSize || 1.2;
    const np = planes.length;
    const p0 = planes[0], p1 = planes[1];
    let n = 0;
    const R = WCR;
    const nL = Math.min(WCS.nLat, Math.floor(WCS.nLat * dens)), nS = Math.min(WCS.nSky, Math.floor(WCS.nSky * dens));
    const betaN = beta / 0.86, keepSky = keep * (1 - 0.62 * wcSm(betaN * 1.2));
    const dimR = Math.max(W, H) * 0.20, dimK = 0.62 * fx.warp * fx.ok;   // the core of the tunnel is dimmed so the streaks keep their gaps

    for (let i = 0; i < nL && n < WC_CAP; i++) {
      let rx = L.pos[i * 3] - cl0, ry = L.pos[i * 3 + 1] - cl1, rz = L.pos[i * 3 + 2] - cl2;
      rx -= S * Math.floor(rx / S + 0.5); ry -= S * Math.floor(ry / S + 0.5); rz -= S * Math.floor(rz / S + 0.5);
      const gate = (keep - L.rk[i]) * 28; if (gate <= 0) continue;
      const m = Math.max(Math.abs(rx), Math.abs(ry), Math.abs(rz)) / half;
      if (m > 0.985) continue;
      const farF = m < 0.6 ? 1 : 1 - wcSm((m - 0.6) / 0.38);
      const cx = Mh[0] * rx + Mh[1] * ry + Mh[2] * rz, cy = Mh[3] * rx + Mh[4] * ry + Mh[5] * rz, cz = Mh[6] * rx + Mh[7] * ry + Mh[8] * rz;
      const r = Math.sqrt(cx * cx + cy * cy + cz * cz);
      if (r < 0.09) continue;
      let dx = cx / r, dy = cy / r, dz = cz / r, cosB = 0;
      if (doAb) { wcAber(dx, dy, dz, vh0, vh1, vh2, beta); dx = WC_T4[0]; dy = WC_T4[1]; dz = WC_T4[2]; cosB = WC_T4[3]; }
      if (dz <= 0.03) continue;
      const sx = cx0 + F * dx / dz, sy = cy0 + F * dy / dz;
      if (sx < -marg || sx > W + marg || sy < -marg || sy > H + marg) continue;
      // tail = the same star seen from the camera one shutter earlier
      const rx2 = rx + d0, ry2 = ry + d1, rz2 = rz + d2;
      const tcx = Mt[0] * rx2 + Mt[1] * ry2 + Mt[2] * rz2, tcy = Mt[3] * rx2 + Mt[4] * ry2 + Mt[5] * rz2, tcz = Mt[6] * rx2 + Mt[7] * ry2 + Mt[8] * rz2;
      const tr = Math.sqrt(tcx * tcx + tcy * tcy + tcz * tcz) || 1;
      let tdx = tcx / tr, tdy = tcy / tr, tdz = tcz / tr, tx = sx, ty = sy;
      if (doAb) { wcAber(tdx, tdy, tdz, vt0, vt1, vt2, beta); tdx = WC_T4[0]; tdy = WC_T4[1]; tdz = WC_T4[2]; }
      if (tdz > 0.03) { tx = cx0 + Ft * tdx / tdz; ty = cy0 + Ft * tdy / tdz; }
      const nearF = wcSm((r - 0.09) / 0.45);
      const tier = L.tier[i], mg = L.mag[i];
      let flux = mg * farF * nearF * inten * (gate > 1 ? 1 : gate) * (0.88 + 0.12 * Math.sin(tSec * L.tws[i] * 2.2 + L.tw[i]));
      if (doAb && cosB > 0) flux *= 1 + beta * cosB * 0.45;
      if (dimK > 0.01) { const q = Math.hypot(sx - fx.x, sy - fx.y) / dimR; flux *= 1 - dimK * (1 - wcSm(q)); }
      if (flux < 0.012) continue;
      let spec = L.spec[i];
      if (doAb) { spec = Math.round(spec - beta * cosB * 3.2); spec = spec < 0 ? 0 : (spec > 6 ? 6 : spec); }
      const base = tier === 2 ? 9.5 + mg * 8 : (tier === 1 ? 5.8 + mg * 5 : 3.4 + mg * 3);
      const boost = Math.min(1.3, Math.max(0.8, Math.pow(1.4 / Math.max(r, 0.3), 0.22)));
      R.x[n] = sx; R.y[n] = sy; R.tx[n] = tx; R.ty[n] = ty;
      R.sz[n] = Math.min(tier === 2 ? 38 : 25, base * resScale * sizeMult * boost);
      R.a[n] = flux > 1 ? 1 : flux; R.spec[n] = spec; R.tier[n] = tier;
      let bin = 0;
      if (np > 0) {
        const s0 = rx * p0.nx + ry * p0.ny + rz * p0.nz + p0.d; if (s0 * p0.d > 0) bin++;
        if (np > 1) { const s1 = rx * p1.nx + ry * p1.ny + rz * p1.nz + p1.d; if (s1 * p1.d > 0) bin++; }
      }
      R.bin[n] = bin; n++;
    }

    for (let i = 0; i < nS && n < WC_CAP; i++) {
      const gateK = (keepSky - K.rk[i]) * 28; if (gateK <= 0) continue;
      const wx = K.dir[i * 3], wy = K.dir[i * 3 + 1], wz = K.dir[i * 3 + 2];
      let dx = Rh[0] * wx + Rh[3] * wy + Rh[6] * wz, dy = Rh[1] * wx + Rh[4] * wy + Rh[7] * wz, dz = Rh[2] * wx + Rh[5] * wy + Rh[8] * wz, cosB = 0;
      if (!doAb && dz <= 0.03) continue;
      if (doAb) { wcAber(dx, dy, dz, vh0, vh1, vh2, beta); dx = WC_T4[0]; dy = WC_T4[1]; dz = WC_T4[2]; cosB = WC_T4[3]; }
      if (dz <= 0.03) continue;
      const sx = cx0 + F * dx / dz, sy = cy0 + F * dy / dz;
      if (sx < -marg || sx > W + marg || sy < -marg || sy > H + marg) continue;
      let tdx = Rt[0] * wx + Rt[3] * wy + Rt[6] * wz, tdy = Rt[1] * wx + Rt[4] * wy + Rt[7] * wz, tdz = Rt[2] * wx + Rt[5] * wy + Rt[8] * wz, tx = sx, ty = sy;
      if (doAb) { wcAber(tdx, tdy, tdz, vt0, vt1, vt2, beta); tdx = WC_T4[0]; tdy = WC_T4[1]; tdz = WC_T4[2]; }
      if (tdz > 0.03) { tx = cx0 + Ft * tdx / tdz; ty = cy0 + Ft * tdy / tdz; }
      const tier = K.tier[i], mg = K.mag[i];
      let flux = mg * inten * (gateK > 1 ? 1 : gateK) * (0.9 + 0.1 * Math.sin(tSec * K.tws[i] * 2.0 + K.tw[i]));
      if (doAb && cosB > 0) flux *= 1 + beta * cosB * 0.35;
      if (dimK > 0.01) { const q = Math.hypot(sx - fx.x, sy - fx.y) / dimR; flux *= 1 - dimK * (1 - wcSm(q)); }
      if (flux < 0.012) continue;
      let spec = K.spec[i];
      if (doAb) { spec = Math.round(spec - beta * cosB * 3.2); spec = spec < 0 ? 0 : (spec > 6 ? 6 : spec); }
      const base = tier === 2 ? 9.5 + mg * 8 : (tier === 1 ? 5.8 + mg * 5 : 3.4 + mg * 3);
      R.x[n] = sx; R.y[n] = sy; R.tx[n] = tx; R.ty[n] = ty;
      R.sz[n] = Math.min(tier === 2 ? 38 : 25, base * resScale * sizeMult * 0.95 * (1 - 0.42 * betaN));
      R.a[n] = flux > 1 ? 1 : flux; R.spec[n] = spec; R.tier[n] = tier; R.bin[n] = 0; n++;
    }
    R.n = n;
  }
  const WC_Mh = new Float64Array(9), WC_Mt = new Float64Array(9);

  const WC_NB = 7 * WC_AL;
  const wcCnt = new Int32Array(WC_NB + 1), wcOff = new Int32Array(WC_NB + 2), wcBk = new Int16Array(WC_CAP), wcOrd = new Int32Array(WC_CAP);
  // Dots are sprites; streaks are tapered wedges (thin at the tail, full width at the head) filled in batches per colour / brightness.
  function wcDrawStars(ctx, bin, W, H, glowMult, spikes, resScale, spikeK) {
    const R = WCR, kernels = moffatKernels, spk = moffatSpikeKernels;
    if (!kernels) return;
    const n = R.n, cap = Math.max(W, H) * 0.5, cols = WCS.col;
    const lenRef = 46 * resScale;
    wcCnt.fill(0);
    for (let i = 0; i < n; i++) {
      wcBk[i] = -1;
      if (R.bin[i] !== bin) continue;
      const dx = R.x[i] - R.tx[i], dy = R.y[i] - R.ty[i];
      let len = Math.sqrt(dx * dx + dy * dy);
      if (len <= 2.2 * resScale + R.sz[i] * 0.12) continue;
      if (len > cap) len = cap;
      const aS = R.a[i] * Math.pow(1 + len / lenRef, -0.42) * 1.0;
      let lv = Math.floor(aS * WC_AL); lv = lv < 0 ? 0 : (lv >= WC_AL ? WC_AL - 1 : lv);
      const bk = R.spec[i] * WC_AL + lv;
      wcBk[i] = bk; wcCnt[bk]++;
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // --- streaks
    let o = 0; for (let k = 0; k < WC_NB; k++) { wcOff[k] = o; o += wcCnt[k]; } wcOff[WC_NB] = o;
    if (o > 0) {
      const fillPos = wcCnt; // reuse as running cursor
      for (let k = 0; k < WC_NB; k++) fillPos[k] = wcOff[k];
      for (let i = 0; i < n; i++) { const bk = wcBk[i]; if (bk >= 0) wcOrd[fillPos[bk]++] = i; }
      for (let k = 0; k < WC_NB; k++) {
        const s0 = wcOff[k], s1 = wcOff[k + 1];
        if (s1 <= s0) continue;
        ctx.fillStyle = cols[(k / WC_AL) | 0][k % WC_AL];
        ctx.beginPath();
        for (let q = s0; q < s1; q++) {
          const i = wcOrd[q];
          const x = R.x[i], y = R.y[i];
          let dx = x - R.tx[i], dy = y - R.ty[i];
          let len = Math.sqrt(dx * dx + dy * dy);
          if (len > cap) { const f = cap / len; dx *= f; dy *= f; len = cap; }
          const hw = Math.max(0.6, R.sz[i] * 0.09 * (R.tier[i] === 2 ? 1.25 : 1)) / len;
          const nx = -dy * hw, ny = dx * hw;
          ctx.moveTo(x - dx, y - dy); ctx.lineTo(x + nx, y + ny); ctx.lineTo(x - nx, y - ny); ctx.closePath();
        }
        ctx.fill();
      }
    }
    // --- dots and the bright heads of the streaks
    const gA = Math.min(1, 0.20 + glowMult * 0.20);
    for (let i = 0; i < n; i++) {
      if (R.bin[i] !== bin) continue;
      const a = R.a[i], x = R.x[i], y = R.y[i], sz = R.sz[i], spec = R.spec[i], tier = R.tier[i], k = kernels[spec];
      if (wcBk[i] >= 0) {
        if (tier >= 1 || a > 0.55) { ctx.globalAlpha = a * 0.75; const h = sz * 0.95; ctx.drawImage(k, x - h / 2, y - h / 2, h, h); }
        continue;
      }
      if (tier >= 1 || a > 0.30) { ctx.globalAlpha = a * gA; ctx.drawImage(k, x - sz * 1.55, y - sz * 1.55, sz * 3.1, sz * 3.1); }
      if (tier === 2 && spikes && spk && spikeK > 0.003) {
        const s2 = sz * 2.45;
        if (spikeK < 0.997) { ctx.globalAlpha = a * (1 - spikeK); ctx.drawImage(k, x - sz / 2, y - sz / 2, sz, sz); }
        ctx.globalAlpha = a * spikeK; ctx.drawImage(spk[spec], x - s2 / 2, y - s2 / 2, s2, s2);
      } else { ctx.globalAlpha = a; ctx.drawImage(k, x - sz / 2, y - sz / 2, sz, sz); }
      if (tier === 2) { ctx.globalAlpha = a * 0.48; const c = Math.max(2, sz * 0.34); ctx.drawImage(k, x - c / 2, y - c / 2, c, c); }
    }
    ctx.restore();
  }

  // ---------- small helpers for the frame ----------
  function wcAngle(R1, R2) {
    let tr = 0; for (let i = 0; i < 9; i++) tr += R1[i] * R2[i];
    return Math.acos(wcClamp((tr - 1) / 2, -1, 1));
  }
  function wcShake(R, p, dur, amp) {
    const t = p * dur;
    const yaw = amp * (0.0022 * Math.sin(t * 38.1 + 1.3) + 0.0014 * Math.sin(t * 61.7 + 0.4));
    const pit = amp * (0.0020 * Math.sin(t * 43.3 + 2.2) + 0.0012 * Math.sin(t * 71.3 + 1.1));
    const rol = amp * 0.0016 * Math.sin(t * 29.9 + 0.5);
    return wcMul(R, wcEuler(yaw, pit, rol));
  }
  function wcPlaneInfo(cam, F, W, H, pl) {
    const pos = cam.pos, R = cam.R;
    const dx = pl.c[0] - pos[0], dy = pl.c[1] - pos[1], dz = pl.c[2] - pos[2];
    const front = -(dx * pl.n[0] + dy * pl.n[1] + dz * pl.n[2]) > 0;
    const cx = R[0] * dx + R[3] * dy + R[6] * dz, cy = R[1] * dx + R[4] * dy + R[7] * dz, cz = R[2] * dx + R[5] * dy + R[8] * dz;
    const rad = 0.5 * Math.hypot(pl.w, pl.h);
    let vis = front && (cz + rad > WC_NEAR), sx = W / 2, sy = H / 2, diag = 0;
    if (cz > WC_NEAR) {
      sx = W / 2 + F * cx / cz; sy = H / 2 + F * cy / cz; diag = F * 2 * rad / cz;
      const pr = diag / 2 + Math.max(W, H) * 0.05;
      if (sx + pr < 0 || sx - pr > W || sy + pr < 0 || sy - pr > H) vis = false;
    } else { diag = 1e5; }
    return { front, vis, zc: cz, diag, sx, sy };
  }
  function wcPlaneMove(camH, camT, F, Ft, W, H, pl) {
    const hw = pl.w / 2, hh = pl.h / 2;
    const r = { mx: 0, ux: 1, uy: 0, full: false, x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
    let sx = 0, sy = 0, sm = 0;
    const q = [0, 0, -1, -1, 1, -1, 1, 1, -1, 1];
    for (let i = 0; i < 5; i++) {
      const u = q[i * 2], v = q[i * 2 + 1];
      const x = pl.c[0] + pl.ex[0] * u * hw + pl.ey[0] * v * hh, y = pl.c[1] + pl.ex[1] * u * hw + pl.ey[1] * v * hh, z = pl.c[2] + pl.ex[2] * u * hw + pl.ey[2] * v * hh;
      const a = wcProject(camH, F, W, H, x, y, z), b = wcProject(camT, Ft, W, H, x, y, z);
      if (a && b) {
        const dx = a[0] - b[0], dy = a[1] - b[1];
        const mg = Math.hypot(dx, dy); r.mx = Math.max(r.mx, mg); sx += dx; sy += dy; sm += mg;
        r.x0 = Math.min(r.x0, a[0], b[0]); r.x1 = Math.max(r.x1, a[0], b[0]); r.y0 = Math.min(r.y0, a[1], b[1]); r.y1 = Math.max(r.y1, a[1], b[1]);
      } else { r.full = true; r.mx = Math.max(r.mx, 90); }
    }
    const L = Math.hypot(sx, sy);
    if (L > 1e-6) { r.ux = sx / L; r.uy = sy / L; }
    r.coh = sm > 1e-6 ? L / sm : 0;           // 1 = the picture slides as a whole, ~0 = it zooms or spins
    return r;
  }
  function wcGlint(ctx, x, y, rad, col, a) {
    if (a <= 0.004 || rad < 1) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(255,255,255,' + Math.min(1, a * 1.15).toFixed(3) + ')');
    g.addColorStop(0.10, 'rgba(255,255,255,' + (a * 0.85).toFixed(3) + ')');
    g.addColorStop(0.28, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + (a * 0.6).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',0)');
    ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  function wcFlashShape(x) { return x < 0 ? Math.pow(Math.max(0, 1 + x / 1.5), 3) : Math.exp(-x * 1.6); }

  // Photo plane drawn with temporal motion blur: a few true poses across the shutter, averaged, then smeared along the motion to close the gaps between them.
  function wcDrawPlaneMB(ctx, W, H, P, p, shP, camH, camT, F, Ft, pl, alpha) {
    const mv = wcPlaneMove(camH, camT, F, Ft, W, H, pl);
    const N = wcClamp(Math.ceil(mv.mx / 11), 1, 6);
    if (N <= 1) { wcDrawPlane(ctx, W, H, camH, F, pl, alpha, 1); return; }
    if (!WCE.layer || WCE.layer.width !== W || WCE.layer.height !== H) {
      WCE.layer = document.createElement('canvas'); WCE.layer.width = W; WCE.layer.height = H; WCE.lctx = WCE.layer.getContext('2d');
      WCE.layer2 = document.createElement('canvas'); WCE.layer2.width = W; WCE.layer2.height = H; WCE.l2ctx = WCE.layer2.getContext('2d');
    }
    const lc = WCE.lctx, l2 = WCE.l2ctx;
    const sp = mv.mx / (N - 1), pad = Math.ceil(sp + 8);
    let rx0 = 0, ry0 = 0, rx1 = W, ry1 = H;
    if (!mv.full) { rx0 = Math.max(0, Math.floor(mv.x0 - pad)); ry0 = Math.max(0, Math.floor(mv.y0 - pad)); rx1 = Math.min(W, Math.ceil(mv.x1 + pad)); ry1 = Math.min(H, Math.ceil(mv.y1 + pad)); }
    const rw = rx1 - rx0, rh = ry1 - ry0;
    if (rw < 2 || rh < 2) return;
    lc.setTransform(1, 0, 0, 1, 0, 0); lc.globalAlpha = 1; lc.clearRect(rx0, ry0, rw, rh);
    for (let k = 0; k < N; k++) {
      const f = k / (N - 1);
      const ck = k === 0 ? camH : (k === N - 1 ? camT : wcCamera(P, Math.max(0, p - f * shP), WCE.camK));
      const Fk = F + (Ft - F) * f;
      l2.setTransform(1, 0, 0, 1, 0, 0); l2.globalAlpha = 1; l2.clearRect(rx0, ry0, rw, rh);
      wcDrawPlane(l2, W, H, ck, Fk, pl, 1, 0.75);
      lc.globalAlpha = 1 / (k + 1); lc.drawImage(WCE.layer2, rx0, ry0, rw, rh, rx0, ry0, rw, rh);
    }
    let src = WCE.layer;
    const m = mv.coh > 0.72 ? wcClamp(Math.ceil(sp / 2.4), 1, 9) : 1;
    if (m > 1) {
      l2.setTransform(1, 0, 0, 1, 0, 0); l2.globalAlpha = 1; l2.clearRect(rx0, ry0, rw, rh);
      for (let j = 0; j < m; j++) {
        const o = (j / (m - 1) - 0.5) * sp;
        l2.globalAlpha = 1 / (j + 1); l2.drawImage(WCE.layer, rx0, ry0, rw, rh, rx0 + mv.ux * o, ry0 + mv.uy * o, rw, rh);
      }
      l2.globalAlpha = 1; src = WCE.layer2;
    }
    ctx.save(); ctx.globalAlpha = alpha; ctx.drawImage(src, rx0, ry0, rw, rh, rx0, ry0, rw, rh); ctx.restore();
  }

  function wcAvgOf(cnv) { if (!cnv._wcAvg) cnv._wcAvg = wcAvgColor(cnv); return cnv._wcAvg; }

  // ---------- the frame ----------
  function renderWarpCinemaLegacy(ctx, W, H, p, kind) {
    const tStart = performance.now();
    const env = wcEnsureEnv(W, H, kind);
    const P = env.P, dest = env.dest, A = env.A, layA = env.layA;
    const e0 = wcCol(P.RB, 0), e1 = wcCol(P.RB, 1), e2 = wcCol(P.RB, 2);
    const plA = { c: [0, 0, 0], ex: [1, 0, 0], ey: [0, 1, 0], n: [0, 0, -1], w: P.wA, h: P.hA, tex: A };
    const plB = { c: P.Bc, ex: e0, ey: e1, n: [-e2[0], -e2[1], -e2[2]], w: P.wB, h: P.hB, tex: dest.tex };
    const avgA = wcAvgOf(A), avgB = dest.avg;
    const resScale = W / 720, tSec = p * P.dur;

    // camera now, one frame earlier (for the spin), one shutter earlier (for the streaks)
    const camH = wcCamera(P, p, WCE.camH);
    const dtp = 1 / (30 * P.dur);
    const camE = wcCamera(P, Math.max(0, p - dtp), WCE.camE);
    const omega = wcAngle(camH.R, camE.R) * 30;
    const sp = camH.speed, warp = wcSm((sp - 0.04) / 0.86);
    // long exposure for the stars (they leave streaks); a much shorter one for the photographs, which must stay sharp
    let shutS = 0.021 + 0.28 * Math.pow(sp, 1.1);
    if (omega > 0.1) shutS = Math.min(shutS, Math.max(0.014, 0.35 / omega));
    const shP = shutS / P.dur;
    const pT = Math.max(0, p - shP);
    const camT = wcCamera(P, pT, WCE.camT);
    const warpT = wcSm((camT.speed - 0.04) / 0.86);
    const shutPl = Math.min(shutS, 0.021 + 0.05 * sp), shPl = shutPl / P.dur, pTp = Math.max(0, p - shPl);
    const camP = wcCamera(P, pTp, WCE.camP);
    const warpP = wcSm((camP.speed - 0.04) / 0.86);
    const shk = 0.9 * warp;
    if (shk > 0.002) { camH.R = wcShake(camH.R, p, P.dur, shk); camT.R = wcShake(camT.R, pT, P.dur, 0.9 * warpT); camP.R = wcShake(camP.R, pTp, P.dur, 0.9 * warpP); }
    const F = P.F0 / (1 + 0.30 * warp), Ft = P.F0 / (1 + 0.30 * warpT), Fp = P.F0 / (1 + 0.30 * warpP);
    const beta = 0.86 * Math.pow(warp, 0.85);
    const inten = wcSm(p / 0.07) * (1 - wcSm((p - 0.88) / 0.11));       // the stars melt away as the camera comes to rest, so the last frame is the clean photo

    // ---- background
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#010206'; ctx.fillRect(0, 0, W, H);
    if (!layA.isFullBleed) {
      const bgA = kind === 'hyperjump' ? 1 - wcSm((p - 0.08) / 0.16) : 1 - wcSm(p / 0.08);
      if (bgA > 0.003) { ctx.globalAlpha = bgA; ctx.drawImage(reelBgCanvas, 0, 0, W, H); }
      const bgB = wcSm((camH.zB - 0.35) / 0.6);
      if (bgB > 0.003) { ctx.globalAlpha = bgB; ctx.drawImage(dest.bg, 0, 0, W, H); }
    }
    ctx.restore();

    // ---- which photos are in view (far -> near)
    const infoA = wcPlaneInfo(camH, F, W, H, plA), infoB = wcPlaneInfo(camH, F, W, H, plB);
    const act = [];
    if (infoA.vis) act.push({ pl: plA, info: infoA, avg: avgA });
    if (infoB.vis) act.push({ pl: plB, info: infoB, avg: avgB });
    act.sort((a, b) => b.info.zc - a.info.zc);
    const RL = WCS.RL;
    const planesL = act.map(a => {
      const n = a.pl.n, c = a.pl.c;
      return { nx: RL[0] * n[0] + RL[1] * n[1] + RL[2] * n[2], ny: RL[3] * n[0] + RL[4] * n[1] + RL[5] * n[2], nz: RL[6] * n[0] + RL[7] * n[1] + RL[8] * n[2],
               d: (camH.pos[0] - c[0]) * n[0] + (camH.pos[1] - c[1]) * n[1] + (camH.pos[2] - c[2]) * n[2] };
    });
    // focus of expansion (where the flight direction pierces the picture)
    const cx0 = W / 2, cy0 = H / 2, Rh = camH.R, vW = P.u;
    const v0 = Rh[0] * vW[0] + Rh[3] * vW[1] + Rh[6] * vW[2], v1 = Rh[1] * vW[0] + Rh[4] * vW[1] + Rh[7] * vW[2], v2 = Rh[2] * vW[0] + Rh[5] * vW[1] + Rh[8] * vW[2];
    let foeX = cx0, foeY = cy0, foeOk = 0, foeBack = false;
    if (v2 > 0.2) { foeX = cx0 + F * v0 / v2; foeY = cy0 + F * v1 / v2; foeOk = wcSm((v2 - 0.2) / 0.4); }
    else if (v2 < -0.2) { foeX = cx0 + F * v0 / v2; foeY = cy0 + F * v1 / v2; foeOk = wcSm((-v2 - 0.2) / 0.4); foeBack = true; }

    // looking along the flight (+1) or back at where we came from (-1): a rear view keeps its stars (they only stream past), a front view is thinned out and squeezed by aberration
    const fwdK = wcClamp(v2, -1, 1);
    const keep = 1 - 0.80 * wcSm(warp * 1.1) * wcSm((fwdK + 0.15) / 0.55);
    const betaV = beta * (0.30 + 0.70 * wcSm((fwdK + 0.45) / 0.9));
    if (state.reelRecording) WCE.qual = 1;
    else if (WCE.qual === undefined) WCE.qual = 1;
    const dens = ({ 4: 0.62, 6: 1.0, 8: 1.4 }[state.reelGrid] || 1.0) * wcClamp(0.55 + 0.45 * W / 1080, 0.6, 1.0) * WCE.qual;
    wcCollectStars(W, H, camH, camT, F, Ft, betaV, P.u, inten, tSec, planesL, resScale, dens, keep, { x: foeX, y: foeY, warp: warp, ok: foeOk });

    const glowMult = state.reelStarGlow !== undefined ? state.reelStarGlow : 1.2;
    const spikes = !!state.reelSpikes;
    {
      for (let k = 0; k <= act.length; k++) {
        wcDrawStars(ctx, k, W, H, glowMult, spikes, resScale, 1 - wcSm(warp / 0.45));
        if (k < act.length) {
          const a = act[k], info = a.info;
          const solid = wcSm((info.diag - 9) / 64);
          if (solid > 0.01) wcDrawPlaneMB(ctx, W, H, P, p, shPl, camH, camP, F, Fp, a.pl, solid);
          const gl = 1 - wcSm((info.diag - 16) / 150);
          if (gl > 0.02 && info.zc > WC_NEAR) {
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            wcGlint(ctx, info.sx, info.sy, Math.max(10 * resScale, info.diag * 1.3), a.avg, 0.85 * gl);
            ctx.restore();
          }
        }
      }
    }

    // ---- light, flashes, bloom, vignette
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter';
    const D = Math.max(W, H);
    if (warp > 0.02 && foeOk > 0.01) {
      const mixB = wcSm((p - (P.pa - 0.10)) / 0.10);
      const base = [150, 190, 255], tint = foeBack ? avgA : avgB, tm = foeBack ? 0.45 : 0.55 * mixB;
      const col = [Math.round(base[0] + (tint[0] - base[0]) * tm), Math.round(base[1] + (tint[1] - base[1]) * tm), Math.round(base[2] + (tint[2] - base[2]) * tm)];
      const rad = D * (0.075 + 0.13 * warp);
      const g = ctx.createRadialGradient(foeX, foeY, 0, foeX, foeY, rad);
      const ga = 0.20 * Math.pow(warp, 1.2) * foeOk;
      g.addColorStop(0, 'rgba(255,255,255,' + (ga * 0.85).toFixed(3) + ')');
      g.addColorStop(0.22, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + (ga * 0.45).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    // flashes: the jump (or the turn to face forward) and the arrival
    const pj = P.seq1 ? P.pw0 + 0.05 : 0.585;
    const fJ = wcFlashShape((p - pj) / 0.016) * (P.seq1 ? 1 : 0.8);
    const fA = wcFlashShape((p - (P.pa + 0.004)) / 0.022) * 0.65;
    const fl = Math.max(fJ, fA);
    if (fl > 0.01) {
      const tintF = fA > fJ ? avgB : [170, 200, 255];
      const fx = fJ >= fA ? foeX : cx0, fy = fJ >= fA ? foeY : cy0;
      const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, D * 0.95);
      g.addColorStop(0, 'rgba(255,255,255,' + Math.min(1, fl * 0.85).toFixed(3) + ')');
      g.addColorStop(0.18, 'rgba(' + tintF[0] + ',' + tintF[1] + ',' + tintF[2] + ',' + (fl * 0.42).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + tintF[0] + ',' + tintF[1] + ',' + tintF[2] + ',0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // anamorphic streak
      const gh = ctx.createLinearGradient(fx - W * 0.95, 0, fx + W * 0.95, 0);
      gh.addColorStop(0, 'rgba(120,170,255,0)'); gh.addColorStop(0.5, 'rgba(210,228,255,' + Math.min(1, fl * 0.9).toFixed(3) + ')'); gh.addColorStop(1, 'rgba(120,170,255,0)');
      ctx.fillStyle = gh; const hh = Math.max(2, H * 0.0042 * (0.5 + fl)); ctx.fillRect(fx - W * 0.95, fy - hh / 2, W * 1.9, hh);
      ctx.globalAlpha = 0.35 * fl; const hh2 = hh * 6; ctx.fillRect(fx - W * 0.95, fy - hh2 / 2, W * 1.9, hh2); ctx.globalAlpha = 1;
    }
    // shock ring at the jump
    if (P.seq1) {
      const rt = (p - pj) / 0.055;
      if (rt > 0 && rt < 1) {
        const rr = D * (0.04 + 1.05 * Math.pow(rt, 0.75)), w = D * (0.03 + 0.05 * rt), a = Math.pow(1 - rt, 2) * 0.55;
        const g = ctx.createRadialGradient(foeX, foeY, Math.max(0, rr - w), foeX, foeY, rr + w);
        g.addColorStop(0, 'rgba(150,190,255,0)'); g.addColorStop(0.55, 'rgba(210,228,255,' + a.toFixed(3) + ')'); g.addColorStop(1, 'rgba(150,190,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
    }
    ctx.restore();

    // bloom (only when light is actually streaming)
    const bloomK = 0.55 * Math.pow(warp, 1.1) + 0.5 * fl;
    if (bloomK > 0.02) {
      const a = WCE.bA, b = WCE.bB;
      WCE.bAc.globalCompositeOperation = 'copy'; WCE.bAc.drawImage(ctx.canvas, 0, 0, W, H, 0, 0, a.width, a.height);
      // keep only the bright parts: squaring the colours acts like a soft threshold
      WCE.bAc.globalCompositeOperation = 'multiply'; WCE.bAc.drawImage(a, 0, 0); WCE.bAc.drawImage(a, 0, 0); WCE.bAc.globalCompositeOperation = 'source-over';
      WCE.bBc.globalCompositeOperation = 'copy'; WCE.bBc.drawImage(a, 0, 0, a.width, a.height, 0, 0, b.width, b.height);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, 0.70 * bloomK); ctx.drawImage(a, 0, 0, a.width, a.height, 0, 0, W, H);
      ctx.globalAlpha = Math.min(1, 0.85 * bloomK); ctx.drawImage(b, 0, 0, b.width, b.height, 0, 0, W, H);
      ctx.restore();
    }
    // vignette
    const vig = 0.60 * warp + 0.10 * inten * (1 - warp);
    if (vig > 0.01) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.30, W / 2, H / 2, Math.hypot(W, H) * 0.55);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,6,0.92)');
      ctx.save(); ctx.globalAlpha = Math.min(1, vig); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
    }
    // live preview only: if drawing takes too long on this device, thin the stars a little (exports always run at full quality)
    if (!state.reelRecording) {
      const dtR = performance.now() - tStart;
      WCE.ms = WCE.ms ? WCE.ms * 0.85 + dtR * 0.15 : dtR;
      if (WCE.ms > 34) WCE.qual = Math.max(0.5, WCE.qual - 0.03); else if (WCE.ms < 20) WCE.qual = Math.min(1, WCE.qual + 0.01);
    }
  }

  // ===== WARP GL : camera paths, speed laws, small 3D helpers (pure math, no DOM) =====
  const WG_DEG = Math.PI / 180;
  function wgClamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function wgSmooth(x) { x = wgClamp(x, 0, 1); return x * x * (3 - 2 * x); }
  function wgSmoother(x) { x = wgClamp(x, 0, 1); return x * x * x * (x * (x * 6 - 15) + 10); }
  function wgMix(a, b, t) { return a + (b - a) * t; }
  function wgWin(p, a, b) { return wgClamp((p - a) / (b - a), 0, 1); }
  function wgEaseIO(x) { x = wgClamp(x, 0, 1); return 0.5 - 0.5 * Math.cos(Math.PI * x); }

  // 3x3 row-major matrices. Columns of a camera matrix are (right, down, forward) in world space.
  function wgRy(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
  function wgRx(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; }
  function wgRz(a) { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; }
  function wgMul(A, B) {
    const C = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
    }
    return C;
  }
  function wgRot(axis, ang) {
    let x = axis[0], y = axis[1], z = axis[2]; const n = Math.hypot(x, y, z) || 1; x /= n; y /= n; z /= n;
    const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
    return [c + t * x * x, t * x * y - s * z, t * x * z + s * y,
            t * x * y + s * z, c + t * y * y, t * y * z - s * x,
            t * x * z - s * y, t * y * z + s * x, c + t * z * z];
  }
  function wgCol(R, k) { return [R[k], R[3 + k], R[6 + k]]; }
  function wgEuler(yaw, pitch, roll) { return wgMul(wgMul(wgRy(yaw), wgRx(pitch)), wgRz(roll)); }
  function wgNorm3(v) { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; }

  // underdamped spring 0 -> 1 with a small overshoot (a camera operator "catching" the new heading)
  function wgSpring(u) {
    u = wgClamp(u, 0, 1);
    const a = 4.6, w = 6.6;
    const v = 1 - Math.exp(-a * u) * (Math.cos(w * u) + (a / w) * Math.sin(w * u));
    return wgMix(v, 1, wgSmooth((u - 0.8) / 0.2));
  }

  // Apparent log-zoom rate of the arrival photo over the arrival window (t in 0..1):
  // a fast "drop out of light speed" part that decays exponentially + a gentle zoom that glides to rest.
  const WG_ARR = { alpha: 0.5, tau: 0.5, pow: 1.5 };
  function wgRhoShape(t) { return WG_ARR.alpha * Math.exp(-t / WG_ARR.tau) + (1 - WG_ARR.alpha) * Math.pow(Math.max(0, 1 - t), WG_ARR.pow); }

  // Everything that does not change from frame to frame.
  // o: { kind, W, H, wA, hLay, wB, hB, zoomMax, aim:[x,y], aimB:[x,y], dur, fov0 }
  function wgBuildPlan(o) {
    const P = { kind: o.kind, W: o.W, H: o.H, dur: o.dur };
    P.fov0 = (o.fov0 || 46) * WG_DEG;
    P.F0 = (o.H / 2) / Math.tan(P.fov0 / 2);
    P.D0 = 1;                                   // world unit == the distance at which plane A exactly fills its layout rectangle
    P.hA = o.layA.h / P.F0; P.wA = o.layA.w / P.F0;
    P.hB = o.layB.h / P.F0; P.wB = o.layB.w / P.F0;
    P.Zm = Math.max(1.05, o.zoomMax);
    P.TA = [(o.aim[0] - 0.5) * P.wA, (o.aim[1] - 0.5) * P.hA, 0];
    P.offB = [(o.aimB[0] - 0.5) * P.wB, (o.aimB[1] - 0.5) * P.hB];
    const seq1 = o.kind === 'hyperjump';
    P.seq1 = seq1;
    P.vmax = seq1 ? 135 : 145;                   // light speed, world units per unit of progress
    P.pa = 0.68;                                // start of the arrival (brake) window: the second photograph starts far away and grows during the brake
    P.pw0 = seq1 ? 0.45 : 0.0;                  // start of acceleration
    P.pw1 = seq1 ? 0.56 : 0.30;                 // reaches light speed
    const rampV = (p) => {
      if (p <= P.pw0) return 0;
      const x = wgClamp((p - P.pw0) / (P.pw1 - P.pw0), 0, 1);
      return seq1 ? wgSmoother(x) : Math.pow(wgSmoother(x), 1.5);
    };
    P.rampV = rampV;

    // ---- arrival: the brake is solved so that speed is continuous with the cruise and the photo ends at exactly Zm
    const durA = 1 - P.pa;
    const Nint = 600;
    let Ft = 0; for (let i = 0; i < Nint; i++) Ft += wgRhoShape((i + 0.5) / Nint) / Nint;
    // rho(t) = amp * shape(t) / durA (log-zoom per unit progress);  z_j = Zm * exp(-amp * Ft);  speed at brake start = r_j * rho(0)
    let lo = 0, hi = 80;
    for (let it = 0; it < 100; it++) {
      const amp = 0.5 * (lo + hi);
      const zj = P.Zm * Math.exp(-amp * Ft);
      const f = (amp * wgRhoShape(0) / durA) * (P.D0 / zj) - P.vmax;
      if (f > 0) hi = amp; else lo = amp;
    }
    P.ampA = 0.5 * (lo + hi);
    P.zj = P.Zm * Math.exp(-P.ampA * Ft);
    P.rj = P.D0 / P.zj;
    P.durA = durA;
    const Mn = 800;
    const arrZ = new Float64Array(Mn + 1), arrR = new Float64Array(Mn + 1);
    let acc = 0; arrZ[0] = P.zj; arrR[0] = P.rj;
    for (let i = 1; i <= Mn; i++) {
      acc += P.ampA * 0.5 * (wgRhoShape((i - 1) / Mn) + wgRhoShape(i / Mn)) / Mn;
      arrZ[i] = P.zj * Math.exp(acc); arrR[i] = P.D0 / arrZ[i];
    }
    P.arrZ = arrZ; P.arrR = arrR; P.arrM = Mn;

    // cumulative ramp integral up to the brake
    const NR = 6000; const cum = new Float64Array(NR + 1);
    for (let i = 1; i <= NR; i++) {
      const q0 = (i - 1) / NR * P.pa, q1 = i / NR * P.pa;
      cum[i] = cum[i - 1] + 0.5 * (rampV(q0) + rampV(q1)) * (q1 - q0);
    }
    P.sAtPa = P.vmax * cum[NR];
    const sOf = (p) => {
      if (p <= P.pa) { const k = p / P.pa * NR, i = Math.min(NR - 1, Math.floor(k)), f = k - i; return P.vmax * (cum[i] * (1 - f) + cum[i + 1] * f); }
      const t = wgClamp((p - P.pa) / durA, 0, 1) * Mn, j = Math.min(Mn - 1, Math.floor(t)), f = t - j;
      return P.sAtPa + (P.rj - (arrR[j] * (1 - f) + arrR[j + 1] * f));
    };
    const N = 4096; P.N = N;
    P.tabS = new Float64Array(N + 1); P.tabV = new Float64Array(N + 1); P.tabZ = new Float64Array(N + 1);
    for (let i = 0; i <= N; i++) {
      const p = i / N;
      P.tabS[i] = sOf(p);
      if (p <= P.pa) { P.tabV[i] = P.vmax * rampV(p); P.tabZ[i] = P.D0 / (P.rj + (P.sAtPa - P.tabS[i])); }
      else {
        const t = wgClamp((p - P.pa) / durA, 0, 1);
        const k = t * Mn, j = Math.min(Mn - 1, Math.floor(k)), f = k - j;
        const z = arrZ[j] * (1 - f) + arrZ[j + 1] * f;
        P.tabZ[i] = z; P.tabV[i] = (P.D0 / z) * P.ampA * wgRhoShape(t) / durA;
      }
    }
    P.sEnd = P.tabS[N];

    // ---- orientation / path constants per sequence
    if (seq1) {
      P.zA1 = 1.5;
      P.yawF = 0.44; P.pitchF = 0.09;
      P.Ly = -0.04; P.Lz = 0;
      const D1 = P.D0 / P.zA1;
      const halfH = Math.atan(Math.tan(P.fov0 / 2) * (o.W / o.H));
      P.Ls = D1 * Math.tan(0.72 * halfH);            // a modest sideways move (about 3/4 of the half field of view): the photograph and its surroundings stay in view
      P.yawTrack = -0.55 * Math.atan(P.Ls / D1);     // the camera partly keeps looking at the target while it trucks
      P.RB = wgEuler(P.yawF, P.pitchF, 0);              // B's frame == final camera frame
      P.u = wgCol(P.RB, 2);
      const x1 = P.TA[0] * (1 - 1 / P.zA1) + P.Ls, y1 = P.TA[1] * (1 - 1 / P.zA1) + P.Ly, z1 = -D1 + P.Lz;
      P.Bc = [x1 + P.u[0] * (P.sEnd + P.D0 / P.Zm), y1 + P.u[1] * (P.sEnd + P.D0 / P.Zm), z1 + P.u[2] * (P.sEnd + P.D0 / P.Zm)];
    } else {
      const C0 = [0, 0, -P.D0];
      P.dA = wgNorm3([C0[0] - P.TA[0], C0[1] - P.TA[1], C0[2] - P.TA[2]]);
      P.DT0 = Math.hypot(C0[0] - P.TA[0], C0[1] - P.TA[1], C0[2] - P.TA[2]);
      const fla = [-P.dA[0], -P.dA[1], -P.dA[2]];       // look at the target while backing away
      P.yawLA = Math.atan2(fla[0], fla[2]); P.pitchLA = Math.asin(-wgClamp(fla[1], -1, 1));
      P.Rla = wgMul(wgRy(P.yawLA), wgRx(P.pitchLA));
      const chi = 22 * WG_DEG;
      const dn = wgCol(P.Rla, 1), rt = wgCol(P.Rla, 0);
      P.swingAxis = [Math.cos(chi) * dn[0] + Math.sin(chi) * rt[0], Math.cos(chi) * dn[1] + Math.sin(chi) * rt[1], Math.cos(chi) * dn[2] + Math.sin(chi) * rt[2]];
      P.rollTotal = 0.5 * 2 * Math.PI;
      P.RB = wgMul(wgMul(wgRot(P.swingAxis, Math.PI), P.Rla), wgRz(P.rollTotal));
      P.u = wgCol(P.RB, 2);                              // travel direction == final look direction
      const L = P.DT0 + P.sEnd + P.D0 / P.Zm;
      P.Bc = [P.TA[0] + P.dA[0] * L, P.TA[1] + P.dA[1] * L, P.TA[2] + P.dA[2] * L];
    }
    return P;
  }

  function wgTravel(P, p) {
    const k = wgClamp(p, 0, 1) * P.N, i = Math.min(P.N - 1, Math.floor(k)), f = k - i;
    return { s: P.tabS[i] * (1 - f) + P.tabS[i + 1] * f, v: P.tabV[i] * (1 - f) + P.tabV[i + 1] * f, z: P.tabZ[i] * (1 - f) + P.tabZ[i + 1] * f };
  }

  // Camera pose at progress p: { pos[3], R[9], speed (0..1 of light speed), zB (apparent zoom of the arrival photo) }
  function wgCamera(P, p, out) {
    out = out || {};
    const tr = wgTravel(P, p);
    let pos, R;
    if (P.seq1) {
      const zA = wgMix(1, P.zA1, wgEaseIO(wgWin(p, 0, 0.23)));
      const su = wgSmoother(wgWin(p, 0.17, 0.43));
      pos = [P.TA[0] * (1 - 1 / zA) + P.Ls * su + P.u[0] * tr.s,
             P.TA[1] * (1 - 1 / zA) + P.Ly * su + P.u[1] * tr.s,
             -P.D0 / zA + P.Lz * su + P.u[2] * tr.s];
      const track = wgSmooth(wgWin(p, 0.10, 0.34));
      const whip = wgSpring(wgWin(p, 0.36, 0.50));
      const yaw = P.yawTrack * track + (P.yawF - P.yawTrack) * whip;
      const pitch = P.pitchF * wgSmooth(wgWin(p, 0.34, 0.50)) - 0.03 * Math.sin(Math.PI * wgWin(p, 0.17, 0.43));
      const bank = 0.025 * Math.sin(Math.PI * wgWin(p, 0.17, 0.42)) + 0.06 * Math.sin(Math.PI * wgWin(p, 0.35, 0.53));
      R = wgEuler(yaw, pitch, bank);
    } else {
      pos = [P.TA[0] + P.dA[0] * (P.DT0 + tr.s), P.TA[1] + P.dA[1] * (P.DT0 + tr.s), P.TA[2] + P.dA[2] * (P.DT0 + tr.s)];
      const b = wgSmoother(wgWin(p, 0.0, 0.20));
      const Rla = wgMul(wgRy(P.yawLA * b), wgRx(P.pitchLA * b));
      const roll = P.rollTotal * wgSmoother(wgWin(p, 0.13, 0.60));
      const swing = Math.PI * wgSmoother(wgWin(p, 0.37, 0.60));
      R = wgMul(wgMul(wgRot(P.swingAxis, swing), Rla), wgRz(roll));
    }
    if (p > P.pa) {                                       // gentle lateral drift toward the aim point of the arrival photo
      const z = tr.z, Lz = (1 - 1 / z) * wgSmooth((z - 0.5) / 0.7);
      const ex = wgCol(P.RB, 0), ey = wgCol(P.RB, 1);
      for (let k = 0; k < 3; k++) pos[k] += (ex[k] * P.offB[0] + ey[k] * P.offB[1]) * Lz;
    }
    out.pos = pos; out.R = R; out.speed = wgClamp(tr.v / P.vmax, 0, 1); out.zB = tr.z; out.v = tr.v;
    return out;
  }

  // ===== WARP GL : scene preparation =====
  // Splits a photograph into (a) a starless "plane" (stars inpainted away) and (b) the stars themselves,
  // kept as exact residual patches in an atlas, so that  starless + patches == photograph  (to 8-bit precision).
  // The renderer lifts the patches to slightly different depths, which gives the stars real parallax.
  const WG_S2L = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const c = i / 255; WG_S2L[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  const WG_LN = 16384, WG_L2S = new Uint8Array(WG_LN + 1);
  for (let i = 0; i <= WG_LN; i++) { const l = i / WG_LN; const c = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055; WG_L2S[i] = Math.max(0, Math.min(255, Math.round(c * 255))); }
  function wgEnc(l) { l = l <= 0 ? 0 : (l >= 1 ? 1 : l); return WG_L2S[(l * WG_LN + 0.5) | 0]; }
  function wgClampN(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function wgRng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
  const wgYield = () => new Promise(r => setTimeout(r, 0));

  function wgBlurBox(src, w, h, r, dst, tmp) {
    const inv = 1 / (2 * r + 1);
    for (let y = 0; y < h; y++) {
      const o = y * w; let sum = src[o] * r;
      for (let x = 0; x <= r; x++) sum += src[o + (x < w ? x : w - 1)];
      for (let x = 0; x < w; x++) {
        tmp[o + x] = sum * inv;
        const a = x + r + 1, s = x - r;
        sum += src[o + (a < w ? a : w - 1)] - src[o + (s > 0 ? s : 0)];
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = tmp[x] * r;
      for (let y = 0; y <= r; y++) sum += tmp[(y < h ? y : h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        dst[y * w + x] = sum * inv;
        const a = y + r + 1, s = y - r;
        sum += tmp[(a < h ? a : h - 1) * w + x] - tmp[(s > 0 ? s : 0) * w + x];
      }
    }
  }
  function wgBil(a, w, h, x, y) {
    if (x < 0) x = 0; else if (x > w - 1.001) x = w - 1.001;
    if (y < 0) y = 0; else if (y > h - 1.001) y = h - 1.001;
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * w + x0;
    return (a[i] * (1 - fx) + a[i + 1] * fx) * (1 - fy) + (a[i + w] * (1 - fx) + a[i + w + 1] * fx) * fy;
  }

  // ---------- thin frame lines ----------
  // A stroke drawn around (or inside) a photograph is found as a pair of opposite brightness steps that run perfectly straight along many pixels
  // with the same contrast, or as one strong step a few pixels from the picture's edge. It is painted over with the sky on both sides (plus matching noise);
  // otherwise the 3D scene would show it as a bright rectangle floating in space.
  function wgRunScan(L, o1, o0, W, T, sg) {                  // densest run of columns where sg * (L[o1 + x] - L[o0 + x]) > T: [xs, xe, hits, sum, sum of squares]
    let cur = 0, cs = 0, best = 0, bs = -1, be = -1;
    for (let x = 0; x < W; x++) {
      const sc = sg * (L[o1 + x] - L[o0 + x]) > T ? 1 : -3;            // a hit pays 1, a miss costs 3: stars and noise may interrupt the line a little
      if (cur <= 0) { cur = 0; cs = x; }
      cur += sc;
      if (cur > best) { best = cur; bs = cs; be = x; }
    }
    if (bs < 0) return null;
    let hits = 0, sum = 0, sq = 0, xs = -1, xe = -1;
    for (let x = bs; x <= be; x++) { const v = sg * (L[o1 + x] - L[o0 + x]); if (v > T) { if (xs < 0) xs = x; xe = x; hits++; sum += v; sq += v * v; } }
    return hits ? [xs, xe, hits, sum, sq] : null;
  }
  function wgFindLines(L, W, H) {                            // horizontal lines of a W x H luminance map: [{ a, b, xs, xe, rim }]  (rows a..b get painted over)
    const T = 16, kMax = Math.max(6, Math.round(0.006 * Math.max(W, H))), minRun = Math.max(40, Math.round(0.2 * W));
    const bd = [];
    for (let y = 1; y < H; y++) {
      for (let q = 0; q < 2; q++) {
        const sg = q ? -1 : 1, r = wgRunScan(L, y * W, (y - 1) * W, W, T, sg);
        if (!r) continue;
        const len = r[1] - r[0] + 1, mean = r[3] / r[2], sd = Math.sqrt(Math.max(0, r[4] / r[2] - mean * mean));
        if (len >= minRun && r[2] >= 0.85 * len && sd < 0.5 * mean) bd.push({ y, sg, xs: r[0], xe: r[1], m: mean });
      }
    }
    const cl = [];                                           // anti-aliased edges spread over 2-3 rows: merge neighbouring boundaries of the same sign
    for (const b of bd) {
      const c = cl.find(u => u.sg === b.sg && b.y - u.yb <= 2 && Math.min(u.xe, b.xe) - Math.max(u.xs, b.xs) > 0.6 * Math.min(u.xe - u.xs, b.xe - b.xs));
      if (c) { c.yb = b.y; c.xs = Math.max(c.xs, b.xs); c.xe = Math.min(c.xe, b.xe); c.m += b.m; } else cl.push({ sg: b.sg, ya: b.y, yb: b.y, xs: b.xs, xe: b.xe, m: b.m });
    }
    const out = [], used = new Set();
    for (let i = 0; i < cl.length; i++) {
      const u = cl[i]; if (used.has(i)) continue;
      for (let j = i + 1; j < cl.length; j++) {
        const v = cl[j]; if (used.has(j) || v.sg === u.sg) continue;
        const th = v.ya - u.yb; if (th < 0) continue; if (th > kMax) break;
        const xs = Math.max(u.xs, v.xs), xe = Math.min(u.xe, v.xe), mu = u.m, mv = v.m;
        if (xe - xs + 1 < minRun || mu / mv > 2.85 || mv / mu > 2.85) continue;
        out.push({ a: u.ya, b: v.yb - 1, xs, xe, rim: false }); used.add(i); used.add(j); break;
      }
    }
    for (let i = 0; i < cl.length; i++) {                    // a line that touches the edge of the picture: only its inner boundary can be seen
      const u = cl[i]; if (used.has(i)) continue;
      if (u.ya <= Math.min(kMax, 8) && u.m >= 24 && u.xe - u.xs + 1 >= 0.8 * W) { out.push({ a: 0, b: u.yb - 1, xs: 0, xe: W - 1, rim: true }); used.add(i); }
    }
    return out;
  }
  function wgFillLines(cv, ops, vertical) {                  // paint rows a..b (columns xs..xe) with the sky on both sides + matching noise; vertical: work on columns instead
    if (!ops.length) return;
    const w = cv.width, h = cv.height, ctx = cv.getContext('2d', { willReadFrequently: true }), img = ctx.getImageData(0, 0, w, h), D = img.data;
    const stride = vertical ? 4 : w * 4, along = vertical ? w * 4 : 4, nAlong = vertical ? h : w, nAcross = vertical ? w : h;
    const px = (k, x) => k * stride + x * along;                       // k: row (or column) index, x: position along it
    const rng = wgRng(913), win = new Float32Array(7);
    const anchor = (k, xs, xe, c, out) => {                            // running median of 7 along the line (stars do not leave streaks)
      for (let x = xs; x <= xe; x++) {
        for (let t = 0; t < 7; t++) win[t] = D[px(k, Math.min(nAlong - 1, Math.max(0, x + t - 3))) + c];
        for (let a = 1; a < 7; a++) { const v = win[a]; let b = a - 1; while (b >= 0 && win[b] > v) { win[b + 1] = win[b]; b--; } win[b + 1] = v; }
        out[x - xs] = win[3];
      }
    };
    for (const op of ops) {
      const a = Math.max(0, op.a - 1), b = Math.min(nAcross - 1, op.b + 1), xs = Math.max(0, op.xs - 14), xe = Math.min(nAlong - 1, op.xe + 14);   // one more row on each side (soft edge of the stroke); a little more along it (where lines cross)
      const ka = a - 1, kb = b + 1, hasA = ka >= 0, hasB = kb < nAcross;
      if (!hasA && !hasB) continue;
      const n = xe - xs + 1, A = new Float32Array(n), B = new Float32Array(n);
      for (let c = 0; c < 3; c++) {
        let sig = 0;
        { const k = hasB ? kb : ka, ds = []; for (let x = xs; x < xe; x += 3) ds.push(Math.abs(D[px(k, x + 1) + c] - D[px(k, x) + c])); ds.sort((p, q) => p - q); sig = ds.length ? ds[ds.length >> 1] / 0.954 : 0; }
        if (hasA) anchor(ka, xs, xe, c, A); if (hasB) anchor(kb, xs, xe, c, B);
        const src = [];                                                // single anchor (line at the picture's edge): the real texture next to it is mirrored over the line
        for (let k = a; k <= b; k++) src[k - a] = hasA && hasB ? -1 : (hasB ? Math.min(nAcross - 1, kb + (b - k)) : Math.max(0, ka - (k - a)));
        for (let x = xs; x <= xe; x++) {
          for (let k = a; k <= b; k++) {
            let v;
            if (hasA && hasB) v = A[x - xs] + (B[x - xs] - A[x - xs]) * ((k - ka) / (kb - ka)) + (rng() + rng() + rng() - 1.5) * 2 * sig;
            else v = D[px(src[k - a], x) + c];
            D[px(k, x) + c] = v < 0 ? 0 : (v > 255 ? 255 : (v + 0.5) | 0);
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  function wgLumaMap(cv, transpose) {
    const w = cv.width, h = cv.height, D = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data, n = w * h, L = new Uint8Array(n);
    if (!transpose) { for (let i = 0, j = 0; i < n; i++, j += 4) L[i] = (D[j] * 77 + D[j + 1] * 151 + D[j + 2] * 28) >> 8; return L; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const j = (y * w + x) * 4; L[x * h + y] = (D[j] * 77 + D[j + 1] * 151 + D[j + 2] * 28) >> 8; }
    return L;
  }
  function wgFlipRows(L, W, H) { const F = new Uint8Array(W * H); for (let y = 0; y < H; y++) F.set(L.subarray((H - 1 - y) * W, (H - y) * W), y * W); return F; }
  // cv: the photograph (analysed); others: canvases with the same geometry (e.g. the same photograph with its annotations) that get the same repair
  function wgRemoveFrameLines(cv, others) {
    const w = cv.width, h = cv.height; if (w < 96 || h < 96) return { h: 0, v: 0 };
    const all = [cv].concat(others || []);
    const Lm = wgLumaMap(cv, false);
    const hAll = wgFindLines(Lm, w, h).concat(wgFindLines(wgFlipRows(Lm, w, h), w, h).filter(o => o.rim).map(o => ({ a: h - 1 - o.b, b: h - 1, xs: o.xs, xe: o.xe, rim: true })));
    const Lv = wgLumaMap(cv, true);
    const vAll = wgFindLines(Lv, h, w).concat(wgFindLines(wgFlipRows(Lv, h, w), h, w).filter(o => o.rim).map(o => ({ a: w - 1 - o.b, b: w - 1, xs: o.xs, xe: o.xe, rim: true })));
    if (hAll.length + vAll.length > 8) return { h: 0, v: 0, skipped: 'many lines (a graphic rather than a photograph)' };
    all.forEach(c => wgFillLines(c, hAll, false));
    all.forEach(c => wgFillLines(c, vAll, true));
    return { h: hAll.length, v: vAll.length, ops: { h: hAll, v: vAll } };
  }

  // opt: { maxStars, annCanvas }
  async function wgBuildScene(clean, opt) {
    opt = opt || {};
    const t0 = performance.now();
    const w = clean.width, h = clean.height, NPX = w * h;
    const O = clean.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const S = new Uint8Array(NPX * 4); S.set(O);
    const scene = { w, h, S, stars: [], atlas: null, bg: [0.004, 0.005, 0.009], medLum: 0, info: {} };

    // annotation overlay (kept on the plane; stars near it are not lifted)
    let annData = null, protect = null, pw4 = 0, ph4 = 0;
    if (opt.annCanvas) {
      const A = opt.annCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
      pw4 = Math.ceil(w / 4); ph4 = Math.ceil(h / 4); protect = new Uint8Array(pw4 * ph4); let cnt = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const j = (y * w + x) * 4;
        if (Math.abs(A[j] - O[j]) + Math.abs(A[j + 1] - O[j + 1]) + Math.abs(A[j + 2] - O[j + 2]) > 8) { protect[(y >> 2) * pw4 + (x >> 2)] = 1; cnt++; }
      }
      if (cnt) annData = A; else protect = null;
    }
    const isProtected = (x, y, R) => {
      if (!protect) return false;
      const r4 = Math.ceil((R + 8) / 4), cx4 = x >> 2, cy4 = y >> 2;
      for (let j = Math.max(0, cy4 - r4); j <= Math.min(ph4 - 1, cy4 + r4); j++) for (let i = Math.max(0, cx4 - r4); i <= Math.min(pw4 - 1, cx4 + r4); i++) if (protect[j * pw4 + i]) return true;
      return false;
    };

    // ---------- working-resolution luminance ----------
    const sc = Math.min(1, 1600 / Math.max(w, h));
    const ww = Math.max(16, Math.round(w * sc)), wh = Math.max(16, Math.round(h * sc)), WN = ww * wh;
    const wcv = document.createElement('canvas'); wcv.width = ww; wcv.height = wh;
    const wx = wcv.getContext('2d', { willReadFrequently: true }); wx.imageSmoothingEnabled = true; wx.imageSmoothingQuality = 'high';
    wx.drawImage(clean, 0, 0, ww, wh);
    const wd = wx.getImageData(0, 0, ww, wh).data;
    const Y = new Float32Array(WN);
    for (let i = 0, j = 0; i < WN; i++, j += 4) Y[i] = (0.2126 * wd[j] + 0.7152 * wd[j + 1] + 0.0722 * wd[j + 2]) / 255;
    // median luminance (histogram) and dark-sky colour
    {
      const hist = new Uint32Array(256); for (let i = 0; i < WN; i += 3) hist[Math.min(255, (Y[i] * 255) | 0)]++;
      let tot = 0; for (let k = 0; k < 256; k++) tot += hist[k];
      let acc = 0, med = 0, p8 = 0, got8 = false;
      for (let k = 0; k < 256; k++) { acc += hist[k]; if (!got8 && acc >= tot * 0.08) { p8 = k; got8 = true; } if (acc >= tot * 0.5) { med = k; break; } }
      scene.medLum = med / 255;
      let r = 0, g = 0, b = 0, n = 0; const lo = Math.max(0, p8 - 3), hi = p8 + 3;
      for (let i = 0, j = 0; i < WN; i += 2, j += 8) { const k = Math.min(255, (Y[i] * 255) | 0); if (k >= lo && k <= hi) { r += WG_S2L[wd[j]]; g += WG_S2L[wd[j + 1]]; b += WG_S2L[wd[j + 2]]; n++; } }
      if (n > 20) scene.bg = [r / n, g / n, b / n];
    }
    const maxStars = opt.maxStars || 1400;
    if (scene.medLum > 0.30) { scene.info = { skipped: 'bright', ms: performance.now() - t0 }; if (annData) S.set(annData); return scene; }   // not a night-sky picture: no star lifting
    await wgYield();

    // ---------- background and high-pass ----------
    const rb = Math.max(6, Math.round(0.03 * Math.max(ww, wh)));
    const T1 = new Float32Array(WN), T2 = new Float32Array(WN), B = new Float32Array(WN);
    wgBlurBox(Y, ww, wh, rb, T1, T2);
    for (let i = 0; i < WN; i++) T1[i] = Math.min(Y[i], T1[i] + 0.03);
    wgBlurBox(T1, ww, wh, rb, B, T2); wgBlurBox(B, ww, wh, rb, T1, T2); B.set(T1);
    // noise estimate (MAD of the high-pass)
    let sigN;
    {
      const hist = new Uint32Array(512); let tot = 0;
      for (let i = 0; i < WN; i += 5) { const v = Y[i] - B[i]; hist[wgClampN(Math.round(v * 1000) + 256, 0, 511)]++; tot++; }
      let acc = 0, med = 256; for (let k = 0; k < 512; k++) { acc += hist[k]; if (acc >= tot / 2) { med = k; break; } }
      const hist2 = new Uint32Array(512); for (let k = 0; k < 512; k++) hist2[Math.abs(k - med)] += hist[k];
      acc = 0; let mad = 1; for (let k = 0; k < 512; k++) { acc += hist2[k]; if (acc >= tot / 2) { mad = k; break; } }
      sigN = Math.max(0.003, 1.4826 * mad / 1000);
    }
    const thr = Math.max(5 * sigN, 0.035);
    await wgYield();

    // ---------- candidates ----------
    const cands = [];
    for (let y = 3; y < wh - 3; y++) {
      for (let x = 3; x < ww - 3; x++) {
        const i = y * ww + x, v = Y[i] - B[i];
        if (v < thr) continue;
        let ok = true;
        for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2; dx++) {
          if (!dx && !dy) continue;
          const j = i + dy * ww + dx, u = Y[j] - B[j];
          if (u > v || (u === v && (dy < 0 || (dy === 0 && dx < 0)))) { ok = false; break; }
        }
        if (ok) cands.push(i);
      }
    }
    // radial profile (mean of the 5 lowest of 8 directions: robust against neighbours)
    const CS = [], SN = []; for (let d = 0; d < 8; d++) { CS.push(Math.cos(d * Math.PI / 4)); SN.push(Math.sin(d * Math.PI / 4)); }
    const RMX = Math.min(60, Math.max(12, Math.round(0.045 * Math.max(ww, wh))));
    const prof = new Float32Array(RMX + 2), tmp8 = new Float32Array(8);
    const found = [];
    for (let ci = 0; ci < cands.length; ci++) {
      const i = cands[ci], x = i % ww, y = (i / ww) | 0, B0 = B[i], Hp = Y[i] - B0;
      if (B0 > 0.17) continue;                                // inside the galaxy / nebula glow: such stars belong to it and stay on the plane
      prof[0] = Hp;
      for (let r = 1; r <= RMX + 1; r++) {
        for (let d = 0; d < 8; d++) tmp8[d] = wgBil(Y, ww, wh, x + CS[d] * r, y + SN[d] * r) - B0;
        for (let a = 1; a < 8; a++) { const t = tmp8[a]; let b = a - 1; while (b >= 0 && tmp8[b] > t) { tmp8[b + 1] = tmp8[b]; b--; } tmp8[b + 1] = t; }
        prof[r] = (tmp8[0] + tmp8[1] + tmp8[2] + tmp8[3] + tmp8[4]) / 5;
      }
      let rh = 0; for (let r = 1; r <= RMX; r++) { if (prof[r] <= 0.5 * Hp) { rh = (r - 1) + (prof[r - 1] - 0.5 * Hp) / Math.max(1e-6, prof[r - 1] - prof[r]); break; } rh = r; }
      if (rh > 7) continue;                                   // too extended to be a star
      const r25 = Math.min(RMX, Math.ceil(2.5 * Math.max(1, rh)) + 1);
      if (prof[r25] > 0.12 * Hp) continue;                    // slow fall-off: nebulous knot / galaxy core, keep it on the plane
      const lim = Math.max(1.8 * sigN, 0.018 * Hp);
      let Rm = 2; for (let r = 2; r <= RMX; r++) { if (prof[r] < lim && prof[r + 1] < lim) { Rm = r; break; } Rm = r; }
      // round?  (the 3 brightest directions must not be much stronger than the profile)
      const flux = Hp * (rh * rh + 1.5);
      // peak colour (working res, linear), from the brightest pixel of the 3x3 around the peak
      found.push({ x, y, Hp, rh, Rm, flux });
    }
    found.sort((a, b) => b.flux - a.flux);
    await wgYield();

    // ---------- selection and full-resolution geometry ----------
    const sel = [];
    for (let k = 0; k < found.length && sel.length < maxStars; k++) {
      const f = found[k];
      const xf = (f.x + 0.5) / sc, yf = (f.y + 0.5) / sc;
      const R = Math.max(4, Math.ceil(f.Rm / sc * 1.2 + 1.5));
      if (xf < R + 2 || yf < R + 2 || xf > w - R - 2 || yf > h - R - 2) continue;       // keep whole stars only
      let clash = false;
      for (let q = 0; q < sel.length; q++) { const s = sel[q]; const dx = s.x - xf, dy = s.y - yf, rr = 0.55 * (s.R + R); if (dx * dx + dy * dy < rr * rr) { clash = true; break; } }
      if (clash) continue;
      if (isProtected(xf | 0, yf | 0, R)) continue;
      sel.push({ x: xf, y: yf, cx: Math.floor(xf), cy: Math.floor(yf), R, Hp: f.Hp, fwhm: Math.max(1.2, 2 * f.rh / sc), flux: f.flux });
    }
    const nSel = sel.length;
    // ownership map
    const own = new Uint16Array(NPX); own.fill(0xFFFF);
    for (let k = 0; k < nSel; k++) {
      const s = sel[k], R = s.R, R2 = R * R;
      for (let yy = s.cy - R; yy <= s.cy + R; yy++) {
        if (yy < 0 || yy >= h) continue;
        for (let xx = s.cx - R; xx <= s.cx + R; xx++) {
          if (xx < 0 || xx >= w) continue;
          const dx = xx - s.cx, dy = yy - s.cy;
          if (dx * dx + dy * dy <= R2 && own[yy * w + xx] === 0xFFFF) own[yy * w + xx] = k;
        }
      }
    }
    await wgYield();

    // ---------- fill (inpaint) + residual patches ----------
    const rng = wgRng(12345);
    const patches = new Array(nSel);
    const ptsX = new Float32Array(160), ptsY = new Float32Array(160), ptsC = new Float32Array(160 * 3);
    const t_start = performance.now();
    for (let k = 0; k < nSel; k++) {
      const s = sel[k], R = s.R, cx = s.cx, cy = s.cy;
      // ring samples outside every star disk
      let np = 0;
      const rads = [1.16, 1.42, 1.75, 2.2];
      for (let ri = 0; ri < rads.length && (np < 28 || ri < 2); ri++) {
        const rad = R * rads[ri], na = wgClampN(Math.round(rad * 1.6), 14, 44);
        for (let a = 0; a < na && np < 100; a++) {
          const ang = (a + 0.37 * ri) / na * 6.2831853;
          const px = Math.round(cx + Math.cos(ang) * rad), py = Math.round(cy + Math.sin(ang) * rad);
          if (px < 0 || py < 0 || px >= w || py >= h) continue;
          const idx = py * w + px; if (own[idx] !== 0xFFFF) continue;
          ptsX[np] = px - cx; ptsY[np] = py - cy; const j = idx * 4;
          ptsC[np * 3] = WG_S2L[O[j]]; ptsC[np * 3 + 1] = WG_S2L[O[j + 1]]; ptsC[np * 3 + 2] = WG_S2L[O[j + 2]]; np++;
        }
      }
      const pd = 2 * R + 1;
      // structure test on the ring (gamma space, median absolute deviation): textured surroundings cannot be filled convincingly
      let structured = np < 6;
      if (!structured) {
        const gl = new Float32Array(np);
        for (let q = 0; q < np; q++) { const j = ((cy + ptsY[q]) * w + (cx + ptsX[q])) * 4; gl[q] = (0.2126 * O[j] + 0.7152 * O[j + 1] + 0.0722 * O[j + 2]) / 255; }
        const srt = Array.from(gl).sort((p1, p2) => p1 - p2); const med = srt[np >> 1];
        const dev = srt.map(v => Math.abs(v - med)).sort((p1, p2) => p1 - p2);
        if (1.4826 * dev[np >> 1] > 0.028) structured = true;
      }
      if (structured) { s.drop = true; patches[k] = null; continue; }
      const patch = new Uint8Array(pd * pd * 4);
      let peakL = 0, pr = 0, pg = 0, pb = 0;
      // plane fit per channel (value at the centre, gradient) + inverse-distance residual
      const fitA = [0, 0, 0], fitB = [0, 0, 0], fitC = [0, 0, 0], sd = [0, 0, 0];
      const res = np > 0 ? new Float32Array(np * 3) : null;
      if (np >= 6) {
        let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
        for (let q = 0; q < np; q++) { const px = ptsX[q], py = ptsY[q]; sx += px; sy += py; sxx += px * px; syy += py * py; sxy += px * py; }
        const mx = sx / np, my = sy / np;
        const cxx = sxx / np - mx * mx, cyy = syy / np - my * my, cxy = sxy / np - mx * my;
        const det = cxx * cyy - cxy * cxy;
        for (let c = 0; c < 3; c++) {
          let mv = 0, cvx = 0, cvy = 0;
          for (let q = 0; q < np; q++) mv += ptsC[q * 3 + c]; mv /= np;
          for (let q = 0; q < np; q++) { const v = ptsC[q * 3 + c] - mv; cvx += (ptsX[q] - mx) * v; cvy += (ptsY[q] - my) * v; }
          cvx /= np; cvy /= np;
          let bx = 0, by = 0; if (det > 1e-6) { bx = (cvx * cyy - cvy * cxy) / det; by = (cvy * cxx - cvx * cxy) / det; }
          // keep the slope modest so that it cannot run away across the hole
          const lim = 0.5 * Math.max(0.002, mv) / Math.max(2, R); bx = wgClampN(bx, -lim, lim); by = wgClampN(by, -lim, lim);
          fitA[c] = mv - bx * mx - by * my; fitB[c] = bx; fitC[c] = by;
          const ab = new Float32Array(np);
          for (let q = 0; q < np; q++) { const r = ptsC[q * 3 + c] - (fitA[c] + bx * ptsX[q] + by * ptsY[q]); res[q * 3 + c] = r; ab[q] = Math.abs(r); }
          const sa = Array.from(ab).sort((p1, p2) => p1 - p2); sd[c] = 1.4826 * sa[np >> 1];
          const cl = 3 * sd[c] + 1e-5; for (let q = 0; q < np; q++) { if (res[q * 3 + c] > cl) res[q * 3 + c] = cl; else if (res[q * 3 + c] < -cl) res[q * 3 + c] = -cl; }
        }
      } else if (np > 0) {
        for (let c = 0; c < 3; c++) { let mv = 0; for (let q = 0; q < np; q++) mv += ptsC[q * 3 + c]; fitA[c] = mv / np; res.fill(0); }
      } else { for (let c = 0; c < 3; c++) fitA[c] = scene.bg[c]; }
      const R2 = R * R;
      for (let yy = -R; yy <= R; yy++) {
        const py = cy + yy; if (py < 0 || py >= h) continue;
        for (let xx = -R; xx <= R; xx++) {
          const px = cx + xx; if (px < 0 || px >= w) continue;
          const d2 = xx * xx + yy * yy; if (d2 > R2) continue;
          const idx = py * w + px; if (own[idx] !== k) continue;
          // fill value
          let f0 = fitA[0] + fitB[0] * xx + fitC[0] * yy, f1 = fitA[1] + fitB[1] * xx + fitC[1] * yy, f2 = fitA[2] + fitB[2] * xx + fitC[2] * yy;
          if (res && np >= 6) {
            let ws = 0, a0 = 0, a1 = 0, a2 = 0;
            for (let q = 0; q < np; q++) { const dx = ptsX[q] - xx, dy = ptsY[q] - yy; const wgt = 1 / (dx * dx + dy * dy + 1.0); ws += wgt; a0 += wgt * res[q * 3]; a1 += wgt * res[q * 3 + 1]; a2 += wgt * res[q * 3 + 2]; }
            f0 += a0 / ws; f1 += a1 / ws; f2 += a2 / ws;
          }
          // grain that matches the sky around the star
          const nz = (rng() + rng() + rng() - 1.5) * 1.6;
          f0 += nz * sd[0] * 0.6; f1 += nz * sd[1] * 0.6; f2 += nz * sd[2] * 0.6;
          const j = idx * 4;
          const o0 = WG_S2L[O[j]], o1 = WG_S2L[O[j + 1]], o2 = WG_S2L[O[j + 2]];
          const rr = Math.sqrt(d2) / R;
          const wnd = rr <= 0.78 ? 1 : (rr >= 1 ? 0 : (() => { const t = (1 - rr) / 0.22; return t * t * (3 - 2 * t); })());
          let r0 = Math.max(0, o0 - Math.max(0, f0)) * wnd, r1 = Math.max(0, o1 - Math.max(0, f1)) * wnd, r2 = Math.max(0, o2 - Math.max(0, f2)) * wnd;
          const pi = ((yy + R) * pd + (xx + R)) * 4;
          if (r0 > 0 || r1 > 0 || r2 > 0) {
            patch[pi] = wgEnc(r0); patch[pi + 1] = wgEnc(r1); patch[pi + 2] = wgEnc(r2);
            S[j] = wgEnc(o0 - r0); S[j + 1] = wgEnc(o1 - r1); S[j + 2] = wgEnc(o2 - r2);
            const lm = Math.max(r0, r1, r2); if (lm > peakL) { peakL = lm; pr = r0; pg = r1; pb = r2; }
          }
          patch[pi + 3] = 255;
        }
      }
      s.amp = Math.min(4, Math.max(0.02, peakL)); const nm = Math.max(pr, pg, pb, 1e-6); s.col = [pr / nm, pg / nm, pb / nm];
      patches[k] = patch;
      if ((k & 63) === 63 && performance.now() - t_start > 30) { await wgYield(); }
    }
    await wgYield();

    // ---------- atlas (shelf packing, gutters so that mip levels never bleed) ----------
    const GUT = 10, AW = 2048;
    let order = []; for (let k = 0; k < nSel; k++) if (!sel[k].drop) order.push(k);
    order.sort((a, b) => (sel[b].R - sel[a].R) || (a - b));
    const place = (n) => {
      let x = GUT, y = GUT, rowH = 0; const pos = new Array(nSel).fill(null);
      for (let q = 0; q < n; q++) {
        const k = order[q], pd = 2 * sel[k].R + 1;
        if (x + pd + GUT > AW) { x = GUT; y += rowH + GUT; rowH = 0; }
        pos[k] = [x, y]; x += pd + GUT; if (pd > rowH) rowH = pd;
      }
      return { pos, H: y + rowH + GUT };
    };
    const nOrd = order.length; let nKeep = nOrd, layout = place(nKeep);
    while (layout.H > 2048 && nKeep > 8) { nKeep = Math.floor(nKeep * 0.92); layout = place(nKeep); }
    let AH = 64; while (AH < layout.H) AH *= 2; AH = Math.min(AH, 2048);
    const atlas = new Uint8Array(AW * AH * 4);
    const keptStars = [];
    for (let q = 0; q < nKeep; q++) {
      const k = order[q], s = sel[k], pd = 2 * s.R + 1, pos = layout.pos[k], patch = patches[k];
      for (let yy = 0; yy < pd; yy++) atlas.set(patch.subarray(yy * pd * 4, (yy + 1) * pd * 4), ((pos[1] + yy) * AW + pos[0]) * 4);
      s.ax = pos[0]; s.ay = pos[1]; s.pd = pd; s.id = keptStars.length; keptStars.push(s);
    }
    // stars that did not fit in the atlas go back onto the plane
    for (let q = nKeep; q < nOrd; q++) {
      const k = order[q], s = sel[k], patch = patches[k], pd = 2 * s.R + 1;
      for (let yy = 0; yy < pd; yy++) for (let xx = 0; xx < pd; xx++) {
        const px = s.cx - s.R + xx, py = s.cy - s.R + yy; if (px < 0 || py < 0 || px >= w || py >= h) continue;
        const pi = (yy * pd + xx) * 4; if (!(patch[pi] | patch[pi + 1] | patch[pi + 2])) continue;
        const j = (py * w + px) * 4; S[j] = O[j]; S[j + 1] = O[j + 1]; S[j + 2] = O[j + 2];
      }
    }
    // rank by brightness (0 = brightest)
    keptStars.sort((a, b) => b.flux - a.flux);
    keptStars.forEach((s, i) => { s.rank = i / Math.max(1, keptStars.length - 1); });
    keptStars.forEach((s, i) => { s.id = i; });
    if (annData) { for (let i = 0, j = 0; i < NPX; i++, j += 4) { if (protect[((i / w | 0) >> 2) * pw4 + ((i % w) >> 2)]) { if (Math.abs(annData[j] - O[j]) + Math.abs(annData[j + 1] - O[j + 1]) + Math.abs(annData[j + 2] - O[j + 2]) > 2) { S[j] = annData[j]; S[j + 1] = annData[j + 1]; S[j + 2] = annData[j + 2]; } } } }
    scene.stars = keptStars; scene.atlas = { w: AW, h: AH, data: atlas };
    scene.info = { ms: performance.now() - t0, sigN, thr, cands: cands.length, found: found.length, selected: nSel, dropped: sel.filter(q => q.drop).length, kept: keptStars.length, atlas: AW + 'x' + AH, sc };
    return scene;
  }

  // ===== WARP GL : WebGL2 renderer (true perspective planes with an extended surround, parallax star field, HDR bloom) =====
  const WG = { gl: null, canvas: null, ok: null, why: '', lost: false, prog: {}, W: 0, H: 0, fb: null, bl: [], A: null, B: null, lat: null, plan: null, planKey: '',
               inst: null, instKey: '', prep: null, imgIds: new WeakMap(), imgSeq: 0, aniso: null, ms: 0, scale: 1, seed: 1, poses: [], tLast: 0, dtAvg: 0, slow: 0, warm: 0, gW: 0, gH: 0 };
  const WG_MAXP = 15;
  const WGT = { beta: 0.30, xTrim: 0.025, thin: 0.5, gain: 0.8, ampCap: 3.0, extDepth: 0.07, extR: 0.9, maxStars: 3200, nearA: [0.15, 0.55], leave0: 0.36, leaveD: 0.08, farA1: [3.5, 9.0], farA2: [6.0, 20.0], occLo: 2.5, occHi: 6.0 };
  const WG_PAL = [[155, 192, 255], [185, 218, 255], [242, 247, 255], [255, 249, 238], [255, 230, 182], [255, 196, 138], [255, 166, 118]];
  const WG_PALW = [0.07, 0.13, 0.22, 0.20, 0.17, 0.13, 0.08];

  // ---------------- GLSL ----------------
  const WG_GLSL_COMMON = `
const float PI = 3.14159265358979;
float extFade(float t){ float u = 1.0 - smoothstep(0.0, ${WGT.extR.toFixed(3)}, t); return u * sqrt(u); }
vec3 srgb2lin(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }
vec3 lin2srgb(vec3 c){ c = max(c, vec3(0.0)); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float erfa(float x){ float s = x < 0.0 ? -1.0 : 1.0; x = abs(x); float t = 1.0 / (1.0 + 0.3275911 * x);
  float y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-x * x); return s * y; }
float cdfn(float x){ return 0.5 + 0.5 * erfa(x * 0.70710678); }
`;
  const WG_VS_FULL = `#version 300 es
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

  const WG_FS_PLANE = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
${WG_GLSL_COMMON}
uniform vec2 uRes;
uniform vec3 uPC, uEX, uEY, uPN;
uniform vec2 uPS;
uniform sampler2D uTex, uTexX, uTexX2;
uniform float uExt, uBlur, uInset, uSeed, uDepth, uXTrim; uniform vec3 uBg;
uniform int uN;
uniform mat3 uR[${WG_MAXP}];
uniform vec3 uO[${WG_MAXP}];
uniform float uF[${WG_MAXP}];
out vec4 oCol;
uniform vec2 uNearF; uniform vec3 uFarF;
bool hitUV(int k, vec2 px, out vec2 uv, out float dep){
  uv = vec2(0.5); dep = 0.0;
  vec3 rc = vec3((px - 0.5 * uRes) / uF[k], 1.0);
  vec3 rw = uR[k] * rc;
  float den = dot(rw, uPN);
  if (abs(den) < 1e-7) return false;
  float t = dot(uPC - uO[k], uPN) / den;
  if (t <= 0.0) return false;
  vec3 h = uO[k] + t * rw - uPC;
  uv = vec2(dot(h, uEX) / uPS.x + 0.5, dot(h, uEY) / uPS.y + 0.5);
  dep = t;
  return true;
}
vec4 shade(vec2 uv, float dep, vec2 dx, vec2 dy){
  vec2 o = max(abs(uv - 0.5) - 0.5, vec2(0.0)) * uPS;
  float d = length(o);
  float nf = smoothstep(uNearF.x, uNearF.y, dep) * (1.0 - uFarF.z * smoothstep(uFarF.x, uFarF.y, dep));
  if (d <= 0.0) return vec4(textureGrad(uTex, uv, dx, dy).rgb - uBg, nf);
  float t = d / uExt;
  float fade = nf * extFade(t);
  if (fade <= 0.0) return vec4(0.0);
  vec2 cl = clamp(uv, 0.0, 1.0), ov = uv - cl;
  vec2 m = cl - sign(ov) * min(abs(ov), vec2(uDepth));
  m = clamp(m, vec2(uInset), vec2(1.0 - uInset));
  vec2 xq = clamp((m - uXTrim) / (1.0 - 2.0 * uXTrim), 0.0, 1.0);
  vec3 soft = mix(texture(uTexX2, xq).rgb, texture(uTexX, xq).rgb, smoothstep(0.02, 0.28, t));      // at the picture's own edge the surround equals the sky just inside it, farther out it relaxes into a wide soft glow
  return vec4(soft - uBg, fade);
}
void main(){
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 uvr; float dr; bool okr = hitUV(uN - 1, px, uvr, dr);
  vec2 dx = dFdx(uvr), dy = dFdy(uvr);
  float gm = max(length(dx), length(dy));
  if (!okr || gm > 0.25 || gm <= 0.0) { dx = vec2(2e-4, 0.0); dy = vec2(0.0, 2e-4); }
  vec3 acc = vec3(0.0); float aw = 0.0;
  if (uN <= 1) {
    vec2 uv; float dp;
    if (hitUV(0, px, uv, dp)) { vec4 s = shade(uv, dp, dx, dy); acc = s.rgb * s.a; aw = s.a; }
  } else {
    float h0 = hash12(px + uSeed);
    vec2 uvPrev; float dPrev; bool okPrev = hitUV(0, px, uvPrev, dPrev);
    for (int k = 1; k < ${WG_MAXP}; k++) {
      if (k >= uN) break;
      vec2 uvNow; float dNow; bool okNow = hitUV(k, px, uvNow, dNow);
      float j = fract(h0 + 0.61803398875 * float(k));
      vec2 u = vec2(0.5); float dd = 0.0; bool ok = false;
      if (okPrev && okNow) { u = mix(uvPrev, uvNow, j); dd = mix(dPrev, dNow, j); ok = true; }
      else if (okNow) { u = uvNow; dd = dNow; ok = true; }
      else if (okPrev) { u = uvPrev; dd = dPrev; ok = true; }
      if (ok) { vec4 s = shade(u, dd, dx, dy); acc += s.rgb * s.a; aw += s.a; }
      uvPrev = uvNow; dPrev = dNow; okPrev = okNow;
    }
    float inv = 1.0 / float(uN - 1);
    acc *= inv; aw *= inv;
  }
  oCol = vec4(acc, aw);
}`;

  const WG_STAR_COMMON = `
uniform vec2 uRes;
uniform vec3 uO0, uO1; uniform mat3 uR0, uR1; uniform float uF0, uF1;
uniform float uBeta; uniform vec3 uU;
uniform vec3 uPlC[2], uPlN[2], uPlX[2], uPlY[2], uPlS[2];
uniform vec2 uNearF; uniform float uGain, uAmpCap; uniform vec3 uRefO[2]; uniform vec2 uPlNear[2]; uniform vec3 uPlFar[2]; uniform vec2 uOccD;
vec3 aberr(vec3 v, vec3 uc, float beta, out float dop){
  float r = length(v); vec3 n = v / max(r, 1e-6);
  dop = 1.0;
  if (beta < 1e-4) return n;
  float c = dot(n, uc); vec3 pe = n - c * uc; float s = length(pe);
  float gam = 1.0 / sqrt(1.0 - beta * beta); float den = 1.0 + beta * c;
  dop = gam * den;
  vec3 e = s > 1e-6 ? pe / s : vec3(0.0);
  return ((c + beta) / den) * uc + (s / (gam * den)) * e;
}
float planeAlpha(int i, vec3 h){
  vec3 r = h - uPlC[i];
  vec2 uv = vec2(dot(r, uPlX[i]) / uPlS[i].x + 0.5, dot(r, uPlY[i]) / uPlS[i].y + 0.5);
  vec2 o = max(abs(uv - 0.5) - 0.5, vec2(0.0)) * uPlS[i].xy;
  float d = length(o); if (d <= 0.0) return 1.0;
  return extFade(d / uPlS[i].z);
}
float occlusion(vec3 P, vec3 O, int skip){
  float o = 1.0; vec3 dir = P - O;
  for (int i = 0; i < 2; i++) {
    if (i == skip) continue;
    float den = dot(dir, uPlN[i]);
    if (abs(den) > 1e-7) { float t = dot(uPlC[i] - O, uPlN[i]) / den; if (t > 0.0 && t < 0.995) { vec3 hh = O + t * dir; float dep = dot(hh - O, uR0[2]); o *= 1.0 - planeAlpha(i, hh) * smoothstep(uPlNear[i].x, uPlNear[i].y, dep) * (1.0 - smoothstep(uOccD.x, uOccD.y, dep)); } }
  }
  return o;
}
float coneMask(vec3 P){                       // no foreground stars between a photograph and the camera that framed it
  float m = 1.0;
  for (int i = 0; i < 2; i++) {
    vec3 dir = P - uRefO[i]; float den = dot(dir, uPlN[i]);
    if (abs(den) > 1e-7) { float t = dot(uPlC[i] - uRefO[i], uPlN[i]) / den; if (t > 1.0) m *= 1.0 - planeAlpha(i, uRefO[i] + t * dir); }
  }
  return m;
}
vec3 tintDoppler(float dop){ return vec3(pow(dop, -0.45), 1.0, pow(dop, 0.45)); }
float starIntegral(float a, float b, float L, float s){
  float Lc = max(L, 0.02);
  return exp(-0.5 * b * b / (s * s)) / (2.5066283 * s) * (cdfn(a / s) - cdfn((a - Lc) / s)) / Lc;
}
`;

  const WG_VS_LAT = `#version 300 es
precision highp float; precision highp int;
${WG_GLSL_COMMON}
${WG_STAR_COMMON}
layout(location = 0) in vec4 aP;
layout(location = 1) in vec4 aS;
layout(location = 2) in vec3 aC;
uniform float uLvlL[6]; uniform vec3 uLvlOff[6]; uniform float uDens, uSigH;
out vec2 vAB; flat out vec4 vA; flat out vec3 vC;
void main(){
  int lv = int(aP.w + 0.5);
  float L = uLvlL[lv];
  vec3 rel = aP.xyz * L + uLvlOff[lv] - uO0;
  rel -= L * floor(rel / L + 0.5);
  vec3 P = uO0 + rel;
  float m = max(max(abs(rel.x), abs(rel.y)), abs(rel.z)) / (0.5 * L);
  float dist = length(rel);
  float fade = (1.0 - smoothstep(0.60, 0.97, m)) * smoothstep(uNearF.x, uNearF.y, dist) * (1.0 - smoothstep(uDens - 0.04, uDens + 0.04, aS.w));
  float dop0, dop1;
  vec3 n0 = aberr((P - uO0) * uR0, uU * uR0, uBeta, dop0);
  vec3 n1 = aberr((P - uO1) * uR1, uU * uR1, uBeta, dop1);
  if (n0.z < 0.04 || n1.z < 0.04 || fade < 0.002) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 s0 = 0.5 * uRes + uF0 * n0.xy / n0.z;
  vec2 s1 = 0.5 * uRes + uF1 * n1.xy / n1.z;
  vec2 dv = s0 - s1; float L2 = length(dv);
  float sgRaw = aS.y * uSigH;
  float sg = sqrt(sgRaw * sgRaw + 0.35);
  float fcs = (sgRaw * sgRaw + 0.02) / (sg * sg);
  float bright = clamp(pow(dop0, 0.8), 0.4, 2.0);
  float oc = occlusion(P, uO0, -1) * coneMask(P);
  float inv = aS.z / max(dist, 1e-3);
  float amp = min(aS.x * inv * inv, uAmpCap) * fcs * fade * oc * bright * uGain;
  float peak = amp / (1.0 + L2 / (2.5 * sg));
  if (L2 > 2200.0 || peak < 0.0016) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float pad = 7.7 * sg + 1.5;
  vec2 tg = L2 > 1e-3 ? dv / L2 : vec2(1.0, 0.0);
  vec2 nm = vec2(-tg.y, tg.x);
  vec2 c = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  float aLoc = mix(-pad, L2 + pad, c.x), bLoc = mix(-pad, pad, c.y);
  vec2 pos = s1 + tg * aLoc + nm * bLoc;
  gl_Position = vec4(pos.x / uRes.x * 2.0 - 1.0, 1.0 - pos.y / uRes.y * 2.0, 0.0, 1.0);
  vAB = vec2(aLoc, bLoc);
  vA = vec4(L2, sg, 0.045, 0.0);
  vC = aC * tintDoppler(dop0) * amp;
}`;
  const WG_FS_STAR = `#version 300 es
precision highp float; precision highp int;
${WG_GLSL_COMMON}
${WG_STAR_COMMON}
in vec2 vAB; flat in vec4 vA; flat in vec3 vC;
out vec4 oCol;
void main(){
  float s = vA.y, s2 = s * 2.4;
  float I = (1.0 - vA.z) * starIntegral(vAB.x, vAB.y, vA.x, s) + vA.z * starIntegral(vAB.x, vAB.y, vA.x, s2);
  oCol = vec4(vC * (I * 6.2831853 * s * s), 0.0);
}`;

  const WG_VS_PATCH = `#version 300 es
precision highp float; precision highp int;
${WG_GLSL_COMMON}
${WG_STAR_COMMON}
layout(location = 0) in vec4 aW;      // world position
layout(location = 1) in vec4 aI;      // amp, sigma (texels), R, flux scale
layout(location = 2) in vec4 aT;      // atlas x, y of the patch centre texel
layout(location = 3) in vec3 aC;      // analytic stand-in colour
uniform vec3 uEXp, uEYp; uniform float uPatchPx, uFref, uRingKeep; uniform int uSkip;
out vec2 vDummy; flat out vec4 vS; flat out vec4 vMi; flat out vec4 vP1; flat out vec4 vAt; flat out vec3 vC; flat out vec3 vD; flat out float vK;
void main(){
  vec3 P = aW.xyz;
  float dop0, dop1;
  vec3 n0 = aberr((P - uO0) * uR0, uU * uR0, uBeta, dop0);
  vec3 n1 = aberr((P - uO1) * uR1, uU * uR1, uBeta, dop1);
  float dist = length(P - uO0);
  float near = smoothstep(uPlNear[uSkip].x, uPlNear[uSkip].y, dist) * (1.0 - uPlFar[uSkip].z * smoothstep(uPlFar[uSkip].x, uPlFar[uSkip].y, dist));      // stars of a photograph dissolve together with it
  float fr = aW.w / max(dist, 1e-3);
  float fall = min(fr * fr, 4.0);
  float oc = occlusion(P, uO0, uSkip);
  float keep = aT.z > 0.5 ? 1.0 - smoothstep(uRingKeep - 0.04, uRingKeep + 0.04, aT.z - 1.0) : 1.0;      // clones that continue the star field thin out in the warp together with the added stars
  float K = near * fall * oc * aI.w * uGain * keep * clamp(pow(dop0, 0.8), 0.4, 2.0);
  if (n0.z < 0.04 || n1.z < 0.04 || K < 0.0012) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 s0 = 0.5 * uRes + uF0 * n0.xy / n0.z;
  vec2 s1 = 0.5 * uRes + uF1 * n1.xy / n1.z;
  float L2 = distance(s0, s1);
  if (L2 > 2200.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  // plane axes at the star -> affine map patch texel -> screen
  vec3 pe = (P + uEXp * 0.003 - uO0) * uR0; vec3 pf = (P + uEYp * 0.003 - uO0) * uR0;
  vec2 se = 0.5 * uRes + uF0 * pe.xy / max(pe.z, 0.01), sf = 0.5 * uRes + uF0 * pf.xy / max(pf.z, 0.01);
  vec2 sc0 = 0.5 * uRes + uF0 * ((P - uO0) * uR0).xy / max(((P - uO0) * uR0).z, 0.01);
  float sc = uPatchPx * uF0 / uFref;
  vec2 ax = normalize(se - sc0 + vec2(1e-6, 0.0)) * sc, ay = normalize(sf - sc0 + vec2(0.0, 1e-6)) * sc;
  float det = ax.x * ay.y - ax.y * ay.x; if (abs(det) < 1e-9) det = 1e-9;
  vMi = vec4(ay.y, -ay.x, -ax.y, ax.x) / det;
  float R = aI.z;
  float sgR = aI.y * sc;
  float sg = sqrt(sgR * sgR + 0.35);
  float fcs = (sgR * sgR + 0.02) / (sg * sg);
  float lod = clamp(-log2(max(sc, 1e-3)), 0.0, 3.0);
  float wA = smoothstep(2.0, 4.5, L2);
  float ext = (R + 1.0) * 1.5 * sc + 2.0 + 7.7 * sg * wA;
  vec2 lo = min(s0, s1) - ext, hi = max(s0, s1) + ext;
  vec2 c = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  vec2 pos = mix(lo, hi, c);
  gl_Position = vec4(pos.x / uRes.x * 2.0 - 1.0, 1.0 - pos.y / uRes.y * 2.0, 0.0, 1.0);
  vDummy = pos; vS = vec4(s0, s1); vP1 = vec4(R, lod, wA, sg); vAt = aT; vK = K;
  vC = aC * aI.x * fcs; vD = tintDoppler(dop0);
}`;
  const WG_FS_PATCH = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
${WG_GLSL_COMMON}
${WG_STAR_COMMON}
uniform sampler2D uAtlas; uniform vec2 uAtlasSize;
in vec2 vDummy; flat in vec4 vS; flat in vec4 vMi; flat in vec4 vP1; flat in vec4 vAt; flat in vec3 vC; flat in vec3 vD; flat in float vK;
out vec4 oCol;
void main(){
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 s0 = vS.xy, s1 = vS.zw; float L = distance(s0, s1);
  vec3 col = vec3(0.0);
  if (vP1.z < 0.999) {
    int T = int(clamp(ceil(L / 1.2), 1.0, 5.0));
    vec3 pc = vec3(0.0);
    for (int t = 0; t < 5; t++) {
      if (t >= T) break;
      vec2 q = px - mix(s1, s0, (float(t) + 0.5) / float(T));
      vec2 ij = vec2(vMi.x * q.x + vMi.y * q.y, vMi.z * q.x + vMi.w * q.y);
      if (abs(ij.x) <= vP1.x + 0.5 && abs(ij.y) <= vP1.x + 0.5) pc += textureLod(uAtlas, (vAt.xy + ij) / uAtlasSize, vP1.y).rgb;
    }
    col += (1.0 - vP1.z) * pc / float(T);
  }
  if (vP1.z > 0.001) {
    vec2 dv = s0 - s1; vec2 tg = L > 1e-3 ? dv / L : vec2(1.0, 0.0); vec2 nm = vec2(-tg.y, tg.x);
    vec2 r = px - s1; float a = dot(r, tg), b = dot(r, nm);
    float s = vP1.w, s2 = s * 2.4;
    float I = 0.955 * starIntegral(a, b, L, s) + 0.045 * starIntegral(a, b, L, s2);
    col += vP1.z * vC * (I * 6.2831853 * s * s);
  }
  oCol = vec4(col * vD * vK, 0.0);
}`;

  const WG_FS_DOWN = `#version 300 es
precision highp float; precision highp sampler2D;
uniform sampler2D uSrc; uniform vec2 uSrcTexel; uniform vec2 uDst; uniform float uThr; uniform int uFirst;
out vec4 oCol;
vec3 tap(vec2 uv){
  vec3 c = texture(uSrc, uv).rgb;
  if (uFirst == 1) { float l = max(c.r, max(c.g, c.b)); float k = max(l - uThr, 0.0); c *= k / max(l, 1e-4); }
  return c;
}
void main(){
  vec2 uv = gl_FragCoord.xy / uDst; vec2 t = uSrcTexel;
  vec3 a = tap(uv + t * vec2(-2.0, -2.0)), b = tap(uv + t * vec2(0.0, -2.0)), c = tap(uv + t * vec2(2.0, -2.0));
  vec3 d = tap(uv + t * vec2(-2.0, 0.0)), e = tap(uv), f = tap(uv + t * vec2(2.0, 0.0));
  vec3 g = tap(uv + t * vec2(-2.0, 2.0)), h = tap(uv + t * vec2(0.0, 2.0)), i = tap(uv + t * vec2(2.0, 2.0));
  vec3 j = tap(uv + t * vec2(-1.0, -1.0)), k = tap(uv + t * vec2(1.0, -1.0)), l = tap(uv + t * vec2(-1.0, 1.0)), m = tap(uv + t * vec2(1.0, 1.0));
  oCol = vec4(e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125, 1.0);
}`;
  const WG_FS_COMP = `#version 300 es
precision highp float; precision highp sampler2D;
${WG_GLSL_COMMON}
uniform sampler2D uScene, uB1, uB2, uB3, uB4, uB5;
uniform vec2 uRes; uniform float uBloom, uVig, uGrain, uSeed, uExposure; uniform vec3 uTint, uSky;
out vec4 oCol;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = texture(uScene, uv).rgb;
  vec3 bl = 0.22 * texture(uB1, uv).rgb + 0.26 * texture(uB2, uv).rgb + 0.24 * texture(uB3, uv).rgb + 0.18 * texture(uB4, uv).rgb + 0.12 * texture(uB5, uv).rgb;
  c += bl * uBloom * uTint;
  c += uSky;
  c *= uExposure;
  vec2 q = uv - 0.5; q.x *= uRes.x / uRes.y;
  c *= 1.0 - uVig * smoothstep(0.30, 1.05, length(q));
  float mx = max(c.r, max(c.g, c.b));
  if (mx > 1.0) c *= (1.0 + 0.5 * (1.0 - exp(-(mx - 1.0) / 0.5))) / mx;
  vec3 s = lin2srgb(c);
  float lum = dot(s, vec3(0.299, 0.587, 0.114));
  float n = hash12(gl_FragCoord.xy + uSeed * 17.31) + hash12(gl_FragCoord.xy * 1.37 + uSeed * 31.7) - 1.0;
  s += n * (uGrain * (0.35 + 0.65 * lum) + 0.0016);
  oCol = vec4(clamp(s, 0.0, 1.0), 1.0);
}`;

  // ---------------- context, programs, buffers ----------------
  function wgProg(gl, vs, fs, name) {
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(name + ': ' + gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(name + ' link: ' + gl.getProgramInfoLog(p));
    p.u = {}; p.nm = name; return p;
  }
  function wgU(p, n) { if (!(n in p.u)) p.u[n] = WG.gl.getUniformLocation(p, n); return p.u[n]; }

  function wgInit() {
    if (WG.ok !== null) return WG.ok;
    try {
      const c = document.createElement('canvas'); c.width = 64; c.height = 64;
      const gl = c.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
      if (!gl) throw new Error('WebGL2 is not available');
      if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) throw new Error('no float render targets');
      gl.getExtension('OES_texture_float_linear');
      WG.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
      // a half-float target must be complete
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 4, 4, 0, gl.RGBA, gl.HALF_FLOAT, null);
      const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      const okf = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(f); gl.deleteTexture(t);
      if (!okf) throw new Error('RGBA16F target incomplete');
      WG.gl = gl; WG.canvas = c;
      c.addEventListener('webglcontextlost', e => { e.preventDefault(); WG.lost = true; });
      c.addEventListener('webglcontextrestored', () => { wgReset(); });
      WG.prog.plane = wgProg(gl, WG_VS_FULL, WG_FS_PLANE, 'plane');
      WG.prog.lat = wgProg(gl, WG_VS_LAT, WG_FS_STAR, 'lattice');
      WG.prog.patch = wgProg(gl, WG_VS_PATCH, WG_FS_PATCH, 'patch');
      WG.prog.down = wgProg(gl, WG_VS_FULL, WG_FS_DOWN, 'down');
      WG.prog.comp = wgProg(gl, WG_VS_FULL, WG_FS_COMP, 'comp');
      WG.vaoEmpty = gl.createVertexArray();
      WG.ok = true;
    } catch (e) { WG.ok = false; WG.why = String(e && e.message ? e.message : e); try { console.warn('[warp-gl] unavailable:', WG.why); } catch (_) { /* ignore */ } }
    return WG.ok;
  }
  function wgReset() {
    WG.ok = null; WG.lost = false; WG.A = null; WG.B = null; WG.lat = null; WG.inst = null; WG.instKey = ''; WG.fb = null; WG.bl = []; WG.W = 0; WG.H = 0; WG.prog = {}; WG.prep = null;
  }

  function wgMakeTarget(gl, w, h) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteTexture(t);
      gl.deleteFramebuffer(f);
      throw new Error('The 3D render buffer could not be allocated.');
    }
    return { tex: t, fbo: f, w, h };
  }

  function wgReleaseTargets() {
    const { gl, fb, bl } = WG;
    if (!gl || (!fb && !WG.W)) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    for (const target of [fb, ...bl]) {
      if (!target) continue;
      gl.deleteFramebuffer(target.fbo);
      gl.deleteTexture(target.tex);
    }
    WG.fb = null;
    WG.bl = [];
    WG.W = WG.H = 0;
    releaseReelCanvas(WG.canvas);
  }

  function wgEnsureTargets(W, H) {
    const gl = WG.gl;
    if (WG.fb && WG.W === W && WG.H === H) return;
    wgReleaseTargets();
    WG.canvas.width = W; WG.canvas.height = H; WG.W = W; WG.H = H;
    if (gl.drawingBufferWidth !== W || gl.drawingBufferHeight !== H) {
      throw new Error('The GPU cannot render at this size.');
    }
    WG.fb = wgMakeTarget(gl, W, H);
    WG.bl = [];
    for (let i = 0; i < 5; i++) WG.bl.push(wgMakeTarget(gl, Math.max(2, W >> (i + 1)), Math.max(2, H >> (i + 1))));
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function wgTexParams(gl, mip) {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (mip && WG.aniso) gl.texParameterf(gl.TEXTURE_2D, WG.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(WG.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  }
  function wgBuildExt(sc) {                       // small, blurred, border-trimmed copy of the starless photograph (linear light)
    const gl = WG.gl, w = sc.w, h = sc.h, S = sc.S, L = WG_S2L;
    const asp = w / h, SW = 112, ew = asp >= 1 ? SW : Math.max(16, Math.round(SW * asp)), eh = asp >= 1 ? Math.max(16, Math.round(SW / asp)) : SW;
    const trim = WGT.xTrim, x0 = Math.round(trim * w), x1 = Math.round((1 - trim) * w), y0 = Math.round(trim * h), y1 = Math.round((1 - trim) * h), cw = x1 - x0, ch = y1 - y0;
    const acc = new Float32Array(ew * eh * 3), cnt = new Float32Array(ew * eh), st = Math.max(1, Math.floor(Math.max(w, h) / 1400));
    for (let y = y0; y < y1; y += st) {
      const ey = Math.min(eh - 1, ((y - y0) * eh / ch) | 0);
      for (let x = x0; x < x1; x += st) {
        const ex = Math.min(ew - 1, ((x - x0) * ew / cw) | 0), k = (y * w + x) * 4, o = ey * ew + ex;
        acc[o * 3] += L[S[k]]; acc[o * 3 + 1] += L[S[k + 1]]; acc[o * 3 + 2] += L[S[k + 2]]; cnt[o]++;
      }
    }
    const buf = new Float32Array(ew * eh * 3);
    for (let i = 0; i < ew * eh; i++) for (let c = 0; c < 3; c++) {
      let v = cnt[i] ? acc[i * 3 + c] / cnt[i] : sc.bg[c];
      if (v > 0.06) v = 0.06 + (v - 0.06) / (1 + (v - 0.06) * 8);       // bright features at the border do not spill into space
      buf[i * 3 + c] = v;
    }
    const tmp = new Float32Array(ew * eh * 3);
    {                                                                       // grey opening: features smaller than ~12% of the picture (text, watermarks, bright knots) do not leak into the surround
      const re = Math.max(2, Math.round(0.055 * Math.min(ew, eh)));
      const pass = (src, dst, horiz, useMax) => {
        const n1 = horiz ? ew : eh, n2 = horiz ? eh : ew;
        for (let q = 0; q < n2; q++) for (let i = 0; i < n1; i++) for (let c = 0; c < 3; c++) {
          let m = useMax ? -1 : 1e9;
          for (let k = -re; k <= re; k++) { const j = Math.min(n1 - 1, Math.max(0, i + k)), v = src[(horiz ? q * ew + j : j * ew + q) * 3 + c]; if (useMax ? v > m : v < m) m = v; }
          dst[(horiz ? q * ew + i : i * ew + q) * 3 + c] = m;
        }
      };
      pass(buf, tmp, true, false); pass(tmp, buf, false, false); pass(buf, tmp, true, true); pass(tmp, buf, false, true);
    }
    const boxBlur = (srcBuf, r, passes) => {
      const a = new Float32Array(srcBuf), b = new Float32Array(ew * eh * 3), n = 2 * r + 1;
      for (let pass = 0; pass < passes; pass++) {
        for (let y = 0; y < eh; y++) for (let x = 0; x < ew; x++) for (let c = 0; c < 3; c++) {
          let v = 0; for (let k = -r; k <= r; k++) { const xx = Math.min(ew - 1, Math.max(0, x + k)); v += a[(y * ew + xx) * 3 + c]; } b[(y * ew + x) * 3 + c] = v / n;
        }
        for (let y = 0; y < eh; y++) for (let x = 0; x < ew; x++) for (let c = 0; c < 3; c++) {
          let v = 0; for (let k = -r; k <= r; k++) { const yy = Math.min(eh - 1, Math.max(0, y + k)); v += b[(yy * ew + x) * 3 + c]; } a[(y * ew + x) * 3 + c] = v / n;
        }
      }
      return a;
    };
    const makeTex = (arr) => {
      const bytes = new Uint8Array(ew * eh * 4);
      for (let i = 0; i < ew * eh; i++) { bytes[i * 4] = wgEnc(arr[i * 3]); bytes[i * 4 + 1] = wgEnc(arr[i * 3 + 1]); bytes[i * 4 + 2] = wgEnc(arr[i * 3 + 2]); bytes[i * 4 + 3] = 255; }
      const tx = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tx);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, ew, eh, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      wgTexParams(gl, false);
      return tx;
    };
    sc.texX = makeTex(boxBlur(buf, Math.max(1, Math.round(0.075 * Math.min(ew, eh))), 2));        // wide: the far surround
    sc.texX2 = makeTex(boxBlur(buf, Math.max(1, Math.round(0.02 * Math.min(ew, eh))), 2));        // narrow: the surround right next to the picture's edge (no brightness step at the border)
  }
  function wgUploadSceneTextures(sc) {
    const gl = WG.gl;
    wgBuildExt(sc);
    sc.texS = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, sc.texS);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, sc.w, sc.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, sc.S);
    gl.generateMipmap(gl.TEXTURE_2D); wgTexParams(gl, true);
    sc.texAt = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, sc.texAt);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, sc.atlas.w, sc.atlas.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, sc.atlas.data);
    gl.generateMipmap(gl.TEXTURE_2D); wgTexParams(gl, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    sc.S = null; sc.atlas.data = null;                                    // the GPU has them now
  }
  function wgFreeScene(sc) { if (!sc || !WG.gl) return; try { if (sc.texX) WG.gl.deleteTexture(sc.texX); if (sc.texX2) WG.gl.deleteTexture(sc.texX2); if (sc.texS) WG.gl.deleteTexture(sc.texS); if (sc.texAt) WG.gl.deleteTexture(sc.texAt); if (sc.vbo) WG.gl.deleteBuffer(sc.vbo); if (sc.vao) WG.gl.deleteVertexArray(sc.vao); } catch (e) { /* ignore */ } }

  // ---------------- the star lattice (nested periodic cells -> stars at every distance, never at infinity) ----------------
  const WG_LEVELS = [{ L: 2.2, N: 170 }, { L: 5, N: 430 }, { L: 11, N: 1150 }, { L: 24, N: 2900 }, { L: 52, N: 7200 }, { L: 112, N: 16500 }];
  function wgBuildLattice() {
    const gl = WG.gl, rng = wgRng(20240611);
    let n = 0; WG_LEVELS.forEach(l => { n += l.N; });
    const data = new Float32Array(n * 11); let o = 0;
    const lin = (v) => WG_S2L[v];
    WG_LEVELS.forEach((lv, li) => {
      for (let i = 0; i < lv.N; i++) {
        let sp = 0, r = rng(), a = 0; for (let k = 0; k < 7; k++) { a += WG_PALW[k]; if (r < a) { sp = k; break; } sp = 6; }
        const pal = WG_PAL[sp];
        const u = rng();
        const amp = Math.min(1.35, 0.30 * Math.pow(1 - u * 0.985, -1 / 1.6));
        const sig = 0.00064 + 0.00026 * Math.log(1 + amp * 5);
        data[o++] = rng(); data[o++] = rng(); data[o++] = rng(); data[o++] = li;
        data[o++] = amp; data[o++] = sig; data[o++] = 0.5 * lv.L; data[o++] = Math.min(1, Math.max(0, 1 - u + 0.04 * (rng() - 0.5)));
        data[o++] = lin(pal[0]); data[o++] = lin(pal[1]); data[o++] = lin(pal[2]);
      }
    });
    const off = new Float32Array(6 * 3); for (let i = 0; i < 18; i++) off[i] = rng() * 100;
    // extra faint stars (rank > 1, so the default density never draws them): used by the "2200 ★" density option
    const rngX = wgRng(77123); let nx = 0; WG_LEVELS.forEach(l => { nx += Math.round(0.45 * l.N); });
    const dataX = new Float32Array((n + nx) * 11); dataX.set(data); o = n * 11;
    WG_LEVELS.forEach((lv, li) => {
      const cnt = Math.round(0.45 * lv.N);
      for (let i = 0; i < cnt; i++) {
        let sp = 0, r = rngX(), a = 0; for (let k = 0; k < 7; k++) { a += WG_PALW[k]; if (r < a) { sp = k; break; } sp = 6; }
        const pal = WG_PAL[sp];
        const ue = 0.4 * rngX();
        const amp = Math.min(1.35, 0.30 * Math.pow(1 - ue * 0.985, -1 / 1.6));
        const sig = 0.00064 + 0.00026 * Math.log(1 + amp * 5);
        dataX[o++] = rngX(); dataX[o++] = rngX(); dataX[o++] = rngX(); dataX[o++] = li;
        dataX[o++] = amp; dataX[o++] = sig; dataX[o++] = 0.5 * lv.L; dataX[o++] = 1.06 + 0.34 * (1 - ue / 0.4);
        dataX[o++] = lin(pal[0]); dataX[o++] = lin(pal[1]); dataX[o++] = lin(pal[2]);
      }
    });
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, dataX, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 44, 0); gl.vertexAttribDivisor(0, 1);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 44, 16); gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 44, 32); gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);
    WG.lat = { vao, vbo, n, nAll: n + nx, off, L: new Float32Array(WG_LEVELS.map(l => l.L)) };
  }

  // ---------------- lifted stars of a photograph (+ clones that continue the star field into the surround) ----------------
  function wgDepth(rank, rng, zr) { const t = 0.62 * Math.pow(1 - rank, 0.7) + 0.38 * rng(); return 1 - zr * t; }
  // geo: { ref:[3], c:[3], ex:[3], ey:[3], w, h, ext }
  function wgBuildPlaneInstances(sc, geo, zr, seed) {
    const gl = WG.gl, rng = wgRng(seed);
    const stars = sc.stars, ns = stars.length;
    // the star field of the photograph carries on past its edge with the same density, brightness and colours, and thins out gradually: no visible window
    const rho0 = ns / (geo.w * geo.h), dmax = 1.12 * WGT.extR * geo.ext, dens = (t) => { const x = Math.min(1, Math.max(0, t)), u = 1 - x * x * (3 - 2 * x); return u * Math.sqrt(u); };      // the same fall-off as the plane's own fade: the added star lattice is masked by exactly this, so the two densities cross-fade (no ring of extra stars around the picture)
    let area = 0; { const K = 160; for (let i = 0; i < K; i++) { const d = (i + 0.5) / K * dmax; area += dens(d / (WGT.extR * geo.ext)) * (2 * (geo.w + geo.h) + 2 * Math.PI * d) * dmax / K; } }
    const baked = sc.info && sc.info.found > ns ? sc.info.found - ns : 0;                                                    // stars left in the plane itself (too faint to lift)
    const nBright = ns ? Math.min(6500, Math.round(1.0 * rho0 * area)) : 0, nFaint = ns ? Math.min(3200, Math.round(0.5 * baked / (geo.w * geo.h) * area)) : 0;
    const total = ns + nBright + nFaint, data = new Float32Array(Math.max(1, total) * 15); let o = 0;
    const pushStar = (s, X, Y, rank, flux, rr) => {
      const zl = wgDepth(rank, rng, zr);
      const px = geo.c[0] + geo.ex[0] * X + geo.ey[0] * Y, py = geo.c[1] + geo.ex[1] * X + geo.ey[1] * Y, pz = geo.c[2] + geo.ex[2] * X + geo.ey[2] * Y;
      const rx = px - geo.ref[0], ry = py - geo.ref[1], rz = pz - geo.ref[2];
      data[o++] = geo.ref[0] + zl * rx; data[o++] = geo.ref[1] + zl * ry; data[o++] = geo.ref[2] + zl * rz; data[o++] = zl * Math.hypot(rx, ry, rz);
      data[o++] = s.amp; data[o++] = s.fwhm / 2.355; data[o++] = s.R; data[o++] = flux;
      data[o++] = s.ax + s.R + 0.5; data[o++] = s.ay + s.R + 0.5; data[o++] = rr === undefined ? 0 : 1 + rr; data[o++] = 0;
      data[o++] = s.col[0]; data[o++] = s.col[1]; data[o++] = s.col[2];
    };
    for (let i = 0; i < ns; i++) {
      const s = stars[i]; const X = ((s.cx + 0.5) / sc.w - 0.5) * geo.w, Y = ((s.cy + 0.5) / sc.h - 0.5) * geo.h;
      pushStar(s, X, Y, s.rank, 1);
    }
    const ring = (count, pickStar, fluxOf) => {
      let made = 0, guard = 0;
      while (made < count && guard++ < count * 120) {
        const X = (rng() - 0.5) * (geo.w + 2 * dmax), Y = (rng() - 0.5) * (geo.h + 2 * dmax);
        const dx = Math.max(Math.abs(X) - geo.w / 2, 0), dy = Math.max(Math.abs(Y) - geo.h / 2, 0), d = Math.hypot(dx, dy);
        if (d <= 0) continue;
        const t = d / (WGT.extR * geo.ext);
        if (rng() > dens(t)) continue;
        pushStar(pickStar(), X, Y, rng(), fluxOf(t), rng()); made++;
      }
    };
    if (ns) {
      const b0 = Math.min(ns - 1, 16);                                                                                                  // the few brightest stars stay unique
      ring(nBright, () => stars[b0 + ((rng() * (ns - b0)) | 0)], (t) => (0.85 + 0.3 * rng()) * (1 - 0.5 * Math.min(1, Math.max(0, (t - 0.55) / 0.6))));                          // the photograph's own brightness distribution
      const f0 = Math.floor(ns * 0.55);
      ring(nFaint, () => stars[f0 + ((rng() * (ns - f0)) | 0)], (t) => (0.25 + 0.5 * rng()) * (1 - 0.5 * Math.min(1, Math.max(0, (t - 0.55) / 0.6))));              // the faint end carries on below the lifted list
    }
    const n = o / 15;
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, o), gl.STATIC_DRAW);
    [[0, 4, 0], [1, 4, 16], [2, 4, 32], [3, 3, 48]].forEach(a => { gl.enableVertexAttribArray(a[0]); gl.vertexAttribPointer(a[0], a[1], gl.FLOAT, false, 60, a[2]); gl.vertexAttribDivisor(a[0], 1); });
    gl.bindVertexArray(null);
    return { vao, vbo, n };
  }

  // ---------------- sources (the app's photo, the arrival photo) ----------------
  function wgImgId() { const im = state.img; if (!im) return 0; let id = WG.imgIds.get(im); if (!id) { id = ++WG.imgSeq; WG.imgIds.set(im, id); } return id; }
  function wgStrHash(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36); }
  function reelPreviewTextureLimit() { return annIsTouchDevice() || reelHasLimitedMemory() ? 1920 : 3072; }
  function wgCap() { return Math.min(WG.gl ? WG.gl.getParameter(WG.gl.MAX_TEXTURE_SIZE) : 4096, reelExportProfile?.sourceEdge || reelPreviewTextureLimit()); }
  function wgKeyA() {
    let ann = '';
    try { if (state.annotations && state.annotations.length) ann = wgStrHash(JSON.stringify(state.annotations)); } catch (e) { ann = 'x'; }
    return ['A', wgImgId(), state.rot90, state.fineAngle, ann].join('|');
  }
  function wgSourceA(cap) {
    const dims = getTransformedDims();
    const sc = Math.min(1, cap / Math.max(dims.w, dims.h), Math.sqrt(8e6 / (dims.w * dims.h)));
    const w = Math.max(64, Math.round(dims.w * sc)), h = Math.max(64, Math.round(dims.h * sc));
    const mk = (withAnn) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      drawSourceTransformed(x, w / 2, h / 2, sc, withAnn);
      return c;
    };
    const clean = mk(false);
    const ann = state.annotations && state.annotations.length ? mk(true) : null;
    try { wgRemoveFrameLines(clean, ann ? [ann] : []); } catch (e) { /* the photograph stays as it is */ }
    return { clean, ann, w, h };
  }
  function wgKeyB(aKey, dimTag) {
    const own = state.reelDest && state.reelDest.canvas ? state.reelDest : null;
    return own ? ['B', own.id, state.reelFraming === 'original' ? dimTag : ''].join('|') : ['Bm', aKey].join('|');
  }
  function wgSourceB(cap, A) {
    const own = state.reelDest && state.reelDest.canvas ? state.reelDest : null;
    let tex, aim;
    if (own) {
      const srcC = own.canvas; let sx = 0, sy = 0, sw = srcC.width, sh = srcC.height;
      const sm = document.createElement('canvas'); sm.width = 48; sm.height = Math.max(8, Math.round(48 * sh / sw));
      const sx2 = sm.getContext('2d', { willReadFrequently: true }); sx2.imageSmoothingEnabled = true; sx2.imageSmoothingQuality = 'high'; sx2.drawImage(srcC, 0, 0, sm.width, sm.height);
      let ax = 0.5, ay = 0.5;
      try {
        const d = sx2.getImageData(0, 0, sm.width, sm.height).data; let mx = 0, my = 0, ms = 0;
        for (let j = 0; j < sm.height; j++) for (let i = 0; i < sm.width; i++) {
          const nx = (i + 0.5) / sm.width, ny = (j + 0.5) / sm.height;
          if (nx < 0.15 || nx > 0.85 || ny < 0.15 || ny > 0.85) continue;
          const k = (j * sm.width + i) * 4, l = (d[k] * 0.3 + d[k + 1] * 0.59 + d[k + 2] * 0.11) / 255, w = l * l * l;
          mx += nx * w; my += ny * w; ms += w;
        }
        if (ms > 1e-6) { ax = 0.5 + wgClampN((mx / ms - 0.5) * 0.6, -0.14, 0.14); ay = 0.5 + wgClampN((my / ms - 0.5) * 0.6, -0.14, 0.14); }
      } catch (e) { /* keep the centre */ }
      if (state.reelFraming === 'original') {                       // the video frame follows the main photo: crop the arrival photo to the same shape
        const ta = A.w / A.h, sa = sw / sh;
        if (sa > ta) { sw = sh * ta; sx = wgClampN(ax * srcC.width - sw / 2, 0, srcC.width - sw); }
        else { sh = sw / ta; sy = wgClampN(ay * srcC.height - sh / 2, 0, srcC.height - sh); }
        ax = 0.5 + (ax - (sx + sw / 2) / srcC.width) * (srcC.width / sw); ay = 0.5 + (ay - (sy + sh / 2) / srcC.height) * (srcC.height / sh);
        ax = wgClampN(ax, 0.36, 0.64); ay = wgClampN(ay, 0.36, 0.64);
      }
      const sc = Math.min(1, cap / Math.max(sw, sh), Math.sqrt(8e6 / (sw * sh)));
      tex = document.createElement('canvas'); tex.width = Math.max(64, Math.round(sw * sc)); tex.height = Math.max(64, Math.round(sh * sc));
      const tx = tex.getContext('2d', { willReadFrequently: true }); tx.imageSmoothingEnabled = true; tx.imageSmoothingQuality = 'high';
      tx.drawImage(srcC, sx, sy, sw, sh, 0, 0, tex.width, tex.height);
      try { wgRemoveFrameLines(tex, []); } catch (e) { /* the photograph stays as it is */ }
      aim = [ax, ay];
    } else {                                                           // no arrival photo: a mirrored copy of the main photo (without annotations)
      tex = document.createElement('canvas'); tex.width = A.w; tex.height = A.h;
      const tx = tex.getContext('2d', { willReadFrequently: true }); tx.translate(tex.width, 0); tx.scale(-1, 1); tx.drawImage(A.clean, 0, 0);
      aim = [wgClampN(1 - state.reelTargetX, 0.3, 0.7), wgClampN(state.reelTargetY, 0.3, 0.7)];
    }
    return { clean: tex, ann: null, w: tex.width, h: tex.height, aim, mirrored: !own };
  }

  // ---------------- preparation (async, runs once per photo) ----------------
  function wgPrepKeys() {
    const cap = wgCap(), kA = wgKeyA(), dims = getTransformedDims();
    return { cap, kA, kB: wgKeyB(kA, Math.round(dims.w) + 'x' + Math.round(dims.h)) };
  }
  function wgHave(k) { const A = WG.A, B = WG.B; return !!(A && B && A.key === k.kA && B.key === k.kB && A.cap >= k.cap && B.cap >= k.cap); }
  function wgKick() {
    const k = wgPrepKeys(), jobKey = k.kA + '#' + k.kB + '#' + k.cap;
    WG.want = k;                                                       // the latest request: a slower, older preparation must not replace a scene that already matches it
    if (WG.prep && WG.prep.key === jobKey) return WG.prep.promise;
    const job = { key: jobKey, done: false };
    job.promise = (async () => {
      let srcA, srcB;
      try {
        let a = WG.A && WG.A.key === k.kA && WG.A.cap >= k.cap ? WG.A : null;
        if (!a) {
          srcA = wgSourceA(k.cap);
          const sc = await wgBuildScene(srcA.clean, { annCanvas: srcA.ann, maxStars: WGT.maxStars });
          wgUploadSceneTextures(sc); a = sc; a.key = k.kA; a.cap = k.cap;
        }
        let b = WG.B && WG.B.key === k.kB && WG.B.cap >= k.cap ? WG.B : null;
        if (!b) {
          if (!srcA) srcA = wgSourceA(k.cap);
          srcB = wgSourceB(k.cap, srcA);
          const sc = await wgBuildScene(srcB.clean, { maxStars: WGT.maxStars });
          wgUploadSceneTextures(sc); b = sc; b.key = k.kB; b.cap = k.cap; b.aim = srcB.aim; b.mirrored = srcB.mirrored;
        }
        if (!WG.lat) wgBuildLattice();
        const want = WG.want || k;
        const take = (cur, nw, wantKey) => !cur || (nw !== cur && nw.key === wantKey && !(cur.key === wantKey && cur.cap >= nw.cap));
        if (a !== WG.A) { if (take(WG.A, a, want.kA)) { if (WG.A) wgFreeScene(WG.A); WG.A = a; } else wgFreeScene(a); }
        if (b !== WG.B) { if (take(WG.B, b, want.kB)) { if (WG.B) wgFreeScene(WG.B); WG.B = b; } else wgFreeScene(b); }
        WG.instKey = '';
        job.done = true; WG.warm = Math.max(WG.warm, 30);
        if (typeof WG.onReady === 'function') WG.onReady();
      } catch (e) { WG.ok = false; WG.why = 'prepare: ' + (e && e.message ? e.message : e); try { console.warn('[warp-gl]', WG.why, e); } catch (_) { /* ignore */ } }
      finally {
        releaseReelCanvas(srcA?.clean);
        releaseReelCanvas(srcA?.ann);
        releaseReelCanvas(srcB?.clean);
        if (WG.prep === job) WG.prep = null;
      }
    })();
    WG.prep = job; return job.promise;
  }
  async function wgEnsureReady() {
    if (WG.lost || !wgInit()) return false;
    const k = wgPrepKeys();
    if (wgHave(k)) return true;
    await wgKick();
    return !!(WG.ok && wgHave(k));
  }

  // ---------------- per-frame ----------------
  function wgPose(P, pp, F0, out) {
    const c = wgCamera(P, wgClamp(pp, 0, 1), out);
    const warp = wgSmooth((c.speed - 0.04) / 0.86);
    c.warp = warp; c.F = F0 / (1 + 0.06 * warp);
    return c;
  }
  function wgProj(c, W, H, x, y, z) {                   // world point -> pixel (null when behind the camera)
    const dx = x - c.pos[0], dy = y - c.pos[1], dz = z - c.pos[2], R = c.R;
    const vx = dx * R[0] + dy * R[3] + dz * R[6], vy = dx * R[1] + dy * R[4] + dz * R[7], vz = dx * R[2] + dy * R[5] + dz * R[8];
    if (vz < 0.03) return null;
    return [W / 2 + c.F * vx / vz, H / 2 + c.F * vy / vz, vz];
  }
  function wgMat3Cols(R, out, o) { out[o] = R[0]; out[o + 1] = R[3]; out[o + 2] = R[6]; out[o + 3] = R[1]; out[o + 4] = R[4]; out[o + 5] = R[7]; out[o + 6] = R[2]; out[o + 7] = R[5]; out[o + 8] = R[8]; }

  function wgAimB(B) { return B.mirrored ? [wgClampN(1 - state.reelTargetX, 0.3, 0.7), wgClampN(state.reelTargetY, 0.3, 0.7)] : B.aim; }
  function wgEnsurePlan(W, H, kind) {
    const A = WG.A, B = WG.B, aimB = wgAimB(B);
    const layA = getReelImageLayout(W, H, A.w, A.h), layB = getReelImageLayout(W, H, B.w, B.h);
    const key = [kind, W, H, Math.round(layA.w), Math.round(layA.h), Math.round(layB.w), Math.round(layB.h), state.reelZoomMax, state.reelTargetX, state.reelTargetY, aimB[0].toFixed(3), aimB[1].toFixed(3), state.reelDuration, A.key, A.cap, B.key, B.cap].join('|');
    if (key !== WG.planKey || !WG.plan) {
      WG.plan = wgBuildPlan({ kind, W, H, layA, layB, zoomMax: state.reelZoomMax, aim: [state.reelTargetX, state.reelTargetY], aimB, dur: state.reelDuration });
      WG.planKey = key; WG.layA = layA; WG.layB = layB;
    }
    const P = WG.plan, gl = WG.gl;
    const e0 = wgCol(P.RB, 0), e1 = wgCol(P.RB, 1), e2 = wgCol(P.RB, 2);
    const geoA = { ref: [0, 0, -1], c: [0, 0, 0], ex: [1, 0, 0], ey: [0, 1, 0], n: [0, 0, -1], w: P.wA, h: P.hA, ext: 0.5 * Math.max(P.wA, P.hA) };
    const geoB = { ref: [P.Bc[0] - e2[0], P.Bc[1] - e2[1], P.Bc[2] - e2[2]], c: P.Bc, ex: e0, ey: e1, n: [-e2[0], -e2[1], -e2[2]], w: P.wB, h: P.hB, ext: 0.5 * Math.max(P.wB, P.hB) };
    const ik = [A.key, A.cap, B.key, B.cap, P.wA.toFixed(4), P.hA.toFixed(4), P.wB.toFixed(4), P.hB.toFixed(4), P.Bc.map(v => v.toFixed(3)).join(','), kind].join('|');
    if (ik !== WG.instKey) {
      if (WG.inst) { [WG.inst.A, WG.inst.B].forEach(x => { if (x) { gl.deleteVertexArray(x.vao); gl.deleteBuffer(x.vbo); } }); }
      WG.inst = { A: wgBuildPlaneInstances(A, geoA, 0.10, 1234), B: wgBuildPlaneInstances(B, geoB, 0.10, 4321) };
      WG.instKey = ik;
    }
    WG.geoA = geoA; WG.geoB = geoB;
    return P;
  }

  function wgDraw(ctx, OW, OH, p, kind) {
    const gl = WG.gl, t0 = performance.now();
    const W = Math.max(2, Math.round(OW * WG.scale)), H = Math.max(2, Math.round(OH * WG.scale));
    const P = wgEnsurePlan(W, H, kind), A = WG.A, B = WG.B;
    wgEnsureTargets(W, H);
    const geos = [WG.geoA, WG.geoB], scs = [A, B], lays = [WG.layA, WG.layB];
    // ---- camera, exposure
    const F0 = P.F0;
    const c0 = wgPose(P, p, F0, WG.poses[0] || (WG.poses[0] = {}));
    const sFrac = 0.5 + 0.5 * Math.pow(c0.speed, 1.2);
    const shP = (sFrac / 30) / P.dur;                                    // shutter (180 deg at rest, 360 deg at light speed), in progress units
    const pPrev = Math.max(0, p - shP);
    const c1 = wgPose(P, pPrev, F0, WG.poses[1] || (WG.poses[1] = {}));
    const warp = c0.warp, beta = WGT.beta * Math.pow(warp, 0.9);
    const dEnd = Math.min(1, P.D0 / P.Zm), nearLo = 0.12 * dEnd, nearHi = 0.5 * dEnd;
    const geoA_ref = (k) => WG.geoA.ref[k];
    const kA = P.seq1 ? wgSmooth((p - WGT.leave0) / WGT.leaveD) : 0;          // the first photograph dissolves while the camera whips away from it
    const nearA = [WGT.nearA[0] + (0.3 - WGT.nearA[0]) * kA, WGT.nearA[1] + (4.0 - WGT.nearA[1]) * kA], nearB = [0.12 * dEnd, 0.5 * dEnd];
    const plNear = new Float32Array([nearA[0], nearA[1], nearB[0], nearB[1]]);
    // a photograph the camera has left fades out with distance (otherwise its thin bright features, such as a border line, would be smeared into long streaks)
    const farA = P.seq1 ? [WGT.farA1[0], WGT.farA1[1], kA] : [WGT.farA2[0], WGT.farA2[1], wgSmooth((p - 0.12) / 0.20)];
    const plFar = new Float32Array([farA[0], farA[1], farA[2], 1e8, 2e8, 0]);
    const seed = (Math.floor(p * P.dur * 30 + 0.5) % 997) * 0.01 + 0.13;
    // ---- planes: poses across the shutter, sorted far -> near
    const info = [0, 1].map(i => {
      const g = geos[i];
      const zc = (g.c[0] - c0.pos[0]) * c0.R[2] + (g.c[1] - c0.pos[1]) * c0.R[5] + (g.c[2] - c0.pos[2]) * c0.R[8];
      return { i, zc };
    }).sort((a, b) => b.zc - a.zc);
    gl.bindFramebuffer(gl.FRAMEBUFFER, WG.fb.fbo); gl.viewport(0, 0, W, H);
    gl.disable(gl.SCISSOR_TEST); gl.disable(gl.DEPTH_TEST);
    const sw = P.seq1 ? wgSmooth((p - 0.54) / 0.12) : wgSmooth((p - 0.48) / 0.14);
    const sky = [0, 1, 2].map(k => A.bg[k] + (B.bg[k] - A.bg[k]) * sw);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const pr = WG.prog.plane; gl.useProgram(pr);
    gl.bindVertexArray(WG.vaoEmpty);
    const Rm = new Float32Array(9 * WG_MAXP), Om = new Float32Array(3 * WG_MAXP), Fm = new Float32Array(WG_MAXP);
    for (const inf of info) {
      const g = geos[inf.i], sc = scs[inf.i];
      // conservative screen box over the shutter (the fade ends about 1.7 extension lengths away)
      const ex = (WGT.extR + 0.06) * g.ext, hw = g.w / 2 + ex, hh = g.h / 2 + ex;
      const corners = [[-hw, -hh], [hw, -hh], [-hw, hh], [hw, hh], [0, 0]];
      let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9, behind = false, disp = 0;
      const cams = [c1, c0];
      for (let q = 0; q < 2; q++) for (const cr of corners) {
        const wx = g.c[0] + g.ex[0] * cr[0] + g.ey[0] * cr[1], wy = g.c[1] + g.ex[1] * cr[0] + g.ey[1] * cr[1], wz = g.c[2] + g.ex[2] * cr[0] + g.ey[2] * cr[1];
        const s = wgProj(cams[q], W, H, wx, wy, wz);
        if (!s) { behind = true; continue; }
        if (s[0] < minx) minx = s[0]; if (s[0] > maxx) maxx = s[0]; if (s[1] < miny) miny = s[1]; if (s[1] > maxy) maxy = s[1];
      }
      // displacement of the photograph's own corners / centre over the shutter -> number of sub-poses
      for (const cr of [[-g.w / 2, -g.h / 2], [g.w / 2, -g.h / 2], [-g.w / 2, g.h / 2], [g.w / 2, g.h / 2], [0, 0]]) {
        const wx = g.c[0] + g.ex[0] * cr[0] + g.ey[0] * cr[1], wy = g.c[1] + g.ex[1] * cr[0] + g.ey[1] * cr[1], wz = g.c[2] + g.ex[2] * cr[0] + g.ey[2] * cr[1];
        const s0 = wgProj(c0, W, H, wx, wy, wz), s1 = wgProj(c1, W, H, wx, wy, wz);
        if (s0 && s1) disp = Math.max(disp, Math.hypot(s0[0] - s1[0], s0[1] - s1[1])); else if (s0 || s1) disp = Math.max(disp, 60);
      }
      if (!behind) { if (maxx < 0 || maxy < 0 || minx > W || miny > H) continue; }
      const Nseg = disp < 0.6 ? 0 : wgClamp(Math.ceil(disp / 2.2), 1, WG_MAXP - 1);
      const N = Nseg + 1;
      for (let k = 0; k < N; k++) {
        const pp = Nseg === 0 ? p : pPrev + (p - pPrev) * (k / Nseg);
        const ck = Nseg === 0 ? c0 : (k === 0 ? c1 : (k === Nseg ? c0 : wgPose(P, pp, F0, WG.poses[2 + k] || (WG.poses[2 + k] = {}))));
        wgMat3Cols(ck.R, Rm, 9 * k); Om[3 * k] = ck.pos[0]; Om[3 * k + 1] = ck.pos[1]; Om[3 * k + 2] = ck.pos[2]; Fm[k] = ck.F;
      }
      if (behind) { gl.disable(gl.SCISSOR_TEST); }
      else {
        const x0 = Math.max(0, Math.floor(minx) - 1), y0 = Math.max(0, Math.floor(miny) - 1), x1 = Math.min(W, Math.ceil(maxx) + 1), y1 = Math.min(H, Math.ceil(maxy) + 1);
        gl.enable(gl.SCISSOR_TEST); gl.scissor(x0, H - y1, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
      }
      gl.uniform2f(wgU(pr, 'uRes'), W, H);
      gl.uniform3fv(wgU(pr, 'uPC'), g.c); gl.uniform3fv(wgU(pr, 'uEX'), g.ex); gl.uniform3fv(wgU(pr, 'uEY'), g.ey); gl.uniform3fv(wgU(pr, 'uPN'), g.n);
      gl.uniform2f(wgU(pr, 'uPS'), g.w, g.h);
      gl.uniform2f(wgU(pr, 'uNearF'), inf.i === 0 ? nearA[0] : nearB[0], inf.i === 0 ? nearA[1] : nearB[1]);
      gl.uniform3f(wgU(pr, 'uFarF'), plFar[3 * inf.i], plFar[3 * inf.i + 1], plFar[3 * inf.i + 2]); gl.uniform3f(wgU(pr, 'uBg'), sc.bg[0], sc.bg[1], sc.bg[2]);
      gl.uniform1f(wgU(pr, 'uExt'), g.ext); gl.uniform1f(wgU(pr, 'uXTrim'), WGT.xTrim);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, sc.texX); gl.uniform1i(wgU(pr, 'uTexX'), 1); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, sc.texX2); gl.uniform1i(wgU(pr, 'uTexX2'), 2); gl.uniform1f(wgU(pr, 'uBlur'), 0.11); gl.uniform1f(wgU(pr, 'uInset'), 0.012); gl.uniform1f(wgU(pr, 'uDepth'), WGT.extDepth); gl.uniform1f(wgU(pr, 'uSeed'), seed);
      gl.uniform1i(wgU(pr, 'uN'), N);
      gl.uniformMatrix3fv(wgU(pr, 'uR'), false, Rm); gl.uniform3fv(wgU(pr, 'uO'), Om); gl.uniform1fv(wgU(pr, 'uF'), Fm);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sc.texS); gl.uniform1i(wgU(pr, 'uTex'), 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.SCISSOR_TEST);
    // ---- stars (additive)
    gl.blendFunc(gl.ONE, gl.ONE);
    const R0 = new Float32Array(9), R1 = new Float32Array(9); wgMat3Cols(c0.R, R0, 0); wgMat3Cols(c1.R, R1, 0);
    const refO = new Float32Array([geoA_ref(0), geoA_ref(1), geoA_ref(2), WG.geoB.ref[0], WG.geoB.ref[1], WG.geoB.ref[2]]);
    const plC = new Float32Array(6), plN = new Float32Array(6), plX = new Float32Array(6), plY = new Float32Array(6), plS = new Float32Array(6);
    geos.forEach((g, i) => { plC.set(g.c, 3 * i); plN.set(g.n, 3 * i); plX.set(g.ex, 3 * i); plY.set(g.ey, 3 * i); plS[3 * i] = g.w; plS[3 * i + 1] = g.h; plS[3 * i + 2] = g.ext; });
    const setStarCommon = (prg) => {
      gl.uniform2f(wgU(prg, 'uRes'), W, H);
      gl.uniform3f(wgU(prg, 'uO0'), c0.pos[0], c0.pos[1], c0.pos[2]); gl.uniform3f(wgU(prg, 'uO1'), c1.pos[0], c1.pos[1], c1.pos[2]);
      gl.uniformMatrix3fv(wgU(prg, 'uR0'), false, R0); gl.uniformMatrix3fv(wgU(prg, 'uR1'), false, R1);
      gl.uniform1f(wgU(prg, 'uF0'), c0.F); gl.uniform1f(wgU(prg, 'uF1'), c1.F);
      gl.uniform1f(wgU(prg, 'uBeta'), beta); gl.uniform3f(wgU(prg, 'uU'), P.u[0], P.u[1], P.u[2]);
      gl.uniform3fv(wgU(prg, 'uPlC'), plC); gl.uniform3fv(wgU(prg, 'uPlN'), plN); gl.uniform3fv(wgU(prg, 'uPlX'), plX); gl.uniform3fv(wgU(prg, 'uPlY'), plY); gl.uniform3fv(wgU(prg, 'uPlS'), plS);
      gl.uniform2f(wgU(prg, 'uNearF'), nearLo, nearHi); gl.uniform1f(wgU(prg, 'uGain'), 1.0 + WGT.gain * warp); gl.uniform1f(wgU(prg, 'uAmpCap'), WGT.ampCap);
      gl.uniform3fv(wgU(prg, 'uRefO'), refO); gl.uniform2fv(wgU(prg, 'uPlNear'), plNear); gl.uniform3fv(wgU(prg, 'uPlFar'), plFar); gl.uniform2f(wgU(prg, 'uOccD'), WGT.occLo, WGT.occHi);
    };
    // lattice (added stars): the app's Star Glow, Star Size and Starfield Density controls act on these; the photograph's own stars stay as photographed
    const kGlow = wgClamp((state.reelStarGlow !== undefined ? state.reelStarGlow : 1.2) / 1.2, 0, 2.5);
    const kSize = wgClamp((state.reelStarSize || 1.2) / 1.2, 0.4, 3);
    const rich = (sc) => (sc.info && sc.info.found !== undefined ? wgClamp(0.45 + 0.55 * Math.pow(Math.min(1.2, sc.info.found / 3500), 0.7), 0.45, 1.0) : 1);
    const dk = (({ 4: 0.62, 6: 1.0, 8: 1.45 })[state.reelGrid] || 1.0) * wgMix(rich(A), rich(B), sw);      // a sparse photograph is surrounded by a sparser sky
    let prg = WG.prog.lat; gl.useProgram(prg); setStarCommon(prg);
    gl.uniform1f(wgU(prg, 'uGain'), (1.0 + WGT.gain * warp) * kGlow);
    gl.uniform1f(wgU(prg, 'uDens'), dk * (1 - WGT.thin * warp)); gl.uniform1f(wgU(prg, 'uSigH'), lays[0].h * kSize);
    gl.uniform1fv(wgU(prg, 'uLvlL'), WG.lat.L); gl.uniform3fv(wgU(prg, 'uLvlOff'), WG.lat.off);
    gl.bindVertexArray(WG.lat.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, dk > 1 ? WG.lat.nAll : WG.lat.n);
    // photo stars (patch sprites that turn into streaks when they move)
    prg = WG.prog.patch; gl.useProgram(prg); setStarCommon(prg);
    gl.uniform1f(wgU(prg, 'uRingKeep'), 1 - WGT.thin * warp);
    for (let i = 0; i < 2; i++) {
      const inst = i === 0 ? WG.inst.A : WG.inst.B, sc = scs[i], g = geos[i];
      if (!inst.n) continue;
      gl.uniform3fv(wgU(prg, 'uEXp'), g.ex); gl.uniform3fv(wgU(prg, 'uEYp'), g.ey);
      gl.uniform1f(wgU(prg, 'uPatchPx'), lays[i].w / sc.w); gl.uniform1f(wgU(prg, 'uFref'), F0); gl.uniform1i(wgU(prg, 'uSkip'), i);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, sc.texAt); gl.uniform1i(wgU(prg, 'uAtlas'), 1);
      gl.uniform2f(wgU(prg, 'uAtlasSize'), sc.atlas.w, sc.atlas.h);
      gl.bindVertexArray(inst.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, inst.n);
    }
    gl.disable(gl.BLEND);
    // ---- bloom pyramid
    const bloomK = (0.10 + 0.38 * warp) * Math.min(kGlow, 2);
    prg = WG.prog.down; gl.useProgram(prg); gl.bindVertexArray(WG.vaoEmpty);
    let src = WG.fb;
    for (let i = 0; i < 5; i++) {
      const dst = WG.bl[i];
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo); gl.viewport(0, 0, dst.w, dst.h);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, src.tex); gl.uniform1i(wgU(prg, 'uSrc'), 2);
      gl.uniform2f(wgU(prg, 'uSrcTexel'), 1 / src.w, 1 / src.h); gl.uniform2f(wgU(prg, 'uDst'), dst.w, dst.h);
      gl.uniform1f(wgU(prg, 'uThr'), 0.9); gl.uniform1i(wgU(prg, 'uFirst'), i === 0 ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3); src = dst;
    }
    // ---- composite to the canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
    prg = WG.prog.comp; gl.useProgram(prg);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, WG.fb.tex); gl.uniform1i(wgU(prg, 'uScene'), 2);
    for (let i = 0; i < 5; i++) { gl.activeTexture(gl.TEXTURE3 + i); gl.bindTexture(gl.TEXTURE_2D, WG.bl[i].tex); gl.uniform1i(wgU(prg, 'uB' + (i + 1)), 3 + i); }
    const grainK = 0.010 * wgSmooth((p - 0.01) / 0.03) * (1 - wgSmooth((p - 0.96) / 0.04));
    gl.uniform2f(wgU(prg, 'uRes'), W, H); gl.uniform1f(wgU(prg, 'uBloom'), bloomK); gl.uniform1f(wgU(prg, 'uVig'), 0.10 + 0.25 * warp);
    gl.uniform1f(wgU(prg, 'uGrain'), grainK); gl.uniform1f(wgU(prg, 'uSeed'), seed); gl.uniform1f(wgU(prg, 'uExposure'), 1.0);
    gl.uniform3f(wgU(prg, 'uTint'), 1, 1, 1); gl.uniform3f(wgU(prg, 'uSky'), sky[0], sky[1], sky[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(WG.canvas, 0, 0, W, H, 0, 0, OW, OH); ctx.restore();
    WG.ms = performance.now() - t0;
    return true;
  }

  // the first frame while the scene is being prepared (the plain photograph, exactly as in the other presets)
  function wgDrawWaiting(ctx, W, H) {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#010206'; ctx.fillRect(0, 0, W, H);
    if (reelSourceImgCanvas) {
      const lay = getReelImageLayout(W, H, reelSourceImgCanvas.width, reelSourceImgCanvas.height);
      if (!lay.isFullBleed && reelBgCanvas) ctx.drawImage(reelBgCanvas, 0, 0, W, H);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(reelSourceImgCanvas, lay.x, lay.y, lay.w, lay.h);
    }
    ctx.fillStyle = 'rgba(2,6,14,0.55)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(190,225,255,0.92)'; ctx.font = '600 ' + Math.max(12, Math.round(W / 34)) + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Preparing the 3D scene…', W / 2, H / 2);
    ctx.restore();
  }

  function wgGuard(W, H) {
    if (reelExportProfile) {
      WG.scale = Math.min(1, reelExportProfile.warpEdge / Math.max(W, H));
      WG.tLast = 0; WG.dtAvg = 0; WG.slow = 0; WG.gW = 0;
      return;
    }
    const now = performance.now(), dt = now - (WG.tLast || 0);
    WG.tLast = now;
    if (W !== WG.gW || H !== WG.gH) { WG.gW = W; WG.gH = H; WG.scale = 1; WG.dtAvg = 0; WG.slow = 0; WG.warm = 40; return; }
    if (WG.warm > 0) { WG.warm--; return; }
    if (dt <= 0 || dt > 400) return;
    WG.dtAvg = WG.dtAvg ? WG.dtAvg * 0.9 + dt * 0.1 : dt;
    if (WG.dtAvg > 46 && WG.scale > 0.5) { if (++WG.slow > 14) { WG.scale = Math.max(0.5, WG.scale * 0.8); WG.slow = 0; WG.dtAvg = 0; WG.warm = 20; } } else WG.slow = 0;
  }
  function renderWarpCinema(ctx, W, H, p, kind) {
    if (WG.ok !== false && !WG.lost && wgInit()) {
      const k = wgPrepKeys();
      if (wgHave(k)) {
        wgGuard(W, H);
        try {
          if (wgDraw(ctx, W, H, p, kind)) return;
        } catch (error) {
          wgReleaseTargets();
          if (state.reelRecording) throw error;
          WG.ok = false;
          WG.why = 'draw: ' + (error?.message || error);
          console.warn('[warp-gl]', WG.why);
        }
      } else {
        wgKick();
        if (WG.ok !== false) { wgDrawWaiting(ctx, W, H); return; }
      }
    }
    renderWarpCinemaLegacy(ctx, W, H, p, kind);
  }


  // =========================================================================
  // MAIN 60FPS 3D CINEREEL FRAME RENDERER (11 PRESETS)
  // =========================================================================
  function renderReelFrame(targetCtx, outW, outH, progress) {
    if (!reelSourceImgCanvas) return;
    const p = clamp01(progress);
    const preset = state.reelPreset.trim();
    if (preset === 'hyperjump' || preset === 'warpspiral') {
      renderWarpCinema(targetCtx, outW, outH, p, preset);
      drawTelemetryOverlay(targetCtx, outW, outH);
      return;
    }
    const srcW = reelSourceImgCanvas.width;
    const srcH = reelSourceImgCanvas.height;
    const layout = getReelImageLayout(outW, outH, srcW, srcH);
    const imgW = layout.w;
    const imgH = layout.h;
    const cx = outW / 2;
    const cy = outH / 2;
    const fov = Math.max(outW, outH) * 1.18;

    // 1. Background Layer
    targetCtx.save();
    if (layout.isFullBleed || !reelBgCanvas) {
      targetCtx.fillStyle = '#010206';
      targetCtx.fillRect(0, 0, outW, outH);
    } else {
      const bgScale = 1.02 + 0.05 * Math.sin(p * Math.PI);
      targetCtx.translate(cx, cy);
      targetCtx.scale(bgScale, bgScale);
      targetCtx.drawImage(reelBgCanvas, -cx, -cy, outW, outH);
    }
    targetCtx.restore();

    // panels reach a little over their neighbours so near-touching slabs never show a dark hairline between them
    reelBleed = 0.9 + 0.0042 * Math.min(outW, outH);

    // =====================================================================
    // PRESET 1: MONOLITH RISE 3D (Frameless! Starflight + Horiz Slabs + Rise)
    // =====================================================================
    if (preset === 'monolithrise') {
      const dropP = clamp01(p / 0.52);
      const riseP = smootherstep((p - 0.32) / 0.56);
      const finalPush = smootherstep((p - 0.45) / 0.55) * (state.reelZoomMax - 1.0) * 0.25;

      const planePitch = (1 - riseP) * (64 * Math.PI / 180);
      const planeYaw = (1 - riseP) * (-12 * Math.PI / 180);
      const planeRoll = (1 - riseP) * (-3.2 * Math.PI / 180);

      const planeOffsetY = (1 - riseP) * (outH * 0.18);
      const planeOffsetZ = (1 - riseP) * (fov * 0.12) - finalPush * (fov * 0.22);

      renderOpticalStarfield3D(
        targetCtx, outW, outH, layout,
        p * 1.15,
        (1 - riseP) * (-0.10),
        (1 - riseP) * 0.06,
        p,
        1.0
      );

      const cols = state.reelGrid;
      const rows = Math.max(4, Math.round(cols * (imgH / imgW)));
      const tileW = imgW / cols;
      const tileH = imgH / rows;
      const srcTileW = srcW / cols;
      const srcTileH = srcH / rows;

      if (dropP >= 1 && riseP >= 1) {
        // identical pose to the tile grid once everything has landed and levelled out, so the swap cannot be seen
        const finalScale = fov / (fov + planeOffsetZ);
        targetCtx.save();
        targetCtx.translate(cx, cy);
        targetCtx.scale(finalScale, finalScale);
        targetCtx.drawImage(reelSourceImgCanvas, -imgW / 2, -imgH / 2, imgW, imgH);
        targetCtx.restore();
      } else {
        const renderQueue = [];
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const rNorm = r / Math.max(1, rows - 1);
            const cNorm = Math.abs(c - (cols - 1) / 2) / Math.max(1, cols / 2);
            const jitter = ((r * 23 + c * 41) % 19) / 19 * 0.06;
            const delay = (rNorm * 0.56 + cNorm * 0.24 + jitter) * 0.66;
            const dur = 0.40;
            const lt = clamp01((dropP - delay) / dur);
            if (lt <= 0) continue;

            // slabs arrive with zero speed (no bounce, so they never bump into the row below)
            const fall = 1 - Math.pow(1 - lt, 4);
            const air = Math.pow(1 - lt, 3);

            const x0 = -imgW / 2 + c * tileW;
            const y0 = -imgH / 2 + r * tileH;
            const x1 = x0 + tileW;
            const y1 = y0 + tileH;
            const tcx = (x0 + x1) / 2;
            const tcy = (y0 + y1) / 2;

            const localPitch = air * 0.38 * ((r % 2 === 0) ? 1 : -1);
            const localRoll = air * 0.24 * ((c % 2 === 0) ? 1 : -1);
            const fallHeightY = (1 - fall) * (-outH * 0.70);
            const spreadX = air * ((c - (cols - 1) / 2) * tileW * 0.18);

            const cornersLocal = [
              { lx: x0 - tcx, ly: y0 - tcy },
              { lx: x1 - tcx, ly: y0 - tcy },
              { lx: x1 - tcx, ly: y1 - tcy },
              { lx: x0 - tcx, ly: y1 - tcy }
            ];

            const projCorners = cornersLocal.map(corner => {
              const lr = rotate3D(corner.lx, corner.ly, 0, localPitch, 0, localRoll);
              const worldPt = rotate3D(tcx + lr.x, tcy + lr.y, lr.z, planePitch, planeYaw, planeRoll);
              return project3D({
                x: worldPt.x + spreadX,
                y: worldPt.y + planeOffsetY + fallHeightY,
                z: worldPt.z + planeOffsetZ
              }, cx, cy, fov);
            });

            const avgZ = (projCorners[0].z + projCorners[1].z + projCorners[2].z + projCorners[3].z) * 0.25;
            // one glossy highlight sliding down the whole plane: each row carries the slice of it that falls on that row
            const sheenAt = rn => (riseP > 0.05 && riseP < 0.95)
              ? Math.exp(-Math.pow((planePitch - 0.40) * 4.2, 2)) * 0.18 * Math.max(0, 1 - Math.abs(rn - riseP) * 0.7)
              : 0;
            const rStep = 1 / Math.max(1, rows - 1);
            const tiltSheen = { a0: sheenAt(rNorm - 0.5 * rStep), am: sheenAt(rNorm), a1: sheenAt(rNorm + 0.5 * rStep), axis: 'v' };

            renderQueue.push({
              c, r, air, avgZ, projCorners,
              alpha: smoothstep(lt / 0.30),
              specSheen: tiltSheen
            });
          }
        }

        renderQueue.sort((a, b) => b.avgZ - a.avgZ);

        renderQueue.forEach(item => {
          if (item.air > 0.02 && item.air < 0.55) {
            targetCtx.save();
            targetCtx.fillStyle = `rgba(0, 0, 0, ${(1 - item.air) * 0.42 * item.alpha})`;
            targetCtx.beginPath();
            item.projCorners.forEach((pt, idx) => {
              const sy = pt.y + item.air * (outH * 0.12);
              if (idx === 0) targetCtx.moveTo(pt.x, sy);
              else targetCtx.lineTo(pt.x, sy);
            });
            targetCtx.closePath();
            targetCtx.fill();
            targetCtx.restore();
          }

          drawPerspectiveQuad(
            targetCtx,
            reelSourceImgCanvas,
            item.c * srcTileW, item.r * srcTileH, srcTileW, srcTileH,
            item.projCorners[0], item.projCorners[1], item.projCorners[2], item.projCorners[3],
            item.alpha,
            item.specSheen
          );
        });
      }

      renderOpticalStarfield3D(
        targetCtx, outW, outH, layout,
        p * 1.40 + 0.55,
        (1 - riseP) * (-0.10),
        (1 - riseP) * 0.06,
        p,
        0.42
      );
    }

    // =====================================================================
    // PRESET 2: STARLIGHT DIVE 3D (Deep Zoom In toward Focal Point)
    // =====================================================================
    else if (preset === 'stardive') {
      const zoomMax = state.reelZoomMax;
      const easeP = REEL_CURVES[reelCurveId('stardive')].fn(p);
      const camZ = 1.0 + (zoomMax - 1.0) * easeP;
      const camRoll = Math.sin(p * Math.PI) * 0.022 + 0.0007;   // (a hair of roll keeps frame 0 resampled like the rest)

      const txNorm = state.reelTargetX;
      const tyNorm = state.reelTargetY;

      targetCtx.save();
      if (!layout.isFullBleed) {
        targetCtx.beginPath();
        targetCtx.rect(layout.x, layout.y, imgW, imgH);
        targetCtx.clip();
      }

      const centerX = layout.x + imgW / 2;
      const centerY = layout.y + imgH / 2;
      const focalOffsetX = (0.5 - txNorm) * imgW * (1 - 1 / camZ);
      const focalOffsetY = (0.5 - tyNorm) * imgH * (1 - 1 / camZ);

      targetCtx.save();
      targetCtx.translate(centerX, centerY);
      targetCtx.rotate(camRoll);
      targetCtx.scale(camZ, camZ);
      targetCtx.translate(focalOffsetX, focalOffsetY);
      targetCtx.drawImage(reelSourceImgCanvas, -imgW / 2, -imgH / 2, imgW, imgH);
      targetCtx.restore();

      const midZ = 1.0 + (zoomMax * 1.28 - 1.0) * easeP;
      targetCtx.save();
      targetCtx.globalCompositeOperation = 'screen';
      targetCtx.globalAlpha = 0.20 * Math.sin(p * Math.PI);
      targetCtx.translate(centerX, centerY);
      targetCtx.rotate(camRoll * 1.3);
      targetCtx.scale(midZ, midZ);
      targetCtx.translate(focalOffsetX * 1.12, focalOffsetY * 1.12);
      targetCtx.drawImage(reelSourceImgCanvas, -imgW / 2, -imgH / 2, imgW, imgH);
      targetCtx.restore();

      const travelDist = easeP * (0.65 + (zoomMax - 1.0) * 0.38);
      renderOpticalStarfield3D(targetCtx, outW, outH, layout, travelDist, 0, 0, p, 1.15);

      targetCtx.restore();
    }

    // =====================================================================
    // PRESET 3: COSMIC ZOOM OUT (Pullback from Deep Core -> Full Widefield!)
    // =====================================================================
    else if (preset === 'zoomout') {
      const startZoom = state.reelZoomMax; // Starts zoomed in at user's chosen Zoom Depth!
      const easeP = REEL_CURVES[reelCurveId('zoomout')].fn(p);
      const camZ = startZoom - (startZoom - 1.0) * easeP;
      const camRoll = (1 - easeP) * 0.055 + 0.0007;               // (a hair of roll keeps the last frame resampled like the rest)

      const txNorm = state.reelTargetX;
      const tyNorm = state.reelTargetY;

      targetCtx.save();
      if (!layout.isFullBleed) {
        targetCtx.beginPath();
        targetCtx.rect(layout.x, layout.y, imgW, imgH);
        targetCtx.clip();
      }

      const centerX = layout.x + imgW / 2;
      const centerY = layout.y + imgH / 2;
      const focalOffsetX = (0.5 - txNorm) * imgW * (1 - 1 / camZ);
      const focalOffsetY = (0.5 - tyNorm) * imgH * (1 - 1 / camZ);

      targetCtx.save();
      targetCtx.translate(centerX, centerY);
      targetCtx.rotate(camRoll);
      targetCtx.scale(camZ, camZ);
      targetCtx.translate(focalOffsetX, focalOffsetY);
      targetCtx.drawImage(reelSourceImgCanvas, -imgW / 2, -imgH / 2, imgW, imgH);
      targetCtx.restore();

      // Reverse 3D Starfield flying inward into the core as camera pulls back to widefield
      const reverseTravel = (1 - easeP) * (0.65 + (startZoom - 1.0) * 0.38);
      renderOpticalStarfield3D(targetCtx, outW, outH, layout, reverseTravel, 0, 0, p, 1.1 * (1 - easeP * 0.45));

      targetCtx.restore();
    }

    // =====================================================================
    // PRESET 4: CAROUSEL SWEEP (Motorized Pan Across the Entire Carousel Field!)
    // =====================================================================
    else if (preset === 'panosweep') {
      // One continuous camera move: the pan across the slices eases out while the pull-back to the full
      // frame is already easing in, so the camera never stops dead between the two.
      const isHoriz = state.direction === 'horiz';
      const nSlices = Math.max(2, state.sliceCount);

      const coverScale = isHoriz
        ? Math.max((outH / srcH) * 1.02, (outW * Math.min(2.6, nSlices * 0.78)) / srcW)
        : Math.max((outW / srcW) * 1.02, (outH * Math.min(2.6, nSlices * 0.78)) / srcH);

      const panoW = srcW * coverScale;
      const panoH = srcH * coverScale;
      const dirSign = state.reverseOrder ? -1 : 1;

      const sweepA = easeInOutSine(clamp01(p / 0.84));          // 0 → 1 across the slices
      const pullB = smootherstep((p - 0.45) / 0.55);            // 0 → 1 back to the full frame

      const curW = panoW + (imgW - panoW) * pullB;
      const curH = panoH + (imgH - panoH) * pullB;
      const keep = 1 - pullB;                                    // pan amplitude fades out as the camera pulls back
      const panX = isHoriz ? dirSign * Math.max(0, (curW - outW) / 2) * (1 - 2 * sweepA) * keep : 0;
      const panY = !isHoriz ? dirSign * Math.max(0, (curH - outH) / 2) * (1 - 2 * sweepA) * keep : 0;

      targetCtx.save();
      targetCtx.translate(cx + panX, cy + panY);
      targetCtx.drawImage(reelSourceImgCanvas, -curW / 2, -curH / 2, curW, curH);
      targetCtx.restore();

      renderOpticalStarfield3D(
        targetCtx, outW, outH, layout,
        sweepA * 0.35 + pullB * 0.25,
        !isHoriz ? (sweepA - 0.5) * 0.22 * keep : 0,
        isHoriz ? (sweepA - 0.5) * 0.22 * keep : 0,
        p,
        0.65 * (1 - pullB * 0.35)
      );
    }

    // =====================================================================
    // PRESET 5: 3D TILE DROP (Frameless Perspective Slabs + Orbiting Camera)
    // =====================================================================
    else if (preset === 'cascade3d') {
      renderOpticalStarfield3D(targetCtx, outW, outH, layout, p * 0.90, 0, 0, p, 0.95);

      const cols = state.reelGrid;
      const rows = Math.max(4, Math.round(cols * (imgH / imgW)));
      const tileW = imgW / cols;
      const tileH = imgH / rows;
      const srcTileW = srcW / cols;
      const srcTileH = srcH / rows;

      const ap = clamp01((p + 0.05) / 0.92);
      const camEase = smootherstep(p / 0.90);
      const globalPitch = (1 - camEase) * (30 * Math.PI / 180);
      const globalYaw = (1 - camEase) * (-16 * Math.PI / 180);
      const drift = smootherstep(p) * (state.reelZoomMax - 1.0) * 0.06;   // slow push-in, so the shot never freezes
      const globalZ = -(1 - camEase) * (fov * 0.20) - drift * fov * 0.9;

      const queue = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const rowNorm = (rows - 1 - r) / Math.max(1, rows - 1);
          const colNorm = c / Math.max(1, cols - 1);
          const jitter = ((r * 19 + c * 37) % 23) / 23 * 0.08;
          const wavePos = rowNorm * 0.58 + colNorm * 0.34 + jitter;
          const dur = 0.34;
          const lt = clamp01((ap - wavePos * (1 - dur)) / dur);
          if (lt <= 0) continue;

          const fall = 1 - Math.pow(1 - lt, 4);
          const air = Math.pow(1 - lt, 3);

          const tcx = -imgW / 2 + (c + 0.5) * tileW;
          const tcy = -imgH / 2 + (r + 0.5) * tileH;
          const dropY = (1 - fall) * (-outH * 0.62);
          const liftZ = -air * (fov * 0.28);

          const tilePitch = air * 0.78 * ((r % 2 === 0) ? 1 : -1);
          const tileYaw = air * 0.52 * ((c % 2 === 0) ? 1 : -1);

          const corners = [
            { lx: -tileW / 2, ly: -tileH / 2 },
            { lx: tileW / 2, ly: -tileH / 2 },
            { lx: tileW / 2, ly: tileH / 2 },
            { lx: -tileW / 2, ly: tileH / 2 }
          ].map(co => {
            const loc = rotate3D(co.lx, co.ly, 0, tilePitch, tileYaw, 0);
            const wld = rotate3D(tcx + loc.x, tcy + loc.y + dropY, liftZ + loc.z, globalPitch, globalYaw, 0);
            return project3D({ x: wld.x, y: wld.y, z: wld.z + globalZ }, cx, cy, fov);
          });

          const avgZ = (corners[0].z + corners[1].z + corners[2].z + corners[3].z) * 0.25;
          queue.push({
            c, r, avgZ, corners,
            alpha: smoothstep(lt / 0.30),
            sheen: air * 0.25
          });
        }
      }

      queue.sort((a, b) => b.avgZ - a.avgZ);
      queue.forEach(q => {
        drawPerspectiveQuad(
          targetCtx, reelSourceImgCanvas,
          q.c * srcTileW, q.r * srcTileH, srcTileW, srcTileH,
          q.corners[0], q.corners[1], q.corners[2], q.corners[3],
          q.alpha, q.sheen
        );
      });
    }

    // =====================================================================
    // PRESET 6: HELIX RIBBON 3D (Golden Spiral 3D Ribbon Unwind)
    // =====================================================================
    else if (preset === 'helix3d') {
      renderOpticalStarfield3D(targetCtx, outW, outH, layout, p * 0.95, 0, (1 - p) * 0.12, p, 0.95);

      const cols = state.reelGrid * 2;
      const rows = Math.max(4, state.reelGrid);
      const tileW = imgW / cols;
      const tileH = imgH / rows;
      const srcTileW = srcW / cols;
      const srcTileH = srcH / rows;

      const ap = smootherstep(p / 0.84);
      const spread = Math.pow(1 - ap, 1.35);
      const radius = Math.max(imgW, imgH) * 0.46;
      const push = 1 + smootherstep((p - 0.40) / 0.60) * (state.reelZoomMax - 1.0) * 0.15;

      targetCtx.save();
      targetCtx.translate(cx, cy);
      targetCtx.scale(push, push);
      targetCtx.translate(-cx, -cy);

      if (ap >= 1) {
        targetCtx.drawImage(reelSourceImgCanvas, cx - imgW / 2, cy - imgH / 2, imgW, imgH);
      } else {
        const queue = [];
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const uNorm = (c + 0.5) / cols;
            const vNorm = (r + 0.5) / rows;
            const theta = (uNorm * Math.PI * 2.5 + vNorm * Math.PI * 1.5) + (1 - ap) * 2.8;

            const flatX = -imgW / 2 + (c + 0.5) * tileW;
            const flatY = -imgH / 2 + (r + 0.5) * tileH;

            const hx = Math.sin(theta) * radius * (0.65 + 0.35 * vNorm);
            const hz = (Math.cos(theta) - 0.15) * radius;
            const hy = (vNorm - 0.5) * imgH * 1.25 + Math.cos(theta * 0.5) * (imgH * 0.18);

            const currX = flatX + (hx - flatX) * spread;
            const currY = flatY + (hy - flatY) * spread;
            const currZ = hz * spread;

            const tileYaw = Math.atan2(hx, hz) * spread * 0.75;
            const tilePitch = (vNorm - 0.5) * 0.85 * spread;

            const corners = [
              { lx: -tileW / 2, ly: -tileH / 2 },
              { lx: tileW / 2, ly: -tileH / 2 },
              { lx: tileW / 2, ly: tileH / 2 },
              { lx: -tileW / 2, ly: tileH / 2 }
            ].map(co => {
              const rot = rotate3D(co.lx, co.ly, 0, tilePitch, tileYaw, 0);
              return project3D({ x: currX + rot.x, y: currY + rot.y, z: currZ + rot.z }, cx, cy, fov);
            });

            const avgZ = (corners[0].z + corners[1].z + corners[2].z + corners[3].z) * 0.25;
            const avgScale = (corners[0].scale + corners[1].scale + corners[2].scale + corners[3].scale) * 0.25;
            // a panel swinging close to the lens fades out instead of flashing across the frame
            const nearFade = 1 - smoothstep((avgScale - 1.35) / 0.5);
            queue.push({
              c, r, avgZ, corners,
              alpha: nearFade,
              sheen: spread * Math.max(0, Math.cos(tileYaw * 1.5)) * 0.25
            });
          }
        }

        queue.sort((a, b) => b.avgZ - a.avgZ);
        const layer = beginReelLayer(outW, outH);
        queue.forEach(q => {
          drawPerspectiveQuad(
            layer, reelSourceImgCanvas,
            q.c * srcTileW, q.r * srcTileH, srcTileW, srcTileH,
            q.corners[0], q.corners[1], q.corners[2], q.corners[3],
            q.alpha, q.sheen
          );
        });
        // the ribbon is one glassy sheet: it solidifies as a whole (no see-through seams between panels)
        endReelLayer(targetCtx, 0.42 + 0.58 * smoothstep(ap / 0.7));
      }
      targetCtx.restore();

      renderOpticalStarfield3D(targetCtx, outW, outH, layout, p * 1.25 + 0.4, 0, 0, p, 0.38);
    }

    // =====================================================================
    // PRESET 7: QUANTUM PLANES 3D (Staggered Depth Parallax Alignment)
    // =====================================================================
    else if (preset === 'quantum3d') {
      const alignP = smootherstep(p / 0.80);
      const spread = 1 - alignP;

      renderOpticalStarfield3D(
        targetCtx, outW, outH, layout,
        p * 1.10,
        spread * 0.14,
        spread * (-0.18),
        p,
        1.0
      );

      const numSlabs = state.reelGrid * 2;
      const isHoriz = state.direction === 'horiz';
      const camYaw = spread * (38 * Math.PI / 180);
      const camPitch = spread * (20 * Math.PI / 180);
      const camRoll = spread * (-5 * Math.PI / 180);
      const finalPush = smootherstep((p - 0.30) / 0.70) * (state.reelZoomMax - 1.0) * 0.18;
      const camZOffset = -finalPush * (fov * 0.22);

      if (alignP >= 1) {
        const finalScale = fov / (fov + camZOffset);
        targetCtx.save();
        targetCtx.translate(cx, cy);
        targetCtx.scale(finalScale, finalScale);
        targetCtx.drawImage(reelSourceImgCanvas, -imgW / 2, -imgH / 2, imgW, imgH);
        targetCtx.restore();
      } else {
        const queue = [];
        for (let i = 0; i < numSlabs; i++) {
          const wave = Math.sin((i / numSlabs) * Math.PI * 3 + 0.8);
          const slabZ = wave * (fov * 0.42) * spread;
          const slideOffset = ((i % 2 === 0 ? 1 : -1) * outH * 0.28) * Math.pow(spread, 1.4);

          let x0, y0, x1, y1, sx, sy, sw, sh;
          if (isHoriz) {
            const w = imgW / numSlabs;
            x0 = -imgW / 2 + i * w;
            x1 = x0 + w;
            y0 = -imgH / 2 + slideOffset;
            y1 = imgH / 2 + slideOffset;
            sx = i * (srcW / numSlabs);
            sy = 0;
            sw = srcW / numSlabs;
            sh = srcH;
          } else {
            const h = imgH / numSlabs;
            x0 = -imgW / 2 + slideOffset;
            x1 = imgW / 2 + slideOffset;
            y0 = -imgH / 2 + i * h;
            y1 = y0 + h;
            sx = 0;
            sy = i * (srcH / numSlabs);
            sw = srcW;
            sh = srcH / numSlabs;
          }

          const corners = [
            { x: x0, y: y0, z: slabZ },
            { x: x1, y: y0, z: slabZ },
            { x: x1, y: y1, z: slabZ },
            { x: x0, y: y1, z: slabZ }
          ].map(pt => {
            const rot = rotate3D(pt.x, pt.y, pt.z, camPitch, camYaw, camRoll);
            return project3D({ x: rot.x, y: rot.y, z: rot.z + camZOffset }, cx, cy, fov);
          });

          const avgZ = (corners[0].z + corners[1].z + corners[2].z + corners[3].z) * 0.25;
          const sheenAt = k => spread * Math.abs(Math.sin((k / numSlabs) * Math.PI * 3 + 0.8)) * 0.22;
          queue.push({
            sx, sy, sw, sh, avgZ, corners,
            sheen: { a0: sheenAt(i - 0.5), am: sheenAt(i), a1: sheenAt(i + 0.5), axis: isHoriz ? 'u' : 'v' }
          });
        }

        queue.sort((a, b) => b.avgZ - a.avgZ);
        const layer = beginReelLayer(outW, outH);
        queue.forEach(q => {
          drawPerspectiveQuad(
            layer, reelSourceImgCanvas,
            q.sx, q.sy, q.sw, q.sh,
            q.corners[0], q.corners[1], q.corners[2], q.corners[3],
            1, q.sheen
          );
        });
        endReelLayer(targetCtx, 0.40 + 0.60 * smoothstep(alignP / 0.7));
      }

      renderOpticalStarfield3D(targetCtx, outW, outH, layout, p * 1.35 + 0.5, 0, 0, p, 0.35);
    }

    // =====================================================================
    // PRESET 8: WARP PORTAL 3D (Concentric 3D Depth Portals + Deep Zoom)
    // =====================================================================
    else if (preset === 'warptunnel') {
      const zoomMax = state.reelZoomMax;
      const easeP = easeInOutCubic(p);
      const txNorm = state.reelTargetX;
      const tyNorm = state.reelTargetY;

      targetCtx.save();
      if (!layout.isFullBleed) {
        targetCtx.beginPath();
        targetCtx.rect(layout.x, layout.y, imgW, imgH);
        targetCtx.clip();
      }

      const centerX = layout.x + imgW / 2;
      const centerY = layout.y + imgH / 2;

      const numRings = 6;
      const lockP = clamp01(p / 0.78);
      const baseZoom = 1.0 + (zoomMax - 1.0) * easeInOutSine(p);

      for (let i = 0; i < numRings; i++) {
        const ringDelay = (i / numRings) * 0.40;
        const rt = smootherstep((lockP - ringDelay) / 0.60);
        if (i > 0 && rt <= 0.002) continue;

        // every layer sits closer to the lens than the base picture, so a layer always covers its own frame
        const depthDisplace = (1 - rt) * (i % 2 === 0 ? 0.55 : 0.34);
        const ringZoom = baseZoom * (1 + depthDisplace);
        const ringRot = (1 - rt) * ((i % 2 === 0 ? 1 : -1) * 0.10);

        const focalOffsetX = (0.5 - txNorm) * imgW * (1 - 1 / ringZoom);
        const focalOffsetY = (0.5 - tyNorm) * imgH * (1 - 1 / ringZoom);

        if (i === 0) {
          targetCtx.save();
          targetCtx.translate(centerX, centerY);
          targetCtx.rotate(ringRot);
          targetCtx.scale(ringZoom, ringZoom);
          targetCtx.translate(focalOffsetX, focalOffsetY);
          targetCtx.drawImage(reelSourceImgCanvas, -imgW / 2, -imgH / 2, imgW, imgH);
          targetCtx.restore();
          continue;
        }

        // portal layers: the picture seen through a soft-edged window (no hard frame lines)
        // a layer that has arrived shows exactly what the base picture shows, so it is not painted again
        if (rt >= 0.9998) continue;
        const rFrac = 1 - (i / numRings) * 0.78;
        const rw = imgW * rFrac, rh = imgH * rFrac;
        const bx = Math.floor(centerX - rw / 2) - 1, by = Math.floor(centerY - rh / 2) - 1;
        const bw = Math.ceil(rw) + 3, bh = Math.ceil(rh) + 3;
        const st = getReelStamp(bw, bh);
        st.save();
        st.beginPath(); st.rect(0, 0, bw, bh); st.clip();            // only the window itself is ever painted
        st.translate(centerX - bx, centerY - by);
        st.rotate(ringRot);
        st.scale(ringZoom, ringZoom);
        st.translate(focalOffsetX, focalOffsetY);
        st.drawImage(reelSourceImgCanvas, -imgW / 2, -imgH / 2, imgW, imgH);
        st.restore();
        reelPortalSoften(st, bw, bh);
        targetCtx.save();
        targetCtx.globalAlpha = rt;
        targetCtx.drawImage(reelStamp, 0, 0, bw, bh, bx, by, bw, bh);
        targetCtx.restore();
      }

      const travelDist = easeP * (0.75 + (zoomMax - 1.0) * 0.35);
      renderOpticalStarfield3D(targetCtx, outW, outH, layout, travelDist, 0, 0, p, 1.15);

      targetCtx.restore();
    }

    // =====================================================================
    // PRESET 9: ASTRO HUD TOUR (Flies from Target Pin / Detail Box to Pin -> Widefield!)
    // =====================================================================
    else {
      const zTarget = Math.max(1.8, state.reelZoomMax);
      let waypoints = [];

      if (state.annotations.length > 0) {
        waypoints = state.annotations.map(a => ({ cx: a.nx, cy: a.ny, z: zTarget }));
      } else if (state.detailBoxes.length > 0) {
        waypoints = state.detailBoxes.map(b => ({
          cx: b.nx + b.nw / 2,
          cy: b.ny + b.nh / 2,
          z: zTarget
        }));
      } else {
        waypoints = [
          { cx: state.reelTargetX, cy: state.reelTargetY, z: zTarget },
          { cx: clamp01(state.reelTargetX + 0.16), cy: clamp01(state.reelTargetY - 0.12), z: zTarget * 1.1 }
        ];
      }

      waypoints.push({ cx: 0.5, cy: 0.5, z: 1.0 });
      const segs = waypoints.length - 1;
      const tourEnd = 0.90;
      const scaledP = clamp01(p / tourEnd) * segs;
      const idx = Math.min(segs - 1, Math.floor(scaledP));
      const s = scaledP - idx;

      const w1 = waypoints[idx];
      const w2 = waypoints[idx + 1];
      // each leg: rest on the target (a gentle push-in), then fly to the next one and arrive at rest.
      const dwell = 0.26;
      const breathe = 0.045 * smoothstep(s / dwell);
      const f = smootherstep((s - dwell) / (1 - dwell));
      const z1 = w1.z * (1 + breathe);
      const currCx = lerp(w1.cx, w2.cx, f);
      const currCy = lerp(w1.cy, w2.cy, f);
      // zoom is blended on a log scale (constant zoom rate) with a slight pull-out mid-flight
      let currZ = Math.exp(lerp(Math.log(z1), Math.log(w2.z), f)) * (1 - 0.08 * Math.sin(Math.PI * f));
      // the closing shot keeps drifting in so the clip does not freeze
      currZ *= 1 + 0.02 * smoothstep((p - tourEnd) / (1 - tourEnd));

      targetCtx.save();
      if (!layout.isFullBleed) {
        targetCtx.beginPath();
        targetCtx.rect(layout.x, layout.y, imgW, imgH);
        targetCtx.clip();
      }

      targetCtx.translate(layout.x + imgW / 2, layout.y + imgH / 2);
      targetCtx.scale(currZ, currZ);
      targetCtx.translate((0.5 - currCx) * imgW, (0.5 - currCy) * imgH);
      targetCtx.drawImage(reelSourceImgCanvas, -imgW / 2, -imgH / 2, imgW, imgH);
      targetCtx.restore();

      renderOpticalStarfield3D(targetCtx, outW, outH, layout, p * 0.65, 0, 0, p, 0.75);
    }

    // Draw Telemetry Bar / Badge on Video if enabled
    drawTelemetryOverlay(targetCtx, outW, outH);
  }

  function updateReelWorkspaceStatusBadge() {
    if (state.appMode !== 'reel') return;
    const resLabel = state.reelVideoRes === 2160 ? '4K UHD' : (state.reelVideoRes === 1440 ? '2K QHD' : '1080p FHD');
    document.getElementById('resDims').textContent = `${resLabel} • ${state.reelFps}FPS`;
    const zoomEl = document.getElementById('resZoom');
    zoomEl.textContent = `${state.reelZoomMax.toFixed(1)}×`;
    document.getElementById('qDot').classList.remove('warn');
    zoomEl.classList.remove('warn');
  }

  function setupReelPreviewCanvas() {
    if (state.reelRecording) return;
    const aspect = getReelAspectRatio();
    const wrap = document.querySelector('.reel-canvas-wrap');
    const availableW = wrap && wrap.clientWidth ? wrap.clientWidth : 540;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    let previewW = Math.round(Math.max(540, Math.min(1280, availableW * dpr)));
    let previewH = Math.round(previewW / aspect);
    const availableH = wrap && wrap.clientHeight ? wrap.clientHeight : 680;
    const maxH = Math.max(420, Math.min(1000, availableH * dpr));
    if (previewH > maxH) {
      previewH = Math.round(maxH);
      previewW = Math.round(previewH * aspect);
    }
    reelCanvas.width = previewW;
    reelCanvas.height = previewH;
    prepareReelBuffers(previewW, previewH);
    updateReelWorkspaceStatusBadge();
  }

  function updateReelAimHintUI() {
    const el = document.getElementById('reelAimHint');
    if (el) {
      el.textContent = `Tap preview to aim (${Math.round(state.reelTargetX * 100)}%, ${Math.round(state.reelTargetY * 100)}%)`;
    }
  }

  reelCanvas.addEventListener('pointerdown', e => {
    if (state.reelRecording) return;
    const rect = reelCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    state.reelTargetX = clamp01((e.clientX - rect.left) / rect.width);
    state.reelTargetY = clamp01((e.clientY - rect.top) / rect.height);
    updateReelAimHintUI();
    reelAccumMs = 0; reelLastTickTime = performance.now();
    showToast(`Focal target set (${Math.round(state.reelTargetX * 100)}%, ${Math.round(state.reelTargetY * 100)}%)`);
  });

  let reelLastTickTime = 0;
  let reelAccumMs = 0;

  function startReelPreviewLoop() {
    if (state.reelRecording) return;
    cancelAnimationFrame(reelAnimId);
    state.reelPlaying = true;
    reelLastTickTime = performance.now();
    reelAccumMs = 0;
    const progressEl = document.getElementById('reelProgress');

    function tick(now) {
      if (!state.reelPlaying) return;
      const durMs = state.reelDuration * 1000;
      const rawDt = now - reelLastTickTime;
      reelLastTickTime = now;
      // Clamp frame delta to max 32ms so any background browser GC pause never causes a visual jump/stutter!
      const dt = Math.max(0, Math.min(32, rawDt));
      reelAccumMs = (reelAccumMs + dt) % (durMs + 450);

      const progress = clamp01(reelAccumMs / durMs);
      progressEl.style.transform = `scaleX(${progress.toFixed(4)})`;
      renderReelFrame(rctx, reelCanvas.width, reelCanvas.height, progress);
      reelAnimId = requestAnimationFrame(tick);
    }
    reelAnimId = requestAnimationFrame(tick);
  }

  function stopReelPreviewLoop() {
    state.reelPlaying = false;
    cancelAnimationFrame(reelAnimId);
  }

  // =========================================================================
  // PURE-JS fMP4 TO STANDARD NON-FRAGMENTED CFR MP4 REMUXER (TIKTOK / IG FIX)
  // Converts MediaRecorder's fragmented (iso5/moof/trun, duration=0) stream
  // into a 100% standard ISO MP4 (isom/mp42) with populated stts, stss, stsc,
  // stsz, stco tables and locked Constant Frame Rate (30.00 or 60.00 FPS).
  // =========================================================================
  async function remuxFmp4ToStandardMp4(fmp4Blob, targetFps, width, height) {
    try {
      const buf = await fmp4Blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const view = new DataView(buf);

      function readBoxHeader(offset) {
        if (offset + 8 > bytes.length) return null;
        let size = view.getUint32(offset, false);
        const type = String.fromCharCode(
          bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]
        );
        let hdrSize = 8;
        if (size === 1) {
          if (offset + 16 > bytes.length) return null;
          const hi = view.getUint32(offset + 8, false);
          const lo = view.getUint32(offset + 12, false);
          size = hi * 4294967296 + lo;
          hdrSize = 16;
        } else if (size === 0) {
          size = bytes.length - offset;
        }
        return { type, size, hdrSize, start: offset, contentStart: offset + hdrSize, end: offset + size };
      }

      function findBoxes(start, end) {
        const list = [];
        let off = start;
        while (off + 8 <= end) {
          const b = readBoxHeader(off);
          if (!b || b.size < 8 || b.end > end) break;
          list.push(b);
          off = b.end;
        }
        return list;
      }

      function findChild(parent, type) {
        return findBoxes(parent.contentStart, parent.end).find(b => b.type === type) || null;
      }

      const rootBoxes = findBoxes(0, bytes.length);
      const moovBox = rootBoxes.find(b => b.type === 'moov');
      const moofBoxes = rootBoxes.filter(b => b.type === 'moof');

      if (!moovBox || moofBoxes.length === 0) return fmp4Blob;

      // 1. Extract the original 'stsd' box (contains avc1, avcC, colr)
      let stsdBytes = null;
      const traks = findBoxes(moovBox.contentStart, moovBox.end).filter(b => b.type === 'trak');
      for (const trak of traks) {
        const mdia = findChild(trak, 'mdia');
        const minf = mdia && findChild(mdia, 'minf');
        const stbl = minf && findChild(minf, 'stbl');
        const stsd = stbl && findChild(stbl, 'stsd');
        if (stsd) {
          const rawStsd = bytes.slice(stsd.start, stsd.end);
          let ascii = '';
          for (let i = 0; i < rawStsd.length; i++) ascii += String.fromCharCode(rawStsd[i]);
          if (ascii.indexOf('avc1') !== -1 || ascii.indexOf('hvc1') !== -1 || ascii.indexOf('avc3') !== -1) {
            stsdBytes = rawStsd;
            break;
          }
        }
      }
      if (!stsdBytes) return fmp4Blob;

      // 2. Parse every moof -> traf -> trun to extract exact H.264 sample byte ranges
      const samples = [];
      let hasNonZeroCto = false;

      for (const moof of moofBoxes) {
        const trafs = findBoxes(moof.contentStart, moof.end).filter(b => b.type === 'traf');
        for (const traf of trafs) {
          const tfhd = findChild(traf, 'tfhd');
          if (!tfhd) continue;
          const tfhdFlags = view.getUint32(tfhd.contentStart, false) & 0xFFFFFF;
          let pos = tfhd.contentStart + 8;
          let baseDataOffset = moof.start;
          let defaultSampleDuration = 20;
          let defaultSampleSize = 0;
          let defaultSampleFlags = 0;

          if (tfhdFlags & 0x000001) {
            const hi = view.getUint32(pos, false);
            const lo = view.getUint32(pos + 4, false);
            baseDataOffset = hi * 4294967296 + lo;
            pos += 8;
          }
          if (tfhdFlags & 0x000002) pos += 4;
          if (tfhdFlags & 0x000008) { defaultSampleDuration = view.getUint32(pos, false); pos += 4; }
          if (tfhdFlags & 0x000010) { defaultSampleSize = view.getUint32(pos, false); pos += 4; }
          if (tfhdFlags & 0x000020) { defaultSampleFlags = view.getUint32(pos, false); pos += 4; }

          const truns = findBoxes(traf.contentStart, traf.end).filter(b => b.type === 'trun');
          let runningDataOffset = baseDataOffset;

          for (const trun of truns) {
            const trunFlags = view.getUint32(trun.contentStart, false) & 0xFFFFFF;
            const sampleCount = view.getUint32(trun.contentStart + 4, false);
            let tpos = trun.contentStart + 8;

            if (trunFlags & 0x000001) {
              const relOffset = view.getInt32(tpos, false);
              runningDataOffset = baseDataOffset + relOffset;
              tpos += 4;
            }
            let firstSampleFlags = defaultSampleFlags;
            if (trunFlags & 0x000004) {
              firstSampleFlags = view.getUint32(tpos, false);
              tpos += 4;
            }

            for (let i = 0; i < sampleCount; i++) {
              let sDur = defaultSampleDuration;
              let sSize = defaultSampleSize;
              let sFlags = i === 0 ? firstSampleFlags : defaultSampleFlags;
              let sCto = 0;

              if (trunFlags & 0x000100) { sDur = view.getUint32(tpos, false); tpos += 4; }
              if (trunFlags & 0x000200) { sSize = view.getUint32(tpos, false); tpos += 4; }
              if (trunFlags & 0x000400) { sFlags = view.getUint32(tpos, false); tpos += 4; }
              if (trunFlags & 0x000800) {
                sCto = view.getInt32(tpos, false);
                if (sCto !== 0) hasNonZeroCto = true;
                tpos += 4;
              }

              if (sSize > 0 && runningDataOffset + sSize <= bytes.length) {
                let isKeyframe = false;
                let nalPos = runningDataOffset;
                const sampleEnd = runningDataOffset + sSize;
                while (nalPos + 5 <= sampleEnd) {
                  const nalLen = view.getUint32(nalPos, false);
                  if (nalLen <= 0 || nalPos + 4 + nalLen > sampleEnd + 4) break;
                  const nalType = bytes[nalPos + 4] & 0x1F;
                  if (nalType === 5) { isKeyframe = true; break; }
                  nalPos += 4 + nalLen;
                }
                if (samples.length === 0) isKeyframe = true;

                samples.push({
                  offset: runningDataOffset,
                  size: sSize,
                  isKeyframe,
                  cto: sCto
                });
                runningDataOffset += sSize;
              }
            }
          }
        }
      }

      if (samples.length === 0) return fmp4Blob;

      // 3. Build a 100% Standard, Non-Fragmented ISO MP4 (FastStart: ftyp -> moov -> mdat)
      const timescale = 600;
      const sampleDelta = Math.round(timescale / targetFps); // 20 for 30fps, 10 for 60fps
      const totalDuration = samples.length * sampleDelta;

      function makeBox(type, ...payloads) {
        let totalLen = 8;
        for (const p of payloads) totalLen += p.byteLength;
        const out = new Uint8Array(totalLen);
        const dv = new DataView(out.buffer);
        dv.setUint32(0, totalLen, false);
        for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
        let offset = 8;
        for (const p of payloads) {
          out.set(new Uint8Array(p.buffer || p, p.byteOffset || 0, p.byteLength), offset);
          offset += p.byteLength;
        }
        return out;
      }

      function u32(val) {
        const b = new Uint8Array(4);
        new DataView(b.buffer).setUint32(0, val >>> 0, false);
        return b;
      }

      const ftypBox = makeBox(
        'ftyp',
        new Uint8Array([105, 115, 111, 109]), // 'isom'
        u32(0x00000200),
        new Uint8Array([
          105, 115, 111, 109, // isom
          105, 115, 111, 50,  // iso2
          97, 118, 99, 49,    // avc1
          109, 112, 52, 49    // mp41
        ])
      );

      const mvhdPayload = new Uint8Array(100);
      const mvhdDv = new DataView(mvhdPayload.buffer);
      mvhdDv.setUint32(12, timescale, false);
      mvhdDv.setUint32(16, totalDuration, false);
      mvhdDv.setUint32(20, 0x00010000, false);
      mvhdDv.setUint16(24, 0x0100, false);
      mvhdDv.setUint32(36, 0x00010000, false);
      mvhdDv.setUint32(52, 0x00010000, false);
      mvhdDv.setUint32(68, 0x40000000, false);
      mvhdDv.setUint32(96, 2, false);
      const mvhdBox = makeBox('mvhd', mvhdPayload);

      const tkhdPayload = new Uint8Array(84);
      const tkhdDv = new DataView(tkhdPayload.buffer);
      tkhdDv.setUint32(0, 0x00000003, false);
      tkhdDv.setUint32(12, 1, false);
      tkhdDv.setUint32(20, totalDuration, false);
      tkhdDv.setUint32(40, 0x00010000, false);
      tkhdDv.setUint32(56, 0x00010000, false);
      tkhdDv.setUint32(72, 0x40000000, false);
      tkhdDv.setUint32(76, (width << 16) >>> 0, false);
      tkhdDv.setUint32(80, (height << 16) >>> 0, false);
      const tkhdBox = makeBox('tkhd', tkhdPayload);

      const elstPayload = new Uint8Array(20);
      const elstDv = new DataView(elstPayload.buffer);
      elstDv.setUint32(4, 1, false);
      elstDv.setUint32(8, totalDuration, false);
      elstDv.setInt32(12, 0, false);
      elstDv.setUint32(16, 0x00010000, false);
      const edtsBox = makeBox('edts', makeBox('elst', elstPayload));

      const mdhdPayload = new Uint8Array(24);
      const mdhdDv = new DataView(mdhdPayload.buffer);
      mdhdDv.setUint32(12, timescale, false);
      mdhdDv.setUint32(16, totalDuration, false);
      mdhdDv.setUint16(20, 0x55C4, false);
      const mdhdBox = makeBox('mdhd', mdhdPayload);

      const hdlrPayload = new Uint8Array([
        0, 0, 0, 0, 0, 0, 0, 0,
        118, 105, 100, 101,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        86, 105, 100, 101, 111, 72, 97, 110, 100, 108, 101, 114, 0
      ]);
      const hdlrBox = makeBox('hdlr', hdlrPayload);

      const vmhdBox = makeBox('vmhd', new Uint8Array([0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0]));
      const drefBox = makeBox('dref', new Uint8Array([0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 12, 117, 114, 108, 32, 0, 0, 0, 1]));
      const dinfBox = makeBox('dinf', drefBox);

      const sttsPayload = new Uint8Array(16);
      const sttsDv = new DataView(sttsPayload.buffer);
      sttsDv.setUint32(4, 1, false);
      sttsDv.setUint32(8, samples.length, false);
      sttsDv.setUint32(12, sampleDelta, false);
      const sttsBox = makeBox('stts', sttsPayload);

      let cttsBox = new Uint8Array(0);
      if (hasNonZeroCto) {
        const cttsPayload = new Uint8Array(8 + samples.length * 8);
        const cttsDv = new DataView(cttsPayload.buffer);
        cttsDv.setUint32(0, 0x01000000, false); // version 1 (signed offsets)
        cttsDv.setUint32(4, samples.length, false);
        samples.forEach((s, i) => {
          cttsDv.setUint32(8 + i * 8, 1, false);
          cttsDv.setInt32(12 + i * 8, s.cto, false);
        });
        cttsBox = makeBox('ctts', cttsPayload);
      }

      const keyframeIndices = [];
      samples.forEach((s, idx) => { if (s.isKeyframe) keyframeIndices.push(idx + 1); });
      const stssPayload = new Uint8Array(8 + keyframeIndices.length * 4);
      const stssDv = new DataView(stssPayload.buffer);
      stssDv.setUint32(4, keyframeIndices.length, false);
      keyframeIndices.forEach((kIdx, i) => stssDv.setUint32(8 + i * 4, kIdx, false));
      const stssBox = makeBox('stss', stssPayload);

      const stscPayload = new Uint8Array(20);
      const stscDv = new DataView(stscPayload.buffer);
      stscDv.setUint32(4, 1, false);
      stscDv.setUint32(8, 1, false);
      stscDv.setUint32(12, 1, false);
      stscDv.setUint32(16, 1, false);
      const stscBox = makeBox('stsc', stscPayload);

      const stszPayload = new Uint8Array(12 + samples.length * 4);
      const stszDv = new DataView(stszPayload.buffer);
      stszDv.setUint32(8, samples.length, false);
      samples.forEach((s, i) => stszDv.setUint32(12 + i * 4, s.size, false));
      const stszBox = makeBox('stsz', stszPayload);

      const stcoPayload = new Uint8Array(8 + samples.length * 4);
      const stcoDv = new DataView(stcoPayload.buffer);
      stcoDv.setUint32(4, samples.length, false);
      const stcoDummy = makeBox('stco', stcoPayload);

      const stblDummy = makeBox('stbl', stsdBytes, sttsBox, cttsBox, stssBox, stscBox, stszBox, stcoDummy);
      const minfDummy = makeBox('minf', vmhdBox, dinfBox, stblDummy);
      const mdiaDummy = makeBox('mdia', mdhdBox, hdlrBox, minfDummy);
      const trakDummy = makeBox('trak', tkhdBox, edtsBox, mdiaDummy);
      const moovDummy = makeBox('moov', mvhdBox, trakDummy);

      const mdatDataStart = ftypBox.byteLength + moovDummy.byteLength + 8;
      let runningMdatOffset = mdatDataStart;
      for (let i = 0; i < samples.length; i++) {
        stcoDv.setUint32(8 + i * 4, runningMdatOffset, false);
        runningMdatOffset += samples[i].size;
      }

      const stcoFinal = makeBox('stco', stcoPayload);
      const stblFinal = makeBox('stbl', stsdBytes, sttsBox, cttsBox, stssBox, stscBox, stszBox, stcoFinal);
      const minfFinal = makeBox('minf', vmhdBox, dinfBox, stblFinal);
      const mdiaFinal = makeBox('mdia', mdhdBox, hdlrBox, minfFinal);
      const trakFinal = makeBox('trak', tkhdBox, edtsBox, mdiaFinal);
      const moovFinal = makeBox('moov', mvhdBox, trakFinal);

      const totalMdatSize = 8 + samples.reduce((acc, s) => acc + s.size, 0);
      const mdatHeader = new Uint8Array(8);
      new DataView(mdatHeader.buffer).setUint32(0, totalMdatSize, false);
      mdatHeader.set([109, 100, 97, 116], 4); // 'mdat'

      const blobParts = [ftypBox, moovFinal, mdatHeader];
      for (let i = 0; i < samples.length; i++) {
        blobParts.push(fmp4Blob.slice(samples[i].offset, samples[i].offset + samples[i].size));
      }

      return new Blob(blobParts, { type: 'video/mp4' });
    } catch (err) {
      return fmp4Blob;
    }
  }

  function reelHasLimitedMemory() {
    const memory = navigator.deviceMemory;
    return memory > 0 && memory <= 4;
  }

  function reelExportProfiles(aspect, resolution, fps) {
    const limitedMemory = reelHasLimitedMemory();
    const touch = annIsTouchDevice();
    const tiers = [resolution, 1440, 1080, 720].filter((res, index, all) =>
      res <= resolution && all.indexOf(res) === index && (!limitedMemory || res <= 1080));
    return tiers.flatMap(res => {
      const rates = res === resolution && fps === 60 && !limitedMemory ? [60, 30] : [30];
      const frameW = aspect >= 1 ? res * Math.min(1.6, aspect) : res;
      const frameH = frameW / aspect;
      const maxEdge = Math.min(4096, 2 * res);
      const maxPixels = res * res * (16 / 9);
      const scale = Math.min(1, maxEdge / Math.max(frameW, frameH), Math.sqrt(maxPixels / (frameW * frameH)));
      const width = Math.max(2, 2 * Math.floor(frameW * scale / 2 + 1e-7));
      const height = Math.max(2, 2 * Math.floor(frameH * scale / 2 + 1e-7));
      const constrained = limitedMemory || (touch && res <= 1080);
      const sourceEdge = constrained ? Math.min(1920, 2 * res) : res >= 2160 ? 4096 : 3072;
      const sourcePixels = constrained ? 3e6 : 8e6;
      const baseBitrate = { 2160: 16000000, 1440: 12000000, 1080: 8500000, 720: 5000000 }[res];
      return rates.map(rate => ({
        res, fps: rate, width, height, sourceEdge, sourcePixels,
        warpEdge: constrained ? 1280 : Infinity,
        bitrate: Math.round(baseBitrate * (rate === 60 ? 1.25 : 1)),
        needsEfficientEncoder: touch && (res > 1080 || rate > 30)
      }));
    });
  }

  async function reelRecorderMimes(profile) {
    const { width, height, bitrate, fps, needsEfficientEncoder } = profile;
    const blocks = Math.ceil(width / 16) * Math.ceil(height / 16);
    // H.264 levels constrain both the picture size and the number of macroblocks per second.
    const levels = [['28', 8192, 245760], ['2A', 8704, 522240], ['33', 36864, 983040], ['34', 36864, 2073600]];
    const level = levels.find(([, size, rate]) => blocks <= size && blocks * fps <= rate)?.[0] || '34';
    const mimes = [
      ...['6400', '4D40', '42E0'].map(profileId => 'video/mp4;codecs=avc1.' + profileId + level),
      'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'
    ].filter(mime => MediaRecorder.isTypeSupported(mime));

    if (!needsEfficientEncoder) return mimes;
    if (typeof navigator.mediaCapabilities?.encodingInfo !== 'function') return [];
    const explicit = mimes.filter(mime => mime.includes('.' + level) || mime.startsWith('video/webm;'));
    let timer;
    try {
      const checks = explicit.map(async mime => {
        try {
          const info = await navigator.mediaCapabilities.encodingInfo({
            type: 'record', video: { contentType: mime, width, height, bitrate, framerate: fps }
          });
          return info.supported && info.smooth && info.powerEfficient ? mime : null;
        } catch (_) {
          return null;
        }
      });
      return await Promise.race([
        Promise.all(checks).then(results => results.filter(Boolean)),
        new Promise(resolve => { timer = setTimeout(() => resolve([]), 450); })
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  function releaseReelExportBuffers() {
    releaseReelCanvas(reelCanvas);
    releaseReelCanvas(reelSourceImgCanvas);
    releaseReelCanvas(reelBgCanvas);
    reelSourceImgCanvas = reelBgCanvas = null;
    reelStars3D = [];
    if (WCE.dest) {
      releaseReelCanvas(WCE.dest.tex);
      releaseReelCanvas(WCE.dest.bg);
    }
    WCE.dest = WCE.destA = null;
    for (const buffer of [WCE.layer, WCE.layer2, WCE.bA, WCE.bB]) releaseReelCanvas(buffer);
    WCE.layer = WCE.layer2 = WCE.bA = WCE.bB = null;
    WCE.lctx = WCE.l2ctx = WCE.bAc = WCE.bBc = null;
    WCE.W = WCE.H = 0;
    wgReleaseTargets();
    if (Math.max(WG.A?.cap || 0, WG.B?.cap || 0) > reelPreviewTextureLimit()) {
      wgFreeScene(WG.A);
      wgFreeScene(WG.B);
      WG.A = WG.B = null;
      WG.instKey = '';
    }
  }

  function captureReelFrames(recorder, track, profile, duration, onProgress, gpuCanvas) {
    const { width, height, fps } = profile;
    const totalFrames = Math.max(1, Math.round(duration * fps));
    const endFrame = totalFrames + Math.round(fps * 0.2);
    const interval = 1000 / fps;
    return new Promise((resolve, reject) => {
      const chunks = [];
      let frame = 0;
      let animation;
      let timer;
      let nextFrameTime = 0;
      let ending = false;

      function cleanup() {
        cancelAnimationFrame(animation);
        clearTimeout(timer);
        recorder.ondataavailable = recorder.onerror = recorder.onstop = null;
        track?.removeEventListener('ended', failed);
        reelCanvas.removeEventListener('contextlost', failed);
        gpuCanvas?.removeEventListener('webglcontextlost', failed);
      }

      function failed(event) {
        cleanup();
        if (recorder.state !== 'inactive') {
          try { recorder.stop(); } catch (_) {}
        }
        reject(event?.error || (event instanceof Error ? event : new Error('The video encoder or graphics context stopped.')));
      }

      recorder.ondataavailable = event => {
        if (event.data?.size) chunks.push(event.data);
      };
      recorder.onerror = failed;
      recorder.onstop = () => {
        cleanup();
        if (!ending || !chunks.length) {
          reject(new Error('The encoder stopped before producing a complete video.'));
          return;
        }
        resolve(new Blob(chunks, { type: (chunks[0].type || recorder.mimeType).split(';')[0] }));
      };
      track?.addEventListener('ended', failed);
      reelCanvas.addEventListener('contextlost', failed);
      gpuCanvas?.addEventListener('webglcontextlost', failed);

      function step(now) {
        try {
          if (now + 1 < nextFrameTime) {
            animation = requestAnimationFrame(step);
            return;
          }
          if (frame > endFrame) {
            ending = true;
            timer = setTimeout(() => failed(new Error('The video encoder did not finish.')), 8000);
            recorder.stop();
            return;
          }
          if (rctx.isContextLost?.()) throw new Error('The video canvas lost its graphics context.');
          const progress = clamp01(frame / totalFrames);
          onProgress(progress);
          try { track?.requestFrame?.(); } catch (_) { /* automatic capture can still sample frames */ }
          renderReelFrame(rctx, width, height, progress);
          frame++;
          nextFrameTime = Math.max(nextFrameTime + interval, now + interval - 1);
          // Give the browser a paint before drawing over the capture canvas.
          animation = requestAnimationFrame(step);
        } catch (error) {
          failed(error);
        }
      }

      try {
        recorder.start();
        animation = requestAnimationFrame(step);
      } catch (error) {
        failed(error);
      }
    });
  }

  async function recordReelVideo(profile, mimes, duration, onProgress, onPreparing) {
    const { width, height, fps, bitrate } = profile;
    reelCanvas.width = width;
    reelCanvas.height = height;
    const stream = reelCanvas.captureStream(fps);
    try {
      let recorder;
      let encoderError;
      for (const mimeType of mimes) {
        try {
          recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate });
          break;
        } catch (error) {
          encoderError = error;
        }
      }
      if (!recorder) throw encoderError || new Error('No compatible video encoder is available.');

      let usesGPU = false;
      if (isWarpPreset(state.reelPreset)) {
        onPreparing();
        await WG.prep?.promise;
        const cap = wgCap();
        if (![WG.A, WG.B].every(scene => scene?.cap === cap)) {
          wgFreeScene(WG.A);
          wgFreeScene(WG.B);
          WG.A = WG.B = null;
        }
        usesGPU = await wgEnsureReady();
      }
      prepareReelBuffers(width, height);
      renderReelFrame(rctx, width, height, 0);
      if (usesGPU && (WG.lost || WG.gl.isContextLost())) throw new Error('The 3D graphics context was lost.');
      return await captureReelFrames(recorder, stream.getVideoTracks()[0], profile, duration,
        onProgress, usesGPU ? WG.canvas : null);
    } finally {
      stream.getTracks().forEach(track => track.stop());
    }
  }

  async function renderFullResVideo() {
    if (state.reelRecording || !state.img) return;
    const btn = document.getElementById('btnRenderReel');
    const label = document.getElementById('lblRenderBtn');
    const save = document.getElementById('btnSaveRenderedVideo');
    const status = document.getElementById('reelStatusBadge');
    const progressBar = document.getElementById('reelProgress');
    const controls = document.querySelectorAll('#reelDeck .col-subpanel, #reelHud');
    const formatControls = Array.from(document.querySelectorAll('#reelPanelFormat button, #reelPanelFormat input, #reelPanelFormat select'),
      control => ({ control, disabled: control.disabled }));
    const image = state.img;
    const previousVideoReady = save.classList.contains('visible');
    const resolution = state.reelVideoRes;
    const fps = state.reelFps || 30;
    const preset = state.reelPreset;
    const duration = state.reelDuration;
    const profiles = reelExportProfiles(getReelAspectRatio(), resolution, fps);

    stopReelPreviewLoop();
    state.reelRecording = true;
    if (photoReview && !photoReview.result) {
      photoReview.controller.abort();
      photoReview = null;
    }
    btn.disabled = true;
    controls.forEach(panel => { panel.inert = true; });
    formatControls.forEach(({ control }) => { control.disabled = true; });
    save.classList.remove('visible');
    label.textContent = 'Checking the video encoder…';

    try {
      if (typeof MediaRecorder === 'undefined' || typeof reelCanvas.captureStream !== 'function') {
        throw new Error('Video export is unavailable in this browser.');
      }
      let profile;
      let rawVideo;
      let explainedFallback = false;
      for (const candidate of profiles) {
        const mimes = await reelRecorderMimes(candidate);
        if (state.img !== image) throw new Error('The photo changed during export.');
        if (!mimes.length) continue;
        const { width, height, fps: rate } = candidate;
        const layout = width + '×' + height + ' · ' + rate + ' fps';
        if (!explainedFallback && (resolution !== candidate.res || fps !== rate)) {
          explainedFallback = true;
          showToast('Using ' + layout + ' for this device');
        }
        status.textContent = layout;
        reelExportProfile = candidate;
        wgReleaseTargets();
        try {
          rawVideo = await recordReelVideo(candidate, mimes, duration, progress => {
            if (state.img !== image) throw new Error('The photo changed during export.');
            const percent = Math.round(progress * 100);
            label.textContent = 'Rendering ' + percent + '%…';
            status.textContent = layout + ' · ' + percent + '%';
            progressBar.style.transform = 'scaleX(' + progress.toFixed(3) + ')';
          }, () => { label.textContent = 'Preparing 3D scene…'; });
          profile = candidate;
          break;
        } catch (error) {
          if (state.img !== image) throw error;
          console.warn('[reel] Export attempt failed at ' + layout, error);
          label.textContent = 'Trying a lighter export…';
        } finally {
          releaseReelExportBuffers();
          reelExportProfile = null;
        }
      }
      if (!profile) throw new Error('The video encoder could not finish the export on this device.');

      const { width, height, fps: rate } = profile;
      const isMp4 = rawVideo.type === 'video/mp4';
      const ext = isMp4 ? 'mp4' : 'webm';
      label.textContent = 'Finalizing video…';
      const finalVideo = isMp4 ? await remuxFmp4ToStandardMp4(rawVideo, rate, width, height) : rawVideo;
      if (state.img !== image) throw new Error('The photo changed during export.');
      const file = new File([finalVideo],
        'InstaSlice_' + width + 'x' + height + '_' + rate + 'fps_' + preset + '.' + ext, { type: finalVideo.type });
      const url = URL.createObjectURL(finalVideo);
      if (state.lastVideoUrl) URL.revokeObjectURL(state.lastVideoUrl);
      state.lastVideoUrl = url;
      state.lastVideoFile = file;

      const output = width + '×' + height + ' · ' + rate + ' fps';
      label.textContent = 'Re-Render • ' + output;
      status.textContent = output + ' · ' + ext.toUpperCase();
      document.getElementById('lblSaveVideoBtn').textContent = 'Save / Share Video • ' + output;
      save.classList.add('visible');
      showToast(ext.toUpperCase() + ' ready · ' + output);
    } catch (error) {
      updateRenderBtnLabel();
      status.textContent = 'Video export unavailable';
      if (previousVideoReady && state.img === image) save.classList.add('visible');
      showToast(error.message || 'Video export could not be completed.');
    } finally {
      const exportStatus = status.textContent;
      state.reelRecording = false;
      updatePhotoPrivacyReview();
      btn.disabled = false;
      controls.forEach(panel => { panel.inert = false; });
      formatControls.forEach(({ control, disabled }) => { control.disabled = disabled; });
      if (state.appMode === 'reel') {
        document.getElementById('btnTogglePlayReel').textContent = 'Pause';
        setupReelPreviewCanvas();
        startReelPreviewLoop();
      }
      status.textContent = exportStatus;
    }
  }

  document.getElementById('btnSaveRenderedVideo').addEventListener('click', async () => {
    if (!state.lastVideoFile || !state.lastVideoUrl) return;
    
    const isMobileDevice = annIsTouchDevice();
    if (isMobileDevice) {
      try {
        if (navigator.canShare && navigator.canShare({ files: [state.lastVideoFile] })) {
          await navigator.share({
            files: [state.lastVideoFile],
            title: 'InstaSlice 3D CineReel'
          });
          return;
        }
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }

    const a = document.createElement('a');
    a.href = state.lastVideoUrl;
    a.download = state.lastVideoFile.name;
    a.click();
    showToast('Download started · video');
  });

  // =========================================================================
  // WHATSAPP / iOS QUICKLOOK IMAGE LOADER + CLIPBOARD PASTE ENGINE
  // =========================================================================
  const fileInputEl = document.getElementById('fileInput');
  const fileInputRawEl = document.getElementById('fileInputRaw');
  const pasteDropzone = document.getElementById('pasteDropzone');

  function applyLoadedImageSource(sourceElem, origW, origH) {
    const maxDim = 4096;
    const scale = Math.min(1, maxDim / Math.max(origW, origH));
    const w = Math.max(1, Math.round(origW * scale));
    const h = Math.max(1, Math.round(origH * scale));

    const normCanvas = document.createElement('canvas');
    normCanvas.width = w;
    normCanvas.height = h;
    const nctx = normCanvas.getContext('2d');
    nctx.imageSmoothingEnabled = true;
    nctx.imageSmoothingQuality = 'high';
    nctx.drawImage(sourceElem, 0, 0, w, h);

    normCanvas.sourceWidth = origW;
    normCanvas.sourceHeight = origH;
    if (state.appMode === 'collage') {
      ensureCollageCellsCount();
      const cell = collageState.cells[collageState.activeCell];
      if (cell) {
        saveCollageUndo();
        setCollageCellImage(cell, normCanvas, false);
      }
      document.getElementById('pasteModal').classList.remove('open');
      syncCollageUI();
      renderCollagePreview();
      showToast(`Loaded ${origW}×${origH}px into Box #${collageState.activeCell + 1}`);
      return;
    }

    rememberCollageSourcePins();
    state.img = normCanvas;
    resetStarSolveUI();
    resetMoonUI();
    state.annotations = [];
    state.selectedPinId = null;
    state.placingPinMode = false;
    const pinBanner = document.getElementById('pinModeBanner');
    if (pinBanner) pinBanner.classList.remove('active');
    syncAnnotationModalUI();
    renderAnnotationList();
    updateAnnotationExportUI();
    state.rot90 = 0;
    state.fineAngle = 0;
    updateAnnotationExportUI();
    state.detailBoxes = [];
    state.undoStack = [];
    updateUndoButtonUI();
    document.getElementById('rngAngle').value = 0;
    document.getElementById('lblAngle').textContent = '0.0°';
    document.getElementById('pasteModal').classList.remove('open');
    syncCanvasSize();

    fitImageToCrop();
    generateSlices();
    if (state.appMode === 'reel') {
      setupReelPreviewCanvas();
      startReelPreviewLoop();
    }
    showToast(`Loaded ${origW}×${origH}px`);
  }

  function loadFromDataOrBlobUrl(url, revokeAfter = false) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (w > 0 && h > 0) {
          applyLoadedImageSource(img, w, h);
          if (revokeAfter) URL.revokeObjectURL(url);
          resolve(true);
        } else {
          if (revokeAfter) URL.revokeObjectURL(url);
          resolve(false);
        }
      };
      img.onerror = () => {
        if (revokeAfter) URL.revokeObjectURL(url);
        resolve(false);
      };
      img.src = url;
    });
  }

  async function processSelectedFile(file, inputElemToReset) {
    if (!file) return;
    showToast('Loading photo...');

    // Stage 1: Fast ObjectURL -> Image (Works on standard iOS Safari, Chrome, Android)
    try {
      const objUrl = URL.createObjectURL(file);
      const ok = await loadFromDataOrBlobUrl(objUrl, true);
      if (ok) {
        if (inputElemToReset) inputElemToReset.value = '';
        return;
      }
    } catch (_) {}

    // Stage 2: Classic FileReader DataURL (Most compatible with local file:// WebViews)
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = ev => resolve(ev.target.result);
        reader.onerror = () => reject(new Error('FileReader error'));
        reader.readAsDataURL(file);
      });
      if (dataUrl) {
        const ok = await loadFromDataOrBlobUrl(dataUrl, false);
        if (ok) {
          if (inputElemToReset) inputElemToReset.value = '';
          return;
        }
      }
    } catch (_) {}

    // Stage 3: createImageBitmap fallback
    if (typeof createImageBitmap === 'function') {
      try {
        const bmp = await createImageBitmap(file);
        if (bmp && bmp.width > 0) {
          applyLoadedImageSource(bmp, bmp.width, bmp.height);
          if (typeof bmp.close === 'function') bmp.close();
          if (inputElemToReset) inputElemToReset.value = '';
          return;
        }
      } catch (_) {}
    }

    showToast('Could not read file — try 📋 Paste Photo!');
  }

  fileInputEl.addEventListener('change', async e => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    if (state.appMode === 'collage' && files.length > 1) {
      await loadFilesIntoCollageBoxes(files, collageState.activeCell);
      fileInputEl.value = '';
      return;
    }
    processSelectedFile(files[0], fileInputEl);
  });

  fileInputRawEl.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if (file) processSelectedFile(file, fileInputRawEl);
  });

  // Open Paste Modal button in top bar
  document.getElementById('btnOpenPasteModal').addEventListener('click', () => {
    document.getElementById('pasteModal').classList.add('open');
  });

  // 1-Tap Clipboard API Reader (iOS 16+ / Android / Desktop)
  document.getElementById('btnClipboardReadApi').addEventListener('click', async () => {
    if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
      pasteDropzone.focus();
      showToast('Tap the dashed box below and select "Paste"');
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imgType = item.types.find(t => t.startsWith('image/'));
        if (imgType) {
          const blob = await item.getType(imgType);
          await processSelectedFile(blob, null);
          return;
        }
      }
      showToast('No copied photo found — copy a photo first!');
    } catch (err) {
      pasteDropzone.focus();
      showToast('Tap inside the dashed box below and press "Paste"');
    }
  });

  // Handle Paste event anywhere in the window OR inside the contenteditable pasteDropzone
  function handlePasteEvent(e) {
    const cd = e.clipboardData || window.clipboardData;
    if (cd && cd.items) {
      for (let i = 0; i < cd.items.length; i++) {
        const item = cd.items[i];
        if (item.type && item.type.indexOf('image') !== -1) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (blob) {
            processSelectedFile(blob, null);
            return;
          }
        }
      }
    }
    // If iOS QuickLook pasted an <img> tag directly into the contenteditable pasteDropzone, extract its src!
    setTimeout(() => {
      const pastedImg = pasteDropzone.querySelector('img');
      if (pastedImg && pastedImg.src) {
        const src = pastedImg.src;
        pasteDropzone.innerHTML = `<span>Tap here &amp; select "Paste"</span><span class="sub">Works inside WhatsApp, QuickLook, Safari &amp; Documents</span>`;
        loadFromDataOrBlobUrl(src, false);
      }
    }, 60);
  }

  window.addEventListener('paste', handlePasteEvent);
  pasteDropzone.addEventListener('paste', handlePasteEvent);

  // Also observe DOM mutations inside pasteDropzone in case iOS inserts an <img> without firing 'paste'
  const pasteObserver = new MutationObserver(() => {
    const pastedImg = pasteDropzone.querySelector('img');
    if (pastedImg && pastedImg.src) {
      const src = pastedImg.src;
      pasteDropzone.innerHTML = `<span>Tap here &amp; select "Paste"</span><span class="sub">Works inside WhatsApp, QuickLook, Safari &amp; Documents</span>`;
      loadFromDataOrBlobUrl(src, false);
    }
  });
  pasteObserver.observe(pasteDropzone, { childList: true, subtree: true });

  document.getElementById('btnDemo').addEventListener('click', () => {
    document.getElementById('settingsModal').classList.remove('open');
    loadDemoImage(true);
  });
  document.getElementById('btnUndoMove').addEventListener('click', undoLastMove);

  document.getElementById('btnFitCrop').addEventListener('click', () => {
    saveUndoBeforeAction();
    state.showBlurOnMain = false;
    fitImageToCrop();
  });
  document.getElementById('btnZoom100').addEventListener('click', () => {
    saveUndoBeforeAction();
    state.showBlurOnMain = false;
    setZoom100();
  });
  document.getElementById('btnCenter').addEventListener('click', () => {
    saveUndoBeforeAction();
    state.showBlurOnMain = false;
    state.offsetX = 0;
    state.offsetY = 0;
    renderCanvas();
  });
  document.getElementById('btnRot90').addEventListener('click', () => { rotateMainImage90(); });

  // Direction & Reverse
  document.getElementById('dirHoriz').addEventListener('click', () => {
    saveUndoBeforeAction();
    state.showBlurOnMain = false;
    state.direction = 'horiz';
    document.getElementById('dirHoriz').classList.add('active');
    document.getElementById('dirVert').classList.remove('active');
    updatePrimaryButtonLabel();
    fitImageToCrop();
  });
  document.getElementById('dirVert').addEventListener('click', () => {
    saveUndoBeforeAction();
    state.showBlurOnMain = false;
    state.direction = 'vert';
    document.getElementById('dirVert').classList.add('active');
    document.getElementById('dirHoriz').classList.remove('active');
    updatePrimaryButtonLabel();
    fitImageToCrop();
  });
  document.getElementById('btnRevOrder').addEventListener('click', e => {
    saveUndoBeforeAction();
    state.showBlurOnMain = false;
    state.reverseOrder = !state.reverseOrder;
    e.currentTarget.textContent = state.reverseOrder ? 'N→1' : '1→N';
    e.currentTarget.classList.toggle('toggle-on', state.reverseOrder);
    renderCanvas();
  });

  // Aspect Ratio
  document.querySelectorAll('#ratioGroup .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      saveUndoBeforeAction();
      state.showBlurOnMain = false;
      document.querySelectorAll('#ratioGroup .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.aspect = btn.dataset.ratio;
      fitImageToCrop();
    });
  });

  // Slice Count
  document.querySelectorAll('#countGroup .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      saveUndoBeforeAction();
      state.showBlurOnMain = false;
      document.querySelectorAll('#countGroup .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.sliceCount = parseInt(btn.dataset.count, 10);
      updatePrimaryButtonLabel();
      fitImageToCrop();
    });
  });

  // Capture Buttons
  document.getElementById('btnSliceMain').addEventListener('click', generateSlices);
  document.getElementById('btnAddDetail').addEventListener('click', addDetailSlide);
  document.getElementById('btnAddFit').addEventListener('click', addFullFitSlide);
  document.getElementById('btnAddMap').addEventListener('click', addBoxMapSlide);

  document.getElementById('btnClearSlides').addEventListener('click', () => {
    state.slides = [];
    state.detailBoxes = [];
    renderFilmstrip();
  });

  // Main Deck Blur Slider
  const rngMainBlur = document.getElementById('rngMainBlur');
  rngMainBlur.addEventListener('input', e => {
    const val = parseInt(e.target.value, 10);
    setFitBackgroundStyle('blur');
    syncBlurControls(val);
    state.showBlurOnMain = true;
    renderCanvas();
  });
  rngMainBlur.addEventListener('change', () => {
    setTimeout(() => {
      state.showBlurOnMain = false;
      renderCanvas();
    }, 900);
  });

  // Modals Open/Close
  function openStyleModal() {
    state.showBlurOnMain = false;
    updateFitStylePreview();
    document.getElementById('styleModal').classList.add('open');
  }
  document.getElementById('btnOpenStyle').addEventListener('click', openStyleModal);
  document.getElementById('btnOpenStyleQuick').addEventListener('click', openStyleModal);

  function toggleMarkersVisibility() {
    state.markersVisible = !state.markersVisible;
    for (const id of ['btnOpenAnnotate', 'btnAnnMarkers', 'btnColMarkers']) {
      const button = document.getElementById(id);
      if (!button) continue;
      button.setAttribute('aria-pressed', String(state.markersVisible));
      button.classList.toggle('amber-hi', state.markersVisible);
    }
    if (state.appMode === 'collage') renderCollagePreview();
    else renderCanvas();
  }

  document.getElementById('btnOpenAnnotate').addEventListener('click', toggleMarkersVisibility);
  document.getElementById('btnAnnMarkers').addEventListener('click', toggleMarkersVisibility);
  document.getElementById('btnAnnRot90').addEventListener('click', rotateMainImage90);
  document.getElementById('annotationAspect').addEventListener('change', event => {
    saveUndoBeforeAction();
    cancelAnimationFrame(annAnim);
    state.annotationAspect = event.target.value;
    state.annZoom = 1;
    state.annCx = state.annCy = 0.5;
    updateAnnotationExportUI();
    renderCanvas();
  });

  document.getElementById('btnSettings').addEventListener('click', () => {
    document.getElementById('settingsModal').classList.add('open');
  });
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById(btn.dataset.close).classList.remove('open');
      renderCanvas();
      if (state.appMode === 'collage') renderCollagePreview();
      else if (state.appMode === 'reel' && !state.reelRecording) setupReelPreviewCanvas();
    });
  });

  // Live Title & Subtitle Editing for Selected Target Pin
  document.getElementById('annTitleInput').addEventListener('input', e => {
    const sel = getSelectedAnnotation();
    if (sel) {
      sel.title = e.target.value;
      sel.tEdit = true;
      renderAnnotationList();
      renderCanvas();
    }
  });

  document.getElementById('annSubInput').addEventListener('input', e => {
    const sel = getSelectedAnnotation();
    if (sel) {
      sel.sub = e.target.value;
      sel.tEdit = true;
      renderAnnotationList();
      renderCanvas();
    }
  });

  function privOpen(id) { const el = document.getElementById(id); if (el) el.classList.add('open'); }
  function privClose(id) { const el = document.getElementById(id); if (el) el.classList.remove('open'); }
  document.getElementById('btnFindStarTargets').addEventListener('click', () => identifyStarfieldTargets());
  const starWcsFile = document.getElementById('starWcsFile');
  document.getElementById('btnImportStarWcs').addEventListener('click', () => starWcsFile.click());
  document.getElementById('btnFlipStarWcs').addEventListener('click', () => {
    if (state.starSolve?.source !== 'Imported WCS') return;
    const { height } = state.starSolve;
    state.starAllCandidates.forEach(candidate => { candidate.y = height - 1 - candidate.y; });
    renderStarCandidates();
    setStarSolveStatus('WCS alignment flipped. Apply the selected targets to place their pins.', 'success');
  });
  starWcsFile.addEventListener('change', () => {
    const file = starWcsFile.files[0];
    starWcsFile.value = '';
    if (file) identifyStarfieldTargets(file);
  });
  initPlateOffline();
  document.querySelectorAll('[data-open]').forEach(btn => btn.addEventListener('click', () => privOpen(btn.dataset.open)));
  document.getElementById('btnOpenPrivacy').addEventListener('click', () => { privClose('settingsModal'); privOpen('privacyModal'); });
  const privacyModal = document.getElementById('privacyModal');
  privacyModal.addEventListener('click', e => { if (e.target === privacyModal) privClose('privacyModal'); });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && privacyModal.classList.contains('open')) {
      privClose('privacyModal');
      e.preventDefault();
    }
  });
  // privacy notice: contact address is put together here, so it is not sitting in the page source for address harvesters
  const privMail = document.getElementById('privMail');
  if (privMail && privMail.dataset.u && privMail.dataset.d) {
    const addr = privMail.dataset.u + '@' + privMail.dataset.d;
    privMail.href = 'mailto:' + addr;
    privMail.textContent = addr;
  }
  // privacy notice: expand / collapse every section at once
  const privExpand = document.getElementById('btnPrivExpand');
  const privSections = Array.from(document.querySelectorAll('#privacyModal details.priv-sec'));
  function syncPrivExpand() {
    if (privExpand) privExpand.textContent = privSections.every(d => d.open) ? 'Collapse all sections' : 'Expand all sections';
  }
  privSections.forEach(d => d.addEventListener('toggle', syncPrivExpand));
  if (privExpand) privExpand.addEventListener('click', () => {
    const open = !privSections.every(d => d.open);
    privSections.forEach(d => { d.open = open; });
    syncPrivExpand();
  });
  document.getElementById('btnApplyStarTargets').addEventListener('click', applyStarCandidatesAsPins);
  document.getElementById('btnStarSelectAll').addEventListener('click', () => setAllStarCandidatesSelected(true));
  document.getElementById('btnStarDeselectAll').addEventListener('click', () => setAllStarCandidatesSelected(false));
  document.getElementById('btnExportAnnotatedFull').addEventListener('click', exportFullAnnotatedImage);

  document.getElementById('btnSyncAllPins').addEventListener('click', () => {
    state.syncAllPins = !state.syncAllPins;
    if (state.syncAllPins && state.annotations.length > 0) {
      state.annotations.forEach(a => {
        a.style = state.annDraftStyle;
        a.color = state.annDraftColor;
        a.fontFamily = state.annDraftFont;
        a.bgStyle = state.annDraftBg;
        a.sizeMult = state.annDraftSize;                    // (the fitted circle size of each pin is kept: only "Aperture" itself sets one common size)
        a.fontWeight = state.annDraftWeight;
        a.textCase = state.annDraftCase;
        a.track = state.annDraftTrack;
        a.textMode = state.annDraftTextMode;
        a.textHex = state.annDraftTextHex;
        a.lineMult = state.annDraftLine;
        a.labelIn = state.annDraftIn;
      });
      renderCanvas();
      showToast('Synced style across all target pins');
    } else {
      showToast('Independent pin styling enabled');
    }
    syncAnnotationModalUI();
  });

  // 6 Marker Style Cards
  document.querySelectorAll('#annStyleGroup .ann-style-card').forEach(btn => {
    btn.addEventListener('click', () => {
      state.annDraftStyle = btn.dataset.astyle;
      applyStyleChangeToPins('style', state.annDraftStyle);
      syncAnnotationModalUI();
    });
  });

  function applyAnnotationDraftColor(validHex) {
    state.annDraftColor = validHex.toUpperCase();
    state.annBaseColor = state.annDraftColor;
    if (state.syncAllPins) state.annColorByType = false;
    applyStyleChangeToPins('color', state.annDraftColor);
    syncAnnotationModalUI();
  }

  document.querySelectorAll('#annColorGroup .color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      applyAnnotationDraftColor(sw.dataset.acolor);
    });
  });

  document.getElementById('annHexInput').addEventListener('input', e => {
    const valid = normalizeHexColor(e.target.value);
    if (valid) applyAnnotationDraftColor(valid);
  });

  document.getElementById('annColorPicker').addEventListener('input', e => {
    const valid = normalizeHexColor(e.target.value);
    if (valid) applyAnnotationDraftColor(valid);
  });

  // Annotation & Telemetry Font Selector
  document.getElementById('annFontSelect').addEventListener('change', e => {
    state.annDraftFont = e.target.value;
    applyStyleChangeToPins('fontFamily', state.annDraftFont);
    ensureCanvasFontReady(state.annDraftFont, () => {
      renderCanvas();
      if (state.appMode === 'collage') renderCollagePreview();
    });
  });

  // Label Backdrop Style Selector ('shelf' | 'glass' | 'pure' | 'solid')
  document.querySelectorAll('#annBgGroup .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.annDraftBg = btn.dataset.abg;
      applyStyleChangeToPins('bgStyle', state.annDraftBg);
      syncAnnotationModalUI();
    });
  });

  // Callout Quadrant Direction ('tr' | 'tl' | 'br' | 'bl')
  document.querySelectorAll('#annDirGroup .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.annDraftDir = btn.dataset.adir;
      const sel = getSelectedAnnotation();
      if (sel) sel.dir = state.annDraftDir;
      else if (state.annotations.length > 0) state.annotations[state.annotations.length - 1].dir = state.annDraftDir;
      syncAnnotationModalUI();
      renderAnnotationList();
      renderCanvas();
    });
  });

  // Marker Scale & Aperture Radius Sliders
  document.getElementById('rngAnnSize').addEventListener('input', e => {
    state.annDraftSize = parseFloat(e.target.value);
    document.getElementById('lblAnnSize').textContent = `${state.annDraftSize.toFixed(2)}×`;
    applyStyleChangeToPins('sizeMult', state.annDraftSize);
  });

  document.getElementById('rngAnnRadius').addEventListener('input', e => {
    const prevVal = state.annDraftRadius || 1.0;
    const nextVal = parseFloat(e.target.value);
    state.annDraftRadius = nextVal;
    document.getElementById('lblAnnRadius').textContent = `${nextVal.toFixed(2)}×`;
    const sel = getSelectedAnnotation();
    if (state.syncAllPins && state.annotations.length > 1) {
      const ratio = prevVal > 0.01 ? (nextVal / prevVal) : 1;
      state.annotations.forEach(a => {
        a.radMult = Math.max(0.14, Math.min(8.0, (a.radMult || 1.0) * ratio));
      });
      renderAnnotationList();
      renderCanvas();
    } else if (sel) {
      sel.radMult = nextVal;
      sel.autoR = false;
      renderAnnotationList();
      renderCanvas();
    } else {
      applyStyleChangeToPins('radMult', nextVal);
    }
  });

  // ----- Style tab: text, line weight, label position and layout, colour by type, Moon outline -----
  (function annStyleHandlers() {
    const $ = id => document.getElementById(id);
    const seg = (group, attr, fn) => document.querySelectorAll(group + ' .seg-btn').forEach(btn => btn.addEventListener('click', () => fn(btn.dataset[attr])));
    seg('#annWeightGroup', 'w', v => { state.annDraftWeight = parseInt(v, 10) || 600; applyStyleChangeToPins('fontWeight', state.annDraftWeight); syncAnnotationModalUI(); });
    seg('#annCaseGroup', 'case', v => { state.annDraftCase = v === 'upper' ? 'upper' : 'normal'; applyStyleChangeToPins('textCase', state.annDraftCase); syncAnnotationModalUI(); });
    seg('#annTextModeGroup', 'tm', v => { state.annDraftTextMode = v; applyStyleChangeToPins('textMode', v); syncAnnotationModalUI(); });
    $('annTextColor').addEventListener('input', e => {
      const hex = normalizeHexColor(e.target.value);
      if (!hex) return;
      state.annDraftTextHex = hex.toUpperCase(); state.annDraftTextMode = 'custom';
      const sel = getSelectedAnnotation();
      state.annotations.forEach(a => { if (state.syncAllPins || a === sel) { a.textHex = state.annDraftTextHex; a.textMode = 'custom'; } });
      syncAnnotationModalUI(); renderAnnotationList(); renderCanvas();
    });
    $('rngAnnTrack').addEventListener('input', e => {
      state.annDraftTrack = parseFloat(e.target.value) || 0;
      $('lblAnnTrack').textContent = Math.round(state.annDraftTrack * 100) + '%';
      applyStyleChangeToPins('track', state.annDraftTrack);
    });
    $('rngAnnLine').addEventListener('input', e => {
      state.annDraftLine = parseFloat(e.target.value) || 1;
      $('lblAnnLine').textContent = state.annDraftLine.toFixed(2) + '×';
      applyStyleChangeToPins('lineMult', state.annDraftLine);
    });
    $('rngAnnLabel').addEventListener('input', e => {
      state.annLabelScale = parseFloat(e.target.value) || 1;
      $('lblAnnLabel').textContent = state.annLabelScale.toFixed(2) + '×';
      renderCanvas();
    });
    seg('#annInGroup', 'in', v => { state.annDraftIn = v === 'in' ? 'in' : 'out'; applyStyleChangeToPins('labelIn', state.annDraftIn); syncAnnotationModalUI(); });
    seg('#annSubGroup', 'sub', v => { state.annShowSub = v !== '0'; syncAnnotationModalUI(); renderCanvas(); });
    seg('#annLayoutGroup', 'lay', v => { state.annLayoutMode = v; syncAnnotationModalUI(); renderCanvas(); });
    seg('#annCoordGroup', 'c', v => {
      state.skyCoords = v === '1';
      state.annotations.forEach(p => {
        if (p.skyId && !String(p.catalogId || '').startsWith('moon:')) p.sub = buildSkySub({ id: p.skyId, type: p.objectType, mag: p.mag, ra: p.ra, dec: p.dec }, p.title, state.skyCoords);
      });
      syncAnnotationModalUI(); renderAnnotationList(); renderCanvas();
    });
    // colour by object type: every pin that knows its type takes the tint of that type; switching off returns them to the chosen colour
    $('annByType').addEventListener('click', () => {
      state.annColorByType = !state.annColorByType;
      state.annotations.forEach(a => {
        if (state.annColorByType) { const c = annTypeColor(a); if (c) a.color = c; }
        else if (annTypeColor(a)) a.color = state.annBaseColor;
      });
      if (!state.annColorByType) state.annDraftColor = state.annBaseColor;
      syncAnnotationModalUI(); renderAnnotationList(); renderCanvas();
    });
    // Moon: outline (hidden / guide while working / printed on the picture)
    document.querySelectorAll('[data-ring]').forEach(b => b.addEventListener('click', () => { state.moonRing = b.dataset.ring; moonSyncGuides(); renderCanvas(); }));
    // On a phone the control area is short, so the three Style sections behave as an accordion: one open at a time, the first by default
    const secs = ['annSecMarker', 'annSecText', 'annSecLabel'].map(id => $(id)).filter(Boolean);
    const mqSec = window.matchMedia('(max-width: 899px) and (orientation: portrait), (max-width: 639px), (max-width: 899px) and (min-height: 541px)');
    if (secs.length && mqSec.matches) secs.forEach((d, i) => { d.open = i === 0; });
    let secBusy = false;
    secs.forEach(d => d.addEventListener('toggle', () => {
      if (secBusy || !d.open || !mqSec.matches) return;
      secBusy = true; secs.forEach(o => { if (o !== d) o.open = false; }); secBusy = false;
      const pane = d.closest('.ann-pane');
      if (pane) pane.scrollTop = Math.max(0, d.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop - 4);
    }));
  })();


  document.getElementById('btnAddPinCenter').addEventListener('click', () => {
    saveUndoBeforeAction();
    const offsets = [
      [0.48, 0.46], [0.35, 0.38], [0.62, 0.54], [0.40, 0.60], [0.60, 0.36]
    ];
    const [nx, ny] = offsets[state.annotations.length % offsets.length];
    addAnnotationAt(clamp01(nx), clamp01(ny));
  });

  // 1-Click Demo Plate-Solve Multi-Target Preset
  document.getElementById('btnAddPresetPins').addEventListener('click', () => {
    saveUndoBeforeAction();
    state.annotations = [];
    addAnnotationAt(0.49, 0.47, {
      title: 'Melotte 15',
      sub: 'Open Cluster • Core',
      style: 'reticle',
      dir: 'tr',
      radMult: 1.15
    });
    addAnnotationAt(0.36, 0.54, {
      title: 'Bok Globule',
      sub: 'Dark Dust Pillar',
      style: 'pointer',
      dir: 'tl',
      radMult: 0.85
    });
    addAnnotationAt(0.62, 0.43, {
      title: 'HD 15558',
      sub: 'O5 Ionizing Star • Mag 7.9',
      style: 'crosshair',
      dir: 'br',
      radMult: 0.75
    });
    if (state.telemetryMode === 'off') {
      state.telemetryMode = 'bar';
      document.querySelectorAll('#telemetryModeGroup .seg-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tmode === 'bar');
      });
    }
    syncAnnotationModalUI();
    renderAnnotationList();
    renderCanvas();
    showToast('Loaded Observatory Plate-Solve Demo!');
  });

  document.getElementById('btnTapToPlacePin').addEventListener('click', () => {
    document.getElementById('annotateModal').classList.remove('open');
    state.placingPinMode = true;
    document.getElementById('pinModeBanner').classList.add('active');
  });

  document.getElementById('btnCancelPinMode').addEventListener('click', () => {
    state.placingPinMode = false;
    document.getElementById('pinModeBanner').classList.remove('active');
  });

  document.getElementById('btnClearPins').addEventListener('click', () => {
    saveUndoBeforeAction();
    state.annotations = [];
    state.selectedPinId = null;
    syncAnnotationModalUI();
    renderAnnotationList();
    renderCanvas();
  });

  // Telemetry plate controls
  document.querySelectorAll('#telemetryModeGroup .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#telemetryModeGroup .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.telemetryMode = btn.dataset.tmode;
      renderCanvas();
      if (state.appMode === 'collage') renderCollagePreview();
    });
  });
  document.getElementById('telTitleInput').addEventListener('input', e => {
    state.telemetryTitle = e.target.value;
    renderCanvas();
    if (state.appMode === 'collage') renderCollagePreview();
  });
  document.getElementById('telSpecsInput').addEventListener('input', e => {
    state.telemetrySpecs = e.target.value;
    renderCanvas();
    if (state.appMode === 'collage') renderCollagePreview();
  });
  document.getElementById('telCatalogInput').addEventListener('input', e => {
    state.telemetryCatalog = e.target.value;
    renderCanvas();
    if (state.appMode === 'collage') renderCollagePreview();
  });

  // 3D CineReel Workspace HUD & Mobile Sub-Tab Controls
  document.querySelectorAll('#reelTabsNav .col-subtab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#reelTabsNav .col-subtab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const targetId = btn.dataset.rtab;
      document.querySelectorAll('#reelDeck .col-subpanel').forEach(sec => {
        sec.classList.toggle('active', sec.id === targetId);
      });
    });
  });

  document.getElementById('btnReplayReel').addEventListener('click', () => {
    reelAccumMs = 0;
    reelLastTickTime = performance.now();
    document.getElementById('btnTogglePlayReel').textContent = 'Pause';
    if (!state.reelPlaying) startReelPreviewLoop();
  });

  document.getElementById('btnTogglePlayReel').addEventListener('click', e => {
    if (state.reelPlaying) {
      stopReelPreviewLoop();
      e.currentTarget.textContent = 'Play';
    } else {
      reelLastTickTime = performance.now();
      state.reelPlaying = true;
      e.currentTarget.textContent = 'Pause';
      startReelPreviewLoop();
    }
  });

  document.getElementById('btnResetReelAim').addEventListener('click', () => {
    state.reelTargetX = 0.5;
    state.reelTargetY = 0.48;
    updateReelAimHintUI();
    reelAccumMs = 0;
    reelLastTickTime = performance.now();
    showToast('Focal zoom target centered (50%, 48%)');
  });

  document.getElementById('btnReelRotate').addEventListener('click', () => {
    if (rotateMainImage90()) showToast('Rotated 90° clockwise');
  });

  document.getElementById('btnReelOpenAnnotate').addEventListener('click', () => {
    if (!state.selectedPinId && state.annotations.length > 0) {
      state.selectedPinId = state.annotations[state.annotations.length - 1].id;
    }
    syncAnnotationModalUI();
    renderAnnotationList();
    setAppMode('annotate');
  });

  document.getElementById('btnRenderReel').addEventListener('click', renderFullResVideo);

  // ---------- Arrival photo (Hyperjump / Warp Spiral) ----------
  let reelDestSeq = 0, reelDestHintShown = false;
  const isWarpPreset = (id) => id === 'hyperjump' || id === 'warpspiral';
  function rewindReelPreview() { reelAccumMs = 0; reelLastTickTime = performance.now(); }
  function restartReelPlayback() {
    document.getElementById('btnSaveRenderedVideo').classList.remove('visible');
    rewindReelPreview();
  }
  function syncReelDestUI() {
    const row = document.getElementById('reelDestRow');
    if (!row) return;
    const own = !!(state.reelDest && state.reelDest.canvas);
    row.classList.toggle('show', isWarpPreset(state.reelPreset));
    row.classList.toggle('has-own', own);
    document.getElementById('reelDestSub').textContent = own ? state.reelDest.name : 'Same photo, mirrored. Add yours';
    document.getElementById('btnReelDest').textContent = own ? 'Change' : 'Choose…';
    document.getElementById('reelDestThumb').style.backgroundImage = own && state.reelDest.thumb ? 'url(' + state.reelDest.thumb + ')' : 'none';
  }
  function decodePhotoToCanvas(file, maxEdge) {
    const finish = (src, w, h) => {
      const s = Math.min(1, maxEdge / Math.max(w, h));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
      const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      x.drawImage(src, 0, 0, c.width, c.height);
      return c;
    };
    return new Promise((resolve, reject) => {
      const viaBitmap = () => {
        if (!window.createImageBitmap) { reject(new Error('decode')); return; }
        createImageBitmap(file).then(b => { const c = finish(b, b.width, b.height); if (b.close) b.close(); resolve(c); }, reject);
      };
      const viaReader = () => {
        const fr = new FileReader();
        fr.onload = () => { const im = new Image(); im.onload = () => resolve(finish(im, im.naturalWidth || im.width, im.naturalHeight || im.height)); im.onerror = viaBitmap; im.src = fr.result; };
        fr.onerror = viaBitmap; fr.readAsDataURL(file);
      };
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => { try { resolve(finish(im, im.naturalWidth || im.width, im.naturalHeight || im.height)); } catch (e) { viaReader(); } setTimeout(() => URL.revokeObjectURL(url), 4000); };
      im.onerror = () => { URL.revokeObjectURL(url); viaReader(); };
      im.src = url;
    });
  }
  // the GL scene is prepared in the background; when it is ready the preview restarts from the first frame
  // (it only rewinds the preview: a finished render keeps its Save button)
  WG.onReady = () => { if (!state.reelRecording && state.appMode === 'reel' && isWarpPreset(state.reelPreset)) rewindReelPreview(); };
  document.getElementById('btnReelDest').addEventListener('click', () => document.getElementById('reelDestInput').click());
  document.getElementById('reelDestInput').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    decodePhotoToCanvas(f, 4096).then(c => {
      const t = document.createElement('canvas'), k = 96 / Math.max(c.width, c.height);
      t.width = Math.max(1, Math.round(c.width * k)); t.height = Math.max(1, Math.round(c.height * k));
      t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
      state.reelDest = { canvas: c, name: (f.name || 'Photo').replace(/\.[^.]+$/, ''), thumb: t.toDataURL('image/jpeg', 0.72), id: ++reelDestSeq };
      syncReelDestUI(); restartReelPlayback(); showToast('Arrival photo ready');
    }).catch(() => showToast('That photo could not be opened'));
  });
  document.getElementById('btnReelDestClear').addEventListener('click', () => {
    state.reelDest = null; syncReelDestUI(); restartReelPlayback();
  });

  // CineReel Preset Selector
  document.querySelectorAll('#reelPresetGroup .preset-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('#reelPresetGroup .preset-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const prevPreset = state.reelPreset;
      state.reelPreset = card.dataset.preset.trim();
      document.getElementById('reelPresetBadge').textContent = card.querySelector('span').textContent;
      document.getElementById('btnSaveRenderedVideo').classList.remove('visible');
      reelAccumMs = 0; reelLastTickTime = performance.now();
      syncReelDestUI();
      syncReelCurveUI();
      if (isWarpPreset(state.reelPreset) && !isWarpPreset(prevPreset)) {
        // these moves need room to breathe: use the longest clip
        state.reelDuration = 10;
        document.querySelectorAll('#reelDurGroup .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.dur === '10'));
        if (!(state.reelDest && state.reelDest.canvas) && !reelDestHintShown) { reelDestHintShown = true; showToast('Tip: add an arrival photo for the landing'); }
      }
    });
  });

  // ---------- Speed curve (Starlight Dive / Cosmic Pullback) ----------
  const isCurvePreset = (id) => id === 'stardive' || id === 'zoomout';
  function syncReelCurveUI() {
    const row = document.getElementById('reelCurveRow');
    if (!row) return;
    row.classList.toggle('show', isCurvePreset(state.reelPreset));
    const cur = reelCurveId(state.reelPreset);
    document.querySelectorAll('#reelCurveGroup .curve-card').forEach(b => {
      const on = b.dataset.curve === cur;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    document.getElementById('lblReelCurve').textContent = REEL_CURVES[cur].label;
  }
  document.querySelectorAll('#reelCurveGroup .curve-card').forEach(btn => {
    const id = btn.dataset.curve, svg = btn.querySelector('svg'), NS = 'http://www.w3.org/2000/svg';
    let d = '';
    for (let i = 0; i <= 28; i++) {
      const t = i / 28;
      d += (i ? 'L' : 'M') + (3 + 40 * t).toFixed(1) + ' ' + (23 - 20 * clamp01(REEL_CURVES[id].fn(t))).toFixed(1);
    }
    const ref = document.createElementNS(NS, 'line');
    ['x1', '3', 'y1', '23', 'x2', '43', 'y2', '3'].forEach((v, i, a) => { if (i % 2 === 0) ref.setAttribute(v, a[i + 1]); });
    ref.setAttribute('class', 'ref');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    svg.append(ref, path);
    btn.addEventListener('click', () => {
      state.reelCurve[state.reelPreset] = id;
      syncReelCurveUI();
      restartReelPlayback();
    });
  });
  syncReelCurveUI();

  // Zoom Depth, Star Size & Star Glow Sliders
  document.getElementById('rngReelZoom').addEventListener('input', e => {
    state.reelZoomMax = parseFloat(e.target.value);
    document.getElementById('lblReelZoom').textContent = `${state.reelZoomMax.toFixed(1)}×`; updateReelWorkspaceStatusBadge();
    document.getElementById('btnSaveRenderedVideo').classList.remove('visible');
  });

  document.getElementById('rngReelStarSize').addEventListener('input', e => {
    state.reelStarSize = parseFloat(e.target.value);
    document.getElementById('lblReelStarSize').textContent = `${state.reelStarSize.toFixed(1)}×`;
    document.getElementById('btnSaveRenderedVideo').classList.remove('visible');
  });

  document.getElementById('rngReelStarGlow').addEventListener('input', e => {
    state.reelStarGlow = parseFloat(e.target.value);
    document.getElementById('lblReelStarGlow').textContent = `${state.reelStarGlow.toFixed(1)}×`;
    document.getElementById('btnSaveRenderedVideo').classList.remove('visible');
  });

  // Star Diffraction Spikes Toggle
  document.querySelectorAll('#reelSpikesGroup .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#reelSpikesGroup .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.reelSpikes = btn.dataset.spikes === 'on';
      const totalStars = state.reelGrid === 8 ? 2200 : (state.reelGrid === 4 ? 800 : 1400);
      document.getElementById('reelStatusBadge').textContent =
        `${totalStars} ★ • ${state.reelSpikes ? 'Spikes On' : 'Pinpoint'}`;
      document.getElementById('btnSaveRenderedVideo').classList.remove('visible');
    });
  });

  function updateRenderBtnLabel() {
    const resLabel = state.reelVideoRes === 2160 ? '4K' : (state.reelVideoRes === 1440 ? '2K' : '1080p');
    document.getElementById('lblRenderBtn').textContent = `Render Video • ${resLabel} ${state.reelFps}fps`;
    updateReelWorkspaceStatusBadge();
  }

  // Guard format changes as well as disabling their controls. Older browsers
  // may ignore inert, and synthetic events do not respect disabled controls.
  for (const type of ['click', 'input', 'change']) {
    document.getElementById('reelPanelFormat').addEventListener(type, event => {
      if (!state.reelRecording) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  }

  // Frame Rate Selector (30 FPS TikTok CFR vs 60 FPS)
  document.querySelectorAll('#reelFpsGroup .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#reelFpsGroup .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.reelFps = parseInt(btn.dataset.fps, 10);
      updateRenderBtnLabel();
      document.getElementById('btnSaveRenderedVideo').classList.remove('visible');
      showToast(state.reelFps === 30 ? '30 FPS CFR active (TikTok Smooth)' : '60 FPS active');
    });
  });

  // Video Export Resolution Selector (1080p | 2K QHD | 4K UHD)
  document.querySelectorAll('#reelResGroup .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#reelResGroup .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.reelVideoRes = parseInt(btn.dataset.vres, 10);
      updateRenderBtnLabel();
      document.getElementById('btnSaveRenderedVideo').classList.remove('visible');
    });
  });

  // Video Framing Mode
  document.querySelectorAll('#reelFramingGroup .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#reelFramingGroup .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.reelFraming = btn.dataset.frame;
      document.getElementById('lblReelFramingInfo').textContent = btn.textContent;
      document.getElementById('reelBlurRow').style.display = state.reelFraming === 'fitblur' ? 'flex' : 'none';
      document.getElementById('btnSaveRenderedVideo').classList.remove('visible');
      setupReelPreviewCanvas();
      reelAccumMs = 0; reelLastTickTime = performance.now();
    });
  });

  document.getElementById('rngReelBlur').addEventListener('input', e => {
    const val = parseInt(e.target.value, 10);
    syncBlurControls(val);
    setupReelPreviewCanvas();
  });

  document.querySelectorAll('#reelGridGroup .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#reelGridGroup .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.reelGrid = parseInt(btn.dataset.grid, 10);
      document.getElementById('btnSaveRenderedVideo').classList.remove('visible');
      setupReelPreviewCanvas();
      reelAccumMs = 0; reelLastTickTime = performance.now();
    });
  });

  document.querySelectorAll('#reelDurGroup .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#reelDurGroup .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.reelDuration = parseInt(btn.dataset.dur, 10);
      document.getElementById('btnSaveRenderedVideo').classList.remove('visible');
      reelAccumMs = 0; reelLastTickTime = performance.now();
    });
  });

  // Frame, Blur & Straighten Sliders inside Modal
  document.getElementById('rngBlur').addEventListener('input', e => {
    const val = parseInt(e.target.value, 10);
    syncBlurControls(val);
    updateFitStylePreview();
  });

  document.getElementById('rngAngle').addEventListener('input', e => {
    saveUndoBurst();
    straightenImage(Number(e.target.value));
    document.getElementById('lblAngle').textContent = `${state.fineAngle.toFixed(1)}°`;
    renderCanvas();
    updateFitStylePreview();
  });

  document.getElementById('rngMargin').addEventListener('input', e => {
    const val = parseInt(e.target.value, 10);
    state.fitMargin = val / 100;
    document.getElementById('lblMargin').textContent = `${val}%`;
    document.getElementById('btnOpenStyleQuick').textContent = `Margin ${val}%`;
    updateFitStylePreview();
  });

  document.querySelectorAll('#bgStyleGroup .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setFitBackgroundStyle(btn.dataset.bg);
      updateFitStylePreview();
    });
  });

  // Settings Controls
  document.querySelectorAll('#notchGroup .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#notchGroup .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const pad = btn.dataset.notch;
      document.documentElement.style.setProperty('--notch-pad', pad);
      localStorage.setItem('instaslice_notch', pad);
      setTimeout(() => {
        syncCanvasSize();
        renderCanvas();
      }, 50);
    });
  });
  document.querySelectorAll('#resGroup .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#resGroup .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.exportWidth = parseInt(btn.dataset.res, 10);
      renderCanvas();
    });
  });
  document.querySelectorAll('#fmtGroup .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#fmtGroup .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.exportFormat = btn.dataset.fmt;
    });
  });

  // Export & Instagram Preview Modal
  function openExportModal(startIndex = 0) {
    if (state.slides.length === 0) {
      generateSlices();
    }
    const track = document.getElementById('igTrack');
    const dots = document.getElementById('igDots');
    const dlGrid = document.getElementById('dlGrid');
    track.innerHTML = '';
    dots.innerHTML = '';
    dlGrid.innerHTML = '';

    const ext = state.exportFormat === 'png' ? 'png' : 'jpg';

    state.slides.forEach((s, i) => {
      const slideDiv = document.createElement('div');
      slideDiv.className = 'ig-slide';
      slideDiv.innerHTML = `<img class="ig-SlideImg" src="${s.dataUrl}" alt="Slide ${i + 1}">`;
      track.appendChild(slideDiv);

      const dot = document.createElement('div');
      dot.className = 'ig-dot' + (i === startIndex ? ' active' : '');
      dots.appendChild(dot);

      const itemWrap = document.createElement('div');
      itemWrap.className = 'dl-item-wrap';

      const prevBtn = document.createElement('button');
      prevBtn.className = 'btn-move-slide';
      prevBtn.textContent = '◀';
      prevBtn.title = 'Move Slide Left';
      prevBtn.disabled = i === 0;
      prevBtn.style.opacity = i === 0 ? '0.25' : '1';
      prevBtn.addEventListener('click', () => {
        if (i === 0) return;
        const tmp = state.slides[i - 1];
        state.slides[i - 1] = state.slides[i];
        state.slides[i] = tmp;
        renderFilmstrip();
        openExportModal(i - 1);
      });

      const dlBtn = document.createElement('button');
      dlBtn.className = 'btn-dl-item';
      dlBtn.textContent = `#${i + 1}`;
      dlBtn.title = `Download Slide #${i + 1} (${s.title})`;
      dlBtn.addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = s.dataUrl;
        a.download = `InstaSlice_${String(i + 1).padStart(2, '0')}.${ext}`;
        a.click();
      });

      const nextBtn = document.createElement('button');
      nextBtn.className = 'btn-move-slide';
      nextBtn.textContent = '▶';
      nextBtn.title = 'Move Slide Right';
      nextBtn.disabled = i === state.slides.length - 1;
      nextBtn.style.opacity = i === state.slides.length - 1 ? '0.25' : '1';
      nextBtn.addEventListener('click', () => {
        if (i >= state.slides.length - 1) return;
        const tmp = state.slides[i + 1];
        state.slides[i + 1] = state.slides[i];
        state.slides[i] = tmp;
        renderFilmstrip();
        openExportModal(i + 1);
      });

      itemWrap.appendChild(prevBtn);
      itemWrap.appendChild(dlBtn);
      itemWrap.appendChild(nextBtn);
      dlGrid.appendChild(itemWrap);
    });

    document.getElementById('exportModal').classList.add('open');
    requestAnimationFrame(() => {
      track.scrollLeft = startIndex * track.clientWidth;
    });
  }

  document.getElementById('btnOpenExport').addEventListener('click', () => openExportModal(0));

  document.getElementById('igTrack').addEventListener('scroll', e => {
    const track = e.currentTarget;
    const idx = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    document.querySelectorAll('#igDots .ig-dot').forEach((d, i) => {
      d.classList.toggle('active', i === idx);
    });
  });

  document.getElementById('btnToggleSeam').addEventListener('click', e => {
    const track = e.currentTarget;
    track.classList.toggle('seam-inspect');
    e.currentTarget.textContent = track.classList.contains('seam-inspect') ? 'Snap Slides' : 'Inspect Seams';
  });

  // Native iOS / Android Web Share API
  document.getElementById('btnShareAll').addEventListener('click', async () => {
    if (state.slides.length === 0) return;
    const ext = state.exportFormat === 'png' ? 'png' : 'jpg';
    const mime = state.exportFormat === 'png' ? 'image/png' : 'image/jpeg';

    const isMobileDevice = annIsTouchDevice();
    if (isMobileDevice) {
      try {
        const files = await Promise.all(state.slides.map(async (s, i) => {
          const res = await fetch(s.dataUrl);
          const blob = await res.blob();
          return new File([blob], `InstaSlice_${String(i + 1).padStart(2, '0')}.${ext}`, { type: mime });
        }));

        if (navigator.canShare && navigator.canShare({ files })) {
          await navigator.share({
            files,
            title: 'InstaSlice Carousel'
          });
          return;
        }
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }

    state.slides.forEach((s, i) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = s.dataUrl;
        a.download = `InstaSlice_${String(i + 1).padStart(2, '0')}.${ext}`;
        a.click();
      }, i * 220);
    });
    showToast(`Download started · ${state.slides.length} slide${state.slides.length === 1 ? '' : 's'}`);
  });

  // Desktop Carousel Prev / Next Navigation Buttons
  document.getElementById('btnIgPrev').addEventListener('click', () => {
    const track = document.getElementById('igTrack');
    track.scrollBy({ left: -track.clientWidth, behavior: 'smooth' });
  });
  document.getElementById('btnIgNext').addEventListener('click', () => {
    const track = document.getElementById('igTrack');
    track.scrollBy({ left: track.clientWidth, behavior: 'smooth' });
  });

  // Pure JS Uncompressed .ZIP Archive Builder for PC / Desktop 1-Click Download
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function dataUrlToUint8Array(dataUrl) {
    const base64 = dataUrl.split(',')[1];
    const bin = atob(base64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  function buildZipBlob(files) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    files.forEach(file => {
      const nameBytes = encoder.encode(file.name);
      const data = file.data;
      const crc = crc32(data);

      const localHeader = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(localHeader.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, 0, true);
      lv.setUint16(12, 0, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      localHeader.set(nameBytes, 30);

      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(centralHeader.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      centralHeader.set(nameBytes, 46);

      localParts.push(localHeader, data);
      centralParts.push(centralHeader);
      offset += localHeader.length + data.length;
    });

    const centralSize = centralParts.reduce((acc, p) => acc + p.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    return new Blob([...localParts, ...centralParts, eocd], { type: 'application/zip' });
  }

  document.getElementById('btnDownloadZip').addEventListener('click', () => {
    if (state.slides.length === 0) return;
    const ext = state.exportFormat === 'png' ? 'png' : 'jpg';
    const entries = state.slides.map((s, i) => ({
      name: `InstaSlice_${String(i + 1).padStart(2, '0')}.${ext}`,
      data: dataUrlToUint8Array(s.dataUrl)
    }));
    const zipBlob = buildZipBlob(entries);
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `InstaSlice_${state.aspect.replace(':','x')}_${state.slides.length}slides.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    showToast('Downloaded .ZIP archive');
  });

  
  // =========================================================================
  // FULL-WORKSPACE COLLAGE STUDIO & BOX TEXT ENGINE (Pro Workstation Edition)
  // =========================================================================
  const COLLAGE_ASPECTS = {
    '3:4': 3 / 4,
    '4:5': 4 / 5,
    '1:1': 1,
    '9:16': 9 / 16,
    '16:9': 16 / 9,
    '2:1': 2 / 1
  };

  const COLLAGE_TEMPLATES = {
    '2v':     [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]],
    '2h':     [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]],
    '3top':   [[0, 0, 1, 0.58], [0, 0.58, 0.5, 0.42], [0.5, 0.58, 0.5, 0.42]],
    '3left':  [[0, 0, 0.58, 1], [0.58, 0, 0.42, 0.5], [0.58, 0.5, 0.42, 0.5]],
    '3cols':  [[0, 0, 1/3, 1], [1/3, 0, 1/3, 1], [2/3, 0, 1/3, 1]],
    '3rows':  [[0, 0, 1, 1/3], [0, 1/3, 1, 1/3], [0, 2/3, 1, 1/3]],
    '4grid':  [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]],
    '4hero':  [[0, 0, 1, 0.62], [0, 0.62, 1/3, 0.38], [1/3, 0.62, 1/3, 0.38], [2/3, 0.62, 1/3, 0.38]],
    '4bento': [[0, 0, 0.6, 0.55], [0.6, 0, 0.4, 0.55], [0, 0.55, 0.4, 0.45], [0.4, 0.55, 0.6, 0.45]],
    '5mosaic':[[0, 0, 0.5, 0.54], [0, 0.54, 1/3, 0.46], [0.5, 0, 0.5, 0.54], [1/3, 0.54, 1/3, 0.46], [2/3, 0.54, 1/3, 0.46]],
    '6grid':  [[0, 0, 0.5, 1/3], [0.5, 0, 0.5, 1/3], [0, 1/3, 0.5, 1/3], [0.5, 1/3, 0.5, 1/3], [0, 2/3, 0.5, 1/3], [0.5, 2/3, 0.5, 1/3]],
    'pip':    [[0, 0, 1, 1], [0.04, 0.65, 0.43, 0.31], [0.53, 0.65, 0.43, 0.31]],
    // one photo, never cropped, centred on a blurred copy of itself (the box is worked out from the picture's own shape)
    'blurfit': [[0, 0, 1, 1]]
  };

  const collageState = {
    aspect: '3:4',
    template: '2v',
    gap: 10,
    margin: 16,
    radius: 14,
    borderW: 1.5,
    bgStyle: 'blur', // 'blur' | 'black' | 'white' | 'custom'
    bgCustomHex: '#0F172A',
    // Margin, corner radius and background are remembered separately for Blur Fit and for the grid layouts.
    // Blur Fit also has its own backdrop blur (gentle, so the blurred copy still shows its stars like a soft bokeh);
    // the grid layouts keep using the app-wide BG Blur shared with the Slicer and the Reel.
    looks: {
      grid: { margin: 16, radius: 14, bg: 'blur' },
      fit: { margin: 64, radius: 0, bg: 'blur', blur: 8 }
    },
    syncTextStyle: true, // Synchronizes typography style across all boxes!
    activeCell: 0,
    dragMode: 'image',   // 'image' | 'text'
    hoverDropCell: -1,
    lift: null,        // image picked up with press-and-hold: { from, x, y, type, t0 }
    swapAnim: null,    // short flight animation after two boxes swapped
    snapGuideX: false,
    snapGuideY: false,
    cells: [],
    undoStack: []
  };
  // Keep the source pins for a collage after its rendered copy becomes the main photo.
  const collageSourcePins = new WeakMap();
  const collageMarkerLayouts = new WeakMap();

  // Switch between Main App Sections: 'slicer' vs 'collage' vs 'reel'
  function setAppMode(mode) {
    if (state.appMode === 'annotate' && mode !== 'annotate') cancelAnimationFrame(annAnim);
    state.appMode = mode;
    if (mode !== 'annotate') pinDockClose();
    if (state.moonTap) moonCancelTap();
    document.documentElement.setAttribute('data-mode', mode);
    if (mode !== 'annotate' && mode !== 'reel') setStageFocus(false);
    if (mode !== 'collage') { collageState.lift = null; collageState.swapAnim = null; collageState.hoverDropCell = -1; }
    const swapHint = document.getElementById('hintSwap');
    if (swapHint) swapHint.style.display = mode === 'collage' ? '' : 'none';
    const isAnnotate = mode === 'annotate';
    const isSlicer = mode === 'slicer';
    const isCollage = mode === 'collage';
    const isReel = mode === 'reel';

    document.getElementById('btnModeSlicer').classList.toggle('active', isSlicer);
    document.getElementById('btnModeCollage').classList.toggle('active', isCollage);
    document.getElementById('btnModeReel').classList.toggle('active', isReel);
    document.getElementById('btnModeAnnotate').classList.toggle('active', isAnnotate);

    canvas.style.display = (isSlicer || isAnnotate) ? 'block' : 'none';
    collageCanvas.style.display = isCollage ? 'block' : 'none';
    document.getElementById('reelWorkspaceStage').style.display = isReel ? 'flex' : 'none';

    document.getElementById('slicerHud').style.display = isSlicer ? 'flex' : 'none';
    document.getElementById('collageHud').style.display = isCollage ? 'flex' : 'none';
    document.getElementById('reelHud').style.display = isReel ? 'flex' : 'none';
    document.getElementById('annotateHud').style.display = isAnnotate ? 'flex' : 'none';

    document.getElementById('slicerDeck').classList.toggle('active', isSlicer);
    document.getElementById('collageDeck').classList.toggle('active', isCollage);
    document.getElementById('reelDeck').classList.toggle('active', isReel);
    document.getElementById('annotateDeck').classList.toggle('active', isAnnotate);
    if (isAnnotate) {
      state.showBlurOnMain = false;
      updateAnnotationExportUI();
      if (!state.selectedPinId && state.annotations.length > 0) state.selectedPinId = state.annotations[state.annotations.length - 1].id;
      syncAnnotationModalUI();
      renderAnnotationList();
    }

    if (!isReel && state.reelPlaying && !state.reelRecording) {
      stopReelPreviewLoop();
    }

    syncCanvasSize();
    if (isCollage) {
      ensureCollageCellsCount();
      syncCollageUI();
      renderCollagePreview();
      try {
        if (!localStorage.getItem('instaSliceSwapTip') && (COLLAGE_TEMPLATES[collageState.template] || []).length > 1) {
          localStorage.setItem('instaSliceSwapTip', '1');
          setTimeout(() => showToast('Tip: press and hold an image, then drag it onto another box to swap them', 4200), 500);
        }
      } catch (_) {}
    } else if (isReel) {
      document.getElementById('btnTogglePlayReel').textContent = 'Pause';
      setupReelPreviewCanvas();
      startReelPreviewLoop();
    } else {
      if (isSlicer && state._refitOnEnter && state.img) { state._refitOnEnter = false; fitImageToCrop(); }
      else renderCanvas();
    }
  }

  document.getElementById('btnModeSlicer').addEventListener('click', () => setAppMode('slicer'));
  document.getElementById('btnModeCollage').addEventListener('click', () => setAppMode('collage'));
  document.getElementById('btnModeReel').addEventListener('click', () => setAppMode('reel'));

  function getCollageStageRect() {
    syncCanvasSize();
    const dpr = state.dpr;
    const cw = collageCanvas.width;
    const ch = collageCanvas.height;
    const padX = 18 * dpr;
    const padTop = stageTopPad() * dpr;
    const padBot = stageBottomPad() * dpr;
    const availW = Math.max(60 * dpr, cw - padX * 2);
    const availH = Math.max(60 * dpr, ch - padTop - padBot);

    const aspect = COLLAGE_ASPECTS[collageState.aspect] || (3 / 4);
    let boxW = availW;
    let boxH = boxW / aspect;
    if (boxH > availH) {
      boxH = availH;
      boxW = boxH * aspect;
    }

    const boxX = (cw - boxW) / 2;
    const boxY = padTop + (availH - boxH) / 2;
    return { x: boxX, y: boxY, w: boxW, h: boxH, aspect };
  }

  function createDefaultCollageCell(index) {
    const presets = [
      { zoom: 1.0, panX: 0, panY: 0 },
      { zoom: 1.45, panX: -0.08, panY: -0.05 },
      { zoom: 1.65, panX: 0.10, panY: 0.06 },
      { zoom: 1.35, panX: 0.05, panY: -0.08 },
      { zoom: 1.55, panX: -0.06, panY: 0.08 },
      { zoom: 1.25, panX: 0, panY: 0 }
    ];
    const p = presets[index % presets.length];
    const refCell = collageState.cells[0];
    return {
      img: state.img || null,
      usesMainImage: true,
      zoom: p.zoom,
      panX: p.panX,
      panY: p.panY,
      rot90: 0,
      flipH: false,
      text: '',
      subText: '',
      fontFamily: refCell ? refCell.fontFamily : "'Inter', -apple-system, sans-serif",
      textColor: refCell ? refCell.textColor : '#FFFFFF',
      textSize: refCell ? refCell.textSize : 26,
      textSpacing: refCell ? (refCell.textSpacing || 0) : 0,
      textBg: refCell ? refCell.textBg : 'pill',
      textRot: refCell ? (refCell.textRot || '0') : '0',
      textAlign: refCell ? refCell.textAlign : 'center',
      textPresetPos: refCell ? refCell.textPresetPos : 'bottom',
      tx: refCell ? refCell.tx : 0.5,
      ty: refCell ? refCell.ty : 0.89,
      lastTextHitBox: null
    };
  }

  function ensureCollageCellsCount() {
    const tpl = COLLAGE_TEMPLATES[collageState.template] || COLLAGE_TEMPLATES['2v'];
    while (collageState.cells.length < tpl.length) {
      collageState.cells.push(createDefaultCollageCell(collageState.cells.length));
    }
    collageState.cells.forEach(cell => {
      if (cell.usesMainImage) cell.img = state.img || null;
    });
    if (collageState.activeCell >= tpl.length) {
      collageState.activeCell = 0;
    }
  }

  function setCollageCellImage(cell, image, usesMainImage) {
    cell.img = image;
    cell.usesMainImage = usesMainImage;
    cell.zoom = 1;
    cell.panX = 0;
    cell.panY = 0;
    cell.rot90 = 0;
    cell.flipH = false;
  }

  // Strict Mathematical Clamping for Each Collage Box (Prevents empty borders/bands!)
  function clampCollageCellTransform(cell, boxW, boxH) {
    if (!cell || !cell.img || boxW <= 0 || boxH <= 0) return;
    const imgElem = cell.img;
    const origW = imgElem.naturalWidth || imgElem.width || 1000;
    const origH = imgElem.naturalHeight || imgElem.height || 1000;
    const swapped = (cell.rot90 % 180) !== 0;
    const effW = swapped ? origH : origW;
    const effH = swapped ? origW : origH;

    // Minimum zoom is strictly 1.0x (100% cover of the cell)
    cell.zoom = Math.max(1.0, Math.min(6.0, cell.zoom || 1.0));

    const baseCoverScale = Math.max(boxW / effW, boxH / effH);
    const finalScale = baseCoverScale * cell.zoom;
    const drawW = effW * finalScale;
    const drawH = effH * finalScale;

    const maxPanX = Math.max(0, (drawW / boxW - 1) / 2);
    const maxPanY = Math.max(0, (drawH / boxH - 1) / 2);

    cell.panX = Math.max(-maxPanX, Math.min(maxPanX, cell.panX));
    cell.panY = Math.max(-maxPanY, Math.min(maxPanY, cell.panY));
  }

  // Exact Font Weight Specification & Web Font Preloader for HTML5 Canvas
  const FONT_WEIGHT_SPECS = {
    'Bebas Neue':         { mainW: '400', subW: '400' },
    'Michroma':           { mainW: '400', subW: '400' },
    'Marcellus':          { mainW: '400', subW: '400' },
    'Share Tech Mono':    { mainW: '400', subW: '400' },
    'Syne':               { mainW: '800', subW: '600' },
    'Orbitron':           { mainW: '700', subW: '600' },
    'Rajdhani':           { mainW: '700', subW: '600' },
    'Space Grotesk':      { mainW: '700', subW: '600' },
    'Chakra Petch':       { mainW: '700', subW: '600' },
    'JetBrains Mono':     { mainW: '700', subW: '600' },
    'Cinzel':             { mainW: '700', subW: '600' },
    'Playfair Display':   { mainW: '700', subW: '600' },
    'Cormorant Garamond': { mainW: '700', subW: '600' },
    'Bodoni Moda':        { mainW: '700', subW: '600' },
    'Oswald':             { mainW: '700', subW: '600' },
    'Montserrat':         { mainW: '700', subW: '600' },
    'Inter':              { mainW: '700', subW: '600' },
    'Outfit':             { mainW: '700', subW: '600' }
  };

  function getFontSpec(fontFam) {
    const raw = fontFam || "'Inter', -apple-system, sans-serif";
    for (const key in FONT_WEIGHT_SPECS) {
      if (raw.indexOf(key) !== -1) {
        return {
          family: raw,
          primaryName: `"${key}"`,
          mainW: FONT_WEIGHT_SPECS[key].mainW,
          subW: FONT_WEIGHT_SPECS[key].subW
        };
      }
    }
    return { family: raw, primaryName: '"Inter"', mainW: '700', subW: '600' };
  }

  function ensureCanvasFontReady(fontFam, onLoaded) {
    const spec = getFontSpec(fontFam);
    if (document.fonts && typeof document.fonts.load === 'function') {
      Promise.all([
        document.fonts.load(`${spec.mainW} 32px ${spec.primaryName}`),
        document.fonts.load(`${spec.subW} 20px ${spec.primaryName}`)
      ]).then(() => {
        if (typeof onLoaded === 'function') onLoaded();
      }).catch(() => {
        if (typeof onLoaded === 'function') onLoaded();
      });
    }
    requestAnimationFrame(() => { if (typeof onLoaded === 'function') onLoaded(); });
    setTimeout(() => { if (typeof onLoaded === 'function') onLoaded(); }, 60);
    setTimeout(() => { if (typeof onLoaded === 'function') onLoaded(); }, 200);
  }

  if (document.fonts) {
    if (document.fonts.ready) {
      document.fonts.ready.then(() => {
        if (state.appMode === 'collage') renderCollagePreview();
        else renderCanvas();
      });
    }
    if (typeof document.fonts.addEventListener === 'function') {
      document.fonts.addEventListener('loadingdone', () => {
        if (state.appMode === 'collage') renderCollagePreview();
        else renderCanvas();
      });
    }
  }

  // Synchronize Typography Style across all Collage cells
  function syncTextStyleAcrossCollage(sourceCell) {
    if (!sourceCell) return;
    const sourceHasText = Boolean((sourceCell.text || '').trim() || (sourceCell.subText || '').trim());
    // Sync across all boxes when Sync All Boxes is ON, OR when the currently selected box has no text yet so visible labels in other boxes still update!
    if (!collageState.syncTextStyle && sourceHasText) return;
    collageState.cells.forEach(target => {
      if (target === sourceCell) return;
      target.fontFamily = sourceCell.fontFamily;
      target.textColor = sourceCell.textColor;
      target.textSize = sourceCell.textSize;
      target.textSpacing = sourceCell.textSpacing || 0;
      target.textBg = sourceCell.textBg;
      target.textRot = sourceCell.textRot;
      target.textAlign = sourceCell.textAlign;
      target.textPresetPos = sourceCell.textPresetPos;
      target.tx = sourceCell.tx;
      target.ty = sourceCell.ty;
    });
  }

  function updateCollageUndoUI() {
    const btn = document.getElementById('btnCollageUndo');
    if (!btn) return;
    const hasHistory = collageState.undoStack.length > 0;
    btn.disabled = !hasHistory;
    btn.classList.toggle('undo-ready', hasHistory);
  }

  function saveCollageUndo() {
    const snap = {
      aspect: collageState.aspect,
      template: collageState.template,
      gap: collageState.gap,
      margin: collageState.margin,
      radius: collageState.radius,
      borderW: collageState.borderW,
      bgStyle: collageState.bgStyle,
      bgCustomHex: collageState.bgCustomHex,
      activeCell: collageState.activeCell,
      cells: collageState.cells.map(c => ({
        img: c.img,
        usesMainImage: c.usesMainImage,
        zoom: c.zoom,
        panX: c.panX,
        panY: c.panY,
        rot90: c.rot90,
        flipH: c.flipH,
        text: c.text,
        subText: c.subText,
        fontFamily: c.fontFamily,
        textColor: c.textColor,
        textSize: c.textSize,
        textSpacing: c.textSpacing || 0,
        textBg: c.textBg,
        textRot: c.textRot,
        textAlign: c.textAlign,
        textPresetPos: c.textPresetPos,
        tx: c.tx,
        ty: c.ty
      }))
    };
    collageState.undoStack.push(snap);
    if (collageState.undoStack.length > 35) collageState.undoStack.shift();
    updateCollageUndoUI();
  }

  function undoCollageAction() {
    if (collageState.undoStack.length === 0) return;
    const snap = collageState.undoStack.pop();
    collageState.aspect = snap.aspect;
    collageState.template = snap.template;
    collageState.gap = snap.gap;
    collageState.margin = snap.margin;
    collageState.radius = snap.radius;
    collageState.borderW = snap.borderW;
    collageState.bgStyle = snap.bgStyle;
    collageState.bgCustomHex = snap.bgCustomHex || '#0F172A';
    collageState.activeCell = snap.activeCell;
    collageState.cells = snap.cells.map(c => ({ ...c, lastTextHitBox: null }));
    updateCollageUndoUI();
    syncCollageUI();
    renderCollagePreview();
    showToast('Undid collage movement');
  }

  function collageLookFamily(t) { return t === 'blurfit' ? 'fit' : 'grid'; }
  function collageBlur() { return collageState.template === 'blurfit' ? collageState.looks.fit.blur : state.fitBlur; }
  function setCollageTemplate(next) {
    const a = collageLookFamily(collageState.template), b = collageLookFamily(next);
    if (a !== b) {
      collageState.looks[a] = Object.assign({}, collageState.looks[a], { margin: collageState.margin, radius: collageState.radius, bg: collageState.bgStyle });
      const L = collageState.looks[b];
      collageState.margin = L.margin;
      collageState.radius = L.radius;
      collageState.bgStyle = L.bg;
    }
    collageState.template = next;
  }

  function getCollageCellRects(outW, outH) {
    if (collageState.template === 'blurfit') {
      // Blur Fit: the photo's own shape, as large as the margin allows, centred. Captions use the whole canvas.
      const m = Math.round(collageState.margin * (outW / 1080));
      const availW = Math.max(40, outW - m * 2), availH = Math.max(40, outH - m * 2);
      const c0 = collageState.cells[0], im = c0 && c0.img;
      let ar = 4 / 3;
      if (im) {
        const iw = im.naturalWidth || im.width || 1000, ih = im.naturalHeight || im.height || 1000;
        ar = ((c0.rot90 || 0) % 180) !== 0 ? ih / iw : iw / ih;
      }
      let w = availW, hh = w / ar;
      if (hh > availH) { hh = availH; w = hh * ar; }
      w = Math.max(10, Math.round(w)); hh = Math.max(10, Math.round(hh));
      return [{ idx: 0, x: Math.round((outW - w) / 2), y: Math.round((outH - hh) / 2), w, h: hh, isInset: false, isFit: true, textRect: { x: 0, y: 0, w: outW, h: outH } }];
    }
    const tpl = COLLAGE_TEMPLATES[collageState.template] || COLLAGE_TEMPLATES['2v'];
    const refScale = outW / 1080;
    const isPip = collageState.template === 'pip';
    const marginPx = isPip ? 0 : Math.round(collageState.margin * refScale);
    const gapPx = isPip ? 0 : Math.round(collageState.gap * refScale);

    const innerX = marginPx;
    const innerY = marginPx;
    const innerW = Math.max(40, outW - marginPx * 2);
    const innerH = Math.max(40, outH - marginPx * 2);

    return tpl.map((norm, idx) => {
      const [nx, ny, nw, nh] = norm;
      if (isPip && idx > 0) {
        return {
          idx,
          x: Math.round(nx * outW),
          y: Math.round(ny * outH),
          w: Math.round(nw * outW),
          h: Math.round(nh * outH),
          isInset: true
        };
      }
      const padL = nx > 0.001 ? gapPx / 2 : 0;
      const padR = (nx + nw) < 0.999 ? gapPx / 2 : 0;
      const padT = ny > 0.001 ? gapPx / 2 : 0;
      const padB = (ny + nh) < 0.999 ? gapPx / 2 : 0;

      const x = Math.round(innerX + nx * innerW + padL);
      const y = Math.round(innerY + ny * innerH + padT);
      const w = Math.max(10, Math.round(nw * innerW - padL - padR));
      const h = Math.max(10, Math.round(nh * innerH - padT - padB));
      return { idx, x, y, w, h, isInset: false };
    });
  }

  function renderCollageToContext(targetCtx, outW, outH, showUIHighlights = false) {
    ensureCollageCellsCount();
    const refScale = outW / 1080;
    const radiusPx = Math.round(collageState.radius * refScale);
    const borderPx = collageState.borderW * refScale;

    // 1. Background Fill
    targetCtx.save();
    if (collageState.bgStyle === 'white') {
      targetCtx.fillStyle = '#F8FAFC';
      targetCtx.fillRect(0, 0, outW, outH);
    } else if (collageState.bgStyle === 'black') {
      targetCtx.fillStyle = '#04060A';
      targetCtx.fillRect(0, 0, outW, outH);
    } else if (collageState.bgStyle === 'custom') {
      targetCtx.fillStyle = collageState.bgCustomHex || '#0F172A';
      targetCtx.fillRect(0, 0, outW, outH);
    } else {
      const fitCell = collageState.template === 'blurfit' ? collageState.cells[0] : null;
      drawCustomBlurredBackground(targetCtx, outW, outH, collageBlur(),
        fitCell && fitCell.img ? { img: fitCell.img, rot90: fitCell.rot90 || 0, flipH: !!fitCell.flipH } : undefined);
    }
    targetCtx.restore();

    const rects = getCollageCellRects(outW, outH);
    const anim = showUIHighlights ? collageState.swapAnim : null;
    let flight = 1;
    if (anim) { const k = Math.min(1, (performance.now() - anim.t0) / anim.dur); flight = 1 - Math.pow(1 - k, 3); }
    const order = rects.map((_, i) => i);
    if (anim) order.sort((p, q) => ((p === anim.a || p === anim.b) ? 1 : 0) - ((q === anim.a || q === anim.b) ? 1 : 0));

    // 2. Render each Cell (swapped boxes are drawn last, flying from each other's place)
    order.forEach(idx => {
      let r = rects[idx];
      if (anim && (idx === anim.a || idx === anim.b)) {
        const o = rects[idx === anim.a ? anim.b : anim.a], mix = (u, v) => u + (v - u) * flight;
        r = { ...r, x: mix(o.x, r.x), y: mix(o.y, r.y), w: mix(o.w, r.w), h: mix(o.h, r.h) };
      }
      const cell = collageState.cells[idx];
      if (!cell) return;

      // Enforce strict boundary clamping before drawing
      clampCollageCellTransform(cell, r.w, r.h);

      targetCtx.save();
      if (r.isInset) {
        targetCtx.shadowColor = 'rgba(0, 0, 0, 0.72)';
        targetCtx.shadowBlur = 22 * refScale;
        targetCtx.shadowOffsetY = 6 * refScale;
      }

      targetCtx.beginPath();
      targetCtx.roundRect(r.x, r.y, r.w, r.h, radiusPx);
      if (r.isInset) {
        targetCtx.fillStyle = '#05070B';
        targetCtx.fill();
        targetCtx.shadowColor = 'transparent';
      }
      targetCtx.clip();

      targetCtx.fillStyle = '#0B0F19';
      targetCtx.fillRect(r.x, r.y, r.w, r.h);

      if (cell.img) {
        drawCollageCellImageInto(targetCtx, cell, r.x, r.y, r.w, r.h, radiusPx);
      } else {
        targetCtx.fillStyle = '#64748B';
        targetCtx.font = `600 ${Math.round(24 * refScale)}px -apple-system, sans-serif`;
        targetCtx.textAlign = 'center';
        targetCtx.textBaseline = 'middle';
        targetCtx.fillText(`+ Box #${idx + 1}`, r.x + r.w / 2, r.y + r.h / 2);
      }

      // Magnetic centre guides + caption. Normal boxes draw them inside the box; Blur Fit draws them over the
      // whole canvas, so a caption can sit in the blurred margin around the photo.
      const tr = r.textRect || r;
      const drawCaptionLayer = () => {
        if (showUIHighlights && idx === collageState.activeCell && (collageState.snapGuideX || collageState.snapGuideY)) {
          targetCtx.save();
          targetCtx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
          targetCtx.lineWidth = Math.max(1, state.dpr);
          targetCtx.setLineDash([4 * state.dpr, 4 * state.dpr]);
          if (collageState.snapGuideX) {
            targetCtx.beginPath();
            targetCtx.moveTo(tr.x + tr.w / 2, tr.y);
            targetCtx.lineTo(tr.x + tr.w / 2, tr.y + tr.h);
            targetCtx.stroke();
          }
          if (collageState.snapGuideY) {
            targetCtx.beginPath();
            targetCtx.moveTo(tr.x, tr.y + tr.h / 2);
            targetCtx.lineTo(tr.x + tr.w, tr.y + tr.h / 2);
            targetCtx.stroke();
          }
          targetCtx.restore();
        }
        const mainTxt = (cell.text || '').trim();
        const subTxt = (cell.subText || '').trim();
        if (mainTxt || subTxt) {
          drawCollageCellText(targetCtx, tr, cell, refScale, showUIHighlights);
        } else if (showUIHighlights) {
          cell.lastTextHitBox = null;
        }
      };
      if (!r.textRect) drawCaptionLayer();

      targetCtx.restore();
      if (r.textRect) { targetCtx.save(); drawCaptionLayer(); targetCtx.restore(); }

      if (borderPx > 0 || r.isInset) {
        targetCtx.save();
        targetCtx.beginPath();
        targetCtx.roundRect(r.x, r.y, r.w, r.h, radiusPx);
        targetCtx.strokeStyle = collageState.bgStyle === 'white'
          ? 'rgba(15, 23, 42, 0.18)'
          : (r.isInset ? 'rgba(56, 189, 248, 0.85)' : 'rgba(255, 255, 255, 0.26)');
        targetCtx.lineWidth = r.isInset ? Math.max(2.5 * refScale, borderPx) : borderPx;
        targetCtx.stroke();
        targetCtx.restore();
      }

      if (showUIHighlights) {
        const dpr = state.dpr;
        const isSelected = idx === collageState.activeCell;
        const isHoverDrop = idx === collageState.hoverDropCell;
        const single = rects.length < 2;           // one box only (Blur Fit): no "selected box" outline or #1 tag

        if ((isSelected && !single) || isHoverDrop) {
          targetCtx.save();
          targetCtx.beginPath();
          targetCtx.roundRect(r.x + 1.5 * dpr, r.y + 1.5 * dpr, r.w - 3 * dpr, r.h - 3 * dpr, Math.max(0, radiusPx - 1));
          targetCtx.strokeStyle = isHoverDrop ? '#38BDF8' : '#38BDF8';
          targetCtx.lineWidth = (isHoverDrop ? 3.5 : 2.0) * dpr;
          if (isHoverDrop) targetCtx.setLineDash([7 * dpr, 5 * dpr]);
          targetCtx.stroke();
          targetCtx.restore();
        }

        if (!single) {
        const pillW = 28 * dpr;
        const pillH = 18 * dpr;
        const pad = 6 * dpr;
        targetCtx.save();
        targetCtx.fillStyle = isSelected ? 'rgba(56, 189, 248, 0.92)' : 'rgba(8, 9, 12, 0.82)';
        targetCtx.beginPath();
        targetCtx.roundRect(r.x + pad, r.y + pad, pillW, pillH, 4 * dpr);
        targetCtx.fill();

        targetCtx.fillStyle = isSelected ? '#041019' : '#94A3B8';
        targetCtx.font = `700 ${Math.round(10 * dpr)}px var(--font-mono), monospace`;
        targetCtx.textAlign = 'center';
        targetCtx.textBaseline = 'middle';
        targetCtx.fillText(`#${idx + 1}`, r.x + pad + pillW / 2, r.y + pad + pillH / 2 + 0.5 * dpr);
        targetCtx.restore();
        }

        if (isHoverDrop) {
          targetCtx.save();
          targetCtx.fillStyle = 'rgba(14, 165, 233, 0.25)';
          targetCtx.fillRect(r.x, r.y, r.w, r.h);
          const hoverLabel = collageState.lift ? `Swap with #${collageState.lift.from + 1}` : `Drop into Box #${idx + 1}`;
          const hoverFont = Math.max(12 * dpr, Math.round(20 * refScale));
          targetCtx.font = `700 ${hoverFont}px -apple-system, sans-serif`;
          targetCtx.textAlign = 'center';
          targetCtx.textBaseline = 'middle';
          const ly = collageState.lift ? r.y + hoverFont * 1.5 : r.y + r.h / 2;
          if (collageState.lift) {
            const lw = targetCtx.measureText(hoverLabel).width + hoverFont * 1.2;
            targetCtx.fillStyle = 'rgba(6, 9, 14, 0.78)';
            targetCtx.beginPath(); targetCtx.roundRect(r.x + r.w / 2 - lw / 2, ly - hoverFont * 0.85, lw, hoverFont * 1.7, hoverFont * 0.85); targetCtx.fill();
          }
          targetCtx.fillStyle = '#FFFFFF';
          targetCtx.fillText(hoverLabel, r.x + r.w / 2, ly);
          targetCtx.restore();
        }
        if (collageState.lift && collageState.lift.from === idx) {          // the box whose image was picked up
          targetCtx.save();
          targetCtx.beginPath();
          targetCtx.roundRect(r.x, r.y, r.w, r.h, radiusPx);
          targetCtx.clip();
          targetCtx.fillStyle = 'rgba(6, 9, 14, 0.66)';
          targetCtx.fillRect(r.x, r.y, r.w, r.h);
          targetCtx.restore();
          targetCtx.save();
          targetCtx.beginPath();
          targetCtx.roundRect(r.x + 3 * dpr, r.y + 3 * dpr, r.w - 6 * dpr, r.h - 6 * dpr, Math.max(0, radiusPx - 2));
          targetCtx.setLineDash([6 * dpr, 6 * dpr]);
          targetCtx.strokeStyle = 'rgba(255,255,255,0.55)';
          targetCtx.lineWidth = 1.5 * dpr;
          targetCtx.stroke();
          targetCtx.restore();
        }
      }
    });

    drawTelemetryOverlay(targetCtx, outW, outH);
  }

  // Canonical 1080p Kerning-Preserving Glyph Layout Engine (Zero jump at 0px, zero hinting jitter!)
  function getKernedLineLayout(targetCtx, text, spacingPx) {
    if (!text) return { chars: [], offsets: [], totalW: 0 };
    if ('letterSpacing' in targetCtx) {
      try { targetCtx.letterSpacing = '0px'; } catch (_) {}
    }
    const chars = Array.from(text);
    const n = chars.length;
    if (n === 0) return { chars: [], offsets: [], totalW: 0 };

    const offsets = new Array(n);
    let prefix = '';
    for (let i = 0; i < n; i++) {
      const baseKernedX = i === 0 ? 0 : targetCtx.measureText(prefix).width;
      offsets[i] = baseKernedX + i * spacingPx;
      prefix += chars[i];
    }
    const naturalTotalW = targetCtx.measureText(text).width;
    const totalW = Math.max(0, naturalTotalW + (n > 1 ? (n - 1) * spacingPx : 0));
    return { chars, offsets, totalW };
  }

  function drawKernedTrackedLine(targetCtx, layout, anchorX, midY, align, isOutline, strokeW, fillStyle) {
    const { chars, offsets, totalW } = layout;
    if (!chars || chars.length === 0) return;

    let startX = anchorX - totalW / 2;
    if (align === 'left') startX = anchorX;
    else if (align === 'right') startX = anchorX - totalW;

    targetCtx.textAlign = 'left';
    targetCtx.textBaseline = 'middle';

    // Pass 1: Draw all character outlines first so strokes never overlap adjacent letter fills
    if (isOutline) {
      targetCtx.strokeStyle = 'rgba(4, 6, 12, 0.96)';
      targetCtx.lineWidth = strokeW;
      targetCtx.lineJoin = 'round';
      for (let i = 0; i < chars.length; i++) {
        targetCtx.strokeText(chars[i], startX + offsets[i], midY);
      }
    }

    // Pass 2: Draw all character fills cleanly on top
    targetCtx.fillStyle = fillStyle;
    for (let i = 0; i < chars.length; i++) {
      targetCtx.fillText(chars[i], startX + offsets[i], midY);
    }
  }

  function drawCollageCellText(targetCtx, r, cell, refScale, recordHitBox) {
    const mainTxt = (cell.text || '').trim();
    const subTxt = (cell.subText || '').trim();
    if (!mainTxt && !subTxt) return;

    const spec = getFontSpec(cell.fontFamily);
    // Measure & render in canonical 1080p reference coordinates via GPU scale(refScale, refScale)
    // This eliminates all integer font-size rounding and low-res OS font-hinting wobble!
    const canonFontSize = Math.max(12, cell.textSize || 26);
    const canonSubSize = Math.max(9, canonFontSize * 0.66);
    const canonSpacing = cell.textSpacing || 0;
    const canonSubSpacing = canonSpacing * 0.66;
    const orientMode = String(cell.textRot || '0');

    let anchorX = r.x + cell.tx * r.w;
    let anchorY = r.y + cell.ty * r.h;

    targetCtx.save();

    // =====================================================================
    // MODE A: VERTICAL STACKED UPRIGHT LETTERS (Stack V)
    // =====================================================================
    if (orientMode === 'stack') {
      const mainChars = mainTxt ? Array.from(mainTxt) : [];
      const subChars = subTxt ? Array.from(subTxt) : [];

      if ('letterSpacing' in targetCtx) {
        try { targetCtx.letterSpacing = '0px'; } catch (_) {}
      }

      targetCtx.font = `${spec.mainW} ${canonFontSize}px ${spec.family}`;
      let mainColW = 0;
      for (let i = 0; i < mainChars.length; i++) {
        mainColW = Math.max(mainColW, targetCtx.measureText(mainChars[i]).width);
      }
      const mainStepY = Math.max(canonFontSize * 0.58, canonFontSize * 0.94 + canonSpacing * 0.85);
      const mainColH = mainChars.length > 0 ? (mainChars.length - 1) * mainStepY + canonFontSize : 0;

      targetCtx.font = `${spec.subW} ${canonSubSize}px ${spec.family}`;
      let subColW = 0;
      for (let i = 0; i < subChars.length; i++) {
        subColW = Math.max(subColW, targetCtx.measureText(subChars[i]).width);
      }
      const subStepY = Math.max(canonSubSize * 0.58, canonSubSize * 0.94 + canonSubSpacing * 0.85);
      const subColH = subChars.length > 0 ? (subChars.length - 1) * subStepY + canonSubSize : 0;

      const colGap = (mainChars.length > 0 && subChars.length > 0) ? canonFontSize * 0.48 : 0;
      const contentW = mainColW + subColW + colGap;
      const contentH = Math.max(mainColH, subColH);

      const isBoxed = cell.textBg === 'pill' || cell.textBg === 'light';
      const padX = isBoxed ? canonFontSize * 0.52 : canonFontSize * 0.16;
      const padY = isBoxed ? canonFontSize * 0.42 : canonFontSize * 0.14;
      const totalW = contentW + padX * 2;
      const totalH = contentH + padY * 2;

      let boxLeft = -totalW / 2;
      if (cell.textAlign === 'left') boxLeft = 0;
      else if (cell.textAlign === 'right') boxLeft = -totalW;
      const boxTop = -totalH / 2;

      // Auto-clamp anchor inside cell boundaries so vertical stack is never cut off at edges
      const edgePad = Math.min(r.w, r.h) * 0.025;
      const scrLeft = boxLeft * refScale;
      const scrRight = (boxLeft + totalW) * refScale;
      const scrTop = boxTop * refScale;
      const scrBot = (boxTop + totalH) * refScale;
      if (scrRight - scrLeft < r.w - edgePad * 2) {
        anchorX = Math.max(r.x + edgePad - scrLeft, Math.min(r.x + r.w - edgePad - scrRight, anchorX));
      } else {
        anchorX = r.x + r.w / 2 - (scrLeft + scrRight) / 2;
      }
      if (scrBot - scrTop < r.h - edgePad * 2) {
        anchorY = Math.max(r.y + edgePad - scrTop, Math.min(r.y + r.h - edgePad - scrBot, anchorY));
      } else {
        anchorY = r.y + r.h / 2;
      }

      if (recordHitBox) {
        cell.lastTextHitBox = {
          x: anchorX + scrLeft - 10,
          y: anchorY + scrTop - 10,
          w: (scrRight - scrLeft) + 20,
          h: (scrBot - scrTop) + 20
        };
      }

      targetCtx.translate(anchorX, anchorY);
      targetCtx.scale(refScale, refScale);

      if (cell.textBg === 'pill') {
        targetCtx.fillStyle = 'rgba(6, 8, 14, 0.80)';
        targetCtx.strokeStyle = cell.textColor || '#FFFFFF';
        targetCtx.lineWidth = Math.max(1, canonFontSize * 0.055);
        targetCtx.beginPath();
        targetCtx.roundRect(boxLeft, boxTop, totalW, totalH, canonFontSize * 0.28);
        targetCtx.fill();
        targetCtx.stroke();
      } else if (cell.textBg === 'light') {
        targetCtx.fillStyle = 'rgba(248, 250, 252, 0.92)';
        targetCtx.beginPath();
        targetCtx.roundRect(boxLeft, boxTop, totalW, totalH, canonFontSize * 0.28);
        targetCtx.fill();
      } else if (cell.textBg === 'shadow') {
        targetCtx.shadowColor = 'rgba(0, 0, 0, 0.92)';
        targetCtx.shadowBlur = canonFontSize * 0.36 * refScale;
        targetCtx.shadowOffsetY = canonFontSize * 0.08 * refScale;
      }

      targetCtx.textAlign = 'center';
      targetCtx.textBaseline = 'middle';

      if (mainChars.length > 0) {
        const colCenterX = boxLeft + padX + mainColW / 2;
        targetCtx.font = `${spec.mainW} ${canonFontSize}px ${spec.family}`;
        const fillCol = cell.textBg === 'light' && (cell.textColor || '').toUpperCase() === '#FFFFFF'
          ? '#0F172A'
          : (cell.textColor || '#FFFFFF');

        if (cell.textBg === 'outline') {
          targetCtx.strokeStyle = 'rgba(4, 6, 12, 0.96)';
          targetCtx.lineWidth = Math.max(2.5, canonFontSize * 0.15);
          targetCtx.lineJoin = 'round';
          for (let i = 0; i < mainChars.length; i++) {
            const cy = (i - (mainChars.length - 1) / 2) * mainStepY;
            targetCtx.strokeText(mainChars[i], colCenterX, cy);
          }
        }
        targetCtx.fillStyle = fillCol;
        for (let i = 0; i < mainChars.length; i++) {
          const cy = (i - (mainChars.length - 1) / 2) * mainStepY;
          targetCtx.fillText(mainChars[i], colCenterX, cy);
        }
      }

      if (subChars.length > 0) {
        const subCenterX = boxLeft + padX + mainColW + colGap + subColW / 2;
        targetCtx.font = `${spec.subW} ${canonSubSize}px ${spec.family}`;
        const subFillCol = cell.textBg === 'light'
          ? '#334155'
          : ((cell.textColor || '').toUpperCase() === '#FFFFFF' ? '#38BDF8' : cell.textColor);

        if (cell.textBg === 'outline') {
          targetCtx.strokeStyle = 'rgba(4, 6, 12, 0.96)';
          targetCtx.lineWidth = Math.max(2, canonSubSize * 0.15);
          targetCtx.lineJoin = 'round';
          for (let i = 0; i < subChars.length; i++) {
            const cy = (i - (subChars.length - 1) / 2) * subStepY;
            targetCtx.strokeText(subChars[i], subCenterX, cy);
          }
        }
        targetCtx.fillStyle = subFillCol;
        for (let i = 0; i < subChars.length; i++) {
          const cy = (i - (subChars.length - 1) / 2) * subStepY;
          targetCtx.fillText(subChars[i], subCenterX, cy);
        }
      }

      targetCtx.restore();
      return;
    }

    // =====================================================================
    // MODE B: HORIZONTAL ('0') OR ROTATED VERTICAL ('-90')
    // =====================================================================
    targetCtx.font = `${spec.mainW} ${canonFontSize}px ${spec.family}`;
    const mainLayout = getKernedLineLayout(targetCtx, mainTxt, canonSpacing);

    targetCtx.font = `${spec.subW} ${canonSubSize}px ${spec.family}`;
    const subLayout = getKernedLineLayout(targetCtx, subTxt, canonSubSpacing);

    const contentW = Math.max(mainLayout.totalW, subLayout.totalW);
    const isBoxed = cell.textBg === 'pill' || cell.textBg === 'light';
    const padX = isBoxed ? canonFontSize * 0.55 : canonFontSize * 0.16;
    const padY = isBoxed ? canonFontSize * 0.34 : canonFontSize * 0.12;

    const mainLineH = mainTxt ? canonFontSize * 1.10 : 0;
    const subLineH = subTxt ? canonSubSize * 1.15 : 0;
    const lineGap = (mainTxt && subTxt) ? canonFontSize * 0.14 : 0;
    const contentH = mainLineH + subLineH + lineGap;

    const totalW = contentW + padX * 2;
    const totalH = contentH + padY * 2;

    let boxLeft = -totalW / 2;
    if (cell.textAlign === 'left') boxLeft = 0;
    else if (cell.textAlign === 'right') boxLeft = -totalW;
    const boxTop = -totalH / 2;

    // Auto-clamp anchor inside cell boundaries so wide spacing or rotated text never clips off-screen
    const edgePad = Math.min(r.w, r.h) * 0.025;
    let scrLeft, scrRight, scrTop, scrBot;
    if (orientMode === '-90') {
      scrLeft = boxTop * refScale;
      scrRight = (boxTop + totalH) * refScale;
      scrTop = -(boxLeft + totalW) * refScale;
      scrBot = -boxLeft * refScale;
    } else {
      scrLeft = boxLeft * refScale;
      scrRight = (boxLeft + totalW) * refScale;
      scrTop = boxTop * refScale;
      scrBot = (boxTop + totalH) * refScale;
    }

    if (scrRight - scrLeft < r.w - edgePad * 2) {
      anchorX = Math.max(r.x + edgePad - scrLeft, Math.min(r.x + r.w - edgePad - scrRight, anchorX));
    } else {
      anchorX = r.x + r.w / 2 - (scrLeft + scrRight) / 2;
    }
    if (scrBot - scrTop < r.h - edgePad * 2) {
      anchorY = Math.max(r.y + edgePad - scrTop, Math.min(r.y + r.h - edgePad - scrBot, anchorY));
    } else {
      anchorY = r.y + r.h / 2 - (scrTop + scrBot) / 2;
    }

    if (recordHitBox) {
      cell.lastTextHitBox = {
        x: anchorX + scrLeft - 10,
        y: anchorY + scrTop - 10,
        w: (scrRight - scrLeft) + 20,
        h: (scrBot - scrTop) + 20
      };
    }

    targetCtx.translate(anchorX, anchorY);
    if (orientMode === '-90') {
      targetCtx.rotate(-Math.PI / 2);
    }
    targetCtx.scale(refScale, refScale);

    // Background / Shadow Modes ('none' draws ZERO shadow and ZERO background!)
    if (cell.textBg === 'pill') {
      targetCtx.fillStyle = 'rgba(6, 8, 14, 0.80)';
      targetCtx.strokeStyle = cell.textColor || '#FFFFFF';
      targetCtx.lineWidth = Math.max(1, canonFontSize * 0.055);
      targetCtx.beginPath();
      targetCtx.roundRect(boxLeft, boxTop, totalW, totalH, canonFontSize * 0.28);
      targetCtx.fill();
      targetCtx.stroke();
    } else if (cell.textBg === 'light') {
      targetCtx.fillStyle = 'rgba(248, 250, 252, 0.92)';
      targetCtx.beginPath();
      targetCtx.roundRect(boxLeft, boxTop, totalW, totalH, canonFontSize * 0.28);
      targetCtx.fill();
    } else if (cell.textBg === 'shadow') {
      targetCtx.shadowColor = 'rgba(0, 0, 0, 0.92)';
      targetCtx.shadowBlur = canonFontSize * 0.36 * refScale;
      targetCtx.shadowOffsetY = canonFontSize * 0.08 * refScale;
    }

    let textDrawX = 0;
    if (cell.textAlign === 'left') textDrawX = padX;
    else if (cell.textAlign === 'right') textDrawX = -padX;

    if (mainTxt) {
      const mainMidY = boxTop + padY + mainLineH / 2;
      targetCtx.font = `${spec.mainW} ${canonFontSize}px ${spec.family}`;
      const mainFill = cell.textBg === 'light' && (cell.textColor || '').toUpperCase() === '#FFFFFF'
        ? '#0F172A'
        : (cell.textColor || '#FFFFFF');
      drawKernedTrackedLine(
        targetCtx,
        mainLayout,
        textDrawX,
        mainMidY,
        cell.textAlign || 'center',
        cell.textBg === 'outline',
        Math.max(2.5, canonFontSize * 0.15),
        mainFill
      );
    }

    if (subTxt) {
      const subMidY = boxTop + padY + (mainTxt ? mainLineH + lineGap : 0) + subLineH / 2;
      targetCtx.font = `${spec.subW} ${canonSubSize}px ${spec.family}`;
      const subFill = cell.textBg === 'light'
        ? '#334155'
        : ((cell.textColor || '').toUpperCase() === '#FFFFFF' ? '#38BDF8' : cell.textColor);
      drawKernedTrackedLine(
        targetCtx,
        subLayout,
        textDrawX,
        subMidY,
        cell.textAlign || 'center',
        cell.textBg === 'outline',
        Math.max(2, canonSubSize * 0.15),
        subFill
      );
    }

    targetCtx.restore();
  }

  function renderCollagePreview() {
    syncCanvasSize();
    if (!collageCanvas.width || !collageCanvas.height) return;
    const dpr = state.dpr;
    colCtx.clearRect(0, 0, collageCanvas.width, collageCanvas.height);

    const stage = getCollageStageRect();

    colCtx.save();
    colCtx.translate(stage.x, stage.y);
    renderCollageToContext(colCtx, stage.w, stage.h, true);
    colCtx.restore();
    if (collageState.lift) drawCollageLiftGhost(colCtx, stage);

    colCtx.save();
    colCtx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
    colCtx.lineWidth = 1.5 * dpr;
    colCtx.strokeRect(stage.x, stage.y, stage.w, stage.h);
    colCtx.restore();

    const outW = state.exportWidth;
    const outH = Math.round(outW / stage.aspect);
    const cell = collageState.cells[collageState.activeCell];
    const zoomPct = cell ? Math.round(cell.zoom * 100) : 100;
    document.getElementById('resDims').textContent = `Box #${collageState.activeCell + 1} • ${outW}×${outH}`;
    const zoomEl = document.getElementById('resZoom');
    zoomEl.textContent = `${zoomPct}%`;
    document.getElementById('qDot').classList.remove('warn');
    zoomEl.classList.remove('warn');
  }

  function getCollageSourcePins(image) {
    if (image !== state.img) return collageSourcePins.get(image);
    const dims = getTransformedDims();
    return {
      annotations: state.annotations,
      width: dims.w,
      height: dims.h,
      angle: (state.rot90 + state.fineAngle) * Math.PI / 180
    };
  }

  function rememberCollageSourcePins() {
    if (!state.img || !state.annotations.length) return;
    const source = getCollageSourcePins(state.img);
    collageSourcePins.set(state.img, { ...source, annotations: source.annotations.map(pin => ({ ...pin })) });
  }

  function drawCollageCellMarkers(ctx, cell, x, y, w, h, cx, cy, scale) {
    if (state.markersVisible === false) return;
    const source = getCollageSourcePins(cell.img);
    if (!source?.annotations.length) return;

    // Convert from the edited main photo to source pixels, then apply the box's photo transform.
    const angle = (cell.rot90 || 0) * Math.PI / 180 - source.angle;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const xSign = cell.flipH ? -1 : 1;
    const annotations = [];
    for (const pin of source.annotations) {
      const px = (pin.nx - 0.5) * source.width * scale;
      const py = (pin.ny - 0.5) * source.height * scale;
      const nx = (cx - x + xSign * (px * cos - py * sin)) / w;
      const ny = (cy - y + px * sin + py * cos) / h;
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) continue;
      annotations.push({ ...pin, id: 'collage:' + pin.id, nx, ny, lman: false });
    }
    if (!annotations.length) return;
    const shortSide = Math.min(w, h);
    let layoutCache = collageMarkerLayouts.get(cell);
    if (!layoutCache) {
      layoutCache = {};
      collageMarkerLayouts.set(cell, layoutCache);
    }
    const frame = {
      cx: x + w / 2, cy: y + h / 2, imgScreenW: w, imgScreenH: h,
      imgLeft: x, imgRight: x + w, imgTop: y, imgBot: y + h,
      baseUnit: shortSide * 0.030, s: shortSide / 320,
      teleAligned: false, ignoreMoonDisc: true, layoutCache
    };
    const layout = annLayout(ctx, annotations, frame);
    layout.items.slice().sort((a, b) => b.geom.R - a.geom.R).forEach(item => annDrawMarker(ctx, item));
    annDrawLabels(ctx, layout, frame);
  }

  // Draws one box's picture and fixed markers in its current framing.
  function drawCollageCellImageInto(c2d, cell, x, y, w, h, rad) {
    const img = cell && cell.img;
    if (!img) return;
    const origW = img.naturalWidth || img.width || 1000, origH = img.naturalHeight || img.height || 1000;
    const turned = (cell.rot90 % 180) !== 0, effW = turned ? origH : origW, effH = turned ? origW : origH;
    const sc = Math.max(w / effW, h / effH) * cell.zoom;
    const cx = x + w / 2 + cell.panX * w;
    const cy = y + h / 2 + cell.panY * h;
    c2d.save();
    c2d.beginPath(); c2d.roundRect(x, y, w, h, rad); c2d.clip();
    c2d.save();
    c2d.translate(cx, cy);
    if (cell.flipH) c2d.scale(-1, 1);
    c2d.rotate((cell.rot90 * Math.PI) / 180);
    c2d.scale(sc, sc);
    c2d.drawImage(img, -origW / 2, -origH / 2, origW, origH);
    c2d.restore();
    drawCollageCellMarkers(c2d, cell, x, y, w, h, cx, cy, sc);
    c2d.restore();
  }
  // The picked-up image: a floating copy that follows the finger / cursor
  function drawCollageLiftGhost(c2d, stage) {
    const lift = collageState.lift, cell = lift && collageState.cells[lift.from];
    if (!cell || !cell.img) return;
    const src = getCollageCellRects(stage.w, stage.h)[lift.from];
    if (!src) return;
    const dpr = state.dpr, k = Math.min(1, (performance.now() - lift.t0) / 170), e = 1 - Math.pow(1 - k, 3);
    const sc = Math.min(1, (Math.min(stage.w, 230 * dpr) * 0.5) / src.w * 1.6, (Math.min(stage.h, 230 * dpr) * 0.5) / src.h * 1.6);
    const gw = src.w * sc, gh = src.h * sc, rad = 12 * dpr;
    const up = lift.type === 'touch' ? gh * 0.5 + 22 * dpr : 0;                 // keep it clear of the fingertip
    c2d.save();
    c2d.translate(stage.x + lift.x, stage.y + lift.y - up);
    c2d.rotate(-0.03 * e);
    c2d.scale(0.8 + 0.2 * e, 0.8 + 0.2 * e);
    c2d.globalAlpha = 0.45 + 0.55 * e;
    c2d.shadowColor = 'rgba(0,0,0,0.6)'; c2d.shadowBlur = 28 * dpr; c2d.shadowOffsetY = 12 * dpr;
    c2d.fillStyle = '#0B0F19';
    c2d.beginPath(); c2d.roundRect(-gw / 2, -gh / 2, gw, gh, rad); c2d.fill();
    c2d.shadowColor = 'transparent';
    drawCollageCellImageInto(c2d, cell, -gw / 2, -gh / 2, gw, gh, rad);
    c2d.strokeStyle = 'rgba(255,255,255,0.92)'; c2d.lineWidth = 2 * dpr;
    c2d.beginPath(); c2d.roundRect(-gw / 2, -gh / 2, gw, gh, rad); c2d.stroke();
    c2d.restore();
    if (k < 1) requestAnimationFrame(() => { if (collageState.lift) renderCollagePreview(); });
  }

  function renderHighResCollageCanvas() {
    const aspect = COLLAGE_ASPECTS[collageState.aspect] || (3 / 4);
    const outW = state.exportWidth;
    const outH = Math.round(outW / aspect);
    const off = document.createElement('canvas');
    off.width = outW;
    off.height = outH;
    const octx = off.getContext('2d');
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';
    renderCollageToContext(octx, outW, outH, false);
    return off;
  }

  function syncCollageUI() {
    ensureCollageCellsCount();
    const tpl = COLLAGE_TEMPLATES[collageState.template] || COLLAGE_TEMPLATES['2v'];
    const numBoxes = tpl.length;
    const activeIdx = collageState.activeCell;
    const cell = collageState.cells[activeIdx];

    const selGroup = document.getElementById('colCellSelectorGroup');
    selGroup.innerHTML = '';
    for (let i = 0; i < numBoxes; i++) {
      const btn = document.createElement('button');
      btn.className = 'seg-btn' + (i === activeIdx ? ' active' : '');
      btn.textContent = `#${i + 1}`;
      btn.title = `Select Box #${i + 1}`;
      btn.addEventListener('click', () => {
        collageState.activeCell = i;
        syncCollageUI();
        renderCollagePreview();
      });
      selGroup.appendChild(btn);
    }

    document.getElementById('lblTextTargetBox').textContent = `Box #${activeIdx + 1}`;

    const syncBtn = document.getElementById('btnSyncAllTextStyles');
    if (syncBtn) {
      syncBtn.classList.toggle('active', collageState.syncTextStyle);
      syncBtn.textContent = collageState.syncTextStyle ? 'Sync All Boxes: ON' : 'Sync All Boxes: OFF';
    }

    document.querySelectorAll('#colAspectGroup .seg-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.caspect === collageState.aspect);
    });
    document.querySelectorAll('#colTemplateGroup .layout-card').forEach(card => {
      card.classList.toggle('active', card.dataset.ctpl === collageState.template);
    });

    if (cell) {
      document.getElementById('rngColCellZoom').value = cell.zoom;
      document.getElementById('lblColCellZoom').textContent = `${cell.zoom.toFixed(2)}×`;

      document.getElementById('colTextMainInput').value = cell.text || '';
      document.getElementById('colTextSubInput').value = cell.subText || '';
      document.getElementById('colFontSelect').value = cell.fontFamily || "'Inter', -apple-system, sans-serif";
      document.getElementById('rngColTextSize').value = cell.textSize;
      document.getElementById('lblColTextSize').textContent = `${cell.textSize}px`;

      const spVal = cell.textSpacing || 0;
      document.getElementById('rngColTextSpacing').value = spVal;
      document.getElementById('lblColTextSpacing').textContent = `${Number(spVal).toFixed(1)}px`;

      const hexCol = (cell.textColor || '#FFFFFF').toUpperCase();
      document.getElementById('colHexInput').value = hexCol;
      document.getElementById('colHexColorChip').style.background = hexCol;
      if (/^#[0-9A-F]{6}$/i.test(hexCol)) {
        document.getElementById('colCustomColorPicker').value = hexCol;
      }

      document.querySelectorAll('#colColorPalette .color-swatch').forEach(sw => {
        sw.classList.toggle('active', sw.dataset.ccolor.toUpperCase() === hexCol);
      });

      document.querySelectorAll('#colQuickAlignGroup .btn-align-pos').forEach(b => {
        b.classList.toggle('active', b.dataset.calign === cell.textPresetPos);
      });

      document.querySelectorAll('#colTextBgGroup .seg-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.ctbg === cell.textBg);
      });

      const curOrient = String(cell.textRot || '0');
      document.querySelectorAll('#colTextOrientGroup .seg-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.ctorient === curOrient);
      });
    }

    document.getElementById('rngColGap').value = collageState.gap;
    document.getElementById('lblColGap').textContent = collageState.gap;
    document.getElementById('rngColMargin').max = collageState.template === 'blurfit' ? '150' : '60';
    document.getElementById('rngColMargin').value = collageState.margin;
    document.getElementById('lblColMargin').textContent = collageState.margin;
    document.getElementById('rngColRadius').value = collageState.radius;
    document.getElementById('lblColRadius').textContent = collageState.radius;
    document.getElementById('rngColBorder').value = collageState.borderW;
    document.getElementById('lblColBorder').textContent = collageState.borderW;

    document.querySelectorAll('#colBgStyleGroup .seg-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.cbg === collageState.bgStyle);
    });
    document.getElementById('colBgHexInput').value = (collageState.bgCustomHex || '#0F172A').toUpperCase();
    document.getElementById('colBgHexChip').style.background = collageState.bgCustomHex || '#0F172A';

    document.getElementById('rngColBlur').value = collageBlur();
    document.getElementById('lblColBlur').textContent = `${collageBlur()}px`;
    document.getElementById('colBgBlurRow').classList.toggle('is-off', collageState.bgStyle !== 'blur');
    const gapBar = document.getElementById('colGapBar');       // a single box has no gap to set
    gapBar.classList.toggle('is-off', numBoxes < 2);
    gapBar.classList.toggle('is-inert', numBoxes < 2);
  }

  function hitTestCollageCell(localX, localY, stageW, stageH) {
    const rects = getCollageCellRects(stageW, stageH);
    if (rects.length === 1 && rects[0].isFit) {        // Blur Fit: the whole canvas belongs to the one photo (pan / zoom anywhere)
      return localX >= 0 && localX <= stageW && localY >= 0 && localY <= stageH ? { idx: 0, rect: rects[0] } : null;
    }
    for (let i = rects.length - 1; i >= 0; i--) {
      const r = rects[i];
      if (localX >= r.x && localX <= r.x + r.w && localY >= r.y && localY <= r.y + r.h) {
        return { idx: i, rect: r };
      }
    }
    return null;
  }

  // Interactive Pointer Gestures on Full-Size #collageCanvas
  const colPointers = new Map();
  let colPrevPinchDist = null;
  let colDraggingType = null;
  let colUndoSavedForGesture = false;
  let colHold = null;                       // press-and-hold waiting to lift an image: { timer, id, cx, cy, pt, idx, type }
  const COL_HOLD_MS = 380, COL_HOLD_SLOP = 9;   // hold time, and how far (css px) a finger may drift while holding

  collageCanvas.addEventListener('pointerdown', e => {
    collageCanvas.setPointerCapture(e.pointerId);
    const rect = collageCanvas.getBoundingClientRect();
    const dpr = state.dpr;
    const stage = getCollageStageRect();
    const pt = {
      x: (e.clientX - rect.left) * dpr - stage.x,
      y: (e.clientY - rect.top) * dpr - stage.y
    };
    colPointers.set(e.pointerId, pt);

    if (colPointers.size === 1) {
      colUndoSavedForGesture = false;
      const hit = hitTestCollageCell(pt.x, pt.y, stage.w, stage.h);
      if (hit) {
        if (collageState.activeCell !== hit.idx) {
          collageState.activeCell = hit.idx;
          syncCollageUI();
          renderCollagePreview();
        }
        const cell = collageState.cells[hit.idx];
        const hb = cell && cell.lastTextHitBox;
        if (collageState.dragMode === 'text' || (hb && pt.x >= hb.x && pt.x <= hb.x + hb.w && pt.y >= hb.y && pt.y <= hb.y + hb.h)) {
          colDraggingType = 'text';
        } else {
          colDraggingType = 'image';
          const tplCount = (COLLAGE_TEMPLATES[collageState.template] || []).length;
          if (cell && cell.img && tplCount > 1) {
            cancelColHold();
            colHold = { id: e.pointerId, cx: e.clientX, cy: e.clientY, pt, idx: hit.idx, type: e.pointerType || 'mouse', timer: setTimeout(beginColLift, COL_HOLD_MS) };
          }
        }
      }
    } else if (colPointers.size === 2) {
      cancelColHold(); cancelColLift();
      const pts = Array.from(colPointers.values());
      colPrevPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    }
  });

  collageCanvas.addEventListener('pointermove', e => {
    if (!colPointers.has(e.pointerId)) return;
    if (collageState.lift) {                                   // a lifted image follows the pointer
      const r0 = collageCanvas.getBoundingClientRect(), st0 = getCollageStageRect();
      const lx = (e.clientX - r0.left) * state.dpr - st0.x, ly = (e.clientY - r0.top) * state.dpr - st0.y;
      colPointers.set(e.pointerId, { x: lx, y: ly });
      collageState.lift.x = lx; collageState.lift.y = ly;
      const h0 = hitTestCollageCell(lx, ly, st0.w, st0.h);
      collageState.hoverDropCell = h0 && h0.idx !== collageState.lift.from ? h0.idx : -1;
      renderCollagePreview();
      return;
    }
    if (colHold && colHold.id === e.pointerId) {
      if (Math.hypot(e.clientX - colHold.cx, e.clientY - colHold.cy) < COL_HOLD_SLOP) return;   // still holding: no drift
      clearTimeout(colHold.timer);
      colPointers.set(e.pointerId, colHold.pt);                // pan from where the finger first touched
      colHold = null;
    }
    const rect = collageCanvas.getBoundingClientRect();
    const dpr = state.dpr;
    const stage = getCollageStageRect();
    const prev = colPointers.get(e.pointerId);
    const curr = {
      x: (e.clientX - rect.left) * dpr - stage.x,
      y: (e.clientY - rect.top) * dpr - stage.y
    };
    colPointers.set(e.pointerId, curr);

    const activeIdx = collageState.activeCell;
    const cell = collageState.cells[activeIdx];
    const rects = getCollageCellRects(stage.w, stage.h);
    const cellRect = rects[activeIdx];
    if (!cell || !cellRect) return;

    if (!colUndoSavedForGesture && (Math.hypot(curr.x - prev.x, curr.y - prev.y) > 1.5)) {
      saveCollageUndo();
      colUndoSavedForGesture = true;
    }

    if (colPointers.size === 1) {
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      if (colDraggingType === 'text') {
        const tRect = cellRect.textRect || cellRect;
        let newTx = clamp01(cell.tx + dx / Math.max(1, tRect.w));
        let newTy = clamp01(cell.ty + dy / Math.max(1, tRect.h));

        // Magnetic Center Snap Guides (snaps within 2.2% of 0.50 center)
        collageState.snapGuideX = Math.abs(newTx - 0.5) < 0.022;
        collageState.snapGuideY = Math.abs(newTy - 0.5) < 0.022;
        if (collageState.snapGuideX) newTx = 0.5;
        if (collageState.snapGuideY) newTy = 0.5;

        cell.tx = newTx;
        cell.ty = newTy;
        cell.textPresetPos = 'custom';
        syncTextStyleAcrossCollage(cell);
        document.querySelectorAll('#colQuickAlignGroup .btn-align-pos').forEach(b => b.classList.remove('active'));
        renderCollagePreview();
      } else {
        cell.panX += dx / Math.max(1, cellRect.w);
        cell.panY += dy / Math.max(1, cellRect.h);
        clampCollageCellTransform(cell, cellRect.w, cellRect.h);
        renderCollagePreview();
      }
    } else if (colPointers.size === 2) {
      const pts = Array.from(colPointers.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      if (colPrevPinchDist && colPrevPinchDist > 10) {
        const factor = dist / colPrevPinchDist;
        cell.zoom = Math.max(1.0, Math.min(6.0, cell.zoom * factor));
        clampCollageCellTransform(cell, cellRect.w, cellRect.h);
        document.getElementById('rngColCellZoom').value = cell.zoom;
        document.getElementById('lblColCellZoom').textContent = `${cell.zoom.toFixed(2)}×`;
        renderCollagePreview();
      }
      colPrevPinchDist = dist;
    }
  });

  function cancelColHold() { if (colHold) { clearTimeout(colHold.timer); colHold = null; } }
  function cancelColLift() {
    if (!collageState.lift) return;
    collageState.lift = null; collageState.hoverDropCell = -1; collageCanvas.style.cursor = '';
    renderCollagePreview();
  }
  function beginColLift() {
    const h = colHold; colHold = null;
    if (!h || colPointers.size !== 1 || state.appMode !== 'collage') return;
    collageState.lift = { from: h.idx, x: h.pt.x, y: h.pt.y, type: h.type, t0: performance.now() };
    collageState.hoverDropCell = -1;
    collageState.activeCell = h.idx;
    colDraggingType = 'lift';
    try { if (navigator.vibrate) navigator.vibrate(14); } catch (_) {}
    collageCanvas.style.cursor = 'grabbing';
    renderCollagePreview();
  }
  // Swap two boxes (picture, framing, caption) - same result as the HUD "Swap" button, with a short flight animation
  function swapCollageCells(a, b) {
    const ca = collageState.cells[a], cb = collageState.cells[b];
    if (!ca || !cb || a === b) return;
    saveCollageUndo();
    collageState.cells[a] = cb; collageState.cells[b] = ca;
    ca.lastTextHitBox = null; cb.lastTextHitBox = null;
    collageState.activeCell = b;
    collageState.swapAnim = { a, b, t0: performance.now(), dur: 300 };
    syncCollageUI();
    const step = () => {
      const an = collageState.swapAnim;
      if (!an) return;
      if (state.appMode !== 'collage' || performance.now() - an.t0 >= an.dur) collageState.swapAnim = null;
      renderCollagePreview();
      if (collageState.swapAnim) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  collageCanvas.addEventListener('contextmenu', e => { if (colHold || collageState.lift) e.preventDefault(); });

  function onColPointerUp(e) {
    if (colHold && colHold.id === e.pointerId) cancelColHold();
    if (collageState.lift) {
      const from = collageState.lift.from;
      let target = -1;
      if (e.type === 'pointerup') {
        const r0 = collageCanvas.getBoundingClientRect(), st0 = getCollageStageRect();
        const h0 = hitTestCollageCell((e.clientX - r0.left) * state.dpr - st0.x, (e.clientY - r0.top) * state.dpr - st0.y, st0.w, st0.h);
        if (h0 && h0.idx !== from) target = h0.idx;
      }
      collageState.lift = null; collageState.hoverDropCell = -1; collageCanvas.style.cursor = '';
      if (target >= 0) swapCollageCells(from, target); else renderCollagePreview();
    }
    colPointers.delete(e.pointerId);
    if (colPointers.size < 2) colPrevPinchDist = null;
    if (colPointers.size === 0) {
      colDraggingType = null;
      if (collageState.snapGuideX || collageState.snapGuideY) {
        collageState.snapGuideX = false;
        collageState.snapGuideY = false;
        renderCollagePreview();
      }
    }
  }
  collageCanvas.addEventListener('pointerup', onColPointerUp);
  collageCanvas.addEventListener('pointercancel', onColPointerUp);

  // Mouse Wheel Zoom on Full-Size #collageCanvas (Clamped >= 1.0x)
  collageCanvas.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = collageCanvas.getBoundingClientRect();
    const dpr = state.dpr;
    const stage = getCollageStageRect();
    const localX = (e.clientX - rect.left) * dpr - stage.x;
    const localY = (e.clientY - rect.top) * dpr - stage.y;

    const hit = hitTestCollageCell(localX, localY, stage.w, stage.h);
    if (hit && collageState.activeCell !== hit.idx) {
      collageState.activeCell = hit.idx;
      syncCollageUI();
    }
    const cell = collageState.cells[collageState.activeCell];
    if (!cell) return;
    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    cell.zoom = Math.max(1.0, Math.min(6.0, cell.zoom * factor));
    const rects = getCollageCellRects(stage.w, stage.h);
    const cellRect = rects[collageState.activeCell];
    if (cellRect) clampCollageCellTransform(cell, cellRect.w, cellRect.h);
    document.getElementById('rngColCellZoom').value = cell.zoom;
    document.getElementById('lblColCellZoom').textContent = `${cell.zoom.toFixed(2)}×`;
    renderCollagePreview();
  }, { passive: false });

  async function decodeFileForCollageCell(file) {
    if (!file) return null;
    try {
      const objUrl = URL.createObjectURL(file);
      const loadedImg = await new Promise(resolve => {
        const im = new Image();
        im.onload = () => {
          URL.revokeObjectURL(objUrl);
          resolve(im);
        };
        im.onerror = () => {
          URL.revokeObjectURL(objUrl);
          resolve(null);
        };
        im.src = objUrl;
      });
      if (loadedImg) return loadedImg;
    } catch (_) {}

    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = ev => resolve(ev.target.result);
        reader.onerror = () => reject();
        reader.readAsDataURL(file);
      });
      if (dataUrl) {
        return await new Promise(resolve => {
          const im = new Image();
          im.onload = () => resolve(im);
          im.onerror = () => resolve(null);
          im.src = dataUrl;
        });
      }
    } catch (_) {}
    return null;
  }

  async function loadFilesIntoCollageBoxes(fileList, startBoxIdx) {
    ensureCollageCellsCount();
    const files = fileList.filter(f => !f.type || f.type.startsWith('image/'));
    if (files.length === 0 && fileList.length > 0) files.push(fileList[0]);
    if (files.length === 0) return;

    saveCollageUndo();
    for (let i = 0; i < files.length; i++) {
      const cellIdx = (startBoxIdx + i) % collageState.cells.length;
      const decoded = await decodeFileForCollageCell(files[i]);
      if (decoded) {
        setCollageCellImage(collageState.cells[cellIdx], decoded, false);
      }
    }
    collageState.activeCell = startBoxIdx;
    syncCollageUI();
    renderCollagePreview();
    showToast(files.length > 1 ? `Loaded ${files.length} photos into collage` : `Loaded photo into Box #${startBoxIdx + 1}`);
  }

  document.getElementById('collageCellFileInput').addEventListener('change', async e => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    await loadFilesIntoCollageBoxes(files, collageState.activeCell);
    e.target.value = '';
  });

  document.getElementById('btnCollageUndo').addEventListener('click', undoCollageAction);
  document.getElementById('btnColMarkers').addEventListener('click', toggleMarkersVisibility);

  document.getElementById('btnColToggleDragMode').addEventListener('click', e => {
    collageState.dragMode = collageState.dragMode === 'image' ? 'text' : 'image';
    e.currentTarget.textContent = collageState.dragMode === 'text' ? 'Mode: Text' : 'Mode: Pan';
    showToast(collageState.dragMode === 'text' ? 'Drag mode: Move Text inside Box' : 'Drag mode: Move Photo inside Box');
  });

  document.querySelectorAll('#collageTabsNav .col-subtab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#collageTabsNav .col-subtab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const targetId = btn.dataset.ctab;
      document.querySelectorAll('.col-subpanel').forEach(sec => {
        sec.classList.toggle('active', sec.id === targetId);
      });
    });
  });

  document.getElementById('btnColUseMainImg').addEventListener('click', () => {
    if (!state.img) return;
    saveCollageUndo();
    const c = collageState.cells[collageState.activeCell];
    if (c) {
      setCollageCellImage(c, state.img, true);
      syncCollageUI();
      renderCollagePreview();
      showToast(`Set main photo in Box #${collageState.activeCell + 1}`);
    }
  });

  document.getElementById('btnColSwapNext').addEventListener('click', () => {
    const tpl = COLLAGE_TEMPLATES[collageState.template] || COLLAGE_TEMPLATES['2v'];
    if (tpl.length < 2) return;
    const i1 = collageState.activeCell;
    const i2 = (i1 + 1) % tpl.length;
    swapCollageCells(i1, i2);
    showToast(`Swapped Box #${i1 + 1} ↔ Box #${i2 + 1}`);
  });

  document.getElementById('btnColFitCell').addEventListener('click', () => {
    saveCollageUndo();
    const c = collageState.cells[collageState.activeCell];
    if (c) {
      c.zoom = 1.0;
      c.panX = 0;
      c.panY = 0;
      syncCollageUI();
      renderCollagePreview();
    }
  });

  document.getElementById('btnColRotCell').addEventListener('click', () => {
    saveCollageUndo();
    const c = collageState.cells[collageState.activeCell];
    if (c) {
      c.rot90 = (c.rot90 + 90) % 360;
      renderCollagePreview();
    }
  });

  document.getElementById('btnColFlipH').addEventListener('click', () => {
    saveCollageUndo();
    const c = collageState.cells[collageState.activeCell];
    if (c) {
      c.flipH = !c.flipH;
      renderCollagePreview();
      showToast(`Mirrored Box #${collageState.activeCell + 1}`);
    }
  });

  document.querySelectorAll('#colAspectGroup .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      saveCollageUndo();
      collageState.aspect = btn.dataset.caspect;
      syncCollageUI();
      renderCollagePreview();
    });
  });

  document.querySelectorAll('#colTemplateGroup .layout-card').forEach(card => {
    card.addEventListener('click', () => {
      saveCollageUndo();
      setCollageTemplate(card.dataset.ctpl);
      ensureCollageCellsCount();
      syncCollageUI();
      renderCollagePreview();
      if (collageState.template === 'blurfit') {
        try {
          if (!localStorage.getItem('instaSliceFitTip')) {
            localStorage.setItem('instaSliceFitTip', '1');
            showToast('Blur Fit: Margin sets the photo size, BG Blur softens the backdrop', 4200);
          }
        } catch (_) {}
      }
    });
  });

  // Set min="1.0" on rngColCellZoom so slider never goes below 100% coverage
  const rngColZoomEl = document.getElementById('rngColCellZoom');
  rngColZoomEl.min = '1.0';
  rngColZoomEl.addEventListener('input', e => {
    const c = collageState.cells[collageState.activeCell];
    if (!c) return;
    c.zoom = Math.max(1.0, parseFloat(e.target.value));
    document.getElementById('lblColCellZoom').textContent = `${c.zoom.toFixed(2)}×`;
    renderCollagePreview();
  });

  // Sync All Boxes Toggle Button
  document.getElementById('btnSyncAllTextStyles').addEventListener('click', () => {
    collageState.syncTextStyle = !collageState.syncTextStyle;
    if (collageState.syncTextStyle) {
      const c = collageState.cells[collageState.activeCell];
      if (c) syncTextStyleAcrossCollage(c);
      showToast('Typography style synced across all boxes');
    } else {
      showToast('Independent box typography enabled');
    }
    syncCollageUI();
    renderCollagePreview();
  });

  document.getElementById('colTextMainInput').addEventListener('input', e => {
    const c = collageState.cells[collageState.activeCell];
    if (!c) return;
    c.text = e.target.value;
    renderCollagePreview();
  });

  document.getElementById('colTextSubInput').addEventListener('input', e => {
    const c = collageState.cells[collageState.activeCell];
    if (!c) return;
    c.subText = e.target.value;
    renderCollagePreview();
  });

  function onColFontFamilyChange(newFontFam) {
    const c = collageState.cells[collageState.activeCell];
    if (!c) return;
    saveCollageUndo();
    c.fontFamily = newFontFam;
    syncTextStyleAcrossCollage(c);
    renderCollagePreview();
    ensureCanvasFontReady(newFontFam, () => {
      renderCollagePreview();
    });
  }

  document.getElementById('colFontSelect').addEventListener('change', e => {
    onColFontFamilyChange(e.target.value);
  });
  document.getElementById('colFontSelect').addEventListener('input', e => {
    onColFontFamilyChange(e.target.value);
  });

  document.getElementById('btnColClearBoxText').addEventListener('click', () => {
    const c = collageState.cells[collageState.activeCell];
    if (!c) return;
    saveCollageUndo();
    c.text = '';
    c.subText = '';
    syncCollageUI();
    renderCollagePreview();
  });

  const ALIGN_PRESETS = {
    'center': { tx: 0.50, ty: 0.50, align: 'center', label: 'Center' },
    'left':   { tx: 0.06, ty: 0.50, align: 'left',   label: 'Left' },
    'right':  { tx: 0.94, ty: 0.50, align: 'right',  label: 'Right' },
    'top':    { tx: 0.50, ty: 0.11, align: 'center', label: 'Top Center' },
    'bottom': { tx: 0.50, ty: 0.89, align: 'center', label: 'Bottom Center' }
  };

  document.querySelectorAll('#colQuickAlignGroup .btn-align-pos').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = collageState.cells[collageState.activeCell];
      if (!c) return;
      saveCollageUndo();
      const key = btn.dataset.calign;
      const preset = ALIGN_PRESETS[key] || ALIGN_PRESETS['bottom'];
      c.tx = preset.tx;
      c.ty = preset.ty;
      c.textAlign = preset.align;
      c.textPresetPos = key;
      syncTextStyleAcrossCollage(c);
      syncCollageUI();
      renderCollagePreview();
      showToast(`Text aligned: ${preset.label}`);
    });
  });

  document.querySelectorAll('#colColorPalette .color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      const c = collageState.cells[collageState.activeCell];
      if (!c) return;
      c.textColor = sw.dataset.ccolor.toUpperCase();
      syncTextStyleAcrossCollage(c);
      syncCollageUI();
      renderCollagePreview();
    });
  });

  document.getElementById('colCustomColorPicker').addEventListener('input', e => {
    const valid = normalizeHexColor(e.target.value);
    if (valid) {
      const c = collageState.cells[collageState.activeCell];
      if (!c) return;
      c.textColor = valid;
      document.getElementById('colHexInput').value = valid;
      document.getElementById('colHexColorChip').style.background = valid;
      syncTextStyleAcrossCollage(c);
      document.querySelectorAll('#colColorPalette .color-swatch').forEach(sw => {
        sw.classList.toggle('active', sw.dataset.ccolor.toUpperCase() === valid);
      });
      renderCollagePreview();
    }
  });

  document.getElementById('colHexInput').addEventListener('input', e => {
    const valid = normalizeHexColor(e.target.value);
    if (valid) {
      const c = collageState.cells[collageState.activeCell];
      if (!c) return;
      c.textColor = valid;
      document.getElementById('colHexColorChip').style.background = valid;
      document.getElementById('colCustomColorPicker').value = valid;
      syncTextStyleAcrossCollage(c);
      document.querySelectorAll('#colColorPalette .color-swatch').forEach(sw => {
        sw.classList.toggle('active', sw.dataset.ccolor.toUpperCase() === valid);
      });
      renderCollagePreview();
    }
  });

  document.getElementById('rngColTextSize').addEventListener('input', e => {
    const c = collageState.cells[collageState.activeCell];
    if (!c) return;
    c.textSize = parseInt(e.target.value, 10);
    document.getElementById('lblColTextSize').textContent = `${c.textSize}px`;
    syncTextStyleAcrossCollage(c);
    renderCollagePreview();
  });

  document.getElementById('rngColTextSpacing').addEventListener('input', e => {
    const c = collageState.cells[collageState.activeCell];
    if (!c) return;
    c.textSpacing = parseFloat(e.target.value);
    document.getElementById('lblColTextSpacing').textContent = `${c.textSpacing.toFixed(1)}px`;
    syncTextStyleAcrossCollage(c);
    renderCollagePreview();
  });

  document.querySelectorAll('#colTextBgGroup .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = collageState.cells[collageState.activeCell];
      if (!c) return;
      c.textBg = btn.dataset.ctbg;
      syncTextStyleAcrossCollage(c);
      syncCollageUI();
      renderCollagePreview();
    });
  });

  document.querySelectorAll('#colTextOrientGroup .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = collageState.cells[collageState.activeCell];
      if (!c) return;
      saveCollageUndo();
      c.textRot = btn.dataset.ctorient;
      syncTextStyleAcrossCollage(c);
      syncCollageUI();
      renderCollagePreview();
      const modeName = c.textRot === 'stack' ? 'Vertical Stacked Letters' : (c.textRot === '-90' ? 'Rotated -90°' : 'Horizontal');
      showToast(`Text orientation: ${modeName}`);
    });
  });

  document.getElementById('rngColGap').addEventListener('input', e => {
    collageState.gap = parseInt(e.target.value, 10);
    document.getElementById('lblColGap').textContent = collageState.gap;
    renderCollagePreview();
  });

  document.getElementById('rngColMargin').addEventListener('input', e => {
    collageState.margin = parseInt(e.target.value, 10);
    document.getElementById('lblColMargin').textContent = collageState.margin;
    renderCollagePreview();
  });

  document.getElementById('rngColRadius').addEventListener('input', e => {
    collageState.radius = parseInt(e.target.value, 10);
    document.getElementById('lblColRadius').textContent = collageState.radius;
    renderCollagePreview();
  });

  document.getElementById('rngColBorder').addEventListener('input', e => {
    collageState.borderW = parseFloat(e.target.value);
    document.getElementById('lblColBorder').textContent = collageState.borderW;
    renderCollagePreview();
  });

  document.querySelectorAll('#colBgStyleGroup .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      collageState.bgStyle = btn.dataset.cbg;
      syncCollageUI();
      renderCollagePreview();
    });
  });

  // Collage BG Blur: grid layouts share the Slicer / Frame / Reel blur value, Blur Fit keeps its own; moving it switches the backdrop to Blur
  document.getElementById('rngColBlur').addEventListener('input', e => {
    const v = parseInt(e.target.value, 10);
    if (collageState.template === 'blurfit') collageState.looks.fit.blur = v;
    else syncBlurControls(v);
    if (collageState.bgStyle !== 'blur') collageState.bgStyle = 'blur';
    syncCollageUI();
    renderCollagePreview();
  });

  document.getElementById('colBgColorPicker').addEventListener('input', e => {
    const valid = normalizeHexColor(e.target.value);
    if (valid) {
      collageState.bgCustomHex = valid;
      collageState.bgStyle = 'custom';
      document.getElementById('colBgHexInput').value = valid;
      document.getElementById('colBgHexChip').style.background = valid;
      syncCollageUI();
      renderCollagePreview();
    }
  });

  document.getElementById('colBgHexInput').addEventListener('input', e => {
    const valid = normalizeHexColor(e.target.value);
    if (valid) {
      collageState.bgCustomHex = valid;
      collageState.bgStyle = 'custom';
      document.getElementById('colBgColorPicker').value = valid;
      document.getElementById('colBgHexChip').style.background = valid;
      syncCollageUI();
      renderCollagePreview();
    }
  });

  document.getElementById('btnColAddToCarousel').addEventListener('click', () => {
    const hdCanvas = renderHighResCollageCanvas();
    state.slides.push(canvasToSlideObj(hdCanvas, `Collage ${collageState.template === 'blurfit' ? 'Blur Fit' : collageState.template.toUpperCase()}`, 'collage'));
    renderFilmstrip();
    showToast('Added Collage slide to Carousel');
  });

  document.getElementById('btnColSendToSlicer').addEventListener('click', () => {
    const hdCanvas = renderHighResCollageCanvas();
    saveUndoBeforeAction();
    rememberCollageSourcePins();
    const detachMain = cell => { cell.usesMainImage = false; };
    collageState.cells.forEach(detachMain);
    collageState.undoStack.forEach(snapshot => snapshot.cells.forEach(detachMain));
    state.img = hdCanvas;
    resetStarSolveUI();
    resetMoonUI();
    state.annotations = [];
    state.selectedPinId = null;
    state.placingPinMode = false;
    document.getElementById('pinModeBanner').classList.remove('active');
    state.rot90 = 0;
    state.fineAngle = 0;
    syncAnnotationModalUI();
    renderAnnotationList();
    updateAnnotationExportUI();
    setAppMode('slicer');
    fitImageToCrop();
    generateSlices();
    showToast('Collage loaded into Slicer');
  });

  document.getElementById('btnColDownloadDirect').addEventListener('click', async () => {
    const hdCanvas = renderHighResCollageCanvas();
    const ext = state.exportFormat === 'png' ? 'png' : 'jpg';
    const mime = state.exportFormat === 'png' ? 'image/png' : 'image/jpeg';
    const dataUrl = hdCanvas.toDataURL(mime, 1.0);
    const fileName = `InstaSlice_Collage_${collageState.template}_${hdCanvas.width}x${hdCanvas.height}.${ext}`;

    const isMobileDevice = annIsTouchDevice();
    if (isMobileDevice) {
      try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], fileName, { type: mime });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'InstaSlice Collage' });
          return;
        }
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = fileName;
    a.click();
    showToast(`Download started · ${fileName}`);
  });

  /* ===== ANNOTATE MODE: view, layout, labels, catalogue depth ===== */
  if (!state.annLabelScale) state.annLabelScale = 1;
  if (state.skyCoords === undefined) state.skyCoords = false;
  const annNorm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // Subtitle = only what the title does not already say: designation (when the title is a common name),
  // object type, magnitude and, optionally, RA/Dec.
  function buildSkySub(o, title, coords) {
    const p = [];
    const designation = o.id;
    if (designation && starSearchKey(designation) !== starSearchKey(title)) p.push(designation);
    const t = String(o.type || '').trim();
    if (t && !/^deep-sky object$/i.test(t) && annNorm(t) !== annNorm(title)) p.push(t);
    if (Number.isFinite(o.mag)) p.push('mag ' + o.mag.toFixed(1));
    if (coords && Number.isFinite(o.ra) && Number.isFinite(o.dec)) p.push(formatSkyRA(o.ra) + ' ' + formatSkyDec(o.dec));
    return p.join(' · ') || t || 'Deep-sky object';
  }

  function starSearchKey(text) {
    return text.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  }

  function catalogueScore(candidate, shorterEdge, wide) {
    const { id, title, type, mag, radiusPx, category, priority } = candidate;
    const brightness = Number.isFinite(mag) ? mag : 13;
    if (category === 'stars') return 17 - brightness * (wide ? 1.6 : 1.15);
    const known = /^M\s+\d/i.test(id) ? 22 : /^C\s+\d/i.test(id) ? 9 : /^(NGC|IC)\s+\d/i.test(id) ? 3 : 0;
    const named = title !== id ? 3 : 0;
    const apparent = Math.min(8, Math.log2(1 + 75 * (radiusPx || 0) / shorterEdge) * 2.4);
    const nebula = /globule|nebula|emission region|cloud|remnant/i.test(type) ? 4 : 0;
    return 19 - brightness + known + named + apparent + nebula + priority;
  }

  function applyCatalogDepth(initial) {
    if (!state.starSolve) return;
    const all = state.starAllCandidates;
    const query = starSearchKey(document.getElementById('starCatalogueSearch').value.trim());
    const category = document.getElementById('starCatalogueType').value;
    const depth = Number(document.getElementById('starSolveDetail').value);
    const base = depth === 0 ? 10 : depth < 0.5 ? 40 : 120;
    const limit = (query ? 60 : base) + state.starCatalogMore;
    const matches = all.filter(candidate => {
      const typeMatches = category === 'all' || candidate.category === category
        || (category === 'nebulae' && /nebulosity/.test(candidate.type));
      return typeMatches && (!query || candidate.searchKey.includes(query));
    });

    let visible = matches.slice(0, limit);
    if (!query && category === 'all' && depth < 0.5 && state.starSolve.wide) {
      const brightStars = matches.filter(candidate => candidate.category === 'stars'
        && Number.isFinite(candidate.mag) && candidate.mag <= 3.5).slice(0, depth === 0 ? 2 : 5);
      const reserved = new Set(brightStars);
      visible = matches.filter(candidate => !reserved.has(candidate)).slice(0, limit - brightStars.length)
        .concat(brightStars).sort((a, b) => b.rank - a.rank);
    }
    if (initial) visible.slice(0, Math.min(base, 40)).forEach(candidate => { candidate.selected = true; });

    state.starCandidates = visible;
    renderStarCandidates();
    document.getElementById('btnStarCatalogMore').hidden = matches.length <= visible.length;
    document.getElementById('starSolveNetNote').textContent = visible.length + ' of ' + matches.length + ' shown';
    const message = matches.length
      ? (initial ? 'Plate solve successful. ' : '') + 'Select the catalogue targets you want to annotate.'
      : 'No catalogue targets match these filters.';
    setStarSolveStatus(message, 'success');
  }

  for (const [id, event] of [['starSolveDetail','change'], ['starCatalogueType','change'], ['starCatalogueSearch','input']]) {
    document.getElementById(id).addEventListener(event, () => {
      state.starCatalogMore = 0;
      applyCatalogDepth(false);
    });
  }
  document.getElementById('btnStarCatalogMore').addEventListener('click', () => {
    state.starCatalogMore += 120;
    applyCatalogDepth(false);
  });

  // =========================================================================
  // MOON ATLAS: lunar catalogue, disc detection, orientation, libration, label candidates.
  // Pure maths (no DOM) apart from the small UI glue that follows in moon_ui.js.
  // Selenographic convention: longitude positive towards the east (Mare Crisium, +59°), latitude positive north.
  // Picture frame: x to the right, y down; "rotation" is how far lunar north is turned clockwise from straight up.
  // =========================================================================
  const MOON_R_KM = 1737.4;
  const MOON_KINDS = {
    M: { label: 'Seas', color: '#7CC4F5' },
    C: { label: 'Craters', color: '#F4E4A1' },
    R: { label: 'Mountains', color: '#F0899A' },
    V: { label: 'Valleys & scarps', color: '#B7A4F5' },
    S: { label: 'Landing sites', color: '#7FDCB5' }
  };
  // name | kind | latitude | longitude | size km | tier (1 = highlight, 2 = balanced, 3 = deep) | note
  const MOON_CAT_SRC = [
    // --- seas, bays, lakes and marshes (note = English meaning) ---
    'Mare Imbrium|M|32.8|-15.6|1123|1|Sea of Showers',
    'Mare Serenitatis|M|28.0|17.5|707|1|Sea of Serenity',
    'Mare Tranquillitatis|M|8.5|31.4|873|1|Sea of Tranquility',
    'Mare Crisium|M|17.0|59.1|418|1|Sea of Crises',
    'Mare Fecunditatis|M|-7.8|51.3|909|1|Sea of Fecundity',
    'Mare Nectaris|M|-15.2|34.6|333|2|Sea of Nectar',
    'Mare Nubium|M|-21.3|-16.6|715|1|Sea of Clouds',
    'Mare Humorum|M|-24.4|-38.6|389|1|Sea of Moisture',
    'Mare Cognitum|M|-10.5|-22.3|376|2|Sea of Knowledge',
    'Mare Insularum|M|7.5|-30.9|513|2|Sea of Islands',
    'Mare Vaporum|M|13.3|3.6|245|2|Sea of Vapors',
    'Mare Frigoris|M|56.0|1.4|1596|1|Sea of Cold',
    'Oceanus Procellarum|M|18.4|-57.4|2568|1|Ocean of Storms',
    'Mare Humboldtianum|M|56.9|81.5|273|3|Humboldt\'s Sea',
    'Mare Smythii|M|1.3|87.5|373|3|Smyth\'s Sea',
    'Mare Marginis|M|13.3|86.1|420|3|Sea of the Edge',
    'Mare Australe|M|-38.9|93.0|603|3|Southern Sea',
    'Mare Orientale|M|-19.4|-92.8|327|3|Eastern Sea',
    'Mare Anguis|M|22.6|67.7|150|3|Serpent Sea',
    'Mare Spumans|M|1.3|65.3|139|3|Foaming Sea',
    'Mare Undarum|M|7.5|68.7|243|3|Sea of Waves',
    'Sinus Medii|M|1.6|1.0|335|2|Bay of the Center',
    'Sinus Iridum|M|45.0|-31.7|236|1|Bay of Rainbows',
    'Sinus Aestuum|M|12.1|-8.3|290|3|Seething Bay',
    'Sinus Roris|M|54.0|-56.6|202|3|Bay of Dew',
    'Sinus Amoris|M|19.9|37.3|130|3|Bay of Love',
    'Sinus Asperitatis|M|-3.8|27.4|206|3|Bay of Roughness',
    'Sinus Concordiae|M|10.8|43.2|142|3|Bay of Harmony',
    'Sinus Honoris|M|11.7|17.9|109|3|Bay of Honor',
    'Sinus Lunicus|M|32.4|-1.9|126|3|Lunik Bay',
    'Sinus Successus|M|0.9|59.0|132|3|Bay of Success',
    'Lacus Somniorum|M|37.6|30.8|384|2|Lake of Dreams',
    'Lacus Mortis|M|45.1|27.3|151|3|Lake of Death',
    'Palus Putredinis|M|27.4|0.0|161|3|Marsh of Decay',
    'Palus Somni|M|14.1|45.0|143|3|Marsh of Sleep',
    'Palus Epidemiarum|M|-32.0|-28.2|286|3|Marsh of Epidemics',
    // --- craters ---
    'Tycho|C|-43.30|-11.22|85|1|ray crater',
    'Copernicus|C|9.62|-20.08|96|1|terraced rim',
    'Kepler|C|8.12|-38.01|29|1|bright rays',
    'Aristarchus|C|23.73|-47.49|40|1|brightest crater',
    'Plato|C|51.62|-9.38|101|1|dark floor',
    'Grimaldi|C|-5.38|-68.36|173|1|dark basin',
    'Clavius|C|-58.62|-14.73|231|1|giant crater',
    'Langrenus|C|-8.86|61.04|132|1|',
    'Petavius|C|-25.39|60.78|184|2|',
    'Gassendi|C|-17.55|-39.96|111|2|',
    'Ptolemaeus|C|-9.16|-1.84|154|2|',
    'Alphonsus|C|-13.39|-2.85|111|2|',
    'Arzachel|C|-18.26|-1.93|97|2|',
    'Albategnius|C|-11.24|4.01|131|3|',
    'Hipparchus|C|-5.36|4.91|144|3|',
    'Theophilus|C|-11.45|26.28|99|2|central peak',
    'Cyrillus|C|-13.29|24.07|98|3|',
    'Catharina|C|-17.98|23.55|99|3|',
    'Fracastorius|C|-21.36|33.07|121|3|',
    'Posidonius|C|31.88|29.99|95|2|',
    'Archimedes|C|29.72|-3.99|81|2|',
    'Aristoteles|C|50.24|17.32|88|2|',
    'Eudoxus|C|44.27|16.23|70|3|',
    'Aristillus|C|33.88|1.21|54|2|',
    'Autolycus|C|30.68|1.49|39|3|',
    'Cassini|C|40.25|4.64|57|3|',
    'Eratosthenes|C|14.47|-11.32|59|2|',
    'Timocharis|C|26.72|-13.10|34|3|',
    'Lambert|C|25.77|-20.99|30|3|',
    'Pytheas|C|20.57|-20.59|19|3|',
    'Fra Mauro|C|-6.06|-16.97|97|3|',
    'Bullialdus|C|-20.75|-22.26|61|2|',
    'Pitatus|C|-29.88|-13.53|101|3|',
    'Maginus|C|-50.03|-5.98|156|3|',
    'Longomontanus|C|-49.55|-21.88|146|3|',
    'Wilhelm|C|-43.21|-20.94|101|3|',
    'Schickard|C|-44.38|-55.11|212|2|',
    'Schiller|C|-51.72|-39.78|179|3|',
    'Bailly|C|-66.82|-68.90|301|3|',
    'Hevelius|C|2.20|-67.46|114|3|',
    'Riccioli|C|-2.90|-74.42|156|3|',
    'Mersenius|C|-21.49|-49.34|84|3|',
    'Billy|C|-13.83|-50.24|46|3|',
    'Hansteen|C|-11.53|-52.06|45|3|',
    'Herodotus|C|23.25|-49.84|36|3|',
    'Reiner|C|6.92|-54.98|30|3|',
    'Marius|C|11.90|-50.84|40|3|',
    'Seleucus|C|21.09|-66.66|45|3|',
    'Struve|C|23.41|-76.65|164|3|',
    'Russell|C|26.51|-75.55|103|3|',
    'Pythagoras|C|63.68|-62.98|145|3|',
    'Philolaus|C|72.22|-32.88|71|3|',
    'Endymion|C|53.61|56.48|122|3|',
    'Atlas|C|46.74|44.38|88|3|',
    'Hercules|C|46.82|39.21|68|3|',
    'Cleomedes|C|27.60|55.50|131|2|',
    'Macrobius|C|21.26|45.97|63|3|',
    'Proclus|C|16.09|46.89|27|2|bright rays',
    'Taruntius|C|5.50|46.54|57|3|',
    'Messier|C|-1.90|47.65|14|3|',
    'Furnerius|C|-36.00|60.54|135|3|',
    'Janssen|C|-44.96|40.82|201|3|',
    'Rheita|C|-37.10|47.17|71|3|',
    'Stöfler|C|-41.24|5.93|130|3|',
    'Maurolycus|C|-41.77|13.92|115|3|',
    'Walther|C|-33.25|0.62|134|3|',
    'Regiomontanus|C|-28.28|-1.09|127|3|',
    'Purbach|C|-25.51|-2.03|115|3|',
    'Orontius|C|-40.37|-3.96|121|3|',
    'Moretus|C|-70.63|-5.95|114|3|',
    'Newton|C|-76.52|-17.44|84|3|',
    'Scheiner|C|-60.35|-27.81|110|3|',
    'Blancanus|C|-63.77|-21.63|106|3|',
    'Piccolomini|C|-29.70|32.20|88|3|',
    'Fabricius|C|-42.75|41.84|79|3|',
    'Gauss|C|36.01|79.08|171|3|',
    'Humboldt|C|-27.02|80.96|199|3|',
    'Neper|C|8.76|84.58|144|3|',
    'Manilius|C|14.45|9.07|38|3|',
    'Menelaus|C|16.26|15.93|27|3|',
    'Julius Caesar|C|9.17|15.21|85|3|',
    'Plinius|C|15.36|23.61|41|3|',
    'Dionysius|C|2.77|17.29|17|3|',
    'Bessel|C|21.73|17.92|16|3|',
    'Linné|C|27.75|11.80|2|3|',
    'Mösting|C|-0.70|-5.88|24|3|',
    'Herschel|C|-5.69|-2.09|39|3|',
    'Lansberg|C|-0.31|-26.63|39|3|',
    'Censorinus|C|-0.42|32.69|4|3|',
    'Stadius|C|10.48|-13.77|68|3|',
    'Hesiodus|C|-29.42|-16.42|43|3|',
    'Cichus|C|-33.29|-21.18|39|3|',
    'Kies|C|-26.31|-22.63|46|3|',
    'Bianchini|C|48.78|-34.37|38|3|',
    'Helicon|C|40.43|-23.11|24|3|',
    'Harpalus|C|52.73|-43.49|40|3|',
    'Gutenberg|C|-8.61|41.25|71|3|',
    'Goclenius|C|-10.05|45.03|73|3|',
    'Abulfeda|C|-13.87|13.91|62|3|',
    'Agrippa|C|4.10|10.47|44|3|',
    'Boscovich|C|9.71|11.01|42|3|',
    'Burckhardt|C|31.11|56.39|54|3|',
    'Apianus|C|-26.96|7.87|63|3|',
    'Reinhold|C|3.28|-22.86|43|3|',
    'Lamont|C|5.14|23.32|83|3|',
    'Delambre|C|-1.94|17.39|51|3|',
    'Daniell|C|35.42|31.16|28|3|',
    'Calippus|C|38.92|10.72|34|3|',
    'Dawes|C|17.21|26.34|18|3|',
    'Flammarion|C|-3.33|-3.73|76|3|',
    'Triesnecker|C|4.18|3.60|25|3|',
    'Thebit|C|-22.01|-4.02|55|3|',
    'Le Monnier|C|26.66|30.50|68|3|',
    'Sabine|C|1.38|20.07|30|3|',
    'Ritter|C|1.96|19.17|30|3|',
    'Maskelyne|C|2.16|30.04|22|3|',
    'Santbech|C|-20.99|44.06|62|3|',
    'Stevinus|C|-32.49|54.14|72|3|',
    'Snellius|C|-29.33|55.70|86|3|',
    'Sacrobosco|C|-23.75|16.64|98|3|',
    'Mercator|C|-29.25|-26.11|46|3|',
    'Hell|C|-32.41|-7.80|33|3|',
    // --- mountain ranges and peaks (size = length for ranges) ---
    'Montes Apenninus|R|19.0|-3.5|600|1|',
    'Montes Alpes|R|47.5|-0.5|280|2|',
    'Montes Caucasus|R|37.5|9.9|445|2|',
    'Montes Carpatus|R|14.5|-23.6|360|2|',
    'Mons Pico|R|45.8|-8.9|25|2|',
    'Montes Jura|R|47.5|-36.0|420|3|',
    'Montes Haemus|R|17.1|12.0|560|3|',
    'Montes Pyrenaeus|R|-14.0|41.5|164|3|',
    'Montes Taurus|R|27.3|40.3|726|3|',
    'Montes Spitzbergen|R|34.5|-5.2|60|3|',
    'Montes Recti|R|48.3|-19.7|90|3|',
    'Montes Teneriffe|R|47.9|-13.2|112|3|',
    'Montes Riphaeus|R|-7.5|-27.6|189|3|',
    'Montes Agricola|R|29.1|-54.1|160|3|',
    'Montes Archimedes|R|25.4|-5.3|163|3|',
    'Montes Harbinger|R|26.9|-41.3|90|3|',
    'Montes Secchi|R|2.7|43.2|50|3|',
    'Mons Piton|R|40.7|-0.9|25|3|',
    'Mons Rümker|R|40.8|-58.4|70|3|',
    'Mons Hadley|R|26.7|4.1|25|3|',
    'Mons Blanc|R|45.4|0.4|25|3|',
    'Mons Gruithuisen Gamma|R|36.6|-40.7|20|3|',
    // --- valleys, rilles and scarps ---
    'Rupes Recta|V|-21.8|-7.8|110|2|Straight Wall',
    'Vallis Alpes|V|49.2|3.6|166|2|Alpine Valley',
    'Rupes Altai|V|-24.3|22.6|427|3|Altai Scarp',
    'Vallis Schröteri|V|26.2|-50.8|168|3|Schröter\'s Valley',
    'Vallis Rheita|V|-42.5|51.5|445|3|',
    'Rima Hyginus|V|7.8|6.3|220|3|',
    'Rima Ariadaeus|V|6.4|13.1|250|3|',
    'Rima Hadley|V|25.0|3.0|80|3|',
    'Rimae Triesnecker|V|4.3|4.8|215|3|',
    'Rima Sirsalis|V|-12.4|-60.4|400|3|',
    // --- landing sites (note = mission detail) ---
    'Apollo 11|S|0.674|23.473|0|1|Tranquility Base · 1969',
    'Apollo 12|S|-3.012|-23.422|0|2|Ocean of Storms · 1969',
    'Apollo 14|S|-3.645|-17.471|0|2|Fra Mauro · 1971',
    'Apollo 15|S|26.132|3.630|0|2|Hadley Rille · 1971',
    'Apollo 16|S|-8.973|15.498|0|2|Descartes Highlands · 1972',
    'Apollo 17|S|20.191|30.772|0|2|Taurus-Littrow · 1972',
    'Chang\'e 3|S|44.121|-19.512|0|2|Yutu rover · 2013',
    'Chandrayaan-3|S|-69.373|32.319|0|2|Shiv Shakti Point · 2023',
    'Luna 9|S|7.08|-64.37|0|3|First soft landing · 1966',
    'Luna 16|S|-0.68|56.30|0|3|Sample return · 1970',
    'Luna 17|S|38.238|-35.00|0|3|Lunokhod 1 · 1970',
    'Luna 20|S|3.57|56.55|0|3|Sample return · 1972',
    'Luna 21|S|25.85|30.45|0|3|Lunokhod 2 · 1973',
    'Luna 24|S|12.75|62.20|0|3|Sample return · 1976',
    'Surveyor 1|S|-2.474|-43.338|0|3|First US soft landing · 1966',
    'Surveyor 3|S|-3.016|-23.418|0|3|1967',
    'Surveyor 5|S|1.461|23.195|0|3|1967',
    'Surveyor 6|S|0.474|-1.436|0|3|1967',
    'Surveyor 7|S|-40.979|-11.513|0|3|1968',
    'Ranger 7|S|-10.63|-20.60|0|3|Impact · 1964',
    'Chang\'e 5|S|43.06|-51.92|0|3|Sample return · 2020',
    'SLIM|S|-13.32|25.25|0|3|Moon Sniper · 2024',
    'Blue Ghost M1|S|18.56|61.81|0|3|Mare Crisium · 2025'
  ];
  const MOON_CAT = MOON_CAT_SRC.map(line => {
    const f = line.split('|');
    return { name: f[0], kind: f[1], lat: parseFloat(f[2]), lon: parseFloat(f[3]), size: parseFloat(f[4]), tier: parseInt(f[5], 10), note: f[6] || '' };
  });
  let moonDetailCatalogue = null;
  async function moonLoadFeatureCatalogue() {
    if (moonDetailCatalogue) return;
    const response = await fetch('./plate/lunar-features.json?v=13', {
      mode: 'same-origin', credentials: 'same-origin', referrerPolicy: 'no-referrer', redirect: 'error'
    });
    if (!response.ok) return;
    const catalog = new Map(MOON_CAT.map(feature => [feature.name, feature]));
    for (const [name, kind, lon, lat, size, satellite] of await response.json()) {
      const prev = catalog.get(name);
      catalog.set(name, { ...prev, name, kind, lon, lat, size, satellite, tier: prev?.tier || 3 });
    }
    moonDetailCatalogue = [...catalog.values()];
  }
  function moonCloseView(m) {
    return Boolean(m.surface && m.fit.R * 2 > 1.25 * Math.max(m.ww, m.wh));
  }

  // ---- sphere <-> picture ----------------------------------------------------------------------------------------
  const MOON_D2R = Math.PI / 180;
  // Orthographic projection of a surface point as seen from the sub-Earth point (lon0, lat0): x east, y north, z towards the viewer.
  function moonSphere(lon, lat, lon0, lat0) {
    const p = lat * MOON_D2R, p0 = lat0 * MOON_D2R, dl = (lon - lon0) * MOON_D2R;
    const cp = Math.cos(p), sp = Math.sin(p), cp0 = Math.cos(p0), sp0 = Math.sin(p0);
    return { x: cp * Math.sin(dl), y: cp0 * sp - sp0 * cp * Math.cos(dl), z: sp0 * sp + cp0 * cp * Math.cos(dl) };
  }
  // fit = { cx, cy, R, theta, mirror, lon0, lat0 } (picture pixels). Returns picture position and the unit-sphere normal in the picture frame.
  function moonToPicture(fit, lon, lat) {
    const s = moonSphere(lon, lat, fit.lon0, fit.lat0);
    const X = fit.mirror ? -s.x : s.x, t = fit.theta * MOON_D2R, ct = Math.cos(t), st = Math.sin(t);
    const u = X * ct + s.y * st, v = -X * st + s.y * ct;           // right / up in the picture
    return { px: fit.cx + fit.R * u, py: fit.cy - fit.R * v, u, v, z: s.z };
  }
  function moonFromPicture(fit, px, py) {
    const u = (px - fit.cx) / fit.R, v = -(py - fit.cy) / fit.R, r2 = u * u + v * v;
    if (r2 >= 1) return null;
    const t = fit.theta * MOON_D2R, ct = Math.cos(t), st = Math.sin(t);
    const X = u * ct - v * st, y = u * st + v * ct, x = fit.mirror ? -X : X, z = Math.sqrt(1 - r2);
    const p0 = fit.lat0 * MOON_D2R, sp = z * Math.sin(p0) + y * Math.cos(p0);
    const lat = Math.asin(Math.max(-1, Math.min(1, sp))) / MOON_D2R;
    const lon = fit.lon0 + Math.atan2(x, z * Math.cos(p0) - y * Math.sin(p0)) / MOON_D2R;
    return { lon: ((lon + 540) % 360) - 180, lat };
  }

  // ---- libration from a date (Meeus, Astronomical Algorithms ch. 53, with a low-precision lunar position) ----------
  function moonLibration(dateMs) {
    const jd = dateMs / 86400000 + 2440587.5, T = (jd - 2451545.0) / 36525;
    const rad = x => x * MOON_D2R, nrm = x => ((x % 360) + 360) % 360;
    // low-precision geocentric ecliptic position of the Moon (Astronomical Almanac), ~0.3°
    const lam = nrm(218.32 + 481267.881 * T + 6.29 * Math.sin(rad(135.0 + 477198.87 * T)) - 1.27 * Math.sin(rad(259.3 - 413335.36 * T))
      + 0.66 * Math.sin(rad(235.7 + 890534.22 * T)) + 0.21 * Math.sin(rad(269.9 + 954397.74 * T)) - 0.19 * Math.sin(rad(357.5 + 35999.05 * T))
      - 0.11 * Math.sin(rad(186.5 + 966404.03 * T)));
    const bet = 5.13 * Math.sin(rad(93.3 + 483202.02 * T)) + 0.28 * Math.sin(rad(228.2 + 960400.89 * T)) - 0.28 * Math.sin(rad(318.3 + 6003.15 * T))
      - 0.17 * Math.sin(rad(217.6 - 407332.21 * T));
    const omega = nrm(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T);                    // mean ascending node
    const Lm = nrm(218.3164477 + 481267.88123421 * T);                                         // mean longitude
    const F = nrm(Lm - omega);                                                                 // argument of latitude (mean)
    const I = rad(1.54242), W = rad(lam - omega), b = rad(bet);
    const A = Math.atan2(Math.sin(W) * Math.cos(b) * Math.cos(I) - Math.sin(b) * Math.sin(I), Math.cos(W) * Math.cos(b));
    let l = A / MOON_D2R - F; l = ((l + 540) % 360) - 180;
    const bp = Math.asin(Math.max(-1, Math.min(1, -Math.sin(W) * Math.cos(b) * Math.sin(I) - Math.sin(b) * Math.cos(I)))) / MOON_D2R;
    return { lon0: l, lat0: bp };
  }

  // ---- disc detection ----------------------------------------------------------------------------------------------
  // gray: Float32Array (0..1) of w*h. Returns { cx, cy, R, inlier, area } or null.
  function moonBlur3(src, w, h) {
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const r = y * w;
      for (let x = 0; x < w; x++) {
        const a = src[r + Math.max(0, x - 1)], b = src[r + x], c = src[r + Math.min(w - 1, x + 1)];
        tmp[r + x] = (a + 2 * b + c) * 0.25;
      }
    }
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - 1) * w, y1 = y * w, y2 = Math.min(h - 1, y + 1) * w;
      for (let x = 0; x < w; x++) out[y1 + x] = (tmp[y0 + x] + 2 * tmp[y1 + x] + tmp[y2 + x]) * 0.25;
    }
    return out;
  }
  function moonPercentiles(arr, qs) {
    const hist = new Uint32Array(1024); let n = 0;
    for (let i = 0; i < arr.length; i++) { hist[Math.min(1023, Math.max(0, (arr[i] * 1023) | 0))]++; n++; }
    return qs.map(q => { const target = q * n; let acc = 0; for (let b = 0; b < 1024; b++) { acc += hist[b]; if (acc >= target) return b / 1023; } return 1; });
  }
  function moonCircle3(ax, ay, bx, by, cx, cy) {
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < 1e-9) return null;
    const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
    const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d, uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
    return { x: ux, y: uy, r: Math.hypot(ax - ux, ay - uy) };
  }
  function moonSolve3(A, b) {                                           // symmetric 3x3 (a11,a12,a13,a22,a23,a33) * x = b
    const a11 = A[0], a12 = A[1], a13 = A[2], a22 = A[3], a23 = A[4], a33 = A[5];
    const det = a11 * (a22 * a33 - a23 * a23) - a12 * (a12 * a33 - a23 * a13) + a13 * (a12 * a23 - a22 * a13);
    if (Math.abs(det) < 1e-12) return null;
    return [
      (b[0] * (a22 * a33 - a23 * a23) - a12 * (b[1] * a33 - a23 * b[2]) + a13 * (b[1] * a23 - a22 * b[2])) / det,
      (a11 * (b[1] * a33 - a23 * b[2]) - b[0] * (a12 * a33 - a23 * a13) + a13 * (a12 * b[2] - b[1] * a13)) / det,
      (a11 * (a22 * b[2] - b[1] * a23) - a12 * (a12 * b[2] - b[1] * a13) + b[0] * (a12 * a23 - a22 * a13)) / det
    ];
  }
  // Largest 4-connected blob of sm >= thr. Returns { lab, id, area } or null.
  function moonBrightBlob(sm, w, h, thr) {
    const lab = new Int32Array(w * h), stack = [];
    let best = -1, bestArea = 0, nl = 0;
    for (let i = 0; i < w * h; i++) {
      if (lab[i] || sm[i] < thr) continue;
      nl++; let area = 0; stack.length = 0; stack.push(i); lab[i] = nl;
      while (stack.length) {
        const p = stack.pop(); area++;
        const x = p % w, y = (p / w) | 0;
        if (x > 0 && !lab[p - 1] && sm[p - 1] >= thr) { lab[p - 1] = nl; stack.push(p - 1); }
        if (x < w - 1 && !lab[p + 1] && sm[p + 1] >= thr) { lab[p + 1] = nl; stack.push(p + 1); }
        if (y > 0 && !lab[p - w] && sm[p - w] >= thr) { lab[p - w] = nl; stack.push(p - w); }
        if (y < h - 1 && !lab[p + w] && sm[p + w] >= thr) { lab[p + w] = nl; stack.push(p + w); }
      }
      if (area > bestArea) { bestArea = area; best = nl; }
    }
    return best < 0 ? null : { lab, id: best, area: bestArea };
  }
  // gray: Float32Array (0..1) of w*h, pixel centres at integer coordinates. Returns { cx, cy, R, inlier, area, cutFrac } or null.
  function moonDetectDisc(gray, w, h) {
    const sm = moonBlur3(moonBlur3(gray, w, h), w, h);
    const q = moonPercentiles(sm, [0.2, 0.999]);                        // sky level and the brightest 0.1 % (a thin crescent covers well under 1 % of a frame)
    const low = q[0], high = q[1];
    if (high - low < 0.06) return null;
    let comp = moonBrightBlob(sm, w, h, low + 0.22 * (high - low));
    if (!comp || comp.area < 80) return null;
    // second pass: put the edge about half way between the sky and the blob's typical brightness (a glow or a hazy rim then does not inflate the disc)
    const vals = []; const stepV = Math.max(1, Math.floor(comp.area / 4000));
    for (let i = 0, c = 0; i < w * h; i++) if (comp.lab[i] === comp.id && (c++ % stepV) === 0) vals.push(sm[i]);
    vals.sort((a, b) => a - b);
    const med = vals[vals.length >> 1], thr2 = low + 0.42 * (med - low);
    if (thr2 > low + 0.22 * (high - low) + 1e-4) {
      const c2 = moonBrightBlob(sm, w, h, thr2);
      if (c2 && c2.area > comp.area * 0.35) comp = c2;
    }
    const lab = comp.lab, best = comp.id, bestArea = comp.area;
    // boundary of that blob, away from the frame edge (a disc cut by the frame has no limb there)
    const pts = []; let cut = 0, total = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x; if (lab[p] !== best) continue;
      const onFrame = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      if (!onFrame && lab[p - 1] === best && lab[p + 1] === best && lab[p - w] === best && lab[p + w] === best) continue;
      total++;
      if (x <= 1 || y <= 1 || x >= w - 2 || y >= h - 2) { cut++; continue; }
      pts.push(x, y);
    }
    const n = pts.length / 2;
    if (n < 24) return null;
    // RANSAC: the limb is the longest circular arc on the boundary (a crescent's inner edge is not)
    let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const rMin = Math.max(6, Math.min(w, h) * 0.015), rMax = Math.max(w, h) * 0.75;
    let bestC = null, bestIn = -1;
    for (let it = 0; it < 800; it++) {
      const i1 = (rnd() * n) | 0, i2 = (rnd() * n) | 0, i3 = (rnd() * n) | 0;
      if (i1 === i2 || i2 === i3 || i1 === i3) continue;
      const c = moonCircle3(pts[i1 * 2], pts[i1 * 2 + 1], pts[i2 * 2], pts[i2 * 2 + 1], pts[i3 * 2], pts[i3 * 2 + 1]);
      if (!c || c.r < rMin || c.r > rMax) continue;
      const tol = Math.max(1.4, c.r * 0.012);
      let cnt = 0;
      for (let k = 0; k < n; k++) if (Math.abs(Math.hypot(pts[k * 2] - c.x, pts[k * 2 + 1] - c.y) - c.r) < tol) cnt++;
      if (cnt > bestIn) { bestIn = cnt; bestC = c; }
    }
    if (!bestC) return null;
    // least-squares refinement on the inliers (Gauss-Newton on the geometric distance)
    let cx = bestC.x, cy = bestC.y, r = bestC.r, nIn = bestIn;
    for (let pass = 0; pass < 4; pass++) {
      const tol = Math.max(1.4, r * 0.012) * (pass === 0 ? 1.3 : 1);
      const inl = [];
      for (let k = 0; k < n; k++) if (Math.abs(Math.hypot(pts[k * 2] - cx, pts[k * 2 + 1] - cy) - r) < tol) inl.push(k);
      if (inl.length < 12) break;
      nIn = inl.length;
      for (let gn = 0; gn < 6; gn++) {
        const A = [0, 0, 0, 0, 0, 0], g = [0, 0, 0];
        for (const k of inl) {
          const dx = pts[k * 2] - cx, dy = pts[k * 2 + 1] - cy, d = Math.hypot(dx, dy) || 1e-6, e = d - r;
          const jx = -dx / d, jy = -dy / d, jr = -1;
          A[0] += jx * jx; A[1] += jx * jy; A[2] += jx * jr; A[3] += jy * jy; A[4] += jy * jr; A[5] += jr * jr;
          g[0] -= jx * e; g[1] -= jy * e; g[2] -= jr * e;
        }
        const s = moonSolve3(A, g);
        if (!s) break;
        cx += s[0]; cy += s[1]; r += s[2];
      }
    }
    if (!(isFinite(cx) && isFinite(cy) && isFinite(r)) || r > rMax * 1.05 || r < rMin * 0.9) { cx = bestC.x; cy = bestC.y; r = bestC.r; }   // refinement ran away on a nearly straight edge
    // how much of the circle is actually supported by boundary points (angular coverage in 24 bins)
    let bins = 0; const seen = new Uint8Array(24);
    for (let k = 0; k < n; k++) {
      if (Math.abs(Math.hypot(pts[k * 2] - cx, pts[k * 2 + 1] - cy) - r) > Math.max(1.6, r * 0.016)) continue;
      const a = Math.atan2(pts[k * 2 + 1] - cy, pts[k * 2] - cx); const bi = Math.floor(((a + Math.PI) / (2 * Math.PI)) * 24) % 24;
      if (!seen[bi]) { seen[bi] = 1; bins++; }
    }
    if (bins < 3) return null;                                           // under 45 degrees of limb: not enough to define a disc
    return { cx, cy, R: r + 0.5, inlier: nIn / n, area: bestArea, cutFrac: total ? cut / total : 0, arc: bins / 24 };
  }

  // ---- working patches -----------------------------------------------------------------------------------------------
  // Box-average a rectangle of the picture so that its long side is at most maxSide. Mapping back: picture = o + (index + 0.5) * k.
  function moonWorkPatch(gray, w, h, x0, y0, x1, y1, maxSide) {
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(w, Math.ceil(x1)); y1 = Math.min(h, Math.ceil(y1));
    const sw = x1 - x0, sh = y1 - y0;
    if (sw < 8 || sh < 8) return null;
    const k = Math.max(1, Math.ceil(Math.max(sw, sh) / maxSide));
    const pw = Math.floor(sw / k), ph = Math.floor(sh / k);
    if (pw < 8 || ph < 8) return null;
    const out = new Float32Array(pw * ph), inv = 1 / (k * k);
    for (let j = 0; j < ph; j++) for (let i = 0; i < pw; i++) {
      let s = 0;
      for (let b = 0; b < k; b++) { const row = (y0 + j * k + b) * w + x0 + i * k; for (let a = 0; a < k; a++) s += gray[row + a]; }
      out[j * pw + i] = s * inv;
    }
    return { data: out, w: pw, h: ph, k, ox: x0, oy: y0 };
  }
  const moonPatchToPicture = (p, fit) => ({ cx: p.ox + (fit.cx + 0.5) * p.k, cy: p.oy + (fit.cy + 0.5) * p.k, R: fit.R * p.k });
  const moonPictureToPatch = (p, fit) => ({ cx: (fit.cx - p.ox) / p.k - 0.5, cy: (fit.cy - p.oy) / p.k - 0.5, R: fit.R / p.k });
  // Disc search on a picture: coarse pass on the whole picture, then a precise pass on a window around the first guess.
  function moonFindDisc(gray, w, h) {
    const p0 = moonWorkPatch(gray, w, h, 0, 0, w, h, 720);
    if (!p0) return null;
    const d0 = moonDetectDisc(p0.data, p0.w, p0.h);
    if (!d0) return null;
    const f0 = Object.assign(moonPatchToPicture(p0, d0), { inlier: d0.inlier, cutFrac: d0.cutFrac, arc: d0.arc });
    if (p0.k === 1 && f0.R > 60) return f0;
    const half = f0.R * 1.35;
    const p1 = moonWorkPatch(gray, w, h, f0.cx - half, f0.cy - half, f0.cx + half, f0.cy + half, 720);
    if (!p1) return f0;
    const d1 = moonDetectDisc(p1.data, p1.w, p1.h);
    if (!d1 || Math.abs(d1.R * p1.k / f0.R - 1) > 0.25) return f0;
    return Object.assign(moonPatchToPicture(p1, d1), { inlier: d1.inlier, cutFrac: d1.cutFrac, arc: d1.arc });
  }

  // ---- normalised view of the disc -------------------------------------------------------------------------------------
  // N*N samples covering [-1.1R, 1.1R] around the disc (patch index coordinates); -1 marks samples outside the picture.
  function moonCropNorm(patch, fit, N) {
    const out = new Float32Array(N * N), span = 2.2 * fit.R, step = span / N;
    const sup = Math.max(1, Math.min(3, Math.round(step))), d = patch.data, pw = patch.w, ph = patch.h;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let s = 0, c = 0;
      for (let b = 0; b < sup; b++) for (let a = 0; a < sup; a++) {
        const x = fit.cx + ((i + (a + 0.5) / sup) / N - 0.5) * span, y = fit.cy + ((j + (b + 0.5) / sup) / N - 0.5) * span;
        if (x < 0 || y < 0 || x > pw - 1 || y > ph - 1) continue;
        const x0 = Math.min(pw - 2, x | 0), y0 = Math.min(ph - 2, y | 0), tx = x - x0, ty = y - y0, p = y0 * pw + x0;
        s += (d[p] * (1 - tx) + d[p + 1] * tx) * (1 - ty) + (d[p + pw] * (1 - tx) + d[p + pw + 1] * tx) * ty; c++;
      }
      out[j * N + i] = c ? s / c : -1;
    }
    return out;
  }
  const moonQuantile = (arr, q) => { const a = Float32Array.from(arr).sort(); return a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : 0; };
  // Scales the crop so that the sky is 0 and the bright surface is about 1. Returns { sky, peak, detail } or null.
  function moonNormStats(crop, N) {
    const Rc = N / 2.2, sky = [], core = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const v = crop[j * N + i]; if (v < 0) continue;
      const r = Math.hypot(i + 0.5 - N / 2, j + 0.5 - N / 2) / Rc;
      if (r > 1.04) sky.push(v); else if (r < 0.93) core.push(v);
    }
    if (core.length < 200) return null;
    const skyLevel = sky.length > 40 ? moonQuantile(sky, 0.5) : moonQuantile(core, 0.02);
    const peak = moonQuantile(core, 0.97);
    if (peak - skyLevel < 0.04) return null;
    // surface detail: spread of the brightness among the lit pixels
    const lit = []; for (const v of core) { const n = (v - skyLevel) / (peak - skyLevel); if (n > 0.3) lit.push(n); }
    let m = 0, sd = 0; for (const v of lit) m += v; m = lit.length ? m / lit.length : 0;
    for (const v of lit) sd += (v - m) * (v - m); sd = lit.length ? Math.sqrt(sd / lit.length) : 0;
    return { sky: skyLevel, peak, detail: sd };
  }
  function moonApplyNorm(crop, st) {
    const out = new Float32Array(crop.length), k = 1 / (st.peak - st.sky);
    for (let i = 0; i < crop.length; i++) out[i] = crop[i] < 0 ? -1 : Math.max(0, (crop[i] - st.sky) * k);
    return out;
  }

  // ---- phase (bright limb direction + lit fraction) ----------------------------------------------------------------
  // obs: normalised crop (see above). Returns the sun direction in the picture frame as (ux, uy) towards the lit limb, and the phase angle.
  function moonPhase(obs, N) {
    const Rc = N / 2.2, thr = 0.13;
    let n = 0, lit = 0, sx = 0, sy = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const v = obs[j * N + i]; if (v < 0) continue;
      const dx = i + 0.5 - N / 2, dy = j + 0.5 - N / 2;
      if (dx * dx + dy * dy > (0.96 * Rc) * (0.96 * Rc)) continue;
      n++;
      if (v > thr) { lit++; sx += dx; sy += dy; }
    }
    if (n < 40) return { frac: 1, ux: 0, uy: 0, sini: 0, cosi: 1, thr };
    const frac = lit / n;
    const mx = lit ? sx / lit / Rc : 0, my = lit ? sy / lit / Rc : 0, mag = Math.hypot(mx, my);
    if (frac > 0.965 || mag < 0.04) return { frac, ux: 0, uy: 0, sini: 0, cosi: 1, thr };
    const cosi = Math.max(-1, Math.min(1, 2 * frac - 1)), sini = Math.sqrt(1 - cosi * cosi);
    return { frac, ux: mx / mag, uy: -my / mag, sini, cosi, thr };      // (ux, uy): towards the lit limb, x right / y up
  }
  function moonPhaseWith(ph, cosi, psiDeg) {                              // same phase with another angle / lit direction
    cosi = Math.max(-0.99, Math.min(1, cosi));
    const sini = Math.sqrt(1 - cosi * cosi);
    const ux = psiDeg == null ? ph.ux : Math.cos(psiDeg * MOON_D2R), uy = psiDeg == null ? ph.uy : Math.sin(psiDeg * MOON_D2R);
    return { frac: (1 + cosi) / 2, ux, uy, sini, cosi, thr: ph.thr };
  }

  // ---- albedo model (maria and bright rays as soft ellipses) -------------------------------------------------------
  // lon, lat, half-size along lon (deg), half-size along lat (deg), rotation (deg), strength (negative = darker than the highlands)
  const MOON_ALBEDO_SPOTS = [
    [-15.6, 32.8, 17, 17, 0, -0.50], [17.5, 28.0, 11, 11, 0, -0.48], [31.4, 8.5, 13, 11, 25, -0.48], [59.1, 17.0, 9, 6.5, 0, -0.55],
    [51.3, -7.8, 8, 14, 0, -0.42], [34.6, -15.2, 5.5, 5.5, 0, -0.45], [-16.6, -21.3, 11, 8, 0, -0.42], [-38.6, -24.4, 6.5, 6.5, 0, -0.5],
    [-22.3, -10.5, 6, 6, 0, -0.45], [-30.9, 7.5, 8, 8, 0, -0.45], [-55, 15, 19, 24, 0, -0.42], [1.4, 56, 36, 5, 0, -0.35],
    [3.6, 13.3, 4, 4, 0, -0.45], [1.0, 1.6, 4, 3, 0, -0.35], [-8.3, 12.1, 4.5, 4, 0, -0.4], [-31.7, 45, 4, 4, 0, -0.4],
    [30.8, 37.6, 6.5, 5, 0, -0.3], [87.5, 1.3, 6, 6, 0, -0.4], [86.1, 13.3, 5, 6, 0, -0.35], [68.7, 7.5, 4, 4, 0, -0.35],
    [65.3, 1.3, 3, 3, 0, -0.35], [67.7, 22.6, 3.5, 3, 0, -0.3], [-92.8, -19.4, 5, 5, 0, -0.3], [-68.4, -5.4, 3, 3, 0, -0.4],
    [-9.4, 51.6, 2.2, 2.2, 0, -0.4], [-2.0, -13.0, 2.5, 2.5, 0, -0.2], [28.2, -3.8, 4, 3, 0, -0.3], [-28.2, -32.0, 4, 4, 0, -0.3],
    [-11.2, -43.3, 3.5, 3.5, 0, 0.32], [-11.2, -43.3, 13, 13, 0, 0.14], [-20.1, 9.6, 3, 3, 0, 0.26], [-20.1, 9.6, 8, 8, 0, 0.09],
    [-38.0, 8.1, 2.6, 2.6, 0, 0.3], [-47.5, 23.7, 2.6, 2.6, 0, 0.42], [46.9, 16.1, 2.2, 2.2, 0, 0.25], [46.9, 16.1, 9, 4, 20, 0.08],
    [61.0, -8.9, 3, 3, 0, 0.12], [1.2, 33.9, 2, 2, 0, 0.18], [15.9, 16.3, 1.6, 1.6, 0, 0.2], [32.7, -0.4, 1.4, 1.4, 0, 0.2]
  ];
  let moonAlbedoMap = null;
  function moonBuildAlbedo() {
    if (moonAlbedoMap) return moonAlbedoMap;
    const W = 360, H = 181, map = new Float32Array(W * H);
    const sp = MOON_ALBEDO_SPOTS.map(s => ({ lon: s[0], lat: s[1], a: s[2], b: s[3], c: Math.cos(s[4] * MOON_D2R), s: Math.sin(s[4] * MOON_D2R), k: s[5] }));
    for (let j = 0; j < H; j++) {
      const lat = 90 - j;
      for (let i = 0; i < W; i++) {
        const lon = i - 180;
        let v = 1.0;
        for (const q of sp) {
          let dl = lon - q.lon; dl = ((dl + 540) % 360) - 180;
          const dx = dl * Math.cos(((lat + q.lat) / 2) * MOON_D2R), dy = lat - q.lat;
          const ex = (dx * q.c + dy * q.s) / q.a, ey = (-dx * q.s + dy * q.c) / q.b, r2 = ex * ex + ey * ey;
          if (r2 > 9) continue;
          v += q.k / (1 + r2 * r2);
        }
        map[j * W + i] = Math.max(0.2, Math.min(1.35, v));
      }
    }
    moonAlbedoMap = map; return map;
  }
  function moonAlbedoAt(lon, lat) {
    const map = moonBuildAlbedo();
    let fx = ((lon + 180) % 360 + 360) % 360, fy = Math.max(0, Math.min(180, 90 - lat));
    const x0 = Math.floor(fx), y0 = Math.min(179, Math.floor(fy)), tx = fx - x0, ty = fy - y0, x1 = (x0 + 1) % 360;
    const a = map[y0 * 360 + x0], b = map[y0 * 360 + x1], c = map[(y0 + 1) * 360 + x0], d = map[(y0 + 1) * 360 + x1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }

  // ---- orientation: which rotation / mirror makes the model look like the photograph ------------------------------
  const moonGridCache = {};
  function moonGrid(N, rmax) {
    const key = N + '_' + rmax;
    if (moonGridCache[key]) return moonGridCache[key];
    const u = new Float32Array(N * N), v = new Float32Array(N * N), z = new Float32Array(N * N), idx = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const uu = ((i + 0.5) / N - 0.5) * 2.2, vv = -((j + 0.5) / N - 0.5) * 2.2, r2 = uu * uu + vv * vv, k = j * N + i;
      if (r2 <= rmax * rmax) { u[k] = uu; v[k] = vv; z[k] = Math.sqrt(1 - r2); idx.push(k); }
    }
    return (moonGridCache[key] = { N, u, v, z, idx: Int32Array.from(idx) });
  }
  // Normalised cross-correlation between the photo (obs, N*N crop) and the shaded albedo model for a given orientation.
  function moonMatchScore(obs, N, fit, ph) {
    const g = moonGrid(N, ph.cosi > 0.3 ? 0.86 : ph.cosi > -0.3 ? 0.92 : 0.96);       // a thin crescent lives near the limb, so reach further out
    const sx = ph.sini * ph.ux, sy = ph.sini * ph.uy, sz = ph.cosi;
    const t = fit.theta * MOON_D2R, ct = Math.cos(t), st = Math.sin(t), p0 = fit.lat0 * MOON_D2R, sp0 = Math.sin(p0), cp0 = Math.cos(p0);
    const mir = fit.mirror ? -1 : 1, thr = ph.thr;
    let n = 0, so = 0, ss = 0, soo = 0, sss = 0, sos = 0;
    for (let q = 0; q < g.idx.length; q++) {
      const k = g.idx[q], u = g.u[k], v = g.v[k], z = g.z[k];
      const mu0 = u * sx + v * sy + z * sz;
      if (mu0 < 0.12) continue;
      const o = obs[k]; if (o < thr) continue;
      const x = mir * (u * ct - v * st), y = u * st + v * ct;
      const sphi = z * sp0 + y * cp0;
      const lat = Math.asin(sphi > 1 ? 1 : sphi < -1 ? -1 : sphi) / MOON_D2R;
      const lon = fit.lon0 + Math.atan2(x, z * cp0 - y * sp0) / MOON_D2R;
      const s = Math.pow(moonAlbedoAt(lon, lat) * mu0 / (mu0 + z), 0.45);
      n++; so += o; ss += s; soo += o * o; sss += s * s; sos += o * s;
    }
    moonMatchScore.n = n;
    if (n < Math.max(40, 0.011 * N * N)) return -2;
    const co = soo - so * so / n, cs = sss - ss * ss / n;
    if (co < 1e-9 || cs < 1e-9) return -2;
    return (sos - so * ss / n) / Math.sqrt(co * cs);
  }
  const moonAngDiff = (a, b) => { let d = (a - b) % 360; if (d > 180) d -= 360; if (d < -180) d += 360; return Math.abs(d); };
  // Local search over rotation, libration and phase (coordinate descent, steps halve each round).
  function moonRefine(obs, N, start, ph0, rounds, free) {
    let cur = Object.assign({}, start);
    const phOf = (c) => ph0.sini < 1e-6 ? ph0 : moonPhaseWith(ph0, c.cosi, c.psi);
    const evalAt = (c) => moonMatchScore(obs, N, c, phOf(c));
    cur.score = evalAt(cur);
    let sT = 3, sL = 3, sC = 0.07, sP = 6;
    const c0 = ph0.cosi, psi0 = Math.atan2(ph0.uy, ph0.ux) / MOON_D2R;
    for (let round = 0; round < rounds; round++) {
      let improved = true, guard = 0;
      while (improved && guard++ < 14) {
        improved = false;
        const moves = [[sT, 0, 0, 0, 0], [-sT, 0, 0, 0, 0]];
        if (free.lib) moves.push([0, sL, 0, 0, 0], [0, -sL, 0, 0, 0], [0, 0, sL, 0, 0], [0, 0, -sL, 0, 0]);
        if (free.phase && ph0.sini > 1e-6) moves.push([0, 0, 0, sC, 0], [0, 0, 0, -sC, 0], [0, 0, 0, 0, sP], [0, 0, 0, 0, -sP]);
        for (const d of moves) {
          const c = { theta: cur.theta + d[0], mirror: cur.mirror,
            lon0: Math.max(-9, Math.min(9, cur.lon0 + d[1])), lat0: Math.max(-9, Math.min(9, cur.lat0 + d[2])),
            cosi: Math.max(Math.max(-0.99, c0 - 0.25), Math.min(Math.min(1, c0 + 0.25), cur.cosi + d[3])),
            psi: Math.max(psi0 - 30, Math.min(psi0 + 30, cur.psi + d[4])) };
          if (c.theta === cur.theta && c.lon0 === cur.lon0 && c.lat0 === cur.lat0 && c.cosi === cur.cosi && c.psi === cur.psi) continue;
          const s = evalAt(c);
          if (s > cur.score + 1e-4) { c.score = s; cur = c; improved = true; }
        }
      }
      sT /= 2; sL /= 2; sC /= 2; sP /= 2;
    }
    cur.ph = phOf(cur);
    return cur;
  }
  function moonPhaseThin(patch, fp) {                                       // is it a crescent (needs finer sampling)?
    const c = moonCropNorm(patch, fp, 48), st = moonNormStats(c, 48);
    if (!st) return false;
    return moonPhase(moonApplyNorm(c, st), 48).frac < 0.42;
  }
  // patch / fp: the working patch and the disc in patch coordinates. Returns { fit fields, score, margin, ph, detail } or { fail }.
  // The Sun always stands within 1.5 degrees of the lunar equator, so the terminator runs (nearly) pole to pole: for any phase away from full
  // the lunar north-south axis is perpendicular to the direction of the lit limb. That leaves four hypotheses (two directions x two handednesses).
  function moonFindOrientation(patch, fp) {
    const thin = moonPhaseThin(patch, fp);
    const N1 = thin ? 96 : 64, N2 = thin ? 128 : 96;
    const c2 = moonCropNorm(patch, fp, N2), st = moonNormStats(c2, N2);
    if (!st) return { fail: 'flat' };
    const o2 = moonApplyNorm(c2, st), o1 = moonApplyNorm(moonCropNorm(patch, fp, N1), st);
    const ph = moonPhase(o2, N2);
    const psi0 = Math.atan2(ph.uy, ph.ux) / MOON_D2R;
    const base = { lon0: 0, lat0: 0, cosi: ph.cosi, psi: psi0 };
    const free = { lib: true, phase: true };
    const refineFrom = (cands, rounds) => {
      let best = null;
      for (const p of cands) {
        const r = moonRefine(o1, N1, Object.assign({}, base, { theta: p.theta, mirror: p.mirror }), ph, rounds, free);
        r.seed = p; if (!best || r.score > best.score) best = r;
      }
      return best;
    };
    let winner = null, second = -2, used = 'axis';
    const constrained = ph.sini > 0.3 && ph.frac < 0.93;
    if (constrained) {
      // stage A: only the four hypotheses allowed by the geometry, each refined, the best one kept
      const hyp = [];
      for (let m = 0; m < 2; m++) for (const t0 of [-psi0, 180 - psi0]) {
        let bestSeed = null;
        for (let d = -15; d <= 15; d += 5) {
          const th = t0 + d, s = moonMatchScore(o1, N1, Object.assign({}, base, { theta: th, mirror: m }), ph);
          if (!bestSeed || s > bestSeed.score) bestSeed = { theta: th, mirror: m, score: s };
        }
        hyp.push(bestSeed);
      }
      const ref = hyp.filter(h => h.score > -1.5).map(h => refineFrom([h], 2));
      ref.sort((a, b) => b.score - a.score);
      if (ref.length) {
        winner = ref[0];
        second = ref.length > 1 ? ref[1].score : -2;
      }
    }
    if (!winner || winner.score < 0.5) {
      // stage B: no usable geometry (near full, or the lit side could not be measured): search every direction
      used = 'full';
      const grid = [];
      for (let m = 0; m < 2; m++) for (let th = -180; th < 180; th += 5) {
        grid.push({ theta: th, mirror: m, score: moonMatchScore(o1, N1, Object.assign({}, base, { theta: th, mirror: m }), ph) });
      }
      grid.sort((a, b) => b.score - a.score);
      if (grid[0].score > -1) {
        const peaks = [];
        for (const g of grid) {
          if (peaks.length >= 3) break;
          if (peaks.every(p => p.mirror !== g.mirror || moonAngDiff(p.theta, g.theta) > 25)) peaks.push(g);
        }
        const wB = refineFrom(peaks, 2);
        if (!winner || wB.score > winner.score) {
          winner = wB; second = -2;
          for (const g of grid) if (g.mirror !== wB.mirror || moonAngDiff(g.theta, wB.theta) > 25) { second = g.score; break; }
        }
      }
    }
    if (!winner) return { fail: 'nolit', ph, detail: st.detail };
    const best = moonRefine(o2, N2, winner, ph, 3, free);
    const th = ((best.theta % 360) + 540) % 360 - 180;
    return { theta: th, mirror: best.mirror, lon0: best.lon0, lat0: best.lat0, score: best.score, margin: best.score - second, ph: best.ph, detail: st.detail, stats: st, used };
  }
  // ---- crater snap: lock the fit onto real crater rims ---------------------------------------------------------------
  function moonGauss(src, w, h, s) {
    const r = Math.max(1, Math.ceil(s * 2.6)), k = new Float32Array(2 * r + 1);
    let sum = 0;
    for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-i * i / (2 * s * s)); sum += k[i + r]; }
    for (let i = 0; i < k.length; i++) k[i] /= sum;
    const t = new Float32Array(w * h), o = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let a = 0;
        for (let i = -r; i <= r; i++) { const xx = x + i; a += k[i + r] * src[row + (xx < 0 ? 0 : xx >= w ? w - 1 : xx)]; }
        t[row + x] = a;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let a = 0;
        for (let i = -r; i <= r; i++) { const yy = y + i; a += k[i + r] * t[(yy < 0 ? 0 : yy >= h ? h - 1 : yy) * w + x]; }
        o[y * w + x] = a;
      }
    }
    return o;
  }
  // Edge strength of the surface, relative to the local brightness; the limb itself is left out (it is not a crater).
  function moonEdgeMap(data, w, h, fp) {
    const sc = fp.R / 400, B = moonGauss(data, w, h, Math.max(0.8, 1.3 * sc)), L = moonGauss(data, w, h, Math.max(4, 10 * sc));
    const G = new Float32Array(w * h), lim2 = (0.955 * fp.R) * (0.955 * fp.R);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const ddx = x - fp.cx, ddy = y - fp.cy;
        if (ddx * ddx + ddy * ddy > lim2) continue;
        const p = y * w + x, gx = B[p + 1] - B[p - 1], gy = B[p + w] - B[p - w];
        G[p] = 0.5 * Math.hypot(gx, gy) / (L[p] + 0.03);
      }
    }
    return G;
  }
  function moonBil(a, w, h, x, y) {
    if (x < 0 || y < 0 || x > w - 1.001 || y > h - 1.001) return 0;
    const x0 = x | 0, y0 = y | 0, tx = x - x0, ty = y - y0, p = y0 * w + x0;
    return (a[p] * (1 - tx) + a[p + 1] * tx) * (1 - ty) + (a[p + w] * (1 - tx) + a[p + w + 1] * tx) * ty;
  }
  // The rim of a crater as an ellipse in the picture: round across the direction to the disc centre, squeezed along it by z.
  function moonRimPoints(pos, rho, K) {
    const rr = Math.hypot(pos.u, pos.v) || 1e-6, erx = pos.u / rr, ery = -pos.v / rr, etx = -ery, ety = erx, pts = new Float32Array(2 * K);
    for (let k = 0; k < K; k++) {
      const a = 2 * Math.PI * k / K, c = Math.cos(a) * rho, s = Math.sin(a) * rho * pos.z;
      pts[2 * k] = c * etx + s * erx; pts[2 * k + 1] = c * ety + s * ery;
    }
    return pts;
  }
  // Craters worth matching on this picture: big enough to show a rim, well inside the disc and in daylight.
  function moonSnapCraters(fp, fit, ph, minRho) {
    const sv = moonSunVector(ph), list = [];
    for (const f of MOON_CAT) {
      if (f.kind !== 'C') continue;
      const rho = f.size / 2 / MOON_R_KM * fp.R;
      if (rho < minRho) continue;
      const pos = moonToPicture(fit, f.lon, f.lat);
      if (pos.z < 0.42) continue;
      if (pos.u * sv.sx + pos.v * sv.sy + pos.z * sv.sz < 0.1) continue;
      list.push({ f, rho, lon: f.lon, lat: f.lat });
    }
    list.sort((a, b) => b.rho - a.rho);
    return list;
  }
  // Score map of one crater: how strongly a rim-shaped ring of edges sits at each offset around the predicted position.
  function moonRimMap(G, w, h, pos, rho, win) {
    const K = Math.max(16, Math.min(72, Math.round(2 * Math.PI * rho / 2.5))), pts = moonRimPoints(pos, rho, K), n = 2 * win + 1, S = new Float32Array(n * n);
    let sum = 0, sum2 = 0;
    for (let dy = -win; dy <= win; dy++) {
      for (let dx = -win; dx <= win; dx++) {
        let a = 0; const bx = pos.px + dx, by = pos.py + dy;
        for (let k = 0; k < K; k++) a += moonBil(G, w, h, bx + pts[2 * k], by + pts[2 * k + 1]);
        a /= K; S[(dy + win) * n + dx + win] = a; sum += a; sum2 += a * a;
      }
    }
    const mean = sum / (n * n), sd = Math.sqrt(Math.max(1e-12, sum2 / (n * n) - mean * mean));
    for (let i = 0; i < S.length; i++) { const z = (S[i] - mean) / sd - 1.2; S[i] = z > 0 ? z * z : 0; }
    return { S, n, win };
  }
  // fit = { cx, cy, R, theta, mirror, lon0, lat0 } in patch pixels. Moves (theta, lon0, lat0) and the disc centre / radius a little so that
  // catalogue craters sit on crater rims. Returns { ok, theta, lon0, lat0, dx, dy, dR, score, score0, n, hits, rms } (dx, dy, dR in patch px).
  function moonSnap(patch, fp, start, ph, opts) {
    opts = opts || {};
    const R = fp.R, w = patch.w, h = patch.h;
    if (R < 80) return { ok: false, why: 'small' };
    const base = { cx: fp.cx, cy: fp.cy, R, theta: start.theta, mirror: start.mirror, lon0: start.lon0, lat0: start.lat0 };
    const craters = moonSnapCraters(fp, base, ph, 5), maxC = opts.maxCraters || 60;
    if (craters.length < 6) return { ok: false, why: 'few', n: craters.length };
    const G = moonEdgeMap(patch.data, w, h, fp), win = Math.max(10, Math.min(40, Math.round((opts.reach || 0.08) * R)));
    const sb = Math.max(1.5, 0.008 * R), items = [];
    for (const c of craters.slice(0, maxC)) {
      const pos = moonToPicture(base, c.lon, c.lat), m = moonRimMap(G, w, h, pos, c.rho, win);
      m.B = moonGauss(m.S, m.n, m.n, sb);
      items.push({ c, m, p0: pos, wgt: Math.min(1.6, c.rho / 8) });
    }
    const lim = { dxy: 0.02 * R, dR: 0.015 * R };
    // p = [theta, lon0, lat0, dx, dy, dR]; lvl 0 = blurred maps (wide basin), 1 = sharp maps
    const evalP = (p, lvl) => {
      const f = { cx: fp.cx + (p[3] || 0), cy: fp.cy + (p[4] || 0), R: R + (p[5] || 0), theta: p[0], mirror: start.mirror, lon0: p[1], lat0: p[2] };
      let tot = 0;
      for (const it of items) {
        const pos = moonToPicture(f, it.c.lon, it.c.lat);
        if (pos.z < 0.3) continue;
        const m = it.m, ox = pos.px - it.p0.px + m.win, oy = pos.py - it.p0.py + m.win;
        if (ox < 0 || oy < 0 || ox > m.n - 1.001 || oy > m.n - 1.001) continue;
        tot += it.wgt * moonBil(lvl ? m.S : m.B, m.n, m.n, ox, oy);
      }
      return tot;
    };
    const clampP = (p) => [p[0], Math.max(-9, Math.min(9, p[1])), Math.max(-8, Math.min(8, p[2])),
      Math.max(-lim.dxy, Math.min(lim.dxy, p[3] || 0)), Math.max(-lim.dxy, Math.min(lim.dxy, p[4] || 0)), Math.max(-lim.dR, Math.min(lim.dR, p[5] || 0))];
    const descend = (p, s, lvl, steps, rounds, axes) => {
      let st = steps.slice();
      for (let round = 0; round < rounds; round++, st = st.map(v => v / 2)) {
        let improved = true, g = 0;
        while (improved && g++ < 40) {
          improved = false;
          for (const ax of axes) for (const sg of [-1, 1]) {
            const q = p.slice(); q[ax] += sg * st[ax]; const qq = clampP(q), sq = evalP(qq, lvl);
            if (sq > s + 1e-6) { p = qq; s = sq; improved = true; }
          }
        }
      }
      return { p, s };
    };
    const p0 = [start.theta, start.lon0, start.lat0, 0, 0, 0], s0 = evalP(p0, 1);
    // coarse grid over the plausible range of (theta, lon0, lat0) on the blurred maps; the best few separate peaks are then polished
    const gs = 1.5, gn = 6, N3 = 2 * gn + 1;
    const search = (centres, axes) => {
      const peaks = [];
      for (const [cx0, cy0] of centres) {
        const grid = [];
        for (let i = -gn; i <= gn; i++) for (let j = -gn; j <= gn; j++) for (let k = -gn; k <= gn; k++) {
          const p = clampP([p0[0] + i * gs, p0[1] + j * gs, p0[2] + k * gs, cx0, cy0, 0]); grid.push({ p, s: evalP(p, 0), i, j, k });
        }
        for (const g of grid) {
          let top = true;
          for (let a = -1; a <= 1 && top; a++) for (let b = -1; b <= 1 && top; b++) for (let c = -1; c <= 1; c++) {
            if (!a && !b && !c) continue;
            const i = g.i + a, j = g.j + b, k = g.k + c;
            if (i < -gn || i > gn || j < -gn || j > gn || k < -gn || k > gn) continue;
            if (grid[((i + gn) * N3 + (j + gn)) * N3 + (k + gn)].s > g.s) { top = false; break; }
          }
          if (top) peaks.push(g);
        }
      }
      peaks.sort((a, b) => b.s - a.s);
      let best = null;
      const stepsA = [1.0, 1.0, 1.0, 0.006 * R, 0.006 * R, 0.003 * R], stepsB = [0.4, 0.4, 0.4, 0.0025 * R, 0.0025 * R, 0.0012 * R];
      for (const sd of peaks.slice(0, 6)) {
        let r = descend(sd.p, evalP(sd.p, 0), 0, stepsA, 4, axes);
        r = descend(r.p, evalP(r.p, 1), 1, stepsB, 4, axes);
        if (!best || r.s > best.s) best = r;
      }
      return best;
    };
    // first with the disc as detected; the disc centre / radius are only freed when that clearly leaves craters unexplained
    let best = search([[0, 0]], [0, 1, 2]);
    if (!opts.fixedDisc) {
      const o = 0.011 * R, free = search([[0, 0], [o, 0], [-o, 0], [0, o], [0, -o], [o, o], [-o, -o], [o, -o], [-o, o]], [0, 1, 2, 3, 4, 5]);
      if (free && free.s > best.s * 1.25 + 3) best = free;
    }
    // how many craters actually sit on a rim at the end: the sharp map value at the final offset
    const f = { cx: fp.cx + best.p[3], cy: fp.cy + best.p[4], R: R + best.p[5], theta: best.p[0], mirror: start.mirror, lon0: best.p[1], lat0: best.p[2] };
    let hits = 0, used = 0;
    for (const it of items) {
      const pos = moonToPicture(f, it.c.lon, it.c.lat); if (pos.z < 0.3) continue;
      used++;
      const m = it.m, ox = pos.px - it.p0.px + m.win, oy = pos.py - it.p0.py + m.win;
      if (ox >= 0 && oy >= 0 && ox <= m.n - 1.001 && oy <= m.n - 1.001 && moonBil(m.S, m.n, m.n, ox, oy) >= 4) hits++;
    }
    return { ok: true, theta: best.p[0], lon0: best.p[1], lat0: best.p[2], dx: best.p[3], dy: best.p[4], dR: best.p[5], score: best.s, score0: s0, n: used, hits, items, evalP };
  }

  // A very thin crescent has no lit surface inside 0.93 R, so the usual normalisation finds nothing. Measure it straight on the patch instead:
  // sky from outside the disc, level from the brightest pixels, lit fraction and the direction of the lit limb from the bright pixels.
  function moonCrescent(patch, fp) {
    const d = patch.data, w = patch.w, h = patch.h, R = fp.R, sky = [], rim = [];
    const x0 = Math.max(0, Math.floor(fp.cx - 1.35 * R)), x1 = Math.min(w - 1, Math.ceil(fp.cx + 1.35 * R)), y0 = Math.max(0, Math.floor(fp.cy - 1.35 * R)), y1 = Math.min(h - 1, Math.ceil(fp.cy + 1.35 * R));
    const stride = Math.max(1, Math.floor(R / 150));
    for (let y = y0; y <= y1; y += stride) for (let x = x0; x <= x1; x += stride) {
      const r = Math.hypot(x + 0.5 - fp.cx, y + 0.5 - fp.cy) / R;
      if (r > 1.1 && r < 1.35) sky.push(d[y * w + x]); else if (r < 1.0) rim.push(d[y * w + x]);
    }
    if (rim.length < 200) return null;
    const skyLevel = sky.length > 40 ? moonQuantile(sky, 0.5) : 0, peak = moonQuantile(rim, 0.995);
    if (peak - skyLevel < 0.06) return null;
    const k = 1 / (peak - skyLevel);
    let n = 0, lit = 0, sx = 0, sy = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - fp.cx, dy = y + 0.5 - fp.cy, r = Math.hypot(dx, dy) / R;
      if (r > 1.0) continue;
      n++;
      if ((d[y * w + x] - skyLevel) * k > 0.2) { lit++; sx += dx; sy += dy; }
    }
    if (lit < 40 || !n) return null;
    const frac = lit / n, mx = sx / lit / R, my = sy / lit / R, mag = Math.hypot(mx, my);
    if (frac > 0.3 || mag < 0.12) return null;
    const cosi = Math.max(-1, Math.min(1, 2 * frac - 1)), sini = Math.sqrt(1 - cosi * cosi);
    return { frac, ux: mx / mag, uy: -my / mag, sini, cosi, thr: 0.13, sky: skyLevel, peak, lit };
  }
  // The two readings of a crescent: lit limb towards the lunar east (waxing) or west (waning); the picture alone cannot tell them apart.
  // A mirrored picture swaps them again.
  function moonCrescentTheta(cr, waning, mirror) {
    const psi = Math.atan2(cr.uy, cr.ux) / MOON_D2R, th = -psi + ((waning ? 1 : 0) ^ (mirror ? 1 : 0)) * 180;
    return ((th % 360) + 540) % 360 - 180;
  }
  function moonCrescentFit(disc, cr, waning, mirror) {
    return { cx: disc.cx, cy: disc.cy, R: disc.R, theta: moonCrescentTheta(cr, waning, mirror), mirror: mirror ? 1 : 0, lon0: 0, lat0: 0 };
  }
  // Which reading is the likelier one for a sky photographed upright from the northern hemisphere: after sunset (waxing) the Sun is below the
  // Moon to its right, before sunrise (waning) to its left.
  function moonCrescentGuess(cr) { return cr.ux < 0; }

  // Crater snap on a finer view of the disc: opts.window(cx, cy, half) may return a higher-resolution patch around the disc (picture units in, patch
  // object like moonWorkPatch out, with k < 1 when it has more pixels than the working picture); otherwise the working picture is used.
  function moonSnapPicture(gray, w, h, out, opts) {
    const disc = out.disc, half = disc.R * 1.3;
    let sp = null;
    try { sp = opts && opts.window ? opts.window(disc.cx, disc.cy, half) : null; } catch (e) { sp = null; }
    if (!sp) sp = moonWorkPatch(gray, w, h, disc.cx - half, disc.cy - half, disc.cx + half, disc.cy + half, 1300);
    if (!sp) return { ok: false, why: 'nopatch' };
    const fpS = moonPictureToPatch(sp, disc), r = moonSnap(sp, fpS, out.fit, out.ph);
    if (!r.ok) return { ok: false, why: r.why, n: r.n };
    const ratio = r.hits / Math.max(1, r.n), strong = r.hits >= 8 && ratio >= 0.15, usable = r.hits >= 6 && ratio >= 0.11;
    return { ok: true, accepted: usable, strong, hits: r.hits, n: r.n, ratio, score: r.score, score0: r.score0, theta: r.theta, lon0: r.lon0, lat0: r.lat0,
      dx: r.dx * sp.k, dy: r.dy * sp.k, dR: r.dR * sp.k, Rpx: fpS.R };
  }
  // Whole pipeline on a grayscale picture. Returns { ok, fit, ph, score, margin, confidence, ... }.
  function moonAnalyze(gray, w, h, opts) {
    const disc = moonFindDisc(gray, w, h);
    if (!disc) return { ok: false, reason: 'nodisc' };
    const half = disc.R * 1.3;
    const patch = moonWorkPatch(gray, w, h, disc.cx - half, disc.cy - half, disc.cx + half, disc.cy + half, 460);
    if (!patch) return { ok: false, reason: 'nodisc' };
    const fp = moonPictureToPatch(patch, disc);
    const o = moonFindOrientation(patch, fp);
    const out = { ok: true, disc, patch, orient: o };
    if (o.fail) {
      const cr = moonCrescent(patch, fp);
      if (cr) {
        const cp = { cx: patch.ox + (fp.cx + 0.5) * patch.k, cy: patch.oy + (fp.cy + 0.5) * patch.k };
        out.crescent = { ph: cr, waning: moonCrescentGuess(cr) };
        out.ph = cr; out.score = 0; out.margin = 0; out.confidence = 'guess';
        out.fit = moonCrescentFit(disc, cr, out.crescent.waning, 0);
        return out;
      }
      out.fit = { cx: disc.cx, cy: disc.cy, R: disc.R, theta: 0, mirror: 0, lon0: 0, lat0: 0 };
      out.ph = o.ph || { frac: 1, ux: 0, uy: 0, sini: 0, cosi: 1, thr: 0.13 };
      out.confidence = 'none'; out.score = 0; out.margin = 0;
      return out;
    }
    out.fit = { cx: disc.cx, cy: disc.cy, R: disc.R, theta: o.theta, mirror: o.mirror, lon0: o.lon0, lat0: o.lat0 };
    out.ph = o.ph; out.score = o.score; out.margin = o.margin;
    out.confidence = (o.score >= 0.72 && o.margin >= 0.07) ? 'high' : (o.score >= 0.5 && o.margin >= 0.035) ? 'medium' : 'low';
    if (o.ph.sini > 0.2 && o.ph.frac < 0.97) {
      let sn;
      try { sn = moonSnapPicture(gray, w, h, out, opts); } catch (e) { sn = { ok: false, why: 'error' }; }
      out.snap = sn;
      if (sn.ok && sn.accepted) {
        out.fit.theta = ((sn.theta % 360) + 540) % 360 - 180; out.fit.lon0 = sn.lon0; out.fit.lat0 = sn.lat0;
        out.fit.cx += sn.dx; out.fit.cy += sn.dy; out.fit.R += sn.dR;
        if (sn.strong) out.confidence = 'high';
      } else if (out.confidence === 'high' && sn.ok && sn.Rpx >= 220 && sn.n >= 25) out.confidence = 'medium';   // enough detail was there, yet the craters did not confirm the fit
    }
    return out;
  }

  // ---- label candidates --------------------------------------------------------------------------------------------
  function moonSunVector(ph) { return { sx: ph.sini * ph.ux, sy: ph.sini * ph.uy, sz: ph.cosi }; }
  // Limit the atlas candidates to features visible inside the photograph.
  function moonCandidates(fit, ph, opts) {
    const out = [], sv = moonSunVector(ph);
    const tier = opts.tier || 2, kinds = opts.kinds || { M: 1, C: 1, R: 1, S: 1 };
    const shortSide = Math.min(opts.width, opts.height);
    const minPixels = shortSide * [0, 0.084, 0.036, 0.018][tier];
    for (const f of opts.catalogue || MOON_CAT) {
      if (!kinds[f.kind] || (!opts.close && f.tier > tier) || (f.satellite && tier < 3)) continue;
      const pos = moonToPicture(fit, f.lon, f.lat);
      if (pos.px < 0 || pos.py < 0 || pos.px >= opts.width || pos.py >= opts.height) continue;
      const near = opts.close || tier >= 3 ? 0.07 : 0.16;
      if (pos.z < near) continue;                                    // behind or on the limb
      const mu0 = pos.u * sv.sx + pos.v * sv.sy + pos.z * sv.sz;
      // A reference frame can match the terrain even at a different phase.
      // For a surface match, judge light using the photograph itself.
      if (!opts.surface && mu0 < 0.06) continue;
      if (opts.close && f.kind !== 'S' && f.size / MOON_R_KM * fit.R * (0.55 + 0.45 * pos.z) < minPixels) continue;
      let rPx;
      if (f.kind === 'M') rPx = Math.max(0.05, Math.min(0.2, 0.3 * f.size / MOON_R_KM)) * fit.R;
      else if (f.kind === 'S') rPx = 0.018 * fit.R;
      else if (f.kind === 'V') rPx = Math.max(0.025, Math.min(0.08, 0.12 * f.size / MOON_R_KM)) * fit.R;
      else if (f.kind === 'R') rPx = Math.max(0.025, Math.min(0.14, 0.14 * f.size / MOON_R_KM)) * fit.R;
      else rPx = Math.max(0.012, f.size / 2 / MOON_R_KM) * fit.R;
      rPx *= (1 + pos.z) / 2;                                        // a foreshortened feature is marked a little tighter
      if (opts.lit && opts.lit(pos.px, pos.py) < (opts.thr || 0)) {
        // A crater's floor can be dark even when its rim is visible.
        const r = Math.min(rPx * 0.7, shortSide * 0.075);
        if (!opts.surface || f.kind !== 'C' || ![[r, 0], [-r, 0], [0, r], [0, -r]].some(([x, y]) => {
          const px = pos.px + x, py = pos.py + y;
          return px >= 0 && py >= 0 && px < opts.width && py < opts.height && opts.lit(px, py) >= opts.thr;
        })) continue;
      }
      const priority = opts.close ? (f.satellite ? 4 : Math.min(f.tier - 1, 1)) : f.tier * 10;
      out.push({ f, px: pos.px, py: pos.py, z: pos.z, radiusPx: rPx, markR: moonMarkRadius(f, rPx, fit.R), rank: priority - Math.log2(1 + f.size) });
    }
    out.sort((a, b) => a.rank - b.rank);
    // keep markers apart: a marker too close to a stronger one is dropped
    const keep = [], minSep = Math.min(fit.R, shortSide * 0.7) * (tier >= 3 ? 0.045 : 0.075);
    for (const c of out) {
      let ok = true;
      for (const k of keep) { if (Math.hypot(c.px - k.px, c.py - k.py) < Math.max(minSep, Math.min(c.radiusPx, k.radiusPx) * 0.9)) { ok = false; break; } }
      if (ok) keep.push(c);
      if (opts.maxN && keep.length >= opts.maxN) break;
    }
    for (const c of keep) {                                          // no marker reaches further than 40 % of the way to its nearest neighbour
      let dn = Infinity;
      for (const k of keep) if (k !== c) dn = Math.min(dn, Math.hypot(c.px - k.px, c.py - k.py));
      c.markR = Math.max(0.01 * fit.R, Math.min(c.markR, 0.4 * dn));
    }
    return keep;
  }

  // ---- fine-tune by reference points (the user taps known features) ------------------------------------------------
  // refs: [{ lon, lat, px, py }]. Solves rotation and libration so that the known features land under the taps; the handedness is kept
  // unless it clearly cannot explain the taps. Returns { theta, mirror, lon0, lat0, rms } (rms in disc radii).
  function moonSolveRefs(fit, refs, allowFlip) {
    const wLib = refs.length >= 2 ? 0.0004 : 0.00003;                  // a single tap may use a little libration, two taps may use more
    const clampL = v => Math.max(-9, Math.min(9, v));
    const resid = (th, m, lo, la) => {
      const f = Object.assign({}, fit, { theta: th, mirror: m, lon0: lo, lat0: la });
      let e = 0;
      for (const r of refs) {
        const p = moonToPicture(f, r.lon, r.lat);
        const dx = (p.px - r.px) / fit.R, dy = (p.py - r.py) / fit.R;
        e += dx * dx + dy * dy + (p.z < 0.02 ? 4 : 0);                // a feature on the far side cannot be where the user tapped
      }
      return e;
    };
    const solveFor = (m) => {
      let cur = null;
      for (let th = -180; th < 180; th += 3) { const e = resid(th, m, fit.lon0, fit.lat0); if (!cur || e < cur.e) cur = { th, m, lo: fit.lon0, la: fit.lat0, e }; }
      let stT = 2, stL = 1.5;
      for (let round = 0; round < 7; round++) {
        let improved = true, guard = 0;
        while (improved && guard++ < 60) {
          improved = false;
          for (const d of [[stT, 0, 0], [-stT, 0, 0], [0, stL, 0], [0, -stL, 0], [0, 0, stL], [0, 0, -stL]]) {
            const lo = clampL(cur.lo + d[1]), la = clampL(cur.la + d[2]);
            const e = resid(cur.th + d[0], m, lo, la) + wLib * ((lo - fit.lon0) * (lo - fit.lon0) + (la - fit.lat0) * (la - fit.lat0));
            if (e < cur.e - 1e-10) { cur = { th: cur.th + d[0], m, lo, la, e }; improved = true; }
          }
        }
        stT /= 2; stL /= 2;
      }
      cur.rms = Math.sqrt(resid(cur.th, m, cur.lo, cur.la) / refs.length);
      return cur;
    };
    let sol = solveFor(fit.mirror ? 1 : 0);
    if (allowFlip !== false && refs.length >= 2 && sol.rms > 0.035) {
      const alt = solveFor(fit.mirror ? 0 : 1);
      if (alt.rms < sol.rms * 0.5) sol = alt;
    }
    const th = ((sol.th % 360) + 540) % 360 - 180;
    return { theta: th, mirror: sol.m, lon0: sol.lo, lat0: sol.la, rms: sol.rms };
  }

  // =========================================================================
  // MOON ATLAS - panel logic (Annotate > Solve > Moon)
  // =========================================================================
  const MOON_KIND_ONE = { M: 'Sea', C: 'Crater', R: 'Mountain', V: 'Valley', S: 'Landing site' };
  const moonEl = id => document.getElementById(id);
  const moonFmtKm = km => Math.round(km).toLocaleString('en-US') + ' km';

  function moonSub(f) {
    if (f.kind === 'S') return f.note || 'Landing site';
    if (f.kind === 'M') return (f.note ? f.note + ' · ' : '') + 'Ø ' + moonFmtKm(f.size);
    if (f.kind === 'C') return 'Crater · Ø ' + moonFmtKm(f.size) + (f.note ? ' · ' + f.note : '');
    if (f.kind === 'R') return (/^Montes/.test(f.name) ? 'Mountain range · ' : 'Mountain · ') + moonFmtKm(f.size);
    if (f.kind === 'V') return (/^Rim/.test(f.name) ? 'Rille' : /^Rupes/.test(f.name) ? 'Scarp' : 'Valley') + ' · ' + moonFmtKm(f.size) + (f.note ? ' · ' + f.note : '');
    return f.note || '';
  }
  function moonSetStatus(message, kind) {
    const el = moonEl('moonStatus');
    if (!el) return;
    el.className = 'star-solve-status for-moon' + (kind ? ' ' + kind : '');
    el.textContent = message;
  }
  // Grayscale copy of the picture exactly as the annotations see it (rotated and straightened), capped at 2200 px.
  function moonGrab() {
    const dims = getTransformedDims(), s = Math.min(1, 2200 / Math.max(dims.w, dims.h));
    const w = Math.max(16, Math.round(dims.w * s)), h = Math.max(16, Math.round(dims.h * s));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const c = cv.getContext('2d', { willReadFrequently: true, alpha: false });
    if (!c) throw new Error('This browser could not read the picture.');
    c.fillStyle = '#000000'; c.fillRect(0, 0, w, h);
    c.translate(w / 2, h / 2); c.scale(s, s);
    c.rotate(((state.rot90 || 0) + (state.fineAngle || 0)) * Math.PI / 180);
    c.drawImage(state.img, -state.img.width / 2, -state.img.height / 2);
    const px = c.getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
    for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) / 255;
    return { gray: g, w, h, window: moonGrabWindow };
  }
  // A finer view of a square window of the working picture (working-pixel units), so that the crater step sees the Moon at up to its own
  // resolution. Returns null when the picture has no more detail than the working copy.
  function moonGrabWindow(cx, cy, half) {
    const dims = getTransformedDims(), s = Math.min(1, 2200 / Math.max(dims.w, dims.h)), Rn = half / 1.3 / s, m = Math.min(1, 440 / Math.max(1, Rn));
    if (m <= s * 1.15) return null;
    const side = Math.ceil(2 * half / s * m);
    if (side < 64 || side > 1700) return null;
    const cv = document.createElement('canvas');
    cv.width = side; cv.height = side;
    const c = cv.getContext('2d', { willReadFrequently: true, alpha: false });
    if (!c) return null;
    c.fillStyle = '#000000'; c.fillRect(0, 0, side, side);
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.translate(side / 2, side / 2); c.scale(m, m); c.translate(-cx / s, -cy / s);
    c.translate(dims.w / 2, dims.h / 2);
    c.rotate(((state.rot90 || 0) + (state.fineAngle || 0)) * Math.PI / 180);
    c.drawImage(state.img, -state.img.width / 2, -state.img.height / 2);
    const px = c.getImageData(0, 0, side, side).data, g = new Float32Array(side * side);
    for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) / 255;
    const k = s / m;
    return { data: g, w: side, h: side, k, ox: cx - side / 2 * k, oy: cy - side / 2 * k };
  }
  function moonIsStale() {
    const m = state.moon;
    return !!m && ((m.rot90 || 0) !== (state.rot90 || 0) || Math.abs((m.fine || 0) - (state.fineAngle || 0)) > 0.05);
  }
  // brightness of the photo at a picture position, relative to the lit surface (0 = sky / shadow, 1 = bright surface)
  function moonLitFn(m) {
    if (!m.patch || !m.stats) return null;
    const p = m.patch, d = p.data, k = 1 / Math.max(1e-6, m.stats.peak - m.stats.sky), sky = m.stats.sky;
    return (x, y) => {
      const ix = Math.round((x - p.ox) / p.k - 0.5), iy = Math.round((y - p.oy) / p.k - 0.5);
      if (ix < 0 || iy < 0 || ix >= p.w || iy >= p.h) return 1;
      return (d[iy * p.w + ix] - sky) * k;
    };
  }
  function moonDepth() { return parseInt(moonEl('moonDepth').value, 10) || 2; }

  let moonDetection = null;

  function moonMatchSurface(g, signal) {
    if (signal.aborted) return Promise.reject(signal.reason);
    return new Promise((resolve, reject) => {
      const worker = new Worker('./plate/moon-surface-worker.js?v=13');
      const finish = (error, surface) => {
        worker.terminate();
        clearTimeout(timeout);
        signal.removeEventListener('abort', abort);
        if (error) reject(error);
        else resolve(surface);
      };
      const abort = () => finish(signal.reason);
      const timeout = setTimeout(() => finish(new Error('Lunar surface matching took too long.')), 30000);
      signal.addEventListener('abort', abort, { once: true });
      worker.onerror = () => finish(new Error('The lunar surface solver could not start.'));
      worker.onmessage = ({ data }) => finish(data.error ? new Error(data.error) : null, data.surface);
      const gray = Uint8Array.from(g.gray, value => Math.round(value * 255));
      worker.postMessage({ gray, width: g.w, height: g.h }, [gray.buffer]);
    });
  }

  function moonSurfacePhase(fit, illumination) {
    const p = moonToPicture(fit, illumination.lon, illumination.lat);
    const sini = Math.hypot(p.u, p.v);
    return { frac: (1 + p.z) / 2, ux: sini ? p.u / sini : 0, uy: sini ? p.v / sini : 0,
      sini, cosi: p.z, thr: 0.07 };
  }

  function moonCanUseDisc(res, w, h) {
    if (!res.ok) return false;
    const d = res.disc;
    return d.arc >= 0.25 && d.cutFrac < 0.23 &&
      d.inlier >= 0.34 && d.R < 0.71 * Math.max(w, h);
  }

  // ---- detection ---------------------------------------------------------------------------------------------------
  async function moonDetect() {
    if (!state.img) { moonSetStatus('Load a Moon photo first.', 'error'); return; }
    if (moonDetection) return;
    const controller = new AbortController();
    moonDetection = controller;
    const image = state.img, rot90 = state.rot90 || 0, fine = state.fineAngle || 0;
    const isCurrent = () => moonDetection === controller && state.img === image;
    const btn = moonEl('btnFindMoon');
    if (btn) { btn.disabled = true; btn.textContent = 'Detecting…'; }
    try {
      if (!(await allowPhotoSolve(image, controller.signal, moonSetStatus))) {
        if (isCurrent()) moonSetStatus('Detection cancelled. Your photo is still open.');
        return;
      }
      moonSetStatus('Looking for the lunar disc and matching its markings…');
      await new Promise(r => setTimeout(r, 40));
      if (!isCurrent()) return;
      const g = moonGrab();
      const details = moonLoadFeatureCatalogue().catch(() => {});
      const res = moonAnalyze(g.gray, g.w, g.h, { window: g.window });
      const rim = moonCanUseDisc(res, g.w, g.h);
      let surface = null, unavailable = false;
      // Keep the fast disc matcher for a well-supported, confident full view.
      if (!rim || res.confidence !== 'high' || res.disc.cutFrac >= 0.015) {
        moonSetStatus('Matching surface details against the offline lunar atlas…');
        try { surface = await moonMatchSurface(g, controller.signal); }
        catch (_) { unavailable = true; }
      }
      if (surface) await details;
      if (!isCurrent()) return;
      if (rot90 !== (state.rot90 || 0) || Math.abs(fine - (state.fineAngle || 0)) > 0.05) {
        moonSetStatus('The picture was rotated during detection. Run Detect Moon again.', 'error');
        return;
      }
      state.moonRefs = []; state.moonTap = null; moonEl('moonTapBanner').classList.remove('active');
      if (surface) {
        const { fit, phase, count } = surface;
        const patch = moonWorkPatch(g.gray, g.w, g.h, 0, 0, g.w, g.h, 680);
        const [dark, peak] = moonPercentiles(patch.data, [0.02, 0.98]);
        state.moon = { ww: g.w, wh: g.h, rot90, fine, base: { cx: fit.cx, cy: fit.cy, R: fit.R },
          fit: { ...fit }, auto: { ...fit }, ph: moonSurfacePhase(fit, phase),
          patch, stats: { sky: Math.min(dark, peak * 0.12), peak }, surface, manual: false, conf: 'surface' };
        moonSetStatus('Lunar surface matched · ' + count + ' landmarks. Review the feature positions in the preview.', 'success');
      } else if (!rim) {
        const fit = { cx: g.w / 2, cy: g.h / 2, R: Math.min(g.w, g.h) * 0.38, theta: 0, mirror: 0, lon0: 0, lat0: 0 };
        state.moon = { ww: g.w, wh: g.h, rot90, fine, base: { cx: fit.cx, cy: fit.cy, R: fit.R },
          fit, auto: { ...fit }, ph: { frac: 1, ux: 0, uy: 0, sini: 0, cosi: 1, thr: 0.13 },
          patch: null, stats: null, manual: true, unverified: true, conf: 'none', score: 0, margin: 0 };
        moonSetStatus((unavailable ? 'The offline lunar surface atlas is unavailable.' : 'No reliable match for the lunar surface.') +
          ' Open Adjust to align the atlas manually, or try a photo with more detail.', 'error');
        moonEl('moonAdjust').open = true;
      } else {
        const m = state.moon = { ww: g.w, wh: g.h, rot90: state.rot90 || 0, fine: state.fineAngle || 0,
          base: { cx: res.fit.cx, cy: res.fit.cy, R: res.fit.R }, fit: Object.assign({}, res.fit), ph: res.ph,
          patch: res.patch, stats: res.orient && res.orient.stats ? res.orient.stats : null, manual: false,
          conf: res.confidence, score: res.score, margin: res.margin, detail: res.orient ? res.orient.detail : 0, snap: res.snap || null };
        if (res.crescent) {
          m.stats = { sky: res.ph.sky, peak: res.ph.peak };
          m.crescent = { ph: res.ph, disc: { cx: res.fit.cx, cy: res.fit.cy, R: res.fit.R }, waning: res.crescent.waning, guess: res.crescent.waning };
        }
        // a thin crescent shows too little of the surface to be sure about the orientation
        else if (res.ph.frac < 0.16 && m.conf !== 'none') m.conf = 'low'; else if (res.ph.frac < 0.28 && m.conf === 'high') m.conf = 'medium';
        m.auto = Object.assign({}, m.fit);
        const { cx, cy, R } = m.fit;
        const margin = Math.max(2, R * 0.01);
        const clipped = cx - R < -margin || cy - R < -margin ||
          cx + R > m.ww + margin || cy + R > m.wh + margin;
        const framing = clipped ? 'part of the disc is outside the frame' : Math.round(res.ph.frac * 100) + '% lit';
        const rotTxt = Math.round(m.fit.theta) + '°' + (m.fit.mirror ? ' · mirrored' : '');
        if (m.crescent) {
          const side = Math.abs(m.crescent.ph.ux) < 0.35 ? (m.crescent.ph.uy > 0 ? 'top' : 'bottom') : (m.crescent.ph.uy > 0.35 ? 'upper ' : m.crescent.ph.uy < -0.35 ? 'lower ' : '') + (m.crescent.ph.ux > 0 ? 'right' : 'left');
          moonSetStatus('Very thin crescent · ' + framing + ' · lit side at the ' + side + '. So little of the surface is lit that the picture cannot say which way up the Moon is. Best guess: ' + (m.crescent.waning ? 'waning (shrinking)' : 'waxing (growing)') + ' — switch it above if that is wrong. Only features on the lit edge can be named.', '');
        } else if (m.conf === 'none') {
          m.unverified = true;
          moonSetStatus('Moon disc found (' + framing + '), but its surface shows no detail to match (overexposed or very small?). Set the rotation in Adjust, or tap two known craters.', 'error');
          moonEl('moonAdjust').open = true;
        } else if (m.conf === 'high') {
          const sn = m.snap && m.snap.ok && m.snap.accepted && m.snap.strong ? m.snap : null;
          moonSetStatus('Moon found · ' + framing + ' · rotated ' + rotTxt + '. ' + (sn ? 'Orientation and tilt locked on ' + sn.hits + ' craters (high confidence).' : 'Orientation matched with high confidence.'), 'success');
        } else if (m.conf === 'medium') {
          moonSetStatus('Moon found · ' + framing + ' · estimated rotation ' + rotTxt + '. Check the labels in the preview and use Adjust to correct the alignment.', '');
        } else {
          moonSetStatus('Moon found · ' + framing + '. The orientation is a best guess' + (res.ph.frac < 0.16 ? ' (a thin crescent shows very little surface)' : '') + ': check the names on the preview, then use Rotate / Flip or tap two known craters.', '');
          moonEl('moonAdjust').open = true;
        }
      }
      moonSyncControls();
      moonRecompute(false);
    } catch (err) {
      if (isCurrent()) moonSetStatus(err && err.message ? err.message : 'The Moon could not be analysed.', 'error');
    } finally {
      if (moonDetection === controller) {
        moonDetection = null;
        if (btn) { btn.disabled = !state.img; btn.textContent = 'Detect Moon'; }
      }
    }
  }

  // ---- candidates --------------------------------------------------------------------------------------------------
  function moonKindsOn() {
    const k = {};
    document.querySelectorAll('#moonKinds .moon-chip').forEach(b => { k[b.dataset.k] = b.classList.contains('on'); });
    return k;
  }
  let moonRenderSig = '';
  function moonRecompute(soft) {
    const m = state.moon;
    if (!m) return;
    const depth = m.crescent ? 3 : moonDepth();
    const close = moonCloseView(m);
    let maxN = depth === 1 ? 22 : depth === 2 ? 38 : 110;
    // a small Moon in a big picture leaves little room for names: the lighter levels scale with how much of the picture the disc spans
    if (depth < 3 && m.ww && m.wh) maxN = Math.max(10, Math.round(maxN * Math.min(1, Math.max(0.35, 2 * m.fit.R / Math.min(m.ww, m.wh)))));
    const found = m.unverified && !m.edited && !state.moonRefs.length ? [] : moonCandidates(m.fit, m.ph, {
      tier: depth, kinds: moonKindsOn(), maxN, width: m.ww, height: m.wh, lit: moonLitFn(m), thr: 0.07,
      surface: !!m.surface, close, catalogue: close ? moonDetailCatalogue : null
    });
    const prev = new Map(state.moonCandidates.map(x => [x.f.name, x.selected]));
    state.moonCandidates = found.map(x => Object.assign(x, { selected: prev.has(x.f.name) ? prev.get(x.f.name) : true }));
    moonRenderCandidates();
    moonFillRefSelect();
    if (state.appMode === 'annotate') renderCanvas();
  }
  function moonRenderCandidates() {
    const list = moonEl('moonCandidateList'), actions = moonEl('moonActions');
    if (!list || !actions) return;
    const sig = state.moonCandidates.map(c => c.f.name + (c.selected ? '1' : '0')).join('|');
    if (sig === moonRenderSig && !list.hidden) { moonUpdateSelectionUI(); return; }
    moonRenderSig = sig;
    list.replaceChildren();
    if (!state.moonCandidates.length) { list.hidden = true; actions.hidden = !state.moon; moonUpdateSelectionUI(); return; }
    state.moonCandidates.forEach(cand => {
      const f = cand.f;
      const label = document.createElement('label');
      label.className = 'star-candidate';
      const check = document.createElement('input');
      check.type = 'checkbox'; check.checked = cand.selected;
      check.setAttribute('aria-label', 'Select ' + f.name);
      check.addEventListener('change', () => { cand.selected = check.checked; moonRenderSig = ''; moonUpdateSelectionUI(); if (state.appMode === 'annotate') renderCanvas(); });
      const info = document.createElement('span');
      info.className = 'star-candidate-info';
      const t = document.createElement('strong'); t.textContent = f.name;
      const meta = document.createElement('span'); meta.textContent = moonSub(f);
      info.append(t, meta);
      const kind = document.createElement('span');
      kind.className = 'star-candidate-type'; kind.textContent = MOON_KIND_ONE[f.kind] || 'Feature';
      kind.style.color = MOON_KINDS[f.kind] ? MOON_KINDS[f.kind].color : '';
      label.append(check, info, kind);
      list.appendChild(label);
    });
    list.hidden = false; actions.hidden = false;
    moonUpdateSelectionUI();
  }
  function moonUpdateSelectionUI() {
    const sel = state.moonCandidates.filter(c => c.selected).length, total = state.moonCandidates.length;
    const cnt = moonEl('moonSelectedCount'), apply = moonEl('btnMoonApply');
    if (cnt) cnt.textContent = sel + ' of ' + total + ' selected';
    if (apply) {
      apply.disabled = sel === 0 || moonIsStale();
      const have = new Set(state.annotations.map(p => p.catalogId)), fresh = state.moonCandidates.filter(c => c.selected && !have.has('moon:' + c.f.name)).length, upd = sel - fresh;
      apply.textContent = !sel ? 'Add selected to annotations' : !upd ? 'Add ' + fresh + ' selected feature' + (fresh === 1 ? '' : 's') : !fresh ? 'Update ' + upd + ' pin' + (upd === 1 ? '' : 's') : 'Add ' + fresh + ' new · update ' + upd;
    }
    const a = moonEl('btnMoonSelectAll'), b = moonEl('btnMoonDeselectAll');
    if (a) a.disabled = sel === total;
    if (b) b.disabled = sel === 0;
  }
  // Pins from the Moon atlas use the same pin system as deep-sky targets: same look, same editing, same layout.
  // The marker style chosen in the Style tab is used for EVERY Moon pin (no exceptions by kind), and each marker is sized to the feature
  // it names: a sea or a range gets a small ring beside its centre, never a ring around the whole sea.
  function moonMarkRadius(f, rPx, R) {
    const cap = (f.kind === 'M' || f.kind === 'R' || f.kind === 'V') ? 0.05 : 0.07;
    return Math.max(0.014 * R, Math.min(rPx, cap * R));
  }
  function moonPinProps(f, markR, baseUnit) {
    const id = 'moon:' + f.name;
    return {
      title: f.name, sub: moonSub(f), style: state.annDraftStyle || 'atlas',
      radMult: Math.max(0.1, Math.min(2.2, markR / (baseUnit * 1.05))), autoR: true,
      color: state.annColorByType && MOON_KINDS[f.kind] ? MOON_KINDS[f.kind].color : (state.annBaseColor || state.annDraftColor),
      catalogId: id, objectType: MOON_KIND_ONE[f.kind], skyId: id, annotationSource: 'Moon atlas (IAU names)'
    };
  }
  // How many of the new features can be placed cleanly (no label on a label or on a marker, no line crossing anything)?
  // The real layout is the judge: the pins are tried on a scratch list, most important first, and the largest number that is clean is kept.
  // A Moon that is small in the picture cannot carry a hundred labels at a readable size.
  function moonCleanCount(fresh, baseUnit, m) {
    const dm = getTransformedDims(), W = Math.max(8, Math.round(dm.w)), H = Math.max(8, Math.round(dm.h)), ctx = document.createElement('canvas').getContext('2d');   // judged exactly as the export is laid out
    const frame = { cx: W / 2, cy: H / 2, imgScreenW: W, imgScreenH: H, imgLeft: 0, imgRight: W, imgTop: 0, imgBot: H, baseUnit: Math.max(13, Math.min(W, H) * 0.030), teleAligned: true };
    const keepList = state.annotations, keepSel = state.selectedPinId, keepX = state.reelTargetX, keepY = state.reelTargetY;
    const clean = k => {
      const scratch = keepList.slice();
      try {
        state.annotations = scratch;
        for (let i = 0; i < k; i++) {
          const c = fresh[i], f = c.f;
          addAnnotationAt(clamp01(c.px / m.ww), clamp01(c.py / m.wh), Object.assign(moonPinProps(f, c.markR || moonMarkRadius(f, c.radiusPx, m.fit.R), baseUnit), { dir: ['tr', 'tl', 'br', 'bl'][scratch.length % 4], silent: true }));
        }
        return annLayout(ctx, scratch, frame).stats.clean;
      } finally { state.annotations = keepList; state.selectedPinId = keepSel; state.reelTargetX = keepX; state.reelTargetY = keepY; }
    };
    if (fresh.length <= 6 || clean(fresh.length)) return fresh.length;
    if (!clean(0)) return fresh.length;                             // the picture is already crowded by hand-made pins: do what was asked
    let lo = 0, hi = fresh.length;                                  // lo is clean, hi is not
    while (hi - lo > 2) { const mid = (lo + hi) >> 1; if (clean(mid)) lo = mid; else hi = mid; }   // (within two of the limit is close enough)
    return lo;
  }
  function moonApplyPins() {
    const m = state.moon;
    if (!m || moonIsStale()) { showToast('The picture changed since detection: run Detect Moon again'); return; }
    let chosen = state.moonCandidates.filter(c => c.selected);
    if (!chosen.length) return;
    const baseUnit = Math.max(13, Math.min(m.ww, m.wh) * 0.030);
    const isNew = c => !state.annotations.some(p => p.catalogId === 'moon:' + c.f.name);
    chosen.sort((a, b) => a.rank - b.rank);                          // the most important first: they are placed first, and kept when not all fit
    const fresh = chosen.filter(isNew);
    let left = 0;
    if (fresh.length > 6) {
      const take = moonCleanCount(fresh, baseUnit, m);
      if (take < fresh.length) {
        const drop = new Set(fresh.slice(take));
        drop.forEach(c => { c.selected = false; });
        chosen = chosen.filter(c => !drop.has(c)); left = drop.size;
        moonUpdateSelectionUI();
      }
    }
    if (!chosen.length) return;
    saveUndoBeforeAction();
    let added = 0, updated = 0;
    chosen.forEach(c => {
      const f = c.f, nx = clamp01(c.px / m.ww), ny = clamp01(c.py / m.wh);
      const props = moonPinProps(f, c.markR || moonMarkRadius(f, c.radiusPx, m.fit.R), baseUnit);
      const existing = state.annotations.find(p => p.catalogId === props.catalogId);
      if (existing) {
        if (!existing.pMoved) { existing.nx = nx; existing.ny = ny; }                              // a pin moved by hand stays where it was put
        if (!existing.tEdit) { existing.title = props.title; existing.sub = props.sub; }          // …and so does a name or detail typed by hand
        existing.objectType = props.objectType; existing.annotationSource = props.annotationSource;
        if (existing.autoR !== false) { existing.radMult = props.radMult; existing.autoR = true; }   // a size set by hand stays
        state.selectedPinId = existing.id; updated++;
      } else {
        addAnnotationAt(nx, ny, Object.assign(props, { dir: ['tr', 'tl', 'br', 'bl'][state.annotations.length % 4], silent: true }));
        added++;
      }
    });
    syncAnnotationModalUI(); renderAnnotationList(); renderCanvas();
    const parts = [];
    if (added) parts.push(added + ' added');
    if (updated) parts.push(updated + ' updated');
    showToast(parts.join(' · ') + ' from the Moon atlas' + (left ? ' · ' + left + ' left out: they would not fit cleanly at this size' : ''));
    if (!state._moonEditTip) { state._moonEditTip = true; setTimeout(() => showToast('Tip: drag a label to move it, tap it to edit it', 4200), 2400); }
  }
  // A tap on the Moon names the feature under it: the atlas entry nearest to the tap, judged by the size of the feature itself.
  // Returns the pin properties, or null when the tap is off the disc (the pin is then an ordinary one).
  function moonSuggestAt(nx, ny) {
    const m = state.moon;
    if (!m || moonIsStale()) return null;
    const px = nx * m.ww, py = ny * m.wh, fit = m.fit;
    const ll = moonFromPicture(fit, px, py);
    if (!ll) return null;
    const baseUnit = Math.max(13, Math.min(m.ww, m.wh) * 0.030);
    const radiusOf = (f, pos) => {
      let r;
      if (f.kind === 'M') r = Math.max(0.05, Math.min(0.2, 0.3 * f.size / MOON_R_KM)) * fit.R;
      else if (f.kind === 'S') r = 0.018 * fit.R;
      else if (f.kind === 'V') r = Math.max(0.025, Math.min(0.08, 0.12 * f.size / MOON_R_KM)) * fit.R;
      else if (f.kind === 'R') r = Math.max(0.025, Math.min(0.14, 0.14 * f.size / MOON_R_KM)) * fit.R;
      else r = Math.max(0.012, f.size / 2 / MOON_R_KM) * fit.R;
      return r * (1 + pos.z) / 2;
    };
    let best = null;
    for (const f of MOON_CAT) {
      const pos = moonToPicture(fit, f.lon, f.lat);
      if (pos.z < 0.08) continue;
      const rPx = radiusOf(f, pos), reach = Math.max(rPx * 1.1, 0.045 * fit.R), d = Math.hypot(pos.px - px, pos.py - py);
      if (d > reach) continue;
      const score = d / reach + (f.kind === 'M' ? 0.5 : 0);        // a crater on the shore of a sea wins over the sea
      if (!best || score < best.score) best = { f, rPx, score };
    }
    if (best) return Object.assign(moonPinProps(best.f, moonMarkRadius(best.f, best.rPx, fit.R), baseUnit), { sizeMult: state.annDraftSize || 1.0 });
    const lat = Math.round(ll.lat * 10) / 10, lon = Math.round(ll.lon * 10) / 10;
    return {
      title: 'Lunar feature', sub: Math.abs(lat).toFixed(1) + '° ' + (lat >= 0 ? 'N' : 'S') + ' · ' + Math.abs(lon).toFixed(1) + '° ' + (lon >= 0 ? 'E' : 'W'),
      style: state.annDraftStyle || 'atlas', radMult: Math.max(0.1, Math.min(2.2, moonMarkRadius({ kind: 'C' }, 0, fit.R) * 1.4 / (baseUnit * 1.05))), autoR: true,
      color: state.annBaseColor || state.annDraftColor, annotationSource: 'Moon atlas (position)'
    };
  }

  // ---- controls ----------------------------------------------------------------------------------------------------
  function moonSyncControls() {
    const m = state.moon;
    const set = (id, v, txt) => { const e = moonEl(id), l = moonEl('lbl' + id.slice(0, 1).toUpperCase() + id.slice(1)); if (e) e.value = v; if (l) l.textContent = txt; };
    const open = !!m;
    document.querySelectorAll('#moonAdjust input, #moonAdjust button, #moonAdjust select').forEach(e => { e.disabled = !open; });
    const row0 = moonEl('moonPhaseRow'); if (row0 && !m) row0.hidden = true;
    if (!m) return;
    const f = m.fit, b = m.base;
    set('moonRot', Math.round(f.theta), Math.round(f.theta) + '°');
    set('moonLon', f.lon0.toFixed(1), (f.lon0 >= 0 ? '+' : '−') + Math.abs(f.lon0).toFixed(1) + '°');
    set('moonLat', f.lat0.toFixed(1), (f.lat0 >= 0 ? '+' : '−') + Math.abs(f.lat0).toFixed(1) + '°');
    set('moonSize', Math.round(f.R / b.R * 100), Math.round(f.R / b.R * 100) + '%');
    set('moonDx', Math.round((f.cx - b.cx) / b.R * 100), Math.round((f.cx - b.cx) / b.R * 100) + '%');
    set('moonDy', Math.round((f.cy - b.cy) / b.R * 100), Math.round((f.cy - b.cy) / b.R * 100) + '%');
    const row = moonEl('moonPhaseRow');
    if (row) {
      row.hidden = !m.crescent;
      row.querySelectorAll('.moon-chip').forEach(b => { const on = !!m.crescent && (b.dataset.w === '1') === !!m.crescent.waning; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    }
    const fl = moonEl('btnMoonFlip');
    if (fl) { fl.classList.toggle('active', !!f.mirror); fl.setAttribute('aria-pressed', f.mirror ? 'true' : 'false'); }
    moonRenderRefs();
  }
  function moonReadControls() {
    const m = state.moon;
    if (!m) return;
    const v = id => parseFloat(moonEl(id).value) || 0, f = m.fit, b = m.base;
    f.theta = v('moonRot'); f.lon0 = v('moonLon'); f.lat0 = v('moonLat');
    f.R = Math.max(8, b.R * v('moonSize') / 100);
    f.cx = b.cx + b.R * v('moonDx') / 100; f.cy = b.cy + b.R * v('moonDy') / 100;
  }
  let moonRaf = 0;
  function moonSchedule() {
    if (moonRaf) return;
    moonRaf = requestAnimationFrame(() => { moonRaf = 0; moonRecompute(true); });
  }
  function moonManualEdit() {          // a manual change replaces the tap-based fit
    state.moonRefs = [];
    moonReadControls();
    moonRenderRefs();
    if (state.moon) state.moon.edited = true;
    moonSchedule();
  }
  ['moonRot', 'moonLon', 'moonLat', 'moonSize', 'moonDx', 'moonDy'].forEach(id => {
    moonEl(id).addEventListener('input', () => {
      const l = moonEl('lbl' + id.slice(0, 1).toUpperCase() + id.slice(1)), v = parseFloat(moonEl(id).value) || 0;
      if (l) l.textContent = id === 'moonLon' || id === 'moonLat' ? (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1) + '°' : id === 'moonRot' ? Math.round(v) + '°' : Math.round(v) + '%';
      moonManualEdit();
    });
  });
  for (const [button, angle] of [['btnMoonRotL', -90], ['btnMoonRotR', 90]]) {
    moonEl(button).addEventListener('click', () => {
      const m = state.moon;
      if (!m) return;
      m.fit.theta = (m.fit.theta + angle + 540) % 360 - 180;
      m.edited = true;
      state.moonRefs = [];
      moonSyncControls();
      moonRecompute(true);
    });
  }
  moonEl('btnMoonFlip').addEventListener('click', () => {
    const m = state.moon; if (!m) return;
    m.fit.mirror = m.fit.mirror ? 0 : 1;
    m.fit.theta = m.crescent ? moonCrescentTheta(m.crescent.ph, m.crescent.waning, m.fit.mirror) : -m.fit.theta;
    m.edited = true;
    state.moonRefs = []; moonSyncControls(); moonRecompute(true);
  });
  moonEl('btnMoonReset').addEventListener('click', () => {
    const m = state.moon; if (!m) return;
    m.fit = Object.assign({}, m.auto);
    m.edited = false;
    if (m.crescent) m.crescent.waning = m.crescent.guess;
    state.moonRefs = []; moonSyncControls(); moonRecompute(true);
  });
  // a crescent this thin cannot tell waxing from waning: the choice is the person's
  document.querySelectorAll('#moonPhaseRow .moon-chip').forEach(b => b.addEventListener('click', () => {
    const m = state.moon; if (!m || !m.crescent) return;
    m.crescent.waning = b.dataset.w === '1';
    m.fit.theta = moonCrescentTheta(m.crescent.ph, m.crescent.waning, m.fit.mirror);
    state.moonRefs = []; moonSyncControls(); moonRecompute(true);
  }));
  moonEl('moonDepth').addEventListener('change', () => moonRecompute(true));
  document.querySelectorAll('#moonKinds .moon-chip').forEach(b => b.addEventListener('click', () => { b.classList.toggle('on'); b.setAttribute('aria-pressed', b.classList.contains('on') ? 'true' : 'false'); moonRecompute(true); }));
  moonEl('btnFindMoon').addEventListener('click', moonDetect);
  moonEl('btnMoonApply').addEventListener('click', moonApplyPins);
  moonEl('btnMoonSelectAll').addEventListener('click', () => { state.moonCandidates.forEach(c => { c.selected = true; }); moonRenderSig = ''; moonRenderCandidates(); if (state.appMode === 'annotate') renderCanvas(); });
  moonEl('btnMoonDeselectAll').addEventListener('click', () => { state.moonCandidates.forEach(c => { c.selected = false; }); moonRenderSig = ''; moonRenderCandidates(); if (state.appMode === 'annotate') renderCanvas(); });

  // ---- fine-tune by tapping known features -------------------------------------------------------------------------
  function moonFillRefSelect() {
    const sel = moonEl('moonRefSel'), m = state.moon;
    if (!sel || !m) return;
    const keep = sel.value;
    const close = moonCloseView(m);
    const vis = (close ? state.moonCandidates.map(c => c.f) : MOON_CAT)
      .filter(f => (f.kind === 'C' || f.kind === 'R') && (close || (f.tier <= 2 && moonToPicture(m.fit, f.lon, f.lat).z > 0.3)) &&
        !(f.kind === 'R' && /^Montes/.test(f.name))).sort((a, b) => b.size - a.size);
    const names = vis.map(f => f.name);
    if (sel.dataset.sig === names.join('|')) return;
    sel.dataset.sig = names.join('|');
    sel.replaceChildren();
    vis.forEach(f => { const o = document.createElement('option'); o.value = f.name; o.textContent = f.name + ' · ' + (f.kind === 'C' ? 'Ø ' + moonFmtKm(f.size) : 'peak'); sel.appendChild(o); });
    if (names.includes(keep)) sel.value = keep;
    moonEl('btnMoonTap').disabled = !vis.length;
  }
  function moonRenderRefs() {
    const box = moonEl('moonRefs');
    if (!box) return;
    box.replaceChildren();
    state.moonRefs.forEach((r, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'moon-ref'; b.title = 'Remove this tap';
      b.textContent = r.name + '  ✕';
      b.addEventListener('click', () => { state.moonRefs.splice(i, 1); moonSolveFromRefs(); });
      box.appendChild(b);
    });
    box.hidden = !state.moonRefs.length;
    const clear = moonEl('btnMoonClearTaps');
    if (clear) clear.hidden = !state.moonRefs.length;
  }
  function moonSolveFromRefs() {
    const m = state.moon;
    if (!m) return;
    if (!state.moonRefs.length) { moonRenderRefs(); return; }
    const refs = state.moonRefs.map(r => ({ lon: r.lon, lat: r.lat, px: r.nx * m.ww, py: r.ny * m.wh }));
    const sol = moonSolveRefs(m.fit, refs);
    Object.assign(m.fit, { theta: sol.theta, mirror: sol.mirror, lon0: sol.lon0, lat0: sol.lat0 });
    moonSyncControls();
    moonRecompute(true);
    const px = Math.round(sol.rms * m.fit.R);
    moonSetStatus('Fitted to ' + refs.length + ' tap' + (refs.length === 1 ? '' : 's') + (refs.length > 1 ? ' · residual about ' + px + ' px' : '') + (refs.length === 1 ? '. Tap a second feature far from the first for a tighter fit.' : '.'), 'success');
  }
  function moonStartTap() {
    const m = state.moon, name = moonEl('moonRefSel').value, f = (moonDetailCatalogue || MOON_CAT).find(x => x.name === name);
    if (!m || !f) return;
    state.placingPinMode = false; moonEl('pinModeBanner').classList.remove('active');
    state.moonTap = { name: f.name, lon: f.lon, lat: f.lat };
    moonEl('moonTapText').textContent = 'Tap ' + f.name + ' on the photo';
    moonEl('moonTapBanner').classList.add('active');
  }
  function moonCancelTap() { state.moonTap = null; moonEl('moonTapBanner').classList.remove('active'); }
  function moonTapped(tap) {
    const t = state.moonTap;
    if (!t || !state.moon) { moonCancelTap(); return; }
    const v = annView();
    const nx = (tap.x - v.cx) / v.w + 0.5, ny = (tap.y - v.cy) / v.h + 0.5;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;                  // outside the picture: keep waiting
    state.moonRefs = state.moonRefs.filter(r => r.name !== t.name);
    state.moonRefs.push({ name: t.name, lon: t.lon, lat: t.lat, nx, ny });
    moonCancelTap();
    moonSolveFromRefs();
  }
  moonEl('btnMoonTap').addEventListener('click', moonStartTap);
  moonEl('btnCancelMoonTap').addEventListener('click', moonCancelTap);
  moonEl('btnMoonClearTaps').addEventListener('click', () => { state.moonRefs = []; moonRenderRefs(); const m = state.moon; if (m) { m.fit = Object.assign({}, m.auto); moonSyncControls(); moonRecompute(true); } });

  // ---- reset (new picture) -----------------------------------------------------------------------------------------
  function resetMoonUI() {
    if (moonDetection) {
      moonDetection.abort();
      moonDetection = null;
    }
    state.moon = null; state.moonCandidates = []; state.moonRefs = []; state.moonTap = null; moonRenderSig = '';
    const banner = moonEl('moonTapBanner'); if (banner) banner.classList.remove('active');
    moonSetStatus(state.img ? 'Image ready. Run Detect Moon to align the lunar atlas.' : 'Load a Moon photo, then run Detect Moon.');
    const list = moonEl('moonCandidateList'), actions = moonEl('moonActions'), btn = moonEl('btnFindMoon'), adj = moonEl('moonAdjust'), sel = moonEl('moonRefSel');
    if (list) { list.hidden = true; list.replaceChildren(); }
    if (actions) actions.hidden = true;
    if (btn) { btn.disabled = !state.img; btn.textContent = 'Detect Moon'; }
    if (adj) adj.open = false;
    if (sel) { sel.replaceChildren(); sel.dataset.sig = ''; }
    const tapBtn = moonEl('btnMoonTap'); if (tapBtn) tapBtn.disabled = true;
    moonSyncControls();
  }

  // ---- Sky mode switch (Starfield | Moon) --------------------------------------------------------------------------
  function setSkyMode(mode) {
    state.skyMode = mode === 'moon' ? 'moon' : 'stars';
    const panel = moonEl('starSolvePanel');
    if (panel) panel.dataset.sky = state.skyMode;
    document.querySelectorAll('#skyModeGroup [data-skymode]').forEach(b => {
      const on = b.dataset.skymode === state.skyMode;
      b.classList.toggle('active', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (state.skyMode !== 'moon') moonCancelTap();
    const deck = document.getElementById('annotateDeck');
    if (deck) deck.dataset.sky = state.skyMode;
    if (state.appMode === 'annotate') renderCanvas();
  }
  document.querySelectorAll('#skyModeGroup [data-skymode]').forEach(b => b.addEventListener('click', () => setSkyMode(b.dataset.skymode)));

  // ---- preview overlay (stage only, never exported) ----------------------------------------------------------------
  // c is translated to the picture's top-left corner; W, H = size of the picture on screen.
  function moonSyncGuides() {
    document.querySelectorAll('[data-ring]').forEach(b => {
      const on = b.dataset.ring === state.moonRing;
      b.classList.toggle('active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  function moonDrawGhost(c, W, H) {
    const m = state.moon;
    if (!m || state.skyMode !== 'moon') return;
    if (moonIsStale()) { if (!m.staleShown) { m.staleShown = true; moonSetStatus('The picture was rotated after detection. Run Detect Moon again.', 'error'); moonUpdateSelectionUI(); } return; }
    if (m.staleShown) { m.staleShown = false; moonUpdateSelectionUI(); }
    const d = state.dpr || 1, fx = W / m.ww, fy = H / m.wh, f = m.fit;
    const cx = f.cx * fx, cy = f.cy * fy, R = f.R * fx;
    const ice = a => 'rgba(238,244,252,' + a + ')', dark = a => 'rgba(4,8,14,' + a + ')';
    const halo = (fs) => { c.shadowColor = 'rgba(2,6,14,0.92)'; c.shadowBlur = fs * 0.5; c.shadowOffsetX = 0; c.shadowOffsetY = fs * 0.05; };
    const noHalo = () => { c.shadowColor = 'rgba(0,0,0,0)'; c.shadowBlur = 0; c.shadowOffsetY = 0; };
    c.save();
    c.lineJoin = 'round'; c.lineCap = 'round';
    // Outline of the Moon: a quiet dashed guide while working. "On image" prints a solid outline into the picture instead (see annDrawMoonRing).
    if (state.moonRing === 'guide') {
      const cuts = annRingCuts(state._annStats ? annLastLay : null, 2.4 * d);   // it breaks around the labels and markers drawn a moment ago
      c.setLineDash([6 * d, 5 * d]);
      c.lineWidth = 2.4 * d; c.strokeStyle = dark(0.38); c.beginPath(); annRingPath(c, cx, cy, R, cuts); c.stroke();
      c.lineWidth = 1 * d; c.strokeStyle = ice(0.72); c.beginPath(); annRingPath(c, cx, cy, R, cuts); c.stroke();
      c.setLineDash([]);
    }
    // Features found but not pinned yet: drawn with the marker style that the pins will get, at the size they will get, so that
    // adding them changes nothing (a pinned one is drawn by the pin itself, so nothing is drawn twice). Unticked ones are fainter.
    const pinned = new Set(state.annotations.map(a => a.catalogId)), hasMoonPins = state.annotations.some(a => String(a.catalogId || '').startsWith('moon:'));
    const dmn = getTransformedDims(), sg = W / Math.max(1, dmn.w), u = Math.max(13 * sg, Math.min(W, H) * 0.030), sty = ANN_STYLES.indexOf(state.annDraftStyle) >= 0 ? state.annDraftStyle : 'atlas';
    const lwPx = Math.max(1.1 * sg, u * 0.05) * (state.annDraftLine || 1), lwDraw = Math.max(lwPx, 1), sz = state.annDraftSize || 1;
    state.moonCandidates.forEach(cd => {
      if (pinned.has('moon:' + cd.f.name) || (hasMoonPins && !cd.selected)) return;   // once pins exist, only what is still waiting to be added is previewed
      const x = cd.px * fx, y = cd.py * fy, rad = Math.max(u * 0.1, (cd.markR || cd.radiusPx) * fx * sz);
      const col = state.annColorByType && MOON_KINDS[cd.f.kind] ? MOON_KINDS[cd.f.kind].color : (state.annBaseColor || '#EAF2FF');
      c.globalAlpha = cd.selected ? 0.95 : 0.4;
      annDrawMarker(c, { look: { style: sty, col }, lwPx, lwDraw, px: x, py: y, geom: annGeom(sty, rad, u, lwPx, true), u });
      c.globalAlpha = 1;
    });
    // names of the great seas help to judge the orientation immediately (until real markers are on the picture)
    const fs = Math.max(9 * d, Math.min(14 * d, R * 0.07));
    c.font = '600 ' + fs + 'px ' + (state.annDraftFont || 'sans-serif'); c.textAlign = 'center'; c.textBaseline = 'middle';
    if (!hasMoonPins && state.appMode === 'annotate') {
      const placed = [];                                              // the bigger seas are named first; a name that would run into another one is left out
      state.moonCandidates.filter(cd => cd.f.kind === 'M' && cd.f.tier === 1).sort((p, q) => q.f.size - p.f.size).forEach(cd => {
        const txt = cd.f.name.replace(/^(Mare|Oceanus|Sinus) /, '').toUpperCase(), x = cd.px * fx, y = cd.py * fy, w = c.measureText(txt).width + fs * txt.length * 0.12;
        const r = { l: x - w / 2 - fs * 0.4, r: x + w / 2 + fs * 0.4, t: y - fs * 0.8, b: y + fs * 0.8 };
        if (r.l < 0 || r.r > W || r.t < 0 || r.b > H || placed.some(q => r.l < q.r && r.r > q.l && r.t < q.b && r.b > q.t)) return;
        placed.push(r);
        halo(fs); c.fillStyle = ice(0.9); annDrawTxt(c, txt, x, y, fs * 0.12, 'center'); noHalo();
      });
    }
    // reference taps
    state.moonRefs.forEach(r => {
      const x = r.nx * W, y = r.ny * H, s = 9 * d;
      c.lineWidth = 3 * d; c.strokeStyle = dark(0.7); c.beginPath(); c.moveTo(x - s, y); c.lineTo(x + s, y); c.moveTo(x, y - s); c.lineTo(x, y + s); c.stroke();
      c.lineWidth = 1.4 * d; c.strokeStyle = '#7FDCB5'; c.beginPath(); c.moveTo(x - s, y); c.lineTo(x + s, y); c.moveTo(x, y - s); c.lineTo(x, y + s); c.stroke();
    });
    c.restore();
  }


  resetMoonUI();

  // Annotate has its own view and crop in source coordinates.
  function annFrameContains(x, y) {
    if (!state.img) return false;
    const { frame: r } = annotationStageView();
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  function annotationFrameRatio(source) {
    if (state.annotationAspect === '16:9') return source.w >= source.h ? 16 / 9 : 9 / 16;
    if (state.annotationAspect === '16:9-landscape') return 16 / 9;
    return ASPECT_MAP[state.annotationAspect] || 0;
  }

  function getAnnotationCrop(source = getTransformedDims()) {
    annSyncView();
    const ratio = annotationFrameRatio(source);
    if (!ratio) return { x: 0, y: 0, w: source.w, h: source.h };

    const angle = state.fineAngle * Math.PI / 180;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const absCos = Math.abs(cos), absSin = Math.abs(sin);
    const fitHeight = Math.min(source.w / (ratio * absCos + absSin), source.h / (ratio * absSin + absCos));
    const h = fitHeight / state.annZoom, w = h * ratio;

    // Clamp in the photo's axes so a straightened image still fills the crop.
    const marginX = Math.max(0, (source.w - w * absCos - h * absSin) / 2);
    const marginY = Math.max(0, (source.h - w * absSin - h * absCos) / 2);
    const dx = (state.annCx - 0.5) * source.w, dy = (state.annCy - 0.5) * source.h;
    const u = annClamp(dx * cos + dy * sin, -marginX, marginX);
    const v = annClamp(-dx * sin + dy * cos, -marginY, marginY);
    const cx = source.w / 2 + u * cos - v * sin;
    const cy = source.h / 2 + u * sin + v * cos;
    state.annCx = cx / source.w;
    state.annCy = cy / source.h;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }

  function annotationStageView() {
    const source = getTransformedDims(), crop = getAnnotationCrop(source);
    const viewport = annViewport(crop);
    let frame;
    if (state.annotationAspect === 'original') {
      frame = annZoomRect(viewport);
    } else {
      const w = crop.w * viewport.kFit, h = crop.h * viewport.kFit;
      frame = { x: viewport.sx - w / 2, y: viewport.sy - h / 2, w, h };
    }
    const scale = frame.w / crop.w;
    return {
      frame, crop, source, scale,
      sx: viewport.sx, sy: viewport.sy,
      cx: frame.x + (source.w / 2 - crop.x) * scale,
      cy: frame.y + (source.h / 2 - crop.y) * scale,
      w: source.w * scale, h: source.h * scale
    };
  }

  function drawCroppedAnnotationLayer(targetCtx, cx, cy, scale, crop, teleAligned = false, editing = false) {
    if (editing) {
      annStageLay = null;
      annLastLay = null;
      state._annStats = null;
    }
    if (!state.markersVisible || !annHasOverlay() || crop.w <= 0 || crop.h <= 0) return;
    const dims = getTransformedDims();
    const w = dims.w * scale, h = dims.h * scale;
    const x0 = cx - w / 2, y0 = cy - h / 2;
    const normalizeEdge = value => {
      if (!crop.fitMarkers) return value;
      if (Math.abs(value) < 1e-8) return 0;
      if (Math.abs(value - 1) < 1e-8) return 1;
      return value;
    };
    const xInCrop = value => normalizeEdge((x0 + value * w - crop.x) / crop.w);
    const yInCrop = value => normalizeEdge((y0 + value * h - crop.y) / crop.h);
    const projected = [];
    for (const pin of state.annotations) {
      const nx = xInCrop(pin.nx), ny = yInCrop(pin.ny);
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) continue;
      if ((crop.openEdge === 'x' && nx === 1) || (crop.openEdge === 'y' && ny === 1)) continue;
      const clone = { ...pin, nx, ny };
      if (pin.lman) {
        clone.lx = xInCrop(pin.lx);
        clone.ly = yInCrop(pin.ly);
        clone.lman = clone.lx >= 0 && clone.lx <= 1 && clone.ly >= 0 && clone.ly <= 1;
      }
      projected.push(clone);
    }
    targetCtx.save();
    targetCtx.beginPath();
    targetCtx.rect(crop.x, crop.y, crop.w, crop.h);
    targetCtx.clip();
    const sourceFrame = {
      imgScreenW: w, imgScreenH: h, imgLeft: x0, imgTop: y0,
      baseUnit: Math.max(13 * scale, Math.min(w, h) * 0.030)
    };
    const frame = {
      cx: crop.x + crop.w / 2, cy: crop.y + crop.h / 2,
      imgScreenW: crop.w, imgScreenH: crop.h,
      imgLeft: crop.x, imgTop: crop.y, imgRight: crop.x + crop.w, imgBot: crop.y + crop.h,
      baseUnit: Math.max(13 * scale, Math.min(crop.w, crop.h) * 0.030),
      s: scale, teleAligned, fitMarkers: crop.fitMarkers, moonBox: annMoonBox(sourceFrame)
    };
    const lay = projected.length ? annLayout(targetCtx, projected, frame) : null;
    if (state.skyMode === 'moon') annDrawMoonRing(targetCtx, sourceFrame, lay);
    if (lay) {
      lay.items.slice().sort((a, b) => b.geom.R - a.geom.R).forEach(item => annDrawMarker(targetCtx, item));
      annDrawLabels(targetCtx, lay, frame);
      if (editing) {
        annDrawSelection(targetCtx, lay, frame);
        annLastLay = { lay, left: x0, top: y0, u: frame.baseUnit };
        annStageLay = annLastLay;
        state._annStats = lay.stats;
      }
    }
    targetCtx.restore();
  }

  // Where the image sits on screen right now (centre + size) for the current mode: used for pin hit-testing and dragging
  function annView() {
    if (state.appMode === 'annotate') return annotationStageView();
    const d = getTransformedDims();
    const c = getCropRect();
    return { cx: c.x + c.w / 2 + state.offsetX, cy: c.y + c.h / 2 + state.offsetY, w: d.w * state.scale, h: d.h * state.scale };
  }

  function drawAnnotatedFrame(targetCtx, frame, cx, cy, scale, editing = false) {
    targetCtx.save();
    targetCtx.beginPath();
    targetCtx.rect(frame.x, frame.y, frame.w, frame.h);
    targetCtx.clip();
    drawSourceTransformed(targetCtx, cx, cy, scale, false);
    drawCroppedAnnotationLayer(targetCtx, cx, cy, scale, frame, true, editing);
    targetCtx.translate(frame.x, frame.y);
    drawTelemetryOverlay(targetCtx, frame.w, frame.h);
    targetCtx.restore();
  }

  function renderAnnotateStage() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!state.img) return;
    const { frame: r, crop, source: d, scale: k, cx, cy, w, h } = annotationStageView();
    const imageRect = { x: cx - w / 2, y: cy - h / 2, w, h };
    state._annUI = true; state._annTele = true; state._annStats = null;
    try {
      drawAnnotatedFrame(ctx, r, cx, cy, k, true);
      ctx.save();
      ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
      ctx.translate(imageRect.x, imageRect.y);
      moonDrawGhost(ctx, imageRect.w, imageRect.h);
      ctx.restore();
    } finally { state._annUI = false; state._annTele = false; }
    (function () {
      const st = state._annStats, note = document.getElementById('annCrowdNote'), sep = document.getElementById('annCrowdSep');
      if (!note || !sep) return;
      let msg = '', tip = '';
      if (st && st.key) { msg = 'Numbered key'; tip = 'Too many labels to place without overlaps at a readable size: each marker carries a number and the key lists the names.'; }
      else if (st && st.crowded > 0) { msg = 'Crowded · lower Label size'; tip = 'Some labels could not be kept apart. Reduce the Label size slider in the Style tab or remove a few pins.'; }
      else if (st && st.mode === 'columns') { msg = 'Column layout'; tip = 'The field is crowded, so the labels are lined up in tidy columns beside the subject. Set Layout to Near target in the Style tab to change this.'; }
      else if (st && st.k && st.k < 1) { msg = 'Labels at ' + Math.round(st.k * 100) + '%'; tip = 'The labels were made a little smaller so that nothing overlaps.'; }
      else if (st && st.compact > 0) { msg = st.compact + (st.compact === 1 ? ' subtitle' : ' subtitles') + ' hidden'; tip = 'Subtitles are hidden on crowded labels so that nothing overlaps.'; }
      note.textContent = msg; note.title = tip;
      note.style.display = msg ? '' : 'none'; sep.style.display = msg ? '' : 'none';
    })();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = state.dpr;
    ctx.strokeRect(r.x - 0.5, r.y - 0.5, r.w + 1, r.h + 1);
    annDrawLoupe(imageRect, k);
    annSyncZoomButtons();
    updateAnnotationResolution(crop);
    const dimsEl = document.getElementById('resDims'), zoomEl = document.getElementById('resZoom');
    if (dimsEl) dimsEl.textContent = Math.round(d.w) + '×' + Math.round(d.h);
    if (zoomEl) { zoomEl.textContent = Math.round(k * 100) + '%'; zoomEl.classList.remove('warn'); }
    const q = document.getElementById('qDot'); if (q) q.classList.remove('warn');
  }

  // ===========================================================================================
  // ANNOTATION ENGINE
  //   look      every pin resolves to one look: marker shape, colours, typography, line weight
  //   geometry  each marker shape reports its outline, so a label can start from it or sit inside it
  //   layout    labels sit next to their targets; when that cannot be done without overlaps they are lined
  //             up in tidy columns beside the subject; as a last resort they become a numbered key
  //   painting  hairline markers, leaders and labels share one quiet look
  // ===========================================================================================
  const ANN_FONT = "'Inter', -apple-system, 'Segoe UI', Roboto, sans-serif";
  const ANN_STYLES = ['atlas', 'reticle', 'classic', 'brackets', 'fovbox', 'pointer', 'crosshair', 'pill'];
  const ANN_RING = { atlas: 1, reticle: 1, classic: 1 };
  const annHist = new Map();     // pin id + label size -> placement chosen last time (a label stays put, and does not flicker between sides, while a pin is dragged)
  const annCharW = new Map();    // glyph advance cache for letter-spaced text
  const annFontAsked = new Set();
  const ANN_GAPS = [0.5, 1.2, 2.0, 3.0, 4.2, 5.6, 7.2]; // label distance from the marker edge, in label units
  let annFontEpoch = 0, annLayKey = '', annLayVal = null;
  let annStageLay = null;        // the layout of the Annotate stage as last drawn (canvas pixels): what a finger can grab
  let annLastLay = null;         // the layout drawn last, with the origin of its picture: lets the Moon outline break around labels and markers
  const annV = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function annRgb(hex) {
    const h = String(hex || '').replace('#', ''), v = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    if (!/^[0-9a-fA-F]{6}$/.test(v)) return [203, 213, 225];
    return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
  }
  // colour mixed towards white by t, with alpha a
  function annMix(hex, t, a) {
    const c = annRgb(hex).map(x => Math.round(x * (1 - t) + 255 * t));
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a === undefined ? 1 : a) + ')';
  }
  function annTint(hex, t) { return annMix(hex, t, 1); }

  // ---- fonts: the canvas never loads a face by itself, so every face a pin uses is requested once
  function annWantFont(fam, wt) {
    const key = fam + '|' + wt;
    if (annFontAsked.has(key) || !document.fonts || typeof document.fonts.load !== 'function') return;
    annFontAsked.add(key);
    const first = String(fam).split(',')[0].trim();
    document.fonts.load(wt + ' 20px ' + first).then(() => {
      annFontEpoch++; annCharW.clear(); annLayKey = '';
      if (state.appMode === 'annotate' || state.appMode === 'slicer') renderCanvas();
    }).catch(() => {});
  }
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => { annFontEpoch++; annCharW.clear(); annLayKey = ''; });

  // ---- text with optional letter spacing (done glyph by glyph, so it behaves the same in every browser)
  function annW(ctx, txt, font, trk) {
    if (!txt) return 0;
    ctx.font = font;
    if (!(trk > 0)) return ctx.measureText(txt).width;
    let w = 0;
    for (const ch of txt) {
      const key = font + '\u0001' + ch;
      let cw = annCharW.get(key);
      if (cw === undefined) { cw = ctx.measureText(ch).width; if (annCharW.size > 6000) annCharW.clear(); annCharW.set(key, cw); }
      w += cw + trk;
    }
    return w - trk;
  }
  function annFit(ctx, txt, font, maxW, trk) {
    if (!txt) return txt;
    if (annW(ctx, txt, font, trk) <= maxW) return txt;
    let lo = 1, hi = txt.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (annW(ctx, txt.slice(0, mid) + '…', font, trk) <= maxW) lo = mid; else hi = mid - 1;
    }
    return txt.slice(0, lo) + '…';
  }
  function annDrawTxt(ctx, txt, x, y, trk, align, doStroke) {  // ctx.font is already set, baseline is 'top'
    const rx = Math.round(x), ry = Math.round(y);
    if (!(trk > 0)) {
      ctx.textAlign = align;
      if (doStroke) ctx.strokeText(txt, rx, ry);
      else ctx.fillText(txt, rx, ry);
      return;
    }
    const w = annW(ctx, txt, ctx.font, trk);
    let cx = align === 'right' ? rx - w : align === 'center' ? rx - w / 2 : rx;
    ctx.textAlign = 'left';
    for (const ch of txt) {
      if (doStroke) ctx.strokeText(ch, Math.round(cx), ry);
      else ctx.fillText(ch, Math.round(cx), ry);
      cx += ctx.measureText(ch).width + trk;
    }
  }

  // ---- look of one pin (everything has a default, so pins made by older code still draw)
  function annLook(a) {
    const wt = Number(a.fontWeight);
    return {
      style: ANN_STYLES.indexOf(a.style) >= 0 ? a.style : 'atlas',
      col: a.color || state.annDraftColor || '#EAF2FF',
      fam: a.fontFamily || state.annDraftFont || ANN_FONT,
      bg: a.bgStyle || 'shelf',
      wt: wt >= 100 && wt <= 900 ? wt : 600,
      upper: a.textCase === 'upper',
      track: Number.isFinite(a.track) ? annV(a.track, 0, 0.4) : 0,
      tmode: a.textMode || 'light',
      thex: a.textHex || '#FFFFFF',
      lw: Number.isFinite(a.lineMult) && a.lineMult > 0 ? a.lineMult : 1,
      inside: a.labelIn === 'in'
    };
  }
  function annTextCols(look, solid) {
    if (solid) return { t: '#070B14', s: 'rgba(7,11,20,0.82)' };
    if (look.tmode === 'dark') return { t: '#0A0F1A', s: 'rgba(10,15,26,0.84)' };
    if (look.tmode === 'marker') return { t: annMix(look.col, 0.3, 1), s: annMix(look.col, 0.18, 1) };
    if (look.tmode === 'custom') return { t: look.thex, s: annMix(look.thex, 0.08, 1) };
    return { t: '#F5F8FC', s: '#DCE6F4' };
  }

  // ---- marker geometry: R is the outline radius (or half size for boxes), mr the reach used for labels and leaders
  // loose = the size was fitted automatically (a crater among many), so the usual comfortable minimum is relaxed and markers can be small
  function annGeom(style, rad, u, lw, loose) {
    const mn = loose ? 0.14 : 0.5, mc = loose ? 0.14 : 0.55, mp = loose ? 0.2 : 0.3;
    switch (style) {
      case 'atlas': case 'reticle': { const R = Math.max(rad * 0.96, loose ? u * 0.14 : 0); return { kind: 'circle', R, mr: R + lw * 1.5 }; }
      case 'classic': { const R = Math.max(rad * 0.96, loose ? u * 0.14 : u * 0.16); return { kind: 'circle', R, mr: R + lw * 1.5 }; }
      case 'pointer': { const R = Math.min(u * 0.9, Math.max(u * mp, rad * 0.26)); return { kind: 'circle', R, mr: R + lw * 1.5 }; }
      case 'crosshair': { const R = Math.max(rad * 1.18, u * mn); return { kind: 'circle', R, mr: R + lw * 1.2 }; }
      case 'brackets': { const h = Math.max(rad * 1.02, u * mn); return { kind: 'box', hw: h, hh: h, R: h * 1.1, mr: h * 1.2 }; }
      case 'fovbox': { const h = Math.max(rad, u * mn); return { kind: 'box', hw: h * 1.18, hh: h * 0.92, R: h * 1.2, mr: h * 1.32 }; }
      case 'pill': { const R = Math.max(2, u * 0.17); return { kind: 'circle', R, mr: R + lw * 1.2 }; }
      default: return { kind: 'none', R: 0, mr: 0 };
    }
  }

  function fitSlicerMarker(item, frame) {
    const g = item.geom;
    if (g.kind === 'none') return item;
    const { px, py } = item, lw = item.lwDraw;
    const marginX = Math.min(px - frame.imgLeft, frame.imgRight - px);
    const marginY = Math.min(py - frame.imgTop, frame.imgBot - py);
    const halo = (lw + Math.max(1.4, lw * 1.1)) / 2 + 0.75;
    const halfW = g.kind === 'box' ? g.hw : g.R, halfH = g.kind === 'box' ? g.hh : g.R;
    const scale = Math.min((marginX - halo) / halfW, (marginY - halo) / halfH);
    if (scale >= 1) return item;
    if (scale * Math.min(halfW, halfH) >= Math.max(2, 2.5 * lw)) {
      item.geom = { ...g, R: g.R * scale, mr: g.mr * scale };
      if (g.kind === 'box') { item.geom.hw = g.hw * scale; item.geom.hh = g.hh * scale; }
      return item;
    }
    // At the seam a centered ring cannot fit. Put a compact marker inside and point to the true anchor.
    const radius = Math.min(Math.max(2, item.u * 0.31), Math.min(frame.imgScreenW, frame.imgScreenH) * 0.12);
    const line = Math.min(lw, Math.max(0.6, radius * 0.55));
    const inset = radius + (line + Math.max(1.4, line * 1.1)) / 2 + 1;
    item.anchor = { x: px, y: py };
    item.px = annV(px, frame.imgLeft + inset, frame.imgRight - inset);
    item.py = annV(py, frame.imgTop + inset, frame.imgBot - inset);
    item.lwDraw = item.lwPx = line;
    item.geom = { kind: 'circle', R: radius, mr: radius + 1.5 * line };
    item.look = { ...item.look, style: 'pointer', inside: false };
    return item;
  }
  // where a leader leaves the marker: on its outline, on the line towards (tx, ty)
  function annEdgePoint(it, tx, ty) {
    const g = it.geom, dx = tx - it.px, dy = ty - it.py, d = Math.sqrt(dx * dx + dy * dy);
    if (g.kind === 'none' || d < 1e-6) return null;
    const ux = dx / d, uy = dy / d;
    let r = g.kind === 'box' ? Math.min(g.hw / Math.max(Math.abs(ux), 1e-6), g.hh / Math.max(Math.abs(uy), 1e-6)) : g.R;
    r += it.lwPx * 0.8 + it.u * 0.07;
    if (d <= r + 1) return null;
    return { x: it.px + ux * r, y: it.py + uy * r };
  }
  // 0 = clear, 1 = the rectangle runs into the marker, 2 = wholly inside somebody else's big ring (allowed, but it reads as theirs)
  function annMarkerHit(o, L, T, R, B, tu, pad) {
    const g = o.geom;
    if (g.kind === 'none') return 0;
    const cx = o.px, cy = o.py;
    if (g.kind === 'circle') {
      const dx = Math.max(L - cx, 0, cx - R), dy = Math.max(T - cy, 0, cy - B), near = Math.sqrt(dx * dx + dy * dy);
      if (g.R >= 2.4 * tu) {                                              // a big ring: only its outline is in the way
        const fx = Math.max(Math.abs(L - cx), Math.abs(R - cx)), fy = Math.max(Math.abs(T - cy), Math.abs(B - cy)), far = Math.sqrt(fx * fx + fy * fy);
        if (near <= g.R + pad && far >= g.R - pad) return 1;
        return near < g.R - pad ? 2 : 0;
      }
      return near < g.mr + pad ? 1 : 0;
    }
    const bl = cx - g.hw, br = cx + g.hw, bt = cy - g.hh, bb = cy + g.hh;
    const ix = Math.min(R, br + pad) - Math.max(L, bl - pad), iy = Math.min(B, bb + pad) - Math.max(T, bt - pad);
    if (ix <= 0 || iy <= 0) return 0;
    if (Math.min(g.hw, g.hh) >= 2.4 * tu) return (L >= bl + pad && R <= br - pad && T >= bt + pad && B <= bb - pad) ? 2 : 1;
    return 1;
  }
  // A leader against somebody else's marker: 0 = clear, 1 = it runs through the marker or crosses its outline, 2 = it only leaves
  // the ring that encloses its own target (a star inside a nebula ring: unavoidable, so it is not counted as a crossing)
  function annSegMarker(seg, o, pad) {
    const g = o.geom;
    if (g.kind === 'none') return 0;
    const isBox = g.kind === 'box', R0 = isBox ? Math.min(g.hw, g.hh) : g.R, big = R0 >= 2.4 * o.tu, px = o.px, py = o.py;
    const ex = (isBox ? g.hw : big ? g.R : g.mr * 0.8) + pad, ey = (isBox ? g.hh : big ? g.R : g.mr * 0.8) + pad;
    if ((seg.x1 < px - ex && seg.x2 < px - ex) || (seg.x1 > px + ex && seg.x2 > px + ex) || (seg.y1 < py - ey && seg.y2 < py - ey) || (seg.y1 > py + ey && seg.y2 > py + ey)) return 0;   // nowhere near
    let A, B, touch;
    if (isBox) {
      A = Math.abs(seg.x1 - px) <= g.hw && Math.abs(seg.y1 - py) <= g.hh; B = Math.abs(seg.x2 - px) <= g.hw && Math.abs(seg.y2 - py) <= g.hh;
      touch = annSegRect(seg.x1, seg.y1, seg.x2, seg.y2, px - g.hw - pad, py - g.hh - pad, px + g.hw + pad, py + g.hh + pad);
    } else {
      const R2 = g.R * g.R, ax = seg.x1 - px, ay = seg.y1 - py, bx = seg.x2 - px, by = seg.y2 - py;
      A = ax * ax + ay * ay <= R2; B = bx * bx + by * by <= R2;
      const dx = seg.x2 - seg.x1, dy = seg.y2 - seg.y1, l2 = dx * dx + dy * dy;
      let t = l2 > 0 ? ((px - seg.x1) * dx + (py - seg.y1) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = seg.x1 + dx * t - px, qy = seg.y1 + dy * t - py, lim = (big ? g.R : g.mr * 0.8) + pad;
      touch = qx * qx + qy * qy < lim * lim;
    }
    if (!touch) return 0;
    if (A && B) return 0;                                           // wholly inside a big ring: allowed (it reads as theirs)
    if (A) return big ? 2 : 0;                                      // the target itself sits inside that ring
    return 1;
  }
  function annSegRect(x1, y1, x2, y2, l, t, r, b) {               // does a segment cross a rectangle? (Liang–Barsky)
    if ((x1 < l && x2 < l) || (x1 > r && x2 > r) || (y1 < t && y2 < t) || (y1 > b && y2 > b)) return false;
    let t0 = 0, t1 = 1, p, q, k;
    const dx = x2 - x1, dy = y2 - y1;
    p = -dx; q = x1 - l;
    if (p === 0) { if (q < 0) return false; } else { k = q / p; if (p < 0) { if (k > t1) return false; if (k > t0) t0 = k; } else { if (k < t0) return false; if (k < t1) t1 = k; } }
    p = dx; q = r - x1;
    if (p === 0) { if (q < 0) return false; } else { k = q / p; if (p < 0) { if (k > t1) return false; if (k > t0) t0 = k; } else { if (k < t0) return false; if (k < t1) t1 = k; } }
    p = -dy; q = y1 - t;
    if (p === 0) { if (q < 0) return false; } else { k = q / p; if (p < 0) { if (k > t1) return false; if (k > t0) t0 = k; } else { if (k < t0) return false; if (k < t1) t1 = k; } }
    p = dy; q = b - y1;
    if (p === 0) { if (q < 0) return false; } else { k = q / p; if (p < 0) { if (k > t1) return false; if (k > t0) t0 = k; } else { if (k < t0) return false; if (k < t1) t1 = k; } }
    return true;
  }
  function annSegCross(s, q) {                                    // do two segments cross each other?
    const o = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    return o(s.x1, s.y1, s.x2, s.y2, q.x1, q.y1) * o(s.x1, s.y1, s.x2, s.y2, q.x2, q.y2) < 0 &&
           o(q.x1, q.y1, q.x2, q.y2, s.x1, s.y1) * o(q.x1, q.y1, q.x2, q.y2, s.x2, s.y2) < 0;
  }

  // leaders that run through somebody else's label or marker, or cross another leader (a tidy layout has none)
  function annCrossings(places, items) {
    const segs = [];
    places.forEach(p => {
      if (!p || !p.rect || !p.end || (p.kind !== 'side' && p.kind !== 'badge')) return;
      const st = annEdgePoint(p.it, p.end.x, p.end.y);
      if (!st) return;
      if (p.kind === 'badge' && Math.hypot(p.end.x - st.x, p.end.y - st.y) <= p.it.u * 0.5) return;   // a badge that touches its marker has no line at all
      segs.push({ p, x1: st.x, y1: st.y, x2: p.end.x, y2: p.end.y });
    });
    let c = 0;
    for (let a = 0; a < segs.length; a++) {
      const s = segs[a], g = s.p.it.tu * 0.1;
      for (const q of places) {
        if (!q || !q.rect || q === s.p) continue;
        if (annSegRect(s.x1, s.y1, s.x2, s.y2, q.rect.l - g, q.rect.t - g, q.rect.l + q.rect.w + g, q.rect.t + q.rect.h + g)) c++;
      }
      for (const o of items) if (o !== s.p.it && annSegMarker(s, o, g) === 1) c++;
      for (let b = a + 1; b < segs.length; b++) if (annSegCross(s, segs[b])) c++;
    }
    return c;
  }

  // Areas covered by the telemetry bar / card / frame (only when they are drawn relative to the image)
  function annReserved(ctx, f) {
    const rects = []; let inset = 0;
    if (!f.teleAligned) return { rects, inset };
    const W = f.imgScreenW, H = f.imgScreenH, mode = state.telemetryMode, tu0 = Math.max(14, W * 0.022);
    const add = (x, y, w, h) => rects.push({ l: f.imgLeft + x, t: f.imgTop + y, r: f.imgLeft + x + w, b: f.imgTop + y + h });
    const title = (state.telemetryTitle || '').trim(), specs = (state.telemetrySpecs || '').trim(), badge = (state.telemetryCatalog || '').trim();
    if (mode !== 'off' && (title || specs || badge)) {
      if (mode === 'bar') add(0, H - tu0 * 4.2, W, tu0 * 4.2);
      else if (mode === 'top') add(0, 0, W, tu0 * 4.2);
      else if (mode === 'corner') {
        const fam = state.annDraftFont || ANN_FONT, sub = [specs, badge].filter(Boolean).join(' • ');
        ctx.save();
        ctx.font = '700 ' + Math.round(tu0 * 0.72) + 'px ' + fam; const tw = ctx.measureText(title).width;
        ctx.font = '600 ' + Math.round(tu0 * 0.56) + 'px ' + fam; const sw = ctx.measureText(sub).width;
        ctx.restore();
        const bw = Math.max(tw, sw) + tu0 * 1.65, bh = sub ? tu0 * 2.25 : tu0 * 1.45;
        add(tu0 * 0.95, H - bh - tu0 * 0.95, bw, bh);
      } else if (mode === 'frame') { inset = Math.round(tu0 * 0.95); add(0, H - tu0 * 3.6, W, tu0 * 3.6); }
    }
    return { rects, inset };
  }
  // the lunar disc on screen (Moon mode only): labels of a Moon are kept off the disc
  function annMoonBox(f) {
    const m = state.moon;
    if (!m || state.skyMode !== 'moon' || !m.fit || !m.ww || moonIsStale()) return null;
    const kx = f.imgScreenW / m.ww, ky = f.imgScreenH / m.wh, c = m.fit;
    return { l: f.imgLeft + (c.cx - c.R) * kx, r: f.imgLeft + (c.cx + c.R) * kx, t: f.imgTop + (c.cy - c.R) * ky, b: f.imgTop + (c.cy + c.R) * ky };
  }

  // ---- one item per pin: its look, its marker and the measured size of its label
  function annBuildItems(ctx, anns, f, K, bl, br) {
    const u = f.baseUnit, tu = u * K, showSub = state.annShowSub !== false, maxW = Math.max(tu * 6, (br - bl) * 0.46), fs0 = f.s || 1;
    ctx.save();
    const items = anns.map((a, i) => {
      const look = annLook(a);
      const tF = Math.max(7 * fs0, tu * 0.70), sF = Math.max(6 * fs0, tF * 0.78);                // (not rounded: the layout then looks the same at any picture size)
      const flat = (look.bg === 'shelf' || look.bg === 'pure') && look.style !== 'pill';
      const padX = (flat ? 0.1 : 0.5) * tu, padY = (flat ? 0.1 : 0.3) * tu;
      const dotPad = 0;
      const tfont = look.wt + ' ' + tF + 'px ' + look.fam, sfont = Math.max(400, look.wt - 100) + ' ' + sF + 'px ' + look.fam;
      const trkT = look.track * tF, trkS = look.track * sF * 0.5;
      const raw = (a.title || '').trim(), t0 = look.upper ? raw.toUpperCase() : raw, s0 = showSub ? (a.sub || '').trim() : '';
      const room = maxW - padX * 2 - dotPad;
      const title = annFit(ctx, t0, tfont, room, trkT), sub = annFit(ctx, s0, sfont, room, trkS);
      const tw = title ? annW(ctx, title, tfont, trkT) : 0, sw = sub ? annW(ctx, sub, sfont, trkS) : 0;
      const hT = (title ? tF * 1.22 : 0) + padY * 2;
      const pos = v => (Number.isFinite(+v) && +v > 0 ? +v : 1);        // old or hand-edited data can hold odd numbers
      const rad = u * 1.05 * pos(a.radMult) * pos(a.sizeMult);
      const lwPx = Math.max(1.1 * fs0, u * 0.05) * look.lw;            // used for the geometry: it scales with the picture, so a small preview is a true miniature
      const lwDraw = Math.max(lwPx, 1);                                  // what is painted never gets thinner than a pixel
      annWantFont(look.fam, look.wt); annWantFont(look.fam, Math.max(400, look.wt - 100));
      const item = {
        i, a, look, tu, u, tF, sF, tfont, sfont, trkT, trkS, padX, padY, dotPad, title, sub, lwPx, lwDraw, rad, tw, sw,
        geom: annGeom(look.style, rad, u, lwPx, !!a.autoR), hasLabel: !!(title || sub),
        px: f.cx + (a.nx - 0.5) * f.imgScreenW, py: f.cy + (a.ny - 0.5) * f.imgScreenH,
        w: Math.max(tw, sw) + padX * 2 + dotPad, h: hT + (sub ? sF * 1.34 : 0),
        wC: tw + padX * 2 + dotPad, hC: hT, canCompact: !!(title && sub)    // compact = title only, used when the field is crowded
      };
      return f.fitMarkers ? fitSlicerMarker(item, f) : item;
    });
    ctx.restore();
    return items;
  }

  // Labels the person has dragged somewhere keep their spot (kept inside the picture); every other label is laid out around them.
  // They are taken out of the automatic layouts (hasLabel = false) and put back into the result as ordinary side labels.
  function annManual(items, f, bnd, tu, rsv) {
    const m = tu * 0.35, rects = [];
    items.forEach(it => {
      const a = it.a;
      if (!it.hasLabel || !a.lman || !Number.isFinite(+a.lx) || !Number.isFinite(+a.ly)) return;
      const w = it.w, h = it.h;
      const L = annV(f.imgLeft + (+a.lx) * f.imgScreenW - w / 2, bnd.l + m, Math.max(bnd.l + m, bnd.r - m - w));
      const T = annV(f.imgTop + (+a.ly) * f.imgScreenH - h / 2, bnd.t + m, Math.max(bnd.t + m, bnd.b - m - h));
      const end = annLeaderEnd(it, L, T, w, h), st = annEdgePoint(it, end.x, end.y);
      it.man = { L, T, w, h, end, seg: st ? { x1: st.x, y1: st.y, x2: end.x, y2: end.y } : null, place: { it, kind: 'side', compact: false, rect: { l: L, t: T, w, h }, end } };
      it.hasLabel = false;
      rects.push({ l: L, t: T, r: L + w, b: T + h });
    });
    return rects.length ? { rects: rsv.rects.concat(rects), inset: rsv.inset } : rsv;
  }

  // where the leader of a label ends: on the edge of the label that faces the marker (the near end of its shelf)
  function annLeaderEnd(it, L, T, w, h) {
    const onRight = L + w / 2 >= it.px, above = T + h / 2 <= it.py;
    const x = it.px >= L && it.px <= L + w ? annV(it.px, L + Math.min(it.padX, w / 2), L + w - Math.min(it.padX, w / 2)) : (onRight ? L : L + w);
    return { x, y: above ? T + h : T, onRight, above };
  }
  // the spots inside a ring where a w×h block fits (rim first, then the middle)
  function annInsideSpots(it, w, h) {
    const g = it.geom;
    if (!ANN_RING[it.look.style]) return [];
    const tk = it.look.style === 'classic' ? Math.min(g.R * 0.28, it.u * 0.34) : 0;
    const Rin = g.R - it.lwPx * 1.5 - tk - it.tu * 0.12;
    if (Rin <= 0 || w / 2 > Rin) return [];
    const dyMax = Math.sqrt(Math.max(0, Rin * Rin - (w / 2) * (w / 2))) - h / 2;
    if (dyMax < 0) return [];
    const top = it.a.dir === 'tr' || it.a.dir === 'tl', out = [];
    const add = (dy, base) => out.push({ L: it.px - w / 2, T: it.py + dy - h / 2, base });
    if (dyMax > h * 0.3) { add((top ? -1 : 1) * dyMax * 0.9, -4); add((top ? 1 : -1) * dyMax * 0.9, -3.4); }
    add(0, -2.8);
    return out;
  }

  // ---------------------------------------------------------------------------------------------
  // layout 1: labels next to their targets
  // ---------------------------------------------------------------------------------------------
  function annFloat(items, bnd, rsv, tu, fast) {
    const n = items.length, m = tu * 0.35, gapPx = tu * 0.12, bl = bnd.l, br = bnd.r, bt = bnd.t, bb = bnd.b;
    let rects = new Array(n).fill(null), chosen = new Array(n).fill(null);
    const seedManual = () => items.forEach(it => {                  // a label put somewhere by hand stays there; the others are laid out around it
      const q = it.man;
      if (!q) return;
      rects[it.i] = { l: q.L, t: q.T, r: q.L + q.w, b: q.T + q.h };
      chosen[it.i] = { L: q.L, T: q.T, w: q.w, h: q.h, kind: 'side', key: 'man', lvl: 0, pen: 0, hard: 0, mk: 0, lead: 0, seg: q.seg, end: q.end };
    });
    seedManual();
    const ovl = (L, T, R, B, q) => {
      const ow = Math.min(R + gapPx, q.r) - Math.max(L - gapPx, q.l), oh = Math.min(B + gapPx, q.b) - Math.max(T - gapPx, q.t);
      return ow > 0 && oh > 0 ? ow * oh / (tu * tu) : 0;
    };
    const hardOf = (it, L, T, w, h) => {                            // other labels and reserved areas under the candidate
      const R = L + w, B = T + h; let hard = 0;
      for (let j = 0; j < n; j++) { const q = rects[j]; if (q && j !== it.i) { const ov = ovl(L, T, R, B, q); if (ov > 0) hard += 40 + ov * 40; } }
      for (const q of rsv.rects) { const ov = ovl(L, T, R, B, q); if (ov > 0) hard += 24 + ov * 30; }
      return hard;
    };
    const markOf = (it, L, T, w, h, kind) => {                      // markers under the candidate
      const R = L + w, B = T + h; let pen = 0;
      for (const o of items) {
        if (o.geom.kind === 'none' || (o === it && kind === 'inside')) continue;
        const hit = annMarkerHit(o, L, T, R, B, tu, o === it ? tu * 0.14 : tu * 0.3);
        pen += hit === 1 ? 30 : hit === 2 ? 1.6 : 0;
      }
      return pen;
    };
    const proxR = tu * 0.34;                                        // soft: labels (and the lines on their edges) that sit nearly touching look merged, so room is preferred wherever it exists
    const proxOf = (it, L, T, w, h) => {
      const R = L + w, B = T + h; let pen = 0;
      for (let j = 0; j < n; j++) {
        const q = rects[j]; if (!q || j === it.i) continue;
        const dx = Math.max(L - q.r, q.l - R, 0), dy = Math.max(T - q.b, q.t - B, 0);
        if (dx >= proxR || dy >= proxR) continue;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < proxR) pen += (proxR - d) / tu * 5;
      }
      return pen;
    };
    const lg = tu * 0.16;                                           // clearance kept between a leader and anybody else's label
    const leadOf = (it, L, T, w, h, kind) => {
      if (kind !== 'side') return { lead: 0, seg: null, end: null };
      const end = annLeaderEnd(it, L, T, w, h), st = annEdgePoint(it, end.x, end.y);
      if (!st) return { lead: 0, seg: null, end };
      const seg = { x1: st.x, y1: st.y, x2: end.x, y2: end.y };
      let lead = 0;
      for (let j = 0; j < n; j++) {
        if (j === it.i) continue;
        const q = rects[j], c = chosen[j];
        if (q && annSegRect(seg.x1, seg.y1, seg.x2, seg.y2, q.l - lg, q.t - lg, q.r + lg, q.b + lg)) lead += 14;
        if (c && c.seg && annSegCross(seg, c.seg)) lead += 12;
        const sm = annSegMarker(seg, items[j], tu * 0.1);
        if (sm === 1) lead += 10; else if (sm === 2) lead += 2.5;
      }
      return { lead, seg, end };
    };
    const underLeaders = (it, L, T, w, h) => {                      // the other way round: this label sitting on somebody else's leader
      let pen = 0;
      for (let j = 0; j < n; j++) {
        const c = chosen[j];
        if (j !== it.i && c && c.seg && annSegRect(c.seg.x1, c.seg.y1, c.seg.x2, c.seg.y2, L - lg, T - lg, L + w + lg, T + h + lg)) pen += 14;
      }
      return pen;
    };
    const isBad = c => !c || c.hard > 0 || c.mk >= 12 || c.lead >= 10;
    const placeOne = it => {
      const px = it.px, py = it.py, hist = (state.draggingPinId || state.draggingLabelId) ? annHist.get(it.a.id + '@' + Math.round(tu * 100)) : undefined;   // only while a pin is held: calmer on screen, and the finished layout never depends on what happened before
      const p0 = ({ tr: -45, tl: -135, br: 45, bl: 135 })[it.a.dir || 'tr'];
      const ang0 = p0 === undefined ? -45 : p0;
      let best = null;
      const consider = (l, t, w, h, kind, base, key, lvl) => {
        const L = annV(l, bl + m, Math.max(bl + m, br - m - w)), T = annV(t, bt + m, Math.max(bt + m, bb - m - h));
        let pen = base + (Math.abs(L - l) + Math.abs(T - t)) / tu * 6 - (hist && hist.key === key ? 3.5 : 0);
        if (best && pen >= best.pen) return;
        const hard = hardOf(it, L, T, w, h); pen += hard;
        if (best && pen >= best.pen) return;
        if (kind === 'side') { pen += proxOf(it, L, T, w, h); if (best && pen >= best.pen) return; }   // (a label inside its own ring stays where it is wanted)
        const mk = markOf(it, L, T, w, h, kind); pen += mk;
        if (best && pen >= best.pen) return;
        const ld = leadOf(it, L, T, w, h, kind), ul = underLeaders(it, L, T, w, h); pen += ld.lead + ul;
        if (!best || pen < best.pen) best = { L, T, w, h, kind, key, lvl, pen, hard, mk, lead: ld.lead + ul, seg: ld.seg, end: ld.end };
      };
      const ring = (lvl, g0, g1, extra) => {
        const w = lvl ? it.wC : it.w, h = lvl ? it.hC : it.h, mr = it.geom.mr;
        for (let k = 0; k < 16; k++) {
          const ang = (ang0 + k * 22.5) * Math.PI / 180, c = Math.cos(ang), s = Math.sin(ang), dev = Math.min(k, 16 - k) * 0.6, level = Math.abs(s) < 0.2 ? 0.8 : 0;
          for (let gi = g0; gi < g1; gi++) {
            const d = mr + ANN_GAPS[gi] * tu, ax = px + c * d, ay = py + s * d;
            consider(c > 0.35 ? ax : c < -0.35 ? ax - w : ax - w / 2, s > 0.35 ? ay : s < -0.35 ? ay - h : ay - h / 2, w, h, 'side', extra + dev + level + gi * 2.2, k + ':' + gi + ':' + lvl, lvl);
          }
        }
      };
      let keep = false;                                               // while a pin is held, a label that is still fine where it was a moment ago stays exactly there
      if (hist && Math.abs(hist.w - (hist.lvl ? it.wC : it.w)) < 0.5 && Math.abs(hist.h - (hist.lvl ? it.hC : it.h)) < 0.5 && (hist.kind !== 'inside' || it.look.inside) && (!hist.lvl || it.canCompact)) {
        consider(px + hist.dx, py + hist.dy, hist.w, hist.h, hist.kind, 0, hist.key, hist.lvl);
        keep = !isBad(best);
      }
      if (!keep) {
        if (it.look.inside) {
          for (const lv of (it.canCompact ? [0, 1] : [0])) {
            const w = lv ? it.wC : it.w, h = lv ? it.hC : it.h;
            annInsideSpots(it, w, h).forEach((sp, si) => consider(sp.L, sp.T, w, h, 'inside', sp.base + lv * 3, 'in:' + si + ':' + lv, lv));
          }
        }
        ring(0, 0, 2, 0);                                             // 1) close to the marker
        if (isBad(best)) ring(0, 2, 5, 0);                            // 2) crowded: a longer leader
        if (isBad(best) && it.canCompact) ring(1, 0, 5, 5);           // 3) still crowded: title only
        if (isBad(best)) ring(0, 5, 7, 3);                            // 4) far away rather than on top of something
      }
      if (!best) best = { L: bl + m, T: bt + m, w: it.w, h: it.h, kind: 'side', key: 'x', lvl: 0, pen: 1e9, hard: 1, mk: 0, lead: 0, seg: null, end: null };
      rects[it.i] = { l: best.L, t: best.T, r: best.L + best.w, b: best.T + best.h };
      chosen[it.i] = best;
    };
    const live = items.filter(it => it.hasLabel);
    const baseOrder = live.slice().sort((p, q) => q.w * q.h - p.w * p.h);
    const refresh = () => {
      const bad = [];
      live.forEach(it => {
        const c = chosen[it.i];
        c.hard = hardOf(it, c.L, c.T, c.w, c.h); c.mk = markOf(it, c.L, c.T, c.w, c.h, c.kind);
        const ld = leadOf(it, c.L, c.T, c.w, c.h, c.kind); c.lead = ld.lead + underLeaders(it, c.L, c.T, c.w, c.h); c.seg = ld.seg; c.end = ld.end;
        if (isBad(c)) bad.push(it);
      });
      return bad;
    };
    const maxPass = Math.min(fast ? 2 : 6, live.length <= 40 ? 6 : live.length <= 100 ? 4 : 2);
    const solve = ord => {                                          // greedy placement, then repeated repair of whatever is still in trouble
      rects = new Array(n).fill(null); chosen = new Array(n).fill(null); seedManual();
      ord.forEach(placeOne);
      for (let p = 0; p < maxPass; p++) {
        const todo = refresh();
        if (!todo.length) break;
        todo.sort((p1, q1) => (chosen[q1.i].hard + chosen[q1.i].mk + chosen[q1.i].lead) - (chosen[p1.i].hard + chosen[p1.i].mk + chosen[p1.i].lead));
        todo.forEach(placeOne);
      }
      const bad = refresh();
      let conflicts = 0, lead = 0;
      bad.forEach(it => { const c = chosen[it.i]; if (c.hard > 0 || c.mk >= 12) conflicts++; else lead += c.lead; });
      return { rects, chosen, bad, conflicts, lead };
    };
    let best = solve(baseOrder);
    if ((best.conflicts || best.bad.length) && best.bad.length <= 4 && live.length <= 40 && !fast) {  // a few more tries in which the troubled labels choose first (always the same seed, so the result is repeatable); a hopelessly crowded field is not worth them
      let seed = (2166136261 ^ live.length) >>> 0;
      const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      const tries = live.length <= 16 ? 8 : live.length <= 30 ? 4 : 2;
      for (let r = 0; r < tries && (best.conflicts || best.bad.length); r++) {
        const first = best.bad.slice();
        for (let k = first.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); const tmp = first[k]; first[k] = first[j]; first[j] = tmp; }
        const rest = baseOrder.filter(it => first.indexOf(it) < 0);
        if (r > 0) for (let k = 0; k < rest.length - 1; k++) if (rnd() < 0.25) { const j = Math.min(rest.length - 1, k + 1 + Math.floor(rnd() * 3)); const tmp = rest[k]; rest[k] = rest[j]; rest[j] = tmp; }
        const res = solve(first.concat(rest));
        if (res.conflicts < best.conflicts || (res.conflicts === best.conflicts && (res.bad.length < best.bad.length || (res.bad.length === best.bad.length && res.lead < best.lead)))) best = res;
      }
    }
    rects = best.rects; chosen = best.chosen;
    const conflicts = best.conflicts;
    let nCompact = 0;
    const places = items.map(it => {
      const c = chosen[it.i];
      if (!c || it.man) return null;
      if (c.key !== 'x') annHist.set(it.a.id + '@' + Math.round(tu * 100), { id: it.a.id, key: c.key, dx: c.L - it.px, dy: c.T - it.py, w: c.w, h: c.h, kind: c.kind, lvl: c.lvl });
      if (c.lvl) nCompact++;
      return { it, kind: c.kind, compact: !!c.lvl, rect: { l: c.L, t: c.T, w: c.w, h: c.h }, end: c.kind === 'side' ? c.end : null };
    });
    return { places, conflicts, compact: nCompact, mode: 'near' };
  }

  // ---------------------------------------------------------------------------------------------
  // layout 2: tidy columns beside the subject. Every label gets its own row, so nothing can overlap.
  // Rows are given out by an optimal assignment (Hungarian method): each label takes the free row closest to its target.
  // ---------------------------------------------------------------------------------------------
  function annAssign(cost, n, m) {                                  // n rows, m columns (n <= m); returns the column chosen for each row
    const INF = 1e18, u = new Float64Array(n + 1), v = new Float64Array(m + 1), p = new Int32Array(m + 1), way = new Int32Array(m + 1);
    for (let i = 1; i <= n; i++) {
      p[0] = i; let j0 = 0;
      const minv = new Float64Array(m + 1).fill(INF), used = new Uint8Array(m + 1);
      do {
        used[j0] = 1;
        const i0 = p[j0]; let delta = INF, j1 = 0;
        for (let j = 1; j <= m; j++) {
          if (used[j]) continue;
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
        for (let j = 0; j <= m; j++) { if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta; }
        j0 = j1;
      } while (p[j0] !== 0);
      do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
    }
    const ans = new Array(n);
    for (let j = 1; j <= m; j++) if (p[j]) ans[p[j] - 1] = j - 1;
    return ans;
  }
  function annColumns(items, bnd, rsv, f, tu) {
    const live = items.filter(it => it.hasLabel), n = live.length;
    const out = { places: new Array(items.length).fill(null), conflicts: 0, compact: 0, mode: 'columns' };
    if (!n) return out;
    const m = tu * 0.35, gapRow = tu * 0.2, gapCol = tu * 0.9;
    let sl = Infinity, sr = -Infinity;
    for (const it of items) { sl = Math.min(sl, it.px - it.geom.mr); sr = Math.max(sr, it.px + it.geom.mr); }
    const moon = annMoonBox(f);
    if (moon) { sl = Math.min(sl, moon.l); sr = Math.max(sr, moon.r); }
    const split = (sl + sr) / 2, yTop = bnd.t + m, yBot = bnd.b - m;
    let result = null;
    for (const compact of [false, true]) {
      if (compact && !live.some(it => it.canCompact)) break;
      const wOf = it => (compact && it.canCompact ? it.wC : it.w), hOf = it => (compact && it.canCompact ? it.hC : it.h);
      const hRow = Math.max.apply(null, live.map(hOf)), pitch = hRow + gapRow;
      const nSlots = Math.max(0, Math.floor((yBot - yTop + gapRow) / pitch));
      if (nSlots < 1) continue;
      const y0 = yTop + ((yBot - yTop) - (nSlots * pitch - gapRow)) / 2, slotCy = k => y0 + k * pitch + hRow / 2;
      let L = [], R = [];
      live.forEach(it => (it.px < split ? L : R).push(it));
      const spill = (from, to) => {                                   // an overfull side hands its innermost labels to the other one
        from.sort((a, b) => Math.abs(a.px - split) - Math.abs(b.px - split));
        while (from.length > nSlots && to.length < nSlots) to.push(from.shift());
      };
      if (L.length > nSlots) spill(L, R); else if (R.length > nSlots) spill(R, L);
      if (L.length > nSlots || R.length > nSlots) continue;
      const wMax = list => list.length ? Math.max.apply(null, list.map(wOf)) : 0;
      const wL = wMax(L), wR = wMax(R);
      const xInL = annV(sl - gapCol, bnd.l + m + wL, bnd.r - m);       // the edge of each column that faces the subject
      const xInR = annV(sr + gapCol, bnd.l + m, bnd.r - m - wR);
      const rectAt = (it, side, s) => {
        const w = wOf(it), h = hOf(it), cy = slotCy(s);
        return { l: side === 'L' ? xInL - w : xInR, t: cy - h / 2, w, h, cy };
      };
      const solve = (list, side) => {
        if (!list.length) return [];
        const cost = list.map(it => {
          const row = new Float64Array(nSlots);
          for (let s = 0; s < nSlots; s++) {
            const r = rectAt(it, side, s);
            let c = Math.abs(r.cy - it.py) / tu;
            for (const q of rsv.rects) if (r.l < q.r && r.l + r.w > q.l && r.t < q.b && r.t + r.h > q.t) c += 500;
            for (const o of items) { if (annMarkerHit(o, r.l, r.t, r.l + r.w, r.t + r.h, tu, tu * 0.2) === 1) c += o === it ? 40 : 90; }
            row[s] = c;
          }
          return row;
        });
        return annAssign(cost, list.length, nSlots);
      };
      const aL = solve(L, 'L'), aR = solve(R, 'R');
      const segOf = (it, side, s) => {
        const r = rectAt(it, side, s), ex = side === 'L' ? xInL : xInR, ey = r.t + r.h, st = annEdgePoint(it, ex, ey);
        return st ? { x1: st.x, y1: st.y, x2: ex, y2: ey } : null;
      };
      // fewer crossing leaders: swap rows of two labels of one side whenever that removes crossings
      const untangle = (list, assign, side) => {
        const segs = () => list.map((it, i) => segOf(it, side, assign[i]));
        const crossings = ss => { let c = 0; for (let a = 0; a < ss.length; a++) for (let b = a + 1; b < ss.length; b++) if (ss[a] && ss[b] && annSegCross(ss[a], ss[b])) c++; return c; };
        let cur = crossings(segs());
        for (let pass = 0; pass < 3 && cur > 0; pass++) {
          let improved = false;
          for (let a = 0; a < list.length && cur > 0; a++) for (let b = a + 1; b < list.length && cur > 0; b++) {
            const t = assign[a]; assign[a] = assign[b]; assign[b] = t;
            const c2 = crossings(segs());
            if (c2 < cur) { cur = c2; improved = true; } else { const t2 = assign[a]; assign[a] = assign[b]; assign[b] = t2; }
          }
          if (!improved) break;
        }
      };
      if (n <= 60) { untangle(L, aL, 'L'); untangle(R, aR, 'R'); }
      const places = new Array(items.length).fill(null);
      let conflicts = 0;
      const put = (list, assign, side) => list.forEach((it, i) => {
        const r = rectAt(it, side, assign[i]), seg = segOf(it, side, assign[i]);
        let bad = false;
        for (const o of items) if (annMarkerHit(o, r.l, r.t, r.l + r.w, r.t + r.h, tu, tu * 0.2) === 1) { bad = true; break; }
        if (!bad) for (const q of rsv.rects) if (r.l < q.r && r.l + r.w > q.l && r.t < q.b && r.t + r.h > q.t) { bad = true; break; }
        if (bad) conflicts++;
        places[it.i] = { it, kind: 'side', compact: compact && it.canCompact, rect: { l: r.l, t: r.t, w: r.w, h: r.h }, end: seg ? { x: seg.x2, y: seg.y2, onRight: side === 'R', above: true } : null };
      });
      put(L, aL, 'L'); put(R, aR, 'R');
      const cand = { places, conflicts, compact: compact ? live.filter(it => it.canCompact).length : 0, mode: 'columns' };
      if (!result || cand.conflicts < result.conflicts) result = cand;
      if (conflicts === 0) break;
    }
    if (!result) { out.conflicts = Infinity; return out; }
    return result;
  }

  // ---------------------------------------------------------------------------------------------
  // layout 3 (last resort): numbered badges on the markers and one tidy key listing the names
  // ---------------------------------------------------------------------------------------------
  function annLegend(ctx, items, bnd, rsv, f, K) {
    const live = items.filter(it => it.hasLabel);
    const out = { places: new Array(items.length).fill(null), conflicts: 0, compact: 0, mode: 'key', key: null };
    if (!live.length) return out;
    const u = f.baseUnit, tu = u * K, m = tu * 0.35;
    const fs0 = f.s || 1, tF = Math.max(7 * fs0, tu * 0.62), bF = Math.max(6 * fs0, tF * 0.86);
    const fam = live[0].look.fam, wt = live[0].look.wt;
    const nFont = '600 ' + bF + 'px ' + fam, rFont = Math.max(400, wt - 100) + ' ' + tF + 'px ' + fam;
    const rowH = tF * 1.34, pad = tF * 0.7, colGap = tF * 1.6;
    ctx.save();
    const numW = annW(ctx, String(items.length), '600 ' + tF + 'px ' + fam, 0) + tF * 0.8;
    const maxTxt = Math.max(tu * 5, (bnd.r - bnd.l) * 0.3);
    const rows = live.map(it => {
      const raw = String(it.a.title || '').trim();
      return { it, n: it.i + 1, txt: annFit(ctx, (it.look.upper ? raw.toUpperCase() : raw) || ('Target ' + (it.i + 1)), rFont, maxTxt, 0) };
    });
    rows.forEach(r => { r.w = annW(ctx, r.txt, rFont, 0); });
    ctx.restore();
    const colW = numW + Math.max.apply(null, rows.map(r => r.w));
    const W = bnd.r - bnd.l - 2 * m, H = bnd.b - bnd.t - 2 * m;
    let cols = 1;
    for (; cols < 8; cols++) {
      const perCol = Math.ceil(rows.length / cols);
      if (perCol * rowH + pad * 2 <= H * 0.36 && cols * colW + (cols - 1) * colGap + pad * 2 <= W) break;
    }
    const perCol = Math.ceil(rows.length / cols), kw = cols * colW + (cols - 1) * colGap + pad * 2, kh = perCol * rowH + pad * 2;
    // the corner (or edge) of the picture where the key hides the fewest markers
    const spots = [
      { l: bnd.l + m, t: bnd.b - m - kh }, { l: bnd.r - m - kw, t: bnd.b - m - kh }, { l: bnd.l + m, t: bnd.t + m }, { l: bnd.r - m - kw, t: bnd.t + m },
      { l: (bnd.l + bnd.r - kw) / 2, t: bnd.b - m - kh }, { l: (bnd.l + bnd.r - kw) / 2, t: bnd.t + m }
    ];
    let spot = spots[0], bestHide = Infinity;
    spots.forEach(sp => {
      let hide = 0;
      for (const it of items) if (it.px > sp.l - it.geom.mr && it.px < sp.l + kw + it.geom.mr && it.py > sp.t - it.geom.mr && it.py < sp.t + kh + it.geom.mr) hide++;
      for (const q of rsv.rects) if (sp.l < q.r && sp.l + kw > q.l && sp.t < q.b && sp.t + kh > q.t) hide += 100;
      if (hide < bestHide) { bestHide = hide; spot = sp; }
    });
    const keyRect = { l: spot.l, t: spot.t, w: kw, h: kh };
    // badges: placed like small labels, with the key counted as a reserved area
    const bw = tF * 1.9, bh = bF * 1.5;
    const badgeItems = live.map(it => Object.assign({}, it, {
      w: bw, h: bh, wC: bw, hC: bh, canCompact: false, padX: 0, padY: 0, hasLabel: true, tu: tF * 0.9,
      look: Object.assign({}, it.look, { inside: false, style: it.look.style === 'pill' ? 'atlas' : it.look.style })
    }));
    badgeItems.forEach(b => { if (b.geom.kind === 'none') b.geom = { kind: 'circle', R: tF * 0.2, mr: tF * 0.3 }; });
    const rsv2 = { rects: rsv.rects.concat([{ l: keyRect.l, t: keyRect.t, r: keyRect.l + kw, b: keyRect.t + kh }]), inset: rsv.inset };
    const fl = annFloat(badgeItems.map((b, i) => Object.assign(b, { i })), bnd, rsv2, tF * 0.9);
    fl.places.forEach((pl, k) => {
      if (!pl) return;
      const it = live[k];
      out.places[it.i] = { it, kind: 'badge', compact: false, rect: pl.rect, end: pl.end, num: it.i + 1, bF };
    });
    out.conflicts = fl.conflicts;
    out.key = { rect: keyRect, rows, cols, perCol, colW, rowH, pad, colGap, numW, tF, nFont, rFont };
    return out;
  }

  // ---------------------------------------------------------------------------------------------
  // layout: choose between the three
  // ---------------------------------------------------------------------------------------------
  function annLayout(ctx, anns, f) {
    const rsv = annReserved(ctx, f);
    const bnd = { l: f.imgLeft + rsv.inset, r: f.imgRight - rsv.inset, t: f.imgTop + rsv.inset, b: f.imgBot - rsv.inset };
    const mode = state.annLayoutMode === 'near' || state.annLayoutMode === 'columns' ? state.annLayoutMode : 'auto';
    const K0 = state.annLabelScale || 1;
    const mb = f.ignoreMoonDisc ? null : (f.moonBox ?? annMoonBox(f)), fast = !!(state.draggingPinId || state.draggingLabelId);   // while a pin or a label is held the layout is solved quickly; on release it is solved properly
    const sig = [fast ? 1 : 0, f.cx.toFixed(1), f.cy.toFixed(1), f.imgScreenW.toFixed(1), f.imgScreenH.toFixed(1), f.baseUnit.toFixed(2), (f.s || 1).toFixed(3), f.teleAligned ? 1 : 0, f.fitMarkers ? 1 : 0, mode, K0, state.annShowSub !== false ? 1 : 0, annFontEpoch,
      rsv.inset, rsv.rects.map(r => [r.l, r.t, r.r, r.b].map(v => Math.round(v)).join(',')).join(';'), mb ? [mb.l, mb.t, mb.r, mb.b].map(v => Math.round(v)).join(',') : ''];
    const key = sig.join('|') + '#' + anns.map(a => [a.id, a.nx.toFixed(4), a.ny.toFixed(4), a.title, a.sub, a.style, a.color, a.fontFamily, a.bgStyle, a.dir, a.sizeMult, a.radMult, a.autoR ? 1 : 0, a.fontWeight, a.textCase, a.track, a.textMode, a.textHex, a.lineMult, a.labelIn, a.lman ? (+a.lx).toFixed(4) + ',' + (+a.ly).toFixed(4) : ''].join('~')).join('^');
    const cache = f.layoutCache;
    if (cache && key === cache.key) return cache.layout;
    if (!cache && key === annLayKey && annLayVal) return annLayVal;

    const scales = mode === 'near' ? [1] : [1, 0.88, 0.76, 0.66];
    let best = null;
    const consider = res => {                                       // overlaps count most; a leader crossing anything counts too
      res.cross = annCrossings(res.places, res.items);                  // (counted before the hand-placed labels are added: where they sit is the person's choice, so they never count against a layout)
      res.items.forEach(it => { if (it.man) res.places[it.i] = it.man.place; });
      res.score = (res.conflicts === Infinity ? 1e6 : res.conflicts * 4) + res.cross;
      if (!best || res.score < best.score - 0.5) best = res;
    };
    let last = null;
    for (let si = 0; si < scales.length; si++) {
      const k = scales[si];
      const tu = f.baseUnit * K0 * k, items = annBuildItems(ctx, anns, f, K0 * k, bnd.l, bnd.r), rsvM = annManual(items, f, bnd, tu, rsv), nLab = items.filter(it => it.hasLabel).length;
      last = { items, tu, k, rsvM };
      let r1 = null;
      if (mode !== 'columns' && (mode === 'near' || nLab <= 44)) { r1 = annFloat(items, bnd, rsv, tu, fast); r1.k = k; r1.items = items; r1.tu = tu; consider(r1); }
      if (r1 && r1.conflicts === 0 && (r1.cross === 0 || fast)) break;
      if (mode !== 'near') { const r2 = annColumns(items, bnd, rsvM, f, tu); r2.k = k; r2.items = items; r2.tu = tu; consider(r2); if (r2.conflicts === 0 && r2.cross === 0) break; }
      if (best && best.score === 0) break;
      if (r1 && r1.conflicts > Math.max(3, nLab * 0.2) && si < scales.length - 2 && mode !== 'near') si = scales.length - 2;   // hopeless at this size: only the smallest size is still worth a try
    }
    let res = best;
    const nAll = last ? last.items.filter(it => it.hasLabel).length : 0;
    // nothing fits at a readable size without lines crossing something: one tidy key with numbered badges on the markers
    if (mode !== 'near' && nAll > 0 && (!res || res.score > 0)) {
      const lg = annLegend(ctx, last.items, bnd, last.rsvM, f, K0 * 0.8);
      lg.k = 0.8; lg.items = last.items; lg.tu = last.tu;
      lg.cross = annCrossings(lg.places, lg.items);
      last.items.forEach(it => { if (it.man) lg.places[it.i] = it.man.place; });
      lg.score = lg.conflicts * 4 + lg.cross;
      if (!res || lg.score <= res.score) res = lg;
    }
    if (!res) { const items = annBuildItems(ctx, anns, f, K0, bnd.l, bnd.r); res = { places: new Array(items.length).fill(null), conflicts: 0, compact: 0, mode: 'near', k: 1, items, tu: f.baseUnit * K0, score: 0 }; }
    const lay = res.places.map((p, i) => p || { it: res.items[i], kind: 'none', rect: null });
    lay.items = res.items; lay.key = res.key || null;
    lay.stats = { mode: res.mode, k: res.k, compact: res.compact || 0, crowded: res.conflicts > 0 && res.conflicts !== Infinity ? res.conflicts : (res.conflicts === Infinity ? 1 : 0), key: res.mode === 'key', clean: res.score === 0 };
    if (annHist.size > 3000) annHist.clear();
    if (cache) {
      cache.key = key;
      cache.layout = lay;
    } else {
      annLayKey = key;
      annLayVal = lay;
    }
    return lay;
  }

  // ---------------------------------------------------------------------------------------------
  // painting
  // ---------------------------------------------------------------------------------------------
  function annDrawMarker(ctx, it) {
    const look = it.look, col = look.col, lw = it.lwDraw || it.lwPx, px = it.px, py = it.py, g = it.geom, u = it.u;
    if (g.kind === 'none') return;
    const cw = lw + Math.max(1.4, lw * 1.1);
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const stroke = build => {                                      // a faint dark keyline under the colour keeps hairlines readable on bright nebulosity
      ctx.strokeStyle = 'rgba(2,5,12,0.40)'; ctx.lineWidth = cw; ctx.beginPath(); build(); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); build(); ctx.stroke();
    };
    const ring = r => () => { ctx.arc(px, py, r, 0, Math.PI * 2); };
    const dot = r => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill(); };
    if (it.anchor) {
      const dx = it.anchor.x - px, dy = it.anchor.y - py, length = Math.hypot(dx, dy);
      if (length > g.R) {
        ctx.lineCap = 'butt';
        stroke(() => { ctx.moveTo(px + dx * g.R / length, py + dy * g.R / length); ctx.lineTo(it.anchor.x, it.anchor.y); });
        ctx.lineCap = 'round';
      }
    }
    switch (look.style) {
      case 'atlas': stroke(ring(g.R)); break;
      case 'classic': {
        stroke(ring(g.R));
        const tk = Math.min(g.R * 0.26, u * 0.32);
        if (tk >= lw * 1.1 && g.R > lw * 2.4) {
          stroke(() => { for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2, c = Math.cos(a), s = Math.sin(a); ctx.moveTo(px + c * (g.R - tk), py + s * (g.R - tk)); ctx.lineTo(px + c * g.R, py + s * g.R); } });
        }
        break;
      }
      case 'reticle': {                                            // four arcs with open gaps, and a pin-point at the centre
        const half = 33 * Math.PI / 180;
        stroke(() => { for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2 - Math.PI / 2; ctx.moveTo(px + Math.cos(a - half) * g.R, py + Math.sin(a - half) * g.R); ctx.arc(px, py, g.R, a - half, a + half); } });
        dot(Math.max(1, lw * 0.85));
        break;
      }
      case 'pointer': stroke(ring(g.R)); dot(Math.max(1.2, lw * 1.1)); break;
      case 'pill': ctx.fillStyle = 'rgba(2,5,12,0.45)'; ctx.beginPath(); ctx.arc(px, py, g.R + Math.max(0.9, lw * 0.6), 0, Math.PI * 2); ctx.fill(); dot(g.R); break;
      case 'crosshair': {
        const gap = g.R * 0.4;
        stroke(() => { for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2, c = Math.cos(a), s = Math.sin(a); ctx.moveTo(px + c * gap, py + s * gap); ctx.lineTo(px + c * g.R, py + s * g.R); } });
        break;
      }
      case 'brackets': {
        const leg = Math.max(lw * 4, g.hw * 0.52);
        stroke(() => { [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => { const x0 = px + sx * g.hw, y0 = py + sy * g.hh; ctx.moveTo(x0 - sx * leg, y0); ctx.lineTo(x0, y0); ctx.lineTo(x0, y0 - sy * leg); }); });
        break;
      }
      case 'fovbox': {
        ctx.fillStyle = annMix(col, 0, 0.05); ctx.fillRect(px - g.hw, py - g.hh, g.hw * 2, g.hh * 2);
        stroke(() => { ctx.rect(px - g.hw, py - g.hh, g.hw * 2, g.hh * 2); });
        break;
      }
      default: break;
    }
    ctx.restore();
  }
  function annRoundRect(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }

  function annDrawLabels(ctx, lay, f) {
    lay.forEach(r => {
      if (!r || !r.rect || r.kind === 'badge') return;
      const it = r.it, look = it.look, rect = r.rect, col = look.col, tu = it.tu, lw = it.lwDraw || it.lwPx;
      let bg = look.bg;
      if (look.style === 'pill' && bg === 'shelf') bg = 'glass';
      if (r.kind === 'inside' && bg === 'shelf') bg = 'pure';
      const solid = bg === 'solid', plate = bg === 'glass' || solid;
      const onRight = r.end ? r.end.onRight : rect.l + rect.w / 2 >= it.px, above = r.end ? r.end.above : true;
      ctx.save();
      ctx.lineCap = 'round';
      if (r.kind === 'side' && r.end) {                            // leader: marker outline -> near end of the shelf
        const st = annEdgePoint(it, r.end.x, r.end.y);
        if (st) {
          ctx.strokeStyle = 'rgba(2,5,12,0.40)'; ctx.lineWidth = lw + Math.max(1.4, lw * 1.1);
          ctx.beginPath(); ctx.moveTo(st.x, st.y); ctx.lineTo(r.end.x, r.end.y); ctx.stroke();
          ctx.strokeStyle = col; ctx.lineWidth = lw;
          ctx.beginPath(); ctx.moveTo(st.x, st.y); ctx.lineTo(r.end.x, r.end.y); ctx.stroke();
        }
      }
      const rr = tu * 0.24;
      if (plate) {
        ctx.fillStyle = solid ? col : 'rgba(8,12,20,0.58)';
        annRoundRect(ctx, rect.l, rect.t, rect.w, rect.h, rr); ctx.fill();
        if (!solid) { ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = Math.max(1, lw * 0.7); annRoundRect(ctx, rect.l, rect.t, rect.w, rect.h, rr); ctx.stroke(); }
      } else if (bg === 'shelf' && r.kind !== 'inside') {
        const y = above ? rect.t + rect.h : rect.t;
        ctx.strokeStyle = 'rgba(2,5,12,0.40)'; ctx.lineWidth = lw + Math.max(1.4, lw * 1.1);
        ctx.beginPath(); ctx.moveTo(rect.l, y); ctx.lineTo(rect.l + rect.w, y); ctx.stroke();
        ctx.strokeStyle = col; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(rect.l, y); ctx.lineTo(rect.l + rect.w, y); ctx.stroke();
      }
      const tc = annTextCols(look, solid);
      const align = r.kind === 'inside' ? 'center' : onRight ? 'left' : 'right';
      const tx = align === 'center' ? rect.l + rect.w / 2 : align === 'right' ? rect.l + rect.w - it.padX : rect.l + it.padX + it.dotPad;
      ctx.textBaseline = 'top';
      let y = rect.t + it.padY;
      const line = (txt, font, trk, fill, size) => {
        ctx.font = font;
        if (!plate) {                                              // crisp single concentric halo (zero blur, zero vertical offset doubling)
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0)';
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
          ctx.lineJoin = 'round';
          ctx.miterLimit = 2;
          ctx.strokeStyle = 'rgba(2,6,14,0.82)';
          ctx.lineWidth = Math.max(1.5, Math.min(size * 0.16, 4.5));
          annDrawTxt(ctx, txt, tx, y, trk, align, true);
          ctx.restore();
        }
        ctx.fillStyle = fill; annDrawTxt(ctx, txt, tx, y, trk, align, false);
      };
      if (it.title) { line(it.title, it.tfont, it.trkT, tc.t, it.tF); y += it.tF * 1.22; }
      if (it.sub && !r.compact) line(it.sub, it.sfont, it.trkS, tc.s, it.sF);
      ctx.restore();
    });
    // numbered badges + key (last-resort layout)
    if (lay.key) {
      const k = lay.key, panel = k.rect;
      lay.forEach(r => {
        if (!r || r.kind !== 'badge') return;
        const it = r.it, look = it.look, rect = r.rect;
        ctx.save();
        if (r.end) {                                               // a thin leader keeps a badge that had to move away tied to its marker
          const st = annEdgePoint(it, r.end.x, r.end.y);
          if (st && Math.hypot(r.end.x - st.x, r.end.y - st.y) > it.u * 0.5) {
            ctx.lineCap = 'round';
            ctx.strokeStyle = 'rgba(2,5,12,0.40)'; ctx.lineWidth = (it.lwDraw || it.lwPx) + Math.max(1.4, (it.lwDraw || it.lwPx) * 1.1);
            ctx.beginPath(); ctx.moveTo(st.x, st.y); ctx.lineTo(r.end.x, r.end.y); ctx.stroke();
            ctx.strokeStyle = look.col; ctx.lineWidth = it.lwDraw || it.lwPx;
            ctx.beginPath(); ctx.moveTo(st.x, st.y); ctx.lineTo(r.end.x, r.end.y); ctx.stroke();
          }
        }
        ctx.fillStyle = 'rgba(8,12,20,0.7)'; annRoundRect(ctx, rect.l, rect.t, rect.w, rect.h, rect.h / 2); ctx.fill();
        ctx.strokeStyle = look.col; ctx.lineWidth = Math.max(1, (it.lwDraw || it.lwPx) * 0.8); annRoundRect(ctx, rect.l, rect.t, rect.w, rect.h, rect.h / 2); ctx.stroke();
        ctx.fillStyle = '#F5F8FC'; ctx.font = '600 ' + r.bF + 'px ' + look.fam; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(r.num), rect.l + rect.w / 2, rect.t + rect.h / 2 + r.bF * 0.04);
        ctx.restore();
      });
      ctx.save();
      ctx.fillStyle = 'rgba(8,12,20,0.66)'; annRoundRect(ctx, panel.l, panel.t, panel.w, panel.h, k.tF * 0.5); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1; annRoundRect(ctx, panel.l, panel.t, panel.w, panel.h, k.tF * 0.5); ctx.stroke();
      ctx.textBaseline = 'middle';
      k.rows.forEach((row, i) => {
        const c = Math.floor(i / k.perCol), rIdx = i % k.perCol;
        const x = panel.l + k.pad + c * (k.colW + k.colGap), y = panel.t + k.pad + rIdx * k.rowH + k.rowH / 2;
        ctx.textAlign = 'left';
        ctx.font = k.nFont; ctx.fillStyle = row.it.look.col; ctx.fillText(String(row.n), x, y);
        ctx.font = k.rFont; ctx.fillStyle = '#F2F6FB'; ctx.fillText(row.txt, x + k.numW, y);
      });
      ctx.restore();
    }
  }

  // The Moon's outline can be printed on the picture itself (it is also shown as a guide in the preview, see moonDrawGhost).
  // It is interrupted wherever a label, a badge or a marker sits on it, so that no text is ever struck through by it.
  function annRingArcs(cx, cy, R, rects, discs, minLen) {                  // the visible parts of the circle once the rectangles and discs are cut out (angles in radians)
    const TAU = Math.PI * 2, cut = [];
    rects.forEach(q => {
      const angs = [0, TAU];
      const atX = x => { const c = (x - cx) / R; if (c > -1 && c < 1) { const a = Math.acos(c); angs.push(a, TAU - a); } };
      const atY = y => { const sn = (y - cy) / R; if (sn > -1 && sn < 1) { const a = Math.asin(sn); angs.push((a + TAU) % TAU, (Math.PI - a + TAU) % TAU); } };
      atX(q.l); atX(q.r); atY(q.t); atY(q.b);
      angs.sort((p, r) => p - r);
      for (let i = 0; i + 1 < angs.length; i++) {
        const a0 = angs[i], a1 = angs[i + 1];
        if (a1 - a0 < 1e-9) continue;
        const m = (a0 + a1) / 2, x = cx + R * Math.cos(m), y = cy + R * Math.sin(m);
        if (x >= q.l && x <= q.r && y >= q.t && y <= q.b) cut.push([a0, a1]);
      }
    });
    discs.forEach(d => {
      const dx = d.x - cx, dy = d.y - cy, D = Math.sqrt(dx * dx + dy * dy);
      if (D < 1e-6) { if (d.r >= R) cut.push([0, TAU]); return; }
      const c = (R * R + D * D - d.r * d.r) / (2 * R * D);
      if (c >= 1) return;                                          // this disc does not reach the circle
      if (c <= -1) { cut.push([0, TAU]); return; }
      const hw = Math.acos(c), a0 = (((Math.atan2(dy, dx) - hw) % TAU) + TAU) % TAU, a1 = a0 + 2 * hw;
      if (a1 > TAU) cut.push([a0, TAU], [0, a1 - TAU]); else cut.push([a0, a1]);
    });
    if (!cut.length) return [[0, TAU]];
    cut.sort((p, q) => p[0] - q[0]);
    const merged = [];
    cut.forEach(iv => { const l = merged[merged.length - 1]; if (l && iv[0] <= l[1] + 1e-9) l[1] = Math.max(l[1], iv[1]); else merged.push([iv[0], iv[1]]); });
    const vis = []; let cur = 0;
    merged.forEach(iv => { if (iv[0] > cur + 1e-9) vis.push([cur, iv[0]]); cur = Math.max(cur, iv[1]); });
    if (cur < TAU - 1e-9) vis.push([cur, TAU]);
    if (vis.length > 1 && vis[0][0] <= 1e-9 && vis[vis.length - 1][1] >= TAU - 1e-9) { const first = vis.shift(); vis[vis.length - 1][1] = TAU + first[1]; }   // one arc across the angle 0
    return minLen > 0 ? vis.filter(q => (q[1] - q[0]) * R >= minLen) : vis;          // a stub too short to read as part of the outline is left out
  }
  function annRingCuts(L, lw) {                                    // L = { lay, left, top, u }: what the outline must keep clear of, in the coordinates of the picture's own origin
    const rects = [], discs = [];
    if (!L || !L.lay) return { rects, discs, minLen: 0 };
    const pad = Math.max(L.u * 0.22, lw * 1.6), dx = L.left, dy = L.top;
    const addRect = q => { if (q) rects.push({ l: q.l - dx - pad, t: q.t - dy - pad, r: q.l + q.w - dx + pad, b: q.t + q.h - dy + pad }); };
    L.lay.forEach(r => { if (r && r.rect) addRect(r.rect); });
    if (L.lay.key && L.lay.key.rect) addRect(L.lay.key.rect);
    (L.lay.items || []).forEach(it => {
      const g = it.geom;
      if (!g || g.kind === 'none') return;
      if (g.kind === 'box') rects.push({ l: it.px - dx - g.hw - pad, t: it.py - dy - g.hh - pad, r: it.px - dx + g.hw + pad, b: it.py - dy + g.hh + pad });
      else discs.push({ x: it.px - dx, y: it.py - dy, r: g.mr + pad });
    });
    return { rects, discs, minLen: Math.max(L.u * 0.9, lw * 6) };
  }
  function annRingPath(ctx, cx, cy, R, cuts) {                     // adds the visible arcs of the outline to the current path
    annRingArcs(cx, cy, R, cuts.rects, cuts.discs, cuts.minLen).forEach(a => { ctx.moveTo(cx + R * Math.cos(a[0]), cy + R * Math.sin(a[0])); ctx.arc(cx, cy, R, a[0], a[1]); });
  }
  function annDrawMoonRing(ctx, f, lay) {
    if (state.moonRing !== 'image') return;
    const box = annMoonBox(f);
    if (!box) return;
    const col = state.annBaseColor || '#EAF2FF';
    const lw = Math.max(1.1, f.baseUnit * 0.05) * (state.annDraftLine || 1);
    const cx = (box.l + box.r) / 2, cy = (box.t + box.b) / 2, R = (box.r - box.l) / 2;
    const cuts = annRingCuts(lay ? { lay, left: 0, top: 0, u: f.baseUnit } : null, lw);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(2,5,12,0.40)'; ctx.lineWidth = lw + Math.max(1.4, lw * 1.1); ctx.beginPath(); annRingPath(ctx, cx, cy, R, cuts); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); annRingPath(ctx, cx, cy, R, cuts); ctx.stroke();
    ctx.restore();
  }
  function annHasOverlay() {
    const visible = state.markersVisible || state.appMode === 'reel';
    return visible && (state.annotations.length > 0 || (state.moonRing === 'image' && state.skyMode === 'moon' && !!state.moon));
  }

  // A pin that was just clicked answers with a short expanding ring
  function annPulse(id) { state._annPulseId = id; state._annPulseT = performance.now(); }
  // Live-editing aid: dashed outline around the selected pin (Annotate stage only, never in exports)
  function annDrawSelection(ctx, lay, f) {
    const r = lay.find(q => q && q.it.a.id === state.selectedPinId);
    if (!r) return;
    const it = r.it, u = f.baseUnit, g = it.geom;
    const outline = grow => {
      ctx.beginPath();
      if (it.look.style === 'pill' && r.rect) annRoundRect(ctx, r.rect.l - grow, r.rect.t - grow, r.rect.w + grow * 2, r.rect.h + grow * 2, u * 0.4 + grow * 0.5);
      else if (g.kind === 'box') annRoundRect(ctx, it.px - g.hw - grow, it.py - g.hh - grow, (g.hw + grow) * 2, (g.hh + grow) * 2, u * 0.15 + grow * 0.3);
      else ctx.arc(it.px, it.py, g.mr + grow, 0, Math.PI * 2);
    };
    ctx.save();
    ctx.lineWidth = Math.max(1, u * 0.04);
    ctx.setLineDash([u * 0.3, u * 0.26]);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = u * 0.2;
    outline(u * 0.42); ctx.stroke();
    ctx.restore();
    if (r.rect && r.kind === 'side') {                               // the label can be held and dragged on its own
      const g2 = u * 0.14;
      ctx.save();
      ctx.lineWidth = Math.max(1, u * 0.04); ctx.setLineDash([u * 0.3, u * 0.26]); ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = u * 0.2;
      annRoundRect(ctx, r.rect.l - g2, r.rect.t - g2, r.rect.w + g2 * 2, r.rect.h + g2 * 2, u * 0.2); ctx.stroke();
      ctx.restore();
    }
    const age = performance.now() - (state._annPulseT || 0);
    if (state._annPulseId === it.a.id && age >= 0 && age < 560) {
      const k = age / 560, e = 1 - Math.pow(1 - k, 3);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.75 * (1 - k)).toFixed(3) + ')';
      ctx.lineWidth = Math.max(1.2, u * 0.08 * (1 - k * 0.5));
      outline(u * (0.42 + e * 1.4)); ctx.stroke();
      ctx.restore();
      if (!state._annPulseRaf) state._annPulseRaf = requestAnimationFrame(() => {
        state._annPulseRaf = 0;
        if (state.appMode === 'annotate' || state.appMode === 'slicer') renderCanvas();
      });
    }
  }

  // The one entry point: markers, then labels. cx/cy = centre of the picture on the canvas, scale = canvas pixels per picture pixel.
  function drawAnnotationsOverlay(targetCtx, cx, cy, scale) {
    const dims = getTransformedDims();
    const sc = scale > 0 ? scale : 1, W = dims.w * sc, H = dims.h * sc, baseUnit = Math.max(13 * sc, Math.min(W, H) * 0.030);   // (the floors scale with the picture: a small preview is a true miniature of the saved picture)
    const frame = { cx, cy, imgScreenW: W, imgScreenH: H, imgLeft: cx - W / 2, imgRight: cx + W / 2, imgTop: cy - H / 2, imgBot: cy + H / 2, baseUnit, s: sc, teleAligned: !!state._annTele };
    const lay = state.annotations.length ? annLayout(targetCtx, state.annotations, frame) : null;
    annLastLay = lay ? { lay, left: frame.imgLeft, top: frame.imgTop, u: baseUnit } : null;
    if (state._annUI && state.appMode === 'annotate') annStageLay = annLastLay;
    annDrawMoonRing(targetCtx, frame, lay);
    if (!lay) return;
    if (state._annUI) state._annStats = lay.stats;
    const order = lay.items.slice().sort((a, b) => b.geom.R - a.geom.R);       // small markers are painted on top of big rings
    order.forEach(it => annDrawMarker(targetCtx, it));
    annDrawLabels(targetCtx, lay, frame);
    if (state._annUI) annDrawSelection(targetCtx, lay, frame);
  }

  // The tint of an object's type (galaxy, cluster, nebula... or the kind of a lunar feature); null when a pin has no type
  function annTypeColor(a) {
    if (!a) return null;
    if (String(a.catalogId || '').startsWith('moon:')) {
      const k = Object.keys(MOON_KIND_ONE).find(x => MOON_KIND_ONE[x] === a.objectType);
      return k && MOON_KINDS[k] ? MOON_KINDS[k].color : null;
    }
    return a.objectType ? getSkyObjectColor({ type: a.objectType }) : null;
  }


  // ----- Annotate deck: the existing Markers controls (same elements, same handlers) moved into tabs -----
  (function buildAnnotateDeck() {
    const sheet = document.querySelector('#annotateModal .sheet'), panes = {};
    document.querySelectorAll('#annotateDeck .ann-pane').forEach(p => { panes[p.dataset.apane] = p; });
    const get = sel => { let e = sheet.querySelector(sel); while (e && e.parentElement !== sheet) e = e.parentElement; return e; };
    const mk = (cls, html) => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; return d; };

    // "Sync all pins" belongs with the style controls it governs
    panes.style.appendChild(sheet.querySelector('#btnSyncAllPins').closest('.field-label'));
    const B = {
      solve: [get('#starSolvePanel')],
      pins: [get('#btnTapToPlacePin'), get('#annList'), mk('field-label', '<span>Selected pin — title &amp; subtitle</span>'), get('#annTitleInput')],
      style: [get('#annSecMarker'), get('#annSecText'), get('#annSecLabel')],
      info: [get('#telemetryModeGroup')],
      export: [get('.annotation-export-panel')]
    };
    Object.keys(B).forEach(k => B[k].forEach(e => { if (e) panes[k].appendChild(e); }));

    const tab = name => {
      document.querySelectorAll('#annTabs [data-atab]').forEach(x => x.classList.toggle('active', x.dataset.atab === name));
      Object.keys(panes).forEach(k => panes[k].classList.toggle('active', k === name));
    };
    document.querySelectorAll('#annTabs [data-atab]').forEach(b => b.addEventListener('click', () => tab(b.dataset.atab)));
    document.getElementById('btnModeAnnotate').addEventListener('click', () => setAppMode('annotate'));
    document.getElementById('btnAnnHudPlace').addEventListener('click', () => document.getElementById('btnTapToPlacePin').click());
    document.getElementById('btnAnnUndo').addEventListener('click', undoLastMove);
  })();

  // ---- Editing one annotation (Annotate) ----------------------------------------------------------------------------------
  // The quick-edit card sits at the bottom of the screen, clear of the picture, so the result can be watched while typing.
  // It follows the selected annotation: tapping another one in the picture, or stepping with the arrows, edits that one.
  // Whatever is done here is a hand edit: "Update pins" from the Moon atlas will not overwrite it.
  function pinDockEl() { return document.getElementById('pinDock'); }
  function pinDockIsOpen() { const d = pinDockEl(); return !!d && !d.hidden; }
  function annDockOnRowTap() { return !!(window.matchMedia && window.matchMedia('(max-width: 899px)').matches); }
  function pinDockOpen(id, focusName) {
    const d = pinDockEl();
    if (!d || !state.annotations.length) return;
    if (id) state.selectedPinId = id;
    if (!getSelectedAnnotation()) state.selectedPinId = state.annotations[state.annotations.length - 1].id;
    d.hidden = false;
    pinDockFit();
    syncAnnotationModalUI(); renderAnnotationList(); renderCanvas();
    if (focusName && !annIsTouchDevice()) { const t = document.getElementById('dockTitle'); if (t) { t.focus(); t.select(); } }
  }
  function pinDockClose() {
    const d = pinDockEl();
    if (!d || d.hidden) return;
    d.hidden = true;
    d.style.removeProperty('--dock-lift');
    if (document.activeElement && d.contains(document.activeElement)) document.activeElement.blur();
  }
  function pinDockSync() {
    const eb = document.getElementById('btnAnnHudEdit');
    if (eb) eb.disabled = !state.annotations.length;
    const rb = document.getElementById('btnResetLabels');
    if (rb) rb.hidden = !state.annotations.some(a => a.lman);
    const d = pinDockEl();
    if (!d || d.hidden) return;
    let sel = getSelectedAnnotation();
    if (!sel && state.annotations.length) { sel = state.annotations[state.annotations.length - 1]; state.selectedPinId = sel.id; }
    if (!sel) { pinDockClose(); return; }
    const $ = id => document.getElementById(id);
    $('pinDockCount').textContent = (state.annotations.indexOf(sel) + 1) + ' of ' + state.annotations.length;
    $('pinDockDot').style.background = sel.color || '#EAF2FF';
    const t = $('dockTitle'), s = $('dockSub');
    if (document.activeElement !== t) t.value = sel.title || '';
    if (document.activeElement !== s) s.value = sel.sub || '';
    $('pinDockHand').hidden = !sel.lman;
    $('btnDockPrev').disabled = $('btnDockNext').disabled = state.annotations.length < 2;
  }
  function pinDockFit() {                                                           // keep the card above the on-screen keyboard
    const d = pinDockEl();
    if (!d || d.hidden) return;
    const vv = window.visualViewport;
    const lift = vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
    d.style.setProperty('--dock-lift', lift + 'px');
  }
  function pinDockType(prop, value) {
    const a = getSelectedAnnotation();
    if (!a) return;
    saveUndoBurst();
    a[prop] = value; a.tEdit = true;
    const inl = document.getElementById(prop === 'title' ? 'annTitleInput' : 'annSubInput');
    if (inl) inl.value = value;
    renderAnnotationList(); renderCanvas();
  }
  function pinDockStep(dir) {
    const n = state.annotations.length;
    if (n < 2) return;
    const i = state.annotations.indexOf(getSelectedAnnotation());
    const a = state.annotations[(i + dir + n) % n];
    state.selectedPinId = a.id; annPulse(a.id);
    if (state.annotationAspect === 'original' && state.annZoom > 1.001) annTween(state.annZoom, a.nx, a.ny);
    syncAnnotationModalUI(); renderAnnotationList(); renderCanvas();
  }
  function pinDockDelete() {
    const a = getSelectedAnnotation();
    if (!a) return;
    saveUndoBeforeAction();
    const i = state.annotations.indexOf(a);
    state.annotations.splice(i, 1);
    state.selectedPinId = state.annotations.length ? state.annotations[Math.min(i, state.annotations.length - 1)].id : null;
    syncAnnotationModalUI(); renderAnnotationList(); renderCanvas();
    showToast('Deleted “' + (a.title || 'annotation') + '”. Undo is in the toolbar.', 2600);
  }
  function annAutoLabel(a) { a.lman = false; delete a.lx; delete a.ly; }
  function pinDockAuto() {
    const a = getSelectedAnnotation();
    if (!a) return;
    saveUndoBeforeAction(); annAutoLabel(a);
    renderAnnotationList(); renderCanvas();
  }
  function annResetLabels() {
    if (!state.annotations.some(a => a.lman)) return;
    saveUndoBeforeAction();
    state.annotations.forEach(annAutoLabel);
    renderAnnotationList(); renderCanvas();
    showToast('All labels are placed automatically again');
  }
  document.getElementById('dockTitle').addEventListener('input', e => pinDockType('title', e.target.value));
  document.getElementById('dockSub').addEventListener('input', e => pinDockType('sub', e.target.value));
  document.getElementById('dockTitle').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('dockSub').focus(); } });
  document.getElementById('dockSub').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
  document.getElementById('btnDockPrev').addEventListener('click', () => pinDockStep(-1));
  document.getElementById('btnDockNext').addEventListener('click', () => pinDockStep(1));
  document.getElementById('btnDockDelete').addEventListener('click', pinDockDelete);
  document.getElementById('btnDockAuto').addEventListener('click', pinDockAuto);
  document.getElementById('btnDockDone').addEventListener('click', pinDockClose);
  document.getElementById('btnAnnHudEdit').addEventListener('click', () => pinDockOpen(null, true));
  document.getElementById('btnResetLabels').addEventListener('click', annResetLabels);
  if (window.visualViewport) { window.visualViewport.addEventListener('resize', pinDockFit); window.visualViewport.addEventListener('scroll', pinDockFit); }
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !pinDockIsOpen() || document.querySelector('.modal-backdrop.open')) return;
    pinDockClose(); e.preventDefault();
  });

  // ---- labels: where a finger lands on the picture ---------------------------------------------------------------------
  // (annStageLay is the layout of the Annotate stage as it was last drawn: its rectangles are in canvas pixels, like the pointer)
  function annLabelHit(x, y) {
    const L = annStageLay;
    if (!L || !L.lay) return null;
    const pad = Math.max(6 * (state.dpr || 1), L.u * 0.12);
    let best = null;
    for (const r of L.lay) {
      if (!r || !r.rect || r.kind !== 'side' || !r.it) continue;
      const q = r.rect, dx = Math.max(q.l - x, 0, x - (q.l + q.w)), dy = Math.max(q.t - y, 0, y - (q.t + q.h));
      if (dx > pad || dy > pad) continue;
      const d = Math.hypot(dx, dy);
      if (!best || d < best.d || (d === best.d && r.it.a.id === state.selectedPinId)) best = { id: r.it.a.id, d, cx: q.l + q.w / 2, cy: q.t + q.h / 2 };
    }
    return best;
  }
  // a finger exactly on an existing marker or label (tight on purpose: while a target is being placed, a tap beside a marker still places a new one)
  function annGrabbable(x, y) {
    if (!state.markersVisible || !annFrameContains(x,y)) return false;
    const L = annStageLay;
    if (!L || !L.lay) return false;
    const dpr = state.dpr || 1;
    for (const r of L.lay) {
      if (!r || !r.it) continue;
      const it = r.it, g = it.geom;
      if (g && g.kind !== 'none' && Math.hypot(x - it.px, y - it.py) <= Math.max(11 * dpr, g.mr + 4 * dpr)) return true;
      if (r.rect && r.kind === 'side' && x >= r.rect.l && x <= r.rect.l + r.rect.w && y >= r.rect.t && y <= r.rect.t + r.rect.h) return true;
    }
    return false;
  }


  // =========================================================================
  // BIGGER PREVIEW
  //  - Annotate: pinch / wheel / double-tap zoom, drag to pan, zoom buttons, a magnifier while a marker is dragged by touch
  //  - Annotate + 3D Reel: full-screen stage (header, output strip and inspector get out of the way)
  // =========================================================================
  const ANN_ZOOM_MAX = 16;
  let annTap = null;        // the press that may still turn into a tap (drop a marker / double-tap zoom)
  let lastAnnTap = null;
  let annAnim = 0;
  const annClamp = (v, a, b) => Math.min(b, Math.max(a, v));
  let annRenderQueued = false;
  function annRender() {           // many touch events can arrive per frame: draw once per frame
    if (annRenderQueued) return;
    annRenderQueued = true;
    requestAnimationFrame(() => { annRenderQueued = false; renderCanvas(); });
  }

  // the area of the stage the picture may use (CSS-independent canvas pixels)
  function annViewport(d) {
    syncCanvasSize();
    const dpr = state.dpr;
    const padX = (canvas.width / dpr < 520 ? 8 : 18) * dpr, padTop = stageTopPad() * dpr, padBot = stageBottomPad() * dpr;
    const aw = Math.max(60 * dpr, canvas.width - padX * 2), ah = Math.max(60 * dpr, canvas.height - padTop - padBot);
    return { d, dpr, padX, padTop, aw, ah, sx: padX + aw / 2, sy: padTop + ah / 2, kFit: Math.min(aw / d.w, ah / d.h) };
  }
  // a new picture, or a new rotation, starts from "fit" again
  function annSyncView() {
    if (state._annImg !== state.img || state._annRot !== state.rot90 || state._annFine !== state.fineAngle) {
      cancelAnimationFrame(annAnim);
      state._annImg = state.img; state._annRot = state.rot90; state._annFine = state.fineAngle;
      state.annZoom = 1; state.annCx = 0.5; state.annCy = 0.5;
    }
  }
  // Preview-only zoom and pan while the full original is selected.
  function annZoomRect(v) {
    const d = v.d;
    const z = annClamp(state.annZoom || 1, 1, ANN_ZOOM_MAX);
    const k = v.kFit * z, w = d.w * k, h = d.h * k;
    const cx = Number.isFinite(state.annCx) ? state.annCx : 0.5, cy = Number.isFinite(state.annCy) ? state.annCy : 0.5;
    let x = v.sx - cx * w, y = v.sy - cy * h;
    // never leave an empty gutter: a picture bigger than the stage always covers it
    x = w > v.aw ? annClamp(x, v.padX + v.aw - w, v.padX) : v.sx - w / 2;
    y = h > v.ah ? annClamp(y, v.padTop + v.ah - h, v.padTop) : v.sy - h / 2;
    state.annZoom = z; state.annCx = (v.sx - x) / w; state.annCy = (v.sy - y) / h;
    return { x, y, w, h };
  }
  function annPanBy(dx, dy) {
    if (!state.img) return;
    cancelAnimationFrame(annAnim);
    const view = annotationStageView();
    state.annCx -= dx / view.w;
    state.annCy -= dy / view.h;
    if (state.annotationAspect !== 'original') getAnnotationCrop(view.source);
    annRender();
  }
  // Keep the same photo point under the cursor or the moving pinch centre.
  function annZoomAt(px, py, factor, panX = 0, panY = 0, animate = false) {
    if (!state.img) return;
    const view = annotationStageView();
    const z0 = state.annZoom, z1 = annClamp(z0 * factor, 1, ANN_ZOOM_MAX), f = z1 / z0;
    const nx = (px - view.cx) / view.w + 0.5, ny = (py - view.cy) / view.h + 0.5;
    const cx = nx - (px + panX - view.sx) / (view.w * f);
    const cy = ny - (py + panY - view.sy) / (view.h * f);
    if (animate) {
      annTween(z1, cx, cy);
      return;
    }
    state.annZoom = z1;
    state.annCx = cx;
    state.annCy = cy;
    if (state.annotationAspect !== 'original') getAnnotationCrop(view.source);
    annRender();
  }
  // short eased move to a new zoom / centre (buttons, double-tap)
  function annTween(z1, cx1, cy1, ms) {
    cancelAnimationFrame(annAnim);
    annotationStageView();
    const z0 = state.annZoom || 1, cx0 = state.annCx, cy0 = state.annCy, t0 = performance.now(), dur = ms || 210;
    const step = now => {
      const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3);
      state.annZoom = z0 * Math.pow(z1 / z0, e);
      state.annCx = cx0 + (cx1 - cx0) * e;
      state.annCy = cy0 + (cy1 - cy0) * e;
      renderCanvas();
      if (t < 1) annAnim = requestAnimationFrame(step);
    };
    annAnim = requestAnimationFrame(step);
  }
  function annZoomStep(f) {
    if (!state.img) return;
    annotationStageView();
    const zoom = annClamp(state.annZoom * f, 1, ANN_ZOOM_MAX);
    if (zoom === state.annZoom) return;
    if (state.annotationAspect !== 'original') saveUndoBeforeAction();
    annTween(zoom, state.annCx, state.annCy);
  }
  function annFitView() {
    if (!state.img) return;
    if (state.annotationAspect !== 'original') saveUndoBeforeAction();
    annTween(1, 0.5, 0.5);
  }
  function annDoubleTap(px, py) {
    if (state.annZoom > 1.25) { annFitView(); return; }
    if (state.annotationAspect !== 'original') saveUndoBeforeAction();
    annZoomAt(px, py, 3 / state.annZoom, 0, 0, true);
  }
  function annStartPinch() {
    state.draggingPinId = null; state.draggingLabelId = null; state._labDown = null;
    state._annLoupe = false;
    lastAnnTap = null;
    const pts = Array.from(pointers.values());
    prevPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    prevMid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  }
  // One finger reframes a crop or navigates the zoomed original.
  function annMove(prev, curr) {
    if (annTap) {
      if (pointers.size > 1) annTap = null;
      else if (!annTap.moved) {
        if (Math.hypot(curr.x - annTap.x, curr.y - annTap.y) <= 6 * state.dpr) return;
        prev = annTap;
        annTap.moved = true;
        lastAnnTap = null;
      }
    }
    if (pointers.size === 1) {
      if (state.annotationAspect !== 'original' || state.annZoom > 1.001) annPanBy(curr.x - prev.x, curr.y - prev.y);
    } else if (pointers.size === 2) {
      cancelAnimationFrame(annAnim);
      const pts = Array.from(pointers.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      if (prevPinchDist && prevPinchDist > 10 && prevMid) annZoomAt(prevMid.x, prevMid.y, dist / prevPinchDist, mid.x - prevMid.x, mid.y - prevMid.y);
      prevPinchDist = dist; prevMid = mid;
    }
  }
  // a finished tap: drop a marker (Place target) or double-tap to zoom in / back out
  function annTapped(tap) {
    if (!annFrameContains(tap.x, tap.y)) return;
    if (state.moonTap) { moonTapped(tap); return; }
    if (state.placingPinMode) {
      saveUndoBeforeAction();
      const norm = screenToImageNorm(tap.x, tap.y);
      const sug = state.skyMode === 'moon' ? moonSuggestAt(norm.nx, norm.ny) : null;
      const dup = sug && sug.catalogId ? state.annotations.find(p => p.catalogId === sug.catalogId) : null;
      if (dup) {                                                       // this feature already has a pin: move it where the tap is
        dup.nx = norm.nx; dup.ny = norm.ny; dup.pMoved = true; state.selectedPinId = dup.id; annPulse(dup.id);
        syncAnnotationModalUI(); renderAnnotationList(); showToast('Moved "' + dup.title + '"');
      } else addAnnotationAt(norm.nx, norm.ny, sug || (state.skyMode === 'moon' ? { title: 'Target #' + (state.annotations.length + 1), sub: '' } : null));
      if (!sug) {
        state.placingPinMode = false;
        document.getElementById('pinModeBanner').classList.remove('active');
      }
      renderCanvas();
      return;
    }
    const prev = lastAnnTap;
    if (prev && tap.t - prev.t < 340 && Math.hypot(tap.x - prev.x, tap.y - prev.y) < 40 * state.dpr) { lastAnnTap = null; annDoubleTap(tap.x, tap.y); }
    else lastAnnTap = { t: tap.t, x: tap.x, y: tap.y };
  }
  // magnifier shown while a marker is dragged by touch: the finger never hides the star being aimed at
  function annDrawLoupe(r, k) {
    if (!state._annLoupe || !state.draggingPinId) return;
    const a = state.annotations.find(q => q.id === state.draggingPinId);
    if (!a) return;
    const dpr = state.dpr, R = 50 * dpr, M = 3;
    const px = r.x + a.nx * r.w, py = r.y + a.ny * r.h;
    const lx = annClamp(px, R + 8 * dpr, canvas.width - R - 8 * dpr);
    let ly = py - R - 64 * dpr;
    if (ly < R + 8 * dpr) ly = py + R + 64 * dpr;
    ly = annClamp(ly, R + 8 * dpr, canvas.height - R - 8 * dpr);
    ctx.save();
    ctx.beginPath(); ctx.arc(lx, ly, R, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#05070a'; ctx.fillRect(lx - R, ly - R, R * 2, R * 2);
    ctx.translate(lx, ly); ctx.scale(M, M); ctx.translate(-px, -py);
    drawSourceTransformed(ctx, r.x + r.w / 2, r.y + r.h / 2, k, false);
    ctx.restore();
    ctx.save();
    ctx.lineWidth = 2.5 * dpr; ctx.strokeStyle = 'rgba(7,9,13,0.85)';
    ctx.beginPath(); ctx.arc(lx, ly, R, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1.5 * dpr; ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath(); ctx.arc(lx, ly, R - 1 * dpr, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1.2 * dpr; ctx.strokeStyle = a.color || '#38bdf8';
    ctx.beginPath();
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([ux, uy]) => { ctx.moveTo(lx + ux * 7 * dpr, ly + uy * 7 * dpr); ctx.lineTo(lx + ux * 20 * dpr, ly + uy * 20 * dpr); });
    ctx.stroke();
    ctx.restore();
  }
  function annSyncZoomButtons() {
    const z = state.annZoom;
    const centered = Math.abs(state.annCx - 0.5) < 1e-5 && Math.abs(state.annCy - 0.5) < 1e-5;
    const fit = document.getElementById('btnAnnFit');
    document.getElementById('btnAnnZoomOut').disabled = z <= 1.001;
    document.getElementById('btnAnnZoomIn').disabled = z >= ANN_ZOOM_MAX - 0.01;
    fit.disabled = z <= 1.001 && centered;
    fit.title = state.annotationAspect === 'original' ? 'Show the whole picture' : 'Center the crop and reset zoom';
  }
  document.getElementById('btnAnnZoomIn').addEventListener('click', () => annZoomStep(1.6));
  document.getElementById('btnAnnZoomOut').addEventListener('click', () => annZoomStep(1 / 1.6));
  document.getElementById('btnAnnFit').addEventListener('click', annFitView);

  // ----- full-screen stage -----
  function setStageFocus(on) {
    const m = state.appMode, rootEl = document.documentElement;
    on = !!on && (m === 'annotate' || m === 'reel');
    if (rootEl.classList.contains('focus-stage') === on) return;
    rootEl.classList.toggle('focus-stage', on);
    const b = document.getElementById('btnStageFocus');
    if (b) {
      const t = on ? 'Exit full screen' : 'Full-screen preview';
      b.title = t; b.setAttribute('aria-label', t); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    window.dispatchEvent(new Event('resize'));
    requestAnimationFrame(() => { syncCanvasSize(); if (state.appMode === 'reel') { if (!state.reelRecording) setupReelPreviewCanvas(); } else renderCanvas(); });
  }
  document.getElementById('btnStageFocus').addEventListener('click', () => setStageFocus(!document.documentElement.classList.contains('focus-stage')));
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.documentElement.classList.contains('focus-stage')) setStageFocus(false);
  });

  // =========================================================================
  // UI KIT: animated segmented controls, sliding tab panes, option carousels
  // (purely presentational: the app's own handlers still decide what is selected)
  // =========================================================================
  (function uiKit() {
    const mqPhone = window.matchMedia('(max-width: 899px) and (orientation: portrait), (max-width: 639px), (max-width: 899px) and (min-height: 541px)');
    const isPhone = () => mqPhone.matches;
    const raf = fn => requestAnimationFrame(fn);
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const root = document.documentElement;

    // ---- sliders paint their own progress, even when the app sets .value from code
    function paintRange(el) {
      const min = parseFloat(el.min) || 0;
      const max = parseFloat(el.max);
      const hi = isNaN(max) ? 100 : max;
      const v = parseFloat(el.value);
      el.style.setProperty('--pf', (hi > min ? clamp((v - min) / (hi - min), 0, 1) : 0).toFixed(4));
    }
    try {
      const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      Object.defineProperty(HTMLInputElement.prototype, 'value', {
        configurable: true,
        enumerable: d.enumerable,
        get: function () { return d.get.call(this); },
        set: function (v) { d.set.call(this, v); if (this.type === 'range') paintRange(this); }
      });
    } catch (_) {}
    document.addEventListener('input', e => { if (e.target && e.target.type === 'range') paintRange(e.target); }, true);
    document.querySelectorAll('input[type="range"]').forEach(paintRange);

    // ---- one sliding indicator behind the active button of every segmented control
    const ACTIVE = '.seg-btn.active, .mode-switch-btn.active, .col-subtab-btn.active';
    const hosts = [];
    function attachThumb(host) {
      if (host._thumb) return;
      const th = document.createElement('span');
      th.className = 'seg-thumb still';
      host.insertBefore(th, host.firstChild);
      host.classList.add('has-thumb');
      host._thumb = th;
      host._place = function () {
        if (host._drive && isPhone()) return;
        const act = Array.from(host.children).find(c => c !== th && c.matches(ACTIVE));
        if (!act || !host.offsetWidth || !act.offsetWidth) { th.classList.remove('on'); return; }
        const first = !th.classList.contains('on');
        if (first) th.classList.add('still');
        th.style.width = act.offsetWidth + 'px';
        th.style.left = act.offsetLeft + 'px';
        th.classList.add('on');
        if (first) raf(() => raf(() => th.classList.remove('still')));
      };
      new ResizeObserver(() => host._place()).observe(host);
      new MutationObserver(() => {
        if (!host.contains(th)) host.insertBefore(th, host.firstChild);
        raf(host._place);
      }).observe(host, { childList: true });
      hosts.push(host);
      host._place();
    }
    const dirty = new Set();
    let flushQueued = false;
    new MutationObserver(list => {
      list.forEach(m => {
        const h = m.target.closest && m.target.closest('.has-thumb');
        if (h) dirty.add(h);
      });
      if (dirty.size && !flushQueued) {
        flushQueued = true;
        raf(() => { flushQueued = false; dirty.forEach(h => h._place()); dirty.clear(); });
      }
    }).observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });
    document.querySelectorAll('.seg-group, .mode-switch-pill, .collage-subtabs, .ann-tabs').forEach(attachThumb);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => hosts.forEach(h => h._place()));

    // ---- swipeable option carousels (phones); desktop keeps the tidy grid.
    // Free momentum scrolling (no snapping); soft edge fades appear only once the strip has been moved
    // and grow with the distance scrolled away from each end.
    function carousel(el) {
      if (!el) return;
      el.classList.add('carousel');
      const FADE = 26;                 // widest edge fade (px)
      let moved = false;               // fades stay hidden until the user has really moved the strip
      let homeLeft = 0;                // where we last put it ourselves
      let progUntil = 0;               // scroll events right after our own scrollTo() are not the user
      let ticking = false, lastW = 0;

      function fades() {
        ticking = false;
        const max = el.scrollWidth - el.clientWidth, x = el.scrollLeft;
        const on = moved && isPhone() && max > 1;
        el.style.setProperty('--fl', (on ? Math.min(FADE, Math.max(0, x) * 0.5) : 0).toFixed(1) + 'px');
        el.style.setProperty('--fr', (on ? Math.min(FADE, Math.max(0, max - x) * 0.5) : 0).toFixed(1) + 'px');
      }
      function go(left, smooth) {
        const max = Math.max(0, el.scrollWidth - el.clientWidth);
        left = clamp(left, 0, max);
        progUntil = performance.now() + (smooth ? 800 : 120);
        homeLeft = left;
        el.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
      }
      function centerActive() {
        const a = el.querySelector('.active');
        if (!a || !isPhone() || !el.clientWidth) return;
        go(a.offsetLeft - (el.clientWidth - a.offsetWidth) / 2, false);
      }
      function revealActive() {          // nudge the chosen card into view only if it is cut off
        const a = el.querySelector('.active');
        if (!a || !isPhone() || !el.clientWidth) return;
        const pad = 14, l = a.offsetLeft, r = l + a.offsetWidth, v0 = el.scrollLeft, v1 = v0 + el.clientWidth;
        let t = v0;
        if (l - pad < v0) t = l - pad; else if (r + pad > v1) t = r + pad - el.clientWidth;
        if (Math.abs(t - v0) > 1) go(t, true);
      }
      el.addEventListener('scroll', () => {
        if (!moved && performance.now() > progUntil && Math.abs(el.scrollLeft - homeLeft) > 4) moved = true;
        if (!ticking) { ticking = true; raf(fades); }
      }, { passive: true });
      new MutationObserver(revealActive).observe(el, { attributes: true, attributeFilter: ['class'], subtree: true });
      new ResizeObserver(() => {
        const w = el.clientWidth;
        if (w && Math.abs(w - lastW) > 1) { lastW = w; centerActive(); fades(); }
      }).observe(el);
      mqPhone.addEventListener('change', () => { centerActive(); fades(); });
      fades();
    }

    // ---- tab strips whose panes slide sideways on phones (swipe or tap)
    function slidingPanes(nav, tabs, panes) {
      if (!nav || !tabs.length || panes.some(p => !p)) return;
      const vp = document.createElement('div');
      vp.className = 'pane-viewport';
      const tr = document.createElement('div');
      tr.className = 'pane-track';
      panes[0].parentNode.insertBefore(vp, panes[0]);
      vp.appendChild(tr);
      panes.forEach(p => tr.appendChild(p));
      nav._drive = true;

      let idx = Math.max(0, tabs.findIndex(t => t.classList.contains('active')));
      let settleTimer = 0;
      const width = () => tr.clientWidth;

      function paintThumb(frac) {
        const th = nav._thumb;
        if (!th) return;
        const f = clamp(frac, 0, tabs.length - 1);
        const i = Math.floor(f), j = Math.min(tabs.length - 1, i + 1), t = f - i;
        const a = tabs[i], b = tabs[j];
        if (!nav.offsetWidth || !a.offsetWidth) { th.classList.remove('on'); return; }
        th.classList.add('still', 'on');
        th.style.width = (a.offsetWidth + (b.offsetWidth - a.offsetWidth) * t) + 'px';
        th.style.left = (a.offsetLeft + (b.offsetLeft - a.offsetLeft) * t) + 'px';
      }
      function updateMore() {
        const p = panes[idx];
        vp.classList.toggle('more', !!p && p.scrollHeight - p.scrollTop - p.clientHeight > 6);
      }
      function toIndex(i, smooth) {
        const w = width();
        if (!w) return;
        const left = i * w;
        if (Math.abs(tr.scrollLeft - left) < 1) { paintThumb(i); return; }
        tr.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
        if (!smooth) paintThumb(i);
      }
      function settle() {
        const w = width();
        if (!w) return;
        const i = clamp(Math.round(tr.scrollLeft / w), 0, tabs.length - 1);
        if (i !== idx) { idx = i; tabs[i].click(); }
        updateMore();
      }

      tr.addEventListener('scroll', () => {
        if (!isPhone() || !width()) return;
        paintThumb(tr.scrollLeft / width());
        clearTimeout(settleTimer);
        settleTimer = setTimeout(settle, 110);
      }, { passive: true });
      tabs.forEach((t, i) => t.addEventListener('click', () => {
        idx = i;
        if (isPhone()) toIndex(i, true);
        raf(updateMore);
      }));
      new MutationObserver(() => {
        const a = tabs.findIndex(t => t.classList.contains('active'));
        if (a >= 0 && a !== idx) { idx = a; if (isPhone()) toIndex(a, true); }
      }).observe(nav, { attributes: true, attributeFilter: ['class'], subtree: true });
      panes.forEach(p => p.addEventListener('scroll', updateMore, { passive: true }));
      new MutationObserver(() => raf(updateMore)).observe(tr, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'hidden', 'class'] });
      new ResizeObserver(() => { if (isPhone() && width()) { toIndex(idx, false); updateMore(); } }).observe(tr);
      const navRO = new ResizeObserver(() => { if (isPhone() && width()) paintThumb(tr.scrollLeft / width()); });
      navRO.observe(nav);
      tabs.forEach(t => navRO.observe(t));
      mqPhone.addEventListener('change', () => {
        if (isPhone()) { toIndex(idx, false); updateMore(); } else if (nav._place) nav._place();
      });
    }

    carousel(document.getElementById('annStyleGroup'));
    carousel(document.getElementById('colTemplateGroup'));
    carousel(document.getElementById('reelPresetGroup'));
    carousel(document.getElementById('reelCurveGroup'));

    const byAttr = (navSel, attr, resolve) => {
      const nav = document.querySelector(navSel);
      const tabs = nav ? Array.from(nav.querySelectorAll('[' + attr + ']')) : [];
      return [nav, tabs, tabs.map(t => resolve(t.getAttribute(attr)))];
    };
    slidingPanes(...byAttr('#collageTabsNav', 'data-ctab', id => document.getElementById(id)));
    slidingPanes(...byAttr('#reelTabsNav', 'data-rtab', id => document.getElementById(id)));
    slidingPanes(...byAttr('#annTabs', 'data-atab', k => document.querySelector('#annotateDeck .ann-pane[data-apane="' + k + '"]')));

    // ---- small state mirrors so pure CSS can pick the right icon / layout
    function mirrorText(id, fn) {
      const el = document.getElementById(id);
      if (!el) return;
      const sync = () => { el.dataset.s = fn(el.textContent.trim()); };
      new MutationObserver(sync).observe(el, { childList: true, characterData: true, subtree: true });
      sync();
    }
    mirrorText('btnTogglePlayReel', t => (t === 'Pause' ? 'pause' : 'play'));
    mirrorText('btnColToggleDragMode', t => (/text/i.test(t) ? 'text' : 'pan'));

    const strip = document.getElementById('filmstrip');
    const bar = document.querySelector('.filmstrip-bar');
    if (strip && bar) {
      const sync = () => bar.classList.toggle('is-empty', !!strip.querySelector('.strip-empty') || !strip.children.length);
      new MutationObserver(sync).observe(strip, { childList: true });
      sync();
    }

    // ---- every toolbar button keeps a readable name (tooltip + screen readers) even when only its icon is shown
    document.querySelectorAll('.hud-btn').forEach(btn => {
      const label = btn.textContent.replace(/\s+/g, ' ').trim();
      if (label && !btn.title) btn.title = label;
      if (label && !btn.getAttribute('aria-label')) btn.setAttribute('aria-label', label);
    });

    // ---- floating toolbars (desktop / landscape phones) fall back to icon-only when the stage is too narrow for labels
    function fitToolbars() {
      const ws = document.getElementById('workspace');
      if (!ws) return;
      const room = ws.clientWidth - 30;
      ws.classList.toggle('narrow', ws.clientWidth < 780);   // too tight for the keyboard-shortcut hint
      const narrow = ws.clientWidth < 740;   // same look in every mode: the widest toolbar needs ~710px
      document.querySelectorAll('.canvas-hud').forEach(h => {
        if (isPhone()) { h.classList.remove('compact'); return; }
        if (!h.offsetParent) { h.classList.toggle('compact', narrow); return; }
        const was = h.classList.contains('compact');
        if (was) h.classList.remove('compact');
        const natural = h.scrollWidth;
        h.classList.toggle('compact', narrow || natural > room);
      });
    }

    // ---- layout measurements that CSS cannot know: header height (toast) and toolbar reserve (reel stage)
    function measure() {
      const hdr = document.querySelector('.top-bar');
      if (hdr) root.style.setProperty('--hdr-h', Math.round(hdr.getBoundingClientRect().bottom) + 'px');
      fitToolbars();
      root.style.setProperty('--hud-reserve', stageBottomPad() + 'px');
    }
    measure();
    window.addEventListener('resize', measure);
    mqPhone.addEventListener('change', () => raf(measure));
    const ro = new ResizeObserver(() => raf(measure));
    ro.observe(document.querySelector('.top-bar'));
    document.querySelectorAll('.canvas-hud').forEach(h => ro.observe(h));
    const wsEl = document.getElementById('workspace');
    if (wsEl) ro.observe(wsEl);
  })();

  // Initialize
  updateAnnotationExportUI();
  requestAnimationFrame(() => {
    syncCanvasSize();
    loadDemoImage(true);
  });
})();
