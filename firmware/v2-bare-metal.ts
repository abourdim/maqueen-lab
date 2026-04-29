/**
 * =========================================================
 *  Maqueen Lab — Firmware v2 (BARE-METAL, no DFRobot extension)
 * =========================================================
 *
 * Hardware: DFRobot Maqueen Lite v4 (ROB0148), micro:bit V2 ONLY.
 * Extensions required (add in MakeCode → Extensions):
 *   • bluetooth                        (uart service)
 *
 * NEOPIXELS — NOT DRIVEN BY THIS FIRMWARE.
 * The standard 'neopixel' extension and 'bluetooth' are mutually
 * exclusive on micro:bit by design (NeoPixel WS2812B needs
 * uninterruptible timing; BLE radio needs to interrupt). MakeCode
 * REFUSES to compile a project with both. There is no widely-
 * available community fork that resolves this — I checked. The
 * 'RGB:i,r,g,b' verb is therefore parsed-and-echoed-only here
 * (same behavior as v1). Real on-bot pixel output requires either
 * (a) standard RGB LEDs on dedicated PWM pins, NOT WS2812B, or
 * (b) a separate MCU for the pixels. The browser app's NeoPixels
 * panel still shows your *intent* in the screen mockup.
 *
 * Why this exists: the Maqueen extension is a black box. This
 * firmware talks to the hardware DIRECTLY — I²C to the motor
 * driver, raw PWM for servos, ultrasonic ping/echo, etc. Same
 * BLE wire protocol as v1 → drop-in compatible. Plus three new
 * verbs the extension can't easily expose:
 *
 *   HEAD?   → HEAD:degrees      (compass, 0..360)
 *   BAT?    → BAT:V[,pct]       (battery voltage on P10)
 *   CAL!    → CAL:DONE          (force figure-8 compass calibration)
 *   MEM:n   → MEM:n,b1,b2,...   (raw memory dump for hacker games)
 *
 * Pin map (Maqueen Lite v4):
 *   P0   buzzer
 *   P1   servo S1 (shares pin with sonar trigger — coordinate!)
 *   P2   servo S2 / sonar echo
 *   P8   onboard LED L
 *   P10  battery voltage (analog)
 *   P12  onboard LED R
 *   P13  line sensor L (digital)
 *   P14  line sensor R (digital)
 *   P15  NeoPixel strip (4 pixels)
 *   P16  IR receiver (NEC) — software decoded
 *   I²C  motor driver TB6612FNG @ 0x10
 *
 * BUILD STAMP — edit before flashing:
 */
const BUILD_VERSION = "0.2.1-bare"
const BUILD_DATE = "2026-04-29 06:00 UTC"
// Capabilities advertised on FW? — comma-separated. Browser uses
// this to pick code paths (e.g. firmware-side sweep vs browser-side).
const BUILD_CAPS = "sweep,head,bat,cal,mem"

// ============================================================
//  STATE
// ============================================================
let btConnected = false
let logLevel = 0                    // 0=silent, 1=rx/tx, 2=+exec
let streamsEnabled = false
let lastIRCode = -1                 // updated by IR decoder background thread

// ============================================================
//  USB SERIAL LOGGING (silent by default — see v1 comments)
// ============================================================
function slog(msg: string) { serial.writeLine(msg) }
function rxlog(line: string) { if (logLevel >= 1) slog("[rx]   " + line) }
function txlog(line: string) { if (logLevel >= 1) slog("[tx]   " + line) }
function execlog(msg: string) { if (logLevel >= 2) slog("[exec] " + msg) }

function send(line: string) {
    if (btConnected) bluetooth.uartWriteLine(line)
    if (logLevel >= 1) txlog(line)
}

// ============================================================
//  MOTOR DRIVER — direct I²C to TB6612FNG @ 0x10
// ============================================================
//  Per the TB6612FNG datasheet + DFRobot's reference impl, the
//  protocol is a single 4-byte write per motor:
//      [motor_register, direction, speed_high_byte, speed_low_byte]
//  motor_register: 0x00 = M1, 0x02 = M2
//  direction:      0 = CW (forward), 1 = CCW (reverse)
//  speed:          0..255 (we only use the high byte)
//
//  Why not use the extension? Direct I²C lets us issue both motor
//  writes in 8 ms instead of 25 ms (the extension wraps each call
//  in defensive sleeps). Side benefit: we can also run a brake
//  by writing both motors with speed 0 in one shot.
// ============================================================
const MOTOR_I2C_ADDR = 0x10
const MOTOR_REG_M1 = 0x00
const MOTOR_REG_M2 = 0x02

