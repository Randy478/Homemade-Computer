const SIGNAL = { LOW: 0, HIGH: 1, Z: 2, UNKNOWN: 3 };

class PinDef {
  constructor(name, direction, side, position, inverted = false) {
    this.name = name;
    this.direction = direction; // 'in', 'out', 'bidi'
    this.side = side; // 'left', 'right', 'top', 'bottom'
    this.position = position; // index along that side
    this.inverted = inverted;
  }
}

class ComponentDef {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.category = config.category;
    this.description = config.description || '';
    this.pins = config.pins || [];
    this.width = config.width || 60;
    this.height = config.height || 40;
    this.simulate = config.simulate || null;
    this.color = config.color || '#FFFFF0';
    this.labelColor = config.labelColor || '#000080';
    this.properties = config.properties || {};
  }
}

class ComponentInstance {
  constructor(def, x, y) {
    this.id = 'c_' + Math.random().toString(36).substr(2, 8);
    this.def = def;
    this.x = x;
    this.y = y;
    this.rotation = 0; // 0, 90, 180, 270
    this.selected = false;
    this.label = def.name;
    this.pinStates = {};
    this.internalState = {};
    this.properties = { ...def.properties };

    for (const pin of def.pins) {
      this.pinStates[pin.name] = pin.direction === 'out' ? SIGNAL.LOW : SIGNAL.Z;
    }
  }

  getPinPosition(pinName) {
    const pin = this.def.pins.find(p => p.name === pinName);
    if (!pin) return null;

    const w = this.def.width;
    const h = this.def.height;
    const spacing = 20;
    let px, py;

    switch (pin.side) {
      case 'left':
        px = this.x;
        py = this.y + 20 + pin.position * spacing;
        break;
      case 'right':
        px = this.x + w;
        py = this.y + 20 + pin.position * spacing;
        break;
      case 'top':
        px = this.x + 20 + pin.position * spacing;
        py = this.y;
        break;
      case 'bottom':
        px = this.x + 20 + pin.position * spacing;
        py = this.y + h;
        break;
    }

    if (this.rotation !== 0) {
      const cx = this.x + w / 2;
      const cy = this.y + h / 2;
      const rad = (this.rotation * Math.PI) / 180;
      const dx = px - cx;
      const dy = py - cy;
      px = cx + dx * Math.cos(rad) - dy * Math.sin(rad);
      py = cy + dx * Math.sin(rad) + dy * Math.cos(rad);
    }

    return { x: Math.round(px), y: Math.round(py), pin };
  }

  getBounds() {
    return {
      x: this.x,
      y: this.y,
      width: this.def.width,
      height: this.def.height
    };
  }
}

class Wire {
  constructor(x1, y1, x2, y2) {
    this.id = 'w_' + Math.random().toString(36).substr(2, 8);
    this.x1 = x1;
    this.y1 = y1;
    this.x2 = x2;
    this.y2 = y2;
    this.signal = SIGNAL.Z;
    this.selected = false;
    this.netId = null;
  }
}

class Net {
  constructor(name) {
    this.id = 'n_' + Math.random().toString(36).substr(2, 8);
    this.name = name || this.id;
    this.wires = [];
    this.pins = []; // { component, pinName }
    this.signal = SIGNAL.Z;
    this.probed = false;
  }
}

// ========== COMPONENT LIBRARY ==========

const COMPONENT_LIBRARY = {};

function registerComponent(def) {
  COMPONENT_LIBRARY[def.id] = new ComponentDef(def);
}

// -- Sources & Inputs --

registerComponent({
  id: 'vcc',
  name: 'VCC',
  category: 'Sources',
  description: 'Power supply (+5V / Logic HIGH)',
  width: 40,
  height: 30,
  pins: [new PinDef('OUT', 'out', 'bottom', 0)],
  color: '#FFE0E0',
  simulate: function(inst) {
    inst.pinStates['OUT'] = SIGNAL.HIGH;
  }
});

