/* Canonical catalogue identifiers and conservative cross-identification. */
(() => {
  'use strict';

  const codes = Object.freeze(['M', 'NGC', 'IC', 'C', 'B', 'Sh 2-', 'vdB', 'RCW', 'LDN', 'LBN',
    'PN G', 'SNR G', 'Tr', 'Mel', 'Cr', 'ESO', 'PGC']);
  const order = new Map(codes.map((code, i) => [code, i]));
  const aliasesByPrefix = new Map(codes.map(code => [code.toUpperCase().replace(/\s/g, ''), code]));
  for (const [name, code] of [['MESSIER', 'M'], ['CALDWELL', 'C'], ['BARNARD', 'B'], ['SHARPLESS', 'Sh 2-'],
    ['TRUMPLER', 'Tr'], ['MELOTTE', 'Mel'], ['COLLINDER', 'Cr']]) aliasesByPrefix.set(name, code);

  const normal = /^(Messier|Caldwell|Barnard|Sharpless|Trumpler|Melotte|Collinder|NGC|IC|Sh\s*2\s*-|vdB|RCW|LDN|LBN|Tr|Mel|Cr|PGC|M|C|B)\s*(\d+)\s*([A-Za-z]{0,3})$/i;
  const native = /^(PN\s*G|SNR\s*G)\s*(\d+(?:\.\d+)?)\s*([+-])\s*(\d+(?:\.\d+)?)$/i;
  const eso = /^ESO\s*(\d+)\s*[- ]\s*(\d+)$/i;
  const stellar = /^(HIP|HD|HR|HYG|TYC)\s*(\d+(?:\s*-\s*\d+){0,2})\s*([A-Za-z]{0,2})$/i;
  const radians = Math.PI / 180;

  function identifier(input) {
    const value = String(input ?? '').trim().replace(/[−–—]/g, '-');
    let match = normal.exec(value);
    if (match) {
      const code = aliasesByPrefix.get(match[1].toUpperCase().replace(/\s/g, ''));
      const digits = String(Number(match[2])) + match[3].toUpperCase();
      const display = code.endsWith('-') ? code + digits : code + ' ' + digits;
      return { code, display, key: display.toUpperCase().replace(/\s/g, '') };
    }
    match = native.exec(value);
    if (match) {
      const code = aliasesByPrefix.get(match[1].toUpperCase().replace(/\s/g, ''));
      return { code, display: `${code} ${match[2]}${match[3]}${match[4]}`,
        key: code.replace(/\s/g, '') + Number(match[2]) + match[3] + Number(match[4]) };
    }
    match = eso.exec(value);
    if (match) return { code: 'ESO', display: `ESO ${match[1]}-${match[2]}`, key: `ESO${Number(match[1])}-${Number(match[2])}` };
    match = stellar.exec(value);
    if (match) return { code: '', display: value, key: match[1].toUpperCase() + match[2].split('-').map(Number).join('-') + match[3].toUpperCase(), stellar: true };
    return { code: '', display: value, key: value.toUpperCase().replace(/\s+/g, '') };
  }

  function catalogueCode(id) { return identifier(id).code; }

  function matchesCatalogueCode(id, code) {
    return !code || code === 'all' || (code === 'other' ? !catalogueCode(id) : catalogueCode(id) === code);
  }

  const kinds = new Map(Object.entries({
    '*': 'star', '**': 'star', MUL: 'star', 'SY*': 'star', 'EM*': 'star', 'V*': 'star', 'WD*': 'star',
    'TT*': 'star', 'C*': 'star', 'NO*': 'star', 'Y*O': 'star', YSO: 'star', NOVA: 'star',
    G: 'galaxy', GX: 'galaxy', AGX: 'galaxy', RG: 'galaxy', GIG: 'galaxy', IG: 'interacting',
    GPAIR: 'pair', GTRPL: 'group', GGROUP: 'group', IG2: 'pair', IG3: 'group', CGG: 'group',
    CLG: 'galaxy cluster', GXCL: 'galaxy cluster', SCG: 'galaxy cluster', POG: 'galaxy component',
    QSO: 'quasar', 'Q?': 'quasar', BLL: 'quasar', BLA: 'quasar',
    OCL: 'open cluster', OC: 'open cluster', OPC: 'open cluster', GCL: 'globular cluster', GC: 'globular cluster',
    CL: 'cluster', '*ASS': 'association', SA: 'association', SC: 'star cloud', 'CL+N': 'complex', 'C+N': 'complex',
    NEB: 'nebula', NB: 'nebula', EMN: 'emission', EN: 'emission', HII: 'emission', EMO: 'emission', SFR: 'emission',
    RFN: 'reflection', RN: 'reflection', RNE: 'reflection', DRKN: 'dark', DN: 'dark', DNE: 'dark', DG: 'globule',
    PN: 'planetary', PNB: 'planetary', 'PN?': 'planetary candidate', SNR: 'remnant', SNRG: 'remnant',
    'SR?': 'remnant candidate', SNRC: 'remnant candidate', MOC: 'molecular cloud', ISM: 'cloud', BUB: 'bubble'
  }));
  const nebulaKinds = new Set(['nebula', 'emission', 'reflection', 'dark', 'globule']);
  const compactKinds = new Set(['galaxy', 'galaxy component', 'quasar', 'planetary', 'planetary candidate']);
  const eagle = Object.freeze({ ra: 274.7007083, dec: -13.8072222 });
  const andromeda = Object.freeze({ ra: 10.6847917, dec: 41.2690556 });
  const eagleIds = new Set(['M16', 'NGC6611', 'IC4703']);
  const eagleKinds = new Set(['open cluster', 'cluster', 'complex', 'nebula', 'emission']);
  const separateElephantIds = new Set(['IC1396', 'IC1396A', 'VDB142', 'SH2-131']);
  const genericNames = new Set(['unknown', 'unnamed', 'opencluster', 'globularcluster', 'planetarynebula', 'darknebula',
    'emissionnebula', 'reflectionnebula', 'galaxygroup', 'galaxypair', 'galaxycluster', 'starcluster', 'supernovaremnant']);

  function angularDistance(first, second) {
    const a = first.dec * radians;
    const b = second.dec * radians;
    const d = Math.sin((b - a) / 2) ** 2 + Math.cos(a) * Math.cos(b) * Math.sin((second.ra - first.ra) * radians / 2) ** 2;
    return 120 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, d)))) / radians;
  }

  function nameIdentity(value) {
    if (typeof value !== 'string' || !value || identifier(value).code) return '';
    const name = value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    return name.length >= 8 && !genericNames.has(name) ? name : '';
  }

  function compatible(first, second, samePrimary) {
    if (first === second) return first !== 'other' || samePrimary;
    if (first === 'star' || second === 'star') return false;
    if (samePrimary && (first === 'other' || second === 'other')) return true;
    if (samePrimary && [first, second].includes('interacting') && [first, second].includes('galaxy')) return true;
    if ((first === 'nebula' || second === 'nebula') && nebulaKinds.has(first) && nebulaKinds.has(second)) return true;
    if (samePrimary && (first === 'complex' || second === 'complex')) {
      const component = first === 'complex' ? second : first;
      return ['nebula', 'emission', 'open cluster', 'cluster'].includes(component);
    }
    return false;
  }

  function partOfEagle(object) {
    return eagleIds.has(object.primary.key) && eagleKinds.has(object.kind) && angularDistance(eagle, object) <= 12;
  }

  function closeEnough(first, second, evidence) {
    const samePrimary = first.primary.key === second.primary.key;
    if (!samePrimary && separateElephantIds.has(first.primary.key) && separateElephantIds.has(second.primary.key)) return false;
    if (partOfEagle(first) && partOfEagle(second)) return true;
    if (!compatible(first.kind, second.kind, samePrimary)) return false;

    const distance = angularDistance(first, second);
    if (first.kind === 'star') {
      const opticalCatalogue = first.primary.stellar || second.primary.stellar;
      return evidence !== 'name' && distance <= (samePrimary ? (opticalCatalogue ? 0.2 : 1.8) : 0.06);
    }
    const a = first.size;
    const b = second.size;
    const comparable = !a || !b || Math.max(a, b) <= 3.5 * Math.min(a, b);
    const limitSize = Math.min(a || b || 0, b || a || 0);
    if (evidence === 'name') {
      if (first.primary.code && first.primary.code === second.primary.code && !samePrimary) return false;
      return comparable && first.kind === second.kind && distance <= Math.min(2, Math.max(0.25, limitSize * 0.12));
    }
    if (!samePrimary && first.primary.code && first.primary.code === second.primary.code) return false;
    if (!samePrimary && !comparable) return false;
    if (compactKinds.has(first.kind) || compactKinds.has(second.kind)) return distance <= Math.min(2, Math.max(0.3, limitSize * 0.18));
    if (samePrimary) return distance <= Math.min(20, Math.max(2, Math.max(a, b) * 0.65));
    return distance <= Math.min(8, Math.max(1, limitSize * 0.18));
  }

  function compareIdentity(first, second) {
    return (order.get(first.code) ?? codes.length) - (order.get(second.code) ?? codes.length);
  }

  function combineCatalogues(parts) {
    const entries = [];
    for (const part of parts) for (const row of part) {
      if (!Array.isArray(row) || !row[0] || !Number.isFinite(row[3]) || !Number.isFinite(row[4])) continue;
      const primary = identifier(row[0]);
      const kind = primary.key === 'M24' && angularDistance({ ra: row[3], dec: row[4] }, { ra: 274.2338, dec: -18.5146 }) < 15
        ? 'star cloud' : kinds.get(String(row[2]).toUpperCase().replace(/^ST:/, '')) || 'other';
      const alternatives = Array.isArray(row[7]) ? row[7].filter(alias => typeof alias === 'string' && alias.trim()) : [];
      entries.push({ row, primary, kind, alternatives, index: entries.length,
        ra: row[3], dec: row[4], size: row[6] > 0 ? row[6] : 0 });
    }
    const parents = Int32Array.from(entries, (_, index) => index);
    const joined = new Map();
    function root(index) {
      while (parents[index] !== index) {
        parents[index] = parents[parents[index]];
        index = parents[index];
      }
      return index;
    }
    function merge(first, second, evidence) {
      const a = root(first);
      const b = root(second);
      if (a === b || !closeEnough(entries[first], entries[second], evidence)) return;
      const left = joined.get(a) || [a];
      const right = joined.get(b) || [b];
      // A bridging alias must not unite two incompatible objects through a third.
      if (!left.every(i => right.every(j => closeEnough(entries[i], entries[j], evidence)))) return;
      const keep = Math.min(a, b);
      const drop = Math.max(a, b);
      parents[drop] = keep;
      joined.set(keep, left.concat(right));
      joined.delete(drop);
    }

    function add(index, key, entriesByKey, evidence) {
      const previous = entriesByKey.get(key);
      if (previous === undefined) {
        entriesByKey.set(key, index);
      } else if (typeof previous === 'number') {
        merge(index, previous, evidence);
        entriesByKey.set(key, [previous, index]);
      } else {
        for (const other of previous) merge(index, other, evidence);
        previous.push(index);
      }
    }

    const primaryIndex = new Map();
    entries.forEach((entry, index) => add(index, entry.primary.key, primaryIndex, 'id'));
    const strongAliases = new Map();
    entries.forEach((entry, index) => {
      const keys = new Set();
      for (const value of entry.alternatives) {
        const alias = identifier(value);
        const strong = entry.kind === 'star' ? alias.stellar : alias.code;
        if (!strong || alias.key === entry.primary.key || keys.has(alias.key)) continue;
        keys.add(alias.key);
        const previous = primaryIndex.get(alias.key);
        if (typeof previous === 'number') merge(index, previous, 'id');
        else if (previous) for (const other of previous) merge(index, other, 'id');
        add(index, alias.key, strongAliases, 'id');
      }
    });
    const names = new Map();
    let eagleGroup = -1;
    entries.forEach((entry, index) => {
      if (entry.kind !== 'star') {
        const name = nameIdentity(entry.row[1]);
        if (name) add(index, name, names, 'name');
      }
      if (!partOfEagle(entry)) return;
      if (eagleGroup >= 0) merge(index, eagleGroup, 'id');
      else eagleGroup = index;
    });

    function emit(index) {
      const members = (joined.get(index) || [index]).map(i => entries[i]);
      members.sort((a, b) => compareIdentity(a.primary, b.primary) || (b.row[8] || 0) - (a.row[8] || 0) || a.index - b.index);
      const preferred = members[0];
      const candidateIds = members.map(entry => entry.primary);
      if (preferred.kind !== 'star') for (const entry of members) for (const value of entry.alternatives) {
        const alias = identifier(value);
        if (!alias.code || compareIdentity(alias, preferred.primary) >= 0) continue;
        const main = primaryIndex.get(alias.key);
        const claims = strongAliases.get(alias.key);
        const owners = typeof main === 'number' ? [main] : main || [];
        const otherAliases = typeof claims === 'number' ? [claims] : claims || [];
        if (owners.concat(otherAliases).every(i => root(i) === index)) candidateIds.push(alias);
      }
      if (members.some(partOfEagle)) candidateIds.push(identifier('M 16'));
      candidateIds.sort(compareIdentity);
      const primary = candidateIds[0];
      const preferredId = primary.display;
      const row = [...preferred.row];
      if (row[2] === 'Other') {
        const specific = members.find(entry => entry.kind !== 'other');
        if (specific) row[2] = specific.row[2];
      }
      const aliasStrings = [];
      const seenNames = new Set([preferredId.toLowerCase()]);
      function retainAlias(value) {
        const text = String(value || '').trim();
        const key = text.toLowerCase();
        if (text && !seenNames.has(key)) { seenNames.add(key); aliasStrings.push(text); }
      }
      row[0] = preferredId;
      for (const entry of members) {
        retainAlias(entry.row[0]);
        entry.alternatives.forEach(retainAlias);
        if (!row[1]) row[1] = entry.row[1];
        else if (row[1] !== entry.row[1]) retainAlias(entry.row[1]);
        if (row[2] === 'Neb' && /^ST:(HII|EN|RN|DN|SNR|MOC|PN)$/.test(entry.row[2])) row[2] = entry.row[2];
        if (row[5] == null && Number.isFinite(entry.row[5])) row[5] = entry.row[5];
        if (row[6] == null && Number.isFinite(entry.row[6])) row[6] = entry.row[6];
        row[8] = Math.max(row[8] || 0, entry.row[8] || 0);
      }
      if (primary.key === 'M16' && members.some(partOfEagle)) {
        row[1] = 'Eagle Nebula';
        row[2] = 'ST:C+N';
        retainAlias('NGC 6611');
        retainAlias('IC 4703');
      }
      if (primary.key === 'M31' && preferred.kind === 'galaxy' && angularDistance(preferred, andromeda) <= 12) {
        if (row[1] !== 'Andromeda Galaxy') retainAlias(row[1]);
        retainAlias('Andromeda Nebula');
        row[1] = 'Andromeda Galaxy';
      }
      if (primary.key === 'M24' && preferred.kind === 'star cloud') row[2] = 'ST:SC';
      row[7] = aliasStrings;
      return row;
    }

    const rows = [];
    for (let index = 0; index < entries.length; index++) if (root(index) === index) rows.push(emit(index));
    const occupied = new Set(rows.map(row => identifier(row[0]).key));
    const seen = new Set();
    const result = [];
    for (const row of rows) {
      const primary = identifier(row[0]);
      if (seen.has(primary.key)) {
        // Sources can disagree about which sky object a designation denotes.
        // Never combine conflicting positions or publish two pins with one ID.
        // Keep the separate object if it has its own unused catalogue identifier.
        const alternatives = row[7].map(identifier).filter(id => id.code && !occupied.has(id.key));
        alternatives.sort(compareIdentity);
        if (!alternatives.length) continue;
        const replacement = alternatives[0];
        occupied.add(replacement.key);
        row[0] = replacement.display;
        row[7] = row[7].filter(alias => ![primary.key, replacement.key].includes(identifier(alias).key));
      } else seen.add(primary.key);
      result.push(row);
    }
    return result;
  }

  const api = Object.freeze({ codes, catalogueCode, matchesCatalogueCode, combineCatalogues });
  globalThis.PlateCatalogue = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})();

