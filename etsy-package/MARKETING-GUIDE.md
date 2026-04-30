# Marketing Asset Guide — Maqueen Lab

A walkthrough of **every asset** the marketing pipeline produces: what it
is, where it goes, and when to use it. Keep this open when you're
building out the Etsy listing, scheduling social posts, or responding to
buyer messages.

If a file mentioned here doesn't exist yet, the pipeline step that
produces it is listed at the end of each section — run it to generate.

---

## Table of contents

1. [Etsy listing images (slots 1–10)](#etsy-listing-images-slots-110)
2. [Etsy listing video](#etsy-listing-video)
3. [Narrated videos (YouTube / Pinterest / Reels)](#narrated-videos-youtube--pinterest--reels)
4. [Animated GIFs (mobile feed magnets)](#animated-gifs-mobile-feed-magnets)
5. [Printables (ship in the ZIP)](#printables-ship-in-the-zip)
6. [Specialty proof assets](#specialty-proof-assets)
7. [Sales support tools](#sales-support-tools)
8. [Accessibility pack](#accessibility-pack)
9. [Physical artifact](#physical-artifact)
10. [Per-buyer fulfilment](#per-buyer-fulfilment)
11. [Developer-audience hooks](#developer-audience-hooks)
12. [Deep-link URL params](#deep-link-url-params)
13. [Launch-day sequence](#launch-day-sequence)

---

## Etsy listing images (slots 1–10)

Etsy allows 10 images per listing. Ordering matters: image 1 is the
search-result thumbnail, images 2–3 are the "scroll" your buyer sees
first on the listing page, 4–10 fill out the gallery. Etsy also runs its
own thumbnail A/B experiment among your first few images.

### Slot 1 — Hero thumbnail (THE conversion lever)

Three ready-to-upload hero variants. Upload all three and let Etsy's
experiment pick the winner, or rotate manually weekly.

| File | When to use |
|---|---|
| `output/en/heroes/hero-teacher.png` | Default for launch — widest audience. Arctic palette, classroom pitch. |
| `output/en/heroes/hero-kid.png` | A/B candidate. Neon palette, playground pitch. |
| `output/en/heroes/hero-maker.png` | A/B candidate. Blaze palette, MakerFaire / hacker crowd. |
| `output/en/heroes/hero-laptop.png` | For listings embedded on a blog — the CSS laptop frame signals "runs on real hardware." |
| `output/en/heroes/hero-fr.png` | Only for the FR-localized duplicate listing. |
| `output/en/heroes/hero-ar.png` | Only for the AR-localized duplicate listing. |

**Where:** Etsy listing image 1 · Pinterest board cover · email-header banner.
**When:** Set at listing creation. Rotate 2 weeks in if CTR < 1.2 % in Etsy Stats.

### Slots 2–3 — "Proof the thing works" scroll-stoppers

| File | Purpose |
|---|---|
| `output/shared/photoreal/microbit-hero.png` | Photoreal 3D render of the micro:bit V2. Reads as "we have a real device" without needing a physical photo. |
| `output/shared/ble-dialog/ble-pairing.png` | Synthesized Chrome Bluetooth picker. Answers the #1 pre-purchase fear: "will my browser actually pair with this thing?" |
| `output/shared/ble-dialog/ble-pairing-lifted.png` | Alternative with lifted backdrop for print/mockup compositing. |

**Where:** Etsy image 2 (photoreal) and image 3 (BLE dialog).
**When:** Permanent slots. These don't age out; they're evergreen trust signals.

### Slots 4–6 — Feature grid + app state

| File | Use |
|---|---|
| `output/en/screenshots/screenshot-<tab>-live.png` | Synthetic-state captures of each tab (controls / sensors / motors / joystick / graph / 3d / bench / more). UI looks *alive* — connected pill, populated sensors, activity feed. |
| `output/en/screenshots/pair-graph-active.png` | Graph with live waveform. |
| `output/en/screenshots/pair-3d-tilted.png` | 3D model at 30° tilt. |
| `output/en/screenshots/screenshot-graph-annotated.png` | Graph with a "One click to save data" call-out arrow. |
| `output/en/screenshots/screenshot-3d-annotated.png` | 3D tab with "Tilt yours — this follows" call-out. |
| `output/en/screenshots/screenshot-sensors-annotated.png` | Drive tab with "Live from micro:bit" call-out. |

**Where:** Etsy images 4–6 · Pinterest secondary pins.
**When:** Permanent slots. Replace a screenshot only after you've shipped a major UI change.

### Slots 7–8 — Personality / variety

| File | Use |
|---|---|
| `output/en/screenshots/screenshot-theme-<stealth/neon/arctic/blaze>.png` | 2×2 grid collage showing the 4 themes. Good for "personalize it" angle. |
| `output/en/theme-morph.gif` | 6-second animated GIF cycling through all 4 themes. Etsy autoplays GIFs in the image grid on mobile. |

**Where:** Etsy image 7 (theme grid) · image 8 (GIF).
**When:** Permanent. The GIF in particular is a measurable CTR lift on mobile.

### Slot 9 — Audience speaks to you

One of these depending on which audience you want to push:

| File | For |
|---|---|
| `output/en/screenshots/screenshot-audience-teacher-*.png` | Teacher-focused listing angle |
| `output/en/screenshots/screenshot-audience-kid-*.png` | Parent-of-kid angle |
| `output/en/screenshots/screenshot-audience-maker-*.png` | Maker / hobbyist angle |

**Where:** Etsy image 9 · Pinterest "pitch" pins.
**When:** Rotate based on seasonal campaigns (back-to-school → teacher, holidays → kid, MakerFaire week → maker).

### Slot 10 — What's in the ZIP

`etsy-package/output/shared/mockups/etsy-mockup-5.png` — pre-composed "what's inside" mockup
listing all deliverables.

---

## Etsy listing video

Etsy allows **one** video per listing, muted autoplay in the thumbnail
grid, 60-second max, 1080×1920 9:16.

### Use: `output/<lang>/etsy-video-v1.mp4`

Three ready variants: `output/en/`, `output/fr/`, `output/ar/`.

- 60s exactly
- Burned-in captions in the matching language
- **Audio track included** — Zira (EN), Hortense (FR), or Naayf (AR) narrates
- ~5.5 MB (well under Etsy's 100 MB cap)

**Where:** Etsy listing "Video" slot.
**When:** At listing creation. Re-render with `node tools/generate-video.mjs` then `node tools/narrate-video.mjs <lang>` whenever the screenshots change.

> Etsy autoplays muted in the grid — buyers who tap to unmute hear the narration. Both use cases covered.

---

## Narrated videos (YouTube / Pinterest / Reels)

Same 60-second visual, but with voice-over (the captions read aloud by an OS TTS engine).

The main per-language videos (`output/en/etsy-video-v1.mp4`,
`output/fr/etsy-video-v1.mp4`) already have narration. A backup copy
lives at `output/<lang>/narrated/etsy-video-v1.mp4` — byte-identical.

| File | Audio voice | Captions | Channel |
|---|---|---|---|
| `output/en/etsy-video-v1.mp4` | Zira (en-US female) | EN burned | Etsy listing video · YouTube · Instagram Reels |
| `output/fr/etsy-video-v1.mp4` | Hortense (fr-FR female) | FR burned | FR Etsy listing · FR YouTube · FR Pinterest |
| `output/ar/etsy-video-v1.mp4` | Naayf (ar-SA male) | AR burned · RTL | AR Etsy listing · AR YouTube · AR Pinterest |
| `output/<lang>/narrated/etsy-video-v1.mp4` | same as above | same | backup copy of the narrated output |

**Where:**
- YouTube — upload as a product demo with the caption script in the description for SEO
- Pinterest — Video Pin (not regular pin)
- Instagram / TikTok — Reels (crop to 9:16 if needed; already 9:16)
- Embedded in your Etsy shop announcement

**When:** Cross-post at launch, then one refresh every 2 months if click-through dropped.

**Note:** the main per-language videos (`output/{en,fr,ar}/etsy-video-v1.mp4`) already have audio — use them for the Etsy listing slot directly. The `output/<lang>/narrated/` copies are identical backups; pick either.

---

## Animated GIFs (mobile feed magnets)

Short, loopable, autoplay-everywhere demonstrations of one specific feature.

### Use: `output/en/gifs/<name>.gif` (and matching `.mp4`)

| File | Shows | Best channel |
|---|---|---|
| `ledmatrix-heart.gif` | Drawing a heart on the 5×5 LED matrix, progressive | Pinterest pin, Twitter/Bluesky reply to "what does it do?" |
| `graph-record.gif` | Distance tab with Simulate running — live waveform | Etsy listing slot (secondary) · YouTube community post |
| `3d-tilt-sweep.gif` | 3D model tilting ±40° over 5 seconds | Pinterest hover card · Instagram story sticker |
| `theme-swap.gif` | All 4 themes cycle | "Customize it" bullet in the description · Twitter thread |
| `speed-test/speed-test.gif` | "0 → live data in 3.2s" proof | Pinned tweet · Facebook group reply when a teacher asks "does this actually work?" |

**When:** Share 1 GIF per week on social during the launch quarter. Rotate which one based on engagement.

---

## Printables (ship in the ZIP)

Included in every buyer's download.

| File (in ZIP at `printables/`) | Physical use |
|---|---|
| `quickstart-card.html` | A4 card for each student's desk. 5-step setup. |
| `classroom-poster.html` | A3 poster for classroom wall. "Drive Real Robots With Code" + 5 steps. |
| `shortcuts-cheatsheet.html` | A4 landscape. Laminate and tape near workstations. |
| `lesson-plan-template.html` | A4 form + worked 45-min lesson. Photocopy for each teacher. |
| `sticker-sheet.html` | A4, 30 achievement badges. Print on Avery 22807 sticker paper. |
| `README-quickstart.html` | Auto-plays the `theme-morph.gif` live preview. Buyer opens in a browser after download. |

All have **QR codes** (bottom-right) pointing to the live demo with
per-printable UTM tags, so you can see in Etsy Stats which laminated
poster is driving the most demo traffic.

**When:** Nothing to do — they ship with every buyer ZIP automatically.

### Localized marketing poster + flyer — `output/<lang>/print/`

Print-ready collateral in all three languages, generated by
`tools/generate-print.mjs`. Unlike the buyer-ZIP printables above,
these target outside-the-listing distribution — hang at conferences,
hand out at teacher meetups, DM to a partner bookshop.

| File | Size | Use |
|---|---|---|
| `poster-a3.pdf` | A3 portrait (297×420mm) | Classroom / makerspace wall. Hero pitch + 3 features + QR. |
| `poster-a3.png` | 250 DPI preview | Digital sharing (newsletters, Slack). |
| `flyer-a4.pdf` | A4 portrait (210×297mm) | Teacher handout. Pitch + 60-second steps + 3 screenshots + QR. |
| `flyer-a4.png` | 250 DPI preview | Social share / newsletter. |

Three languages × two sizes = 12 files total. Arabic renders RTL
automatically with Tajawal typography. QR codes carry
`utm_medium=print` so Etsy Stats attributes print-driven traffic.

**When:** regenerate before print runs with
`node tools/build-localized.mjs <lang>` (step 9 of the pipeline).

### Social media kit — `output/<lang>/social/`

Four pre-sized PNGs per language, generated by
`tools/generate-social.mjs`. Drop straight into the scheduled-post tool.

| File | Size | Platform |
|---|---|---|
| `ig-post.png` | 1080×1080 | Instagram feed · Facebook square post |
| `ig-story.png` | 1080×1920 | Instagram story · WhatsApp · Reels cover |
| `twitter.png` | 1200×675 | Twitter / X post card |
| `linkedin.png` | 1200×627 | LinkedIn share image |

Same pitch + screenshot, layout adapts to aspect. Arabic auto-RTL.

### Brand identity — `output/<lang>/identity/`

| File | Size | Use |
|---|---|---|
| `business-card.pdf` | 85×55mm print-ready | Hand out at conferences / teacher meetups. |
| `business-card.png` | ~1280×830 preview | Digital share / signature image. |
| `email-signature.png` | 600×160 | Gmail / Outlook signature — point teachers to the demo. |

### Press kit — `press-kit.html`

Single-page media kit with 3-lang toggle (EN/FR/AR). Includes fact
sheet, boilerplate in three lengths (one-liner / short / long),
press-grade asset links, and contact block. Upload next to the live
demo at `/press-kit.html` — send the URL to journalists and bloggers
instead of attaching 40 MB of images.

---

## Specialty proof assets

Single-purpose images that answer a specific objection.

| File | Answers the objection |
|---|---|
| `output/shared/ble-dialog/ble-pairing.png` | "Will Chrome actually pair with a micro:bit?" (Shows the native dialog.) |
| `output/en/speed-test/speed-test.mp4` / `.gif` | "Will this work in a 4-minute class period?" (3.2s to live data.) |
| `output/en/screenshots/screenshot-offline.png` | "Works offline?" (Big OFFLINE MODE overlay, sensors still populated.) |
| `output/shared/photoreal/microbit-hero.png` | "Do you have a real product?" (Photoreal 3D render.) |

**Where:** FAQ section of the listing · link in DM reply templates · cited in blog posts.
**When:** Paste a link to the relevant one when a buyer pre-purchase message asks that specific question.

---

## Sales support tools

Not images — tools that power your workflow.

### `output/en/captions/captions.md`
A/B-ready caption bank. 5 hero titles, 5 subtitles, 5 social captions, 5
Pinterest captions, 5 email subjects — per audience (teacher / kid / maker).

**When:**
- Pick a new hero title every 3 weeks; re-run `node tools/hero-compose.mjs` to regenerate listing image 1.
- Email subject lines for launch-week mailings.
- Social copy rotation for the first 30 days.

### `output/en/chatbot/embed.{js,html}`
Client-side chatbot for the live-demo page. 12 canned FAQs covering the
90 % of pre-purchase questions.

**Where:** Paste into `maqueen-lab/index.html` or the hosted live-demo
page (`abourdim.github.io/maqueen-lab`). Nothing else to do.
**When:** Before first listing publish. Saves ~60–80 % of inbound DMs.

### `tools/faq-rules.json`
The rule set behind the chatbot. Edit when buyers ask something that
isn't already covered.

---

## Accessibility pack

Meets U.S. IDEA / UK SEND school-procurement accessibility requirements
— the kind that unlock district-level budgets.

| File | Use |
|---|---|
| `output/en/accessibility/audio-descriptions/*.wav` | 30-second spoken descriptions of each printable. Zira (en-US) voice. |
| `output/en/accessibility/audio-descriptions/*.txt` | Same as text transcript — for Braille display users or DAISY readers. |
| `output/en/accessibility/braille/*.brl` | Unicode Grade-1 Braille of key phrases. Print on heavy paper + emboss. |
| `output/en/accessibility/braille/printable.html` | Combined embosser-friendly sheet. |
| `output/en/accessibility/README.md` | Accessibility statement — paste into the Etsy listing description. |

**Where:**
- Link the accessibility statement in the Etsy FAQ.
- Bundle the WAVs + BRL files in the buyer ZIP under `accessibility/` folder.
- Mention "WCAG 2.1 AA, IDEA-compatible" in the listing tags.

**When:** Permanent. This is moat — very few Etsy STEM sellers ship accessibility.

---

## Physical artifact

### `output/shared/stand/stand-3mm.{svg,dxf}` + `README.md`

Lasercut acrylic desk stand for the micro:bit V2. 2-piece flat-pack,
friction-fit joint, no glue. Teacher-facing README includes laser
settings for K40 / xTool / Glowforge.

**Where:**
- Include the SVG + DXF + README inside the buyer ZIP at `extras/stand/`
- Promote in the listing description: "Laser-cutter? Free acrylic stand DXF included"

**When:** Permanent differentiator. Makers + makerspaces will cut and share photos — free UGC.

---

## Per-buyer fulfilment

### `tools/watermark-zip.mjs`

Generates a watermarked ZIP with the buyer's name + order ID baked into
README-quickstart.html and LICENSE. Filename includes buyer initials.

**Run at fulfilment:**
```bash
node tools/watermark-zip.mjs --buyer "Alice Smith" --order "12345"
```

Output: `output/shared/buyers/MaqueenLab-AS-12345-v1.2.0.zip`

**When:**
- Manually for each Etsy order during low-volume weeks.
- Automate via Etsy API webhook once you hit 20+ orders / day.

**Effect:** Buyer thinks "personalized." Pirate thinks "traceable." Both are what you want.

### `output/shared/datasets/` (100 CSVs)

Synthetic but realistic micro:bit sensor sessions across 9 scenarios.
Makes the product hardware-OPTIONAL — teachers can teach data analysis
without a physical board.

**Where:**
- Bundle under `extras/datasets/` in the buyer ZIP.
- Cite in the listing description: "100 pre-recorded sensor datasets included — no hardware required for Day 1"
- Leading image bullet for the teacher-segment hero.

**When:** Permanent. Unique selling point — competitors won't catch up in <3 months.

---

## Developer-audience hooks

### `makecode-extension/`

Standalone MakeCode extension with 3 blocks (`start`, `streamSensors`,
`listenForCommands`). Push to a public GitHub repo, MakeCode discovers it
automatically.

**Where:**
- Own GitHub repo like `github.com/abourdim/maqueen-lab-companion`
- Listed in the Etsy description: "MakeCode extension published — search maqueen-lab-companion"

**When:**
- Push when you launch the Etsy listing. MakeCode has 10M+ users; being
  in their ecosystem is a free discovery channel.

---

## Deep-link URL params

The app now reads `window.location.hash` on load. Links like these jump
straight to a specific state:

| URL | What buyer sees |
|---|---|
| `#tab=graph` | Distance tab, ready to Simulate |
| `#tab=board3d&theme=cosmos` | 3D micro:bit in Cosmos theme |
| `#tab=senses&lang=fr` | Drive tab in French |

**Where:**
- Etsy description: "→ See the live 3D tab: abourdim.github.io/maqueen-lab/#tab=board3d"
- Pinterest pin descriptions
- Email signature / blog post demo links

**When:** Every outbound link. Converts passive readers into demo-doers,
and demo-doers convert ~4× better than description-readers.

---

## Launch-day sequence

Drop-in run order for a zero-to-live launch day. Start-to-listing-published in ~2 hours assuming all scripts have been run at least once.

### T–2h — Regenerate visuals

```bash
node tools/capture-screenshots.mjs            # 49+ PNGs, ~1 min
node tools/hero-compose.mjs                   # 6 hero variants
node tools/theme-morph.mjs                    # 1080×1080 theme loop
node tools/generate-video.mjs                 # silent EN 60s base
node tools/narrate-video.mjs en               # adds EN voice-over
node tools/generate-video.mjs --lang fr       # silent FR 60s base
node tools/narrate-video.mjs fr               # adds FR voice-over
cp output/en/narrated/etsy-video-v1.mp4 output/en/etsy-video-v1.mp4
cp output/fr/narrated/etsy-video-v1.mp4 output/output/fr/etsy-video-v1.mp4
node tools/generate-gifs.mjs                  # 4 demo GIFs
node tools/speed-test-clip.mjs                # 3.2s proof clip
node tools/fake-ble-dialog.mjs                # synth Chrome dialog
node tools/photoreal-board.mjs hero           # photoreal render
node tools/generate-stand-svg.mjs             # acrylic stand
```

### T–90m — Build the ZIP (includes everything from output/)

```bash
node etsy-package/build-package.js
```

### T–60m — Fill the Etsy listing

1. Create the listing (copy title + description from
   `seller-only/ETSY_LISTING.md`)
2. Upload images in order:
   - Slot 1 — `output/en/heroes/hero-teacher.png`
   - Slot 2 — `output/shared/photoreal/microbit-hero.png`
   - Slot 3 — `output/shared/ble-dialog/ble-pairing.png`
   - Slot 4–6 — Three synthetic-live screenshots of your choice
   - Slot 7 — `output/en/screenshots/screenshot-theme-*.png` (pick best)
   - Slot 8 — `output/en/theme-morph.gif`
   - Slot 9 — An audience-pack shot matching your launch focus
   - Slot 10 — `output/shared/mockups/etsy-mockup-5.png` (what's in the ZIP)
3. Upload `output/en/etsy-video-v1.mp4` as the listing video
4. Paste 13 tags from the `ETSY_LISTING.md` tags list
5. Attach the generated ZIP

### T–30m — Distribution channels

1. Publish the YouTube demo (`output/en/narrated/etsy-video-v1.mp4`)
2. Pin 4 Pinterest pins (`seller-only/pinterest-pins.html` output)
3. Tweet the GIF + Etsy link (`output/en/gifs/graph-record.gif`)
4. Email your list with the EN narrated video embedded
5. Push the MakeCode extension repo public on GitHub

### T+0 — Hit Publish

Don't forget to create the LAUNCH10 coupon in Etsy's Shop Manager before publishing.

### T+1w — Review Etsy Stats

- If listing CTR < 1.2 % → swap hero image (try `hero-kid` or `hero-maker`)
- If CTR ≥ 1.5 % but conversion < 1 % → rewrite description; cross-check with captions bank
- If traffic is good → start running LAUNCH10 promo + ask first 10 buyers for reviews

---

*Generated `2026-04-20`. Regenerate with `node tools/capture-screenshots.mjs && ...` — see individual tool docs.*