registerComponent({
  id: 'gnd',
  name: 'GND',
  category: 'Sources',
  description: 'Ground (Logic LOW)',
  width: 40,
  height: 30,
  pins: [new PinDef('IN', 'in', 'top', 0)],
  color: '#E0E0FF',
  simulate: function(inst) {
    inst.pinStates['IN'] = SIGNAL.LOW;
  }
});

registerComponent({
  id: 'clock',
  name: 'CLK',
  category: 'Sources',
  description: 'Clock generator — toggles every cycle',
  width: 60,
  height: 40,
  pins: [new PinDef('OUT', 'out', 'right', 0)],
  color: '#E0FFE0',
  properties: { frequency: '1', dutyCycle: '50' },
  simulate: function(inst, cycle) {
    const freq = parseInt(inst.properties.frequency) || 1;
    const period = Math.max(1, Math.round(1 / freq));
    const duty = (parseInt(inst.properties.dutyCycle) || 50) / 100;
    const pos = cycle % period;
    inst.pinStates['OUT'] = pos < period * duty ? SIGNAL.HIGH : SIGNAL.LOW;
  }
});

registerComponent({
  id: 'switch',
  name: 'Switch',
  category: 'Sources',
  description: 'Manual toggle switch — click to toggle',
  width: 50,
  height: 40,
  pins: [new PinDef('OUT', 'out', 'right', 0)],
  color: '#FFFFD0',
  properties: { state: '0' },
  simulate: function(inst) {
    inst.pinStates['OUT'] = inst.properties.state === '1' ? SIGNAL.HIGH : SIGNAL.LOW;
  }
});

registerComponent({
  id: 'button',
  name: 'Button',
  category: 'Sources',
  description: 'Momentary push button',
  width: 50,
  height: 40,
  pins: [new PinDef('OUT', 'out', 'right', 0)],
  color: '#FFE8D0',
  properties: { pressed: '0' },
  simulate: function(inst) {
    inst.pinStates['OUT'] = inst.properties.pressed === '1' ? SIGNAL.HIGH : SIGNAL.LOW;
  }
});

// -- Indicators --

registerComponent({
  id: 'led',
  name: 'LED',
  category: 'Indicators',
  description: 'Light emitting diode — glows when input is HIGH',
  width: 40,
  height: 40,
  pins: [new PinDef('IN', 'in', 'left', 0)],
  color: '#FFF0F0',
  simulate: function(inst) {
    inst.internalState.lit = inst.pinStates['IN'] === SIGNAL.HIGH;
  }
});

registerComponent({
  id: 'probe_point',
  name: 'Probe',
  category: 'Indicators',
  description: 'Signal probe — shows state in waveform viewer',
  width: 30,
  height: 30,
  pins: [new PinDef('IN', 'in', 'left', 0)],
  color: '#F0F0FF',
  simulate: function(inst) {}
});

registerComponent({
  id: 'hex_display',
  name: '7-Seg Hex',
  category: 'Indicators',
  description: '7-segment hex display — 4-bit input',
  width: 60,
  height: 80,
  pins: [
    new PinDef('D0', 'in', 'left', 0),
    new PinDef('D1', 'in', 'left', 1),
    new PinDef('D2', 'in', 'left', 2),
    new PinDef('D3', 'in', 'left', 3),
  ],
  color: '#2A2A2A',
  labelColor: '#FF3333',
  simulate: function(inst) {
    let val = 0;
    if (inst.pinStates['D0'] === SIGNAL.HIGH) val |= 1;
    if (inst.pinStates['D1'] === SIGNAL.HIGH) val |= 2;
    if (inst.pinStates['D2'] === SIGNAL.HIGH) val |= 4;
    if (inst.pinStates['D3'] === SIGNAL.HIGH) val |= 8;
    inst.internalState.value = val;
    inst.internalState.hexChar = val.toString(16).toUpperCase();
  }
});

