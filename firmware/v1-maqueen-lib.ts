/**
 * =========================================================
 *  Maqueen Lab — Firmware v1 (uses pxt-maqueen library)
 * =========================================================
 *
 * Hardware: DFRobot Maqueen Lite v4 (ROB0148)
 * Extensions required (add in MakeCode → Extensions):
 *   • pxt-maqueen     (https://github.com/DFRobot/pxt-maqueen)
 *
 * OPTIONAL — 4× RGB ambient LEDs:
 *   The standard 'neopixel' extension CONFLICTS with 'bluetooth' on
 *   micro:bit; MakeCode blocks adding both. By default this firmware
 *   ships WITHOUT the neopixel call — RGB:i,r,g,b commands are
 *   accepted and echoed but only logged to USB serial (no visible
 *   effect on the strip).
 *
 *   To enable real RGB output:
 *     1. Try a BLE-safe NeoPixel fork in Extensions, e.g.:
 *          https://github.com/Bohwaz/pxt-neopixel
 *          https://github.com/openblockcc/pxt-neopixel-ble
 *     2. Uncomment the 'NEOPIXEL BLOCK' below.
 *     3. Re-flash.
 *
 * BLE UART wire protocol — sequence-numbered, echo-confirmed.
 *
 * COMMANDS (browser → micro:bit):
 *   #N M:L,R                 motors, signed -255..+255 each
 *   #N STOP                  motor brake
 *   #N LED:i,s               i=0|1 (left|right), s=0|1
 *   #N RGB:i,r,g,b           i=0..3 or *  (4 RGB ambient LEDs)
 *   #N SRV:i,a               i=1|2, a=0..180
 *   #N BUZZ:f,ms             f=Hz (0 = off), ms=duration
 *   #N LINE?                 → reply LINE:l,r
 *   #N DIST?                 → reply DIST:cm
 *   #N IR?                   → reply IR:code
 *   #N LOG:level             0=silent, 1=rx/tx, 2=+exec, 3=+sensor polls
 *   #N BENCH:PING            → reply BENCH:PONG (latency check)
 *   #N BENCH:RESET           reset bench counters
 *   #N ADDON:LIST            → reply ADDON:none (stubbed)
 *   #N ADDON:READ:<port>     → reply ADDON:<port>:0 (stubbed)
 *   #N I2C:SCAN              → reply I2C:0x10 (stubbed — only motor driver)
 *   #N HELLO                 connection check, replies HELLO:<ver>
 *
 * REPLIES (micro:bit → browser):
 *   ECHO:N <verb>            ack of received-and-parsed command
 *   <reply line>             value reply (LINE:l,r, DIST:cm, IR:code, etc.)
 *   ACC:x,y,z                accelerometer, ~20 Hz on change
 *   IR:code                  pushed when IR remote pressed
 *   INFO:CONNECTED           on BLE connect
 *   INFO:DISCONNECTED        on BLE disconnect
 *   ERR:N <reason>           command parse/exec error for seq N
 *
 * USB SERIAL (115200 baud) — mirrors everything for debugging.
 *
 * BUILD STAMP — edit these two lines before flashing:
 */
const BUILD_VERSION = "0.1.21"
const BUILD_DATE = "2026-04-26 18:00 UTC"

// ---------- state ----------
let btConnected = false
let logLevel = 1                    // 0=silent, 1=rx/tx, 2=+exec, 3=+sensor polls
let lastAcc = [0, 0, 0]
let accDeadband = 30                // mg
let benchSent = 0
let benchEcho = 0

// ---------- utility: log to USB serial ----------
function slog(msg: string) {
    serial.writeLine(msg)
}

function rxlog(line: string) {
    if (logLevel >= 1) slog("[rx]   " + line)
}

function txlog(line: string) {
    if (logLevel >= 1) slog("[tx]   " + line)
}

function execlog(msg: string) {
    if (logLevel >= 2) slog("[exec] " + msg)
}

// ---------- send line on BLE + serial mirror ----------
function send(line: string) {
    if (btConnected) bluetooth.uartWriteLine(line)
    txlog(line)
}

