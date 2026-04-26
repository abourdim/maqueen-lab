# Changelog

## v0.1.0 — 2026-04-26 (in progress)

Initial scaffold. Forked from [bit-playground](https://github.com/abourdim/bit-playground) v1.2.0.

### Added

- Project structure forked from bit-playground.
- Maqueen-specific config (`package.json`, `product.json`, `manifest.json`).
- Maqueen Lite v4 firmware scaffold (`firmware/v1-maqueen-lib.ts`) — BLE UART verbs with sequence + echo confirmation, USB serial mirror, boot banner.
- BLE scheduler wrapper (`js/ble-scheduler.js`) — wraps existing `js/ble.js` with sequence numbers, echo validation, coalescing, rate limiting, animation registry. **Does not modify `js/ble.js`.**
- Servo Explorer (pilot) — visual + calibration + sweep + code panel + auto-demo.

### Removed

- bit-playground's non-Maqueen 3D models (`arm.js`, `balance.js`, `buggy.js`, `weather.js`).
- bit-playground's docs (`docs/`) and Etsy package (will be regenerated for maqueen-app).
- bit-playground's makecode-extension scaffold (replaced with Maqueen-specific firmware).
- bit-playground branding from configs.

### Notes

- `js/ble.js` from bit-playground is reused **unchanged**. New code wraps it; never edits it.
- Firmware uses the `pxt-maqueen` MakeCode extension for hardware access.
- Same BLE UART wire protocol works with future raw-pin firmware (`firmware/v2-raw-pins.ts`).
