let viewer;

function init() {
  const canvas = document.getElementById('schematic-canvas');
  viewer = new SchematicViewer(canvas);
  viewer.onSelectionChange = updateProperties;
  viewer.onStatusMessage = setStatus;
  viewer.onComponentsChange = updateCounts;

  setupMenus();
  setupToolbar();
  setupTabs();
  setupKeyboard();
  setupBottomResize();
  setupFileDrop();

  setStatus('Ready — open a KiCad schematic or try a demo');
  consolePrint('RetroSim v2.0 — KiCad Schematic Viewer', 'info');
  consolePrint('Design in KiCad, view anywhere.', 'info');
  consolePrint('Open a .kicad_sch file to get started.', 'info');
  consolePrint('', 'info');
}

// ========== FILE HANDLING ==========

function setupFileDrop() {
  const container = document.getElementById('canvas-container');
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');

  container.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    dropZone.classList.add('active');
  });

  container.addEventListener('dragleave', e => {
    if (!container.contains(e.relatedTarget)) dropZone.classList.remove('active');
  });

  container.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('active');
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  });

  document.getElementById('open-file-btn').addEventListener('click', () => fileInput.click());

  dropZone.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      handleAction(btn.dataset.action);
      e.stopPropagation();
    });
  });

  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) loadFile(file);
    fileInput.value = '';
  });
}

function loadFile(file) {
  if (!file.name.endsWith('.kicad_sch')) {
    consolePrint('Error: Please open a .kicad_sch file', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const sch = KicadParser.parseSchematic(reader.result);
      viewer.loadSchematic(sch);
      document.getElementById('drop-zone').style.display = 'none';
      document.getElementById('file-name').textContent = file.name;
      buildComponentList(sch);
      updateInfo(sch, file.name);
      consolePrint('Loaded: ' + file.name, 'info');
      consolePrint('  ' + sch.symbols.length + ' components, ' + sch.wires.length + ' wires, ' + sch.junctions.length + ' junctions', 'info');
      consolePrint('  ' + sch.labels.length + ' labels, ' + sch.globalLabels.length + ' global labels', 'info');
      consolePrint('  Paper: ' + sch.paper, 'info');
    } catch (err) {
      consolePrint('Error parsing schematic: ' + err.message, 'error');
      setStatus('Error loading file');
    }
  };
  reader.readAsText(file);
}

// ========== COMPONENT LIST ==========

function buildComponentList(sch, filter) {
  const tree = document.getElementById('library-tree');
  tree.innerHTML = '';
  const filterLow = (filter || '').toLowerCase();
  const grouped = {};

  for (const inst of sch.symbols) {
    const ref = inst.properties['Reference'];
    const val = inst.properties['Value'];
    const refStr = ref ? ref.value : '?';
    const valStr = val ? val.value : '?';
    const prefix = refStr.replace(/[0-9]+$/, '') || 'Other';
    if (filterLow && !refStr.toLowerCase().includes(filterLow) && !valStr.toLowerCase().includes(filterLow) && !inst.libId.toLowerCase().includes(filterLow)) continue;
    if (!grouped[prefix]) grouped[prefix] = [];
    grouped[prefix].push({ inst, ref: refStr, val: valStr });
  }

  for (const prefix in grouped) {
    const catEl = document.createElement('div');
    catEl.className = 'lib-category open';
    catEl.textContent = getCategoryName(prefix) + ' (' + grouped[prefix].length + ')';
    catEl.addEventListener('click', () => catEl.classList.toggle('open'));

    const itemsEl = document.createElement('div');
    itemsEl.className = 'lib-items';

    grouped[prefix].sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true }));

    for (const { inst, ref, val } of grouped[prefix]) {
      const item = document.createElement('div');
      item.className = 'lib-item';
      const icon = document.createElement('span');
      icon.className = 'chip-icon';
      icon.textContent = ref.substring(0, 3);
      const label = document.createElement('span');
      label.textContent = ref + ' = ' + val;
      item.appendChild(icon);
      item.appendChild(label);
      item.addEventListener('click', () => {
        viewer.selected = inst;
        viewer.draw();
        if (viewer.onSelectionChange) viewer.onSelectionChange(inst);
        const s = viewer.mmToScreen(inst.at.x, inst.at.y);
        const cx = viewer.canvas.width / 2, cy = viewer.canvas.height / 2;
        viewer.panX += cx - s.x;
        viewer.panY += cy - s.y;
        viewer.draw();
      });
      itemsEl.appendChild(item);
    }

    tree.appendChild(catEl);
    tree.appendChild(itemsEl);
  }

  if (Object.keys(grouped).length === 0) {
    tree.innerHTML = '<p class="hint-text">No components found</p>';
  }

  document.getElementById('lib-search-input').oninput = e => buildComponentList(sch, e.target.value);
}