// ---------- boot banner ----------
function bootBanner() {
    slog("")
    slog("=========================================================")
    slog("[boot] Maqueen Lab firmware v" + BUILD_VERSION + " built " + BUILD_DATE)
    slog("[boot] hardware: Maqueen Lite v4 (ROB0148)")
    slog("[boot] BLE UART ready — waiting for connection")
    slog("=========================================================")
}

// ---------- BLE connection state ----------
bluetooth.onBluetoothConnected(function () {
    btConnected = true
    basic.showIcon(IconNames.Yes)
    bluetooth.uartWriteLine("INFO:CONNECTED")
    slog("[ble]  connected")
})

bluetooth.onBluetoothDisconnected(function () {
    btConnected = false
    basic.showIcon(IconNames.No)
    slog("[ble]  disconnected")
})

// ---------- command parser ----------
// Parses optional leading "#N " sequence number, returns [seq, verb] or [-1, full]
function parseSeq(line: string): { seq: number, verb: string } {
    if (line.length > 0 && line.charAt(0) == "#") {
        let sp = line.indexOf(" ")
        if (sp > 1) {
            let seqStr = line.substr(1, sp - 1)
            let seq = parseInt(seqStr)
            if (!isNaN(seq)) {
                return { seq: seq, verb: line.substr(sp + 1) }
            }
        }
    }
    return { seq: -1, verb: line }
}

// ---------- send echo for a sequence ----------
function echo(seq: number, verb: string) {
    if (seq >= 0) send("ECHO:" + seq + " " + verb)
    else send("ECHO " + verb)
}

function err(seq: number, reason: string) {
    if (seq >= 0) send("ERR:" + seq + " " + reason)
    else send("ERR " + reason)
}

// ---------- helpers: parse comma-separated ints ----------
function splitInts(s: string): number[] {
    let parts = s.split(",")
    let out: number[] = []
    for (let i = 0; i < parts.length; i++) {
        out.push(parseInt(parts[i].trim()))
    }
    return out
}

// ---------- verb handlers ----------
// M:L,R — motors signed -255..255
function handleMotor(arg: string) {
    let v = splitInts(arg)
    if (v.length < 2) return
    let L = Math.constrain(v[0], -255, 255)
    let R = Math.constrain(v[1], -255, 255)
    let dirL = L >= 0 ? maqueen.Dir.CW : maqueen.Dir.CCW
    let dirR = R >= 0 ? maqueen.Dir.CW : maqueen.Dir.CCW
    maqueen.motorRun(maqueen.Motors.M1, dirL, Math.abs(L))
    maqueen.motorRun(maqueen.Motors.M2, dirR, Math.abs(R))
    execlog("motors L=" + L + " R=" + R)
}

function handleStop() {
    maqueen.motorStop(maqueen.Motors.All)
    execlog("motors STOP")
}

// LED:i,s
function handleLED(arg: string) {
    let v = splitInts(arg)
    if (v.length < 2) return
    let led = v[0] == 0 ? maqueen.LED.LEDLeft : maqueen.LED.LEDRight
    let sw = v[1] == 0 ? maqueen.LEDswitch.turnOff : maqueen.LEDswitch.turnOn
    maqueen.writeLED(led, sw)
    execlog("LED " + v[0] + "=" + v[1])
}

// RGB:i,r,g,b — i=0..3 or * for all
// DEFAULT: stub (logs to serial only) — no neopixel dependency so the
// firmware compiles without the neopixel extension. See file header for
// how to enable real RGB output.
function handleRGB(arg: string) {
    let parts = arg.split(",")
    if (parts.length < 4) return
    let r = parseInt(parts[1])
    let g = parseInt(parts[2])
    let b = parseInt(parts[3])
    execlog("RGB " + parts[0] + " = " + r + "," + g + "," + b + "  (stub — no neopixel)")
}

