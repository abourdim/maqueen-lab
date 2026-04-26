# Maqueen Lab

**Web-based BLE component lab for the DFRobot Maqueen Lite v4 + Mechanic Kits.**

Every actuator and sensor on the Maqueen Lite has a dedicated **Explorer** page where kids can manipulate the component live, see the code that drives it, and watch sensor data react. All control flows over BLE UART. Every command is echo-confirmed.

> **Status:** v0.1.0 — early scaffolding. See [plan.md](plan.md) for the full build plan.

---

## Hardware

DFRobot Maqueen Lite v4 (ROB0148) — micro:bit-based educational robot. Optional Mechanic Kits: Forklift (ROB0156-F), Loader (ROB0156-L), Beetle gripper (ROB0156-B), Push (ROB0156-P).

### Pin map (quick reference)

| Pin | Used by | Notes |
|---|---|---|
| P0 | Buzzer | Default `music` pin |
| P1 | Ultrasonic TRIG | Conflict: Gravity port |
| P2 | Ultrasonic ECHO | Conflict: Gravity port |
| P8 | LED Left (simple) | Digital ON/OFF |
| P12 | LED Right (simple) | Digital ON/OFF |
| P13 | Line sensor Left | Digital 0/1 |
| P14 | Line sensor Right | Digital 0/1 |
| P19/P20 | I2C bus | Motor + RGB + Servos at addr **0x10** |

### I2C 0x10 register map

| Register | Function |
|---|---|
| `0x00` | Motor M1 (left) |
| `0x02` | Motor M2 (right) |
| `0x14` | Servo S1 |
| `0x15` | Servo S2 |
| `0x32` | 4× RGB LED data |

Full pinout, conflict warnings, and protocol spec live in [docs/USER_GUIDE.md](docs/USER_GUIDE.md).

---

## Quick start

1. Flash `firmware/v1-maqueen-lib.ts` to your micro:bit (paste into [makecode.microbit.org](https://makecode.microbit.org), add the `pxt-maqueen` extension, download `.hex`).
2. Power on the Maqueen Lite.
3. Open the web app in Chrome / Edge (Web Bluetooth required).
4. Click **Connect**, pair with `BBC micro:bit [xxxxx]`.
5. Pick a Component Explorer and play.

---

## Architecture

- **Web app**: vanilla JS + SVG + CSS. No framework. PWA-installable.
- **BLE**: Web Bluetooth → micro:bit Bluetooth UART service.
- **Protocol**: every command carries a sequence number. Micro:bit echoes back. Web app validates round-trip and surfaces latency/loss in the Console tab.
- **Firmware**: stays dumb. Web app drives all animations (sweep, blink, rainbow) via streamed commands.
- **USB serial mirror** at 115200 baud — boot banner, RX/TX log, executed commands. Useful for debugging without the web app.

See [plan.md](plan.md) for the full plan.

---

## Forked from

This project forks [bit-playground](https://github.com/abourdim/bit-playground) v1.2.0 — its BLE layer, sensor graph engine, and i18n machinery are reused as-is. **The BLE layer (`js/ble.js`) is treated as a stable dependency and not modified in this fork.**

---

## License

MIT
