class SchematicViewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sch = null;
    this.zoom = 3;
    this.panX = 0;
    this.panY = 0;
    this.selected = null;
    this.showGrid = true;
    this.showLabels = true;
    this.dragging = false;
    this.lastPt = null;
    this.pinchDist = 0;
    this.onSelectionChange = null;
    this.onStatusMessage = null;
    this.onComponentsChange = null;
    this.setupMouse();
    this.setupTouch();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const c = this.canvas.parentElement;
    if (!c) return;
    this.canvas.width = c.clientWidth;
    this.canvas.height = c.clientHeight;
    this.draw();
  }

  loadSchematic(sch) {
    this.sch = sch;
    this.selected = null;
    this.zoomToFit();
    this.draw();
    if (this.onComponentsChange) this.onComponentsChange();
    if (this.onStatusMessage) this.onStatusMessage('Schematic loaded: ' + sch.symbols.length + ' components, ' + sch.wires.length + ' wires');
  }

  get components() { return this.sch ? this.sch.symbols : []; }
  get wires() { return this.sch ? this.sch.wires : []; }

  mmToScreen(x, y) {
    return { x: x * this.zoom + this.panX, y: y * this.zoom + this.panY };
  }

  screenToMm(sx, sy) {
    return { x: (sx - this.panX) / this.zoom, y: (sy - this.panY) / this.zoom };
  }

  transformPt(lx, ly, inst) {
    let x = lx, y = ly;
    if (inst.mirrorX) x = -x;
    if (inst.mirrorY) y = -y;
    const rad = -inst.at.angle * Math.PI / 180;
    const rx = x * Math.cos(rad) - y * Math.sin(rad);
    const ry = x * Math.sin(rad) + y * Math.cos(rad);
    return { x: inst.at.x + rx, y: inst.at.y + ry };
  }

  setupMouse() {
    const c = this.canvas;
    c.addEventListener('wheel', e => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const newZoom = Math.max(0.3, Math.min(30, this.zoom * factor));
      this.panX = mx - (mx - this.panX) * (newZoom / this.zoom);
      this.panY = my - (my - this.panY) * (newZoom / this.zoom);
      this.zoom = newZoom;
      this.updateZoomDisplay();
      this.draw();
    }, { passive: false });

    c.addEventListener('mousedown', e => {
      if (e.button === 1 || e.button === 2 || (e.button === 0 && e.shiftKey)) {
        this.dragging = true;
        this.lastPt = { x: e.clientX, y: e.clientY };
        e.preventDefault();
      } else if (e.button === 0) {
        const rect = c.getBoundingClientRect();
        const mm = this.screenToMm(e.clientX - rect.left, e.clientY - rect.top);
        this.selectAt(mm.x, mm.y);
      }
    });

    c.addEventListener('mousemove', e => {
      if (this.dragging && this.lastPt) {
        this.panX += e.clientX - this.lastPt.x;
        this.panY += e.clientY - this.lastPt.y;
        this.lastPt = { x: e.clientX, y: e.clientY };
        this.draw();
      }
      const rect = c.getBoundingClientRect();
      const mm = this.screenToMm(e.clientX - rect.left, e.clientY - rect.top);
      const coords = document.getElementById('canvas-coords');
      if (coords) coords.textContent = `X: ${mm.x.toFixed(1)}  Y: ${mm.y.toFixed(1)}`;
    });

    window.addEventListener('mouseup', () => { this.dragging = false; this.lastPt = null; });
    c.addEventListener('contextmenu', e => e.preventDefault());
  }

  setupTouch() {
    const c = this.canvas;
    let lastTouch = null;
    let lastPinch = 0;
    let touchTimer = null;

    c.addEventListener('touchstart', e => {
      e.preventDefault();
      if (e.touches.length === 1) {
        lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        touchTimer = setTimeout(() => { touchTimer = null; }, 200);
      } else if (e.touches.length === 2) {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        lastPinch = Math.sqrt(dx * dx + dy * dy);
        lastTouch = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        };
      }
    }, { passive: false });

    c.addEventListener('touchmove', e => {
      e.preventDefault();
      if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
      if (e.touches.length === 1 && lastTouch) {
        this.panX += e.touches[0].clientX - lastTouch.x;
        this.panY += e.touches[0].clientY - lastTouch.y;
        lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        this.draw();
      } else if (e.touches.length === 2) {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const rect = c.getBoundingClientRect();
        const mx = cx - rect.left, my = cy - rect.top;
        if (lastPinch > 0) {
          const factor = dist / lastPinch;
          const newZoom = Math.max(0.3, Math.min(30, this.zoom * factor));
          this.panX = mx - (mx - this.panX) * (newZoom / this.zoom);
          this.panY = my - (my - this.panY) * (newZoom / this.zoom);
          this.zoom = newZoom;
          this.updateZoomDisplay();
        }
        if (lastTouch) {
          this.panX += cx - lastTouch.x;
          this.panY += cy - lastTouch.y;
        }
        lastPinch = dist;
        lastTouch = { x: cx, y: cy };
        this.draw();
      }
    }, { passive: false });

    c.addEventListener('touchend', e => {
      if (e.touches.length === 0) {
        if (touchTimer && lastTouch) {
          clearTimeout(touchTimer);
          const rect = c.getBoundingClientRect();
          const mm = this.screenToMm(lastTouch.x - rect.left, lastTouch.y - rect.top);
          this.selectAt(mm.x, mm.y);
        }
        lastTouch = null;
        lastPinch = 0;
        touchTimer = null;
      }
    });
  }

  updateZoomDisplay() {
    const el = document.getElementById('status-zoom');
    if (el) el.textContent = Math.round(this.zoom * 33) + '%';
  }

  selectAt(wx, wy) {
    if (!this.sch) return;
    let best = null, bestDist = 20;
    for (const inst of this.sch.symbols) {
      const dx = wx - inst.at.x, dy = wy - inst.at.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestDist) { bestDist = d; best = inst; }
    }
    this.selected = best;
    this.draw();
    if (this.onSelectionChange) this.onSelectionChange(best);
  }

  zoomToFit() {
    if (!this.sch) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const expand = (x, y) => {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    };
    for (const w of this.sch.wires) { expand(w.start.x, w.start.y); expand(w.end.x, w.end.y); }
    for (const s of this.sch.symbols) { expand(s.at.x - 10, s.at.y - 10); expand(s.at.x + 10, s.at.y + 10); }
    for (const j of this.sch.junctions) expand(j.at.x, j.at.y);
    for (const l of this.sch.labels) expand(l.at.x, l.at.y);
    for (const l of this.sch.globalLabels) expand(l.at.x, l.at.y);
    if (!isFinite(minX)) {
      const ps = KicadParser.getPageSize(this.sch.paper);
      minX = 0; minY = 0; maxX = ps[0]; maxY = ps[1];
    }
    const pad = 15;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const w = maxX - minX, h = maxY - minY;
    const cw = this.canvas.width, ch = this.canvas.height;
    this.zoom = Math.min(cw / w, ch / h);
    this.panX = (cw - w * this.zoom) / 2 - minX * this.zoom;
    this.panY = (ch - h * this.zoom) / 2 - minY * this.zoom;
    this.updateZoomDisplay();
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width, h = this.canvas.height;
    ctx.fillStyle = '#F5F0E8';
    ctx.fillRect(0, 0, w, h);
    if (!this.sch) { this.drawEmpty(); return; }
    if (this.showGrid) this.drawGrid();
    this.drawWires();
    this.drawBuses();
    this.drawJunctions();
    this.drawNoConnects();
    for (const inst of this.sch.symbols) this.drawSymbol(inst);
    this.drawLabels();
    this.drawGlobalLabels();
    this.drawHierLabels();
    this.drawTextItems();
    this.drawSheets();
    if (this.selected) this.drawSelection();
  }

  drawEmpty() {
    const ctx = this.ctx;
    const cx = this.canvas.width / 2, cy = this.canvas.height / 2;
    ctx.fillStyle = '#808080';
    ctx.font = '16px "VT323", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Open a KiCad schematic (.kicad_sch) to view it', cx, cy - 20);
    ctx.font = '13px "VT323", monospace';
    ctx.fillStyle = '#A0A0A0';
    ctx.fillText('File > Open  or  drag & drop  or  tap Open button', cx, cy + 10);
    ctx.fillText('Pinch to zoom  |  Drag to pan  |  Tap to select', cx, cy + 30);
  }

  drawGrid() {
    const ctx = this.ctx;
    const step = 2.54;
    const s0 = this.mmToScreen(0, 0);
    const s1 = this.mmToScreen(step, step);
    const gap = s1.x - s0.x;
    if (gap < 6) return;
    const minMm = this.screenToMm(0, 0);
    const maxMm = this.screenToMm(this.canvas.width, this.canvas.height);
    const startX = Math.floor(minMm.x / step) * step;
    const startY = Math.floor(minMm.y / step) * step;
    ctx.fillStyle = '#D8D4CC';
    for (let x = startX; x <= maxMm.x; x += step) {
      for (let y = startY; y <= maxMm.y; y += step) {
        const s = this.mmToScreen(x, y);
        ctx.fillRect(s.x, s.y, 1, 1);
      }
    }
  }

  drawWires() {
    const ctx = this.ctx;
    ctx.strokeStyle = '#006600';
    ctx.lineWidth = Math.max(1, this.zoom * 0.25);
    ctx.lineCap = 'round';
    for (const w of this.sch.wires) {
      const a = this.mmToScreen(w.start.x, w.start.y);
      const b = this.mmToScreen(w.end.x, w.end.y);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }

  drawBuses() {
    const ctx = this.ctx;
    ctx.strokeStyle = '#000080';
    ctx.lineWidth = Math.max(2, this.zoom * 0.5);
    ctx.lineCap = 'round';
    for (const b of this.sch.buses) {
      const a = this.mmToScreen(b.start.x, b.start.y);
      const e = this.mmToScreen(b.end.x, b.end.y);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(e.x, e.y); ctx.stroke();
    }
  }

  drawJunctions() {
    const ctx = this.ctx;
    ctx.fillStyle = '#006600';
    const r = Math.max(2, this.zoom * 0.6);
    for (const j of this.sch.junctions) {
      const s = this.mmToScreen(j.at.x, j.at.y);
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawNoConnects() {
    const ctx = this.ctx;
    ctx.strokeStyle = '#CC0000';
    ctx.lineWidth = Math.max(1, this.zoom * 0.2);
    const sz = this.zoom * 1.2;
    for (const nc of this.sch.noConnects) {
      const s = this.mmToScreen(nc.at.x, nc.at.y);
      ctx.beginPath();
      ctx.moveTo(s.x - sz, s.y - sz); ctx.lineTo(s.x + sz, s.y + sz);
      ctx.moveTo(s.x + sz, s.y - sz); ctx.lineTo(s.x - sz, s.y + sz);
      ctx.stroke();
    }
  }

  drawSymbol(inst) {
    const lib = this.sch.libSymbols[inst.libId];
    if (!lib) return;
    for (const unit of lib.units) {
      const parts = unit.name.split('_');
      const uNum = parseInt(parts[parts.length - 2]) || 0;
      if (uNum !== 0 && uNum !== inst.unit) continue;
      for (const r of unit.rectangles) this.drawRect(r, inst);
      for (const p of unit.polylines) this.drawPolyline(p, inst);
      for (const c of unit.circles) this.drawCircle(c, inst);
      for (const a of unit.arcs) this.drawArc(a, inst);
      if (this.showLabels) {
        for (const pin of unit.pins) this.drawPin(pin, inst, lib);
      }
    }
    const ctx = this.ctx;
    for (const key of ['Reference', 'Value']) {
      const prop = inst.properties[key];
      if (!prop || prop.hide) continue;
      const s = this.mmToScreen(prop.at.x, prop.at.y);
      ctx.fillStyle = key === 'Reference' ? '#CC0000' : '#000080';
      const fs = Math.max(8, this.zoom * 1.27);
      ctx.font = `${fs}px "VT323", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.save();
      ctx.translate(s.x, s.y);
      if (prop.at.angle === 90 || prop.at.angle === 270) ctx.rotate(-Math.PI / 2);
      ctx.fillText(String(prop.value || ''), 0, 0);
      ctx.restore();
    }
  }

  drawRect(r, inst) {
    const ctx = this.ctx;
    const a = this.transformPt(r.start.x, r.start.y, inst);
    const b = this.transformPt(r.end.x, r.end.y, inst);
    const sa = this.mmToScreen(Math.min(a.x, b.x), Math.min(a.y, b.y));
    const sb = this.mmToScreen(Math.max(a.x, b.x), Math.max(a.y, b.y));
    if (r.fill === 'background' || r.fill === 'outline') {
      ctx.fillStyle = r.fill === 'outline' ? '#000000' : '#FFFFF0';
      ctx.fillRect(sa.x, sa.y, sb.x - sa.x, sb.y - sa.y);
    }
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = Math.max(1, this.zoom * 0.15);
    ctx.strokeRect(sa.x, sa.y, sb.x - sa.x, sb.y - sa.y);
  }

  drawPolyline(p, inst) {
    if (p.points.length < 2) return;
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < p.points.length; i++) {
      const pt = this.transformPt(p.points[i].x, p.points[i].y, inst);
      const s = this.mmToScreen(pt.x, pt.y);
      i === 0 ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y);
    }
    if (p.fill === 'outline' || p.fill === 'background') {
      ctx.fillStyle = p.fill === 'outline' ? '#000000' : '#FFFFF0';
      ctx.fill();
    }
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = Math.max(1, this.zoom * 0.15);
    ctx.stroke();
  }

  drawCircle(c, inst) {
    const ctx = this.ctx;
    const center = this.transformPt(c.center.x, c.center.y, inst);
    const s = this.mmToScreen(center.x, center.y);
    const r = c.radius * this.zoom;
    ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    if (c.fill === 'outline' || c.fill === 'background') {
      ctx.fillStyle = c.fill === 'outline' ? '#000000' : '#FFFFF0';
      ctx.fill();
    }
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = Math.max(1, this.zoom * 0.15);
    ctx.stroke();
  }

  drawArc(a, inst) {
    const ctx = this.ctx;
    const p1 = this.transformPt(a.start.x, a.start.y, inst);
    const pm = this.transformPt(a.mid.x, a.mid.y, inst);
    const p2 = this.transformPt(a.end.x, a.end.y, inst);
    const s1 = this.mmToScreen(p1.x, p1.y);
    const sm = this.mmToScreen(pm.x, pm.y);
    const s2 = this.mmToScreen(p2.x, p2.y);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = Math.max(1, this.zoom * 0.15);
    const cx = this.arcCenter(s1.x, s1.y, sm.x, sm.y, s2.x, s2.y);
    if (cx) {
      const r = Math.sqrt((s1.x - cx.x) ** 2 + (s1.y - cx.y) ** 2);
      const a1 = Math.atan2(s1.y - cx.y, s1.x - cx.x);
      const am = Math.atan2(sm.y - cx.y, sm.x - cx.x);
      const a2 = Math.atan2(s2.y - cx.y, s2.x - cx.x);
      ctx.beginPath();
      ctx.arc(cx.x, cx.y, r, a1, a2, this.isCounterClockwise(a1, am, a2));
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.quadraticCurveTo(sm.x, sm.y, s2.x, s2.y);
      ctx.stroke();
    }
  }

  arcCenter(x1, y1, x2, y2, x3, y3) {
    const D = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
    if (Math.abs(D) < 1e-10) return null;
    const ux = ((x1 * x1 + y1 * y1) * (y2 - y3) + (x2 * x2 + y2 * y2) * (y3 - y1) + (x3 * x3 + y3 * y3) * (y1 - y2)) / D;
    const uy = ((x1 * x1 + y1 * y1) * (x3 - x2) + (x2 * x2 + y2 * y2) * (x1 - x3) + (x3 * x3 + y3 * y3) * (x2 - x1)) / D;
    return { x: ux, y: uy };
  }

  isCounterClockwise(a1, am, a2) {
    const norm = a => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const n1 = norm(a1), nm = norm(am), n2 = norm(a2);
    const cw1 = norm(n1 - nm), cw2 = norm(nm - n2);
    const ccw1 = norm(nm - n1), ccw2 = norm(n2 - nm);
    return (ccw1 + ccw2) < (cw1 + cw2);
  }

  drawPin(pin, inst, lib) {
    const ctx = this.ctx;
    const connPt = this.transformPt(pin.at.x, pin.at.y, inst);
    let dirAngle = pin.at.angle;
    if (inst.mirrorX) {
      if (dirAngle === 0) dirAngle = 180;
      else if (dirAngle === 180) dirAngle = 0;
    }
    if (inst.mirrorY) {
      if (dirAngle === 90) dirAngle = 270;
      else if (dirAngle === 270) dirAngle = 90;
    }
    dirAngle = (dirAngle + inst.at.angle) % 360;
    const rad = dirAngle * Math.PI / 180;
    const dx = Math.cos(rad), dy = -Math.sin(rad);
    const bodyX = connPt.x - pin.length * dx;
    const bodyY = connPt.y + pin.length * dy;
    const sConn = this.mmToScreen(connPt.x, connPt.y);
    const sBody = this.mmToScreen(bodyX, bodyY);

    ctx.strokeStyle = '#006600';
    ctx.lineWidth = Math.max(1, this.zoom * 0.15);
    ctx.beginPath(); ctx.moveTo(sBody.x, sBody.y); ctx.lineTo(sConn.x, sConn.y); ctx.stroke();

    const cr = Math.max(1.5, this.zoom * 0.35);
    ctx.fillStyle = '#006600';
    ctx.beginPath(); ctx.arc(sConn.x, sConn.y, cr, 0, Math.PI * 2); ctx.fill();

    if (pin.graphType === 'inverted') {
      const ir = this.zoom * 0.5;
      ctx.strokeStyle = '#006600';
      ctx.lineWidth = Math.max(1, this.zoom * 0.12);
      ctx.beginPath();
      ctx.arc(sBody.x + (sConn.x - sBody.x) * 0.15, sBody.y + (sConn.y - sBody.y) * 0.15, ir, 0, Math.PI * 2);
      ctx.stroke();
    }

    const fs = Math.max(6, this.zoom * 1.0);
    if (fs < 6) return;
    ctx.font = `${fs}px "VT323", monospace`;

    if (pin.name && pin.name !== '~' && !lib.pinNamesHide) {
      ctx.fillStyle = '#006600';
      ctx.textBaseline = 'middle';
      const off = lib.pinNamesOffset * this.zoom + 2;
      if (dirAngle === 0 || dirAngle === 180) {
        ctx.textAlign = dirAngle === 0 ? 'right' : 'left';
        ctx.fillText(pin.name, sBody.x + (dirAngle === 0 ? -off : off), sBody.y);
      } else {
        ctx.textAlign = 'center';
        ctx.fillText(pin.name, sBody.x, sBody.y + (dirAngle === 90 ? off : -off));
      }
    }

    if (pin.number && pin.number !== '~') {
      ctx.fillStyle = '#CC0000';
      ctx.font = `${Math.max(5, fs * 0.8)}px "VT323", monospace`;
      ctx.textBaseline = 'middle';
      const mx = (sConn.x + sBody.x) / 2, my = (sConn.y + sBody.y) / 2;
      if (dirAngle === 0 || dirAngle === 180) {
        ctx.textAlign = 'center';
        ctx.fillText(pin.number, mx, my - fs * 0.7);
      } else {
        ctx.textAlign = 'left';
        ctx.fillText(pin.number, mx + fs * 0.3, my);
      }
    }
  }

  drawLabels() {
    const ctx = this.ctx;
    for (const l of this.sch.labels) {
      const s = this.mmToScreen(l.at.x, l.at.y);
      const fs = Math.max(8, this.zoom * 1.27);
      ctx.font = `${fs}px "VT323", monospace`;
      ctx.fillStyle = '#006600';
      ctx.textBaseline = 'bottom';
      ctx.save();
      ctx.translate(s.x, s.y);
      if (l.at.angle === 90 || l.at.angle === 270) ctx.rotate(-Math.PI / 2);
      if (l.at.angle === 180) ctx.rotate(Math.PI);
      ctx.textAlign = 'left';
      const tw = ctx.measureText(l.text).width;
      ctx.strokeStyle = '#006600';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(tw + 4, 0); ctx.stroke();
      ctx.fillText(l.text, 2, -2);
      ctx.restore();
    }
  }

  drawGlobalLabels() {
    const ctx = this.ctx;
    for (const l of this.sch.globalLabels) {
      const s = this.mmToScreen(l.at.x, l.at.y);
      const fs = Math.max(8, this.zoom * 1.27);
      ctx.font = `bold ${fs}px "VT323", monospace`;
      const tw = ctx.measureText(l.text).width + 10;
      const th = fs + 4;
      ctx.save();
      ctx.translate(s.x, s.y);
      if (l.at.angle === 90 || l.at.angle === 270) ctx.rotate(-Math.PI / 2);
      if (l.at.angle === 180) ctx.rotate(Math.PI);
      ctx.fillStyle = '#FFF8F0';
      ctx.strokeStyle = '#CC0000';
      ctx.lineWidth = Math.max(1, this.zoom * 0.15);
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(6, -th / 2); ctx.lineTo(tw, -th / 2);
      ctx.lineTo(tw, th / 2); ctx.lineTo(6, th / 2); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#CC0000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(l.text, tw / 2 + 3, 1);
      ctx.restore();
    }
  }

  drawHierLabels() {
    if (!this.sch.hierLabels) return;
    const ctx = this.ctx;
    for (const l of this.sch.hierLabels) {
      const s = this.mmToScreen(l.at.x, l.at.y);
      const fs = Math.max(8, this.zoom * 1.27);
      ctx.font = `${fs}px "VT323", monospace`;
      ctx.fillStyle = '#804000';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(l.text, s.x + 4, s.y);
    }
  }

  drawTextItems() {
    if (!this.sch.text) return;
    const ctx = this.ctx;
    for (const t of this.sch.text) {
      const s = this.mmToScreen(t.at.x, t.at.y);
      const fs = Math.max(8, this.zoom * 1.27);
      ctx.font = `${fs}px "VT323", monospace`;
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(t.text), s.x, s.y);
    }
  }

  drawSheets() {
    if (!this.sch.sheets) return;
    const ctx = this.ctx;
    for (const sh of this.sch.sheets) {
      const s = this.mmToScreen(sh.at.x, sh.at.y);
      const sw = sh.w * this.zoom, shh = sh.h * this.zoom;
      ctx.fillStyle = '#F0FFF0';
      ctx.fillRect(s.x, s.y, sw, shh);
      ctx.strokeStyle = '#008000';
      ctx.lineWidth = Math.max(1, this.zoom * 0.2);
      ctx.strokeRect(s.x, s.y, sw, shh);
      const name = sh.properties['Sheetname'] || sh.properties['Sheet name'] || 'Sheet';
      const fs = Math.max(8, this.zoom * 1.5);
      ctx.font = `bold ${fs}px "VT323", monospace`;
      ctx.fillStyle = '#008000';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(name, s.x + 4, s.y + 2);
    }
  }

  drawSelection() {
    if (!this.selected) return;
    const ctx = this.ctx;
    const lib = this.sch.libSymbols[this.selected.libId];
    let r = 8;
    if (lib) {
      for (const u of lib.units) {
        for (const rect of u.rectangles) {
          r = Math.max(r, Math.max(Math.abs(rect.end.x - rect.start.x), Math.abs(rect.end.y - rect.start.y)) / 2 + 3);
        }
      }
    }
    const s = this.mmToScreen(this.selected.at.x, this.selected.at.y);
    const sr = r * this.zoom;
    ctx.strokeStyle = '#0000FF';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(s.x - sr, s.y - sr, sr * 2, sr * 2);
    ctx.setLineDash([]);
  }

  setTool() {}
  saveState() {}
  deleteSelected() {}
  undo() {}
  redo() {}
  loadDemo() {}
  addComponent() {}
  screenToWorld(x, y) { return this.screenToMm(x, y); }
}
