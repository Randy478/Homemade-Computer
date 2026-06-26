class WaveformViewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.signals = [];
    this.zoom = 1;
    this.scrollX = 0;
    this.rowHeight = 28;
    this.labelWidth = 100;
    this.engine = null;
    this.cursorCycle = -1;

    this.colors = [
      '#00FF00', '#00CCFF', '#FFAA00', '#FF4488',
      '#AAFFAA', '#88DDFF', '#FFDD66', '#FF88AA',
      '#66FF66', '#44BBFF', '#FFCC00', '#FF6688',
    ];

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const container = this.canvas.parentElement;
    if (!container) return;
    this.canvas.width = container.clientWidth;
    this.canvas.height = container.clientHeight;
    this.draw();
  }

  setEngine(engine) {
    this.engine = engine;
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.fillStyle = '#1A1A2E';
    ctx.fillRect(0, 0, w, h);

    if (!this.engine) return;

    const signals = this.engine.getTrackedSignals();
    if (signals.length === 0) {
      ctx.fillStyle = '#445566';
      ctx.font = '14px "VT323", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Add probes or LEDs to see waveforms', w / 2, h / 2);
      return;
    }

    const stepWidth = 8 * this.zoom;
    const history = this.engine.history;
    const visibleCycles = Math.ceil((w - this.labelWidth) / stepWidth);

    // Auto-scroll to follow latest
    if (history.length > 0) {
      const maxScroll = Math.max(0, history.length - visibleCycles + 10);
      if (this.scrollX > maxScroll) this.scrollX = maxScroll;
      if (history.length > visibleCycles && this.scrollX < history.length - visibleCycles) {
        this.scrollX = history.length - visibleCycles;
      }
    }

    // Draw signal labels
    ctx.fillStyle = '#0D0D1A';
    ctx.fillRect(0, 0, this.labelWidth, h);
    ctx.strokeStyle = '#333355';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.labelWidth, 0);
    ctx.lineTo(this.labelWidth, h);
    ctx.stroke();

    signals.forEach((name, i) => {
      const y = i * this.rowHeight;
      const color = this.colors[i % this.colors.length];

      // Label
      ctx.fillStyle = color;
      ctx.font = '14px "VT323", monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(name.substring(0, 12), this.labelWidth - 8, y + this.rowHeight / 2);

      // Row separator
      ctx.strokeStyle = '#222244';
      ctx.beginPath();
      ctx.moveTo(this.labelWidth, y + this.rowHeight);
      ctx.lineTo(w, y + this.rowHeight);
      ctx.stroke();

      // Waveform
      const sigHistory = this.engine.getSignalHistory(name);
      if (sigHistory.length === 0) return;

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      const margin = 4;
      const high = y + margin;
      const low = y + this.rowHeight - margin;
      const mid = y + this.rowHeight / 2;

      let started = false;
      for (let j = Math.floor(this.scrollX); j < Math.min(sigHistory.length, this.scrollX + visibleCycles + 2); j++) {
        if (j < 0) continue;
        const x = this.labelWidth + (j - this.scrollX) * stepWidth;
        const val = sigHistory[j].value;
        let yPos;

        switch (val) {
          case SIGNAL.HIGH: yPos = high; break;
          case SIGNAL.LOW: yPos = low; break;
          case SIGNAL.Z: yPos = mid; break;
          default: yPos = mid;
        }

        if (!started) {
          ctx.moveTo(x, yPos);
          started = true;
        } else {
          // Draw transition (vertical line first)
          ctx.lineTo(x, yPos);
        }

        // Draw horizontal line to next sample
        const nextX = x + stepWidth;
        ctx.lineTo(nextX, yPos);

        // Draw Z/Unknown with different style
        if (val === SIGNAL.Z || val === SIGNAL.UNKNOWN) {
          ctx.stroke();
          ctx.strokeStyle = val === SIGNAL.Z ? '#555577' : '#FF8800';
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(x, yPos);
          ctx.lineTo(nextX, yPos);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(nextX, yPos);
        }
      }

      ctx.stroke();
    });

    // Cursor
    if (this.cursorCycle >= 0) {
      const cursorX = this.labelWidth + (this.cursorCycle - this.scrollX) * stepWidth;
      if (cursorX >= this.labelWidth && cursorX <= w) {
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(cursorX, 0);
        ctx.lineTo(cursorX, h);
        ctx.stroke();
        ctx.setLineDash([]);

        // Cycle label
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '12px "VT323", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Cycle ' + this.cursorCycle, cursorX, h - 4);
      }
    }

    // Grid lines (every 10 cycles)
    ctx.strokeStyle = '#222244';
    ctx.lineWidth = 1;
    ctx.setLineDash([1, 4]);
    for (let c = Math.ceil(this.scrollX / 10) * 10; c < this.scrollX + visibleCycles; c += 10) {
      const x = this.labelWidth + (c - this.scrollX) * stepWidth;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();

      ctx.fillStyle = '#445566';
      ctx.font = '10px "VT323", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(c.toString(), x, h - 2);
    }
    ctx.setLineDash([]);
  }

  zoomIn() {
    this.zoom = Math.min(8, this.zoom * 1.5);
    this.draw();
  }

  zoomOut() {
    this.zoom = Math.max(0.25, this.zoom / 1.5);
    this.draw();
  }

  fitToWindow() {
    if (!this.engine || this.engine.history.length === 0) return;
    const availWidth = this.canvas.width - this.labelWidth;
    this.zoom = availWidth / (this.engine.history.length * 8);
    this.zoom = Math.max(0.1, Math.min(8, this.zoom));
    this.scrollX = 0;
    this.draw();
  }
}
