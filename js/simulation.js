class SimulationEngine {
  constructor() {
    this.components = [];
    this.wires = [];
    this.nets = [];
    this.cycle = 0;
    this.running = false;
    this.speed = 100; // ms between cycles
    this.timer = null;
    this.onCycle = null;
    this.onStateChange = null;
    this.history = [];
    this.maxHistory = 2000;
  }

  setCircuit(components, wires) {
    this.components = components;
    this.wires = wires;
    this.buildNets();
  }

  buildNets() {
    this.nets = [];
    const visited = new Set();

    const findConnectedPins = (startX, startY) => {
      const net = new Net();
      const stack = [{ x: startX, y: startY }];
      const pointsInNet = new Set();

      while (stack.length > 0) {
        const { x, y } = stack.pop();
        const key = `${x},${y}`;
        if (pointsInNet.has(key)) continue;
        pointsInNet.add(key);

        for (const w of this.wires) {
          if (w.x1 === x && w.y1 === y) {
            if (!net.wires.includes(w)) net.wires.push(w);
            stack.push({ x: w.x2, y: w.y2 });
          }
          if (w.x2 === x && w.y2 === y) {
            if (!net.wires.includes(w)) net.wires.push(w);
            stack.push({ x: w.x1, y: w.y1 });
          }
        }

        for (const comp of this.components) {
          for (const pinDef of comp.def.pins) {
            const pos = comp.getPinPosition(pinDef.name);
            if (pos && Math.abs(pos.x - x) < 5 && Math.abs(pos.y - y) < 5) {
              net.pins.push({ component: comp, pinName: pinDef.name, pinDef });
            }
          }
        }
      }

      return net;
    };

    const allPoints = new Set();
    for (const w of this.wires) {
      allPoints.add(`${w.x1},${w.y1}`);
      allPoints.add(`${w.x2},${w.y2}`);
    }

    for (const comp of this.components) {
      for (const pinDef of comp.def.pins) {
        const pos = comp.getPinPosition(pinDef.name);
        if (pos) allPoints.add(`${pos.x},${pos.y}`);
      }
    }

    for (const key of allPoints) {
      if (visited.has(key)) continue;
      const [x, y] = key.split(',').map(Number);
      const net = findConnectedPins(x, y);

      if (net.pins.length > 0 || net.wires.length > 0) {
        const netVisitedPoints = new Set();
        const stack = [{ x, y }];
        while (stack.length > 0) {
          const pt = stack.pop();
          const k = `${pt.x},${pt.y}`;
          if (netVisitedPoints.has(k)) continue;
          netVisitedPoints.add(k);
          visited.add(k);
          for (const w of net.wires) {
            if (w.x1 === pt.x && w.y1 === pt.y) stack.push({ x: w.x2, y: w.y2 });
            if (w.x2 === pt.x && w.y2 === pt.y) stack.push({ x: w.x1, y: w.y1 });
          }
        }
        this.nets.push(net);
      }
    }
  }

  reset() {
    this.cycle = 0;
    this.history = [];
    for (const comp of this.components) {
      comp.internalState = {};
      for (const pinDef of comp.def.pins) {
        comp.pinStates[pinDef.name] = pinDef.direction === 'out' ? SIGNAL.LOW : SIGNAL.Z;
      }
    }
    if (this.onStateChange) this.onStateChange();
  }

  step() {
    for (const comp of this.components) {
      if (comp.def.simulate) {
        comp.def.simulate(comp, this.cycle);
      }
    }

    this.propagateNets();
    this.recordHistory();
    this.cycle++;

    if (this.onCycle) this.onCycle(this.cycle);
    if (this.onStateChange) this.onStateChange();
  }

  propagateNets() {
    for (let pass = 0; pass < 3; pass++) {
      for (const net of this.nets) {
        let driven = SIGNAL.Z;
        let driverCount = 0;

        for (const { component, pinName, pinDef } of net.pins) {
          if (pinDef.direction === 'out' || pinDef.direction === 'bidi') {
            const val = component.pinStates[pinName];
            if (val !== SIGNAL.Z) {
              driven = val;
              driverCount++;
            }
          }
        }

        if (driverCount > 1) {
          driven = SIGNAL.UNKNOWN;
        }

        net.signal = driven;

        for (const wire of net.wires) {
          wire.signal = driven;
        }

        for (const { component, pinName, pinDef } of net.pins) {
          if (pinDef.direction === 'in') {
            component.pinStates[pinName] = driven;
          } else if (pinDef.direction === 'bidi') {
            const current = component.pinStates[pinName];
            if (current === SIGNAL.Z) {
              component.pinStates[pinName] = driven;
            }
          }
        }
      }

      for (const comp of this.components) {
        if (comp.def.simulate) {
          comp.def.simulate(comp, this.cycle);
        }
      }
    }
  }

  recordHistory() {
    const snapshot = {};
    for (const net of this.nets) {
      if (net.probed || net.name !== net.id) {
        snapshot[net.name || net.id] = net.signal;
      }
    }
    for (const comp of this.components) {
      if (comp.def.id === 'probe_point' || comp.def.id === 'led') {
        const pinName = comp.def.pins[0].name;
        snapshot[comp.label || comp.id] = comp.pinStates[pinName];
      }
    }
    this.history.push({ cycle: this.cycle, signals: snapshot });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.buildNets();
    this.tick();
  }

  tick() {
    if (!this.running) return;
    this.step();
    this.timer = setTimeout(() => this.tick(), this.speed);
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  setSpeed(speed) {
    this.speed = speed;
  }

  getSignalHistory(signalName) {
    return this.history.map(h => ({
      cycle: h.cycle,
      value: h.signals[signalName] !== undefined ? h.signals[signalName] : SIGNAL.Z
    }));
  }

  getTrackedSignals() {
    const signals = new Set();
    for (const h of this.history) {
      for (const key in h.signals) {
        signals.add(key);
      }
    }
    return Array.from(signals);
  }
}
