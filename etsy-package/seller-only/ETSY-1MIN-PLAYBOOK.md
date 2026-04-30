# Maqueen Lab → Etsy 1-Minute Demo Playbook

**For Etsy listing videos (60-second cap, 9:16 portrait, autoplay-muted preview).**

A second-by-second script: **what to say** + **what to click / do** to produce a tight Etsy demo that converts. Keep this open on a second monitor or print A4.

---

## Etsy video specs (memorise once)

| Spec | Value |
|---|---|
| **Length** | Max 60 seconds (aim for 55 s to be safe) |
| **Aspect** | **9:16 portrait** — Etsy autoplays in the mobile feed |
| **Resolution** | 1080 × 1920 minimum |
| **Codec** | MP4 / H.264 + AAC audio |
| **File size** | Under 100 MB |
| **Audio** | Muted by default in feed → **captions or on-screen text are mandatory** |
| **Cover frame** | First frame becomes the thumbnail — make it visually loud |
| **Hook window** | First 3 seconds decide whether a scroller stops |

---

## Pre-flight checklist (90 seconds, do once per shoot)

Before you press Record:

- [ ] DFRobot Maqueen Lite v4 (micro:bit V2) powered on, showing the **X** icon *(if not → re-flash `makecode.ts`)*
- [ ] Chrome or Edge open with `index.html` loaded
- [ ] BLE paired — status chip is **green**
- [ ] Theme set — **Neon** photographs best; **Arctic** reads best in harsh daylight
- [ ] Language matches your voiceover (EN / FR / AR)
- [ ] Servo plugged into P1 if you're showing Maqueen with Sweep servo
- [ ] Tab 6 (3D) open with Buggy or Robot Arm selected — looks impressive in the hero shot
- [ ] Phone in 9:16 on a tripod, front-lit, clean background
- [ ] Desk cleared — only the board + one prop (buggy / servo / cable) in frame
- [ ] Captions app running OR on-screen text plan ready
- [ ] Script read aloud once, timed under 55 seconds
- [ ] Phone silenced, kids / dogs warned

---

## The 60-second arc

```
 0–3 s   HOOK        "Watch what this micro:bit does in 60 seconds."
 3–10 s  CONTEXT     Board → laptop → Connect → green chip.
10–35 s  DEMO        Tilt → 3D mirrors. Button A → LED heart. Servo swings. Joystick.
35–50 s  PAYOFF      Live graph with Simulate. Record / Replay / CSV.
50–55 s  CTA         "Full kit, lifetime updates — link below."
55–60 s  END FRAME   Logo + handle frozen for the loop preview.
```

Etsy loops the video, so the **end frame should match the cover** — keeps viewers watching the loop.

---

## Script Template A — "Your micro:bit becomes a playground" (hero demo)

**Use case:** the main Etsy listing video. Showcases the 3D, the BLE pairing, and the live graph in one go.

| Time | What to SAY | What to CLICK / DO |
|---|---|---|
| 0–3 s | *"Your micro:bit becomes a playground — in the browser, in 60 seconds."* | Close-up of the real board with the X icon on the LEDs. Your hand holds it. |
| 3–10 s | *"One page, one click, paired."* | Cut to the laptop. Click **🔗 Connect to micro:bit** → pick the board → chip turns green. |
| 10–20 s | *"Sensors live — tilt it, the 3D model tilts too."* | Tab **6 · SLAM map**. Tilt the real board. The virtual one mirrors it. Hold both in frame. |
| 20–30 s | *"Press A — the LEDs react. Drag a slider — the servo swings."* | Press A. Cut to Tab **3 · Motors**, drag Servo 1 slider — real servo swings in frame. |
| 30–40 s | *"Live graph with record, replay, CSV. A lab in a browser tab."* | Tab **5 · Graph** → click **🎲 Simulate** → chart dances → hover on **⏺ Record** and **📄 CSV**. |
| 40–50 s | *"4 themes, 3 languages, works offline, no install, no account."* | Quick theme swap (header dropdown) → show Neon → Arctic. |
| 50–55 s | *"Link below — lifetime updates, teachers and kids welcome."* | Face-cam back on. Eye contact. |
| 55–60 s | *"Happy hacking."* | Hold still. Logo + handle overlay freezes. This becomes the loop frame. |

