# Maqueen Lab — Roadmap

> **Phase 1 (10 + 10 = 20 items) is complete as of v0.1.60.** Phase 2 below
> shifts focus from *features* → *reach, hardening, depth*. Pick whichever
> chunk fits the next session — each item is self-contained.

---

## ✅ Phase 1 — Shipped (v0.1.0 → v0.1.60)

The original "20 things to ship next: 10 app improvements + 10 educational
games" — **all checked**. Open the [Changelog](CHANGELOG.html) for the full
release-by-release breakdown. Open the [labs wishlist](../labs/wishlist.html)
to vote on new ideas; the next batch is curated from there.

### App improvements (10/10) — done

- [x] 1. Voice commands · [x] 2. Tilt-to-drive · [x] 3. AI session summary ·
  [x] 4. Time-lapse export · [x] 5. Drag-to-trace autopilot ·
  [x] 6. AR webcam overlay · [x] 7. Robot personalities ·
  [x] 8. Battery indicator · [x] 9. Telemetry export · [x] 10. 2-robot pairing

### Educational games (10/10) — done

- [x] 1. SLAM the Room · [x] 2. Echo Hunt · [x] 3. Maze Runner ·
  [x] 4. Buzz the Tune · [x] 5. Simon Says NeoPixel ·
  [x] 6. Math the Distance · [x] 7. Robot Soccer ·
  [x] 8. Line Follower Race · [x] 9. PWM Lab · [x] 10. Morse Decoder

### Bonus shipped during Phase 1

- [x] **8 single-purpose Labs** (`labs/`): Joystick · Distance · Music ·
  Servos · IR · Lights · Vision · Co-Pilot
- [x] **Right-rail Message Log** in every Lab, faithful to the main app's
  `> #N VERB` / `< ECHO` format
- [x] **Draggable cockpit FABs** (Connect / Labs / Stop) with localStorage
  position persistence
- [x] **Workshops surface**: bilingual manual, booklet, cheat-cards,
  energizers, hub
- [x] **Kid-attracting flyer + poster** (FR, 8 ans+) with comic bursts,
  real QR codes, mobile scale-to-fit
- [x] **Brand sweep** `ROBI-9 LAB → MAQUEEN LAB` across HTML/CSS/JS
- [x] **Auto-rendered HTML for every `.md`** (`docs/_md-render.js`)
- [x] **Defensive theme sanitizer** in every lab + hub

---

## 🎯 Phase 2A — Reach (turn product into adoption)

The app is great; almost nobody knows it exists yet.

| # | Item | Why now |
|---|------|---------|
| 1 | ~~**i18n parity for the main cockpit** (FR + AR)~~ — **DONE.** `js/lang.js` (1932 LoC) + 304 `data-i18n` attrs + EN/FR/AR dicts (~600 lines each) + 3-flag picker + RTL + localStorage. All HTML surfaces are trilingual. |
| 2 | **Etsy package v1 ready-to-list** | `etsy-package/` is half-baked. Finish: hero photos, listing copy locked, quickstart card. This is your distribution. |
| 3 | **Teacher kit** — 1-pager lesson plan + rubric per Lab | 8 labs × 1 lesson plan = 8 pages. Sells to schools instantly. |
| 4 | **Print-quality flyer/poster export** (PDF) | Add a "Save as PDF" CTA + verified A4 print preview. Right now teachers have to know to Ctrl+P. |
| 5 | **Curriculum-aligned challenge set** (Cycle 3/4 FR · K-8 EN) | Map existing Labs/games to formal learning objectives. Teachers need this verbatim. |

### Checklist
- [x] 1. i18n parity — main cockpit (FR + AR) — already shipped via `js/lang.js`
- [ ] 2. Etsy package v1 — listing-ready
- [x] 3. Teacher kit — 8 lesson plans (one per Lab) at [docs/lessons/](lessons/index.html) — A4 print-ready, mapped to FR Cycle 3/4 + NGSS + CCSS-M + CSTA, with 💾 PDF button
- [x] 4. PDF export from flyer/poster — `💾 PDF` button on both, with first-click i18n toast hint pointing to "Save as PDF" destination
- [x] 5. Curriculum mapping (FR cycles + EN grades) — [docs/curriculum.md](curriculum.html): 8 Labs + 10 games × FR Cycle 3/4 · NGSS · CCSS-M · CSTA, with by-grade quick-pick + year-long unit + 4h workshop

---

## 🛠 Phase 2B — Hardening (so things don't rot)

