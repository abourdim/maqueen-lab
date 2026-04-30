# etsy-package 🛒

All Etsy-release assets for **Maqueen Lab**: the ZIP builder, the
printables shipped to buyers, the Etsy listing mockups, and — inside
[`seller-only/`](seller-only/) — the business playbook and site-license paperwork.

## Build the buyer ZIP

```bash
node etsy-package/build-package.js
```

Produces `etsy-package/MaqueenLab-v0.1.54.zip` with the app
source, docs, LICENSE, SETUP, README, CHANGELOG, printables, and the 7
Etsy listing mockup PNGs. Anything in `seller-only/` is **never** included.

## Layout

```
etsy-package/
├── build-package.js           🛠  ZIP builder
├── LICENSE.txt                ✅ End-user license (ships to buyer)
├── README.md                  📘 This file
├── USERGUIDE.html / .md       📖 Full workflow guide (start here)
│
├── quickstart-card.html       ✅ A4  5-min setup card
├── shortcuts-cheatsheet.html  ✅ A4L Keyboard shortcuts
├── classroom-poster.html      ✅ A3  Classroom poster
├── lesson-plan-template.html  ✅ A4  Editable lesson plan
├── sticker-sheet.html         ✅ A4  Printable stickers
├── README-quickstart.html     ✅ A4  Buyer welcome page
├── etsy-listing-mockups.html  🖼  Source for 7 Etsy listing images
│
├── output/                    🔧 Rendered PNGs (rebuilt on demand)
├── MaqueenLab-v0.1.54/         📦 Build staging dir
├── MaqueenLab-v0.1.54.zip      📦 Final buyer ZIP
│
└── seller-only/               🔒 NOT shipped — business & legal
    ├── ETSY_LISTING.md / .html        Listing copy, tags, pricing
    ├── ETSY_PUBLISH_GUIDE.html        16-step launch checklist
    ├── etsy-playbook.html (+fr/ar)    1-minute listing playbook
    ├── ETSY-1MIN-PLAYBOOK.md          Markdown twin of the playbook
    ├── pinterest-pins.html            4 Pinterest pin mockups
    ├── TODO.md                        Pre-launch manual checklist
    ├── LICENSE-SITE                   School site-license legal text
    └── SITE_LICENSE_CERTIFICATE.html  Per-sale certificate template
```

Start with [USERGUIDE.html](USERGUIDE.html) for the full workflow.

> This folder was generated from [`etsy-package-template/`](../../etsy-package-template).
> Regenerate with `node ../etsy-package-template/apply-template.mjs --force` after editing `product.json`.