// -- Basic Gates --

function makeGate(id, name, desc, fn, pinCount = 2) {
  const pins = [];
  for (let i = 0; i < pinCount; i++) {
    pins.push(new PinDef(`IN${i}`, 'in', 'left', i));
  }
  pins.push(new PinDef('OUT', 'out', 'right', Math.floor(pinCount / 2)));

  registerComponent({
    id, name, category: 'Basic Gates',
    description: desc,
    width: 60,
    height: Math.max(40, 20 + pinCount * 20),
    pins,
    color: '#F0FFF0',
    simulate: fn
  });
}

makeGate('and2', 'AND', '2-input AND gate', function(inst) {
  const a = inst.pinStates['IN0'] === SIGNAL.HIGH;
  const b = inst.pinStates['IN1'] === SIGNAL.HIGH;
  inst.pinStates['OUT'] = (a && b) ? SIGNAL.HIGH : SIGNAL.LOW;
});

makeGate('or2', 'OR', '2-input OR gate', function(inst) {
  const a = inst.pinStates['IN0'] === SIGNAL.HIGH;
  const b = inst.pinStates['IN1'] === SIGNAL.HIGH;
  inst.pinStates['OUT'] = (a || b) ? SIGNAL.HIGH : SIGNAL.LOW;
});

makeGate('nand2', 'NAND', '2-input NAND gate', function(inst) {
  const a = inst.pinStates['IN0'] === SIGNAL.HIGH;
  const b = inst.pinStates['IN1'] === SIGNAL.HIGH;
  inst.pinStates['OUT'] = !(a && b) ? SIGNAL.HIGH : SIGNAL.LOW;
});

makeGate('nor2', 'NOR', '2-input NOR gate', function(inst) {
  const a = inst.pinStates['IN0'] === SIGNAL.HIGH;
  const b = inst.pinStates['IN1'] === SIGNAL.HIGH;
  inst.pinStates['OUT'] = !(a || b) ? SIGNAL.HIGH : SIGNAL.LOW;
});

makeGate('xor2', 'XOR', '2-input XOR gate', function(inst) {
  const a = inst.pinStates['IN0'] === SIGNAL.HIGH;
  const b = inst.pinStates['IN1'] === SIGNAL.HIGH;
  inst.pinStates['OUT'] = (a !== b) ? SIGNAL.HIGH : SIGNAL.LOW;
});

registerComponent({
  id: 'not',
  name: 'NOT',
  category: 'Basic Gates',
  description: 'Inverter',
  width: 50,
  height: 40,
  pins: [
    new PinDef('IN', 'in', 'left', 0),
    new PinDef('OUT', 'out', 'right', 0, true)
  ],
  color: '#F0FFF0',
  simulate: function(inst) {
    inst.pinStates['OUT'] = inst.pinStates['IN'] === SIGNAL.HIGH ? SIGNAL.LOW : SIGNAL.HIGH;
  }
});

registerComponent({
  id: 'buffer',
  name: 'BUF',
  category: 'Basic Gates',
  description: 'Buffer / driver',
  width: 50,
  height: 40,
  pins: [
    new PinDef('IN', 'in', 'left', 0),
    new PinDef('OUT', 'out', 'right', 0)
  ],
  color: '#F0FFF0',
  simulate: function(inst) {
    inst.pinStates['OUT'] = inst.pinStates['IN'];
  }
});

registerComponent({
  id: 'tribuf',
  name: 'Tri-Buf',
  category: 'Basic Gates',
  description: 'Tri-state buffer — /OE enables output',
  width: 60,
  height: 50,
  pins: [
    new PinDef('IN', 'in', 'left', 0),
    new PinDef('/OE', 'in', 'top', 0, true),
    new PinDef('OUT', 'out', 'right', 0)
  ],
  color: '#F0FFF0',
  simulate: function(inst) {
    if (inst.pinStates['/OE'] === SIGNAL.LOW) {
      inst.pinStates['OUT'] = inst.pinStates['IN'];
    } else {
      inst.pinStates['OUT'] = SIGNAL.Z;
    }
  }
});

