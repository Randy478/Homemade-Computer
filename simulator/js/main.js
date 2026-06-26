let editor, engine, waveform;

function init() {
  const canvas = document.getElementById('schematic-canvas');
  const waveCanvas = document.getElementById('waveform-canvas');

  editor = new SchematicEditor(canvas);
  engine = new SimulationEngine();
  waveform = new WaveformViewer(waveCanvas);
  waveform.setEngine(engine);

  editor.onSelectionChange = updateProperties;
  editor.onStatusMessage = setStatus;
  editor.onComponentsChange = updateCounts;

  buildLibraryTree();
  setupMenus();
  setupToolbar();
  setupTabs();
  setupKeyboard();
  setupBottomResize();
  setupLibraryDrag();

  engine.onCycle = (cycle) => {
    document.getElementById('sim-cycle').textContent = 'Cycle: ' + cycle;
    waveform.draw();
  };

  engine.onStateChange = () => {
    editor.draw();
  };

  setStatus('Ready — drag components from the library or load a demo from File menu');
  consolePrint('RetroSim PCB v1.0 initialized', 'info');
  consolePrint('Simulation engine ready. ' + Object.keys(COMPONENT_LIBRARY).length + ' components in library.', 'info');
  consolePrint('Type "help" for commands.', 'info');
  consolePrint('', 'info');
}

// ========== LIBRARY TREE ==========

function buildLibraryTree(filter = '') {
  const tree = document.getElementById('library-tree');
  tree.innerHTML = '';

  const cats = getLibraryCategories();
  const filterLower = filter.toLowerCase();

  for (const catName in cats) {
    const components = cats[catName].filter(c =>
      !filter || c.name.toLowerCase().includes(filterLower) ||
      c.description.toLowerCase().includes(filterLower) ||
      c.id.toLowerCase().includes(filterLower)
    );

    if (components.length === 0) continue;

    const catEl = document.createElement('div');
    catEl.className = 'lib-category' + (filter ? ' open' : '');
    catEl.textContent = catName;
    catEl.addEventListener('click', () => catEl.classList.toggle('open'));

    const itemsEl = document.createElement('div');
    itemsEl.className = 'lib-items';

    for (const comp of components) {
      const item = document.createElement('div');
      item.className = 'lib-item';
      item.draggable = true;
      item.dataset.compId = comp.id;

      const icon = document.createElement('span');
      icon.className = 'chip-icon';
      icon.textContent = comp.name.substring(0, 3);

      const label = document.createElement('span');
      label.textContent = comp.name;

      item.appendChild(icon);
      item.appendChild(label);

      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('component-id', comp.id);
        e.dataTransfer.effectAllowed = 'copy';
      });

      item.title = comp.description;
      itemsEl.appendChild(item);
    }

    tree.appendChild(catEl);
    tree.appendChild(itemsEl);
  }
}

function setupLibraryDrag() {
  const container = document.getElementById('canvas-container');

  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  container.addEventListener('drop', (e) => {
    e.preventDefault();
    const compId = e.dataTransfer.getData('component-id');
    if (!compId) return;

    const rect = editor.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { x: wx, y: wy } = editor.screenToWorld(sx, sy);

    editor.addComponent(compId, wx, wy);
  });

  document.getElementById('lib-search-input').addEventListener('input', (e) => {
    buildLibraryTree(e.target.value);
  });
}

// ========== MENUS ==========

function setupMenus() {
  const menuItems = document.querySelectorAll('.menu-item');

  menuItems.forEach(item => {
    item.addEventListener('click', (e) => {
      const wasOpen = item.classList.contains('open');
      menuItems.forEach(m => m.classList.remove('open'));
      if (!wasOpen) item.classList.add('open');
      e.stopPropagation();
    });
  });

  document.addEventListener('click', () => {
    menuItems.forEach(m => m.classList.remove('open'));
  });

  document.querySelectorAll('.menu-entry').forEach(entry => {
    entry.addEventListener('click', (e) => {
      const action = entry.dataset.action;
      if (action) handleAction(action);
      menuItems.forEach(m => m.classList.remove('open'));
      e.stopPropagation();
    });
  });

  document.querySelectorAll('.dialog-close').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.win95-dialog').style.display = 'none';
    });
  });
}

