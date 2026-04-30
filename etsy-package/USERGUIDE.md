# `etsy-package/` — User Guide

Everything in this folder exists for **one purpose**: to publish and maintain
the **Maqueen Lab** listing on Etsy.

> 🛒 **Create a listing**: <https://www.etsy.com/your/shops/me/listing-editor/create>

This guide walks through each file, what it's for, and at which step of
the Etsy workflow you actually use it.

---

## Tour of the folder

```
etsy-package/
├── USERGUIDE.md                 📘 This document
├── README.md                    📄 Short layout reference
├── build-package.js             🛠  ZIP builder (Node + Playwright)
├── LICENSE.txt                  📜 Buyer license (ships in the ZIP)
│
├── quickstart-card.html         🖨 A4 printable
├── shortcuts-cheatsheet.html    🖨 A4 landscape printable
├── classroom-poster.html        🖨 A3 printable
├── lesson-plan-template.html    🖨 A4 printable
├── sticker-sheet.html           🖨 A4 printable
├── README-quickstart.html       🖨 A4 printable
├── etsy-listing-mockups.html    🖼 Source for the 7 listing images
│
├── output/                      🔧 Rendered PNGs (rebuilt on demand)
├── MaqueenLab-v*/            📦 Build staging dir (rebuilt on demand)
├── MaqueenLab-v*.zip         📦 Final ZIP (this is what the buyer downloads)
│
└── seller-only/                 🔒 Never ships to the buyer
    ├── ETSY_LISTING.md
    ├── ETSY_LISTING.html
    ├── ETSY_PUBLISH_GUIDE.html
    ├── etsy-playbook.html
    ├── etsy-playbook-fr.html
    ├── etsy-playbook-ar.html
    ├── ETSY-1MIN-PLAYBOOK.md
    ├── LICENSE-SITE
    └── SITE_LICENSE_CERTIFICATE.html
```

---

## The two kinds of files

| Kind | Who sees it | Where it goes |
|------|-------------|---------------|
| **Buyer-facing** | The customer who pays on Etsy | Bundled into the ZIP, or used as listing images |
| **Seller-only** | You (and anyone running this shop) | Stays on your disk / in this repo — never uploaded |

Anything under `seller-only/` is strategy, legal, or video-production
material. It is never copied into the ZIP and should never be pasted
into the Etsy listing itself unless explicitly intended (e.g. title,
description, tags — which live in `ETSY_LISTING.md`).

---

## File-by-file reference

### 🛠 Tooling

#### `build-package.js`
- **What:** Node script that renders the 6 printable HTML templates to
  PNG via Playwright, renders the 7 Etsy listing mockups, and zips
  everything into `MaqueenLab-v<version>.zip`.
- **When to use:** every time you make a release. Run from the repo root:
  ```bash
  node etsy-package/build-package.js
  # or
  npm run build:etsy
  ```
- **Outputs:**
  - `etsy-package/output/*.png` (printables + mockups, rebuilt)
  - `etsy-package/MaqueenLab-v<version>/` (staging dir, rebuilt)
  - `etsy-package/MaqueenLab-v<version>.zip` (the buyer ZIP)
- **Versioning:** edit the `VERSION` constant at the top of the file
  when you bump.

### 📜 Buyer license

#### `LICENSE.txt`
- **What:** the end-user license that ships inside the ZIP. Single-user
  / single-classroom terms. Covers the app + printables.
- **When to use:** automatically copied into the ZIP by `build-package.js`.
- **Edit carefully:** changing this changes what buyers agree to. Keep
  a dated history if you revise it.

### 🖨 Printables (shipped in the ZIP)

All six are standalone HTML files designed to be rendered as PNGs by
`build-package.js` and included in the buyer ZIP under `printables/`.
The HTML sources ship too, so teachers can tweak them.

#### `quickstart-card.html` — A4 portrait
- **What:** 5-step setup card (flash firmware → open `index.html` →
  Chrome/Edge → connect BLE → play).
