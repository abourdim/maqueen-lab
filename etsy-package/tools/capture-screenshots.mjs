/**
 * Config-driven Playwright capturer for the Etsy marketing pipeline.
 *
 * Reads `capture-config.json` (same folder) for all product-specific
 * selectors and values. **Do not edit this script per product — edit
 * the config.** If the config file is missing, exits with instructions.
 *
 * Modes (pass as first arg; default = "all"):
 *   tabs        — all tabs at default state
 *   synthetic   — tabs with mock BLE/sensor data injected (alive-looking)
 *   pairs       — before/after state pairs for video dissolves
 *   themes      — each configured theme on Controls tab (or heroTabs[0])
 *   models      — each configured variant on its tab
 *   offline     — app with "OFFLINE MODE" proof overlay
 *   annotated   — SVG callouts drawn on configured scenes
 *   aspects     — each hero tab rendered at 4 viewport aspect ratios
 *   audiences   — per-persona composite shots (theme + tab + state)
 *   alt         — regenerate .alt.txt next to each PNG (read-only)
 *   all         — everything (long run, ~1 min)
 *
 * All output lands in seller-only/screenshots/. Idempotent.
 */

import { chromium } from '@playwright/test';
import { mkdirSync, existsSync, writeFileSync, readdirSync, readFileSync } from 'fs';
import { resolve, dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';

// --lang <code> renders the app in that language via the hash router
// (#lang=fr) and writes outputs under output/<lang>/screenshots/ so
// localized assets never clobber the default (EN) set.
const argLangIdx = process.argv.indexOf('--lang');
const LANG = argLangIdx > 0 ? process.argv[argLangIdx + 1] : 'en';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG  = resolve(__dirname, '..');
const ROOT = resolve(PKG, '..');
const INDEX = resolve(ROOT, 'index.html');
const OUT = resolve(PKG, 'output', LANG, 'screenshots');
const CONFIG_PATH = resolve(__dirname, 'capture-config.json');
mkdirSync(OUT, { recursive: true });

// Mode: default "all" but skip a --lang arg if present.
const modeArg = process.argv.find((a, i) => i >= 2 && !a.startsWith('--') && process.argv[i - 1] !== '--lang');
const MODE = modeArg || 'all';
const LANDSCAPE = { width: 2200, height: 1500 };

if (!existsSync(INDEX))        { console.error(`❌ app not found at ${INDEX}`); process.exit(1); }
if (!existsSync(CONFIG_PATH))  { console.error(`❌ capture-config.json missing at ${CONFIG_PATH}\n   Copy capture-config.example.json or follow the template.`); process.exit(1); }

const CFG = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

// ---------- helpers tied to CFG ----------

async function newPage(browser, viewport = LANDSCAPE) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const langHash = LANG !== 'en' ? `#lang=${LANG}` : '';
  await page.goto(`file://${INDEX.replace(/\\/g, '/')}${langHash}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  if (CFG.onboarding) {
    const { localStorageKey } = CFG.onboarding;
    await page.evaluate((k) => {
      try {
        if (k) localStorage.setItem(k, '1');
        if (window.__cfg_theme) localStorage.setItem(window.__cfg_theme, window.__cfg_defaultTheme);
      } catch {}
    }, localStorageKey);
  }
  await page.evaluate(({ storageKey, defTheme }) => {
    try { if (storageKey && defTheme) localStorage.setItem(storageKey, defTheme); } catch {}
  }, { storageKey: CFG.theme?.storageKey, defTheme: CFG.theme?.default });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  // Dismiss onboarding close buttons
  if (CFG.onboarding?.closeSelectors?.length) {
    for (const sel of CFG.onboarding.closeSelectors) {
      const loc = page.locator(sel);
      const n = await loc.count();
      for (let i = 0; i < n; i++) { try { await loc.nth(i).click({ timeout: 400 }); } catch {} }
    }
  }
  return { ctx, page };
}

// Content-tight screenshot — clips to configured app container + hides toasts.
async function shot(page, path) {
  await page.evaluate((tcSel) => {
    if (tcSel) {
      const tc = document.querySelector(tcSel);
      if (tc) tc.style.display = 'none';
      document.querySelectorAll('.toast, .toast-container > *').forEach(e => e.remove());
    }
  }, CFG.toastContainer);
  const sel = CFG.appContainer || 'body';
  const target = page.locator(sel).first();
  if (await target.count()) { await target.screenshot({ path }); return; }
  await page.screenshot({ path });
}

const tabBySlug = (slug) => CFG.tabs.find(t => t.slug === slug);

async function switchTab(page, slug) {
  const tab = tabBySlug(slug);
  if (!tab) return false;
  if (tab.requiresExpert && CFG.expertMode?.toggleSelector) {
    const exp = page.locator(CFG.expertMode.toggleSelector);
    if (await exp.count()) { try { await exp.click({ timeout: 500 }); } catch {} await page.waitForTimeout(300); }
  }
  const btn = page.locator(tab.selector);
  if (await btn.count() === 0) return false;
  if (tab.noClick) { try { await btn.scrollIntoViewIfNeeded({ timeout: 2000 }); } catch {} } else { try { await btn.click({ timeout: 3000 }); } catch { try { await btn.scrollIntoViewIfNeeded({ timeout: 1000 }); } catch {} } }
  await page.waitForTimeout(tab.settle ?? 500);
  if (tab.prep?.action === 'click') {
    const p = page.locator(tab.prep.selector).first();
    if (await p.count()) { try { await p.click({ timeout: 1000 }); await page.waitForTimeout(tab.prep.wait ?? 1000); } catch {} }
  }
  return true;
}

async function setTheme(page, theme) {
  const cfg = CFG.theme;
  if (!cfg) return;
  await page.evaluate(({ sel, attr, value, storageKey }) => {
    const el = sel === 'html' ? document.documentElement : document.querySelector(sel);
    if (el && attr) el.setAttribute(attr, value);
    try { if (storageKey) localStorage.setItem(storageKey, value); } catch {}
  }, { sel: cfg.attrTarget || 'html', attr: cfg.attr, value: theme, storageKey: cfg.storageKey });
  await page.waitForTimeout(300);
}

async function selectVariant(page, variantKey) {
  const v = CFG.variants?.[variantKey];
  if (!v) return false;
  if (v.tabSlug) await switchTab(page, v.tabSlug);
  if (v.type === 'select') {
    const sel = page.locator(v.selector);
    if (await sel.count() === 0) return false;
    return async (value) => {
      try { await sel.selectOption(value); await page.waitForTimeout(v.settle ?? 1800); return true; } catch { return false; }
    };
  }
  return async () => false;
}

// Resolve a string/array field that may be language-keyed.
// Accepts plain strings/arrays (used as-is) or { en: ..., fr: ..., ... } objects.
function pickLang(val, lang) {
  if (val == null) return val;
  if (Array.isArray(val)) return val;
  if (typeof val === 'object' && !Array.isArray(val)) return val[lang] ?? val.en ?? Object.values(val)[0];
  return val;
}

// Inject synthetic BLE+sensor state from config, resolving lang-keyed strings.
async function injectSyntheticState(page) {
  // Resolve any lang-keyed strings into plain values before passing to the page.
  const synth = JSON.parse(JSON.stringify(CFG.synthetic || {}));
  const L = LANG || 'en';
  if (synth.connect?.pillText) synth.connect.pillText = pickLang(synth.connect.pillText, L);
  for (const p of synth.pills || []) {
    if (p.text) p.text = pickLang(p.text, L);
  }
  if (synth.activityFeed?.entries) synth.activityFeed.entries = pickLang(synth.activityFeed.entries, L);
  await page.evaluate((cfg) => {
    try { if (cfg.silenceToastsGlobal) new Function(cfg.silenceToastsGlobal)(); } catch {}
    // Clear any lingering toasts
    document.querySelectorAll('.toast, .toast-container > *').forEach(e => e.remove());
    if (cfg.connect) {
      const c = cfg.connect;
      try { if (c.globalCall) new Function(c.globalCall)(); } catch {}
      const pill = c.pillSelector ? document.querySelector(c.pillSelector) : null;
      if (pill) {
        if (c.pillAddClass) pill.classList.add(c.pillAddClass);
        if (c.pillRemoveClass) pill.classList.remove(c.pillRemoveClass);
        const txt = c.pillTextSelector ? pill.querySelector(c.pillTextSelector) : null;
        if (txt && c.pillText) txt.textContent = c.pillText;
      }
      if (c.disableConnectSelector)    { const e = document.querySelector(c.disableConnectSelector);    if (e) e.disabled = true;  }
      if (c.enableDisconnectSelector)  { const e = document.querySelector(c.enableDisconnectSelector);  if (e) e.disabled = false; }
    }
    for (const s of cfg.sensors || []) {
      const el = document.querySelector(s.selector);
      if (el) el.textContent = s.value;
    }
    for (const p of cfg.pills || []) {
      const pill = document.querySelector(p.selector);
      if (!pill) continue;
      pill.classList.toggle('active', !!p.active);
      const t = p.textSelector ? pill.querySelector(p.textSelector) : null;
      if (t && p.text) t.textContent = p.text;
    }
    if (cfg.activityFeed) {
      const feed = document.querySelector(cfg.activityFeed.selector);
      if (feed && cfg.activityFeed.entries?.length) {
        const cls = cfg.activityFeed.entryClass || 'activity-item';
        feed.innerHTML = cfg.activityFeed.entries
          .map(l => `<div class="${cls}">${l}</div>`).join('');
      }
    }
  }, synth);
  await page.waitForTimeout(400);
}

async function drawLedPattern(page, p) {
  if (!p?.pattern) return;
  await page.evaluate((cfg) => {
    const cells = document.querySelectorAll(cfg.matrixCellSelector);
    if (!cells.length) return;
    cells.forEach(c => c.classList.remove(cfg.onClass || 'on'));
    cells.forEach(c => {
      const r = +(c.getAttribute(cfg.rowAttr) ?? -1);
      const col = +(c.getAttribute(cfg.colAttr) ?? -1);
      if (r >= 0 && col >= 0 && cfg.pattern[r]?.[col]) c.classList.add(cfg.onClass || 'on');
    });
  }, p);
}

async function runTilt(page, p) {
  if (!p?.tiltExpression) return;
  await page.evaluate((expr) => { try { new Function(expr)(); } catch {} }, p.tiltExpression);
  await page.waitForTimeout(p.wait ?? 400);
}

async function injectOverlay(page, text, subtitle = '') {
  await page.evaluate(([t, s]) => {
    const id = '__shot_overlay__';
    document.getElementById(id)?.remove();
    const d = document.createElement('div');
    d.id = id;
    d.style.cssText = `position:fixed;top:24px;right:24px;z-index:999999;
      background:rgba(255,80,0,0.95);color:#fff;padding:14px 20px;border-radius:12px;
      font:700 22px/1.2 -apple-system,Segoe UI,sans-serif;
      box-shadow:0 8px 28px rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:4px;
      border:2px solid rgba(255,255,255,0.4);`;
    d.innerHTML = `<div style="font-size:26px;">${t}</div>` +
      (s ? `<div style="font-weight:400;font-size:16px;opacity:0.9;">${s}</div>` : '');
    document.body.appendChild(d);
  }, [text, subtitle]);
  await page.waitForTimeout(200);
}
async function removeOverlay(page) {
  await page.evaluate(() => document.getElementById('__shot_overlay__')?.remove());
}

async function injectAnnotation(page, annotations) {
  await page.evaluate((arr) => {
    const id = '__annot_svg__';
    document.getElementById(id)?.remove();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = id;
    svg.setAttribute('style', 'position:fixed;inset:0;pointer-events:none;z-index:999998;width:100vw;height:100vh;');
    svg.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
    for (const a of arr) {
      const el = document.querySelector(a.selector);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const side = a.side || 'top';
      let sx, sy, ex, ey;
      if (side === 'top')    { sx = cx + 180; sy = r.top - 80;     ex = cx;          ey = r.top - 4; }
      if (side === 'bottom') { sx = cx - 180; sy = r.bottom + 80;  ex = cx;          ey = r.bottom + 4; }
      if (side === 'left')   { sx = r.left - 200; sy = cy + 40;    ex = r.left - 4;  ey = cy; }
      if (side === 'right')  { sx = r.right + 200; sy = cy - 40;   ex = r.right + 4; ey = cy; }
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      defs.innerHTML = `<marker id="arrowhead" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M0 0 L12 6 L0 12 Z" fill="#00ff88"/></marker>`;
      svg.appendChild(defs);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${sx} ${sy} Q ${(sx+ex)/2} ${sy} ${ex} ${ey}`);
      path.setAttribute('stroke', '#00ff88'); path.setAttribute('stroke-width', '5');
      path.setAttribute('fill', 'none'); path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('marker-end', 'url(#arrowhead)');
      svg.appendChild(path);
      const tw = Math.max(240, a.text.length * 16);
      const tx = (side === 'left') ? sx - tw + 20 : sx - 20;
      const ty = sy - 34;
      const textBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      textBg.setAttribute('x', tx); textBg.setAttribute('y', ty);
      textBg.setAttribute('width', tw); textBg.setAttribute('height', 56);
      textBg.setAttribute('rx', 12); textBg.setAttribute('fill', '#00ff88');
      svg.appendChild(textBg);
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', tx + 20); label.setAttribute('y', ty + 36);
      label.setAttribute('fill', '#000'); label.setAttribute('font-size', '22');
      label.setAttribute('font-weight', '800');
      label.setAttribute('font-family', '-apple-system, Segoe UI, sans-serif');
      label.textContent = a.text;
      svg.appendChild(label);
    }
    document.body.appendChild(svg);
  }, annotations);
  await page.waitForTimeout(200);
}
async function removeAnnotation(page) {
  await page.evaluate(() => document.getElementById('__annot_svg__')?.remove());
}

async function writeAltText(page, outPng, context = '') {
  const text = await page.evaluate(() => {
    const active = document.querySelector('.tab-page.active, .tab-page:not([hidden])');
    const title = (active?.querySelector('[data-i18n$="_title"],h2,h3')?.textContent || '').trim();
    const chunks = [...(active || document).querySelectorAll('.section-title, .sensor-label, .card-subtitle')]
      .map(e => e.textContent.trim()).filter(Boolean).slice(0, 8);
    return `${title} — ${chunks.join(' · ')}`.replace(/\s+/g, ' ').trim();
  });
  const suffix = CFG.altTextSuffix ? ' — ' + CFG.altTextSuffix : '';
  const alt = `${CFG.productName || 'App'} — ${text}${context ? ' — ' + context : ''}${suffix}`.slice(0, 200);
  writeFileSync(outPng.replace(/\.png$/, '.alt.txt'), alt);
  return alt;
}

// ---------- modes ----------

async function modeTabs(browser, { suffix = '', synthetic = false } = {}) {
  const { ctx, page } = await newPage(browser);
  if (synthetic) await injectSyntheticState(page);
  for (const t of CFG.tabs) {
    const ok = await switchTab(page, t.slug);
    if (!ok) { console.log(`  ⚠️  tab not found: ${t.slug}`); continue; }
    if (synthetic) await injectSyntheticState(page);
    const out = join(OUT, `screenshot-${t.slug}${suffix}.png`);
    await shot(page, out);
    await writeAltText(page, out, synthetic ? 'mid-demo' : '');
    console.log(`  ✓ screenshot-${t.slug}${suffix}.png`);
  }
  await ctx.close();
}

async function modePairs(browser) {
  const p = CFG.pairs;
  if (!p) { console.log('  ⚠️  no pairs configured'); return; }
  const { ctx, page } = await newPage(browser);

  if (p.connect) {
    await switchTab(page, p.connect.tabSlug);
    await shot(page, join(OUT, 'pair-connect-off.png'));
    console.log('  ✓ pair-connect-off.png');
    await injectSyntheticState(page);
    await shot(page, join(OUT, 'pair-connect-on.png'));
    console.log('  ✓ pair-connect-on.png');
  }

  if (p.graph) {
    await switchTab(page, p.graph.tabSlug);
    await shot(page, join(OUT, 'pair-graph-empty.png'));
    console.log('  ✓ pair-graph-empty.png');
    if (p.graph.activate) {
      const act = page.locator(p.graph.activate.selector).first();
      if (await act.count()) { await act.click(); await page.waitForTimeout(p.graph.activate.wait ?? 2000); }
    }
    await shot(page, join(OUT, 'pair-graph-active.png'));
    console.log('  ✓ pair-graph-active.png');
  }

  if (p['3d']) {
    await switchTab(page, p['3d'].tabSlug);
    await shot(page, join(OUT, 'pair-3d-flat.png'));
    console.log('  ✓ pair-3d-flat.png');
    await runTilt(page, p['3d']);
    await shot(page, join(OUT, 'pair-3d-tilted.png'));
    console.log('  ✓ pair-3d-tilted.png');
  }

  if (p.leds) {
    await switchTab(page, p.leds.tabSlug);
    await shot(page, join(OUT, 'pair-leds-blank.png'));
    console.log('  ✓ pair-leds-blank.png');
    await drawLedPattern(page, p.leds);
    await page.waitForTimeout(200);
    await shot(page, join(OUT, 'pair-leds-heart.png'));
    console.log('  ✓ pair-leds-heart.png');
  }

  await ctx.close();
}

async function modeThemes(browser) {
  const t = CFG.variants?.themes;
  if (!t) { console.log('  ⚠️  no themes configured'); return; }
  const { ctx, page } = await newPage(browser);
  await switchTab(page, t.tabSlug || CFG.heroTabs?.[0] || CFG.tabs[0].slug);
  await injectSyntheticState(page);
  for (const v of t.values) {
    await setTheme(page, v);
    const out = join(OUT, `screenshot-theme-${v}.png`);
    await shot(page, out);
    await writeAltText(page, out, `${v} theme`);
    console.log(`  ✓ screenshot-theme-${v}.png`);
  }
  await ctx.close();
}

async function modeModels(browser) {
  const m = CFG.variants?.models;
  if (!m) { console.log('  ⚠️  no models configured'); return; }
  const { ctx, page } = await newPage(browser);
  const choose = await selectVariant(page, 'models');
  if (!choose) { console.log('  ⚠️  variant selector missing'); await ctx.close(); return; }
  for (const v of m.values) {
    const ok = await choose(v);
    if (!ok) { console.log(`  ⚠️  variant not found: ${v}`); continue; }
    const out = join(OUT, `screenshot-3d-${v}.png`);
    await shot(page, out);
    await writeAltText(page, out, `${v} model`);
    console.log(`  ✓ screenshot-3d-${v}.png`);
  }
  await ctx.close();
}

async function modeOffline(browser) {
  const o = CFG.offlineScene;
  if (!o) { console.log('  ⚠️  no offline scene configured'); return; }
  const { ctx, page } = await newPage(browser);
  await switchTab(page, o.tabSlug);
  await injectSyntheticState(page);
  await ctx.setOffline(true);
  await injectOverlay(page, o.overlayTitle || 'OFFLINE', o.overlaySubtitle || '');
  const out = join(OUT, 'screenshot-offline.png');
  await shot(page, out);
  await writeAltText(page, out, 'offline-capable PWA proof');
  console.log('  ✓ screenshot-offline.png');
  await removeOverlay(page);
  await ctx.setOffline(false);
  await ctx.close();
}

async function modeAnnotated(browser) {
  const anns = CFG.annotations || [];
  if (!anns.length) { console.log('  ⚠️  no annotations configured'); return; }
  const { ctx, page } = await newPage(browser);
  await injectSyntheticState(page);
  for (const a of anns) {
    await switchTab(page, a.tabSlug);
    if (a.prep?.selector) {
      const p = page.locator(a.prep.selector).first();
      if (await p.count()) { try { await p.click({ timeout: 1000 }); await page.waitForTimeout(a.prep.wait ?? 1500); } catch {} }
    }
    await injectSyntheticState(page);
    await injectAnnotation(page, [{ selector: a.target, text: a.text, side: a.side || 'top' }]);
    const out = join(OUT, `screenshot-${a.sceneName}-annotated.png`);
    await shot(page, out);
    await writeAltText(page, out, 'annotated callout');
    console.log(`  ✓ screenshot-${a.sceneName}-annotated.png`);
    await removeAnnotation(page);
  }
  await ctx.close();
}

async function modeAudiences(browser) {
  const audiences = CFG.audiences || [];
  if (!audiences.length) { console.log('  ⚠️  no audiences configured'); return; }
  const leds = CFG.pairs?.leds;
  const { ctx, page } = await newPage(browser);
  for (const a of audiences) {
    if (a.theme) await setTheme(page, a.theme);
    const ok = await switchTab(page, a.tabSlug);
    if (!ok) { console.log(`  ⚠️  audience tab missing: ${a.tabSlug}`); continue; }
    if (a.synthetic) await injectSyntheticState(page);
    if (a.drawHeart && leds) await drawLedPattern(page, leds);
    await page.waitForTimeout(300);
    const out = join(OUT, `screenshot-audience-${a.name}.png`);
    await shot(page, out);
    await writeAltText(page, out, `${a.name} persona`);
    console.log(`  ✓ screenshot-audience-${a.name}.png`);
  }
  await ctx.close();
}

async function modeAspects(browser) {
  const aspects = [
    { name: '9x16', viewport: { width: 1080, height: 1920 } },
    { name: '1x1',  viewport: { width: 1500, height: 1500 } },
    { name: '2x3',  viewport: { width: 1000, height: 1500 } },
    { name: '16x9', viewport: { width: 1920, height: 1080 } },
  ];
  const heroSlugs = CFG.heroTabs || CFG.tabs.slice(0, 3).map(t => t.slug);
  for (const a of aspects) {
    const { ctx, page } = await newPage(browser, a.viewport);
    await injectSyntheticState(page);
    for (const slug of heroSlugs) {
      const ok = await switchTab(page, slug);
      if (!ok) continue;
      await injectSyntheticState(page);
      const out = join(OUT, `screenshot-${slug}-${a.name}.png`);
      await shot(page, out);
      console.log(`  ✓ screenshot-${slug}-${a.name}.png`);
    }
    await ctx.close();
  }
}

function modeAltOnly() {
  const files = readdirSync(OUT).filter(f => f.endsWith('.png'));
  const suffix = CFG.altTextSuffix ? ' — ' + CFG.altTextSuffix : '';
  for (const f of files) {
    const base = basename(f, '.png').replace(/^screenshot-/, '');
    const alt = `${CFG.productName || 'App'} — ${base.replace(/-/g, ' ')}${suffix}`.slice(0, 200);
    writeFileSync(join(OUT, f.replace(/\.png$/, '.alt.txt')), alt);
  }
  console.log(`  ✓ ${files.length} .alt.txt files`);
}

// ---------- main ----------

const browser = await chromium.launch();
console.log(`\n📸 Capture mode: ${MODE}  (product: ${CFG.productName || 'App'})\n`);

try {
  if (MODE === 'tabs' || MODE === 'all')       { console.log('▸ Tabs (standard)');       await modeTabs(browser); }
  if (MODE === 'synthetic' || MODE === 'all')  { console.log('\n▸ Tabs (synthetic data)'); await modeTabs(browser, { suffix: '-live', synthetic: true }); }
  if (MODE === 'pairs' || MODE === 'all')      { console.log('\n▸ Before/after pairs');    await modePairs(browser); }
  if (MODE === 'themes' || MODE === 'all')     { console.log('\n▸ Themes');                await modeThemes(browser); }
  if (MODE === 'models' || MODE === 'all')     { console.log('\n▸ Variants / models');     await modeModels(browser); }
  if (MODE === 'offline' || MODE === 'all')    { console.log('\n▸ Offline proof');         await modeOffline(browser); }
  if (MODE === 'annotated' || MODE === 'all')  { console.log('\n▸ Annotated callouts');    await modeAnnotated(browser); }
  if (MODE === 'aspects' || MODE === 'all')    { console.log('\n▸ Multi-aspect');          await modeAspects(browser); }
  if (MODE === 'audiences' || MODE === 'all')  { console.log('\n▸ Audience packs');        await modeAudiences(browser); }
  if (MODE === 'alt')                          { console.log('▸ Alt-text only');           modeAltOnly(); }
} finally {
  await browser.close();
}

if (MODE !== 'alt') modeAltOnly();
console.log('\n✅ Done.', OUT);