---

## Script Template B — "Teacher Tuesday" (classroom angle)

**Use case:** targeting teachers and STEM workshop organisers.

| Time | What to SAY | What to CLICK / DO |
|---|---|---|
| 0–3 s | *"STEM teachers — you need to see this."* | Overhead shot of a laptop + 5 micro:bits laid out on a desk. |
| 3–10 s | *"One browser tab. Live sensors. No install on 30 laptops."* | Click Connect. Status goes green. Cut to Drive tab — values streaming. |
| 10–20 s | *"Calibrate the compass right in the UI. Baseline the sound for a quiet classroom."* | Drive tab → Calibrate. Show the Set Level / Set Ambient buttons. |
| 20–30 s | *"Record a full lesson. Export CSV. Drop into a lab report."* | Distance tab → Record → Stop → Save Session → CSV. |
| 30–40 s | *"4 themes — Arctic for projectors. 3 languages — Arabic with full RTL."* | Swap theme to Arctic. Swap language to Arabic — watch the UI flip RTL. |
| 40–50 s | *"Site license for up to 30 teachers. Lifetime updates."* | Text overlay with the licensing tiers + Etsy shop name. |
| 50–60 s | *"Link below. Tag me when you run a workshop."* | Face-cam, hold the micro:bit, smile, freeze on logo. |

---

## Script Template C — "Kid builds a robot" (parent / home-school angle)

**Use case:** showing a young maker using the app — UGC / influencer feel.

| Time | What to SAY | What to CLICK / DO |
|---|---|---|
| 0–3 s | *"My kid built a robot. With a browser tab."* | Close-up: a small hand tapping Connect. |
| 3–10 s | *"The micro:bit drives the servo. The 3D model mirrors the real robot."* | Tab 6 (Maqueen robot). Real robot next to the laptop. Buggy in 3D follows. |
| 10–20 s | *"D-pad in the browser → arrows on the LED → commands to the motors."* | Tab 4 (Joystick). Press ⬆ → LED arrow. Buggy crawls forward. |
| 20–30 s | *"Tilt the brain — the ball rolls to the targets."* | Tab 6 → Balance Game model. Tilt the board. Ball rolls. |
| 30–40 s | *"Graph the sensors. Record the run. Replay for homework."* | Tab 5 → Record 3 s of accel → Replay → Save Session. |
| 40–50 s | *"No login. Nothing leaves the computer. Offline after first load."* | Close the Wi-Fi indicator (airplane mode). App still works. |
| 50–60 s | *"Full kit on Etsy. Link below."* | Kid holding the robot + board. Smile. Freeze. |

---

## During-recording tactics

- **One scene per phase.** Do not cut every 2 s — it feels frantic.
- **Switch scenes on words**, not mid-sentence.
- **Pause 1 second on the graph record button** — visual emphasis.
- **Look at the camera lens**, not the screen, during all CTAs.
- **Smile for the final 3 seconds**. The loop frame matters.
- **Watch the clock** — if you pass 55 s, re-cut. Etsy compresses aggressively.

---

## Common mistakes to avoid

| ❌ Don't | ✅ Do |
|---|---|
| Start with "Hi, I'm…" + 10 s intro | First 3 s = the board tilting a 3D model on the laptop |
| Film landscape (16:9) | 9:16 portrait — Etsy autoplays on mobile |
| Demo on Safari / iPhone | Show Chrome/Edge only. iOS users will buy and refund |
| Skip captions | Burn in captions — the feed is muted by default |
| Whisper | Speak 15% louder and 10% slower than normal conversation |
| Forget the CTA | "Link below" in the last 5 s, every single time |
| End mid-sentence | Land your closing line. Then hold 2 seconds of silence |
| Cluttered desk | Clean area in frame — even a tiny frame shows clutter |