/* Local celestial WCS projection and catalogue annotations. */
(() => {
  'use strict';

  const radians = Math.PI / 180;
  const wcsReadLimit = 1024 * 1024;
  const objectTypes = Object.freeze({
    '*': 'Star',
    '**': 'Double star',
    '*Ass': 'Stellar association',
    'Cl+N': 'Cluster with nebula',
    DrkN: 'Dark nebula',
    EmN: 'Emission nebula',
    G: 'Galaxy',
    GCl: 'Globular cluster',
    GGroup: 'Galaxy group',
    GPair: 'Galaxy pair',
    GTrpl: 'Galaxy triplet',
    HII: 'Emission nebula',
    Neb: 'Nebula',
    Nova: 'Nova',
    OCl: 'Open cluster',
    PN: 'Planetary nebula',
    RfN: 'Reflection nebula',
    SNR: 'Supernova remnant',
    Other: 'Other catalogue object'
  });

  function readHeader(input) {
    if (input instanceof ArrayBuffer) input = new Uint8Array(input);
    if (ArrayBuffer.isView(input)) {
      input = new TextDecoder().decode(
        new Uint8Array(input.buffer, input.byteOffset, Math.min(input.byteLength, wcsReadLimit))
      );
    }
    if (input && typeof input === 'object') {
      return Object.fromEntries(Object.entries(input).map(([key, value]) => [key.toUpperCase(), value]));
    }
    if (typeof input !== 'string') throw new Error('Choose a FITS WCS header for this image.');

    const header = Object.create(null);
    const text = input.replace(/^\uFEFF/, '').slice(0, wcsReadLimit).trimStart();
    const firstBreak = text.search(/[\r\n]/);
    const newlineSeparated = firstBreak >= 0 && firstBreak <= 80;
    const cards = newlineSeparated ? text.split(/\r?\n/) : text.match(/[\s\S]{1,80}/g) || [];
    for (const card of cards) {
      if (card.trim() === 'END') break;
      const match = card.match(/^\s*([A-Z0-9_-]{1,8})\s*=\s*(.*)/i);
      if (!match) continue;
      const [, key, rawValue] = match;
      const quoted = rawValue.match(/^'((?:[^']|'')*)'/);
      const value = quoted
        ? quoted[1].replace(/''/g, "'").trim()
        : rawValue.split('/')[0].trim();
      header[key.toUpperCase()] = value;
    }
    return header;
  }

  function number(header, key, fallback = NaN) {
    const value = header[key];
    if (typeof value === 'number') return value;
    if (typeof value !== 'string' || !value.trim()) return fallback;
    const parsed = Number(value.replace(/[dD]/, 'E'));
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function text(header, key) {
    const value = header[key];
    return typeof value === 'string' ? value.trim().toUpperCase() : '';
  }

  function dimension(header, imageKey, axisKey, fallback) {
    for (const value of [number(header, imageKey), number(header, axisKey), fallback]) {
      if (Number.isSafeInteger(value) && value > 0) return value;
    }
    throw new Error('The WCS does not specify image dimensions. Load the matching image first.');
  }

  function unitDegrees(header, key) {
    const unit = text(header, key);
    if (!unit || unit === 'DEG') return 1;
    if (unit === 'RAD') return 1 / radians;
    if (unit === 'ARCSEC') return 1 / 3600;
    if (unit === 'ARCMIN') return 1 / 60;
    throw new Error('The WCS uses unsupported sky-coordinate units.');
  }

  function readMatrix(header) {
    let values;
    const cdKeys = ['CD1_1', 'CD1_2', 'CD2_1', 'CD2_2'];
    const pcKeys = ['PC1_1', 'PC1_2', 'PC2_1', 'PC2_2'];
    if (cdKeys.some(key => key in header)) {
      values = cdKeys.map(key => number(header, key, 0));
    } else {
      const axis1 = number(header, 'CDELT1', 1);
      const axis2 = number(header, 'CDELT2', 1);
      if (pcKeys.some(key => key in header)) {
        values = [
          axis1 * number(header, 'PC1_1', 1),
          axis1 * number(header, 'PC1_2', 0),
          axis2 * number(header, 'PC2_1', 0),
          axis2 * number(header, 'PC2_2', 1)
        ];
      } else {
        const angle = number(header, 'CROTA2', number(header, 'CROTA1', 0)) * radians;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        values = [axis1 * cos, -axis2 * sin, axis1 * sin, axis2 * cos];
      }
    }
    const factor1 = unitDegrees(header, 'CUNIT1');
    const factor2 = unitDegrees(header, 'CUNIT2');
    return [values[0] * factor1, values[1] * factor1, values[2] * factor2, values[3] * factor2];
  }

  function readSip(header, prefix) {
    const order = number(header, prefix + '_ORDER', 0);
    if (!Number.isInteger(order) || order < 0 || order > 9) {
      throw new Error('The WCS uses an unsupported SIP polynomial order.');
    }
    const terms = [];
    for (let i = 0; i <= order; i++) {
      for (let j = 0; i + j <= order; j++) {
        const coefficient = number(header, prefix + '_' + i + '_' + j, 0);
        if (coefficient) terms.push({ i, j, coefficient });
      }
    }
    return terms;
  }

  function polynomial(terms, u, v) {
    let value = 0;
    for (const { i, j, coefficient } of terms) value += coefficient * u ** i * v ** j;
    return value;
  }

  function sipDerivatives(terms, u, v) {
    let du = 0;
    let dv = 0;
    for (const { i, j, coefficient } of terms) {
      if (i) du += coefficient * i * u ** (i - 1) * v ** j;
      if (j) dv += coefficient * j * u ** i * v ** (j - 1);
    }
    return [du, dv];
  }

  function inverseSip(targetU, targetV, a, b) {
    // Solve the forward SIP equations directly. The optional inverse SIP
    // polynomials are approximations and may be absent from a valid header.
    let u = targetU;
    let v = targetV;
    for (let attempt = 0; attempt < 15; attempt++) {
      const errorU = u + polynomial(a, u, v) - targetU;
      const errorV = v + polynomial(b, u, v) - targetV;
      if (Math.max(Math.abs(errorU), Math.abs(errorV)) < 1e-5) return [u, v];
      const [aU, aV] = sipDerivatives(a, u, v);
      const [bU, bV] = sipDerivatives(b, u, v);
      const determinant = (1 + aU) * (1 + bV) - aV * bU;
      if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return null;
      u -= ((1 + bV) * errorU - aV * errorV) / determinant;
      v -= ((1 + aU) * errorV - bU * errorU) / determinant;
    }
    return null;
  }

  function separation(first, second) {
    const declination1 = first.dec * radians;
    const declination2 = second.dec * radians;
    const sinDec = Math.sin((declination2 - declination1) / 2);
    const sinRa = Math.sin((second.ra - first.ra) * radians / 2);
    const halfChord = sinDec ** 2 + Math.cos(declination1) * Math.cos(declination2) * sinRa ** 2;
    return 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, halfChord)))) / radians;
  }

  function parseWcs(input, options = {}) {
    const header = readHeader(input);
    const axisOne = text(header, 'CTYPE1');
    const axisTwo = text(header, 'CTYPE2');
    const raFirst = /^RA---TAN(?:-SIP)?$/.test(axisOne) && /^DEC--TAN(?:-SIP)?$/.test(axisTwo);
    const decFirst = /^DEC--TAN(?:-SIP)?$/.test(axisOne) && /^RA---TAN(?:-SIP)?$/.test(axisTwo);
    if (!raFirst && !decFirst) throw new Error('This WCS is not an equatorial TAN or TAN-SIP solution.');

    const equinox = number(header, 'EQUINOX', number(header, 'EPOCH', 2000));
    const frame = text(header, 'RADESYS') || text(header, 'RADECSYS');
    if ((frame && frame !== 'ICRS' && frame !== 'FK5') || (frame !== 'ICRS' && equinox !== 2000)) {
      throw new Error('This WCS must use ICRS or J2000 equatorial coordinates.');
    }
    if (Object.keys(header).some(key => /^PV[12]_\d+$/.test(key))) {
      throw new Error('This WCS includes unsupported PV projection parameters.');
    }

    const width = dimension(header, 'IMAGEW', 'NAXIS1', options.width);
    const height = dimension(header, 'IMAGEH', 'NAXIS2', options.height);
    const rowOrigin = options.rowOrigin || 'bottom';
    if (rowOrigin !== 'top' && rowOrigin !== 'bottom') throw new Error('Invalid WCS row orientation.');

    const crpixX = number(header, 'CRPIX1');
    const crpixY = number(header, 'CRPIX2');
    const crval1 = number(header, 'CRVAL1') * unitDegrees(header, 'CUNIT1');
    const crval2 = number(header, 'CRVAL2') * unitDegrees(header, 'CUNIT2');
    const refRa = (raFirst ? crval1 : crval2) * radians;
    const refDec = (raFirst ? crval2 : crval1) * radians;
    const [m11, m12, m21, m22] = readMatrix(header);
    const [cd11, cd12, cd21, cd22] = raFirst ? [m11, m12, m21, m22] : [m21, m22, m11, m12];
    const determinant = cd11 * cd22 - cd12 * cd21;
    if (![crpixX, crpixY, refRa, refDec, determinant].every(Number.isFinite)
        || Math.abs(refDec) > Math.PI / 2 || determinant === 0) {
      throw new Error('The WCS does not contain a valid reference point and pixel transformation.');
    }
    const sinDec = Math.sin(refDec);
    const cosDec = Math.cos(refDec);
    const defaultPole = refDec === Math.PI / 2 ? 0 : 180;
    const poleAngle = (number(header, 'LONPOLE', defaultPole) - 180) * radians;
    const sinPole = Math.sin(poleAngle);
    const cosPole = Math.cos(poleAngle);
    const a = readSip(header, 'A');
    const b = readSip(header, 'B');

    // WCS pixels are 1-based. The raster row order is chosen separately from
    // the CD parity: Astrometry.net preserves JPEG/PNG row order in .wcs.
    function pixelToWorld(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      const u = x + 1 - crpixX;
      const v = (rowOrigin === 'top' ? y + 1 : height - y) - crpixY;
      const correctedU = u + polynomial(a, u, v);
      const correctedV = v + polynomial(b, u, v);
      const plateX = (cd11 * correctedU + cd12 * correctedV) * radians;
      const plateY = (cd21 * correctedU + cd22 * correctedV) * radians;
      const east = cosPole * plateX + sinPole * plateY;
      const north = -sinPole * plateX + cosPole * plateY;
      const meridian = cosDec - north * sinDec;
      const ra = (refRa + Math.atan2(east, meridian)) / radians;
      const dec = Math.atan2(sinDec + north * cosDec, Math.hypot(east, meridian)) / radians;
      return { ra: ((ra % 360) + 360) % 360, dec };
    }

    function worldToPixel(ra, dec) {
      if (!Number.isFinite(ra) || !Number.isFinite(dec) || Math.abs(dec) > 90) return null;
      const deltaRa = ra * radians - refRa;
      const skyDec = dec * radians;
      const skySin = Math.sin(skyDec);
      const skyCos = Math.cos(skyDec);
      const cosDelta = Math.cos(deltaRa);
      const denominator = sinDec * skySin + cosDec * skyCos * cosDelta;
      if (denominator <= 1e-12) return null;
      const east = skyCos * Math.sin(deltaRa) / denominator / radians;
      const north = (cosDec * skySin - sinDec * skyCos * cosDelta) / denominator / radians;
      const plateX = cosPole * east - sinPole * north;
      const plateY = sinPole * east + cosPole * north;
      const targetU = (cd22 * plateX - cd12 * plateY) / determinant;
      const targetV = (cd11 * plateY - cd21 * plateX) / determinant;
      const uv = a.length || b.length ? inverseSip(targetU, targetV, a, b) : [targetU, targetV];
      if (!uv) return null;
      const x = uv[0] + crpixX - 1;
      const y = rowOrigin === 'top' ? uv[1] + crpixY - 1 : height - uv[1] - crpixY;
      return { x, y };
    }

    const cx = (width - 1) / 2;
    const cy = (height - 1) / 2;
    const center = pixelToWorld(cx, cy);
    const fov = {
      width_deg: separation(pixelToWorld(-0.5, cy), pixelToWorld(width - 0.5, cy)),
      height_deg: separation(pixelToWorld(cx, -0.5), pixelToWorld(cx, height - 0.5))
    };
    const scale_arcsec = Math.sqrt(Math.abs(determinant)) * 3600;
    function scaleAt(x, y, stepX = 1, stepY = 1) {
      const dx = separation(pixelToWorld(x - stepX / 2, y), pixelToWorld(x + stepX / 2, y));
      const dy = separation(pixelToWorld(x, y - stepY / 2), pixelToWorld(x, y + stepY / 2));
      return Math.sqrt(dx * dy) * 3600;
    }
    return { solved: true, width, height, center, fov, scale_arcsec, scaleAt, worldToPixel, pixelToWorld };
  }

  // The same provider interface for a panorama or fisheye frame: the solver fitted a projection model (see custom/projection.js) instead of a
  // TAN header. spec = { width, height, model, area } in the pixels of the picture the annotations are placed on. Stars outside the sky area
  // (the ground, the border) and outside the part of the projection the frame uses have no pixel, so they are never annotated.
  function makeProjectionWcs(spec) {
    const P = globalThis.InstaSliceProjection;
    if (!P) throw new Error('The projection module is not loaded.');
    const { width, height } = spec;
    const model = { ...spec.model };
    const area = spec.area;
    const slack = 0.5;
    function worldToPixel(ra, dec) {
      if (!Number.isFinite(ra) || !Number.isFinite(dec) || Math.abs(dec) > 90) return null;
      const p = P.project(model, P.toVector(ra, dec));
      if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
      if (p[0] < area.x0 - slack || p[0] > area.x1 + slack || p[1] < area.y0 - slack || p[1] > area.y1 + slack) return null;
      return { x: p[0], y: p[1] };
    }
    function pixelToWorld(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      const v = P.unproject(model, x, y);
      return v ? P.toSky(v) : null;
    }
    const mx = (area.x0 + area.x1) / 2, my = (area.y0 + area.y1) / 2;
    const center = pixelToWorld(mx, my);
    const extent = P.extentOf(model, width, height, area);
    const fov = { width_deg: extent.width_deg, height_deg: extent.height_deg };
    const sample = P.samplingAt(model, mx, my) || { x: 1, y: 1 };
    const scale_arcsec = Math.sqrt(sample.x * sample.y);
    function scaleAt(x, y, stepX = 1, stepY = 1) {
      const a = P.unproject(model, x - stepX / 2, y), b = P.unproject(model, x + stepX / 2, y);
      const c = P.unproject(model, x, y - stepY / 2), d = P.unproject(model, x, y + stepY / 2);
      if (!a || !b || !c || !d) return NaN;
      return Math.sqrt(P.separation(a, b) * P.separation(c, d)) * 3600;
    }
    return { solved: true, projection: true, width, height, center, fov, scale_arcsec, scaleAt, worldToPixel, pixelToWorld };
  }

  // A stitched frame may support good local calibrations even if one projection cannot describe it.
  function makeLocalSkyWcs(fields, width, height, sx, sy) {
    const P = globalThis.InstaSliceProjection;
    const parts = fields.map(spec => {
      const {hull,mapping} = spec;
      const wcs = parseWcs(spec.header);
      const toFrame = (x,y) => {
        const p = mapping ? P.fromTangentPatch(mapping,mapping.cx,mapping.cy,mapping.size,x,y)
          : [spec.x+x+.5,spec.y+y+.5];
        return { x:p[0]*sx-.5, y:p[1]*sy-.5 };
      };
      const toLocal = (x,y) => {
        const px = (x+.5)/sx, py = (y+.5)/sy;
        return mapping ? P.toTangentPatch(mapping,mapping.cx,mapping.cy,mapping.size,px,py)
          : [px-spec.x-.5,py-spec.y-.5];
      };
      const margin = (x,y) => {
        if (x < 0 || y < 0 || x >= wcs.width || y >= wcs.height) return -Infinity;
        let distance = Infinity;
        for (let i = 0; i < hull.length; i++) {
          const [ax,ay] = hull[i], [bx,by] = hull[(i+1)%hull.length];
          const dx = bx-ax, dy = by-ay;
          distance = Math.min(distance,(dx*(y-ay)-dy*(x-ax))/(Math.hypot(dx,dy)||1));
        }
        return distance;
      };
      return { wcs,toFrame,toLocal,margin };
    });
    const centrePart = parts[Math.floor(parts.length/2)].wcs, center = centrePart.center;
    const bound = Math.max(...parts.map(({wcs}) =>
      separation(center,wcs.center) + Math.max(wcs.fov.width_deg,wcs.fov.height_deg)));
    function worldToPixel(ra,dec) {
      let best = 0, result = null;
      for (const part of parts) {
        const p = part.wcs.worldToPixel(ra,dec);
        if (!p) continue;
        const weight = part.margin(p.x,p.y);
        if (weight <= best) continue;
        best = weight; result = part.toFrame(p.x,p.y);
      }
      return result;
    }
    function pixelToWorld(x,y) {
      let best = 0, result = null;
      for (const part of parts) {
        const p = part.toLocal(x,y);
        if (!p) continue;
        const weight = part.margin(...p);
        if (weight <= best) continue;
        best = weight; result = part.wcs.pixelToWorld(...p);
      }
      return result;
    }
    function scaleAt(x,y,stepX=1,stepY=1) {
      const centre = pixelToWorld(x,y);
      const a = pixelToWorld(x-stepX/2,y), b = pixelToWorld(x+stepX/2,y);
      const c = pixelToWorld(x,y-stepY/2), d = pixelToWorld(x,y+stepY/2);
      return centre && a && b && c && d ? Math.sqrt(separation(a,b)*separation(c,d))*3600 : NaN;
    }
    return { solved:true, width,height, center, fov:{ width_deg:bound,height_deg:bound },
      scale_arcsec:centrePart.scale_arcsec/Math.sqrt(sx*sy), scaleAt, worldToPixel, pixelToWorld,
      sections:parts.map(part=>part.wcs) };
  }

  const stellariumTypes = Object.freeze({
    G: 'Galaxy', GX: 'Galaxy', AGX: 'Active galaxy', RG: 'Radio galaxy',
    IG: 'Interacting galaxy', IG2: 'Galaxy pair', IG3: 'Galaxy triplet',
    GIG: 'Galaxy in a group', POG: 'Part of a galaxy', CGG: 'Galaxy group',
    CLG: 'Galaxy cluster', GXCL: 'Galaxy cluster', SCG: 'Galaxy supercluster',
    GC: 'Globular cluster', OC: 'Open cluster', OPC: 'Open cluster', CL: 'Cluster',
    NB: 'Nebula', DN: 'Dark nebula', DNE: 'Dark nebula', RN: 'Reflection nebula',
    RNE: 'Reflection nebula', EN: 'Emission nebula', HII: 'H II emission region',
    PN: 'Planetary nebula', PNB: 'Planetary nebula', 'PN?': 'Planetary nebula candidate',
    PPN: 'Protoplanetary nebula', BN: 'Bipolar nebula', 'C+N': 'Cluster with nebulosity',
    SNR: 'Supernova remnant', SNRG: 'Supernova remnant', 'SR?': 'Supernova remnant candidate',
    SNC: 'Supernova candidate', SNRC: 'Supernova remnant candidate',
    MOC: 'Molecular cloud', SFR: 'Star-forming region', ISM: 'Interstellar cloud',
    BUB: 'Interstellar bubble', EMO: 'Emission object', SA: 'Stellar association',
    SC: 'Star cloud', YSO: 'Young stellar object', 'Y*O': 'Young stellar object',
    '*': 'Star', '**': 'Double star', MUL: 'Multiple star', 'SY*': 'Symbiotic star',
    'EM*': 'Emission-line star', 'V*': 'Variable star', 'WD*': 'White dwarf',
    'TT*': 'T Tauri star', 'C*': 'Carbon star', 'NO*': 'Nova',
    QSO: 'Quasar', 'Q?': 'Quasar candidate', BLL: 'BL Lac object', BLA: 'Blazar',
    IR: 'Infrared source'
  });

  function objectType(kind) {
    if (kind === 'DG') return 'Dark globule';
    if (kind === 'Cl+N') return 'Cluster with nebulosity';
    if (kind === 'HII') return 'H II emission region';
    if (kind.startsWith('ST:')) return stellariumTypes[kind.slice(3)] || 'Deep-sky object';
    return objectTypes[kind] || 'Deep-sky object';
  }

  function categoryFor(type) {
    if (/galaxy|galaxies|quasar|blazar|BL Lac/i.test(type)) return 'galaxies';
    if (/cluster|association|star cloud/i.test(type)) return 'clusters';
    if (/nebula|globule|emission region|cloud|supernova remnant|interstellar|star-forming/i.test(type)) return 'nebulae';
    if (/\bstar\b|stellar object|white dwarf/i.test(type)) return 'stars';
    return 'other';
  }

  const { combineCatalogues, catalogueCode } = globalThis.PlateCatalogue;

  function annotate(wcs, catalog) {
    const { width, height, scale_arcsec: scale } = wcs;
    const objects = [];
    // Bounding the declination before the inverse WCS keeps dense catalogues
    // inexpensive, including when a FITS solution carries SIP polynomials.
    const corners = [
      wcs.pixelToWorld(-0.5,-0.5), wcs.pixelToWorld(width-0.5,-0.5),
      wcs.pixelToWorld(-0.5,height-0.5), wcs.pixelToWorld(width-0.5,height-0.5)
    ].filter(Boolean);
    const decBound = Math.max(wcs.fov.width_deg, wcs.fov.height_deg,
      ...corners.map(corner => separation(wcs.center, corner))) + 1;
    for (const [id, name, kind, ra, dec, mag, majorArcmin, aliases = [], priority = 0] of catalog) {
      if (Math.abs(dec - wcs.center.dec) > decBound) continue;
      const pixel = wcs.worldToPixel(ra, dec);
      if (!pixel) continue;
      const { x, y } = pixel;
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < -0.5 || x > width - 0.5
          || y < -0.5 || y > height - 0.5) continue;
      const type = objectType(kind);
      const radius_px = Number.isFinite(majorArcmin) && scale > 0
        ? majorArcmin*30 / ((wcs.projection || wcs.sections) && wcs.scaleAt(x,y) || scale)
        : null;
      objects.push({ id, name, type, category: categoryFor(type), catalogueCode: catalogueCode(id),
        ra, dec, mag, x, y, radius_px, aliases, priority });
    }
    return { width, height, objects };
  }

  const brightStarCache = new Map();
  let bundleCache = null;

  async function fetchJsonSameOrigin(url, signal) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      referrerPolicy: 'no-referrer',
      mode: 'same-origin',
      signal
    });
    if (!response.ok) throw new Error('Could not load the local annotation catalogues.');
    return response.json();
  }

  async function loadCatalog(urls, signal) {
    const files = Array.isArray(urls) ? urls : [urls];
    const parts = await Promise.all(files.map(async url => {
      const catalog = await fetchJsonSameOrigin(url, signal);
      if (![1, 2].includes(catalog.version) || !Array.isArray(catalog.objects)) {
        throw new Error('The local annotation catalogue is unreadable.');
      }
      return catalog.objects;
    }));
    return combineCatalogues(parts);
  }

  async function loadBrightStars(url, signal) {
    const key = String(url);
    if (brightStarCache.has(key)) return brightStarCache.get(key);
    const data = await fetchJsonSameOrigin(url, signal);
    const objects = Array.isArray(data && data.objects) ? data.objects : [];
    brightStarCache.set(key, objects);
    return objects;
  }

  function tileKeysForWcs(wcs, manifest) {
    const { width, height, center, fov } = wcs;
    const pts = [
      wcs.pixelToWorld(-0.5, -0.5),
      wcs.pixelToWorld(width - 0.5, -0.5),
      wcs.pixelToWorld(-0.5, height - 0.5),
      wcs.pixelToWorld(width - 0.5, height - 0.5),
      wcs.pixelToWorld((width - 1) / 2, -0.5),
      wcs.pixelToWorld((width - 1) / 2, height - 0.5),
      wcs.pixelToWorld(-0.5, (height - 1) / 2),
      wcs.pixelToWorld(width - 0.5, (height - 1) / 2),
      center
    ].filter(Boolean);

    const maxSep = Math.max(
      fov.width_deg || 0,
      fov.height_deg || 0,
      ...pts.map(p => separation(center, p))
    ) + 2.0;

    const minDec = Math.max(-90, center.dec - maxSep);
    const maxDec = Math.min(90, center.dec + maxSep);
    const touchesPole = maxDec >= 88.5 || minDec <= -88.5;

    const selected = [];
    manifest.bands.forEach((band, bIdx) => {
      if (band.decMax < minDec || band.decMin > maxDec) return;
      const nRa = band.raCount;
      const sectorDeg = 360 / nRa;
      const bandMaxAbsDec = Math.max(Math.abs(band.decMin), Math.abs(band.decMax));
      const cosLim = Math.cos(Math.min(89, bandMaxAbsDec) * radians);
      const raHalfSpan = touchesPole || cosLim < 0.08 ? 180 : Math.min(180, maxSep / cosLim + 2.0);

      if (raHalfSpan >= 175) {
        for (let r = 0; r < nRa; r++) selected.push([bIdx, r]);
        return;
      }

      const raStart = ((center.ra - raHalfSpan) % 360 + 360) % 360;
      const raEnd = ((center.ra + raHalfSpan) % 360 + 360) % 360;
      const wraps = raStart > raEnd;

      for (let r = 0; r < nRa; r++) {
        const s0 = r * sectorDeg;
        const s1 = s0 + sectorDeg;
        const hits = wraps
          ? (s1 >= raStart || s0 <= raEnd)
          : (s1 >= raStart && s0 <= raEnd);
        if (hits) selected.push([bIdx, r]);
      }
    });
    return selected;
  }

  async function loadCatalogueBundle(bundleUrl, signal) {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Catalogue loading stopped.', 'AbortError');
    const url = new URL(bundleUrl, globalThis.location.href).href;
    let cache = bundleCache;
    if (!cache || cache.url !== url) {
      // The network request is identical for every field. Use the WCS only to
      // select which parts of this public catalogue to parse locally.
      const data = await fetchJsonSameOrigin(url, signal);
      if (signal?.aborted) throw signal.reason ?? new DOMException('Catalogue loading stopped.', 'AbortError');
      if (!data || !Array.isArray(data.manifest?.bands) || typeof data.manifest.pattern !== 'string'
          || !data.tiles || typeof data.tiles !== 'object' || Array.isArray(data.tiles)) {
        throw new Error('The local catalogue bundle is unreadable.');
      }
      cache = { url, manifest: data.manifest, tiles: data.tiles, parsed: new Map() };
      bundleCache = cache;
    }

    return cache;
  }

  async function loadCatalogForWcs(wcs, bundleUrl, signal) {
    const { manifest, tiles, parsed } = await loadCatalogueBundle(bundleUrl, signal);
    if (signal?.aborted) throw signal.reason ?? new DOMException('Catalogue loading stopped.', 'AbortError');
    const files = new Set();
    for (const section of wcs.sections || [wcs]) for (const [band,sector] of tileKeysForWcs(section,manifest)) {
      files.add(manifest.pattern.replace('{b}', String(band)).replace('{r}', String(sector)));
    }
    const tileArrays = [...files].map(file => {
      if (parsed.has(file)) return parsed.get(file);
      try {
        if (typeof tiles[file] !== 'string') throw new Error('Tile is missing.');
        const { objects } = JSON.parse(tiles[file]);
        if (!Array.isArray(objects)) throw new Error('Tile has no objects array.');
        parsed.set(file, objects);
        return objects;
      } catch (_) {
        throw new Error('The local catalogue bundle is incomplete or unreadable.');
      }
    });
    // Compare objects in neighbouring tiles together so a boundary cannot split known aliases.
    return combineCatalogues(tileArrays);
  }

  globalThis.PlateAnnotations = Object.freeze({ parseWcs, makeProjectionWcs, makeLocalSkyWcs, annotate, loadCatalog, loadCatalogueBundle, loadCatalogForWcs, loadBrightStars });
})();