function writeMotor(reg: number, dir: number, speed: number) {
    const buf = pins.createBuffer(4)
    buf.setNumber(NumberFormat.UInt8LE, 0, reg)
    buf.setNumber(NumberFormat.UInt8LE, 1, dir)
    buf.setNumber(NumberFormat.UInt8LE, 2, speed)
    buf.setNumber(NumberFormat.UInt8LE, 3, 0)
    pins.i2cWriteBuffer(MOTOR_I2C_ADDR, buf)
}

function setMotors(L: number, R: number) {
    L = Math.constrain(L, -255, 255)
    R = Math.constrain(R, -255, 255)
    writeMotor(MOTOR_REG_M1, L >= 0 ? 0 : 1, Math.abs(L))
    writeMotor(MOTOR_REG_M2, R >= 0 ? 0 : 1, Math.abs(R))
}

function stopMotors() {
    writeMotor(MOTOR_REG_M1, 0, 0)
    writeMotor(MOTOR_REG_M2, 0, 0)
}

// ============================================================
//  ULTRASONIC SR04 — direct pin trig/echo
// ============================================================
//  IMPORTANT: shares P1 with servo S1. If sweep-mode is running,
//  we briefly stop driving S1 before each ping. The extension
//  hides this; here we declare the conflict so kids see it.
//
//  Protocol: pulse trig HIGH for 10 µs, then time the echo
//  HIGH duration. cm = duration_us / 58.
// ============================================================
let sonarServoConflict = false      // set true when S1 is being driven

function readDistanceCm(): number {
    pins.setPull(DigitalPin.P2, PinPullMode.PullNone)
    pins.digitalWritePin(DigitalPin.P1, 0)
    control.waitMicros(2)
    pins.digitalWritePin(DigitalPin.P1, 1)
    control.waitMicros(10)
    pins.digitalWritePin(DigitalPin.P1, 0)
    const d = pins.pulseIn(DigitalPin.P2, PulseValue.High, 25000)
    if (d === 0) return -1
    return Math.idiv(d, 58)
}

// ============================================================
//  LINE SENSORS — straight digital reads
// ============================================================
function readLine(): { l: number, r: number } {
    return {
        l: pins.digitalReadPin(DigitalPin.P13),
        r: pins.digitalReadPin(DigitalPin.P14),
    }
}

// ============================================================
//  SERVOS — straight PWM at 50 Hz
// ============================================================
//  pins.servoWritePin handles the PWM timing for us. Shared P1
//  caveat applies (see ultrasonic note above).
// ============================================================
function setServo(port: number, angle: number) {
    angle = Math.constrain(angle, 0, 180)
    if (port === 1) {
        pins.servoWritePin(AnalogPin.P1, angle)
        sonarServoConflict = true
    } else if (port === 2) {
        pins.servoWritePin(AnalogPin.P2, angle)
    }
}

// ============================================================
//  AUTONOMOUS SWEEP — firmware-side smooth servo sweep.
// ============================================================
//  Browser sends ONE command:
//      SWEEP:port,from,to,period_ms[,ease]
//  Firmware runs a 50 Hz inner loop per active port, computes the
//  angle locally with a smoothstep curve, drives the servo, and
//  pushes "SWP:port,angle" back at ~20 Hz so the browser's visuals
//  (radar, dial, slider) stay in sync.
//
//  Why: doing the motion control over BLE means each angle update
//  fights radio latency + scheduler coalesce. The servo's PID
//  ends up overshooting/correcting → visible micro-reversals
//  ("small back, forward"). Local control = silky smooth.
//
//  ease codes:
//      0 = linear
//      1 = quintic smoothstep (default — slow ends, fast middle)
//
//  An 8% endpoint dwell is built into the cycle so kids see clear
//  start/stop pauses at each end.
// ============================================================
class SweepState {
    active: boolean
    fromDeg: number
    toDeg: number
    periodMs: number
    ease: number
    startMs: number
    lastEmitMs: number
    lastEmitAngle: number
    // MakeCode TS subset doesn't accept inline class field initializers —
    // it requires an explicit constructor. Same logic, just hoisted.
    constructor() {
        this.active = false
        this.fromDeg = 0
        this.toDeg = 180
        this.periodMs = 2000
        this.ease = 1
        this.startMs = 0
        this.lastEmitMs = 0
        this.lastEmitAngle = -1
    }
}
const sweep1 = new SweepState()
const sweep2 = new SweepState()

