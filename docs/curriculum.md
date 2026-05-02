# Maqueen Lab — Curriculum mapping

> **Phase 2A-5.** Maps the 8 Labs + 10 educational games to formal learning
> objectives across **French (Cycle 3 + Cycle 4)** and **US/UK K-8**
> (NGSS, Common Core Math, CSTA CS). Drop-in reference for teachers building
> a unit; copy-paste verbatim into your scheme of work.

---

## How to read this

Each row gives you:
- **Activity** — Lab name (`labs/*.html`) or game (mission inside the labs / main app)
- **Age window** — recommended age range (kids may stretch ±1 year)
- **Time** — typical time in minutes for a single session
- **Primary objective** — what the activity is *really* teaching
- **Maps to** — formal standard codes you can drop into a lesson plan

> **Note on standards.** French codes follow the *Bulletin officiel* —
> *Programmes de l'école élémentaire et du collège*. US/UK codes follow
> NGSS (Next Generation Science Standards), CCSS-M (Common Core Math),
> and CSTA (Computer Science Teachers Association K-12 Framework).

---

## 🎯 Quick-pick by grade

| Grade | French | Best Labs to start with | Best games |
|---|---|---|---|
| Ages 6-8 | CP-CE1-CE2 | Lights, Music | Simon Says NeoPixel, Buzz the Tune |
| Ages 9-10 | CM1-CM2 (Cycle 3) | Joystick, Distance, Music, Servos | SLAM the Room, Maze Runner, Math the Distance |
| Ages 11-12 | 6e (Cycle 3) | All 8 Labs accessible | Echo Hunt, Line Follower Race, PWM Lab |
| Ages 13-14 | 5e-4e (Cycle 4) | IR, Vision, Co-Pilot | Robot Soccer, Morse Decoder, multi-robot dance |
| Ages 15+ | 3e + lycée | Co-Pilot + JS hacking | Custom mission design, firmware mods |

---

## 🧪 Lab-by-Lab mapping

### Joystick Lab (`labs/joystick-lab.html`)