// ============================================================
// NEOPIXEL BLOCK — uncomment ONLY if you have a BLE-safe neopixel
// extension installed (e.g. Bohwaz/pxt-neopixel). Then DELETE the stub
// handleRGB above so this version is used instead.
// ============================================================
// let rgbStrip: neopixel.Strip = null
// function rgbInit() {
//     if (rgbStrip == null) {
//         rgbStrip = neopixel.create(DigitalPin.P15, 4, NeoPixelMode.RGB)
//         rgbStrip.setBrightness(80)
//     }
// }
// function handleRGB(arg: string) {
//     let parts = arg.split(",")
//     if (parts.length < 4) return
//     rgbInit()
//     let r = Math.constrain(parseInt(parts[1]), 0, 255)
//     let g = Math.constrain(parseInt(parts[2]), 0, 255)
//     let b = Math.constrain(parseInt(parts[3]), 0, 255)
//     let color = neopixel.rgb(r, g, b)
//     if (parts[0] == "*") {
//         for (let i = 0; i < 4; i++) rgbStrip.setPixelColor(i, color)
//     } else {
//         let idx = Math.constrain(parseInt(parts[0]), 0, 3)
//         rgbStrip.setPixelColor(idx, color)
//     }
//     rgbStrip.show()
//     execlog("RGB " + parts[0] + " = " + r + "," + g + "," + b)
// }

// SRV:i,a
function handleServo(arg: string) {
    let v = splitInts(arg)
    if (v.length < 2) return
    let port = v[0] == 1 ? maqueen.Servos.S1 : maqueen.Servos.S2
    let angle = Math.constrain(v[1], 0, 180)
    maqueen.servoRun(port, angle)
    // Broadcast position so bit-playground's servo gauges + 3D arm reflect it
    if (v[0] == 1) send("SERVO1_POS:" + angle)
    else send("SERVO2_POS:" + angle)
    execlog("SRV " + v[0] + "=" + angle)
}

// BUZZ:f,ms
function handleBuzz(arg: string) {
    let v = splitInts(arg)
    if (v.length < 1) return
    let freq = v[0]
    let ms = v.length > 1 ? v[1] : 200
    if (freq <= 0) {
        music.stopAllSounds()
        execlog("BUZZ off")
    } else {
        music.playTone(freq, ms)
        execlog("BUZZ " + freq + "Hz " + ms + "ms")
    }
}

// LINE?
function handleLineQuery() {
    let l = maqueen.readPatrol(maqueen.Patrol.PatrolLeft)
    let r = maqueen.readPatrol(maqueen.Patrol.PatrolRight)
    send("LINE:" + l + "," + r)
    if (logLevel >= 3) execlog("LINE l=" + l + " r=" + r)
}

// DIST?
function handleDistQuery() {
    // pxt-maqueen v1.7.16: Ultrasonic() takes no args, returns cm directly
    let cm = maqueen.Ultrasonic()
    send("DIST:" + cm)
    if (logLevel >= 3) execlog("DIST cm=" + cm)
}

// IR? — STUBBED (see setupIR comment below for re-enabling)
let lastIRCode = 0
function handleIRQuery() {
    send("IR:" + lastIRCode)
    if (logLevel >= 3) execlog("IR code=" + lastIRCode + "  (stub)")
}

// IR setup — STUBBED to avoid extension conflicts.
//
// The `IR` namespace is provided by BOTH:
//   • `pxt-dfrobot_newir` v0.0.4 (auto-pulled by pxt-maqueen v1.7.16)
//   • Some standalone `ir` extensions (e.g. v0.0.2)
// When both are loaded MakeCode hits an internal '!!proc || !bin.finalPass'
// assertion failure during finalPass.
//
// To enable real IR support:
//   1. Open MakeCode → Extensions
//   2. REMOVE any standalone 'ir' extension (only maqueen + bluetooth +
//      microphone + core + radio should be listed)
//   3. Uncomment the 'IR BLOCK' below + delete the empty setupIR stub
//   4. Re-flash
function setupIR() {
    // no-op
}