// -- Flip-Flops --

registerComponent({
  id: 'dff',
  name: 'D Flip-Flop',
  category: 'Flip-Flops',
  description: 'D flip-flop — captures D on rising edge of CLK',
  width: 60,
  height: 60,
  pins: [
    new PinDef('D', 'in', 'left', 0),
    new PinDef('CLK', 'in', 'left', 1),
    new PinDef('Q', 'out', 'right', 0),
    new PinDef('/Q', 'out', 'right', 1, true)
  ],
  color: '#FFF0FF',
  simulate: function(inst) {
    const clk = inst.pinStates['CLK'];
    const prevClk = inst.internalState.prevClk || SIGNAL.LOW;

    if (prevClk === SIGNAL.LOW && clk === SIGNAL.HIGH) {
      inst.internalState.q = inst.pinStates['D'] === SIGNAL.HIGH ? 1 : 0;
    }

    inst.internalState.prevClk = clk;
    inst.pinStates['Q'] = inst.internalState.q ? SIGNAL.HIGH : SIGNAL.LOW;
    inst.pinStates['/Q'] = inst.internalState.q ? SIGNAL.LOW : SIGNAL.HIGH;
  }
});

registerComponent({
  id: 'sr_latch',
  name: 'SR Latch',
  category: 'Flip-Flops',
  description: 'Set-Reset latch',
  width: 60,
  height: 60,
  pins: [
    new PinDef('S', 'in', 'left', 0),
    new PinDef('R', 'in', 'left', 1),
    new PinDef('Q', 'out', 'right', 0),
    new PinDef('/Q', 'out', 'right', 1, true)
  ],
  color: '#FFF0FF',
  simulate: function(inst) {
    const s = inst.pinStates['S'] === SIGNAL.HIGH;
    const r = inst.pinStates['R'] === SIGNAL.HIGH;

    if (s && !r) inst.internalState.q = 1;
    else if (!s && r) inst.internalState.q = 0;

    inst.pinStates['Q'] = inst.internalState.q ? SIGNAL.HIGH : SIGNAL.LOW;
    inst.pinStates['/Q'] = inst.internalState.q ? SIGNAL.LOW : SIGNAL.HIGH;
  }
});

registerComponent({
  id: 'jk_ff',
  name: 'JK Flip-Flop',
  category: 'Flip-Flops',
  description: 'JK flip-flop with toggle',
  width: 60,
  height: 70,
  pins: [
    new PinDef('J', 'in', 'left', 0),
    new PinDef('CLK', 'in', 'left', 1),
    new PinDef('K', 'in', 'left', 2),
    new PinDef('Q', 'out', 'right', 0),
    new PinDef('/Q', 'out', 'right', 2, true)
  ],
  color: '#FFF0FF',
  simulate: function(inst) {
    const clk = inst.pinStates['CLK'];
    const prevClk = inst.internalState.prevClk || SIGNAL.LOW;

    if (prevClk === SIGNAL.LOW && clk === SIGNAL.HIGH) {
      const j = inst.pinStates['J'] === SIGNAL.HIGH;
      const k = inst.pinStates['K'] === SIGNAL.HIGH;
      if (j && k) inst.internalState.q = inst.internalState.q ? 0 : 1;
      else if (j) inst.internalState.q = 1;
      else if (k) inst.internalState.q = 0;
    }

    inst.internalState.prevClk = clk;
    inst.pinStates['Q'] = inst.internalState.q ? SIGNAL.HIGH : SIGNAL.LOW;
    inst.pinStates['/Q'] = inst.internalState.q ? SIGNAL.LOW : SIGNAL.HIGH;
  }
});

// -- 74HC Series --

