# Maqueen Lite v4 — Pinout Reference

Source of truth for every pin used by Maqueen Lab firmware and the underlying `pxt-maqueen` extension.

## References

- **DFRobot pxt-maqueen extension** — [github.com/DFRobot/pxt-maqueen](https://github.com/DFRobot/pxt-maqueen) — the canonical MakeCode library; the only authoritative source for which micro:bit pin drives what on Maqueen Lite v4. All pin assignments below are extracted from this repo.
- **pxt-maqueen `maqueen.ts`** — [maqueen.ts](https://github.com/DFRobot/pxt-maqueen/blob/master/maqueen.ts) — line-by-line `DigitalPin.PXX` and I2C `0x10` references cited in the "How we know" section below.
- **pxt-maqueen `maqueenIR.cpp`** — [maqueenIR.cpp](https://github.com/DFRobot/pxt-maqueen/blob/master/maqueenIR.cpp) — IR-receiver C++ shim, fixed pin internal to the extension.
- **DFRobot Maqueen Lite product page** — [dfrobot.com/product-1783.html](https://www.dfrobot.com/product-1783.html) — high-level component list (4× RGB ambient, 2× LEDs, 2× line sensors, ultrasonic, IR, buzzer, S1/S2 servos, P0/P1/P2 Gravity ports, I2C). Does **not** publish the pin diagram in text.
- **DFRobot Maqueen Lite wiki** — [wiki.dfrobot.com/rob0148-en](https://wiki.dfrobot.com/rob0148-en/) — installation guide, function diagram (image-only), example sketches.
- **micro:bit pin reference** — [tech.microbit.org/hardware/edgeconnector/](https://tech.microbit.org/hardware/edgeconnector/) — for resolving which `DigitalPin.PXX` map to which physical edge-connector pad and which are shared with the LED matrix.

## About the pxt-maqueen library

`pxt-maqueen` is DFRobot's official MakeCode extension for the Maqueen family of educational robots (including Maqueen Lite v4). Add it in MakeCode by clicking *Extensions → search "maqueen"* or pasting its GitHub URL. It exposes a `maqueen` namespace that wraps the low-level pin and I2C operations behind kid-friendly block APIs:

- `maqueen.motorRun(motor, dir, speed)` — drives the I2C motor controller at address `0x10`.
- `maqueen.motorStop(motor)` — brake.
- `maqueen.servoRun(servo, angle)` — writes to I2C registers `0x14` (S1) and `0x15` (S2).
- `maqueen.writeLED(led, switch)` — toggles the simple LEDs on `P8` (left) and `P12` (right).
- `maqueen.readPatrol(sensor)` — reads the line-tracking sensors on `P13` (left) and `P14` (right).
- `maqueen.Ultrasonic(unit)` — drives `P1` (trig) / `P2` (echo) for SR04.
- `maqueen.IR_read()` — reads NEC codes from the on-board IR receiver via the `maqueenIR.cpp` C++ shim.
- I2C-controlled RGB LEDs (4 ambient pixels) accessed at register `0x32` of the same `0x10` chip — *not* standard NeoPixels.

Maqueen Lab's v1 firmware (`firmware/v1-maqueen-lib.ts`) uses these `maqueen.*` calls directly. The future v2 firmware will replace them with raw `pins.*` and I2C calls — same wire protocol, same web app, lower-level code shown side-by-side in every Component Explorer for educational progression.

---

## micro:bit pin usage

| Pin | Used by | Direction | Notes |
|---|---|---|---|
| **P0** | Buzzer | Out (PWM) | Default `music` pin; also Gravity port — conflicts if reassigned |
| **P1** | Ultrasonic TRIG | Out | Also labeled Gravity port — conflicts with ext sensor |
| **P2** | Ultrasonic ECHO | In | Also labeled Gravity port — conflicts with ext sensor |
| P3 | — | free | Shared with LED matrix col1 (avoid for digital out) |
| P4 | — | free | LED matrix col2 |
| P5 | Button A | In | micro:bit built-in |
| P6 | — | free | LED matrix col9 |
| P7 | — | free | LED matrix col8 |
| **P8** | LED Left (simple) | Out | Digital ON/OFF |
| P9 | — | free | LED matrix col7 |
| P10 | — | free | LED matrix col3 |
| P11 | Button B | In | micro:bit built-in |
| **P12** | LED Right (simple) | Out | Digital ON/OFF |
| **P13** | Line sensor Left | In | Digital 0/1 |
| **P14** | Line sensor Right | In | Digital 0/1 |
| P15 | — | free | |
| P16 | — | free | |
| **P19** | I2C SCL | — | Motor driver + 4× RGB + servos S1/S2 (addr **0x10**) |
| **P20** | I2C SDA | — | Same I2C bus |

---

## Component map

| Component | Pin / Address | Notes |
|---|---|---|
| Motor driver | I2C **0x10** | Reg `0x00` = M1, `0x02` = M2 (direction + speed) |
| 4× RGB ambient lights | I2C **0x10**, reg **0x32** | **Not standard NeoPixel** — chip-driven via the motor driver IC |
| LED Left (simple) | **P8** digital | ON/OFF |
| LED Right (simple) | **P12** digital | ON/OFF |
| Line sensor Left | **P13** digital | 0/1 |
| Line sensor Right | **P14** digital | 0/1 |
| Ultrasonic TRIG | **P1** | SR04 / SR04P |
| Ultrasonic ECHO | **P2** | SR04 / SR04P |
| Buzzer | **P0** | micro:bit default `music` lib |
| Servos S1 / S2 | I2C **0x10** (via extension) | Use `maqueen.servoRun(S1\|S2, angle)` |
| IR receiver | `maqueenIR.cpp` (fixed pin) | `maqueen.IR_read()` returns NEC code |

---

## I2C 0x10 register map (motor driver chip)

| Register | Function |
|---|---|
| `0x00` | Motor M1 (left): direction + speed |
| `0x02` | Motor M2 (right): direction + speed |
| `0x14` | Servo S1 angle |
| `0x15` | Servo S2 angle |
| `0x32` | 4× RGB LED data (16M colors each) |

---

## Free for kid add-ons

**P3, P4, P6, P7, P9, P10, P15, P16**

P3/P4/P6/P7/P9/P10 share the LED display matrix — disable display first if used as digital outputs:

```ts
led.enable(false)
```

---

## Conflict warnings

- **P0 = buzzer**. Plugging anything else into the Gravity P0 port silences the buzzer (or vice versa).
- **P1 / P2 = ultrasonic**. Plugging a Gravity sensor into P1 or P2 disables the ultrasonic. The app will warn when both are used.
- **I2C bus** (P19/P20) is shared. Add-ons at addresses other than `0x10` are fine; address collision is fatal.

---

## How we know — pin assignments traced to source

Every pin assignment below is extracted from the [pxt-maqueen extension source](https://github.com/DFRobot/pxt-maqueen). Line numbers refer to [`maqueen.ts`](https://github.com/DFRobot/pxt-maqueen/blob/master/maqueen.ts) at the time of writing.

| Pin / Address | Component | Evidence |
|---|---|---|
| `P1` | Ultrasonic TRIG | [maqueen.ts:164](https://github.com/DFRobot/pxt-maqueen/blob/master/maqueen.ts#L164) — `pins.digitalWritePin(DigitalPin.P1, 1)` inside `Ultrasonic()` |
| `P2` | Ultrasonic ECHO | [maqueen.ts:172](https://github.com/DFRobot/pxt-maqueen/blob/master/maqueen.ts#L172) — `d = pins.pulseIn(DigitalPin.P2, PulseValue.High, 500 * 58)` |
| `P8` | LED Left (simple) | [maqueen.ts:287](https://github.com/DFRobot/pxt-maqueen/blob/master/maqueen.ts#L287) — `pins.digitalWritePin(DigitalPin.P8, ledswitch)` inside `writeLED(LEDLeft, ...)` |
| `P12` | LED Right (simple) | [maqueen.ts:289](https://github.com/DFRobot/pxt-maqueen/blob/master/maqueen.ts#L289) — `pins.digitalWritePin(DigitalPin.P12, ledswitch)` inside `writeLED(LEDRight, ...)` |
| `P13` | Line sensor Left | [maqueen.ts:267](https://github.com/DFRobot/pxt-maqueen/blob/master/maqueen.ts#L267) — `return pins.digitalReadPin(DigitalPin.P13)` inside `readPatrol(PatrolLeft)` |
| `P14` | Line sensor Right | [maqueen.ts:269](https://github.com/DFRobot/pxt-maqueen/blob/master/maqueen.ts#L269) — `return pins.digitalReadPin(DigitalPin.P14)` inside `readPatrol(PatrolRight)` |
| I2C `0x10` | Motor + RGB + Servos chip | [maqueen.ts:19](https://github.com/DFRobot/pxt-maqueen/blob/master/maqueen.ts#L19) — `const MOTER_ADDRESSS = 0x10`, used by `pins.i2cWriteBuffer(0x10, buf)` throughout |
| I2C `0x10` reg `0x14` | Servo S1 angle | [maqueen.ts:308](https://github.com/DFRobot/pxt-maqueen/blob/master/maqueen.ts#L308) — `buf[0] = 0x14` then `pins.i2cWriteBuffer(0x10, buf)` inside `servoRun(S1, angle)` |
| I2C `0x10` reg `0x15` | Servo S2 angle | [maqueen.ts:311](https://github.com/DFRobot/pxt-maqueen/blob/master/maqueen.ts#L311) — `buf[0] = 0x15` for S2 |
| I2C `0x10` reg `0x00` | Motor M1 | [maqueen.ts:202–205](https://github.com/DFRobot/pxt-maqueen/blob/master/maqueen.ts#L202) — `buf[0] = 0x00; ...; pins.i2cWriteBuffer(0x10, buf)` inside `motorRun(M1, ...)` |
| I2C `0x10` reg `0x02` | Motor M2 | [maqueen.ts:208–211](https://github.com/DFRobot/pxt-maqueen/blob/master/maqueen.ts#L208) — `buf[0] = 0x02` for M2 |
| I2C `0x10` reg `0x32` | 4× RGB ambient LEDs | [maqueen.ts:659](https://github.com/DFRobot/pxt-maqueen/blob/master/maqueen.ts#L659) — `pins.i2cWriteNumber(I2CADDR, 0x32, NumberFormat.Int8LE)` inside the RGB write block |
| `IR receiver` (fixed) | NEC IR | [maqueenIR.cpp](https://github.com/DFRobot/pxt-maqueen/blob/master/maqueenIR.cpp) — C++ shim sets the pin internally; surfaced via `maqueen.IR_read()` in [maqueen.ts](https://github.com/DFRobot/pxt-maqueen/blob/master/maqueen.ts) |
| `P0` | Buzzer | **Not in pxt-maqueen.** Maqueen Lite v4 wires the on-board buzzer to `P0`, the micro:bit's default `music` library output. Confirmed by DFRobot's example sketches on the [wiki](https://wiki.dfrobot.com/rob0148-en/) and matches micro:bit V2's built-in speaker convention. |
| `P19` / `P20` | I2C SCL / SDA | **Not in pxt-maqueen.** Standard micro:bit edge-connector I2C pins per [tech.microbit.org/hardware/edgeconnector](https://tech.microbit.org/hardware/edgeconnector/); pxt-maqueen calls `pins.i2c*` which uses these by default. |
| `P5` / `P11` | Button A / B | **Not in pxt-maqueen.** Built into the micro:bit board itself, not the Maqueen carrier. |
| `P3, P4, P6, P7, P9, P10` | LED matrix columns | **Not in pxt-maqueen.** Belong to the micro:bit's built-in 5×5 LED display; usable as digital I/O only after `led.enable(false)`. |

**To re-verify:** clone the repo and grep for `DigitalPin.P` and `0x10`:

```bash
git clone https://github.com/DFRobot/pxt-maqueen
grep -nE "DigitalPin\.|0x10|0x14|0x15|0x32" pxt-maqueen/maqueen.ts
```

---

## How Maqueen Lab firmware uses these

| Verb (over BLE) | micro:bit code |
|---|---|
| `M:L,R` | `maqueen.motorRun(M1, dir, |L|)` + same for M2 |
| `STOP` | `maqueen.motorStop(All)` |
| `LED:i,s` | `maqueen.writeLED(i, s)` |
| `SRV:i,a` | `maqueen.servoRun(Si, a)` |
| `BUZZ:f,ms` | `music.playTone(f, ms)` |
| `LINE?` | `maqueen.readPatrol(L/R)` → `LINE:l,r` |
| `DIST?` | `maqueen.Ultrasonic(cm)` → `DIST:cm` |
| `IR?` | `maqueen.IR_read()` → `IR:code` |
| `RGB:i,r,g,b` | I2C write to 0x10 reg 0x32 |
| (auto) | `input.acceleration(X/Y/Z)` → `ACC:x,y,z` |

See [`firmware/v1-maqueen-lib.ts`](firmware/v1-maqueen-lib.ts) for the full implementation.

---

## Future: raw-pin firmware (v2)

Phase 2 firmware (`firmware/v2-raw-pins.ts`) will replace `maqueen.*` calls with direct `pins.*` and `pins.i2cWriteBuffer(...)` operations — same wire protocol, lower-level code for advanced learners. The Component Explorers will show both versions side-by-side in the code panel.
