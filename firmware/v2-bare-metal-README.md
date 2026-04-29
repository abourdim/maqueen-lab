# Maqueen Lab — Firmware v2 (bare-metal)

**File:** `v2-bare-metal.ts` · ~340 lines · single-file MakeCode project

This is the **DFRobot-extension-free** firmware for the Maqueen Lite v4. Same BLE wire protocol as v1, but every motor write, sensor read, and PWM tone is done by talking directly to the hardware.

## What's identical to v1

The browser app **doesn't know which firmware is on the robot**. Both speak the same protocol:

```
M:L,R         STOP          SRV:i,a       LED:i,s
RGB:i,r,g,b   BUZZ:f,ms     LINE?         DIST?
IR?           HELLO         LOG:n         STREAM:on/off
```

Replies (`ECHO:n verb`, `DIST:cm`, `LINE:l,r`, `IR:code`, `INFO:CONNECTED`, `ERR:n reason`) are byte-identical.

## What's NEW in v2

| Verb | Reply | What it does |
|---|---|---|
| `HEAD?` | `HEAD:degrees` | Compass heading 0..360. Powers the **Heading Lock + Drift Champion** features in the app. |
| `BAT?` | `BAT:V[,pct]` | Battery voltage on P10 + computed % (4×AA NiMH calibrated). Powers the **battery indicator**. |
| `CAL!` | `CAL:DONE` | Forces the figure-8 compass calibration. |
| `MEM:addr,len` | `MEM:addr,b1,b2,...` | Raw memory dump (clamped to 32 B, safe RAM range only). Unlocks the **Memory Forensics** hacker game. STUB in this version — see Stage 5 below. |

## What's BETTER in v2

- **🌈 NeoPixels actually light up.** v1 ships with the standalone `neopixel` extension *commented out* because it's incompatible with `bluetooth`. v2 uses `light.createStrip` (DMA-driven on micro:bit V2) → coexists cleanly. `RGB:i,r,g,b` lights the real on-bot pearls.
- **⚡ Motor latency.** v1's extension wraps each motor write in defensive sleeps (≈25 ms per `motorRun`). v2 issues both motor writes via direct I²C in ≈8 ms.
- **🛡️ Hard safety stop on disconnect.** Both firmwares stop motors on BLE drop; v2 does it via direct I²C so it can't be blocked by the extension's queue.

## What's the same hardware-wise

```
P0   buzzer
P1   servo S1  (also sonar TRIG — coordinate!)
P2   servo S2  (also sonar ECHO)
P8   onboard LED L
P10  battery voltage (analog, 6.6V max via 2:1 divider)
P12  onboard LED R
P13  line sensor L (digital)
P14  line sensor R (digital)
P15  NeoPixel strip (4 pixels, WS2812B)
P16  IR receiver (NEC, software decoded)
I²C  motor driver TB6612FNG @ 0x10
```

## How to flash

1. Open <https://makecode.microbit.org/>
2. New Project → switch to **JavaScript** view
3. Paste the contents of `v2-bare-metal.ts`
4. Add extension: **`bluetooth`** (Settings → Extensions → search "bluetooth")
5. Add extension: **`light`** (search "light")
6. **Edit Project Settings** (gear icon → Project Settings):
   - "No pairing required" = **on** (otherwise the browser pairing prompt asks for a 6-digit PIN)
   - "Connection Event events" = **on**
7. Hit **Download** → drag the `.hex` to your `MICROBIT` USB drive.

## How to verify it's working

1. Connect via the Maqueen Lab app → 📖 the live sensor strip should populate
2. **HDG block** in the strip should show degrees with cardinal-direction colors (was `—` with v1)
3. **BAT block** should show voltage + % (was `—` with v1)
4. The 🎚 Heading Lock toggle on the path card should activate (was disabled with v1)
5. Trigger 🌈 NeoPixels in the app — actual pearls light up (with v1 + standard neopixel extension, BLE drops; with v2, it works)

## Trade-offs

- **micro:bit V2 only.** The DMA NeoPixel driver and the BLE+i2c+pwm budget needs the V2's faster MCU + extra RAM. v1 *can* run on V1 (with NeoPixels disabled).
- **No `pxt-maqueen` block view.** This firmware is JavaScript-only. v1 also has the visual block representation. If a teacher wants to drag-and-drop in the MakeCode block editor, ship v1.
- **IR decoder is in-thread.** The `pulseIn`-based NEC decoder runs in a `control.inBackground` loop. Adds ~5% CPU overhead. If IR isn't wired, comment out `startIRBackgroundDecoder()`.
- **Servo/sonar share P1.** When the autopilot sweep-servo is running on S1 *and* the app is polling DIST?, the sonar misses pings during servo holds. The app paces both at 5 Hz so collisions are rare; v1 has the same constraint.

## Stage 5 — Memory Forensics (TODO)

The current `MEM:` handler returns a STUB. To make it real, MakeCode needs raw memory access — currently the safest path is:

```ts
// Pseudo — needs MakeCode internal API or a low-level pxt-common-packages helper
const buf = control.ramBuffer(addr, len)
```

This isn't currently exposed. Until then, `MEM:` gracefully replies `MEM:addr,0,0,...,STUB` so the hacker-mode game can detect the limitation and tell the kid "your firmware is in safety mode — flash with debug build for raw memory access".

## Source

Both firmwares live in `firmware/` of this repo:
- `firmware/v1-maqueen-lib.ts` — extension-based, default
- `firmware/v2-bare-metal.ts` — direct hardware
- `firmware/v2-bare-metal-README.md` — this file