registerComponent({
  id: '74hc00',
  name: '74HC00',
  category: '74HC Series',
  description: 'Quad 2-input NAND gate',
  width: 80,
  height: 120,
  pins: [
    new PinDef('1A', 'in', 'left', 0),
    new PinDef('1B', 'in', 'left', 1),
    new PinDef('2A', 'in', 'left', 2),
    new PinDef('2B', 'in', 'left', 3),
    new PinDef('1Y', 'out', 'right', 0),
    new PinDef('2Y', 'out', 'right', 1),
    new PinDef('3Y', 'out', 'right', 2),
    new PinDef('3A', 'in', 'left', 4),
    new PinDef('3B', 'in', 'left', 5),
  ],
  color: '#FFFFF0',
  simulate: function(inst) {
    const h = SIGNAL.HIGH, l = SIGNAL.LOW;
    inst.pinStates['1Y'] = !(inst.pinStates['1A'] === h && inst.pinStates['1B'] === h) ? h : l;
    inst.pinStates['2Y'] = !(inst.pinStates['2A'] === h && inst.pinStates['2B'] === h) ? h : l;
    inst.pinStates['3Y'] = !(inst.pinStates['3A'] === h && inst.pinStates['3B'] === h) ? h : l;
  }
});

registerComponent({
  id: '74hc14',
  name: '74HC14',
  category: '74HC Series',
  description: 'Hex Schmitt-trigger inverter',
  width: 80,
  height: 140,
  pins: [
    new PinDef('1A', 'in', 'left', 0),
    new PinDef('2A', 'in', 'left', 1),
    new PinDef('3A', 'in', 'left', 2),
    new PinDef('4A', 'in', 'left', 3),
    new PinDef('5A', 'in', 'left', 4),
    new PinDef('6A', 'in', 'left', 5),
    new PinDef('1Y', 'out', 'right', 0),
    new PinDef('2Y', 'out', 'right', 1),
    new PinDef('3Y', 'out', 'right', 2),
    new PinDef('4Y', 'out', 'right', 3),
    new PinDef('5Y', 'out', 'right', 4),
    new PinDef('6Y', 'out', 'right', 5),
  ],
  color: '#FFFFF0',
  simulate: function(inst) {
    for (let i = 1; i <= 6; i++) {
      inst.pinStates[i + 'Y'] = inst.pinStates[i + 'A'] === SIGNAL.HIGH ? SIGNAL.LOW : SIGNAL.HIGH;
    }
  }
});

registerComponent({
  id: '74hc138',
  name: '74HC138',
  category: '74HC Series',
  description: '3-to-8 line decoder/demux — active-low outputs',
  width: 80,
  height: 140,
  pins: [
    new PinDef('A', 'in', 'left', 0),
    new PinDef('B', 'in', 'left', 1),
    new PinDef('C', 'in', 'left', 2),
    new PinDef('/E1', 'in', 'left', 3, true),
    new PinDef('/E2', 'in', 'left', 4, true),
    new PinDef('E3', 'in', 'left', 5),
    new PinDef('/Y0', 'out', 'right', 0, true),
    new PinDef('/Y1', 'out', 'right', 1, true),
    new PinDef('/Y2', 'out', 'right', 2, true),
    new PinDef('/Y3', 'out', 'right', 3, true),
    new PinDef('/Y4', 'out', 'right', 4, true),
    new PinDef('/Y5', 'out', 'right', 5, true),
    new PinDef('/Y6', 'out', 'right', 6, true),
    new PinDef('/Y7', 'out', 'right', 7, true),
  ],
  color: '#FFFFF0',
  simulate: function(inst) {
    const e1 = inst.pinStates['/E1'] === SIGNAL.LOW;
    const e2 = inst.pinStates['/E2'] === SIGNAL.LOW;
    const e3 = inst.pinStates['E3'] === SIGNAL.HIGH;
    const enabled = e1 && e2 && e3;

    for (let i = 0; i < 8; i++) {
      inst.pinStates['/Y' + i] = SIGNAL.HIGH;
    }

    if (enabled) {
      let addr = 0;
      if (inst.pinStates['A'] === SIGNAL.HIGH) addr |= 1;
      if (inst.pinStates['B'] === SIGNAL.HIGH) addr |= 2;
      if (inst.pinStates['C'] === SIGNAL.HIGH) addr |= 4;
      inst.pinStates['/Y' + addr] = SIGNAL.LOW;
    }
  }
});

