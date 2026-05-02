#!/usr/bin/env node
/**
 * docs/_inline-md.mjs
 *
 * Embeds each markdown source file into its matching HTML shell as
 *   <script type="text/markdown" id="md-en">…</script>
 *   <script type="text/markdown" id="md-fr">…</script>
 *   <script type="text/markdown" id="md-ar">…</script>
 *
 * Why: the auto-render path uses fetch() which is blocked over file://
 * (Chromium CORS). Inlining lets the lessons + auto-rendered docs
 * work when opened directly without a server.
 *
 * Run from the repo root:
 *   node docs/_inline-md.mjs
 *
 * Idempotent: scans for an existing `<!-- inlined-md:start -->` … `<!-- inlined-md:end -->`
 * block and replaces it. Adds the block just before `</body>` if absent.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, basename, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const DOCS = dirname(__filename);
const REPO_ROOT = resolve(DOCS, '..');

// Files to process: every HTML in docs/ that uses _md-render.js
function findHtml(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...findHtml(p));
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

const SCAN_DIRS = [DOCS, REPO_ROOT]; // includes README.html at root
const TAG_START = '<!-- inlined-md:start -->';
const TAG_END   = '<!-- inlined-md:end -->';

function escapeForScript(md) {
  // The only content that can break a <script> block is the literal `</script>`.
  // We escape it so the closing tag is not parsed; _md-render.js reverses it.
  return md.replace(/<\/script>/gi, '<\\/script>');
}

function buildBlock(base, htmlDir) {
  const variants = [
    { lang: 'en', file: base + '.md' },
    { lang: 'fr', file: base + '.fr.md' },
    { lang: 'ar', file: base + '.ar.md' },
  ];
  const parts = [TAG_START];
  let any = false;
  for (const v of variants) {
    const path = join(htmlDir, v.file);
    if (!existsSync(path)) continue;
    const md = readFileSync(path, 'utf8');
    parts.push(`<script type="text/markdown" id="md-${v.lang}">${escapeForScript(md)}</script>`);
    any = true;
  }
  parts.push(TAG_END);
  return any ? parts.join('\n') : null;
}

function processHtml(htmlPath) {
  const html = readFileSync(htmlPath, 'utf8');
  const m = html.match(/window\.MD_FILE\s*=\s*['"]([^'"]+)['"]/);
  if (!m) return null;            // not a renderer-driven HTML
  const mdName = m[1];            // e.g. "music-lab.md" or "README.md"
  const base = mdName.replace(/\.md$/i, '');
  const htmlDir = dirname(htmlPath);
  const block = buildBlock(base, htmlDir);
  if (!block) return null;        // no md sources nearby

  let out;
  if (html.includes(TAG_START)) {
    out = html.replace(
      new RegExp(TAG_START + '[\\s\\S]*?' + TAG_END),
      block
    );
  } else {
    out = html.replace('</body>', block + '\n</body>');
  }
  if (out !== html) {
    writeFileSync(htmlPath, out);
    return mdName;
  }
  return null;
}

const QUIET = process.argv.includes('--quiet');
let updated = 0, skipped = 0;
const updates = [];
for (const dir of SCAN_DIRS) {
  for (const htmlPath of findHtml(dir)) {
    const result = processHtml(htmlPath);
    if (result) { updates.push({ htmlPath, result }); updated++; }
    else        { skipped++; }
  }
}
// Be quiet on no-op runs (most pre-commits) — only print when something changed
// or when explicitly running interactively without --quiet.
if (updated > 0) {
  console.log('🔗 Inlining markdown into HTML shells…');
  for (const u of updates) console.log(`  ✓ ${u.htmlPath.replace(REPO_ROOT, '.').replace(/\\/g, '/')} ← ${u.result}`);
  console.log(`✅ Done — ${updated} files updated.`);
} else if (!QUIET) {
  console.log(`✓ inline-md: ${skipped} files already in sync.`);
}
