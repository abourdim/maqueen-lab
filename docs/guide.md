# Maqueen Lab — User Guide

**Version:** v0.1.55 — Maqueen tab feature-complete (Drive, Servos with Mechanic-Kit picker, Simple LEDs, NeoPixels, Buzzer, Ultrasonic, IR remote, Line sensors + Follow-line). Live sensor strip across the top, auto-pollers with persisted rate sliders, and a `streams: ON/OFF` chip that auto-arms when you enter Sensors / Graph / 3D.

> The HTML twin of this guide ([USER_GUIDE.html](../USER_GUIDE.html)) is the canonical, kid-friendly version and is kept up to date in lockstep.

---

## What is Maqueen Lab?

A web-based BLE component lab for the **DFRobot Maqueen Lite v4** educational robot (and its optional Mechanic Kits: Forklift, Loader, Beetle gripper, Push). Each actuator and sensor on the robot gets its own **Explorer** page where you can manipulate the component live, see the code that drives it, and watch sensor data react to your commands.

Everything runs in the browser via Web Bluetooth — no install, no app store, just an HTTPS page.

---

## What you need

- **Robot**: DFRobot Maqueen Lite v4 (ROB0148) + a BBC micro:bit V2.
- **Browser**: Chrome, Edge, or Opera on desktop / Android (Web Bluetooth required — Safari and iOS browsers do *not* support it).
- **Cable**: USB cable for first flash.

---

## First flash