registerComponent({
  id: '74hc245',
  name: '74HC245',
  category: '74HC Series',
  description: 'Octal bus transceiver — DIR selects direction, /OE enables',
  width: 80,
  height: 120,
  pins: [
    new PinDef('A0', 'bidi', 'left', 0),
    new PinDef('A1', 'bidi', 'left', 1),
    new PinDef('A2', 'bidi', 'left', 2),
    new PinDef('A3', 'bidi', 'left', 3),
    new PinDef('DIR', 'in', 'top', 0),
    new PinDef('/OE', 'in', 'top', 1, true),
    new PinDef('B0', 'bidi', 'right', 0),
    new PinDef('B1', 'bidi', 'right', 1),
    new PinDef('B2', 'bidi', 'right', 2),
    new PinDef('B3', 'bidi', 'right', 3),
  ],
  color: '#FFFFF0',
  simulate: function(inst) {
    if (inst.pinStates['/OE'] !== SIGNAL.LOW) {
      for (let i = 0; i < 4; i++) {
        inst.pinStates['A' + i] = SIGNAL.Z;
        inst.pinStates['B' + i] = SIGNAL.Z;
      }
      return;
    }
    const aToB = inst.pinStates['DIR'] === SIGNAL.HIGH;
    for (let i = 0; i < 4; i++) {
      if (aToB) {
        inst.pinStates['B' + i] = inst.pinStates['A' + i];
      } else {
        inst.pinStates['A' + i] = inst.pinStates['B' + i];
      }
    }
  }
});

registerComponent({
  id: '74hc161',
  name: '74HC161',
  category: '74HC Series',
  description: '4-bit synchronous binary counter with sync reset',
  width: 80,
  height: 120,
  pins: [
    new PinDef('CLK', 'in', 'left', 0),
    new PinDef('/CLR', 'in', 'left', 1, true),
    new PinDef('ENT', 'in', 'left', 2),
    new PinDef('ENP', 'in', 'left', 3),
    new PinDef('/LOAD', 'in', 'left', 4, true),
    new PinDef('QA', 'out', 'right', 0),
    new PinDef('QB', 'out', 'right', 1),
    new PinDef('QC', 'out', 'right', 2),
    new PinDef('QD', 'out', 'right', 3),
    new PinDef('RCO', 'out', 'right', 4),
  ],
  color: '#FFFFF0',
  simulate: function(inst) {
    const clk = inst.pinStates['CLK'];
    const prevClk = inst.internalState.prevClk || SIGNAL.LOW;
    let count = inst.internalState.count || 0;

    if (inst.pinStates['/CLR'] === SIGNAL.LOW) {
      count = 0;
    } else if (prevClk === SIGNAL.LOW && clk === SIGNAL.HIGH) {
      if (inst.pinStates['/LOAD'] === SIGNAL.LOW) {
        count = 0;
        if (inst.pinStates['QA'] === SIGNAL.HIGH) count |= 1;
        if (inst.pinStates['QB'] === SIGNAL.HIGH) count |= 2;
        if (inst.pinStates['QC'] === SIGNAL.HIGH) count |= 4;
        if (inst.pinStates['QD'] === SIGNAL.HIGH) count |= 8;
      } else if (inst.pinStates['ENT'] === SIGNAL.HIGH && inst.pinStates['ENP'] === SIGNAL.HIGH) {
        count = (count + 1) & 0xF;
      }
    }

    inst.internalState.prevClk = clk;
    inst.internalState.count = count;

    inst.pinStates['QA'] = (count & 1) ? SIGNAL.HIGH : SIGNAL.LOW;
    inst.pinStates['QB'] = (count & 2) ? SIGNAL.HIGH : SIGNAL.LOW;
    inst.pinStates['QC'] = (count & 4) ? SIGNAL.HIGH : SIGNAL.LOW;
    inst.pinStates['QD'] = (count & 8) ? SIGNAL.HIGH : SIGNAL.LOW;
    inst.pinStates['RCO'] = (count === 15 && inst.pinStates['ENT'] === SIGNAL.HIGH) ? SIGNAL.HIGH : SIGNAL.LOW;
  }
});