// ========== TOOLBAR ==========

function setupToolbar() {
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      editor.setTool(btn.dataset.tool);
      setStatus('Tool: ' + btn.title);
    });
  });

  document.querySelectorAll('.tool-btn[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      handleAction(btn.dataset.action);
    });
  });

  // Default tool
  document.querySelector('.tool-btn[data-tool="select"]').classList.add('active');
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
        if (tab.dataset.tab === 'waveform') waveform.resize();
      });
    });
  });

  document.getElementById('wave-zoom-in').addEventListener('click', () => waveform.zoomIn());
  document.getElementById('wave-zoom-out').addEventListener('click', () => waveform.zoomOut());
  document.getElementById('wave-fit').addEventListener('click', () => waveform.fitToWindow());
}

// ========== BOTTOM PANEL RESIZE ==========

function setupBottomResize() {
  const handle = document.getElementById('bottom-resize-handle');
  const panel = document.getElementById('bottom-panel');
  let startY, startH;

  handle.addEventListener('mousedown', (e) => {
    startY = e.clientY;
    startH = panel.offsetHeight;
    e.preventDefault();

    const onMove = (e) => {
      const newH = Math.max(60, Math.min(500, startH - (e.clientY - startY)));
      panel.style.height = newH + 'px';
      waveform.resize();
      editor.resize();
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ========== KEYBOARD ==========

function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    switch (e.key) {
      case 'v': setToolByKey('select'); break;
      case 'm': setToolByKey('move'); break;
      case 'w': setToolByKey('wire'); break;
      case 'b': setToolByKey('bus'); break;
      case 'p': setToolByKey('probe'); break;
      case 'l': setToolByKey('label'); break;
      case 'r':
        if (editor.selected) {
          editor.saveState();
          editor.selected.rotation = (editor.selected.rotation + 90) % 360;
          editor.draw();
        }
        break;
      case 'Delete':
      case 'Backspace':
        editor.deleteSelected();
        break;
      case 'Escape':
        editor.wireStart = null;
        editor.wirePreview = null;
        editor.draw();
        break;
      case ' ':
        e.preventDefault();
        if (engine.running) handleAction('sim-stop');
        else handleAction('sim-start');
        break;
      case '.':
        handleAction('sim-step');
        break;
      case 'z':
        if (e.ctrlKey || e.metaKey) { editor.undo(); e.preventDefault(); }
        break;
      case 'y':
        if (e.ctrlKey || e.metaKey) { editor.redo(); e.preventDefault(); }
        break;
    }
  });
}

function setToolByKey(tool) {
  document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.tool-btn[data-tool="${tool}"]`);
  if (btn) btn.classList.add('active');
  editor.setTool(tool);
}

// ========== ACTIONS ==========

function handleAction(action) {
  switch (action) {
    case 'new':
      if (confirm('Start a new project? Current work will be lost.')) {
        editor.saveState();
        editor.components = [];
        editor.wires = [];
        editor.selected = null;
        editor.draw();
        engine.reset();
        updateCounts();
        consolePrint('New project created.', 'info');
      }
      break;

    case 'save':
      saveProject();
      break;

    case 'open':
      loadProject();
      break;

    case 'export':
      exportPNG();
      break;

    case 'demo-counter':
      editor.loadDemo('counter');
      consolePrint('Loaded demo: 4-bit Counter with 74HC161', 'info');
      break;

    case 'demo-486':
      editor.loadDemo('486');
      consolePrint('Loaded demo: i486 System Block Diagram', 'info');
      break;

    case 'delete':
      editor.deleteSelected();
      break;

    case 'undo':
      editor.undo();
      break;

    case 'redo':
      editor.redo();
      break;

    case 'zoom-in':
      editor.zoom = Math.min(4, editor.zoom * 1.3);
      editor.updateZoomDisplay();
      editor.draw();
      break;

    case 'zoom-out':
      editor.zoom = Math.max(0.2, editor.zoom / 1.3);
      editor.updateZoomDisplay();
      editor.draw();
      break;

    case 'zoom-fit':
      editor.zoomToFit();
      break;

    case 'toggle-grid':
      editor.showGrid = !editor.showGrid;
      editor.draw();
      break;

    case 'toggle-labels':
      editor.showLabels = !editor.showLabels;
      editor.draw();
      break;

    case 'sim-start':
      engine.setCircuit(editor.components, editor.wires);
      engine.start();
      updateSimStatus('running');
      consolePrint('Simulation started.', 'sim');
      break;

    case 'sim-step':
      if (!engine.running) {
        engine.setCircuit(editor.components, editor.wires);
      }
      engine.step();
      updateSimStatus('paused');
      break;

    case 'sim-stop':
      engine.stop();
      updateSimStatus('off');
      consolePrint('Simulation stopped at cycle ' + engine.cycle, 'sim');
      break;

    case 'sim-reset':
      engine.stop();
      engine.reset();
      updateSimStatus('off');
      editor.draw();
      waveform.draw();
      consolePrint('Simulation reset.', 'sim');
      break;

    case 'sim-speed-slow':
      engine.setSpeed(500);
      consolePrint('Sim speed: Slow (500ms/cycle)', 'sim');
      break;

    case 'sim-speed-normal':
      engine.setSpeed(100);
      consolePrint('Sim speed: Normal (100ms/cycle)', 'sim');
      break;

    case 'sim-speed-fast':
      engine.setSpeed(20);
      consolePrint('Sim speed: Fast (20ms/cycle)', 'sim');
      break;

    case 'win-library':
      document.getElementById('library-panel').style.display =
        document.getElementById('library-panel').style.display === 'none' ? 'flex' : 'none';
      editor.resize();
      break;

    case 'win-properties':
      document.getElementById('right-panel').style.display =
        document.getElementById('right-panel').style.display === 'none' ? 'flex' : 'none';
      editor.resize();
      break;

    case 'win-waveform':
    case 'win-console':
      document.getElementById('bottom-panel').style.display =
        document.getElementById('bottom-panel').style.display === 'none' ? 'flex' : 'none';
      editor.resize();
      waveform.resize();
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

function updateProperties(comp) {
  const content = document.getElementById('properties-content');

  if (!comp) {
    content.innerHTML = '<p class="hint-text">Select a component to view properties</p>';
    return;
  }

  let html = '';

  html += '<div class="prop-group">';
  html += '<div class="prop-group-title">Component</div>';
  html += `<div class="prop-row"><span class="prop-label">Type:</span><span class="prop-value">${comp.def.name}</span></div>`;
  html += `<div class="prop-row"><span class="prop-label">ID:</span><span class="prop-value">${comp.id}</span></div>`;
  html += `<div class="prop-row"><span class="prop-label">Label:</span><span class="prop-value"><input class="prop-input" data-prop="label" value="${comp.label}"></span></div>`;
  html += `<div class="prop-row"><span class="prop-label">Position:</span><span class="prop-value">${comp.x}, ${comp.y}</span></div>`;
  html += `<div class="prop-row"><span class="prop-label">Rotation:</span><span class="prop-value">${comp.rotation}°</span></div>`;
  html += '</div>';

  if (comp.def.description) {
    html += '<div class="prop-group">';
    html += '<div class="prop-group-title">Description</div>';
    html += `<div class="prop-row" style="padding:4px"><span style="font-size:11px;color:#444">${comp.def.description}</span></div>`;
    html += '</div>';
  }

  if (Object.keys(comp.properties).length > 0) {
    html += '<div class="prop-group">';
    html += '<div class="prop-group-title">Settings</div>';
    for (const key in comp.properties) {
      html += `<div class="prop-row"><span class="prop-label">${key}:</span><span class="prop-value"><input class="prop-input" data-custom-prop="${key}" value="${comp.properties[key]}"></span></div>`;
    }
    html += '</div>';
  }

  html += '<div class="prop-group">';
  html += '<div class="prop-group-title">Pins</div>';
  for (const pin of comp.def.pins) {
    const state = comp.pinStates[pin.name];
    const stateStr = ['LOW', 'HIGH', 'Hi-Z', '???'][state] || '???';
    const color = ['#2244AA', '#DD2222', '#888888', '#FF8800'][state] || '#000';
    html += `<div class="prop-row"><span class="prop-label">${pin.name}:</span><span class="prop-value" style="color:${color}">${stateStr} (${pin.direction})</span></div>`;
  }
  html += '</div>';

  content.innerHTML = html;

  content.querySelectorAll('.prop-input[data-prop="label"]').forEach(input => {
    input.addEventListener('change', () => {
      editor.saveState();
      comp.label = input.value;
      editor.draw();
    });
  });

  content.querySelectorAll('.prop-input[data-custom-prop]').forEach(input => {
    input.addEventListener('change', () => {
      editor.saveState();
      comp.properties[input.dataset.customProp] = input.value;
    });
  });
}

// ========== SIM STATUS ==========

function updateSimStatus(state) {
  const el = document.getElementById('sim-status');
  el.className = 'status-indicator ' + state;
  el.textContent = state === 'running' ? 'SIM: RUN' : state === 'paused' ? 'SIM: PAUSE' : 'SIM: OFF';
}

// ========== STATUS BAR ==========

function setStatus(msg) {
  document.getElementById('status-msg').textContent = msg;
}

function updateCounts() {
  document.getElementById('status-components').textContent = 'Components: ' + editor.components.length;
  document.getElementById('status-wires').textContent = 'Wires: ' + editor.wires.length;
}

// ========== CONSOLE ==========

function consolePrint(msg, type = '') {
  const output = document.getElementById('console-output');
  const line = document.createElement('div');
  line.className = 'console-line' + (type ? ' ' + type : '');
  line.textContent = msg;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

// ========== SAVE / LOAD ==========

function saveProject() {
  const data = {
    version: 1,
    components: editor.components.map(c => ({
      defId: c.def.id, x: c.x, y: c.y, id: c.id,
      rotation: c.rotation, label: c.label,
      properties: c.properties
    })),
    wires: editor.wires.map(w => ({
      id: w.id, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2
    }))
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'retrosim-project.json';
  a.click();
  URL.revokeObjectURL(url);
  consolePrint('Project saved.', 'info');
}

function loadProject() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        editor.saveState();
        editor.components = data.components.map(c => {
          const def = COMPONENT_LIBRARY[c.defId];
          if (!def) return null;
          const inst = new ComponentInstance(def, c.x, c.y);
          inst.id = c.id;
          inst.rotation = c.rotation || 0;
          inst.label = c.label || def.name;
          inst.properties = c.properties || {};
          return inst;
        }).filter(Boolean);

        editor.wires = data.wires.map(w => {
          const wire = new Wire(w.x1, w.y1, w.x2, w.y2);
          wire.id = w.id;
          return wire;
        });

        editor.selected = null;
        editor.draw();
        editor.zoomToFit();
        updateCounts();
        consolePrint('Project loaded: ' + file.name, 'info');
      } catch (err) {
        consolePrint('Error loading project: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  });
  input.click();
}

function exportPNG() {
  const link = document.createElement('a');
  link.download = 'retrosim-schematic.png';
  link.href = editor.canvas.toDataURL();
  link.click();
  consolePrint('Schematic exported as PNG.', 'info');
}

// ========== BOARD MANAGER ==========

document.addEventListener('DOMContentLoaded', () => {
  const addBtn = document.getElementById('add-board-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const name = prompt('Board name:', 'New Board');
      if (!name) return;
      const list = document.querySelector('.board-list');
      const entry = document.createElement('div');
      entry.className = 'board-entry';
      entry.innerHTML = `<span class="board-icon">&#9638;</span> ${name}`;
      entry.addEventListener('click', () => {
        list.querySelectorAll('.board-entry').forEach(e => e.classList.remove('active'));
        entry.classList.add('active');
      });
      list.appendChild(entry);
      consolePrint('Board added: ' + name, 'info');
    });
  }
});

// ========== INIT ==========
window.addEventListener('load', init);
