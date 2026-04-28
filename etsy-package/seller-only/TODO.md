# Pre-launch manual TODOs

Things the build pipeline can't do for you. Review before hitting **Publish**
on Etsy.

> 🛒 **Etsy create-listing URL**: <https://www.etsy.com/your/shops/me/listing-editor/create>
> 🧪 **Live demo**: <https://abourdim.github.io/maqueen-lab/>

## 🚨 Launch-critical — only you can do these

These are the three items flagged as "likely launch killers" in the review
that require human hands. Don't hit Publish until they're done.

- [ ] **Photograph a real micro:bit propped on a laptop running the app.**
      Replace the current text-only hero (mockup 1) — hardware in the photo
      is the single biggest Etsy thumbnail conversion factor for teacher-
      product listings. Follow the staging note in ETSY_LISTING.md.
- [ ] **Record the 60-second listing video** following
      `seller-only/etsy-playbook.html` (EN). Export ≤100 MB, 1080p+,
      upload as the listing video. Etsy algorithmically prefers listings
      with videos by ~30%.
- [ ] **Create the LAUNCH10 Etsy promo code** (Shop Manager → Marketing
      → Sales & coupons → new code `LAUNCH10`, $7 discount off $12.99,
      10 uses, expires 14 days). Paste the review-request template from
      ETSY_LISTING.md to the first 10 buyers.

---

## Before launch

### 🖼 Listing imagery

- [ ] **Shoot a real micro:bit photo** for the hero. Current hero
      (`etsy-mockups/etsy-mockup-1.png`) uses only an app screenshot.
      Reviewers flagged that listings with *physical hardware + the
      app together* convert better. Retake the hero with a micro:bit
      V2 held next to (or propped on top of) a laptop showing the
      Drive tab. Good light, plain background, crop square.
- [ ] **Test Etsy's square thumbnail crop** on mockup 1. The canvas
      is 2000×1500 (4:3). Etsy will center-crop to square for the
      search thumbnail — make sure the product name and the
      "Chrome & Edge only" badge both survive that crop.
- [ ] **Add a dedicated compatibility infographic** as a new listing
      image (slot 2 or 3). Chrome/Edge ✅, Safari/iPhone ❌, with
      a visible "please check before buying" callout. Current
      compat badge on the hero is a start but a dedicated image
      is what actually lives in buyers' visual memory after they scroll.

### 🎬 Video

- [ ] Record the 60-second listing video following
      `seller-only/etsy-playbook.html` (EN). Upload as the listing
      video (Etsy allows one per listing, ≤100 MB, 1080p+).

### 📝 Listing copy

- [ ] Double-check every `{{PRICE}}` placeholder is filled in before
      pasting from `seller-only/ETSY_LISTING.md` into the Etsy form.
- [ ] Final sanity check: does the description's "what you get" list
      exactly match what `MaqueenLab-v0.1.54.zip` actually contains?
      (Open the ZIP fresh and compare — mismatches = bad reviews.)

---

## After launch

### 📊 First week

- [ ] Monitor the Etsy listing's "Stats" tab daily for the first 7 days.
      If CTR on search < 1.2% → hero image is the problem. If CTR is
      fine but conversion < 1% → description or price is the problem.
- [ ] Reply to every message within 24 h (Etsy rewards fast sellers).
- [ ] Collect the first 5 reviews. Raise price from $12.99 → $17.99
      once you hit 5 ★ reviews (per `ETSY_LISTING.md` pricing ladder).

### 🔁 Ongoing

- [ ] Keep `LICENSE.txt` clause 4 (Updates) and the Etsy FAQ "Will it
      get updates?" in lockstep. Changing one without the other will
      get called out by buyers.
- [ ] When you bump the version, rebuild the ZIP (`npm run build:etsy`)
      AND update the attached file on the Etsy listing. Old buyers get
      the new version free from their purchase history.

---

## Extra improvements queued (see ETSY_LISTING.md for specs)

- [x] ~~Host a live demo on GitHub Pages~~ — done. Live at
      <https://abourdim.github.io/maqueen-lab/>. Already in the
      listing description.
- [ ] **Record a 5-second demo GIF** (pairing + LED draw) — becomes
      listing image #3. Etsy mobile auto-plays GIFs in the image grid.
- [ ] **Create the tripwire $5 Classroom Poster listing** after main
      listing has 3 reviews. Drives buyers back for the full thing.
- [ ] **Stand up the lead-magnet landing page** — free 3-lesson PDF
      behind an email opt-in. Builds a remarketing list.
- [ ] **Create the LAUNCH10 promo code** (first 10 buyers: $12.99 → $7
      with review request). Ships reviews fast.
- [ ] **Duplicate listing in FR + AR** using `etsy-playbook-fr.html` +
      `etsy-playbook-ar.html` scripts. Same ZIP, localized copy.
- [ ] **UTM-tag every share link** (pinterest, reddit, blog). Etsy
      Stats shows you which channel actually converts.