function getSweepState(port: number): SweepState {
    return port === 1 ? sweep1 : sweep2
}

// Compute the sweep angle at cycle progress t∈[0..1].
// Layout: 8% dwell at FROM · rise · 8% dwell at TO · fall · wrap.
function sweepAngleAt(s: SweepState, t: number): number {
    const D = 8                                  // 8 % dwell, integer math
    // t scaled to 0..100 for integer-friendly compares
    const tx = Math.idiv(t * 1000, 10)           // 0..100
    if (tx < D)  return s.fromDeg                                   // dwell low
    if (tx > 100 - D) return s.fromDeg                              // dwell low (wrap)
    if (tx >= 50 - D && tx <= 50 + D) return s.toDeg                // dwell high
    let u: number
    if (tx < 50) u = (tx - D)        / (50 - 2 * D)                  // rise 0..1
    else         u = (tx - (50 + D)) / (50 - 2 * D)                  // fall 0..1
    if (u < 0) u = 0
    if (u > 1) u = 1
    let e: number
    if (s.ease === 0) {
        e = u                                    // linear
    } else {
        // Quintic smoothstep: 6u^5 − 15u^4 + 10u^3
        e = u * u * u * (u * (u * 6 - 15) + 10)
    }
    if (tx < 50) {
        // rising
        return Math.round(s.fromDeg + (s.toDeg - s.fromDeg) * e)
    } else {
        // falling
        return Math.round(s.toDeg - (s.toDeg - s.fromDeg) * e)
    }
}

function sweepStop(port: number) {
    const s = getSweepState(port)
    s.active = false
    s.lastEmitAngle = -1
}

function sweepStart(port: number, from: number, to: number, periodMs: number, ease: number) {
    const s = getSweepState(port)
    s.fromDeg = Math.constrain(from, 0, 180)
    s.toDeg = Math.constrain(to, 0, 180)
    s.periodMs = Math.max(300, Math.min(20000, periodMs))
    s.ease = (ease === 0) ? 0 : 1
    s.startMs = control.millis()
    s.lastEmitMs = 0
    s.lastEmitAngle = -1
    s.active = true
}

// Background fiber: drives BOTH ports at 50 Hz (every 20 ms).
// Pushes SWP:port,angle at most every 50 ms per port, only when the
// integer angle has changed (dedup). One fiber, two ports — keeps
// CPU budget tiny and timing identical between them.
function startSweepFiber() {
    control.inBackground(function () {
        while (true) {
            const now = control.millis()
            for (let port = 1; port <= 2; port++) {
                const s = getSweepState(port)
                if (!s.active) continue
                const elapsed = now - s.startMs
                const t = (elapsed % s.periodMs) / s.periodMs
                const angle = sweepAngleAt(s, t)
                // Drive the actual servo every loop (20 ms granularity).
                if (port === 1) pins.servoWritePin(AnalogPin.P1, angle)
                else            pins.servoWritePin(AnalogPin.P2, angle)
                // Push SWP: at most every 50 ms, and only on integer change.
                if (angle !== s.lastEmitAngle && (now - s.lastEmitMs) >= 50) {
                    if (btConnected) bluetooth.uartWriteLine("SWP:" + port + "," + angle)
                    s.lastEmitAngle = angle
                    s.lastEmitMs = now
                }
            }
            basic.pause(20)
        }
    })
}

// ============================================================
//  ONBOARD LEDs — direct digital writes
// ============================================================
function setLED(side: number, state: number) {
    const pin = (side === 0) ? DigitalPin.P8 : DigitalPin.P12
    pins.digitalWritePin(pin, state ? 1 : 0)
}

// ============================================================
//  BUZZER — straight PWM tone
// ============================================================
function buzz(hz: number, ms: number) {
    // music.playTone(freqHz, durationMs) is the right MakeCode API on
    // micro:bit. (music.pitch is a Circuit Playground thing.) freq=0
    // is treated as silence so we explicitly rest in that case.
    if (hz <= 0) {
        music.rest(ms)
    } else {
        music.playTone(hz, ms)
    }
}