| # | Item | Why now |
|---|------|---------|
| 6 | **Smoke tests** (Playwright headless) | 8 labs + main app = a lot of surface. One PR can break a Lab silently. ~200 LoC covers 80% of regressions. |
| 7 | **Split `maqueen-tab.js` (4580 LoC)** | One file, one accident. Modularize by card (Drive, Servos, LEDs, etc.). Pre-condition for any further main-app work. |
| 8 | **GitHub Actions CI** — lint + tests + Pages deploy | Currently every push is hope. 30-line workflow file. |
| 9 | **A11y pass** — keyboard, focus rings, ARIA on FABs/labs | Disabled-kid accessibility is a real selling point and a real bug (FABs aren't keyboard-reachable). |
| 10 | **Performance budget** — measure first-paint + JS bundle on Labs | Labs feel snappy on desktop, sluggish on cheap Android tablets (school hardware). Budget: ≤ 1.5 s LCP on a £100 tablet. |

### Checklist
- [ ] 6. Smoke tests for all 8 labs + main connect/disconnect path
- [ ] 7. `js/maqueen-tab.js` → `js/maqueen/{drive,servos,leds,...}.js`
- [x] 8. CI workflow — `.github/workflows/ci.yml`: link audit (`tools/_audit-links.py --strict`) + inlined-md staleness check + JSON validity + secret-leak grep. Fails the push if any HTML href is broken or if a `.md` was edited without re-running `docs/_inline-md.mjs`.
- [x] 9. A11y pass — `js/a11y.js` (auto-injected on 53 pages): skip-link "Skip to main content", visible `:focus-visible` outline overriding legacy `outline:none`, auto-`aria-label` for icon-only buttons, `aria-hidden` on decorative emoji, `prefers-reduced-motion` honored, `lang` ensured. CI workflow extended with a11y sanity (`<html lang>` + `<img alt>` checks).
- [ ] 10. Perf budget + Lighthouse CI

---

## 🚀 Phase 2C — Depth (deepen what already works)

| # | Item | Why now |
|---|------|---------|
| 11 | **3 new labs from `wishlist.html`** (top-voted) | Channel new ideas through the wishlist you just built. Pick 3, ship a "Labs v2" milestone. |
| 12 | **Multi-robot Lab** (WebRTC peer-to-peer) | Phase 1 #10 was checked but the demo isn't first-class. Two Maqueens dancing = viral. |
| 13 | **Progress badges / kid passport** | Tracks which Labs they've completed. localStorage only — no backend. Big motivator. |
| 14 | **Add-on framework** (Gravity sensors + I2C accessories) | Verb namespace stubbed in firmware. Unblock "what else can I plug in?". |
| 15 | **Phase 2 firmware** (`firmware/v2-raw-pins.ts`) | Same wire protocol, raw `pins.*` calls instead of `maqueen.*` lib — for advanced learners. |

### Checklist
- [ ] 11. Top 3 wishlist labs shipped
- [ ] 12. Multi-robot dance demo (1st-class lab)
- [ ] 13. Kid passport / badges
- [ ] 14. Add-on framework + first I2C accessory
- [ ] 15. v2-raw-pins firmware

---

## ⚡ Multipliers — small effort, large leverage

- [x] **One-click "Demo without robot"** — `js/demo-mode.js` injects a fake BLE
  shim when `?#demo=1` or `localStorage.maqueen.demo='1'`. Replaces
  `connect/disconnect/sendLine/isConnected`, returns synthetic
  `ECHO:N <verb>` and DIST/LINE/IR sensor values, shows a 🎭 floating badge
  (click to exit). One-click "🎭 Demo (no robot)" CTA on the Labs hub.
- [x] **`/share` deep links** — `js/share-link.js` encodes `theme · lang ·
  demo` into the URL hash. Auto-applies on load (RTL flips for AR). Public
  API `MqShare.url() / .copy() / .addButton()` for any page that wants a
  "🔗 Share view" button.
- [x] **Local-only telemetry** — `js/telemetry.js` auto-tracks visits per
  surface (`visit.lab.joystick`, `visit.lesson.distance`, `theme.paper`,
  `lang.fr`, etc.) into localStorage. **Zero network** — no fetch, no
  beacon, no cookies. Viewer at [`docs/telemetry.html`](telemetry.html)
  shows heatmap, JSON export, opt-out, and reset.

---

## ⚠️ Anti-patterns to avoid

- **No new feature before the `maqueen-tab.js` split** (Phase 2B #7).
  Every new card makes the 4580-line file worse.
- **No new Lab without smoke tests** for it. Recurring bugs (joystick logger
  mount, co-pilot double-mount) prove this.
- **Don't translate the main cockpit by hand** — wire it to the same
  `T={en,fr,ar}` pattern as `workshops/manual` and let it scale.

---

## How to use this file

- New ideas → go to [labs/wishlist.html](../labs/wishlist.html), not here.
- Picking up an item → tick it (`- [x]`), commit with the item number in
  the message (e.g. `feat(2B-7): split maqueen-tab.js`).
- A Phase 2 sub-section is "done" when its checklist is fully ticked —
  bump the milestone (e.g. v0.2.0 = Phase 2A complete).
