# Homemade i486 Computer

A retro computer built from 10cm×10cm 4-layer PCBs arranged in a flat 2×5 rectangle. Boards clip together at their edges via right-angle pin headers, forming a chunky 50cm × 20cm slab.

## Specs

| Component | Detail |
|-----------|--------|
| CPU | Intel 486DX-33 (33MHz, 5V, built-in FPU) |
| RAM | 4MB (4 × 1MB 30-pin SIMMs in slots) |
| Storage | ~4MB IDE HDD + 3.5" 1.44MB floppy |
| Video | ISA VGA card (8-bit ISA slot) |
| BIOS | 64KB EEPROM (28C512) in removable ZIF socket |
| Chipset | Altera EPM7128 CPLD (custom logic) |
| Bus | 32-bit data, 16-bit address on inter-board bus |

## Board Layout

```
┌─────────┬─────────┬─────────┬─────────┬─────────┐
│  POWER  │   CPU   │ CHIPSET │   RAM   │ STORAGE │
│  (B1)   │  (B2)   │  (B3)   │  (B4)   │  (B5)   │
├─────────┼─────────┼─────────┼─────────┼─────────┤
│  I/O +  │ ISA GPU │  DEBUG  │  EXP 1  │  EXP 2  │
│  BIOS   │  SLOT   │  (B8)   │ (empty) │ (empty) │
│  (B6)   │  (B7)   │         │         │         │
└─────────┴─────────┴─────────┴─────────┴─────────┘
          ← 50cm × 20cm →
```

8 active boards, 2 expansion slots for future add-ons. Boards connect edge-to-edge with right-angle 2×30 pin headers carrying a 32-bit data bus + 16-bit address + control signals + power.

## Budget

€20 for new parts. CPU, CPLD, RAM, VGA card, PCBs, and connectors are bought. Everything else (74-series logic, voltage regulators, FDC, UART, passives, connectors, drives) is salvaged from junk PCs.

## Repo Structure

```
docs/           Architecture docs, BOM, pinouts
kicad/          KiCad projects per board + shared libs
firmware/       CPLD logic (VHDL) + BIOS (x86 asm)
tools/          Helper scripts
```

## Build Order

1. Power → 2. CPU → 3. Chipset → 4. Debug → 5. I/O+BIOS → 6. RAM → 7. ISA GPU → 8. Storage → Boot DOS