1. Open [makecode.microbit.org](https://makecode.microbit.org).
2. Click **Extensions** and add `pxt-maqueen` (search "maqueen" or paste the URL `https://github.com/DFRobot/pxt-maqueen`).
3. Open `firmware/v1-maqueen-lib.ts` from this repo and paste its contents into MakeCode (switch to JavaScript view).
4. Edit the two build-stamp lines at the top:
   ```ts
   const BUILD_VERSION = "0.1.0"
   const BUILD_DATE = "2026-04-26"
   ```
5. Click **Download** to get the `.hex` file. Drag it onto your micro:bit (it shows up as a USB drive).
6. The micro:bit will flash and reboot. You should see a "✗" icon (no BLE connection yet).
7. Open a serial terminal at 115200 baud — you should see the boot banner:
   ```
   [boot] Maqueen Lab firmware v0.1.0 built 2026-04-26
   [boot] hardware: Maqueen Lite v4 (ROB0148)
   [boot] BLE UART ready — waiting for connection
   ```

---

## Connect

1. Power on the Maqueen Lite (slide switch on the underside).
2. Open the Maqueen Lab web app (`index.html`) in Chrome / Edge.
3. Click **Connect micro:bit**.
4. Pick `BBC micro:bit [xxxxx]` (or `uBit [xxxxx]`) from the pairing dialog.
5. The status dot turns green, the micro:bit shows a "✓" icon, and the console logs `Connected`.

---

## What's in v0.1.55

### UI structure

The tab strip has **two top tabs**:

- **🤖 Maqueen** — the real-robot UI. Cards for Drive, Servos (with a Mechanic-Kit picker: Forklift / Loader / Beetle / Push), Simple LEDs, NeoPixels, Buzzer, Ultrasonic, IR remote, and Line sensors (Follow-line auto mode lives inside the line-sensor card now).
- **🧪 Playground** — collapsible group of legacy bit-playground sub-tabs: Controls, Sensors, Graph, 3D, Bench, More. (Down from 8 sub-tabs after dropping the duplicate Motors and GamePad sub-tabs.)

A **live sensor strip** runs across the top: LINE, DIST, IR, ACC, BLE bench (sent · echoed · lost · avg ms), three poll buttons, and a `streams: ON/OFF` chip.

### Drive

- Direction pad + speed slider; drag while moving and the speed updates live.
- **Hold to drive (release = stop)** option for kids who want a deadman feel.

### Servos

- Two sliders (S1, S2) with three presets per slider.
- **Mechanic Kit picker** relabels the panel for Forklift (Lift/Tilt), Loader (Arm/Bucket), Beetle (Arm/Grip), or Push (Blade-only).
- Per-port min/max calibration persists in localStorage.

### Sensors / streams

- DIST and LINE auto-poll at a rate you pick (200–2000 ms slider, persisted). When nothing is in front, DIST returns `DIST:-` (not the bogus `DIST:500` from earlier builds).
- ACC / LIGHT / SOUND streams emit a heartbeat every ~500–1000 ms even when the value is unchanged, so the Graph never looks frozen. Streams are off by default; flip `STREAM:on` (or the chip in the strip), or just enter the Sensors / Graph / 3D sub-tab and they auto-arm on entry / disarm on exit.
- Auto-pollers also pause when you leave the Maqueen tab — the BLE channel stays clear for whatever you're doing in the Playground.
- `input.compassHeading()` is **not** in the auto-stream — it triggered tilt-game calibration that blocked the BLE handler (root cause of the long-standing "no echo" symptom).

### Follow-line

Lives inside the Line-sensor card. Tick rate slider 100–1000 ms (persisted).

### LED matrix draw

`LM:HEX` verb — Controls tab can paint the 5×5 matrix on the board.

### More-tab feedback

Every `OTHER:*` verb now shows visible micro:bit-screen feedback (digits, heart, arrows, switch icons, bar graphs, scrolling text) instead of silently acking.

### BLE Console

- Single global write serializer — no `NetworkError: GATT operation already in progress`.
- Connection state has one source of truth (DOM signal + MutationObserver, broadcasts `connected` / `disconnected`); pending sends reject on disconnect (no silent hangs).
- `HELLO` / `HELLO:<ver>` confirms connection and reports firmware version on the Connect card.
- Bench panel still shows sent / echoed / lost + avg latency.

### Build / firmware version

The pre-commit hook auto-bumps `BUILD_VERSION` **only** when `firmware/v1-maqueen-lib.ts` is in the staged change. Docs commits no longer bump the label — the stamp tracks real firmware churn.

The `.hex` is **not** auto-compiled. Re-build it in MakeCode and re-flash when the firmware version changes (see `USER_GUIDE.html` → "Building the firmware .hex").

### Pinout reference

Open [pinout.html](../pinout.html) for the full pin map, I2C register layout, conflict warnings, and source-traced evidence for every pin assignment.

---

## Removed / deprecated

To kill duplication after the Maqueen tab landed:

- **Touch P0/P1/P2 cards** — Maqueen wires P13/P14 to line sensors; P0/P1/P2 aren't exposed for touch.
- **Buzzer card** in Controls — duplicate of Maqueen Buzzer.
- **Servo / LED / Buzzer cards** in More — duplicates of the Maqueen panels.
- **GamePad sub-tab** — duplicate of Maqueen Drive.
- **Motors sub-tab** — duplicate of Maqueen Servos with the kit picker.

## What's coming next (per [plan.md](../plan.md))

- **Add-on framework** for Gravity sensors and I2C accessories (verb namespace stubbed in firmware).
- Trilingual UI (EN / AR / FR).
- Phase 2 firmware (`firmware/v2-raw-pins.ts`): same wire protocol, raw `pins.*` calls instead of `maqueen.*` lib — for advanced learners.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| **Connect dialog shows no devices** | Bluetooth off, or the micro:bit isn't advertising | Power-cycle the Maqueen, re-flash the firmware, ensure Bluetooth is on |
| **Connects then immediately drops** | Battery low, or laptop too far | Replace AAAs / charge the lithium cell, move within 1 m for first pair |
| **Slider moves but servo doesn't** | Servo calibration too narrow, or kit physically blocking the servo | Reset calibration to 0–180, manually move the servo arm to free it |
| **Console shows lots of "echo timeout"** | BLE link dropping packets | Reduce sweep speed, move closer to robot, replace batteries |
| **`UNKNOWN_VERB` errors** | Web app sent a verb the firmware doesn't recognize | Re-flash firmware — it must match the web app version |

---

## License

MIT — see [LICENSE](../LICENSE).
