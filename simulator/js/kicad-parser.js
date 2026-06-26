const KicadParser = {

  tokenize(text) {
    const tokens = [];
    let i = 0;
    const len = text.length;
    while (i < len) {
      const ch = text[i];
      if (ch <= ' ') { i++; continue; }
      if (ch === '(' || ch === ')') { tokens.push(ch); i++; continue; }
      if (ch === '"') {
        let s = '';
        i++;
        while (i < len && text[i] !== '"') {
          if (text[i] === '\\' && i + 1 < len) { i++; s += text[i]; }
          else s += text[i];
          i++;
        }
        i++;
        tokens.push({ t: 's', v: s });
        continue;
      }
      let atom = '';
      while (i < len && text[i] > ' ' && text[i] !== '(' && text[i] !== ')') {
        atom += text[i]; i++;
      }
      const n = Number(atom);
      tokens.push(atom !== '' && !isNaN(n) ? n : atom);
    }
    return tokens;
  },

  parse(tokens) {
    let pos = 0;
    function read() {
      if (pos >= tokens.length) return null;
      const tok = tokens[pos];
      if (tok === '(') {
        pos++;
        const list = [];
        while (pos < tokens.length && tokens[pos] !== ')') list.push(read());
        pos++;
        return list;
      }
      pos++;
      return (typeof tok === 'object' && tok.t === 's') ? tok.v : tok;
    }
    return read();
  },

  findAll(node, key) {
    if (!Array.isArray(node)) return [];
    return node.filter(c => Array.isArray(c) && c[0] === key);
  },

  find(node, key) {
    if (!Array.isArray(node)) return null;
    return node.find(c => Array.isArray(c) && c[0] === key) || null;
  },

  val(node, key) {
    const f = this.find(node, key);
    return f ? f[1] : undefined;
  },

  xy(node) {
    if (!node) return { x: 0, y: 0, angle: 0 };
    return { x: node[1] || 0, y: node[2] || 0, angle: node[3] || 0 };
  },

  parseSchematic(text) {
    const tokens = this.tokenize(text);
    const sexp = this.parse(tokens);
    if (!sexp || sexp[0] !== 'kicad_sch')
      throw new Error('Not a valid KiCad schematic file (.kicad_sch)');
    return {
      paper: this.val(sexp, 'paper') || 'A4',
      libSymbols: this.parseLibSymbols(sexp),
      symbols: this.parseInstances(sexp),
      wires: this.parseWires(sexp),
      buses: this.parseBuses(sexp),
      junctions: this.parseJunctions(sexp),
      noConnects: this.parseNoConnects(sexp),
      labels: this.parseLabels(sexp),
      globalLabels: this.parseGlobalLabels(sexp),
      hierLabels: this.parseHierLabels(sexp),
      text: this.parseText(sexp),
      sheets: this.parseSheets(sexp),
    };
  },

  parseLibSymbols(sexp) {
    const section = this.find(sexp, 'lib_symbols');
    if (!section) return {};
    const result = {};
    for (const sym of this.findAll(section, 'symbol')) {
      const name = sym[1];
      result[name] = this.parseLibSymbol(sym);
    }
    return result;
  },

  parseLibSymbol(sym) {
    const props = {};
    for (const p of this.findAll(sym, 'property')) props[p[1]] = p[2];
    const units = [];
    for (const sub of this.findAll(sym, 'symbol')) units.push(this.parseGraphics(sub));
    const pn = this.find(sym, 'pin_names');
    const isPower = sym.includes('power') ||
      (Array.isArray(sym) && sym.some(e => e === 'power'));
    return {
      name: sym[1],
      properties: props,
      units,
      pinNamesOffset: pn ? (this.val(pn, 'offset') ?? 0.508) : 0.508,
      pinNamesHide: pn ? pn.includes('hide') : false,
      isPower,
    };
  },

  parseGraphics(sub) {
    const name = sub[1];
    const g = { name, rectangles: [], circles: [], arcs: [], polylines: [], pins: [] };
    for (const r of this.findAll(sub, 'rectangle')) {
      const s = this.xy(this.find(r, 'start'));
      const e = this.xy(this.find(r, 'end'));
      const fill = this.find(r, 'fill');
      g.rectangles.push({ start: s, end: e, fill: fill ? this.val(fill, 'type') : 'none' });
    }
    for (const c of this.findAll(sub, 'circle')) {
      const center = this.xy(this.find(c, 'center'));
      const fill = this.find(c, 'fill');
      g.circles.push({ center, radius: this.val(c, 'radius') || 0, fill: fill ? this.val(fill, 'type') : 'none' });
    }
    for (const a of this.findAll(sub, 'arc')) {
      g.arcs.push({
        start: this.xy(this.find(a, 'start')),
        mid: this.xy(this.find(a, 'mid')),
        end: this.xy(this.find(a, 'end')),
      });
    }
    for (const pl of this.findAll(sub, 'polyline')) {
      const pts = this.find(pl, 'pts');
      const points = pts ? this.findAll(pts, 'xy').map(p => ({ x: p[1], y: p[2] })) : [];
      const fill = this.find(pl, 'fill');
      g.polylines.push({ points, fill: fill ? this.val(fill, 'type') : 'none' });
    }
    for (const pin of this.findAll(sub, 'pin')) {
      const at = this.xy(this.find(pin, 'at'));
      const nm = this.find(pin, 'name');
      const nu = this.find(pin, 'number');
      g.pins.push({
        elecType: pin[1],
        graphType: pin[2],
        at,
        length: this.val(pin, 'length') || 2.54,
        name: nm ? nm[1] : '~',
        number: nu ? nu[1] : '',
      });
    }
    return g;
  },

  parseInstances(sexp) {
    const result = [];
    for (const sym of this.findAll(sexp, 'symbol')) {
      const libId = this.val(sym, 'lib_id');
      if (!libId) continue;
      const at = this.xy(this.find(sym, 'at'));
      const mirrorNode = this.find(sym, 'mirror');
      const mirrorVal = mirrorNode ? mirrorNode[1] : '';
      const props = {};
      for (const p of this.findAll(sym, 'property')) {
        const pAt = this.xy(this.find(p, 'at'));
        const eff = this.find(p, 'effects');
        let hide = false;
        if (eff) {
          hide = eff.includes('hide') ||
            (Array.isArray(eff) && eff.some(e => Array.isArray(e) && e.includes('hide')));
        }
        props[p[1]] = { value: p[2], at: pAt, hide };
      }
      result.push({
        libId,
        at,
        mirrorX: typeof mirrorVal === 'string' && mirrorVal.includes('x'),
        mirrorY: typeof mirrorVal === 'string' && mirrorVal.includes('y'),
        unit: this.val(sym, 'unit') || 1,
        properties: props,
        uuid: this.val(sym, 'uuid'),
      });
    }
    return result;
  },

  parseWires(sexp) {
    return this.findAll(sexp, 'wire').map(w => {
      const pts = this.find(w, 'pts');
      if (!pts) return null;
      const pp = this.findAll(pts, 'xy');
      return pp.length >= 2 ? { start: { x: pp[0][1], y: pp[0][2] }, end: { x: pp[1][1], y: pp[1][2] } } : null;
    }).filter(Boolean);
  },

  parseBuses(sexp) {
    return this.findAll(sexp, 'bus').map(b => {
      const pts = this.find(b, 'pts');
      if (!pts) return null;
      const pp = this.findAll(pts, 'xy');
      return pp.length >= 2 ? { start: { x: pp[0][1], y: pp[0][2] }, end: { x: pp[1][1], y: pp[1][2] } } : null;
    }).filter(Boolean);
  },

  parseJunctions(sexp) {
    return this.findAll(sexp, 'junction').map(j => ({ at: this.xy(this.find(j, 'at')) }));
  },

  parseNoConnects(sexp) {
    return this.findAll(sexp, 'no_connect').map(n => ({ at: this.xy(this.find(n, 'at')) }));
  },

  parseLabels(sexp) {
    return this.findAll(sexp, 'label').map(l => ({ text: l[1], at: this.xy(this.find(l, 'at')) }));
  },

  parseGlobalLabels(sexp) {
    return this.findAll(sexp, 'global_label').map(l => ({
      text: l[1], at: this.xy(this.find(l, 'at')),
      shape: this.val(l, 'shape') || 'input',
    }));
  },

  parseHierLabels(sexp) {
    return this.findAll(sexp, 'hierarchical_label').map(l => ({
      text: l[1], at: this.xy(this.find(l, 'at')),
      shape: this.val(l, 'shape') || 'input',
    }));
  },

  parseText(sexp) {
    return this.findAll(sexp, 'text').map(t => ({ text: t[1], at: this.xy(this.find(t, 'at')) }));
  },

  parseSheets(sexp) {
    return this.findAll(sexp, 'sheet').map(s => {
      const at = this.xy(this.find(s, 'at'));
      const sz = this.find(s, 'size');
      const props = {};
      for (const p of this.findAll(s, 'property')) props[p[1]] = p[2];
      return { at, w: sz ? sz[1] : 25, h: sz ? sz[2] : 15, properties: props };
    });
  },

  getPageSize(paper) {
    const sizes = {
      'A4': [297, 210], 'A3': [420, 297], 'A2': [594, 420],
      'A1': [841, 594], 'A0': [1189, 841], 'A5': [210, 148],
      'A': [279.4, 215.9], 'B': [431.8, 279.4], 'C': [558.8, 431.8],
      'D': [863.6, 558.8], 'E': [1117.6, 863.6],
    };
    return sizes[paper] || sizes['A4'];
  },
};
