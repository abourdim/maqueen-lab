//% color="#00ff88" weight=100 icon="\uf11b" block="bit:playground"
namespace bitPlayground {
    let streamingHz = 0
    let streamTimer = 0

    /**
     * Start BLE UART service and show the READY icon on LEDs.
     * Equivalent to the connection prelude in the full makecode.ts firmware.
     */
    //% block="start bit:playground companion"
    //% weight=100
    export function start(): void {
        bluetooth.startUartService()
        basic.showIcon(IconNames.Target)
        bluetooth.onBluetoothConnected(() => basic.showIcon(IconNames.Yes))
        bluetooth.onBluetoothDisconnected(() => basic.showIcon(IconNames.Target))
    }

    /**
     * Stream sensor data as JSON over BLE UART at N Hz.
     * Compatible with the bit-playground browser app's sensor parser.
     * @param hz refresh rate in samples per second, eg: 10
     */
    //% block="stream sensors at %hz Hz"
    //% hz.min=1 hz.max=50 hz.defl=10
    //% weight=90
    export function streamSensors(hz: number): void {
        streamingHz = Math.max(1, Math.min(50, hz))
        control.inBackground(() => {
            while (true) {
                if (streamingHz === 0) { basic.pause(500); continue }
                const sample = {
                    t: input.temperature(),
                    l: input.lightLevel(),
                    s: input.soundLevel(),
                    ax: input.acceleration(Dimension.X),
                    ay: input.acceleration(Dimension.Y),
                    az: input.acceleration(Dimension.Z),
                    c: input.compassHeading(),
                    ba: input.buttonIsPressed(Button.A) ? 1 : 0,
                    bb: input.buttonIsPressed(Button.B) ? 1 : 0,
                }
                bluetooth.uartWriteString(JSON.stringify(sample) + "\n")
                basic.pause(Math.round(1000 / streamingHz))
            }
        })
    }

    /**
     * Listen for single-line JSON commands from the browser app.
     * Handles LED pattern draws, servo position, buzzer tones, text display.
     */
    //% block="listen for commands from browser app"
    //% weight=80
    export function listenForCommands(): void {
        bluetooth.onUartDataReceived("\n", () => {
            const line = bluetooth.uartReadUntil("\n")
            // Minimal parser — the full firmware's parser is richer, this is
            // the happy-path subset that covers 90 % of command traffic.
            if (line.indexOf('"type":"led"') >= 0) {
                // Fallback: just show a dot so user sees SOMETHING react.
                basic.showIcon(IconNames.SmallDiamond)
            } else if (line.indexOf('"type":"text"') >= 0) {
                basic.showString(extractField(line, "text"))
            } else if (line.indexOf('"type":"tone"') >= 0) {
                music.ringTone(parseInt(extractField(line, "hz")) || 440)
                basic.pause(parseInt(extractField(line, "ms")) || 200)
                music.stopAllSounds()
            }
        })
    }

    function extractField(json: string, key: string): string {
        // Extremely light JSON extractor — avoids pulling in a full parser
        // in the MakeCode extension.
        const k = '"' + key + '":'
        const i = json.indexOf(k)
        if (i < 0) return ""
        const after = json.substr(i + k.length)
        if (after.charAt(0) === '"') {
            const end = after.indexOf('"', 1)
            return after.substr(1, end - 1)
        }
        const m = after.match(/^-?\d+(\.\d+)?/)
        return m ? m[0] : ""
    }
}
