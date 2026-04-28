/**
 * Per-buyer watermarked ZIP — bakes the buyer's name + order ID into
 * README-quickstart.html and SITE_LICENSE_CERTIFICATE.html, then re-zips
 * as BitPlayground-{initials}-{orderid}-v{VERSION}.zip.
 *
 * Buyer perceives it as "personalized." Any leaked copy traces back to
 * the order. Zero effect on ZIP contents for legitimate buyers.
 *
 * Prerequisite: base ZIP directory must exist (run build-package.js first,
 * which produces etsy-package/<PRODUCT_SLUG>-v<VERSION>/).
 *
 * Usage:
 *   node etsy-package/tools/watermark-zip.mjs \
 *       --buyer "Alice Smith" \
 *       --order "12345" \
 *       [--email alice@example.com]
 *
 * Output:
 *   etsy-package/output/buyers/<SLUG>-<initials>-<order>-v<VERSION>.zip
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(__dirname, '..');
const OUT = resolve(PKG, 'output', 'shared', 'buyers');
mkdirSync(OUT, { recursive: true });

// ---------- CLI ----------
const args = process.argv.slice(2);
const argv = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) argv[args[i].slice(2)] = args[i + 1] ?? true;
}
if (!argv.buyer || !argv.order) {
  console.error('❌ Usage: --buyer "Name Surname" --order "12345" [--email a@b.com]');
  process.exit(1);
}

// ---------- version / slug (read from package.json) ----------
const pkgJson = JSON.parse(readFileSync(resolve(PKG, '..', 'package.json'), 'utf8'));
const VERSION = 'v' + pkgJson.version;
const SLUG = 'BitPlayground'; // Could be read from tools/capture-config.json → productName
const BASE_DIR = resolve(PKG, `${SLUG}-${VERSION}`);
if (!existsSync(BASE_DIR)) {
  console.error(`❌ Base ZIP dir missing: ${BASE_DIR}\n   Run: node etsy-package/build-package.js`);
  process.exit(1);
}

// ---------- derive watermark tokens ----------
const nameParts = String(argv.buyer).trim().split(/\s+/);
const initials = nameParts.map(p => p[0]?.toUpperCase() || '').join('').slice(0, 3) || 'X';
const order = String(argv.order).replace(/[^A-Za-z0-9]/g, '');
const buyer = String(argv.buyer).trim();
const email = argv.email || '';

// Watermark badge (HTML snippet) inserted into README-quickstart + license cert.
const watermarkHtml = `
<!-- BUYER-WATERMARK-START -->
<div style="margin:24px 0;padding:14px 20px;border:1px solid #00ff88aa;border-radius:8px;
     background:rgba(0,255,136,0.06);color:#0a2540;font-family:-apple-system,Segoe UI,sans-serif;
     font-size:13px;line-height:1.5;">
  <div style="font-weight:700;color:#008855;letter-spacing:0.04em;font-size:11px;text-transform:uppercase;margin-bottom:4px;">
    Licensed to
  </div>
  <div style="font-size:15px;font-weight:600;">${buyer}</div>
  ${email ? `<div style="opacity:0.7;font-size:12px;">${email}</div>` : ''}
  <div style="opacity:0.6;font-size:11px;margin-top:4px;">Order #${order} · ${new Date().toISOString().slice(0, 10)}</div>
</div>
<!-- BUYER-WATERMARK-END -->`;

// ---------- copy base dir → buyer dir, watermark specific files ----------

const destName = `${SLUG}-${initials}-${order}-${VERSION}`;
const destDir = join(OUT, destName);
if (existsSync(destDir)) rmSync(destDir, { recursive: true, force: true });
mkdirSync(destDir, { recursive: true });

function copyDir(src, dst) {
  for (const entry of readdirSync(src)) {
    const s = join(src, entry);
    const d = join(dst, entry);
    if (statSync(s).isDirectory()) { mkdirSync(d, { recursive: true }); copyDir(s, d); }
    else copyFileSync(s, d);
  }
}
copyDir(BASE_DIR, destDir);

function watermark(filePath) {
  if (!existsSync(filePath)) return false;
  let html = readFileSync(filePath, 'utf8');
  // Strip any existing watermark block (idempotent re-runs).
  html = html.replace(/<!-- BUYER-WATERMARK-START -->[\s\S]*?<!-- BUYER-WATERMARK-END -->/g, '');
  // Insert near top of <body>.
  if (/<body[^>]*>/i.test(html)) html = html.replace(/<body([^>]*)>/i, `<body$1>\n${watermarkHtml}`);
  else html = watermarkHtml + '\n' + html;
  writeFileSync(filePath, html);
  return true;
}

const targets = [
  'printables/README-quickstart.html',
  'LICENSE.txt',       // plain-text append
  'LICENSE',           // plain-text append (some products use extensionless)
];
let hit = 0;
for (const t of targets) {
  const p = join(destDir, t);
  if (!existsSync(p)) continue;
  if (t.endsWith('.html')) { if (watermark(p)) hit++; }
  else {
    // Plain text append for LICENSE.txt
    let txt = readFileSync(p, 'utf8');
    txt = txt.replace(/\n*Licensed to:.*\n.*\n.*Order #.*\n*/g, '');
    txt += `\n\nLicensed to: ${buyer}${email ? ' (' + email + ')' : ''}\nOrder #${order}\nIssued: ${new Date().toISOString().slice(0, 10)}\n`;
    writeFileSync(p, txt);
    hit++;
  }
}

// Look for a site-license cert anywhere inside the dir tree.
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}
for (const f of walk(destDir)) {
  const base = f.split(/[\\/]/).pop();
  if (/LICENSE-?SITE|SITE_LICENSE_CERTIFICATE/i.test(base) && base.endsWith('.html')) {
    if (watermark(f)) hit++;
  }
}

console.log(`\n🔖 Watermarked: ${buyer} · order #${order}`);
console.log(`   Touched ${hit} file(s) in ${destName}/`);

// ---------- zip ----------
const zipPath = join(OUT, `${destName}.zip`);
if (existsSync(zipPath)) rmSync(zipPath);
let zipped = false;
try { execSync(`cd "${OUT}" && zip -rq "${zipPath}" "${destName}/"`, { stdio: 'pipe' }); zipped = true; } catch {}
if (!zipped) try { execSync(`cd "${OUT}" && ditto -c -k --keepParent "${destName}" "${zipPath}"`, { stdio: 'pipe' }); zipped = true; } catch {}
if (!zipped) try { execSync(`powershell.exe -Command "Compress-Archive -Path '${destDir}' -DestinationPath '${zipPath}' -Force"`, { stdio: 'pipe' }); zipped = true; } catch {}

if (!zipped) {
  console.error(`❌ Could not create ZIP. Manually zip: ${destDir}`);
  process.exit(1);
}

console.log(`\n✅ ${zipPath}\n`);
