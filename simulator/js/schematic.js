class SchematicEditor {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.components = [];
    this.wires = [];
    this.tool = 'select';
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.gridSize = 10;
    this.showGrid = true;
    this.showLabels = true;
    this.selected = null;
    this.selectedWire = null;
    this.dragging = false;
    this.dragStart = null;
    this.dragOffset = null;
    this.wireStart = null;
    this.wirePreview = null;
    this.isPanning = false;
    this.panStart = null;
    this.hoveredPin = null;
    this.tooltip = null;

    this.onSelectionChange = null;
    this.onStatusMessage = null;
    this.onComponentsChange = null;

    this.undoStack = [];
    this.redoStack = [];

    this.resize();
    this.setupEvents();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const container = this.canvas.parentElement;
    this.canvas.width = container.clientWidth;
    this.canvas.height = container.clientHeight;
    this.draw();
  }

  setupEvents() {
    this.canvas.addEventListener('mousedown', e => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', e => this.onMouseMove(e));
    this.canvas.addEventListener('mouseup', e => this.onMouseUp(e));
    this.canvas.addEventListener('wheel', e => this.onWheel(e));
    this.canvas.addEventListener('contextmenu', e => {
      e.preventDefault();
      this.showContextMenu(e);
    });
    this.canvas.addEventListener('dblclick', e => this.onDoubleClick(e));
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.panX) / this.zoom,
      y: (sy - this.panY) / this.zoom
    };
  }

  worldToScreen(wx, wy) {
    return {
      x: wx * this.zoom + this.panX,
      y: wy * this.zoom + this.panY
    };
  }

  snapToGrid(v) {
    return Math.round(v / this.gridSize) * this.gridSize;
  }

  saveState() {
    this.undoStack.push({
      components: JSON.stringify(this.components.map(c => ({
        defId: c.def.id, x: c.x, y: c.y, id: c.id,
        rotation: c.rotation, label: c.label, properties: { ...c.properties }
      }))),
      wires: JSON.stringify(this.wires.map(w => ({
        id: w.id, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2
      })))
    });
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
  }

  undo() {
    if (this.undoStack.length === 0) return;
    this.redoStack.push({
      components: JSON.stringify(this.components.map(c => ({
        defId: c.def.id, x: c.x, y: c.y, id: c.id,
        rotation: c.rotation, label: c.label, properties: { ...c.properties }
      }))),
      wires: JSON.stringify(this.wires.map(w => ({
        id: w.id, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2
      })))
    });
    const state = this.undoStack.pop();
    this.restoreState(state);
  }

  redo() {
    if (this.redoStack.length === 0) return;
    this.undoStack.push({
      components: JSON.stringify(this.components.map(c => ({
        defId: c.def.id, x: c.x, y: c.y, id: c.id,
        rotation: c.rotation, label: c.label, properties: { ...c.properties }
      }))),
      wires: JSON.stringify(this.wires.map(w => ({
        id: w.id, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2
      })))
    });
    const state = this.redoStack.pop();
    this.restoreState(state);
  }

  restoreState(state) {
    const comps = JSON.parse(state.components);
    this.components = comps.map(c => {
      const def = COMPONENT_LIBRARY[c.defId];
      if (!def) return null;
      const inst = new ComponentInstance(def, c.x, c.y);
      inst.id = c.id;
      inst.rotation = c.rotation;
      inst.label = c.label;
      inst.properties = c.properties || {};
      return inst;
    }).filter(Boolean);

    const wires = JSON.parse(state.wires);
    this.wires = wires.map(w => {
      const wire = new Wire(w.x1, w.y1, w.x2, w.y2);
      wire.id = w.id;
      return wire;
    });

    this.selected = null;
    this.selectedWire = null;
    this.draw();
    if (this.onComponentsChange) this.onComponentsChange();
  }

  addComponent(defId, x, y) {
    const def = COMPONENT_LIBRARY[defId];
    if (!def) return null;

    this.saveState();
    const inst = new ComponentInstance(def, this.snapToGrid(x), this.snapToGrid(y));
    this.components.push(inst);
    this.draw();
    if (this.onComponentsChange) this.onComponentsChange();
    if (this.onStatusMessage) this.onStatusMessage('Placed: ' + def.name);
    return inst;
  }

  deleteSelected() {
    if (this.selected) {
      this.saveState();
      this.components = this.components.filter(c => c !== this.selected);
      this.selected = null;
      if (this.onSelectionChange) this.onSelectionChange(null);
      if (this.onComponentsChange) this.onComponentsChange();
      this.draw();
    } else if (this.selectedWire) {
      this.saveState();
      this.wires = this.wires.filter(w => w !== this.selectedWire);
      this.selectedWire = null;
      if (this.onComponentsChange) this.onComponentsChange();
      this.draw();
    }
  }

  findComponentAt(wx, wy) {
    for (let i = this.components.length - 1; i >= 0; i--) {
      const c = this.components[i];
      const b = c.getBounds();
      if (wx >= b.x && wx <= b.x + b.width && wy >= b.y && wy <= b.y + b.height) {
        return c;
      }
    }
    return null;
  }

  findPinAt(wx, wy, threshold = 10) {
    for (const comp of this.components) {
      for (const pinDef of comp.def.pins) {
        const pos = comp.getPinPosition(pinDef.name);
        if (pos && Math.abs(pos.x - wx) < threshold && Math.abs(pos.y - wy) < threshold) {
          return { component: comp, pinDef, pos };
        }
      }
    }
    return null;
  }

  findWireAt(wx, wy, threshold = 6) {
    for (const w of this.wires) {
      const dx = w.x2 - w.x1;
      const dy = w.y2 - w.y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) continue;

      const t = Math.max(0, Math.min(1, ((wx - w.x1) * dx + (wy - w.y1) * dy) / (len * len)));
      const px = w.x1 + t * dx;
      const py = w.y1 + t * dy;
      const dist = Math.sqrt((wx - px) ** 2 + (wy - py) ** 2);

      if (dist < threshold) return w;
    }
    return null;
  }

  onMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { x: wx, y: wy } = this.screenToWorld(sx, sy);

    // Middle button = pan
    if (e.button === 1) {
      this.isPanning = true;
      this.panStart = { x: e.clientX, y: e.clientY, px: this.panX, py: this.panY };
      e.preventDefault();
      return;
    }

    if (e.button !== 0) return;

    if (this.tool === 'select' || this.tool === 'move') {
      const comp = this.findComponentAt(wx, wy);
      if (comp) {
        if (this.selected) this.selected.selected = false;
        if (this.selectedWire) this.selectedWire.selected = false;
        this.selectedWire = null;

        comp.selected = true;
        this.selected = comp;
        this.dragging = true;
        this.dragOffset = { x: wx - comp.x, y: wy - comp.y };
        if (this.onSelectionChange) this.onSelectionChange(comp);

        // Toggle switch on click
        if (comp.def.id === 'switch') {
          comp.properties.state = comp.properties.state === '1' ? '0' : '1';
          if (this.onSelectionChange) this.onSelectionChange(comp);
        }
        if (comp.def.id === 'button') {
          comp.properties.pressed = '1';
        }
      } else {
        const wire = this.findWireAt(wx, wy);
        if (wire) {
          if (this.selected) this.selected.selected = false;
          if (this.selectedWire) this.selectedWire.selected = false;
          this.selected = null;
          wire.selected = true;
          this.selectedWire = wire;
          if (this.onSelectionChange) this.onSelectionChange(null);
        } else {
          if (this.selected) this.selected.selected = false;
          if (this.selectedWire) this.selectedWire.selected = false;
          this.selected = null;
          this.selectedWire = null;
          if (this.onSelectionChange) this.onSelectionChange(null);

          // Start pan on empty space
          this.isPanning = true;
          this.panStart = { x: e.clientX, y: e.clientY, px: this.panX, py: this.panY };
        }
      }
    } else if (this.tool === 'wire') {
      const snappedX = this.snapToGrid(wx);
      const snappedY = this.snapToGrid(wy);

      const pin = this.findPinAt(wx, wy);
      const startX = pin ? pin.pos.x : snappedX;
      const startY = pin ? pin.pos.y : snappedY;

      if (!this.wireStart) {
        this.wireStart = { x: startX, y: startY };
      } else {
        this.saveState();
        // Manhattan routing: create two wire segments
        const sx = this.wireStart.x;
        const sy = this.wireStart.y;
        const ex = startX;
        const ey = startY;

        if (sx !== ex || sy !== ey) {
          if (Math.abs(ex - sx) > Math.abs(ey - sy)) {
            // Horizontal first
            this.wires.push(new Wire(sx, sy, ex, sy));
            if (sy !== ey) this.wires.push(new Wire(ex, sy, ex, ey));
          } else {
            // Vertical first
            this.wires.push(new Wire(sx, sy, sx, ey));
            if (sx !== ex) this.wires.push(new Wire(sx, ey, ex, ey));
          }
        }
        this.wireStart = { x: ex, y: ey };
        if (this.onComponentsChange) this.onComponentsChange();
      }
    } else if (this.tool === 'probe') {
      const pin = this.findPinAt(wx, wy);
      if (pin) {
        const probe = this.addComponent('probe_point', pin.pos.x - 30, pin.pos.y - 15);
        if (probe) {
          probe.label = pin.pinDef.name + '@' + pin.component.label;
          this.wires.push(new Wire(pin.pos.x, pin.pos.y, probe.x + 30, probe.y + 15));
        }
      }
    }

    this.draw();
  }

  onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { x: wx, y: wy } = this.screenToWorld(sx, sy);

    // Update coords display
    const coordsEl = document.getElementById('canvas-coords');
    if (coordsEl) {
      coordsEl.textContent = `X: ${Math.round(wx)}  Y: ${Math.round(wy)}`;
    }

    if (this.isPanning) {
      this.panX = this.panStart.px + (e.clientX - this.panStart.x);
      this.panY = this.panStart.py + (e.clientY - this.panStart.y);
      this.draw();
      return;
    }

    if (this.dragging && this.selected) {
      this.selected.x = this.snapToGrid(wx - this.dragOffset.x);
      this.selected.y = this.snapToGrid(wy - this.dragOffset.y);
      this.draw();
      return;
    }

    if (this.tool === 'wire' && this.wireStart) {
      const pin = this.findPinAt(wx, wy);
      this.wirePreview = {
        x: pin ? pin.pos.x : this.snapToGrid(wx),
        y: pin ? pin.pos.y : this.snapToGrid(wy)
      };
      this.draw();
      return;
    }

    // Hover detection for pin highlights
    const pin = this.findPinAt(wx, wy);
    this.hoveredPin = pin;
    this.draw();
  }

  onMouseUp(e) {
    if (e.button === 1) {
      this.isPanning = false;
      return;
    }

    if (this.dragging && this.selected) {
      this.dragging = false;
      this.saveState();
    }

    if (e.button === 0) {
      // Release button
      for (const comp of this.components) {
        if (comp.def.id === 'button') {
          comp.properties.pressed = '0';
        }
      }
    }

    this.isPanning = false;
  }

  onWheel(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const oldZoom = this.zoom;
    if (e.deltaY < 0) {
      this.zoom = Math.min(4, this.zoom * 1.1);
    } else {
      this.zoom = Math.max(0.2, this.zoom / 1.1);
    }

    // Zoom toward cursor
    this.panX = mx - (mx - this.panX) * (this.zoom / oldZoom);
    this.panY = my - (my - this.panY) * (this.zoom / oldZoom);

    this.draw();
    this.updateZoomDisplay();
  }

  updateZoomDisplay() {
    const el = document.getElementById('status-zoom');
    if (el) el.textContent = Math.round(this.zoom * 100) + '%';
  }

  onDoubleClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { x: wx, y: wy } = this.screenToWorld(sx, sy);

    const comp = this.findComponentAt(wx, wy);
    if (comp) {
      const newLabel = prompt('Component label:', comp.label);
      if (newLabel !== null) {
        this.saveState();
        comp.label = newLabel;
        this.draw();
        if (this.onSelectionChange) this.onSelectionChange(comp);
      }
    }
  }

  showContextMenu(e) {
    const existing = document.querySelector('.context-menu');
    if (existing) existing.remove();

    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { x: wx, y: wy } = this.screenToWorld(sx, sy);

    const comp = this.findComponentAt(wx, wy);
    const wire = this.findWireAt(wx, wy);

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    const addEntry = (label, fn) => {
      const entry = document.createElement('div');
      entry.className = 'ctx-entry';
      entry.textContent = label;
      entry.addEventListener('click', () => { fn(); menu.remove(); });
      menu.appendChild(entry);
    };

    const addSep = () => {
      const sep = document.createElement('div');
      sep.className = 'ctx-separator';
      menu.appendChild(sep);
    };

    if (comp) {
      addEntry('Rename: ' + comp.label, () => {
        const newLabel = prompt('Label:', comp.label);
        if (newLabel !== null) { this.saveState(); comp.label = newLabel; this.draw(); }
      });
      addEntry('Rotate 90°', () => {
        this.saveState();
        comp.rotation = (comp.rotation + 90) % 360;
        this.draw();
      });
      addSep();
      addEntry('Delete', () => {
        this.saveState();
        this.components = this.components.filter(c => c !== comp);
        if (this.selected === comp) this.selected = null;
        this.draw();
        if (this.onComponentsChange) this.onComponentsChange();
      });
    } else if (wire) {
      addEntry('Delete Wire', () => {
        this.saveState();
        this.wires = this.wires.filter(w => w !== wire);
        this.draw();
        if (this.onComponentsChange) this.onComponentsChange();
      });
    } else {
      addEntry('Paste', () => {});
      addSep();
      addEntry('Zoom to Fit', () => this.zoomToFit());
    }

    document.body.appendChild(menu);
    const closeMenu = () => { menu.remove(); document.removeEventListener('click', closeMenu); };
    setTimeout(() => document.addEventListener('click', closeMenu), 10);
  }

  setTool(tool) {
    this.tool = tool;
    this.wireStart = null;
    this.wirePreview = null;
    this.canvas.style.cursor = {
      select: 'default',
      move: 'grab',
      wire: 'crosshair',
      bus: 'crosshair',
      probe: 'crosshair',
      label: 'text'
    }[tool] || 'default';
    this.draw();
  }

  zoomToFit() {
    if (this.components.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of this.components) {
      const b = c.getBounds();
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    }
    const margin = 50;
    const w = maxX - minX + margin * 2;
    const h = maxY - minY + margin * 2;
    this.zoom = Math.min(this.canvas.width / w, this.canvas.height / h);
    this.zoom = Math.max(0.2, Math.min(4, this.zoom));
    this.panX = this.canvas.width / 2 - (minX + maxX) / 2 * this.zoom;
    this.panY = this.canvas.height / 2 - (minY + maxY) / 2 * this.zoom;
    this.updateZoomDisplay();
    this.draw();
  }

  // ========== RENDERING ==========

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Background
    ctx.fillStyle = '#F5F0E8';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);

    // Grid
    if (this.showGrid) this.drawGrid();

    // Wires
    for (const wire of this.wires) {
      this.drawWire(wire);
    }

    // Wire preview
    if (this.wireStart && this.wirePreview) {
      this.drawWirePreview();
    }

    // Components
    for (const comp of this.components) {
      this.drawComponent(comp);
    }

    // Hovered pin highlight
    if (this.hoveredPin) {
      ctx.beginPath();
      ctx.arc(this.hoveredPin.pos.x, this.hoveredPin.pos.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 200, 0, 0.4)';
      ctx.fill();
      ctx.strokeStyle = '#FF8800';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Junction dots (where wires meet)
    this.drawJunctions();

    ctx.restore();
  }

  drawGrid() {
    const ctx = this.ctx;
    const gridSize = this.gridSize;
    const viewLeft = -this.panX / this.zoom;
    const viewTop = -this.panY / this.zoom;
    const viewRight = (this.canvas.width - this.panX) / this.zoom;
    const viewBottom = (this.canvas.height - this.panY) / this.zoom;

    ctx.fillStyle = '#D0CBB8';
    const startX = Math.floor(viewLeft / gridSize) * gridSize;
    const startY = Math.floor(viewTop / gridSize) * gridSize;

    for (let x = startX; x <= viewRight; x += gridSize) {
      for (let y = startY; y <= viewBottom; y += gridSize) {
        ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
      }
    }
  }

  drawWire(wire) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(wire.x1, wire.y1);
    ctx.lineTo(wire.x2, wire.y2);

    if (wire.selected) {
      ctx.strokeStyle = '#0000FF';
      ctx.lineWidth = 3;
    } else {
      switch (wire.signal) {
        case SIGNAL.HIGH: ctx.strokeStyle = '#DD2222'; break;
        case SIGNAL.LOW: ctx.strokeStyle = '#2244AA'; break;
        case SIGNAL.Z: ctx.strokeStyle = '#888888'; break;
        case SIGNAL.UNKNOWN: ctx.strokeStyle = '#FF8800'; break;
        default: ctx.strokeStyle = '#446644';
      }
      ctx.lineWidth = 2;
    }
    ctx.stroke();
  }

  drawWirePreview() {
    const ctx = this.ctx;
    const sx = this.wireStart.x;
    const sy = this.wireStart.y;
    const ex = this.wirePreview.x;
    const ey = this.wirePreview.y;

    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#00AA00';
    ctx.lineWidth = 1.5;

    if (Math.abs(ex - sx) > Math.abs(ey - sy)) {
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx, ey);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  drawJunctions() {
    const ctx = this.ctx;
    const points = {};

    for (const w of this.wires) {
      const k1 = `${w.x1},${w.y1}`;
      const k2 = `${w.x2},${w.y2}`;
      points[k1] = (points[k1] || 0) + 1;
      points[k2] = (points[k2] || 0) + 1;
    }

    for (const key in points) {
      if (points[key] >= 3) {
        const [x, y] = key.split(',').map(Number);
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#2244AA';
        ctx.fill();
      }
    }
  }

  drawComponent(comp) {
    const ctx = this.ctx;
    const def = comp.def;
    const x = comp.x;
    const y = comp.y;
    const w = def.width;
    const h = def.height;

    ctx.save();

    if (comp.rotation !== 0) {
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate((comp.rotation * Math.PI) / 180);
      ctx.translate(-(x + w / 2), -(y + h / 2));
    }

    // Body
    ctx.fillStyle = def.color;
    ctx.strokeStyle = comp.selected ? '#0000FF' : '#000000';
    ctx.lineWidth = comp.selected ? 2.5 : 1.5;
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

    // Notch (IC look)
    if (def.category === '74HC Series' || def.category === 'Memory') {
      ctx.beginPath();
      ctx.arc(x + w / 2, y + 1, 5, 0, Math.PI);
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Component name
    ctx.fillStyle = def.labelColor || '#000080';
    ctx.font = 'bold 11px "Segoe UI", Tahoma, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(def.name, x + w / 2, y + 4);

    // Label below name
    if (comp.label && comp.label !== def.name) {
      ctx.fillStyle = '#666';
      ctx.font = '10px "Segoe UI", Tahoma, sans-serif';
      ctx.fillText(comp.label, x + w / 2, y + 16);
    }

    // LED glow
    if (def.id === 'led') {
      const lit = comp.internalState.lit;
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2 + 4, 8, 0, Math.PI * 2);
      ctx.fillStyle = lit ? '#FF0000' : '#660000';
      ctx.fill();
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.stroke();
      if (lit) {
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2 + 4, 12, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 0, 0, 0.15)';
        ctx.fill();
      }
    }

    // 7-seg display
    if (def.id === 'hex_display') {
      const ch = comp.internalState.hexChar || '0';
      ctx.fillStyle = '#FF3333';
      ctx.font = 'bold 36px "VT323", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ch, x + w / 2, y + h / 2 + 8);
    }

    // Switch state
    if (def.id === 'switch') {
      const on = comp.properties.state === '1';
      ctx.fillStyle = on ? '#00CC00' : '#CC0000';
      ctx.fillRect(x + w / 2 - 8, y + h / 2 - 4, 16, 8);
      ctx.fillStyle = '#FFF';
      ctx.fillRect(on ? x + w / 2 : x + w / 2 - 8, y + h / 2 - 4, 8, 8);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + w / 2 - 8, y + h / 2 - 4, 16, 8);
    }

    // Pins
    for (const pin of def.pins) {
      this.drawPin(comp, pin);
    }

    ctx.restore();
  }

  drawPin(comp, pinDef) {
    const ctx = this.ctx;
    const pos = comp.getPinPosition(pinDef.name);
    if (!pos) return;

    const x = comp.x;
    const y = comp.y;
    const w = comp.def.width;
    const spacing = 20;

    // Pin stub line
    let stubEndX = pos.x;
    let stubEndY = pos.y;
    let labelX = pos.x;
    let labelY = pos.y;
    let textAlign = 'left';

    switch (pinDef.side) {
      case 'left':
        stubEndX = pos.x - 10;
        labelX = pos.x + 4;
        textAlign = 'left';
        break;
      case 'right':
        stubEndX = pos.x + 10;
        labelX = pos.x - 4;
        textAlign = 'right';
        break;
      case 'top':
        stubEndY = pos.y - 10;
        labelY = pos.y + 4;
        textAlign = 'center';
        break;
      case 'bottom':
        stubEndY = pos.y + 10;
        labelY = pos.y - 4;
        textAlign = 'center';
        break;
    }

    // Pin line
    const state = comp.pinStates[pinDef.name];
    switch (state) {
      case SIGNAL.HIGH: ctx.strokeStyle = '#DD2222'; break;
      case SIGNAL.LOW: ctx.strokeStyle = '#2244AA'; break;
      case SIGNAL.Z: ctx.strokeStyle = '#888888'; break;
      default: ctx.strokeStyle = '#006600';
    }
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(stubEndX, stubEndY);
    ctx.stroke();

    // Inversion bubble
    if (pinDef.inverted) {
      const bx = pinDef.side === 'right' ? pos.x + 3 : pinDef.side === 'left' ? pos.x - 3 : pos.x;
      const by = pinDef.side === 'bottom' ? pos.y + 3 : pinDef.side === 'top' ? pos.y - 3 : pos.y;
      ctx.beginPath();
      ctx.arc(bx, by, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#FFF';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Pin dot
    ctx.beginPath();
    ctx.arc(stubEndX, stubEndY, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#006600';
    ctx.fill();

    // Pin label
    if (this.showLabels) {
      ctx.fillStyle = '#446644';
      ctx.font = '9px "Segoe UI", Tahoma, sans-serif';
      ctx.textAlign = textAlign;
      ctx.textBaseline = 'middle';
      ctx.fillText(pinDef.name, labelX, labelY);
    }
  }

  // ========== DEMO CIRCUITS ==========

  loadDemo(name) {
    this.saveState();
    this.components = [];
    this.wires = [];
    this.selected = null;
    this.selectedWire = null;

    switch (name) {
      case 'counter':
        this.loadCounterDemo();
        break;
      case '486':
        this.load486Demo();
        break;
    }

    this.draw();
    this.zoomToFit();
    if (this.onComponentsChange) this.onComponentsChange();
  }

  loadCounterDemo() {
    const clk = this.addComponent('clock', 50, 100);
    clk.label = 'CLK_1Hz';

    const counter = this.addComponent('74hc161', 200, 60);
    counter.label = 'U1';

    const led0 = this.addComponent('led', 380, 60);
    led0.label = 'Q0';
    const led1 = this.addComponent('led', 380, 100);
    led1.label = 'Q1';
    const led2 = this.addComponent('led', 380, 140);
    led2.label = 'Q2';
    const led3 = this.addComponent('led', 380, 180);
    led3.label = 'Q3';

    const vcc = this.addComponent('vcc', 120, 20);
    vcc.label = 'VCC';

    const disp = this.addComponent('hex_display', 460, 60);
    disp.label = 'DISP';

    // Wire clock to counter
    this.wires.push(new Wire(110, 120, 200, 80));
    // VCC to enables
    this.wires.push(new Wire(140, 50, 140, 100));
    this.wires.push(new Wire(140, 100, 200, 100));
    this.wires.push(new Wire(140, 100, 140, 120));
    this.wires.push(new Wire(140, 120, 200, 120));
    // VCC to /CLR
    this.wires.push(new Wire(140, 50, 160, 50));
    this.wires.push(new Wire(160, 50, 160, 90));
    this.wires.push(new Wire(160, 90, 200, 90));

    // Counter outputs to LEDs
    this.wires.push(new Wire(280, 80, 380, 80));
    this.wires.push(new Wire(280, 100, 380, 120));
    this.wires.push(new Wire(280, 120, 380, 160));
    this.wires.push(new Wire(280, 140, 380, 200));

    // Counter to 7seg
    this.wires.push(new Wire(380, 80, 460, 80));
    this.wires.push(new Wire(380, 120, 460, 100));
    this.wires.push(new Wire(380, 160, 460, 120));
    this.wires.push(new Wire(380, 200, 460, 140));

    // GND for /LOAD
    const gnd = this.addComponent('vcc', 120, 180);
    gnd.label = 'VCC_LOAD';
    this.wires.push(new Wire(140, 210, 140, 140));
    this.wires.push(new Wire(140, 140, 200, 140));
  }

  load486Demo() {
    // Simplified i486 system block diagram
    const cpu = this.addComponent('header_8pin', 100, 100);
    cpu.label = 'i486 CPU';

    const decoder = this.addComponent('74hc138', 300, 80);
    decoder.label = 'ADDR_DECODE';

    const ram = this.addComponent('sram_32k', 500, 60);
    ram.label = 'RAM';

    const rom = this.addComponent('eeprom_64k', 500, 220);
    rom.label = 'BIOS ROM';

    const clk = this.addComponent('clock', 10, 100);
    clk.label = 'CLK_33MHz';

    const buf = this.addComponent('74hc245', 300, 280);
    buf.label = 'DATA_BUF';

    // Clock to CPU
    this.wires.push(new Wire(70, 120, 100, 120));

    // CPU address to decoder
    this.wires.push(new Wire(140, 120, 300, 100));
    this.wires.push(new Wire(140, 140, 300, 120));
    this.wires.push(new Wire(140, 160, 300, 140));

    // Decoder outputs to chip selects
    this.wires.push(new Wire(380, 100, 500, 100));
    this.wires.push(new Wire(380, 120, 420, 120));
    this.wires.push(new Wire(420, 120, 420, 260));
    this.wires.push(new Wire(420, 260, 500, 260));

    // CPU data to bus buffer
    this.wires.push(new Wire(140, 180, 200, 180));
    this.wires.push(new Wire(200, 180, 200, 300));
    this.wires.push(new Wire(200, 300, 300, 300));
  }
}
