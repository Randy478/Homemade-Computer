# Memory Map

## Real Mode (0x00000–0xFFFFF, 1MB)

```
0xFFFFF ┌──────────────────────────┐
        │                          │
        │   System BIOS (64KB)     │  Board 6: 28C512 EEPROM (ZIF socket)
        │   Reset vector at        │  i486 starts executing here
        │   0xFFFFFFF0 (aliased)   │
        │                          │
0xF0000 ├──────────────────────────┤
        │   Reserved / Option ROMs │  0xC8000–0xEFFFF (160KB)
0xC8000 ├──────────────────────────┤
        │   VGA BIOS ROM (32KB)    │  Board 7: On the ISA VGA card itself
0xC0000 ├──────────────────────────┤
        │                          │
        │   VGA Frame Buffer       │  Board 7: ISA VGA card
        │   (128KB)                │  Text mode uses 0xB8000+
        │                          │
0xA0000 ├──────────────────────────┤
        │                          │
        │                          │
        │   Conventional RAM       │  Board 4: SIMM bank 0
        │   (640KB)                │  DOS usable memory
        │                          │
        │                          │
0x00000 └──────────────────────────┘
```

## Extended Memory (0x100000+)

```
0x3FFFFF ┌──────────────────────────┐
         │                          │
         │   Extended RAM (3MB)     │  Board 4: SIMM banks 1–3
         │                          │  Accessible via protected mode,
         │                          │  HIMEM.SYS, or XMS
         │                          │
0x100000 └──────────────────────────┘
```

## I/O Port Map

| Port Range | Device | Board |
|-----------|--------|-------|
| 0x000–0x00F | DMA controller (CPLD) | B3 |
| 0x020–0x021 | IRQ controller (CPLD) | B3 |
| 0x040–0x043 | Timer (CPLD) | B3 |
| 0x060–0x064 | Keyboard controller (8042) | B6 |
| 0x080–0x08F | POST code output | B8 |
| 0x0CF8–0x0CFF | Reserved (no PCI) | — |
| 0x170–0x177 | IDE secondary (unused) | — |
| 0x1F0–0x1F7 | IDE primary | B5 |
| 0x278–0x27F | Parallel port (if present) | B6 |
| 0x2F8–0x2FF | COM2 (if present) | — |
| 0x3B0–0x3DF | VGA registers | B7 |
| 0x3F0–0x3F7 | Floppy controller | B5 |
| 0x3F8–0x3FF | COM1 (16550 UART) | B6 |

## CPLD Chip Select Decode

The CPLD on Board 3 monitors A16–A31 (directly from CPU) and the lower address bits on the bus to generate active-low chip selects:

| /CS Signal | Condition | Target |
|-----------|-----------|--------|
| /CS_RAM | Memory access, addr < 0xA0000 or addr >= 0x100000 | Board 4 |
| /CS_VGA | Memory access, 0xA0000 ≤ addr < 0xC0000 | Board 7 |
| /CS_ROM | Memory access, 0xF0000 ≤ addr < 0x100000 | Board 6 |
| /CS_IDE | I/O access, 0x1F0–0x1F7 | Board 5 |
| /CS_FDC | I/O access, 0x3F0–0x3F7 | Board 5 |
| /CS_UART | I/O access, 0x3F8–0x3FF | Board 6 |
| /CS_KBD | I/O access, 0x060–0x064 | Board 6 |
| /CS_POST | I/O access, 0x080 | Board 8 |