// ============================================================
// IR BLOCK — uncomment after removing any standalone 'ir' extension
// (see comment above). Replaces the stub setupIR() above.
// ============================================================
// function setupIR() {
//     IR.IR_init()
//     IR.IR_callbackUser(function () {
//         let code = IR.IR_read()
//         if (code != 0) {
//             lastIRCode = code
//             if (btConnected) send("IR:" + code)
//             execlog("IR press code=" + code)
//         }
//     })
// }

// LOG:n
function handleLog(arg: string) {
    let n = parseInt(arg)
    if (!isNaN(n)) {
        logLevel = Math.constrain(n, 0, 3)
        execlog("logLevel=" + logLevel)
    }
}

// BENCH:PING / BENCH:RESET
function handleBench(arg: string) {
    if (arg == "PING") {
        send("BENCH:PONG")
    } else if (arg == "RESET") {
        benchSent = 0
        benchEcho = 0
        send("BENCH:RESET")
    }
}

// ADDON stubs (v0.1.0 reserves the verb namespace)
function handleAddon(arg: string) {
    if (arg == "LIST") send("ADDON:none")
    else if (arg.substr(0, 5) == "READ:") {
        let port = arg.substr(5)
        send("ADDON:" + port + ":0")
    }
}

// I2C stubs
function handleI2C(arg: string) {
    if (arg == "SCAN") send("I2C:0x10")
    else send("I2C:NOT_IMPL")
}

// ---------- main UART RX ----------
bluetooth.onUartDataReceived(serial.delimiters(Delimiters.NewLine), function () {
    let raw = bluetooth.uartReadUntil(serial.delimiters(Delimiters.NewLine))
    raw = raw.trim()
    rxlog(raw)

    let p = parseSeq(raw)
    let seq = p.seq
    let verb = p.verb

    // every received command gets echoed first
    echo(seq, verb)

    // dispatch
    if (verb.substr(0, 2) == "M:") {
        handleMotor(verb.substr(2))
    } else if (verb == "STOP") {
        handleStop()
    } else if (verb.substr(0, 4) == "LED:") {
        handleLED(verb.substr(4))
    } else if (verb.substr(0, 4) == "RGB:") {
        handleRGB(verb.substr(4))
    } else if (verb.substr(0, 4) == "SRV:") {
        handleServo(verb.substr(4))
    } else if (verb.substr(0, 5) == "BUZZ:") {
        handleBuzz(verb.substr(5))
    } else if (verb == "LINE?") {
        handleLineQuery()
    } else if (verb == "DIST?") {
        handleDistQuery()
    } else if (verb == "IR?") {
        handleIRQuery()
    } else if (verb.substr(0, 4) == "LOG:") {
        handleLog(verb.substr(4))
    } else if (verb.substr(0, 6) == "BENCH:") {
        handleBench(verb.substr(6))
    } else if (verb.substr(0, 6) == "ADDON:") {
        handleAddon(verb.substr(6))
    } else if (verb.substr(0, 4) == "I2C:") {
        handleI2C(verb.substr(4))
    } else if (verb == "HELLO") {
        send("HELLO:" + BUILD_VERSION)
    }
    // ---- bit-playground bridge verbs (so existing UI tabs work) ----
    else if (verb.substr(0, 5) == "TEXT:") {
        let msg = verb.substr(5)
        if (msg.length > 0) basic.showString(msg)
        execlog("TEXT " + msg)
    } else if (verb.substr(0, 4) == "CMD:") {
        handleIcon(verb.substr(4))
    } else if (verb.substr(0, 7) == "SERVO1:") {
        handleServo("1," + verb.substr(7))
    } else if (verb.substr(0, 7) == "SERVO2:") {
        handleServo("2," + verb.substr(7))
    } else if (verb.substr(0, 4) == "TAB:") {
        // tab-change notification — silent ack
        execlog("tab=" + verb.substr(4))
    } else if (verb.substr(0, 9) == "SIMULATE:") {
        // ignore — bit-playground simulator (graph demo data)
    } else if (verb.substr(0, 4) == "CAL:") {
        // calibration request (e.g. CAL:COMPASS) — minimal ack
        send("CAL:" + verb.substr(4) + ":DONE")
    } else if (verb.substr(0, 6) == "OTHER:") {
        // bit-playground "Others" tab commands — ack silently
        send("OTHER:ACK:" + verb.substr(6))
    } else if (verb.substr(0, 3) == "LM:") {
        // 5x5 LED matrix hex — bit-playground specific, not implemented yet
        execlog("LM (not impl): " + verb.substr(3))
    } else {
        err(seq, "UNKNOWN_VERB")
    }
})

