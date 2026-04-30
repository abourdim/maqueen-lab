// ============================================================
// board3d.js — 3D Engine: scene, camera, orbit, model switcher
// ============================================================

(function () {
    'use strict';

    const container = document.getElementById('board3dContainer');
    const canvas = document.getElementById('board3dCanvas');
    if (!container || !canvas || typeof THREE === 'undefined') return;

    // ==================== SCENE ====================

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1e2d3d);

    const camera = new THREE.PerspectiveCamera(40, 2, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // ==================== LIGHTS ====================

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));

    var mainLight = new THREE.DirectionalLight(0xffffff, 0.9);
    mainLight.position.set(3, 5, 4);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 1024;
    mainLight.shadow.mapSize.height = 1024;
    scene.add(mainLight);

    var fillLight = new THREE.DirectionalLight(0x8888ff, 0.4);
    fillLight.position.set(-3, 2, -2);
    scene.add(fillLight);

    var rimLight = new THREE.PointLight(0xffaa44, 0.5, 12);
    rimLight.position.set(0, -2, 3);
    scene.add(rimLight);

    // Top fill for LED visibility
    var topLight = new THREE.PointLight(0xffffff, 0.3, 15);
    topLight.position.set(0, 5, 0);
    scene.add(topLight);

    // Ground
    var ground = new THREE.Mesh(
        new THREE.PlaneGeometry(14, 14),
        new THREE.ShadowMaterial({ opacity: 0.15 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.5;
    ground.receiveShadow = true;
    scene.add(ground);

    // ==================== ORBIT CONTROLS ====================

    var isDragging = false, prevMouse = { x: 0, y: 0 };
    var spherical = { theta: 0, phi: Math.PI / 4, radius: 6 };
    var autoRotate = false;

    function updateCamera() {
        camera.position.set(
            spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta),
            spherical.radius * Math.cos(spherical.phi),
            spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta)
        );
        camera.lookAt(0, 0, 0);
    }

    canvas.addEventListener('pointerdown', function (e) {
        isDragging = true;
        prevMouse = { x: e.clientX, y: e.clientY };
        canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', function (e) {
        if (!isDragging) return;
        spherical.theta -= (e.clientX - prevMouse.x) * 0.008;
        spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1,
            spherical.phi + (e.clientY - prevMouse.y) * 0.008));
        prevMouse = { x: e.clientX, y: e.clientY };
        updateCamera();
    });
    canvas.addEventListener('pointerup', function () { isDragging = false; });
    canvas.addEventListener('wheel', function (e) {
        e.preventDefault();
        spherical.radius = Math.max(2, Math.min(15, spherical.radius + e.deltaY * 0.005));
        updateCamera();
    }, { passive: false });

    var touchDist = 0;
    canvas.addEventListener('touchstart', function (e) {
        if (e.touches.length === 2) {
            var dx = e.touches[0].clientX - e.touches[1].clientX;
            var dy = e.touches[0].clientY - e.touches[1].clientY;
            touchDist = Math.sqrt(dx * dx + dy * dy);
        }
    });
    canvas.addEventListener('touchmove', function (e) {
        if (e.touches.length === 2) {
            var dx = e.touches[0].clientX - e.touches[1].clientX;
            var dy = e.touches[0].clientY - e.touches[1].clientY;
            var d = Math.sqrt(dx * dx + dy * dy);
            spherical.radius = Math.max(2, Math.min(15, spherical.radius - (d - touchDist) * 0.02));
            touchDist = d;
            updateCamera();
        }
    });
    updateCamera();

    // ==================== LIVE DATA STATE ====================

    var D = {
        sync: true,
        ledState: Array.from({ length: 5 }, function () { return Array(5).fill(false); }),
        ledFW: false,
        accel: { x: 0, y: 0, z: 0 },
        temp: 22,
        btnA: false, btnB: false,
        touchP0: false, touchP1: false, touchP2: false,
        logo: false,
        compass: 0,
        servo1: 90, servo2: 90,
        light: 128, sound: 0
    };

    window.board3dUpdate = function (type, val) {
        if (!D.sync) return;
        switch (type) {
            case 'led': D.ledState = val; break;
            case 'leds': D.ledState = val; D.ledFW = true; break;
            case 'accel': D.accel = val; break;
            case 'temp': D.temp = val; break;
            case 'btnA': D.btnA = val; break;
            case 'btnB': D.btnB = val; break;
            case 'touchP0': D.touchP0 = val; break;
            case 'touchP1': D.touchP1 = val; break;
            case 'touchP2': D.touchP2 = val; break;
            case 'logo': D.logo = val; break;
            case 'compass': D.compass = val; break;
            case 'servo1': D.servo1 = val; break;
            case 'servo2': D.servo2 = val; break;
            case 'light': D.light = val; break;
            case 'sound': D.sound = val; break;
        }
    };

    // Poll LED state fallback
    setInterval(function () {
        if (D.ledFW) return;
        if (window.ledState) {
            for (var r = 0; r < 5; r++)
                for (var c = 0; c < 5; c++)
                    D.ledState[r][c] = window.ledState[r] ? (window.ledState[r][c] || false) : false;
        }
    }, 100);

    // ==================== MODEL REGISTRY ====================

    window.board3dModels = window.board3dModels || {};
    var activeName = '';
    var activeModel = null;

    function switchModel(name) {
        if (name === activeName && activeModel) return;
        if (activeModel && activeModel.destroy) activeModel.destroy(scene);

        var M = window.board3dModels[name];
        if (!M) {
            console.warn('[3D] Model not found:', name, 'available:', Object.keys(window.board3dModels));
            return;
        }

        activeModel = M;
        activeName = name;

        try {
            if (M.create) M.create(scene, THREE);
            debugLog('Created: ' + name + ' | Scene: ' + scene.children.length);
        } catch (err) {
            debugLog('ERROR creating ' + name + ': ' + err.message);
            console.error('[3D] Model create error:', err);
        }

        if (M.camera) {
            spherical = {
                theta: M.camera.theta || 0,
                phi: M.camera.phi || Math.PI / 4,
                radius: M.camera.radius || 6
            };
            updateCamera();
        }

        scene.background = M.background ? new THREE.Color(M.background) : new THREE.Color(0x1e2d3d);
        ground.position.y = (M.groundY !== undefined) ? M.groundY : -1.5;

        try { localStorage.setItem('mb_board3d_model', name); } catch (e) {}

        // Force resize after model switch (tab might now be visible)
        setTimeout(onResize, 30);
    }

    // ==================== RESIZE ====================

    function onResize() {
        var rect = container.getBoundingClientRect();
        var w = rect.width;
        var h = rect.height;
        // If tab is hidden, dimensions are 0 — skip
        if (w < 10 || h < 10) return;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        if (debugEl) debugEl.textContent = 'Canvas: ' + Math.round(w) + 'x' + Math.round(h) + ' | Model: ' + activeName + ' | Scene: ' + scene.children.length;
    }

    // Watch for tab show
    var tabPage = container.closest('.tab-page');
    if (tabPage) {
        var observer = new MutationObserver(function () {
            if (tabPage.classList.contains('active')) {
                setTimeout(onResize, 50);
                setTimeout(onResize, 200); // double-tap for safety
            }
        });
        observer.observe(tabPage, { attributes: true, attributeFilter: ['class'] });
    }
    window.addEventListener('resize', onResize);

    // ==================== DEBUG INFO ====================

    // Visible debug overlay (remove once working)
    var debugEl = document.createElement('div');
    debugEl.style.cssText = 'position:absolute;top:4px;left:4px;color:#888;font:10px monospace;z-index:10;pointer-events:none;';
    container.style.position = 'relative';
    container.appendChild(debugEl);

    function debugLog(msg) {
        console.log('[3D]', msg);
        debugEl.textContent = msg;
    }

    // ==================== ANIMATION ====================

    var frameCount = 0;

    function animate() {
        requestAnimationFrame(animate);

        // Force resize on first few visible frames
        if (frameCount < 10) {
            frameCount++;
            onResize();
        }

        if (autoRotate && !isDragging) {
            spherical.theta += 0.005;
            updateCamera();
        }

        var ai = document.getElementById('board3dAccelInfo');
        if (ai) ai.textContent = 'Accel: ' + D.accel.x + ',' + D.accel.y + ',' + D.accel.z;
        var ti = document.getElementById('board3dTempInfo');
        if (ti) ti.textContent = 'Temp: ' + D.temp + '\u00B0C';

        if (activeModel && activeModel.update) {
            try {
                activeModel.update(D, scene, THREE);
            } catch (err) {
                console.error('[3D] Model update error:', err);
            }
        }

        renderer.render(scene, camera);
    }

    // ==================== UI ====================

    var sel = document.getElementById('board3dModel');

    document.getElementById('board3dResetView')?.addEventListener('click', function () {
        var c = (activeModel && activeModel.camera) ? activeModel.camera : {};
        spherical = {
            theta: c.theta || 0,
            phi: c.phi || Math.PI / 4,
            radius: c.radius || 6
        };
        updateCamera();
    });

    document.getElementById('board3dAutoRotate')?.addEventListener('click', function () {
        autoRotate = !autoRotate;
        this.classList.toggle('active', autoRotate);
        this.textContent = autoRotate ? '🔁 Stop' : '🔁 Auto Rotate';
    });

    document.getElementById('board3dLiveSync')?.addEventListener('click', function () {
        D.sync = !D.sync;
        this.classList.toggle('active', D.sync);
        this.textContent = D.sync ? '📡 Live Sync' : '📡 Sync Off';
    });

    if (sel) sel.addEventListener('change', function () { switchModel(sel.value); });

    // ==================== INIT ====================

    // Debug helper: test cube to verify renderer works
    var testCube = null;
    function showTestCube() {
        testCube = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshStandardMaterial({ color: 0xff4444 })
        );
        testCube.position.set(0, 0, 0);
        scene.add(testCube);
    }
    function removeTestCube() {
        if (testCube) { scene.remove(testCube); testCube = null; }
    }

    // Models register via defer scripts before this.
    function tryInit() {
        var models = window.board3dModels || {};
        var keys = Object.keys(models);
        debugLog('Models: ' + (keys.length ? keys.join(', ') : 'NONE'));

        if (keys.length === 0) {
            showTestCube();
            setTimeout(tryInit, 500);
            return;
        }

        removeTestCube();

        var saved = '';
        try { saved = localStorage.getItem('mb_board3d_model') || ''; } catch (e) {}
        var init = (saved && models[saved]) ? saved : keys[0];

        debugLog('Loading: ' + init);
        if (sel) sel.value = init;
        switchModel(init);
        debugLog('Active: ' + activeName + ' | Scene children: ' + scene.children.length);
    }

    setTimeout(function () {
        tryInit();
        animate();
    }, 80);

})();
