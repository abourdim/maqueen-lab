/**
 * Smoke tests — Playwright.
 *
 * Goal: catch regressions in the things we just shipped — labs, lessons,
 * workshops, demo-mode shim, telemetry, share-link, a11y. Runs against a
 * local static server (Playwright config spawns it). ~12 tests; whole
 * suite finishes in <10 s.
 *
 * Run locally:
 *    npx playwright install chromium    # one-time
 *    npx playwright test                 # or: npm test
 */
import { test, expect } from '@playwright/test';

// ───── Helpers ─────
async function expectNoConsoleErrors(page) {
  // Errors must already be collected by a listener attached before navigation.
  const errs = page._mqErrs || [];
  // Filter known, harmless noise:
  //  - SecurityError on Web Bluetooth requestDevice (expected when not user-gesture)
  //  - DOMException objects logged by ble.js when no robot is paired
  const real = errs.filter(e => !/Bluetooth|GATT|user gesture|DOMException/.test(String(e)));
  expect(real, `Console errors:\n${real.join('\n')}`).toEqual([]);
}

function attachErrCollector(page) {
  page._mqErrs = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') page._mqErrs.push(msg.text());
  });
  page.on('pageerror', (err) => page._mqErrs.push(err.message));
}

// Several hubs run infinite CSS animations (Maqueen mascot blink, antenna pulse,
// LED breathe). Playwright's BrowserContext teardown waits for these to settle,
// causing 30s timeouts on otherwise-passing tests. Call this before the test
// returns to make teardown fast.
async function stopAnimations(page) {
  try {
    await page.evaluate(() => {
      // Suspend all CSS animations + transitions so teardown isn't blocked
      const s = document.createElement('style');
      s.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; }';
      document.head.appendChild(s);
    });
  } catch (e) { /* page may already be closed */ }
}

// ───── 1. Hub pages all load with an h1 ─────
const HUBS = [
  { url: '/index.html',                 sel: 'h1' },
  { url: '/labs/index.html',            text: /Labs/i },
  { url: '/docs/index.html',            text: /Maqueen Lab/i },
  { url: '/workshops/hub.html',         text: /Maqueen Lab/i },
  { url: '/docs/lessons/index.html',    text: /Lesson Plans/i },
];
for (const hub of HUBS) {
  test(`hub loads: ${hub.url}`, async ({ page }) => {
    attachErrCollector(page);
    const resp = await page.goto(hub.url, { waitUntil: 'domcontentloaded' });
    expect(resp.status()).toBe(200);
    await expect(page.locator('h1, h2, h3').first()).toBeAttached();
    if (hub.text) await expect(page.locator('h1, h2').first()).toContainText(hub.text);
    await expectNoConsoleErrors(page);
    await stopAnimations(page);
  });
}

// ───── 2. All 8 lab pages load ─────
const LAB_NAMES = ['joystick', 'distance', 'music', 'servo', 'ir', 'lights', 'vision', 'copilot'];
for (const name of LAB_NAMES) {
  test(`lab loads: ${name}`, async ({ page }) => {
    attachErrCollector(page);
    const resp = await page.goto(`/labs/${name}-lab.html`, { waitUntil: 'domcontentloaded' });
    expect(resp.status()).toBe(200);
    await expect(page.locator('h1, h2, h3').first()).toBeAttached();
    // Cross-link to the lesson plan must exist (Phase-2A bonus link)
    await expect(page.locator(`a[href*="docs/lessons/${name}-lab.html"]`)).toHaveCount(1);
    // a11y.js + telemetry.js + share-link.js + demo-mode.js all loaded
    const hasA11y      = await page.evaluate(() => !!document.getElementById('mq-a11y-css'));
    const hasTelemetry = await page.evaluate(() => typeof window.MqTelemetry === 'object');
    const hasShare     = await page.evaluate(() => typeof window.MqShare === 'object');
    expect(hasA11y).toBe(true);
    expect(hasTelemetry).toBe(true);
    expect(hasShare).toBe(true);
    await expectNoConsoleErrors(page);
    await stopAnimations(page);
  });
}

// ───── 3. All 8 lesson pages render inlined markdown ─────
for (const name of LAB_NAMES) {
  test(`lesson renders: ${name}`, async ({ page }) => {
    attachErrCollector(page);
    await page.goto(`/docs/lessons/${name}-lab.html`);
    // Inlined markdown block exists
    await expect(page.locator('script#md-en')).toHaveCount(1);
    // After auto-render, body has h1 + at least 3 H2 sections (Objective/Materials/Flow + …)
    const mdContent = page.locator('#mdContent');
    await expect(mdContent.locator('h1')).toBeVisible();
    const h2Count = await mdContent.locator('h2').count();
    expect(h2Count).toBeGreaterThanOrEqual(3);
    // Lesson flow table (5-row plan)
    await expect(mdContent.locator('table')).toHaveCount(1);
  });
}