| Property | Value |
|---|---|
| Age | 8-14 |
| Time | 25-45 min |
| Primary objective | Direct manipulation; cause→effect; reading vector inputs (x, y) |
| **FR Cycle 3** | *Maths* : repérage et déplacement dans un quadrillage. *Sciences-Tech* : objets techniques pilotés à distance. |
| **FR Cycle 4** | *Tech* : programmer un objet connecté (variables d'entrée). *Maths* : couples de coordonnées. |
| **NGSS** | K-2-ETS1-1 (define a problem); 3-5-ETS1-3 (test/improve solutions). |
| **CCSS-M** | 5.G.A.1 (coordinate plane). |
| **CSTA** | 1A-AP-08 (model daily processes); 1B-AP-10 (test and debug). |

### Distance Lab (`labs/distance-lab.html`)

| Property | Value |
|---|---|
| Age | 9-14 |
| Time | 30-50 min |
| Primary objective | Sensor → number; ultrasonic time-of-flight; thresholds and alarms |
| **FR Cycle 3** | *Sciences* : propagation du son ; mesure et grandeurs. |
| **FR Cycle 4** | *Phys-Chim* : ondes mécaniques (vitesse du son). *Tech* : capteur, signal, traitement. |
| **NGSS** | 4-PS4-1 (waves); MS-PS4-1 (model wave properties). |
| **CCSS-M** | 4.MD.A.1 (measurement units). |
| **CSTA** | 1B-DA-06 (collect/store data with sensors). |

### Music Lab (`labs/music-lab.html`)

| Property | Value |
|---|---|
| Age | 7-14 |
| Time | 20-40 min |
| Primary objective | Frequency = pitch; sequencer = time; pattern recognition |
| **FR Cycle 3** | *Sciences* : sons (hauteur, fréquence). *Musique* : éducation musicale, rythme. |
| **FR Cycle 4** | *Phys-Chim* : son et fréquence (Hz). *Tech* : algorithme séquentiel. |
| **NGSS** | 1-PS4-1 (sound vibrations); MS-PS4-1 (waves). |
| **CCSS-M** | 4.OA.C.5 (generate patterns). |
| **CSTA** | 1A-AP-09 (sequences of instructions); 1B-AP-08 (loops/iteration). |

### Servo Lab (`labs/servo-lab.html`)

| Property | Value |
|---|---|
| Age | 8-14 |
| Time | 25-45 min |
| Primary objective | PWM = analog control; angle as state; choreography = time-series |
| **FR Cycle 3** | *Sciences-Tech* : transmission/transformation de mouvement ; objets articulés. |
| **FR Cycle 4** | *Tech* : actionneurs (servomoteurs), commande, signal PWM. |
| **NGSS** | 4-PS3-2 (transfer of energy); MS-ETS1-2 (evaluate competing design solutions). |
| **CCSS-M** | 4.MD.C.5 (angles); 5.G.B.4 (classify shapes). |
| **CSTA** | 1B-AP-12 (modify existing program); 2-AP-13 (decompose problems). |

### IR Lab (`labs/ir-lab.html`)

| Property | Value |
|---|---|
| Age | 10-14 |
| Time | 25-40 min |
| Primary objective | IR remote = encoded keys; line sensors = binary discrimination |
| **FR Cycle 3** | *Sciences* : lumière (visible/invisible) ; signal/information. |
| **FR Cycle 4** | *Phys-Chim* : ondes électromagnétiques. *Tech* : codage de l'information. |
| **NGSS** | MS-PS4-3 (digital signals more reliable than analog). |
| **CSTA** | 1B-NI-04 (model how info travels); 2-NI-04 (network protocols). |

### Lights Lab (`labs/lights-lab.html`)

| Property | Value |
|---|---|
| Age | 7-14 |
| Time | 20-40 min |
| Primary objective | RGB color model; addressable LED chains; sequence/loop |
| **FR Cycle 3** | *Sciences* : lumière et couleur (synthèse additive). *Arts* : expression visuelle. |
| **FR Cycle 4** | *Phys-Chim* : décomposition de la lumière, RGB. *Tech* : programmer une boucle d'animation. |
| **NGSS** | 1-PS4-3 (effects of light); 4-PS4-2 (light reflection). |
| **CSTA** | 1A-AP-10 (loops); 1B-AP-09 (use math operations on data). |

### Vision Lab (`labs/vision-lab.html`)

| Property | Value |
|---|---|
| Age | 11-14 |
| Time | 30-60 min |
| Primary objective | Camera → robot; pose/face detection; AI-as-a-tool |
| **FR Cycle 3** | *EMI* : usages responsables du numérique ; biais des algorithmes. |
| **FR Cycle 4** | *Tech* : intelligence artificielle (introduction). *EMI* : protection vie privée, traitement d'image. |
| **NGSS** | MS-ETS1-3 (analyze data from tests). |
| **CSTA** | 2-AP-15 (apply software dev best practices); 2-IC-20 (computing impacts). |

### Co-Pilot Lab (`labs/copilot-lab.html`)

| Property | Value |
|---|---|
| Age | 11-14 |
| Time | 25-50 min |
| Primary objective | Voice → command grammar; speech recognition limits; controlled vocabulary |
| **FR Cycle 3** | *Français* : précision de la langue (mots-clés). *EMI* : interfaces vocales et données. |
| **FR Cycle 4** | *Tech* : systèmes embarqués qui écoutent. *EMI* : voix, vie privée. |
| **NGSS** | MS-ETS1-1 (define design criteria). |
| **CSTA** | 2-AP-13 (decompose); 2-IC-22 (collaborate using tools). |

---

## 🎮 Game-by-Game mapping (10 educational games)

| Game | Age | Time | Primary objective | Maps to (highlights) |
|---|---|---|---|---|
| **SLAM the Room** | 10-14 | 30-50 min | Localization, sensor fusion, mental map → 2D grid | NGSS MS-ETS1-3 · CSTA 2-DA-08 (data visualization) · FR Cycle 4 Tech objets connectés |
| **Echo Hunt** | 10-14 | 25-40 min | Search algorithms, hot/cold game, triangulation | NGSS 4-PS4-3 (info transmission) · CSTA 1B-AP-11 (algorithm selection) |
| **Maze Runner** | 9-14 | 30-50 min | Reactive control (Brooks subsumption), follow-walls | CSTA 2-AP-13 (decompose); FR Cycle 3 algorithmes simples |
| **Buzz the Tune** | 7-12 | 15-25 min | Frequency = pitch, duration = rhythm; reading sheet music | CCSS-M 3.OA (multiplication patterns) · FR Cycle 3 Musique éducation auditive |
| **Simon Says NeoPixel** | 7-11 | 15-25 min | Sequence + memory; growing pattern; failure tolerance | CCSS-M 2.OA.C.3 (patterns) · CSTA 1A-AP-09 |
| **Math the Distance** | 9-14 | 20-35 min | v = d/t; estimation vs measurement; error analysis | CCSS-M 5.MD.A.1 + 6.RP.A.3 (rates) · FR Cycle 3 grandeurs et mesures |
| **Robot Soccer** | 8-14 | 30-60 min | Tactical planning, kinematics, real-time decisions | NGSS 4-PS3-3 (transfer of energy on collision) · FR Cycle 3 sport et géométrie |
| **Line Follower Race** | 9-14 | 25-45 min | Closed-loop control (PID intuition), feedback | NGSS MS-ETS1-3 (test optimal solution) · FR Cycle 4 Tech systèmes asservis |
| **PWM Lab** | 11-14 | 20-35 min | Pulse-width = analog; precision targeting | FR Cycle 4 Phys-Chim (signal numérique vs analogique) · CSTA 2-CS-02 |
| **Morse Decoder** | 9-14 | 20-40 min | Digital encoding; binary thinking; symbol → meaning | CCSS-M 4.OA (number-letter codes) · CSTA 1B-DA-07 (encoding) · Histoire (telegraphy) |

---

## 📚 By-curriculum reverse index

### French Cycle 3 (CM1, CM2, 6e — ages 9-12)

> **Programme de référence** : *Maths* (nombres, calcul, géométrie, mesure), *Sciences et technologie* (matière, vivant, planète, objets techniques), *Numérique* (algorithmique débranchée et Scratch).

| Programme objective | Best Lab/game |
|---|---|
| Repérage et déplacement (quadrillage) | **Joystick Lab**, **Maze Runner**, **SLAM the Room** |
| Mesure et grandeurs (longueur, durée, vitesse) | **Math the Distance**, **Distance Lab** |
| Sons : production et perception | **Music Lab**, **Buzz the Tune** |
| Lumière et couleur | **Lights Lab**, **Simon Says NeoPixel** |
| Objets techniques pilotés | **Joystick Lab**, **Servo Lab** |
| Algorithmes simples (séquence/répétition) | **Music Lab** sequencer, **Lights Lab** painter |
| Initiation Scratch / programmation | All Labs (verbe BLE = bloc Scratch) |

### French Cycle 4 (5e, 4e, 3e — ages 12-15)

> **Programme de référence** : *Maths* (fonctions, statistiques, algorithmique), *Phys-Chim* (signaux, ondes), *SVT*, *Tech* (objets connectés, programmation, ingénierie).

| Programme objective | Best Lab/game |
|---|---|
| Signal numérique vs analogique | **PWM Lab**, **Servo Lab** |
| Ondes mécaniques (son) | **Music Lab**, **Distance Lab** |
| Ondes électromagnétiques | **IR Lab** |
| Objet connecté : capteur → traitement → action | **Distance Lab**, **Line Follower**, **Co-Pilot** |
| Algorithmique : boucle, condition, fonction | All Labs + main app cockpit code panel |
| IA et données (introduction) | **Vision Lab**, **Co-Pilot Lab** |
| Systèmes asservis (feedback loop) | **Line Follower Race**, **Maze Runner** |
| Brevet : épreuve de Tech, projet 5h | **Robot Soccer** as final project |

### US/UK K-8 (ages 5-14)

| Standard family | Best Lab/game |
|---|---|
| **NGSS K-2-ETS1** (engineering design) | Joystick Lab, Lights Lab, Music Lab |
| **NGSS 1-PS4** (light + sound) | Music Lab, Lights Lab, Distance Lab |
| **NGSS 3-5-ETS1** (test/improve solutions) | Maze Runner, Line Follower Race, Robot Soccer |
| **NGSS 4-PS3** (energy transfer) | Servo Lab, Robot Soccer |
| **NGSS 4-PS4** (waves) | Music Lab, Distance Lab, IR Lab |
| **NGSS MS-PS4** (waves info) | Distance Lab, IR Lab, Morse Decoder |
| **NGSS MS-ETS1** (engineering, decompose) | All Labs at the project level |
| **CCSS-M K-2** (patterns, counting) | Simon Says NeoPixel, Buzz the Tune |
| **CCSS-M 3-5** (geometry, measurement, rates) | Joystick (coords), Math the Distance, Servo (angles) |
| **CCSS-M 6-8** (ratios, statistics) | Math the Distance, PWM Lab |
| **CSTA 1A** (K-2 Algorithms & Programming) | Lights Lab, Music Lab |
| **CSTA 1B** (3-5) | All Labs introduction level |
| **CSTA 2** (6-8) | Vision Lab, Co-Pilot, Multi-robot |

---

## 🏁 Suggested progressions

### Year-long unit (32 sessions, 1/week)

| Term | Sessions | Sequence |
|---|---|---|
| **Autumn** | 1-8 | Joystick → Lights → Music → Distance → 2 free play |
| **Winter** | 9-16 | Servo → Buzz the Tune → Simon Says → Maze Runner → 2 reflection |
| **Spring** | 17-24 | IR → Math the Distance → Line Follower → SLAM → 2 design lab |
| **Summer** | 25-32 | Vision → Co-Pilot → Robot Soccer → final project (Robot Soccer tournament or Maze design) |

### Single-day workshop (4 hours)

| Slot | Activity |
|---|---|
| 0:00 – 0:30 | Hub overview + Safety + Connect (workshops/hub.html) |
| 0:30 – 1:00 | **Joystick Lab** — drive the robot |
| 1:00 – 1:30 | **Music Lab** — play "Twinkle Twinkle" |
| 1:30 – 1:45 | Break |
| 1:45 – 2:30 | **Maze Runner** — set up cardboard, robots solve |
| 2:30 – 3:15 | **Robot Soccer** tournament (4 teams) |
| 3:15 – 3:45 | Reflection + certificates (workshops/booklet.html) |
| 3:45 – 4:00 | Cleanup |

---

## ⚠️ Caveats

- Standards mappings are **opinionated** — match what we believe each Lab/game
  best teaches. A creative teacher can stretch any Lab to most standards.
- Time estimates assume **first contact**. Returning kids halve them.
- Age windows are **soft**. We've seen 7-year-olds nail the Joystick Lab and
  14-year-olds rediscover the Lights Lab as a lighting-design problem.
- This file is **living** — file an issue or PR to refine a mapping.

---

## See also

- [todo.md](todo.html) — roadmap (Phase 2A-5 = this doc)
- [guide.md](guide.html) — full user guide
- [labs/index.html](../labs/index.html) — Lab launcher
- [workshops/manual.html](../workshops/manual.html) — full 12-mission classroom manual
