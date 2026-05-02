# Maqueen Lab — Next steps

> Snapshot taken 2026-05-02 after smoke tests landed (commit `6dd1f1a`, v0.1.60).
> This file is the **active to-do**. The full historical roadmap lives in
> [todo.md](todo.html) (Phase 1 shipped + Phase 2A complete + Multipliers all green).

---

## 🔴 Bugs to fix from the smoke run (P0)

| # | Item | Where | Effort |
|---|------|-------|--------|
| 1 | Hub-load tests timing out on teardown (5 tests) — `index.html`, `labs/index.html`, `docs/index.html`, `workshops/hub.html`, `docs/lessons/index.html` heavy animations don't finish, Playwright context teardown exceeds 30 s | `tests/smoke.spec.mjs` — pass `{ waitUntil: 'domcontentloaded' }` to `page.goto`, or stop animations before assertion | 15 min |
| 2 | Pre-commit linter hook keeps re-running `inline-md.mjs` — every commit logs the 13-file pass even when nothing changed | `tools/git-hooks/pre-commit` — only run if a `.md` file is in the staged diff | 10 min |
| 3 | `tests/tests.html` orphan in CI — should add it to `ALLOWED_ORPHANS` *or* link it from `docs/index.html` as a dev-tools card | `tools/_audit-links.py` already allows it; double-check the new `tests/` folder didn't add a sibling orphan | 5 min |

## 🟡 Phase 2B — Hardening (remaining)

| # | Item | Why | Effort |
|---|------|------|--------|
| 2B-7 | **Split `js/maqueen-tab.js` (4580 LoC)** into per-card modules. **Pre-condition**: smoke tests must be green first (1 above). | Pre-condition for any further main-app work. One file = one accident. | 3-4 h |
| 2B-10 | **Performance budget** — Lighthouse CI pass + budget file (≤ 1.5 s LCP on cheap Android tablets) | School hardware is slow. Catch perf regressions in CI. | 1 h |

## 🚀 Phase 2C — Depth

| # | Item | Why | Effort |
|---|------|------|--------|
| 11 | Top 3 wishlist labs (collected from `labs/wishlist.html` votes) | Channel new ideas through the wishlist | varies |
| 12 | **Multi-robot Lab** (WebRTC peer-to-peer) — Phase 1 #10 was ticked but no first-class lab | Two Maqueens dancing = viral | 4-6 h |
| 13 | **Progress badges / kid passport** (localStorage only) | Motivator; no backend | 2 h |
| 14 | **Add-on framework** (Gravity sensors + I2C accessories) | Verb namespace stubbed in firmware | 4 h |
| 15 | **Phase 2 firmware** (`firmware/v2-raw-pins.ts`) | For advanced learners | 6 h |

## 🟢 Manual / human-only (not codable)

| Item | Owner |
|------|-------|
| 📷 Photograph a real micro:bit propped on a laptop running the app (Etsy hero) | You |
| 🎬 Record 60-sec listing video using `seller-only/ETSY_LISTING.md` as the script | You |
| 🛒 Create LAUNCH10 promo code in Etsy Shop Manager | You |

## 🔇 Won't do

- Translate technical docs (`CHANGELOG.md`, `CUSTOMIZE.md`) — contributor-facing, EN is fine
- Cross-browser smoke tests (Firefox/WebKit) — Web Bluetooth is Chromium-only anyway
- A virtual physics layer for demo-mode — current synthetic responses are enough; full physics would 5-10× the code

---

## 🎯 Recommended next session

**One commit:** fix bug #1 (hub-load test timeouts) → smoke suite goes 32/32. Once tests are fully green, **2B-7 (split `maqueen-tab.js`)** becomes safe to attempt.

After that: **2B-10 (Lighthouse CI)** — small, high-leverage. Then Phase 2C.

---

## Notes from the recent push

- All 3 Multipliers shipped: telemetry · share-link · demo-mode. Verified runtime in regression sweep.
- Smoke tests caught a **real bug**: `labs/distance-lab.html` referenced `../icon.svg`, `../style.css`, `../logo.svg` — none existed (correct paths: `../assets/logo.svg`, `../styles.css`). Fixed.
- New tool: `tools/_check-asset-refs.py` — scans an HTML for missing asset references. Could be added to CI.
- Audit baseline: 53 HTML files, 52 reachable from `index.html`, **0 broken hrefs**, 1 acceptable orphan (`tools/tests.html`).