- **When to use:** buyers print it as the first thing they hold when they
  unzip the package. Also the cover image of the "Printables" bundle
  advertised on the listing.

#### `shortcuts-cheatsheet.html` — A4 landscape
- **What:** Keyboard shortcuts (Space, 1–8, P, F, K, Esc), BLE state
  cheat sheet, tab map.
- **When to use:** teachers print and pin next to the classroom PC.

#### `classroom-poster.html` — A3 portrait
- **What:** "Drive Real Robots with Code!" poster in 5 big kid-safe steps.
- **When to use:** teachers print on A3 for classroom walls. Doubles as
  a strong visual for the listing cover.

#### `lesson-plan-template.html` — A4 portrait
- **What:** Editable 45-minute lesson-plan template + one ready-to-teach
  sample ("Hot or Not? The Sensor Detective") with a rubric.
- **When to use:** sell the "teacher-friendly" angle. Print, fill in by
  hand or in Canva, hand out.

#### `sticker-sheet.html` — A4 portrait
- **What:** 30 circular badges — "I Connected BLE!", theme icons, 3D
  model crew, language badges, achievement stickers.
- **When to use:** teachers print on sticker paper (Avery 22807 or
  similar) for student rewards. Great "bonus" in Etsy description.

#### `README-quickstart.html` — A4 portrait
- **What:** Polished buyer welcome page ("Thank you for buying…" + first
  3 things to do).
- **When to use:** ships alongside `README.md` in the ZIP so buyers see
  a printable welcome, not just a plain text file.

### 🖼 Listing mockups

#### `etsy-listing-mockups.html`
- **What:** a single HTML file containing 7 `<div class="mockup">`
  elements, each 2000×1500 px. Rendered by `build-package.js` into
  `output/etsy-mockup-1.png` … `etsy-mockup-7.png`.
- **The seven mockups:**
  1. **Hero shot** — product name + tagline on Stealth background
  2. **16-cell feature grid** — 8 tabs × features
  3. **Teacher pitch** — "For teachers" with quotes
  4. **Kid pitch** — big, playful, colorful
  5. **What's in the ZIP** — file manifest
  6. **4-theme showcase** — Stealth / Neon / Arctic / Blaze
  7. **Trilingual callout** — EN / FR / AR
- **When to use:** upload as the 7 listing images on Etsy in this order.
  Etsy shows the first image as the thumbnail in search.

### 🔒 `seller-only/` — strategy, legal, video

All files here are **gitignored for the ZIP** (the build script never
touches them) and should never be pasted verbatim into the public
Etsy listing.

#### `ETSY_LISTING.md`
- **What:** the full business playbook in Markdown. Title, description,
  pricing strategy (single-user, classroom, school site, OEM), all
  candidate tags ranked by intent, paste-ready social copy, Pinterest
  plan, video scripts, 10 tier-2 product ideas with launch kits.
- **When to use:** your source of truth when you're actually typing
  into the Etsy "Create listing" form. Copy from here, paste into Etsy.

#### `ETSY_LISTING.html`
- **What:** HTML twin of `ETSY_LISTING.md` — opens in a browser, has a
  copy-to-clipboard button on every paste-ready block.
- **When to use:** instead of the `.md` if you'd rather click a button
  than select-and-copy. Same content.

#### `ETSY_PUBLISH_GUIDE.html`
- **What:** 16-step launch checklist with progress tracking (localStorage)
  and status pills. Covers everything from Etsy shop setup to scheduling
  the first Pinterest pin.
- **When to use:** open this in a browser **first** on launch day. Tick
  off each step. Your progress persists across reloads.

#### `etsy-playbook.html` / `-fr.html` / `-ar.html`
- **What:** 60-second video script + shot list for the Etsy listing
  video. EN / FR / AR variants (Etsy lets you upload one video per
  listing; use whichever language best matches your target audience,
  or record three separate videos for international listings).