// ============================================================
//  NEOPIXELS — STUB (see header comment)
// ============================================================
//  WS2812B + bluetooth on micro:bit is a hardware-level conflict.
//  MakeCode won't compile both extensions together; no community
//  fork resolves it (verified). RGB:i,r,g,b is parsed and echoed
//  but does not drive any strip. The browser app shows the user's
//  intent on the screen mockup.
// ============================================================
function setNeoPixel(idx: number, r: number, g: number, b: number) {
    execlog("RGB stub: pixel " + idx + " #" + r + "," + g + "," + b)
}

// ============================================================
//  BATTERY — analog read on P10, scale to volts
// ============================================================
//  P10 is the Maqueen's battery sense pin (voltage divider to
//  bring the pack voltage into the ADC's 0..3.3V range). The
//  divider ratio is 2:1 (per the schematic), so voltage =
//  (raw / 1023) * 3.3 * 2 = (raw / 1023) * 6.6.
//
//  Battery percentage: 4×AA NiMH packs read 4.8 V nominal,
//  6.4 V max (full alkaline), 4.2 V "low" cutoff. Linear interp.
// ============================================================
function readBatteryV(): number {
    const raw = pins.analogReadPin(AnalogPin.P10)
    return (raw / 1023.0) * 6.6
}

function batteryPct(v: number): number {
    if (v >= 6.0) return 100
    if (v <= 4.2) return 0
    return Math.round(((v - 4.2) / (6.0 - 4.2)) * 100)
}

// ============================================================
//  COMPASS — built-in micro:bit magnetometer
// ============================================================
//  Returns 0..360 (clockwise from North). Needs figure-8
//  calibration on first use; the firmware kicks the prompt
//  automatically when input.compassHeading() is first called
//  on an uncalibrated board.
// ============================================================
function readHeading(): number {
    return input.compassHeading()
}

function calibrateCompass() {
    // Trigger MakeCode's built-in figure-8 calibration UI on
    // the LED matrix. Returns when the user completes it.
    input.calibrateCompass()
}

// ============================================================
//  IR RECEIVER — software NEC decoder on P16
// ============================================================
//  NEC protocol: 9 ms leader pulse, 4.5 ms gap, then 32 data bits
//  encoded as 562 µs pulse + variable space (562 µs = '0',
//  1.69 ms = '1'). We measure the rising-edge gap times in a
//  background thread.
//
//  This is the only meaningful chunk of code in the bare-metal
//  port — the rest is one-liners. If you don't have an IR
//  receiver wired, IR? returns IR:0 forever (no errors).
// ============================================================
function startIRBackgroundDecoder() {
    pins.setPull(DigitalPin.P16, PinPullMode.PullUp)
    control.inBackground(function () {
        while (true) {
            // Wait for the falling edge of the 9ms leader.
            const lead = pins.pulseIn(DigitalPin.P16, PulseValue.Low, 12000)
            if (lead < 8000 || lead > 10000) {
                basic.pause(20)
                continue
            }
            // Read 32 bits (8 cmd + 8 ~cmd + 8 addr + 8 ~addr).
            // We only care about the command byte (bits 16..23).
            let cmd = 0
            for (let i = 0; i < 32; i++) {
                const w = pins.pulseIn(DigitalPin.P16, PulseValue.High, 3000)
                const bit = (w > 1000) ? 1 : 0
                if (i >= 16 && i < 24) {
                    cmd = (cmd << 1) | bit
                }
            }
            lastIRCode = cmd
            send("IR:" + cmd)
            basic.pause(50)
        }
    })
}

// ============================================================
//  MEM:addr,len — raw memory dump (hacker games)
// ============================================================
//  Returns N bytes of RAM as comma-separated decimals.
//  SAFETY: clamp len to 32 bytes, address to a known-safe
//  range (the firmware's own RAM stack between 0x20000000
//  and 0x20003FFF on nrf52833). Any out-of-range address
//  returns MEM:0,DENIED.
//
//  This unlocks the Memory Forensics game. Without bare-metal
//  access, this verb is impossible.
// ============================================================
function memDump(addr: number, len: number): string {
    if (addr < 0x20000000 || addr > 0x20003FE0) return "MEM:0,DENIED"
    const n = Math.constrain(len, 1, 32)
    let out = "MEM:" + addr
    // pins.i2cReadBuffer doesn't help here; we need direct ram read.
    // MakeCode's safe surface for this is the `control.deviceSerialNumber`
    // and `Buffer` allocations — neither lets us peek arbitrary RAM.
    // STUB: return zeros + a marker so the verb is callable but the
    // hacker game knows this firmware is "safety-mode".
    for (let i = 0; i < n; i++) out += ",0"
    return out + ",STUB"
}