function getCategoryName(prefix) {
  const names = {
    'R': 'Resistors', 'C': 'Capacitors', 'L': 'Inductors',
    'D': 'Diodes', 'Q': 'Transistors', 'U': 'ICs',
    'J': 'Connectors', 'P': 'Connectors', 'SW': 'Switches',
    'F': 'Fuses', 'Y': 'Crystals', 'X': 'Crystals',
    'LED': 'LEDs', 'K': 'Relays', 'T': 'Transformers',
    '#PWR': 'Power', '#FLG': 'Flags',
  };
  return names[prefix] || prefix;
}

// ========== MENUS ==========

function setupMenus() {
  const menuItems = document.querySelectorAll('.menu-item');
  menuItems.forEach(item => {
    item.addEventListener('click', e => {
      const wasOpen = item.classList.contains('open');
      menuItems.forEach(m => m.classList.remove('open'));
      if (!wasOpen) item.classList.add('open');
      e.stopPropagation();
    });
  });
  document.addEventListener('click', () => menuItems.forEach(m => m.classList.remove('open')));
  document.querySelectorAll('.menu-entry').forEach(entry => {
    entry.addEventListener('click', e => {
      handleAction(entry.dataset.action);
      menuItems.forEach(m => m.classList.remove('open'));
      e.stopPropagation();
    });
  });
  document.querySelectorAll('.dialog-close').forEach(btn => {
    btn.addEventListener('click', () => btn.closest('.win95-dialog').style.display = 'none');
  });
}

// ========== TOOLBAR ==========

function setupToolbar() {
  document.querySelectorAll('.tool-btn[data-action]').forEach(btn => {
    btn.addEventListener('click', () => handleAction(btn.dataset.action));
  });
}

// ========== TABS ==========

function setupTabs() {
  document.querySelectorAll('.panel-tabs').forEach(tabBar => {
    const tabs = tabBar.querySelectorAll('.panel-tab');
    const parent = tabBar.parentElement;
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        parent.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
        tab.classList.add('active');
        const content = parent.querySelector('#' + tab.dataset.tab + '-tab');
        if (content) content.classList.add('active');
      });
    });
  });
}

// ========== BOTTOM PANEL RESIZE ==========

function setupBottomResize() {
  const handle = document.getElementById('bottom-resize-handle');
  const panel = document.getElementById('bottom-panel');
  let startY, startH;
  handle.addEventListener('mousedown', e => {
    startY = e.clientY;
    startH = panel.offsetHeight;
    e.preventDefault();
    const onMove = e => {
      panel.style.height = Math.max(40, Math.min(400, startH - (e.clientY - startY))) + 'px';
      viewer.resize();
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ========== KEYBOARD ==========

function setupKeyboard() {
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    switch (e.key) {
      case 'f': case 'F': handleAction('zoom-fit'); break;
      case 'g': case 'G': handleAction('toggle-grid'); break;
      case '+': case '=': handleAction('zoom-in'); break;
      case '-': handleAction('zoom-out'); break;
      case 'o':
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); handleAction('open'); }
        break;
    }
  });
}

// ========== ACTIONS ==========