// ---------- icon dispatch (bit-playground CMD: bridge) ----------
function handleIcon(name: string) {
    if (name == "HEART") basic.showIcon(IconNames.Heart)
    else if (name == "SMILE") basic.showIcon(IconNames.Happy)
    else if (name == "SAD") basic.showIcon(IconNames.Sad)
    else if (name == "FIRE") basic.showIcon(IconNames.Fabulous)
    else if (name == "UP") basic.showArrow(ArrowNames.North)
    else if (name == "DOWN") basic.showArrow(ArrowNames.South)
    else if (name == "LEFT") basic.showArrow(ArrowNames.West)
    else if (name == "RIGHT") basic.showArrow(ArrowNames.East)
    else if (name == "CLEAR") basic.clearScreen()
    execlog("icon=" + name)
}

// ---------- accelerometer streaming (~20 Hz, on change) ----------
basic.forever(function () {
    if (btConnected) {
        let x = input.acceleration(Dimension.X)
        let y = input.acceleration(Dimension.Y)
        let z = input.acceleration(Dimension.Z)
        let dx = Math.abs(x - lastAcc[0])
        let dy = Math.abs(y - lastAcc[1])
        let dz = Math.abs(z - lastAcc[2])
        if (dx > accDeadband || dy > accDeadband || dz > accDeadband) {
            lastAcc = [x, y, z]
            send("ACC:" + x + "," + y + "," + z)
        }
    }
    basic.pause(50)
})

// ---------- temperature streaming (~1 Hz, on change) ----------
let lastTemp = -999
basic.forever(function () {
    if (btConnected) {
        let t = input.temperature()
        if (t != lastTemp) {
            lastTemp = t
            send("TEMP:" + t)
        }
    }
    basic.pause(1000)
})

// ---------- light + sound streaming (~3 Hz, on change) ----------
// ---------- light streaming only (V1+V2) ----------
// soundLevel + onLogoEvent are V2-only — they sometimes trigger
// MakeCode's '!!proc || !bin.finalPass' assertion when target version
// resolution drifts. Removed for stability. Compass also wrapped in
// the same forever loop for fewer concurrent fibers.
let lastLight = -1
let lastCompass = -1
basic.forever(function () {
    if (btConnected) {
        let l = input.lightLevel()
        if (Math.abs(l - lastLight) > 4) {
            lastLight = l
            send("LIGHT:" + l)
        }
        let h = input.compassHeading()
        if (h >= 0 && Math.abs(h - lastCompass) > 2) {
            lastCompass = h
            send("COMPASS:" + h)
        }
    }
    basic.pause(300)
})

// ---------- buttons (poll for press/release; onButtonReleased is not in pxt-microbit) ----------
let lastBtnA = false
let lastBtnB = false
basic.forever(function () {
    if (btConnected) {
        let a = input.buttonIsPressed(Button.A)
        let b = input.buttonIsPressed(Button.B)
        if (a != lastBtnA) {
            lastBtnA = a
            send("BTN:A:" + (a ? 1 : 0))
        }
        if (b != lastBtnB) {
            lastBtnB = b
            send("BTN:B:" + (b ? 1 : 0))
        }
    }
    basic.pause(50)
})

// ---------- start ----------
// Only start UART — accelerometer/temp/etc. are streamed manually via
// uartWriteLine, no need for the heavyweight BLE characteristic services
// (which compound with maqueen + microphone + IR libs to overflow
// micro:bit V1's RAM and trigger MakeCode's '!!proc || !bin.finalPass'
// assertion).
bluetooth.startUartService()
basic.showIcon(IconNames.No)
setupIR()
bootBanner()