- **When to use:** day you film the product video. Keep the playbook
  open on a second screen while recording.

#### `ETSY-1MIN-PLAYBOOK.md`
- **What:** Markdown twin of `etsy-playbook.html`. Same content, easier
  to diff in Git when you iterate on the script.
- **When to use:** interchangeable with the HTML — use whichever is
  handier.

#### `LICENSE-SITE`
- **What:** legal text for the **School Site License** tier
  ($149+, up to 30 teachers at one school, unlimited students).
- **When to use:** when you create the higher-tier listing on Etsy.
  Rename to `LICENSE` inside that tier's ZIP before shipping.

#### `SITE_LICENSE_CERTIFICATE.html`
- **What:** per-sale certificate template. Fill in the school name,
  order date, number of seats → print to PDF → email to the buyer.
- **When to use:** after each School Site License order on Etsy.

---

## The full Etsy workflow, in order

Numbered by when each file enters the picture:

### 1. Prep (once per release)

1. Bump `VERSION` in `build-package.js` and `package.json`.
2. Run `npm run build:etsy` — produces the ZIP and the 7 mockup PNGs.
3. Open `seller-only/ETSY_LISTING.md`, update anything that changed
   (features list, pricing, version number in the description).
4. Preview `etsy-listing-mockups.html` in Chrome; verify all 7 mockups
   render with current branding.

### 2. Record the video (once per language)

5. Open `seller-only/etsy-playbook.html` (EN / FR / AR) on a second
   screen. Record in OBS following the shot list.
6. Export a 60-second MP4, ≤100 MB, 1080p or higher (Etsy's limit).

### 3. Create the listing (launch day)

7. Open `seller-only/ETSY_PUBLISH_GUIDE.html` in Chrome. Tick each
   step as you go.
8. Create the Etsy listing. Paste title, description, tags from
   `seller-only/ETSY_LISTING.md`.
9. Upload the 7 mockup PNGs from `output/etsy-mockup-1.png` …
   `etsy-mockup-7.png` **in numeric order** (Etsy uses the first one
   as the thumbnail).
10. Upload the video from step 6.
11. Attach the digital file: `MaqueenLab-v<version>.zip`.
12. Set pricing from the `ETSY_LISTING.md` pricing table.
13. Publish.

### 4. After each sale

14. For a **single-user** or **classroom** sale: nothing to do — Etsy
    delivers the ZIP automatically. The buyer opens the ZIP and sees
    `README-quickstart.html` + `quickstart-card.pdf` first.
15. For a **School Site License** sale: fill in
    `seller-only/SITE_LICENSE_CERTIFICATE.html`, print to PDF, email
    to the buyer. Log the order in your own tracker.

### 5. Ongoing maintenance

16. When the app ships a new feature, edit `ETSY_LISTING.md`, bump the
    version, re-run `npm run build:etsy`, and update the Etsy listing's
    description + attached ZIP.
17. Keep old ZIPs tracked in Git (the `.gitignore` exemption keeps
    `etsy-package/MaqueenLab-v*.zip` in history) so you can always
    recover the exact artifact any past buyer received.

---

## Rules of thumb

- **Never** paste pricing strategy from `ETSY_LISTING.md` into the
  public listing description — that's your playbook, not the pitch.
- **Never** zip `seller-only/` manually into the buyer ZIP. `build-package.js`
  intentionally excludes it.
- **Always** rebuild the ZIP after editing anything in `docs/`,
  `assets/`, `js/`, or the root app files. The ZIP is tracked in Git,
  so the buyer-facing artifact is always reproducible.
- When in doubt: if a file has "LISTING", "PUBLISH", "PLAYBOOK", "SITE",
  or "CERTIFICATE" in its name — it's seller-only.

---

See also:
- [../README.md](../README.md) — project overview
- [../SETUP.md](../SETUP.md) — buyer 5-minute setup
- [../CHANGELOG.md](../CHANGELOG.md) — version history
- [README.md](README.md) — short layout reference