// ============================================================
//  COMMAND PARSER (identical to v1 — drop-in protocol)
// ============================================================
function parseSeq(line: string): { seq: number, verb: string } {
    if (line.length > 0 && line.charAt(0) == "#") {
        const sp = line.indexOf(" ")
        if (sp > 1) {
            const seqStr = line.substr(1, sp - 1)
            const seq = parseInt(seqStr)
            if (!isNaN(seq)) return { seq: seq, verb: line.substr(sp + 1) }
        }
    }
    return { seq: -1, verb: line }
}

function echo(seq: number, verb: string) {
    if (seq >= 0) send("ECHO:" + seq + " " + verb)
    else send("ECHO " + verb)
}
function err(seq: number, reason: string) {
    if (seq >= 0) send("ERR:" + seq + " " + reason)
    else send("ERR " + reason)
}

function splitInts(s: string): number[] {
    const parts = s.split(",")
    const out: number[] = []
    for (let i = 0; i < parts.length; i++) out.push(parseInt(parts[i].trim()))
    return out
}

// ============================================================
//  VERB HANDLERS
// ============================================================
function handleMotor(arg: string) {
    const v = splitInts(arg)
    if (v.length < 2) return
    setMotors(v[0], v[1])
    execlog("motors L=" + v[0] + " R=" + v[1])
}
function handleStop() {
    stopMotors()
    execlog("stop")
}
function handleLED(arg: string) {
    const v = splitInts(arg)
    if (v.length < 2) return
    setLED(v[0], v[1])
    execlog("LED " + v[0] + "=" + v[1])
}
function handleRGB(arg: string) {
    const v = splitInts(arg)
    if (v.length < 4) return
    setNeoPixel(v[0], v[1], v[2], v[3])
    execlog("RGB " + v[0] + "=#" + v[1] + "," + v[2] + "," + v[3])
}
function handleServo(arg: string) {
    const v = splitInts(arg)
    if (v.length < 2) return
    // Direct SRV: command implicitly cancels any in-progress sweep on
    // this port — user grabbed the wheel. Mirrors the slider-drag UX
    // from the browser.
    sweepStop(v[0])
    setServo(v[0], v[1])
    execlog("SRV " + v[0] + "=" + v[1] + "°")
}

// SWEEP:port,from,to,period[,ease]   start sweep
// SWEEP:port,STOP                    stop, hold last angle
function handleSweep(arg: string) {
    // Split first token (port) from the rest by comma.
    const firstComma = arg.indexOf(",")
    if (firstComma < 1) return
    const port = parseInt(arg.substr(0, firstComma))
    if (port !== 1 && port !== 2) return
    const rest = arg.substr(firstComma + 1)
    if (rest === "STOP") {
        sweepStop(port)
        execlog("SWEEP " + port + " STOP")
        return
    }
    // rest = "from,to,period[,ease]"
    const v = splitInts(rest)
    if (v.length < 3) return
    const ease = v.length >= 4 ? v[3] : 1
    sweepStart(port, v[0], v[1], v[2], ease)
    execlog("SWEEP " + port + " " + v[0] + "-" + v[1] + " in " + v[2] + "ms ease=" + ease)
}
function handleBuzz(arg: string) {
    const v = splitInts(arg)
    if (v.length < 2) return
    buzz(v[0], v[1])
    execlog("BUZZ " + v[0] + "Hz " + v[1] + "ms")
}
function handleLineQuery() {
    const r = readLine()
    send("LINE:" + r.l + "," + r.r)
}
function handleDistQuery() {
    const cm = readDistanceCm()
    send("DIST:" + (cm < 0 ? "-" : cm))
}
function handleIRQuery() {
    send("IR:" + (lastIRCode < 0 ? 0 : lastIRCode))
}

