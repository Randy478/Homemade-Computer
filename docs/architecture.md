# Architecture

## Physical Layout

10 board slots in a 2×5 grid (50cm × 20cm). Each board is 10cm × 10cm, 4-layer PCB. Boards connect to neighbors via right-angle 2×30 pin headers on their edges. M3 standoffs at shared corners for rigidity.

```
┌─────────┬─────────┬─────────┬─────────┬─────────┐
│  POWER  │   CPU   │ CHIPSET │   RAM   │ STORAGE │
│  (B1)   │  (B2)   │  (B3)   │  (B4)   │  (B5)   │
├─────────┼─────────┼─────────┼─────────┼─────────┤
│ I/O+BIOS│ ISA GPU │  DEBUG  │  EXP 1  │  EXP 2  │
│  (B6)   │  (B7)   │  (B8)   │ (empty) │ (empty) │
└─────────┴─────────┴─────────┴─────────┴─────────┘
```

## Edge Connections

Each board can connect to up to 4 neighbors (left, right, top, bottom). Not all edges are connected — only where the bus needs to pass. The 60-pin bus daisy-chains through the grid:

```
B1 ──→ B2 ──→ B3 ──→ B4 ──→ B5
│       │       │       │       │
↓       ↓       ↓       ↓       ↓
B6 ──→ B7 ──→ B8 ──→ EXP1 ─→ EXP2
```

## 4-Layer Stack-Up (all boards)

| Layer | Function |
|-------|----------|
| Top copper | Signal routing + components |
| Inner 1 | GND plane (solid) |
| Inner 2 | VCC plane (+5V, solid) |
| Bottom copper | Signal routing + components |

The solid inner planes provide clean power distribution, return paths for signals, and shielding between top and bottom signal layers. Critical at 33MHz.

## Board Descriptions

### B1 — Power
Generates the 5V rail from a 12V DC input. 7805 linear regulator (or LM2596 switching if available). Reverse polarity protection. Bulk decoupling. Power LED, power switch, reset button. Feeds power into the bus grid — every board gets 5V through the edge connectors.

### B2 — CPU
Intel 486DX-33 in a PGA-168 socket. 33MHz crystal oscillator. RC reset circuit with Schmitt trigger (74HC14). 74HC245 bus transceivers buffer the CPU bus onto the inter-board bus. This is the hottest board (486 draws ~3-5W) — good airflow from the flat layout helps.

### B3 — CPLD Chipset
Altera EPM7128STC100 CPLD replaces a traditional 486 chipset. JTAG header for in-system programming. The CPLD generates:
- Chip select signals for every peripheral (active-low /CS lines)
- DRAM refresh timing
- Bus cycle control and wait-state generation
- ISA bus clock (8.33MHz) from the 33MHz system clock
- ISA bus protocol translation
- Simplified interrupt controller (8259-style priority)
- DMA handshaking for the floppy controller

74HC245 transceivers on this board provide bus isolation.

### B4 — RAM
Four 30-pin SIMM sockets, each holding a 1MB SIMM. SIMMs are removable/swappable. 74HC257 quad muxes handle RAS/CAS address multiplexing. CPLD chip selects determine which SIMM bank is active. Total: 4MB.

### B5 — Storage Controller
Floppy: 82077AA or PC8477 FDC chip, 34-pin floppy header on board edge. IDE: 74HC245 buffers + CPLD chip select, 40-pin IDE header on board edge. Both headers face outward for cable access.

### B6 — I/O + BIOS
The 28C512 64KB EEPROM sits in a ZIF-28 socket — pull it out to reprogram, push it back in. Mapped at the top of real-mode address space (0xF0000–0xFFFFF) where the 486 fetches its first instruction after reset. Also has a 16550 UART + MAX232 for RS-232 serial (DB-9 connector), a PS/2 keyboard controller (8042 or CPLD bit-bang), and a piezo buzzer for POST beep codes.

### B7 — ISA GPU Slot
8-bit ISA edge connector (62 pins, ~8cm long). An ISA VGA card plugs in vertically, sticking up from the board. ISA signals are translated from the 33MHz system bus by the CPLD to the 8.33MHz ISA bus. Most ISA VGA cards support 8-bit mode.

### B8 — Debug / Diagnostics
Bus breakout to test point headers (all 60 signals accessible). 2×20 logic analyzer header. 8 LEDs showing D0–D7 live. DIP switch bank for manual address/data override. 2-digit 7-segment hex display for POST codes. Secondary JTAG pass-through header.

### EXP 1, EXP 2 — Expansion
Empty slots with bus connectors from neighbors. Plug in any future board: sound card, network adapter, additional RAM, co-processor, whatever.
