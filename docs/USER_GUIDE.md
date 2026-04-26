# Maqueen Lab — User Guide

**Version:** v0.1.0 (early scaffold — only the Servo Explorer pilot is built)

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

## What's in v0.1.0

### Servo Explorer (pilot)

- Pick **S1** or **S2**.
- Drag the **Angle** slider 0–180° → the SVG horn rotates and the robot's servo follows.
- Click an angle preset for quick jumps.
- Hit **▶ Sweep** for an automated back-and-forth animation (web-driven, BLE-rate-limited).
- **Calibration** (per port, persisted in browser): set Min and Max angles to clamp the slider — useful when you've installed a kit and the servo can't physically reach 0° or 180°.
- The **code panel** shows two equivalent versions of what your slider is sending:
  - `maqueen.servoRun(...)` — using the DFRobot library (Phase 1).
  - Raw `pins.i2cWriteBuffer(...)` — what it looks like at the I2C-register level (Phase 2 firmware).
  - Each slider movement flashes the changed value and shows the BLE round-trip latency.

### BLE Console

- Live log of every TX (web → bit) and RX (bit → web) line.
- Bench panel: sent / echoed / lost commands + average latency.

### Pinout reference

Open [pinout.html](../pinout.html) for the full pin map, I2C register layout, conflict warnings, and source-traced evidence for every pin assignment.

---

## What's coming next (per [plan.md](../plan.md))

- More Component Explorers: Simple LED, RGB ambient (4 px), Motor (with wheel trim), Buzzer (with piano), Ultrasonic (sonar gauge), Line sensors, IR remote.
- **Drive Explorer** with live 3-axis accelerometer telemetry overlaid with command markers.
- **Mechanic Kit picker**: Forklift / Loader / Beetle / Push variants of the Servos tab.
- **Add-on framework** for Gravity sensors and I2C accessories (verb namespace stubbed in firmware now).
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
