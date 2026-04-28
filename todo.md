# Maqueen Lab — Roadmap

Twenty things to ship next: ten app improvements + ten educational games.
Tick (`[x]`) as items land. Each entry is a self-contained chunk; no
hard ordering — pick whichever fits the next session.

---

## 🚀 10 Genius Improvements for the App

| # | Idea | Why it's genius |
|---|------|-----------------|
| 1 | 🎙️ **Voice commands** *(Web Speech API)* | "Say _forward!_ / _spin!_ / _stop!_" → robot obeys. Hands-free hilarious for kids. Zero new dependencies. ~80 lines. |
| 2 | 📱 **Tilt-to-drive** *(DeviceMotion API on phones)* | Tilt the phone like a steering wheel. Driving from a tablet feels physical. Pure web platform, no app install. |
| 3 | 🍩 **AI session summary** *(browser-side LLM or Claude API)* | After a 5-minute drive, generate a paragraph in natural language: _"You drove 12 m, made 8 obstacle avoidances, your top speed was 24 cm/s. Try the Front Cone radar mode next time!"_ Spotify-Wrapped vibe for robotics. |
| 4 | 🎬 **Time-lapse export** *(canvas → WebM)* | Record an entire session, export as 10× speed GIF/MP4 of the SLAM map evolving. Etsy listing material that sells itself. |
| 5 | 🖍️ **Drag-to-trace autopilot** | Finger-paint a route on the SLAM map; robot navigates it autonomously using odometry as feedback. Real PID control as a kids' feature. |
| 6 | 📷 **AR webcam overlay** | Phone camera shows the room; sonar pings + line-sensor hits overlay on the live video feed. The robot's "perception" made visible. |
| 7 | 🎭 **Robot personalities** | "Speedy" / "Cautious" / "Curious" / "Lazy" presets that bundle wander threshold + speed + sweep range + audio voice. One-click character swap. |
| 8 | 🔋 **Battery indicator** *(firmware-side voltage read)* | Real-time battery % bar in the rail. Kids learn about power. Requires small firmware addition + a `BAT?` verb. |
| 9 | 📊 **Telemetry export** *(CSV/JSON download)* | Every drive/sensor sample → exportable file. Open in Excel/Python for school assignments. Turns the robot into a real data-collection tool. |
| 10 | 🤝 **2-robot pairing** *(WebRTC peer-to-peer)* | Two Maqueens, two browser tabs, one mirrors the other. No server needed. _"Look mom, they're dancing together!"_ |

### Checklist
- [x] 1. Voice commands
- [x] 2. Tilt-to-drive
- [ ] 3. AI session summary
- [ ] 4. Time-lapse export
- [ ] 5. Drag-to-trace autopilot
- [ ] 6. AR webcam overlay
- [x] 7. Robot personalities
- [ ] 8. Battery indicator
- [x] 9. Telemetry export
- [ ] 10. 2-robot pairing

---

## 🎮 10 Genius Educational Games

| # | Game | Concept it teaches |
|---|------|--------------------|
| 1 | 🛰️ **SLAM the Room** | Drive around, sonar projects obstacles into the world map (already in app!). Score = % of room mapped. Teaches localization + sensor fusion. |
| 2 | 🎯 **Echo Hunt** | Hidden virtual "treasure" at random (x, y) on the SLAM map. Robot drives blind; only feedback is sonar ping rate getting faster as it gets closer. Teaches triangulation + search algorithms. |
| 3 | 🧱 **Maze Runner** | Set up cardboard walls; robot solves the maze autonomously. Win = reach the green tape. Teaches reactive control (Brooks subsumption). |
| 4 | 🎵 **Buzz the Tune** | Kid taps notes on a piano-strip, robot plays them via buzzer. Teaches frequency = pitch, duration = rhythm. Bonus: AI hint suggests _"you played Twinkle Twinkle!"_ |
| 5 | 🌈 **Simon Says — NeoPixel** | App flashes a color sequence on the 4 LEDs, kid recreates with the picker. Length grows. Teaches sequence + memory + RGB color theory. |
| 6 | 📏 **Math the Distance** | _"I'll drive forward at speed 150 for 2 seconds. How many cm will I move?"_ Kid enters answer, robot drives, odometry shows actual. Score = accuracy. Teaches v = d/t. |
| 7 | ⚽ **Robot Soccer** | Foam ball + Push (bulldozer) kit + tape goal lines on the floor. Race to push the ball into the opposite goal. Teaches kinematics + tactical planning. |
| 8 | 🏁 **Line Follower Race** | Print/draw a black line track on paper. Robot uses line sensors to follow. Time the lap. Teaches feedback loops (closed-loop control). |
| 9 | 🎚️ **PWM Lab** | _"Hit 67° EXACTLY on the servo."_ Kid drags slider, sees PWM oscilloscope live. Score = how close. Teaches pulse width = analog control. |
| 10 | 📡 **Morse Decoder** | Buzzer plays a Morse-code message ( . . .  -  -  -  . . . = SOS). Kid decodes letter by letter. Teaches digital encoding + binary thinking. |

### Checklist
- [ ] 1. SLAM the Room
- [ ] 2. Echo Hunt
- [ ] 3. Maze Runner
- [x] 4. Buzz the Tune
- [x] 5. Simon Says — NeoPixel
- [x] 6. Math the Distance
- [ ] 7. Robot Soccer
- [ ] 8. Line Follower Race
- [x] 9. PWM Lab
- [x] 10. Morse Decoder