function handleAction(action) {
  switch (action) {
    case 'open':
      document.getElementById('file-input').click();
      break;

    case 'export':
      exportPNG();
      break;

    case 'demo-reset':
      loadDemoSchematic('reset');
      break;

    case 'demo-cpu':
      loadDemoSchematic('cpu');
      break;

    case 'zoom-in':
      viewer.zoom = Math.min(30, viewer.zoom * 1.3);
      viewer.updateZoomDisplay();
      viewer.draw();
      break;

    case 'zoom-out':
      viewer.zoom = Math.max(0.3, viewer.zoom / 1.3);
      viewer.updateZoomDisplay();
      viewer.draw();
      break;

    case 'zoom-fit':
      viewer.zoomToFit();
      viewer.draw();
      break;

    case 'toggle-grid':
      viewer.showGrid = !viewer.showGrid;
      viewer.draw();
      break;

    case 'toggle-labels':
      viewer.showLabels = !viewer.showLabels;
      viewer.draw();
      break;

    case 'win-components':
      const lp = document.getElementById('library-panel');
      lp.style.display = lp.style.display === 'none' ? 'flex' : 'none';
      viewer.resize();
      break;

    case 'win-properties':
      const rp = document.getElementById('right-panel');
      rp.style.display = rp.style.display === 'none' ? 'flex' : 'none';
      viewer.resize();
      break;

    case 'win-console':
      const bp = document.getElementById('bottom-panel');
      bp.style.display = bp.style.display === 'none' ? 'flex' : 'none';
      viewer.resize();
      break;

    case 'help-about':
      document.getElementById('about-dialog').style.display = 'block';
      break;

    case 'help-shortcuts':
      document.getElementById('shortcuts-dialog').style.display = 'block';
      break;
  }
}

// ========== PROPERTIES PANEL ==========

function updateProperties(inst) {
  const content = document.getElementById('properties-content');
  if (!inst) {
    content.innerHTML = '<p class="hint-text">Tap a component to view properties</p>';
    return;
  }
  let html = '<div class="prop-group">';
  html += '<div class="prop-group-title">Component</div>';
  const ref = inst.properties['Reference'];
  const val = inst.properties['Value'];
  const fp = inst.properties['Footprint'];
  html += `<div class="prop-row"><span class="prop-label">Reference:</span><span class="prop-value">${ref ? ref.value : '?'}</span></div>`;
  html += `<div class="prop-row"><span class="prop-label">Value:</span><span class="prop-value">${val ? val.value : '?'}</span></div>`;
  html += `<div class="prop-row"><span class="prop-label">Library:</span><span class="prop-value" style="font-size:10px">${inst.libId}</span></div>`;
  if (fp) html += `<div class="prop-row"><span class="prop-label">Footprint:</span><span class="prop-value" style="font-size:10px">${fp.value}</span></div>`;
  html += `<div class="prop-row"><span class="prop-label">Position:</span><span class="prop-value">${inst.at.x.toFixed(1)}, ${inst.at.y.toFixed(1)}</span></div>`;
  html += `<div class="prop-row"><span class="prop-label">Rotation:</span><span class="prop-value">${inst.at.angle}°</span></div>`;
  if (inst.mirrorX || inst.mirrorY) html += `<div class="prop-row"><span class="prop-label">Mirror:</span><span class="prop-value">${inst.mirrorX ? 'X' : ''}${inst.mirrorY ? 'Y' : ''}</span></div>`;
  html += '</div>';

  const otherProps = Object.entries(inst.properties).filter(([k]) => !['Reference', 'Value', 'Footprint'].includes(k));
  if (otherProps.length > 0) {
    html += '<div class="prop-group"><div class="prop-group-title">Properties</div>';
    for (const [key, prop] of otherProps) {
      if (prop.hide) continue;
      html += `<div class="prop-row"><span class="prop-label">${key}:</span><span class="prop-value">${prop.value}</span></div>`;
    }
    html += '</div>';
  }

  if (viewer.sch) {
    const lib = viewer.sch.libSymbols[inst.libId];
    if (lib) {
      let pinCount = 0;
      for (const u of lib.units) pinCount += u.pins.length;
      html += '<div class="prop-group"><div class="prop-group-title">Pins (' + pinCount + ')</div>';
      for (const u of lib.units) {
        for (const pin of u.pins) {
          html += `<div class="prop-row"><span class="prop-label">${pin.number}:</span><span class="prop-value">${pin.name} (${pin.elecType})</span></div>`;
        }
      }
      html += '</div>';
    }
  }

  content.innerHTML = html;
}

// ========== INFO PANEL ==========

function updateInfo(sch, filename) {
  document.getElementById('info-file').textContent = filename || '-';
  document.getElementById('info-paper').textContent = sch.paper;
  document.getElementById('info-comps').textContent = sch.symbols.length;
  document.getElementById('info-wires').textContent = sch.wires.length;
  document.getElementById('info-nets').textContent = sch.labels.length + sch.globalLabels.length;
}

// ========== STATUS BAR ==========

function setStatus(msg) {
  document.getElementById('status-msg').textContent = msg;
}

function updateCounts() {
  document.getElementById('status-components').textContent = 'Components: ' + viewer.components.length;
  document.getElementById('status-wires').textContent = 'Wires: ' + viewer.wires.length;
}