/* On-device WCS row orientation from public reference stars and header metadata. */
(() => {
  'use strict';

  const radians = Math.PI / 180;

  function headerCards(input) {
    if (input instanceof ArrayBuffer) input = new Uint8Array(input);
    if (ArrayBuffer.isView(input)) {
      input = new TextDecoder().decode(
        new Uint8Array(input.buffer, input.byteOffset, Math.min(input.byteLength, 512 * 1024))
      );
    }
    if (typeof input !== 'string') return [];
    const text = input.trimStart();
    const lineEnd = text.search(/[\r\n]/);
    const cards = lineEnd >= 0 && lineEnd <= 80
      ? text.split(/\r\n|\r|\n/)
      : text.match(/[\s\S]{1,80}/g) || [];
    const end = cards.findIndex(card => card.trim() === 'END');
    return end < 0 ? cards : cards.slice(0, end);
  }

  function provenance(input) {
    const cards = headerCards(input);
    const rowOrder = cards.find(card => /^ROWORDER\s*=/i.test(card));
    if (rowOrder && /TOP[-_ ]?DOWN/i.test(rowOrder)) return 'top';
    if (rowOrder && /BOTTOM[-_ ]?UP/i.test(rowOrder)) return 'bottom';
    const notes = cards.filter(card => /^(COMMENT|HISTORY)\s/i.test(card)).join('\n');
    if (/astrometry\.net/i.test(notes)) {
      const sourceNotes = notes.split('\n').filter(line => /field name|source|input|original image|cmdline/i.test(line));
      const sourceText = sourceNotes.join('\n');
      if (/\.(jpe?g|png)(?![a-z0-9.])/i.test(sourceText)) return 'top';
      if (/\.(fits|fit|fts)(?![a-z0-9.])/i.test(sourceText) && !/\.(axy|xy\.fits|xyls)\b/i.test(sourceText)) {
        return 'bottom';
      }
    }
    const axes = cards.find(card => /^NAXIS\s*=\s*[2-9](?:\s|$)/.test(card));
    return axes ? 'bottom' : null;
  }

  function luminance(pixels) {
    const { width, height, rgba } = pixels;
    const result = new Float32Array(width * height);
    for (let i = 0; i < result.length; i++) {
      const r = i * 4;
      result[i] = (0.2126 * rgba[r] + 0.7152 * rgba[r+1] + 0.0722 * rgba[r+2]) * (rgba[r+3] / 255);
    }
    return result;
  }

  function blur(input, width, height, radius) {
    const scratch = new Float32Array(input.length);
    const result = new Float32Array(input.length);
    const denominator = 2 * radius + 1;
    for (let y = 0; y < height; y++) {
      const row = y * width;
      let sum = input[row] * radius;
      for (let x = 0; x <= radius; x++) sum += input[row + Math.min(x, width - 1)];
      for (let x = 0; x < width; x++) {
        scratch[row + x] = sum / denominator;
        sum += input[row + Math.min(x + radius + 1, width - 1)]
          - input[row + Math.max(x - radius, 0)];
      }
    }
    for (let x = 0; x < width; x++) {
      let sum = scratch[x] * radius;
      for (let y = 0; y <= radius; y++) sum += scratch[Math.min(y, height - 1) * width + x];
      for (let y = 0; y < height; y++) {
        result[y * width + x] = sum / denominator;
        sum += scratch[Math.min(y + radius + 1, height - 1) * width + x]
          - scratch[Math.max(y - radius, 0) * width + x];
      }
    }
    return result;
  }

  function peakPositions(gray, width, height, narrowRadius, broadRadius) {
    const narrow = blur(gray, width, height, narrowRadius);
    const broad = blur(gray, width, height, broadRadius);
    for (let i = 0; i < narrow.length; i++) narrow[i] -= broad[i];
    const peaks = [];
    for (let y = 4; y < height - 4; y++) {
      for (let x = 4; x < width - 4; x++) {
        const i = y * width + x;
        const strength = narrow[i];
        if (strength < 1 || narrow[i - 1] >= strength || narrow[i + 1] > strength
            || narrow[i - width] >= strength || narrow[i + width] > strength
            || narrow[i - width - 1] >= strength || narrow[i - width + 1] >= strength
            || narrow[i + width - 1] > strength || narrow[i + width + 1] > strength) continue;
        peaks.push({ x, y, strength });
      }
    }
    peaks.sort((a, b) => b.strength - a.strength);
    return peaks.slice(0, 220);
  }

  function angularDistance(first, second) {
    const deltaDec = (second.dec - first.dec) * radians;
    const deltaRa = (second.ra - first.ra) * radians;
    const chord = Math.sin(deltaDec / 2) ** 2
      + Math.cos(first.dec * radians) * Math.cos(second.dec * radians) * Math.sin(deltaRa / 2) ** 2;
    return 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, chord)))) / radians;
  }

  function projectStars(wcs, reference, width, height, radius) {
    const corners = [
      wcs.pixelToWorld(0, 0), wcs.pixelToWorld(wcs.width - 1, 0),
      wcs.pixelToWorld(0, wcs.height - 1), wcs.pixelToWorld(wcs.width - 1, wcs.height - 1)
    ];
    const skyRadius = Math.max(...corners.map(point => angularDistance(wcs.center, point)));
    const decMargin = Math.min(180, skyRadius * 1.2 + 0.15);
    const stars = reference.filter(row => row[2] === '*' && Number.isFinite(row[3])
      && Number.isFinite(row[4]) && Math.abs(row[4] - wcs.center.dec) <= decMargin);
    stars.sort((first, second) => (first[5] ?? Infinity) - (second[5] ?? Infinity));
    const projected = [];
    for (const [, , , ra, dec] of stars) {
      if (projected.length >= 140) break;
      const p = wcs.worldToPixel(ra, dec);
      if (!p) continue;
      const x = (p.x + 0.5) * width / wcs.width - 0.5;
      const y = (p.y + 0.5) * height / wcs.height - 0.5;
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < radius || x >= width - radius
          || y < radius || y >= height - radius || Math.abs(height - 1 - 2*y) < 2 * radius) continue;
      projected.push({ x, y });
    }
    return projected;
  }

  function alignment(wcs, pixels, reference) {
    const { width, height } = pixels;
    if (width < 32 || height < 32 || !reference?.length) return null;
    const radius = Math.max(3, Math.min(11, Math.max(width, height) * 0.006));
    const expected = projectStars(wcs, reference, width, height, radius);
    if (expected.length < 5) return null;

    const gray = luminance(pixels);
    const fine = peakPositions(gray, width, height, 1, 4);
    const broad = peakPositions(gray, width, height, 3, 8);
    const peaks = fine.concat(broad);
    if (peaks.length < 5) return null;
    const usedTop = new Set();
    const usedBottom = new Set();
    const radiusSquared = radius ** 2;
    function closest(x, y) {
      let index = -1;
      let nearest = radiusSquared;
      for (let i = 0; i < peaks.length; i++) {
        const distance = (x - peaks[i].x) ** 2 + (y - peaks[i].y) ** 2;
        if (distance >= nearest) continue;
        nearest = distance;
        index = i;
      }
      return index;
    }
    for (const { x, y } of expected) {
      const bottom = closest(x, y);
      const top = closest(x, height - 1 - y);
      if (top >= 0 && bottom < 0) usedTop.add(top);
      if (bottom >= 0 && top < 0) usedBottom.add(bottom);
    }
    const top = usedTop.size;
    const bottom = usedBottom.size;
    const best = Math.max(top, bottom);
    const other = Math.min(top, bottom);
    const chance = Math.min(0.8, peaks.length * Math.PI * radiusSquared / (width * height));
    const margin = Math.max(4, Math.ceil(3 * Math.sqrt(2 * expected.length * chance)));
    const counts = { top, bottom, tested: expected.length };
    if (best < 5 || best < 2 * other + 1 || best - other < margin) return { rowOrigin: null, ...counts };
    return { rowOrigin: top > bottom ? 'top' : 'bottom', ...counts };
  }

  function resolve(header, bottomWcs, pixels, reference) {
    const evidence = pixels && reference ? alignment(bottomWcs, pixels, reference) : null;
    if (evidence?.rowOrigin) return { ...evidence, reason: 'alignment' };
    const declared = provenance(header);
    if (declared) return { rowOrigin: declared, reason: 'provenance', evidence };
    return { rowOrigin: 'bottom', reason: 'default', evidence };
  }

  globalThis.PlateWcsOrientation = Object.freeze({ resolve });
})();