---

## After you press Stop

1. Watch the playback **once**, eyes off the script. Does it land?
2. If >60 s → trim with a simple editor (iMovie, CapCut, DaVinci). Aim for 55 s.
3. Burn in captions if you haven't already. Keep them centered below the subject.
4. First frame — set it to a strong, still visual (the board in hand, or the logo). This is your cover.
5. Export MP4 / H.264, under 100 MB.
6. Upload to the Etsy listing. Verify autoplay. Check on a phone with sound off.

---

## Etsy-specific upload tips

- Etsy listing videos appear at the top as an **autoplaying preview tile**. First frame is the cover — make it visually clean.
- Use the listing **title** to echo the video's first words. If you say *"Your micro:bit becomes a playground"*, the listing title starts with *"Maqueen Lab — BLE Control Panel…"*.
- Add the captions text into the listing **description** — searchable, helps SEO.
- Tag the listing with words you actually said in the video.
- Price tiers: single user `{{PRICE}}` · classroom / site `{{PRICE}}`.

---

## The 5-take rule

**Never publish your first take.** Plan to do 3–5:

1. **Take 1** — read the script literally. Find the awkward bits.
2. **Take 2** — fix the awkward bits. Less reading, more talking.
3. **Take 3** — drop the script. Talk to a friend, not to a camera.
4. **Take 4** — slow down 10 %. Add one deliberate pause.
5. **Take 5** — your keeper.

---

## Quick-reference cheat card

```
PRE     V2 has X icon · Chrome open · BLE green · 9:16 phone · Cosmos theme
LAUNCH  Record → first words land in the first 3 seconds
DURING  Tilt → 3D · A → LED · slider → servo · Simulate → graph
AFTER   Stop → trim to 55 s → burn captions → first frame = thumbnail
UPLOAD  Etsy listing → upload MP4 → echo first words in listing title
```

---

## Listing-page copy snippets

**Title (140 chars max):**
```
Maqueen Lab — BLE Control Panel for Teachers & Kids · Sensors · Servos · Live Graph · 3D Models · No Install · Chrome / Edge
```

**160-char short description:**
```
Browser-based BLE control panel for the DFRobot Maqueen Lite v4 (micro:bit V2). Sensors, servos, live graphs, 3D models, and a Joystick — all from Chrome. No install, no account.
```

**13 Etsy tags:**
```
micro:bit, BLE, bluetooth, education, STEM, robotics, kids coding, teacher resource, sensors, servos, classroom, home school, makerspace
```

**Materials:**
```
HTML5, JavaScript, Web Bluetooth, SVG gauges, Three.js, PWA, MakeCode, TypeScript
```

**SEO keywords:**
```
browser-based · no-install · privacy-first · offline-capable · web bluetooth · micro:bit V2 · STEM workshop · teacher resource
```

**Price tiers (fill the `{{PRICE}}` placeholders):**

| Tier | Who | Price |
|---|---|---|
| Single user | One teacher / family / maker | `{{PRICE}}` |
| Classroom / Site | Up to 30 teachers at one school | `{{PRICE}}` |
| District / OEM | Multiple sites — DM through order | Custom |

---

## 7-image listing order

1. **Hero** — real micro:bit + laptop, 3D model mirroring the board's tilt. Title overlay in Orbitron.
2. **Tabs overview** — grid screenshot of all 8 tabs with emoji labels.
3. **Live graph** — SVG gauges close-up with colored lines + annotations, Record button glowing red.
4. **3D models** — split screenshot of Buggy + Robot Arm.
5. **Hand-holding** — real servo plugged into P1, sliders on the screen.
6. **Theme sampler** — 2×2 grid: Stealth · Neon · Arctic · Blaze.
7. **License card** — "Single-user license · Lifetime updates · No cloud · Chrome / Edge" on a dark gradient.

---

*Made for Maqueen Lab v0.1.54 — print this on A4, laminate, keep next to the shoot rig.*