// ========== CONSOLE ==========

function consolePrint(msg, type) {
  const output = document.getElementById('console-output');
  const line = document.createElement('div');
  line.className = 'console-line' + (type ? ' ' + type : '');
  line.textContent = msg;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

// ========== EXPORT ==========

function exportPNG() {
  const link = document.createElement('a');
  link.download = 'schematic.png';
  link.href = viewer.canvas.toDataURL();
  link.click();
  consolePrint('Exported schematic as PNG.', 'info');
}

// ========== DEMO SCHEMATICS ==========

function loadDemoSchematic(name) {
  const sch = name === 'cpu' ? createCpuDemo() : createResetDemo();
  viewer.loadSchematic(sch);
  document.getElementById('drop-zone').style.display = 'none';
  document.getElementById('file-name').textContent = 'Demo: ' + (name === 'cpu' ? 'i486 Block' : 'Reset Circuit');
  buildComponentList(sch);
  updateInfo(sch, 'demo-' + name + '.kicad_sch');
  consolePrint('Loaded demo: ' + (name === 'cpu' ? 'i486 System Block Diagram' : 'CPU Reset Circuit'), 'info');
}

function createResetDemo() {
  const lib = {};
  lib['Device:R'] = {
    name: 'Device:R', properties: { Reference: 'R', Value: 'R' },
    units: [
      { name: 'R_0_1', rectangles: [{ start: { x: -1.016, y: -2.54 }, end: { x: 1.016, y: 2.54 }, fill: 'none' }], circles: [], arcs: [], polylines: [], pins: [] },
      { name: 'R_1_1', rectangles: [], circles: [], arcs: [], polylines: [], pins: [
        { elecType: 'passive', graphType: 'line', at: { x: 0, y: 3.81, angle: 270 }, length: 1.27, name: '~', number: '1' },
        { elecType: 'passive', graphType: 'line', at: { x: 0, y: -3.81, angle: 90 }, length: 1.27, name: '~', number: '2' },
      ] },
    ], pinNamesOffset: 0.508, pinNamesHide: true, isPower: false,
  };
  lib['Device:C'] = {
    name: 'Device:C', properties: { Reference: 'C', Value: 'C' },
    units: [
      { name: 'C_0_1', rectangles: [], circles: [], arcs: [], polylines: [
        { points: [{ x: -2.032, y: -0.762 }, { x: 2.032, y: -0.762 }], fill: 'none' },
        { points: [{ x: -2.032, y: 0.762 }, { x: 2.032, y: 0.762 }], fill: 'none' },
      ], pins: [] },
      { name: 'C_1_1', rectangles: [], circles: [], arcs: [], polylines: [], pins: [
        { elecType: 'passive', graphType: 'line', at: { x: 0, y: 2.54, angle: 270 }, length: 1.778, name: '~', number: '1' },
        { elecType: 'passive', graphType: 'line', at: { x: 0, y: -2.54, angle: 90 }, length: 1.778, name: '~', number: '2' },
      ] },
    ], pinNamesOffset: 0.508, pinNamesHide: true, isPower: false,
  };
  lib['Device:D'] = {
    name: 'Device:D', properties: { Reference: 'D', Value: 'D' },
    units: [
      { name: 'D_0_1', rectangles: [], circles: [], arcs: [], polylines: [
        { points: [{ x: -1.27, y: 1.27 }, { x: -1.27, y: -1.27 }, { x: 1.27, y: 0 }, { x: -1.27, y: 1.27 }], fill: 'outline' },
        { points: [{ x: 1.27, y: 1.27 }, { x: 1.27, y: -1.27 }], fill: 'none' },
      ], pins: [] },
      { name: 'D_1_1', rectangles: [], circles: [], arcs: [], polylines: [], pins: [
        { elecType: 'passive', graphType: 'line', at: { x: -2.54, y: 0, angle: 0 }, length: 1.27, name: 'K', number: '1' },
        { elecType: 'passive', graphType: 'line', at: { x: 2.54, y: 0, angle: 180 }, length: 1.27, name: 'A', number: '2' },
      ] },
    ], pinNamesOffset: 0.508, pinNamesHide: true, isPower: false,
  };
  lib['74xx:74HC14'] = {
    name: '74xx:74HC14', properties: { Reference: 'U', Value: '74HC14' },
    units: [
      { name: '74HC14_0_1', rectangles: [], circles: [], arcs: [], polylines: [], pins: [] },
      { name: '74HC14_1_1', rectangles: [{ start: { x: -5.08, y: 5.08 }, end: { x: 5.08, y: -5.08 }, fill: 'background' }], circles: [], arcs: [], polylines: [
        { points: [{ x: -2.54, y: 2.54 }, { x: 2.54, y: 0 }, { x: -2.54, y: -2.54 }, { x: -2.54, y: 2.54 }], fill: 'none' },
      ], pins: [
        { elecType: 'input', graphType: 'line', at: { x: -7.62, y: 0, angle: 0 }, length: 2.54, name: 'IN', number: '1' },
        { elecType: 'output', graphType: 'inverted', at: { x: 7.62, y: 0, angle: 180 }, length: 2.54, name: 'OUT', number: '2' },
      ] },
    ], pinNamesOffset: 1.016, pinNamesHide: false, isPower: false,
  };

  const symbols = [
    { libId: 'Device:R', at: { x: 100, y: 65, angle: 0 }, mirrorX: false, mirrorY: false, unit: 1,
      properties: { Reference: { value: 'R1', at: { x: 103, y: 65, angle: 90 }, hide: false }, Value: { value: '10k', at: { x: 97, y: 65, angle: 90 }, hide: false } }, uuid: '1' },
    { libId: 'Device:C', at: { x: 100, y: 82, angle: 0 }, mirrorX: false, mirrorY: false, unit: 1,
      properties: { Reference: { value: 'C1', at: { x: 103, y: 82, angle: 90 }, hide: false }, Value: { value: '10uF', at: { x: 97, y: 82, angle: 90 }, hide: false } }, uuid: '2' },
    { libId: 'Device:D', at: { x: 110, y: 65, angle: 90 }, mirrorX: false, mirrorY: false, unit: 1,
      properties: { Reference: { value: 'D1', at: { x: 113, y: 65, angle: 0 }, hide: false }, Value: { value: '1N4148', at: { x: 115, y: 68, angle: 0 }, hide: false } }, uuid: '3' },
    { libId: '74xx:74HC14', at: { x: 125, y: 76, angle: 0 }, mirrorX: false, mirrorY: false, unit: 1,
      properties: { Reference: { value: 'U1', at: { x: 125, y: 69, angle: 0 }, hide: false }, Value: { value: '74HC14', at: { x: 125, y: 83, angle: 0 }, hide: false } }, uuid: '4' },
  ];

  const wires = [
    { start: { x: 100, y: 57 }, end: { x: 100, y: 61.19 } },
    { start: { x: 100, y: 68.81 }, end: { x: 100, y: 76 } },
    { start: { x: 100, y: 76 }, end: { x: 117.38, y: 76 } },
    { start: { x: 100, y: 76 }, end: { x: 100, y: 79.46 } },
    { start: { x: 100, y: 84.54 }, end: { x: 100, y: 90 } },
    { start: { x: 132.62, y: 76 }, end: { x: 145, y: 76 } },
    { start: { x: 100, y: 57 }, end: { x: 110, y: 57 } },
    { start: { x: 110, y: 57 }, end: { x: 110, y: 62.46 } },
  ];

  const junctions = [{ at: { x: 100, y: 76, angle: 0 } }];
  const labels = [
    { text: 'VCC', at: { x: 100, y: 57, angle: 0 } },
    { text: 'GND', at: { x: 100, y: 90, angle: 0 } },
    { text: '/RESET', at: { x: 145, y: 76, angle: 0 } },
  ];

  return {
    paper: 'A4', libSymbols: lib, symbols, wires,
    buses: [], junctions, noConnects: [],
    labels, globalLabels: [], hierLabels: [],
    text: [{ text: 'i486 Reset Circuit', at: { x: 95, y: 50, angle: 0 } }],
    sheets: [],
  };
}

function createCpuDemo() {
  const mkBox = (w, h) => ({
    name: '_0_1',
    rectangles: [{ start: { x: -w/2, y: -h/2 }, end: { x: w/2, y: h/2 }, fill: 'background' }],
    circles: [], arcs: [], polylines: [], pins: [],
  });
  const mkPins = (pins) => ({
    name: '_1_1', rectangles: [], circles: [], arcs: [], polylines: [],
    pins: pins.map(p => ({ elecType: p[3] || 'bidi', graphType: 'line', at: { x: p[0], y: p[1], angle: p[2] }, length: 2.54, name: p[4] || '', number: p[5] || '' })),
  });

  const lib = {};
  lib['cpu:i486DX'] = { name: 'cpu:i486DX', properties: {}, units: [
    mkBox(20, 25),
    mkPins([
      [-12.54, -7.62, 0, 'bidi', 'D[0:31]', '1'], [-12.54, 0, 0, 'bidi', 'A[0:31]', '2'],
      [-12.54, 7.62, 0, 'input', 'CLK', '3'],
      [12.54, -7.62, 180, 'output', '/MEMR', '4'], [12.54, 0, 180, 'output', '/MEMW', '5'],
      [12.54, 7.62, 180, 'input', '/RESET', '6'],
    ]),
  ], pinNamesOffset: 1, pinNamesHide: false, isPower: false };

  lib['chipset:EPM7128'] = { name: 'chipset:EPM7128', properties: {}, units: [
    mkBox(20, 22),
    mkPins([
      [-12.54, -5.08, 0, 'bidi', 'D[0:15]', '1'], [-12.54, 2.54, 0, 'input', 'A[0:15]', '2'],
      [-12.54, 7.62, 0, 'input', 'CLK', '3'],
      [12.54, -7.62, 180, 'output', '/CS_RAM', '4'], [12.54, -2.54, 180, 'output', '/CS_ROM', '5'],
      [12.54, 2.54, 180, 'output', '/CS_IO', '6'], [12.54, 7.62, 180, 'output', 'ISA_CLK', '7'],
    ]),
  ], pinNamesOffset: 1, pinNamesHide: false, isPower: false };

  lib['memory:SIMM30'] = { name: 'memory:SIMM30', properties: {}, units: [
    mkBox(14, 15),
    mkPins([
      [-9.54, -2.54, 0, 'bidi', 'D[0:7]', '1'], [-9.54, 2.54, 0, 'input', 'A[0:9]', '2'],
      [9.54, -2.54, 180, 'input', '/RAS', '3'], [9.54, 2.54, 180, 'input', '/CAS', '4'],
    ]),
  ], pinNamesOffset: 1, pinNamesHide: false, isPower: false };

  lib['memory:28C512'] = { name: 'memory:28C512', properties: {}, units: [
    mkBox(16, 14),
    mkPins([
      [-10.54, -2.54, 0, 'output', 'D[0:7]', '1'], [-10.54, 2.54, 0, 'input', 'A[0:15]', '2'],
      [10.54, -2.54, 180, 'input', '/CE', '3'], [10.54, 2.54, 180, 'input', '/OE', '4'],
    ]),
  ], pinNamesOffset: 1, pinNamesHide: false, isPower: false };

  lib['interface:ISA'] = { name: 'interface:ISA', properties: {}, units: [
    mkBox(14, 18),
    mkPins([
      [-9.54, -5.08, 0, 'bidi', 'D[0:7]', '1'], [-9.54, 0, 0, 'input', 'A[0:19]', '2'],
      [-9.54, 5.08, 0, 'input', 'CLK', '3'],
      [9.54, 0, 180, 'output', 'VGA', '4'],
    ]),
  ], pinNamesOffset: 1, pinNamesHide: false, isPower: false };

  const symbols = [
    { libId: 'cpu:i486DX', at: { x: 80, y: 80, angle: 0 }, mirrorX: false, mirrorY: false, unit: 1,
      properties: { Reference: { value: 'U1', at: { x: 80, y: 65, angle: 0 }, hide: false }, Value: { value: 'i486DX-33', at: { x: 80, y: 95, angle: 0 }, hide: false } }, uuid: '10' },
    { libId: 'chipset:EPM7128', at: { x: 135, y: 80, angle: 0 }, mirrorX: false, mirrorY: false, unit: 1,
      properties: { Reference: { value: 'U2', at: { x: 135, y: 67, angle: 0 }, hide: false }, Value: { value: 'EPM7128', at: { x: 135, y: 93, angle: 0 }, hide: false } }, uuid: '11' },
    { libId: 'memory:SIMM30', at: { x: 190, y: 72, angle: 0 }, mirrorX: false, mirrorY: false, unit: 1,
      properties: { Reference: { value: 'U3', at: { x: 190, y: 62, angle: 0 }, hide: false }, Value: { value: '4MB DRAM', at: { x: 190, y: 82, angle: 0 }, hide: false } }, uuid: '12' },
    { libId: 'memory:28C512', at: { x: 190, y: 100, angle: 0 }, mirrorX: false, mirrorY: false, unit: 1,
      properties: { Reference: { value: 'U4', at: { x: 190, y: 91, angle: 0 }, hide: false }, Value: { value: '28C512', at: { x: 190, y: 109, angle: 0 }, hide: false } }, uuid: '13' },
    { libId: 'interface:ISA', at: { x: 135, y: 120, angle: 0 }, mirrorX: false, mirrorY: false, unit: 1,
      properties: { Reference: { value: 'J1', at: { x: 135, y: 109, angle: 0 }, hide: false }, Value: { value: 'ISA Slot', at: { x: 135, y: 131, angle: 0 }, hide: false } }, uuid: '14' },
  ];

  const wires = [
    { start: { x: 92.54, y: 72.38 }, end: { x: 105, y: 72.38 } },
    { start: { x: 105, y: 72.38 }, end: { x: 105, y: 74.92 } },
    { start: { x: 105, y: 74.92 }, end: { x: 122.46, y: 74.92 } },
    { start: { x: 92.54, y: 80 }, end: { x: 105, y: 80 } },
    { start: { x: 105, y: 80 }, end: { x: 105, y: 82.54 } },
    { start: { x: 105, y: 82.54 }, end: { x: 122.46, y: 82.54 } },
    { start: { x: 92.54, y: 87.62 }, end: { x: 105, y: 87.62 } },
    { start: { x: 105, y: 87.62 }, end: { x: 122.46, y: 87.62 } },
    { start: { x: 147.54, y: 72.38 }, end: { x: 165, y: 72.38 } },
    { start: { x: 165, y: 72.38 }, end: { x: 165, y: 69.46 } },
    { start: { x: 165, y: 69.46 }, end: { x: 180.46, y: 69.46 } },
    { start: { x: 147.54, y: 77.46 }, end: { x: 165, y: 77.46 } },
    { start: { x: 165, y: 77.46 }, end: { x: 165, y: 97.46 } },
    { start: { x: 165, y: 97.46 }, end: { x: 179.46, y: 97.46 } },
    { start: { x: 147.54, y: 82.54 }, end: { x: 160, y: 82.54 } },
    { start: { x: 160, y: 82.54 }, end: { x: 160, y: 102.54 } },
    { start: { x: 160, y: 102.54 }, end: { x: 179.46, y: 102.54 } },
    { start: { x: 147.54, y: 87.62 }, end: { x: 155, y: 87.62 } },
    { start: { x: 155, y: 87.62 }, end: { x: 155, y: 120 } },
    { start: { x: 155, y: 120 }, end: { x: 155, y: 125.08 } },
    { start: { x: 155, y: 125.08 }, end: { x: 125.46, y: 125.08 } },
    { start: { x: 105, y: 74.92 }, end: { x: 105, y: 114.92 } },
    { start: { x: 105, y: 114.92 }, end: { x: 125.46, y: 114.92 } },
    { start: { x: 105, y: 80 }, end: { x: 105, y: 120 } },
    { start: { x: 105, y: 120 }, end: { x: 125.46, y: 120 } },
    { start: { x: 165, y: 69.46 }, end: { x: 165, y: 74.54 } },
    { start: { x: 165, y: 74.54 }, end: { x: 180.46, y: 74.54 } },
  ];

  const junctions = [
    { at: { x: 105, y: 74.92, angle: 0 } }, { at: { x: 105, y: 80, angle: 0 } },
    { at: { x: 165, y: 69.46, angle: 0 } },
  ];

  const globalLabels = [
    { text: 'DATA_BUS', at: { x: 105, y: 72.38, angle: 0 }, shape: 'bidi' },
    { text: 'ADDR_BUS', at: { x: 105, y: 82.54, angle: 0 }, shape: 'bidi' },
  ];

  return {
    paper: 'A4', libSymbols: lib, symbols, wires,
    buses: [], junctions, noConnects: [],
    labels: [], globalLabels, hierLabels: [],
    text: [{ text: 'Homemade i486 Computer — System Block Diagram', at: { x: 70, y: 55, angle: 0 } }],
    sheets: [],
  };
}

// ========== INIT ==========
window.addEventListener('load', init);