registerComponent({
  id: '74hc574',
  name: '74HC574',
  category: '74HC Series',
  description: 'Octal D flip-flop — captures on rising CLK edge',
  width: 80,
  height: 120,
  pins: [
    new PinDef('D0', 'in', 'left', 0),
    new PinDef('D1', 'in', 'left', 1),
    new PinDef('D2', 'in', 'left', 2),
    new PinDef('D3', 'in', 'left', 3),
    new PinDef('CLK', 'in', 'bottom', 0),
    new PinDef('/OE', 'in', 'bottom', 1, true),
    new PinDef('Q0', 'out', 'right', 0),
    new PinDef('Q1', 'out', 'right', 1),
    new PinDef('Q2', 'out', 'right', 2),
    new PinDef('Q3', 'out', 'right', 3),
  ],
  color: '#FFFFF0',
  simulate: function(inst) {
    const clk = inst.pinStates['CLK'];
    const prevClk = inst.internalState.prevClk || SIGNAL.LOW;

    if (prevClk === SIGNAL.LOW && clk === SIGNAL.HIGH) {
      for (let i = 0; i < 4; i++) {
        inst.internalState['d' + i] = inst.pinStates['D' + i];
      }
    }
    inst.internalState.prevClk = clk;

    if (inst.pinStates['/OE'] === SIGNAL.LOW) {
      for (let i = 0; i < 4; i++) {
        inst.pinStates['Q' + i] = inst.internalState['d' + i] || SIGNAL.LOW;
      }
    } else {
      for (let i = 0; i < 4; i++) {
        inst.pinStates['Q' + i] = SIGNAL.Z;
      }
    }
  }
});

// -- System Components (simplified models) --

registerComponent({
  id: 'sram_32k',
  name: '62256 SRAM',
  category: 'Memory',
  description: '32KB Static RAM (simplified 8-bit model)',
  width: 80,
  height: 120,
  pins: [
    new PinDef('A0', 'in', 'left', 0),
    new PinDef('A1', 'in', 'left', 1),
    new PinDef('A2', 'in', 'left', 2),
    new PinDef('A3', 'in', 'left', 3),
    new PinDef('/CS', 'in', 'left', 4, true),
    new PinDef('/WE', 'in', 'top', 0, true),
    new PinDef('/OE', 'in', 'top', 1, true),
    new PinDef('D0', 'bidi', 'right', 0),
    new PinDef('D1', 'bidi', 'right', 1),
    new PinDef('D2', 'bidi', 'right', 2),
    new PinDef('D3', 'bidi', 'right', 3),
  ],
  color: '#E8E8FF',
  simulate: function(inst) {
    if (!inst.internalState.mem) inst.internalState.mem = new Uint8Array(16);

    if (inst.pinStates['/CS'] !== SIGNAL.LOW) {
      for (let i = 0; i < 4; i++) inst.pinStates['D' + i] = SIGNAL.Z;
      return;
    }

    let addr = 0;
    for (let i = 0; i < 4; i++) {
      if (inst.pinStates['A' + i] === SIGNAL.HIGH) addr |= (1 << i);
    }

    if (inst.pinStates['/WE'] === SIGNAL.LOW) {
      let data = 0;
      for (let i = 0; i < 4; i++) {
        if (inst.pinStates['D' + i] === SIGNAL.HIGH) data |= (1 << i);
      }
      inst.internalState.mem[addr] = data;
    } else if (inst.pinStates['/OE'] === SIGNAL.LOW) {
      const data = inst.internalState.mem[addr] || 0;
      for (let i = 0; i < 4; i++) {
        inst.pinStates['D' + i] = (data & (1 << i)) ? SIGNAL.HIGH : SIGNAL.LOW;
      }
    } else {
      for (let i = 0; i < 4; i++) inst.pinStates['D' + i] = SIGNAL.Z;
    }
  }
});

