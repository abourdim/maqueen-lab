// ============================================================
// models/microbit.js — micro:bit V2 board (high-visibility)
// ============================================================

(function () {
    'use strict';

    let group, leds = [], ledGlows = [], buttonA, buttonB, pinRings = {}, logo, pcbMat;
    let btnBlackMat, btnPressedMat, goldMat, pinGlowMats = {};
    let btnHousingA, btnHousingB;
    const BD = 0.15; // board depth (thicker for visibility)

    const model = {
        name: 'micro:bit V2',
        camera: { theta: 0, phi: Math.PI / 4, radius: 6 },
        background: 0x1e2d3d,
        groundY: -1.5,

        create(scene, T) {
            group = new T.Group();
            scene.add(group);

            // Materials — tuned for visibility
            pcbMat = new T.MeshStandardMaterial({ color: 0x1a3a2e, roughness: 0.6, metalness: 0.15 });
            goldMat = new T.MeshStandardMaterial({ color: 0xd4a017, roughness: 0.25, metalness: 0.85, emissive: 0x664400, emissiveIntensity: 0.15 });
            const chipMat = new T.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.4 });
            btnBlackMat = new T.MeshStandardMaterial({ color: 0x333333, roughness: 0.5, metalness: 0.2 });
            btnPressedMat = new T.MeshStandardMaterial({ color: 0x55ff88, roughness: 0.4, metalness: 0.2, emissive: 0x22cc55, emissiveIntensity: 0.7 });
            const usbMat = new T.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.3, metalness: 0.8 });
            const silkMat = new T.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.8 });
            const darkMat = new T.MeshStandardMaterial({ color: 0x080808 });
            const housingMat = new T.MeshStandardMaterial({ color: 0x555555, roughness: 0.5, metalness: 0.3 });
            const battMat = new T.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.4, metalness: 0.4 });

            // Touch pin glow
            for (const k of ['0', '1', '2']) {
                pinGlowMats[k] = new T.MeshStandardMaterial({ color: 0xffd700, roughness: 0.2, metalness: 0.6, emissive: 0xffd700, emissiveIntensity: 0 });
            }

            // ---- PCB BOARD ----
            const BW = 3.2, BH = 2.6, br = 0.25;
            const shape = new T.Shape();
            shape.moveTo(-BW / 2 + br, -BH / 2);
            shape.lineTo(BW / 2 - br, -BH / 2);
            shape.quadraticCurveTo(BW / 2, -BH / 2, BW / 2, -BH / 2 + br);
            shape.lineTo(BW / 2, BH / 2 - br);
            shape.quadraticCurveTo(BW / 2, BH / 2, BW / 2 - br, BH / 2);
            shape.lineTo(-BW / 2 + br, BH / 2);
            shape.quadraticCurveTo(-BW / 2, BH / 2, -BW / 2, BH / 2 - br);
            shape.lineTo(-BW / 2, -BH / 2 + br);
            shape.quadraticCurveTo(-BW / 2, -BH / 2, -BW / 2 + br, -BH / 2);

            const boardGeo = new T.ExtrudeGeometry(shape, { depth: BD, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3 });
            boardGeo.center();
            const board = new T.Mesh(boardGeo, pcbMat);
            board.rotation.x = -Math.PI / 2;
            board.castShadow = true;
            board.receiveShadow = true;
            group.add(board);

            // ---- EDGE CONNECTOR (gold strip at bottom) ----
            const edgeConn = new T.Mesh(new T.BoxGeometry(BW * 0.85, 0.06, 0.4), goldMat);
            edgeConn.position.set(0, -BD / 2 - 0.02, BH / 2 - 0.15);
            group.add(edgeConn);
            // Gold teeth on connector
            for (let i = 0; i < 12; i++) {
                const tooth = new T.Mesh(new T.BoxGeometry(0.12, 0.07, 0.08), goldMat);
                tooth.position.set(-1.1 + i * 0.2, BD / 2 + 0.01, BH / 2 - 0.05);
                group.add(tooth);
            }

            // ---- PINS (0, 1, 2, 3V, GND) ----
            const pins = [{ x: -1.2, l: '0' }, { x: -0.5, l: '1' }, { x: 0.5, l: '2' }, { x: 1.0, l: '3V' }, { x: 1.35, l: 'GND' }];
            pins.forEach(p => {
                const ring = new T.Mesh(new T.TorusGeometry(0.15, 0.04, 8, 20), goldMat);
                ring.position.set(p.x, BD / 2 + 0.03, BH / 2 - 0.15);
                ring.rotation.x = Math.PI / 2;
                group.add(ring);
                const hole = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, BD + 0.08, 12), darkMat);
                hole.position.set(p.x, 0, BH / 2 - 0.15);
                group.add(hole);
                pinRings[p.l] = ring;
            });

            // ---- 5×5 LED MATRIX ----
            leds = []; ledGlows = [];
            const sp = 0.34, sx = -sp * 2, sz = -sp * 2 - 0.15;
            for (let r = 0; r < 5; r++) {
                leds[r] = []; ledGlows[r] = [];
                for (let c = 0; c < 5; c++) {
                    // LED cube — taller, always slightly visible
                    const led = new T.Mesh(
                        new T.BoxGeometry(0.22, 0.12, 0.22),
                        new T.MeshStandardMaterial({ color: 0x551111, roughness: 0.4, metalness: 0.15, emissive: 0x220000, emissiveIntensity: 0.1 })
                    );
                    led.position.set(sx + c * sp, BD / 2 + 0.06, sz + r * sp);
                    led.castShadow = true;
                    group.add(led);
                    leds[r][c] = led;

                    // Glow plane
                    const glow = new T.Mesh(
                        new T.PlaneGeometry(0.32, 0.32),
                        new T.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0, side: T.DoubleSide })
                    );
                    glow.position.set(sx + c * sp, BD / 2 + 0.13, sz + r * sp);
                    glow.rotation.x = -Math.PI / 2;
                    group.add(glow);
                    ledGlows[r][c] = glow;
                }
            }

            // ---- BUTTONS A & B ----
            // Housing rings (gray circles so buttons are clearly visible)
            const housingGeo = new T.CylinderGeometry(0.32, 0.32, 0.05, 20);
            btnHousingA = new T.Mesh(housingGeo, housingMat);
            btnHousingA.position.set(-1.3, BD / 2 + 0.025, -0.15);
            group.add(btnHousingA);

            btnHousingB = new T.Mesh(housingGeo.clone(), housingMat);
            btnHousingB.position.set(1.3, BD / 2 + 0.025, -0.15);
            group.add(btnHousingB);

            // Actual buttons (larger, visible)
            const bGeo = new T.CylinderGeometry(0.22, 0.22, 0.1, 18);
            buttonA = new T.Mesh(bGeo, btnBlackMat);
            buttonA.position.set(-1.3, BD / 2 + 0.07, -0.15);
            group.add(buttonA);

            buttonB = new T.Mesh(bGeo.clone(), btnBlackMat);
            buttonB.position.set(1.3, BD / 2 + 0.07, -0.15);
            group.add(buttonB);

            // Button labels (A / B silk dots)
            const lblGeo = new T.CircleGeometry(0.08, 14);
            [[-1.3, -0.48], [1.3, -0.48]].forEach(([x, z]) => {
                const lbl = new T.Mesh(lblGeo, silkMat);
                lbl.position.set(x, BD / 2 + 0.015, z);
                lbl.rotation.x = -Math.PI / 2;
                group.add(lbl);
            });

            // ---- PROCESSOR (large IC) ----
            const proc = new T.Mesh(new T.BoxGeometry(0.55, 0.08, 0.55), chipMat);
            proc.position.set(0, BD / 2 + 0.04, 0.6);
            proc.castShadow = true;
            group.add(proc);
            // IC legs (small gold strips)
            for (let side = 0; side < 4; side++) {
                for (let i = 0; i < 4; i++) {
                    const leg = new T.Mesh(new T.BoxGeometry(side < 2 ? 0.03 : 0.08, 0.01, side < 2 ? 0.08 : 0.03), goldMat);
                    const offset = -0.18 + i * 0.12;
                    if (side === 0) leg.position.set(-0.3, BD / 2 + 0.02, 0.6 + offset);
                    else if (side === 1) leg.position.set(0.3, BD / 2 + 0.02, 0.6 + offset);
                    else if (side === 2) leg.position.set(offset, BD / 2 + 0.02, 0.6 - 0.3);
                    else leg.position.set(offset, BD / 2 + 0.02, 0.6 + 0.3);
                    group.add(leg);
                }
            }

            // Sensor chip
            const sensorChip = new T.Mesh(new T.BoxGeometry(0.3, 0.06, 0.3), chipMat);
            sensorChip.position.set(0.75, BD / 2 + 0.03, 0.6);
            group.add(sensorChip);

            // ---- USB PORT ----
            const usb = new T.Mesh(new T.BoxGeometry(0.6, 0.2, 0.3), usbMat);
            usb.position.set(0, BD / 2 + 0.08, -BH / 2 + 0.08);
            usb.castShadow = true;
            group.add(usb);
            // USB socket hole
            const usbHole = new T.Mesh(new T.BoxGeometry(0.4, 0.1, 0.05), darkMat);
            usbHole.position.set(0, BD / 2 + 0.08, -BH / 2 - 0.02);
            group.add(usbHole);

            // ---- BATTERY CONNECTOR ----
            const batt = new T.Mesh(new T.BoxGeometry(0.5, 0.25, 0.2), battMat);
            batt.position.set(0.75, -BD / 2 - 0.1, -BH / 2 + 0.15);
            group.add(batt);

            // ---- SPEAKER GRILLE ----
            for (let i = 0; i < 5; i++) {
                const slot = new T.Mesh(new T.BoxGeometry(0.4, 0.03, 0.05), darkMat);
                slot.position.set(-0.55, -BD / 2 - 0.015, 0.25 + i * 0.1);
                group.add(slot);
            }

            // ---- LOGO (touch sensor) ----
            logo = new T.Mesh(
                new T.CylinderGeometry(0.18, 0.18, 0.03, 18),
                new T.MeshStandardMaterial({ color: 0xffd700, roughness: 0.2, metalness: 0.7, emissive: 0xffd700, emissiveIntensity: 0.1 })
            );
            logo.position.set(0, BD / 2 + 0.03, 0.9);
            group.add(logo);

            // ---- ANTENNA ----
            const antenna = new T.Mesh(new T.BoxGeometry(0.45, 0.015, 0.35), new T.MeshStandardMaterial({ color: 0x2a3a4e, roughness: 0.8 }));
            antenna.position.set(-0.65, BD / 2 + 0.015, -0.7);
            group.add(antenna);

            // ---- SILK SCREEN LABELS (A, B markers) ----
            const slGeo = new T.BoxGeometry(0.15, 0.012, 0.08);
            const silkA = new T.Mesh(slGeo, silkMat);
            silkA.position.set(-1.3, BD / 2 + 0.015, -0.48);
            group.add(silkA);
            const silkB = new T.Mesh(slGeo, silkMat);
            silkB.position.set(1.3, BD / 2 + 0.015, -0.48);
            group.add(silkB);

            // ---- SILK TEXT: "micro:bit" ----
            const txtGeo = new T.BoxGeometry(0.8, 0.012, 0.08);
            const silkTxt = new T.Mesh(txtGeo, silkMat);
            silkTxt.position.set(0, BD / 2 + 0.015, -0.9);
            group.add(silkTxt);
        },

        update(D) {
            if (!group) return;

            // LEDs
            for (let r = 0; r < 5; r++) {
                for (let c = 0; c < 5; c++) {
                    const on = D.ledState[r]?.[c];
                    const m = leds[r][c].material;
                    if (on) {
                        m.color.setHex(0xff2200);
                        m.emissive.setHex(0xff2200);
                        m.emissiveIntensity = 1.0;
                        ledGlows[r][c].material.opacity = 0.5;
                    } else {
                        m.color.setHex(0x551111);
                        m.emissive.setHex(0x220000);
                        m.emissiveIntensity = 0.1;
                        ledGlows[r][c].material.opacity = 0;
                    }
                }
            }

            // Tilt with accelerometer
            if (D.sync) {
                const tx = Math.max(-0.5, Math.min(0.5, D.accel.y / 1024 * 0.5));
                const tz = Math.max(-0.5, Math.min(0.5, D.accel.x / 1024 * 0.5));
                group.rotation.x += (tx - group.rotation.x) * 0.08;
                group.rotation.z += (-tz - group.rotation.z) * 0.08;
            } else {
                group.rotation.x *= 0.95;
                group.rotation.z *= 0.95;
            }

            // Buttons — press down + green glow
            const topY = BD / 2;
            if (buttonA) {
                buttonA.material = D.btnA ? btnPressedMat : btnBlackMat;
                buttonA.position.y = D.btnA ? topY + 0.02 : topY + 0.07;
            }
            if (btnHousingA) btnHousingA.material.emissive = D.btnA ? new THREE.Color(0x115522) : new THREE.Color(0x000000);

            if (buttonB) {
                buttonB.material = D.btnB ? btnPressedMat : btnBlackMat;
                buttonB.position.y = D.btnB ? topY + 0.02 : topY + 0.07;
            }
            if (btnHousingB) btnHousingB.material.emissive = D.btnB ? new THREE.Color(0x115522) : new THREE.Color(0x000000);

            // Touch pins glow
            const pulse = 0.6 + Math.sin(Date.now() * 0.01) * 0.3;
            ['0', '1', '2'].forEach((k, i) => {
                const touched = [D.touchP0, D.touchP1, D.touchP2][i];
                if (pinRings[k]) {
                    pinRings[k].material = touched ? pinGlowMats[k] : goldMat;
                    if (touched) pinGlowMats[k].emissiveIntensity = pulse;
                }
            });

            // Logo touch glow
            if (logo) logo.material.emissiveIntensity = D.logo ? 0.9 : 0.1;

            // Temperature tint (PCB color shifts)
            const temp = Math.max(0, Math.min(50, D.temp));
            const shift = (temp / 50) * 0.15;
            pcbMat.color.setHSL(0.42 - shift, 0.35 + shift * 0.5, 0.16);
        },

        destroy(scene) {
            if (group) {
                scene.remove(group);
                group.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material?.dispose) c.material.dispose(); });
                group = null; leds = []; ledGlows = []; logo = null; buttonA = null; buttonB = null; btnHousingA = null; btnHousingB = null; pinRings = {};
            }
        }
    };

    window.board3dModels = window.board3dModels || {};
    window.board3dModels.microbit = model;
})();