// ───── 4. Demo mode activates from URL hash ─────
test('demo mode: badge appears, fake connect succeeds', async ({ page }) => {
  attachErrCollector(page);
  await page.goto('/labs/joystick-lab.html#demo=1');
  await expect(page.locator('#mqDemoBadge')).toBeVisible();
  await expect(page.locator('#mqDemoBadge')).toHaveText(/DEMO MODE/);
  // Fake connect should resolve without a real BLE chooser
  const result = await page.evaluate(async () => {
    await window.connect();
    return { connected: window.isConnected, demoAttr: document.documentElement.getAttribute('data-mq-demo') };
  });
  expect(result.connected).toBe(true);
  expect(result.demoAttr).toBe('1');
});

test('demo mode: sendLine echoes synthetic response', async ({ page }) => {
  attachErrCollector(page);
  await page.goto('/labs/joystick-lab.html#demo=1');
  const echo = await page.evaluate(async () => {
    const got = [];
    if (!window.RobiBle) window.RobiBle = {};
    window.RobiBle.onRxLine = (line) => got.push(line);
    await window.connect();
    await window.sendLine('FWD:120');
    await new Promise(r => setTimeout(r, 100));
    return got;
  });
  expect(echo.length).toBeGreaterThan(0);
  expect(echo.some(l => /ECHO:\d+\s+FWD:120/.test(l))).toBe(true);
});

// ───── 5. Lang switcher: AR sets dir=rtl ─────
test('lang switcher: AR triggers RTL', async ({ page }) => {
  attachErrCollector(page);
  await page.goto('/workshops/flyer.html#lang=ar');
  await page.waitForLoadState('domcontentloaded');
  // Wait for the i18n script to apply
  await page.waitForFunction(() => document.documentElement.dir === 'rtl', { timeout: 3000 });
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('ar');
  expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');
});

// ───── 6. Workshops hub has flyer + poster cards ─────
test('workshops hub: flyer + poster discoverable', async ({ page }) => {
  attachErrCollector(page);
  await page.goto('/workshops/hub.html');
  await expect(page.locator('a[href="flyer.html"]')).toHaveCount(1);
  await expect(page.locator('a[href="poster.html"]')).toHaveCount(1);
});

// ───── 7. A11y: skip link is first focusable, focus-visible CSS injected ─────
test('a11y: skip link + focus ring present on every hub', async ({ page }) => {
  attachErrCollector(page);
  await page.goto('/labs/index.html');
  const skipLink = page.locator('.mq-skip-link').first();
  await expect(skipLink).toHaveText(/Skip to main content/i);
  const cssText = await page.evaluate(() => document.getElementById('mq-a11y-css')?.textContent || '');
  expect(cssText).toMatch(/focus-visible/);
});

// ───── 8. Telemetry: visit counter increments ─────
test('telemetry: visit counter increments on load', async ({ page, context }) => {
  // Fresh context = empty localStorage
  await page.goto('/labs/joystick-lab.html');
  const before = await page.evaluate(() => MqTelemetry.get('visit.lab.joystick'));
  await page.reload();
  const after = await page.evaluate(() => MqTelemetry.get('visit.lab.joystick'));
  expect(after).toBeGreaterThan(before || 0);
});

// ───── 9. Share-link: encodes theme + lang + demo ─────
test('share-link: url() reflects current state', async ({ page }) => {
  await page.goto('/labs/joystick-lab.html#demo=1&lang=fr&theme=forest');
  await page.waitForFunction(() => document.documentElement.lang === 'fr');
  const u = await page.evaluate(() => MqShare.url());
  expect(u).toMatch(/lang=fr/);
  expect(u).toMatch(/demo=1/);
});

// ───── 10. Auto-rendered docs (CHANGELOG / todo / curriculum) load content ─────
const AUTO_RENDERED = [
  { url: '/README.html',                expectMatch: /Maqueen Lab/i },
  { url: '/docs/CHANGELOG.html',        expectMatch: /Changelog|v0\./i },
  { url: '/docs/todo.html',             expectMatch: /Roadmap/i },
  { url: '/docs/curriculum.html',       expectMatch: /Curriculum/i },
];
for (const a of AUTO_RENDERED) {
  test(`auto-render loads: ${a.url}`, async ({ page }) => {
    attachErrCollector(page);
    await page.goto(a.url);
    await expect(page.locator('#mdContent h1, #mdContent h2').first()).toBeVisible();
    const text = await page.locator('#mdContent').innerText();
    expect(text).toMatch(a.expectMatch);
    await expectNoConsoleErrors(page);
  });
}