registerComponent({
  id: 'eeprom_64k',
  name: '28C512',
  category: 'Memory',
  description: '64KB EEPROM (simplified 4-bit address, 4-bit data model)',
  width: 80,
  height: 120,
  pins: [
    new PinDef('A0', 'in', 'left', 0),
    new PinDef('A1', 'in', 'left', 1),
    new PinDef('A2', 'in', 'left', 2),
    new PinDef('A3', 'in', 'left', 3),
    new PinDef('/CS', 'in', 'left', 4, true),
    new PinDef('/OE', 'in', 'top', 0, true),
    new PinDef('D0', 'bidi', 'right', 0),
    new PinDef('D1', 'bidi', 'right', 1),
    new PinDef('D2', 'bidi', 'right', 2),
    new PinDef('D3', 'bidi', 'right', 3),
  ],
  color: '#FFE8E8',
  simulate: function(inst) {
    if (!inst.internalState.mem) {
      inst.internalState.mem = new Uint8Array(16);
      for (let i = 0; i < 16; i++) inst.internalState.mem[i] = 0xFF;
    }

    if (inst.pinStates['/CS'] !== SIGNAL.LOW) {
      for (let i = 0; i < 4; i++) inst.pinStates['D' + i] = SIGNAL.Z;
      return;
    }

    let addr = 0;
    for (let i = 0; i < 4; i++) {
      if (inst.pinStates['A' + i] === SIGNAL.HIGH) addr |= (1 << i);
    }

    if (inst.pinStates['/OE'] === SIGNAL.LOW) {
      const data = inst.internalState.mem[addr];
      for (let i = 0; i < 4; i++) {
        inst.pinStates['D' + i] = (data & (1 << i)) ? SIGNAL.HIGH : SIGNAL.LOW;
      }
    } else {
      for (let i = 0; i < 4; i++) inst.pinStates['D' + i] = SIGNAL.Z;
    }
  }
});

// -- Connectors --

registerComponent({
  id: 'header_8pin',
  name: '8-Pin Header',
  category: 'Connectors',
  description: 'Generic 8-pin header for inter-board connections',
  width: 40,
  height: 100,
  pins: [
    new PinDef('P0', 'bidi', 'left', 0),
    new PinDef('P1', 'bidi', 'left', 1),
    new PinDef('P2', 'bidi', 'left', 2),
    new PinDef('P3', 'bidi', 'left', 3),
    new PinDef('P4', 'bidi', 'right', 0),
    new PinDef('P5', 'bidi', 'right', 1),
    new PinDef('P6', 'bidi', 'right', 2),
    new PinDef('P7', 'bidi', 'right', 3),
  ],
  color: '#D4D4D4',
  simulate: function(inst) {
    for (let i = 0; i < 4; i++) {
      inst.pinStates['P' + (i + 4)] = inst.pinStates['P' + i];
    }
  }
});

function getLibraryCategories() {
  const cats = {};
  for (const id in COMPONENT_LIBRARY) {
    const comp = COMPONENT_LIBRARY[id];
    if (!cats[comp.category]) cats[comp.category] = [];
    cats[comp.category].push(comp);
  }
  return cats;
}
