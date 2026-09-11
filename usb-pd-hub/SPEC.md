# USB-C PD Desk Hub — Spec v1

Desktop charging hub: 10 downstream ports (power + data), fed by a barrel-jack
laptop brick, plus a dedicated upstream USB-C for data to a PC.

## Ports

| Group | Qty | Connector | Power | Data |
|---|---|---|---|---|
| Fixed-voltage USB-C | 4 (2× dual-stacked) | USB-C | 5V/9V/12V fixed, PD3.0, up to ~36W | USB2.0 (hub) |
| PPS USB-C | 2 (standalone) | USB-C | 5V/9V/12V + PPS (continuous, 3.3–12V step), up to ~36W | USB2.0 (hub) |
| USB-A fast charge | 4 (2× dual-stacked) | USB-A | QC3.0 / AFC / FCP, ~5V/9V/12V-ish | USB2.0 (hub) |
| Upstream (to PC) | 1 | USB-C | data only, no PD out | USB2.0 (hub root) |

No 15V/20V profiles — nothing you own uses them, and skipping them lets the
per-port buck stage be sized smaller/cheaper.

## Power architecture

- **Input:** barrel jack, fixed ~19–20V from a 100W laptop brick (used, ~10€).
  Reverse-polarity protection + fuse + bulk caps on input.
- **Per-port regulation:** each port has its own PD controller driving its own
  buck converter — independent, no shared/adjustable master rail.
- **Budget:** no active power-management MCU. Each port current-limits itself;
  if you genuinely max out several ports simultaneously past 100W, the input
  fuse trips and you unplug something to reset. Normal daily use (phone +
  tablet + headphones + misc) stays well under that ceiling.

## Data architecture

- One upstream USB-C (data only) plugs into your PC.
- USB2.0 hub IC tree fans that out to all 10 downstream ports.
- Shared bandwidth ~480Mbps (hi-speed USB2.0) across all ports — no USB3.

## Key components (LCSC part numbers where known)

| Part | Qty | Role | Est. price ea. |
|---|---|---|---|
| SW3518S | 2 | PD3.0+PPS+QC/AFC/FCP, drives 1× USB-C + 1× USB-A each | ~1.5–3€ |
| CH224K (C970725) | 4 | Fixed PD3.0 source (5/9/12V), drives 1× USB-C each via external buck | ~0.30€ |
| Single-port QC3.0/AFC/FCP IC | 2 | Remaining 2× USB-A ports | ~0.40€ |
| GL850G-class USB2.0 hub IC | ~4 | Cascaded to fan out to 11 total ports | ~0.35€ |
| USB2.0 ESD protection array | 11 | One per port, data-line protection | ~0.15€ |
| Buck inductor + MOSFETs + caps | per fixed/PPS port | External power stage for CH224K/SW3518S | ~1€/port |
| Barrel jack + reverse-polarity FET + fuse + bulk caps | 1 set | Input protection | ~2€ |
| Connectors (dual-stack C/A, standalone C) | 11 total | Physical ports | ~6€ |
| Passives, LEDs, misc | — | Decoupling, indicators, test points | ~3€ |

## PCB

- 10×10cm, 4-layer, 1oz copper (JLC coupon, free w/ shipping).
- Stack: top signal, GND plane, split power-pour plane (separate 12V/9V/5V/VIN
  zones instead of one solid rail), bottom signal.
- Wide pours instead of 2oz copper to carry per-rail current (~3A) — no
  functional compromise, saves the 2oz upcharge.
- Optional stencil (~6–8€) for solder-paste reflow of the QFN/SOT parts.

## Assembly

- Hand-reflow with hot air / reflow oven (required — PD ICs are small QFN/SOT
  packages, not hand-solder-with-an-iron friendly).
- Enclosure: 3D printed, separate from electronics budget.

## Budget estimate

~30–35€ parts + ~5–10€ shipping (one combined LCSC order) + free PCB
= **~40–45€ all-in**, inside the 60€ budget with margin for spares/mistakes.
Brick (~10€ used) counted separately, doesn't touch this budget.

## Known limitations

- Not all 10 ports can hit max rated power simultaneously — shared 100W input,
  passive per-port limiting, no smart arbitration. Fine for real-world mixed
  loads, not for stress-testing every port at once.
- Data is USB2.0 only (480Mbps shared), not USB3 — matches the "500Mb/s
  combined" requirement, keeps routing simple on a 4-layer board.
- USB-A ports use QC3.0/AFC/FCP, not literal USB-PD spec (USB-A has no CC
  pins) — still gets you real 5/9/12V fast charging on Android-side devices.