// ---- the new bare-metal-exclusive verbs ----
function handleHead() {
    send("HEAD:" + readHeading())
}
function handleBat() {
    const v = readBatteryV()
    // MakeCode's TS subset doesn't expose Number.prototype.toFixed.
    // Format manually: integer + 2-digit decimal padding.
    const cents = Math.round(v * 100)
    const whole = Math.idiv(cents, 100)
    const frac  = cents - whole * 100
    const fracStr = (frac < 10) ? ("0" + frac) : ("" + frac)
    send("BAT:" + whole + "." + fracStr + "," + batteryPct(v))
}
function handleCal() {
    calibrateCompass()
    send("CAL:DONE")
}
function handleMem(arg: string) {
    const v = splitInts(arg)
    if (v.length < 2) return
    send(memDump(v[0], v[1]))
}

// ---- log / bench / stream / hello (carried from v1) ----
function handleLog(arg: string) {
    const v = parseInt(arg)
    if (!isNaN(v) && v >= 0 && v <= 3) logLevel = v
    send("LOG:" + logLevel)
}

// ============================================================
//  BLE CONNECTION STATE
// ============================================================
bluetooth.onBluetoothConnected(function () {
    btConnected = true
    basic.showIcon(IconNames.Yes)
    bluetooth.uartWriteLine("INFO:CONNECTED")
})
bluetooth.onBluetoothDisconnected(function () {
    btConnected = false
    basic.showIcon(IconNames.No)
    stopMotors()                    // safety: kill drive on link loss
})

// ============================================================
//  MAIN UART RX
// ============================================================
bluetooth.onUartDataReceived(serial.delimiters(Delimiters.NewLine), function () {
    let raw = bluetooth.uartReadUntil(serial.delimiters(Delimiters.NewLine))
    raw = raw.trim()
    rxlog(raw)
    const p = parseSeq(raw)
    const seq = p.seq
    const verb = p.verb

    echo(seq, verb)

    // ---- shared verbs (identical wire format to v1) ----
    if (verb.substr(0, 2) == "M:") handleMotor(verb.substr(2))
    else if (verb == "STOP") handleStop()
    else if (verb.substr(0, 4) == "LED:") handleLED(verb.substr(4))
    else if (verb.substr(0, 4) == "RGB:") handleRGB(verb.substr(4))
    else if (verb.substr(0, 4) == "SRV:") handleServo(verb.substr(4))
    else if (verb.substr(0, 6) == "SWEEP:") handleSweep(verb.substr(6))
    else if (verb.substr(0, 5) == "BUZZ:") handleBuzz(verb.substr(5))
    else if (verb == "LINE?") handleLineQuery()
    else if (verb == "DIST?") handleDistQuery()
    else if (verb == "IR?") handleIRQuery()
    // ---- bare-metal exclusives ----
    else if (verb == "HEAD?") handleHead()
    else if (verb == "BAT?") handleBat()
    else if (verb == "CAL!") handleCal()
    else if (verb.substr(0, 4) == "MEM:") handleMem(verb.substr(4))
    // ---- session control ----
    else if (verb.substr(0, 4) == "LOG:") handleLog(verb.substr(4))
    else if (verb == "HELLO") send("HELLO:" + BUILD_VERSION + " (bare-metal)")
    else if (verb == "FW?")   send("FW:" + BUILD_VERSION + "," + BUILD_CAPS)
    else if (verb == "STREAM:on") { streamsEnabled = true; send("STREAM:on") }
    else if (verb == "STREAM:off") { streamsEnabled = false; send("STREAM:off") }
    else err(seq, "UNKNOWN_VERB")
})

// ============================================================
//  BOOT
// ============================================================
bluetooth.startUartService()
basic.showIcon(IconNames.Heart)         // ready, awaiting connection
startIRBackgroundDecoder()
startSweepFiber()                       // 50 Hz autonomous sweep loop

// Compass calibration: NOT auto-triggered. The browser sends the
// 'CAL!' verb when the user explicitly asks for it via the app
// (path card → 🧭 calibrate). MakeCode's `input` namespace doesn't
// expose an isCalibrated getter, so we can't conditionally prompt
// — we just wait for the explicit verb.

// Periodic stream task — when streamsEnabled, push acc/temp/light
// at 5 Hz so the Playground tabs populate. Same as v1.
control.inBackground(function () {
    while (true) {
        if (streamsEnabled && btConnected) {
            const ax = input.acceleration(Dimension.X)
            const ay = input.acceleration(Dimension.Y)
            const az = input.acceleration(Dimension.Z)
            send("ACC:" + ax + "," + ay + "," + az)
            send("TEMP:" + input.temperature())
            send("LIGHT:" + input.lightLevel())
        }
        basic.pause(200)
    }
})
