/**
 * Synthetic Chrome Web Bluetooth pairing-dialog screenshot.
 *
 * Real buyers' biggest hesitation on this kind of listing is "will Chrome
 * actually pair with my board?" A screenshot showing the native Chrome
 * Bluetooth picker with "BBC micro:bit [JqXtP]" highlighted answers
 * that fear directly. We can't screenshot the real OS dialog from
 * automated Playwright (it's a native browser UI, outside the page), so
 * we synthesise a pixel-accurate CSS replica and screenshot that.
 *
 * Output is composited with the app in the background + the Chrome
 * dialog floating over it → looks like a genuine "user about to pair"
 * moment.
 *
 * Requires: @playwright/test + chromium.
 *
 * Usage:
 *   node etsy-package/tools/fake-ble-dialog.mjs
 *
 * Output:
 *   output/ble-dialog/ble-pairing.png  (1080x1920 9:16, ready for listing)
 */

import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(__dirname, '..');
const ROOT = resolve(PKG, '..');
const INDEX = resolve(ROOT, 'index.html');
const OUT = resolve(PKG, 'output', 'shared', 'ble-dialog');
mkdirSync(OUT, { recursive: true });
const CFG = JSON.parse(readFileSync(resolve(__dirname, 'capture-config.json'), 'utf8'));

// Pixel-accurate clone of Chrome's BLE picker (desktop, Windows 11 theme).
// Dimensions match Chrome 118+ (~360x420 at 1x, we render it at 2x).
const DIALOG_HTML = (highlighted = 0) => {
  const devices = [
    { name: 'BBC micro:bit [JqXtP]',        subtitle: 'Paired',      strength: 4 },
    { name: 'BBC micro:bit [vaZig]',        subtitle: '',            strength: 3 },
    { name: 'uBit-vopit',                   subtitle: '',            strength: 2 },
    { name: 'Unknown or unsupported device', subtitle: '',           strength: 1 },
  ];
  return `
    <style>
      .chrome-dialog {
        position: absolute; top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        width: 360px; max-height: 480px;
        background: #fff; color: #202124;
        font-family: 'Segoe UI', -apple-system, Arial, sans-serif;
        border-radius: 8px;
        box-shadow: 0 6px 28px rgba(0,0,0,0.28), 0 0 0 1px rgba(0,0,0,0.06);
        display: flex; flex-direction: column;
        overflow: hidden;
        font-size: 13px;
      }
      .dialog-head {
        padding: 16px 20px 10px;
        border-bottom: 1px solid #e8eaed;
      }
      .dialog-title { font-size: 14px; font-weight: 500; line-height: 1.3; }
      .dialog-subtitle { font-size: 12px; color: #5f6368; margin-top: 2px; }
      .device-list { flex: 1; overflow-y: auto; }
      .device-row {
        padding: 10px 20px;
        display: flex; align-items: center; gap: 10px;
        cursor: default;
      }
      .device-row.highlighted { background: #e8f0fe; }
      .device-name { flex: 1; min-width: 0; }
      .device-primary { font-size: 13px; color: #202124; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .device-secondary { font-size: 11px; color: #5f6368; }
      .signal { width: 16px; height: 10px; display: flex; gap: 2px; align-items: flex-end; opacity: 0.85; }
      .signal span {
        width: 3px; background: #5f6368; border-radius: 1px;
      }
      .signal span:nth-child(1) { height: 25%; }
      .signal span:nth-child(2) { height: 50%; }
      .signal span:nth-child(3) { height: 75%; }
      .signal span:nth-child(4) { height: 100%; }
      .signal.s1 span:nth-child(n+2) { opacity: 0.2; }
      .signal.s2 span:nth-child(n+3) { opacity: 0.2; }
      .signal.s3 span:nth-child(4)    { opacity: 0.2; }
      .dialog-foot {
        display: flex; justify-content: flex-end; gap: 8px;
        padding: 12px 16px;
        border-top: 1px solid #e8eaed;
      }
      .btn {
        font-family: inherit; font-size: 13px;
        padding: 6px 16px; border-radius: 4px;
        border: 1px solid transparent; cursor: pointer;
      }
      .btn-cancel { background: #fff; color: #1a73e8; border-color: transparent; }
      .btn-pair { background: #1a73e8; color: #fff; font-weight: 500; }
      .scan-pulse {
        width: 8px; height: 8px; border-radius: 50%;
        background: #1a73e8; margin-right: 6px;
        animation: pulse 1.5s ease-in-out infinite;
        display: inline-block; vertical-align: middle;
      }
      @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.3 } }
    </style>
    <div class="chrome-dialog">
      <div class="dialog-head">
        <div class="dialog-title">bit-playground wants to pair</div>
        <div class="dialog-subtitle"><span class="scan-pulse"></span>Scanning for Bluetooth devices…</div>
      </div>
      <div class="device-list">
        ${devices.map((d, i) => `
          <div class="device-row ${i === highlighted ? 'highlighted' : ''}">
            <div class="device-name">
              <div class="device-primary">${d.name}</div>
              ${d.subtitle ? `<div class="device-secondary">${d.subtitle}</div>` : ''}
            </div>
            <div class="signal s${d.strength}"><span></span><span></span><span></span><span></span></div>
          </div>
        `).join('')}
      </div>
      <div class="dialog-foot">
        <button class="btn btn-cancel">Cancel</button>
        <button class="btn btn-pair">Pair</button>
      </div>
    </div>
  `;
};

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(`file://${INDEX.replace(/\\/g, '/')}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);

  // Seed onboarding state so we start on the Drive tab with a populated UI
  if (CFG.onboarding?.localStorageKey) {
    await page.evaluate(k => { try { localStorage.setItem(k, '1'); } catch {} }, CFG.onboarding.localStorageKey);
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // Go to Controls tab so the "Connect" button is visible behind the dialog
  const tab = (CFG.tabs || []).find(t => t.slug === 'controls');
  if (tab) await page.locator(tab.selector).click();
  await page.waitForTimeout(500);

  // Inject the synthetic dialog over the page with a dark backdrop.
  await page.evaluate((html) => {
    document.querySelectorAll('.toast, .toast-container > *').forEach(e => e.remove());
    const tc = document.querySelector('.toast-container'); if (tc) tc.style.display = 'none';
    const overlay = document.createElement('div');
    overlay.id = '__ble_dialog__';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);pointer-events:none;';
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
  }, DIALOG_HTML(0));
  await page.waitForTimeout(300);

  const out = join(OUT, 'ble-pairing.png');
  await page.screenshot({ path: out });
  console.log(`  ✓ ${out}`);

  // Second variant: no backdrop, just the dialog in a lifted frame (for print)
  await page.evaluate(() => {
    const o = document.getElementById('__ble_dialog__');
    if (o) o.style.background = 'linear-gradient(180deg, rgba(10,14,18,0.9), rgba(10,14,18,0.65))';
  });
  const out2 = join(OUT, 'ble-pairing-lifted.png');
  await page.screenshot({ path: out2 });
  console.log(`  ✓ ${out2}`);

  await ctx.close();
} finally {
  await browser.close();
}

console.log(`\n✅ ${OUT}\n`);
