# Maqueen Lab

**Web-based BLE component lab for the DFRobot Maqueen Lite v4 + Mechanic Kits.**

Every actuator and sensor on the Maqueen Lite is reachable from a card in the **🤖 Maqueen** tab — drive the wheels, pose the servos, light the LEDs and NeoPixels, beep the buzzer, ping the ultrasonic, read the IR remote, follow a line. A second **🧪 Playground** tab keeps the legacy bit-playground sub-tabs (Controls, Sensors, Graph, 3D, Bench, More) for free-form micro:bit experiments. All control flows over BLE UART; every command is sequence-numbered and echo-confirmed.

> **Status:** v0.1.55 — Maqueen tab feature-complete; live sensor strip, auto-pollers, mechanic-kit picker, follow-line, NeoPixel rainbow, LED matrix draw. See [CHANGELOG.md](docs/CHANGELOG.md) for recent work, [plan.md](docs/plan.md) for the original build plan.

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

## Run locally

**TL;DR — don't double-click `index.html`.** Chromium's CORS rules block
`fetch()` of `manifest.json` / `product.json` / `build-info.json` from the
`file://` protocol. The app degrades gracefully (no functional impact) but
the DevTools console fills with red errors, the PWA install prompt won't
appear, and the Service Worker can't register.

Pick whichever launcher you have handy — they all serve `http://localhost:8000`:

| Platform | Command | Notes |
|---|---|---|
| **Windows** | double-click `serve.bat` | tries Python, falls back to `npx serve` |
| **macOS / Linux** | `./serve.sh` | tries Python, falls back to `npx serve` |
| **Any with Python 3.7+** | `python tools/serve.py` | stdlib only, no install |
| **Any with Node** | `npm run serve` | uses `npx serve` (CDN one-shot) |
| **Any with Python via npm** | `npm run serve:py` | runs `tools/serve.py` |

The Python launcher accepts a custom port (`python tools/serve.py 8765`)
and auto-opens your default browser unless `MAQUEEN_NO_BROWSER=1` is set.

---

## Architecture

- **Web app**: vanilla JS + SVG + CSS. No framework. PWA-installable.
- **BLE**: Web Bluetooth → micro:bit Bluetooth UART service. Single global write serializer awaits each `writeValue()` Promise — no `NetworkError: GATT operation already in progress`. Connection state is broadcast via DOM signal + MutationObserver; pending sends reject on disconnect.
- **Protocol**: every command carries a sequence number. Micro:bit replies `ECHO:N <verb>`. Web app surfaces sent / echoed / lost / avg-latency on the live sensor strip's BLE bench chip. `HELLO`/`HELLO:<ver>` reports firmware version on the Connect card.
- **Sensor streams**: ACC / LIGHT / SOUND auto-stream with a heartbeat (≥ once per ~500–1000 ms) so the Graph never looks frozen. Off by default — flip the `streams: ON/OFF` chip in the live strip, or enter the Sensors / Graph / 3D tab and they auto-arm. DIST / LINE / IR are polled on demand with per-poll-rate sliders (200–2000 ms, persisted in localStorage). Auto-pollers pause when leaving the Maqueen tab to spare BLE bandwidth.
- **Firmware**: stays dumb. Web app drives all animations (sweep, blink, rainbow, follow-line tick) via streamed commands.
- **USB serial mirror** at 115200 baud — boot banner, RX/TX log, executed commands. Useful for debugging without the web app.

### Build / firmware version

The pre-commit hook auto-bumps `BUILD_VERSION` **only** when `firmware/v1-maqueen-lib.ts` is in the staged change. Docs-only commits no longer bump the version — the stamp tracks real firmware churn. The `.hex` is **not** auto-compiled; rebuild it in MakeCode and re-flash when the version changes (see the User Guide's "Building the firmware .hex" section).

See [plan.md](docs/plan.md) for the full plan.

---

## Forked from

This project forks [bit-playground](https://github.com/abourdim/bit-playground) v1.2.0 — its BLE layer, sensor graph engine, and i18n machinery are reused as-is. **The BLE layer (`js/ble.js`) is treated as a stable dependency and not modified in this fork.**

---

## License

MIT
