// bit-playground companion firmware entry point.
//
// A 3-line starter for users who want to drop this into their own MakeCode
// project. Boots BLE UART, advertises as "uBit-XXXX", streams sensors at
// 10 Hz, responds to LED / servo / sound commands from the browser app.
//
// Open the live browser panel at: https://abourdim.github.io/bit-playground/

bitPlayground.start()
bitPlayground.streamSensors(10)
bitPlayground.listenForCommands()
