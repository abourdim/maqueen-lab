/**
 * One-shot orchestrator: builds the full marketing asset set for a
 * target language. Runs every pipeline tool with `--lang <code>` so
 * outputs land under `output/<lang>/`.
 *
 * Usage:
 *   node etsy-package/tools/build-localized.mjs fr
 *   node etsy-package/tools/build-localized.mjs en    # default path (no suffix)
 *
 * What runs:
 *   1. capture-screenshots.mjs --lang <code>
 *   2. theme-morph.mjs          --lang <code>
 *   3. hero-compose.mjs         --lang <code>
 *   4. generate-gifs.mjs        --lang <code>
 *   5. speed-test-clip.mjs      --lang <code>
 *   6. generate-captions.mjs    --lang <code>
 *   7. generate-accessibility.mjs --lang <code>
 *   8. chatbot-embed.mjs        --lang <code>
 *   9. generate-print.mjs       --lang <code>    (poster A3 + flyer A4)
 *  10. generate-social.mjs      --lang <code>    (IG post/story, Twitter, LinkedIn)
 *  11. generate-identity.mjs    --lang <code>    (business card + email signature)
 *  12. generate-video.mjs       --lang <code>    (silent + captions)
 *  13. narrate-video.mjs        <code>           (TTS narration layer)
 *
 * Each step inherits ffmpeg from PATH and reuses the shared
 * capture-config.json for DOM selectors.
 */

import { spawnSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LANG = process.argv[2];
if (!LANG) { console.error('❌ Usage: node build-localized.mjs <lang>'); process.exit(1); }

const steps = [
  { script: 'capture-screenshots.mjs', args: ['--lang', LANG] },
  { script: 'theme-morph.mjs',         args: ['--lang', LANG] },
  { script: 'hero-compose.mjs',        args: ['--lang', LANG] },
  { script: 'generate-gifs.mjs',       args: ['--lang', LANG] },
  { script: 'speed-test-clip.mjs',     args: ['--lang', LANG] },
  { script: 'generate-captions.mjs',   args: ['--lang', LANG] },
  { script: 'generate-accessibility.mjs', args: ['--lang', LANG] },
  { script: 'chatbot-embed.mjs',       args: ['--lang', LANG] },
  { script: 'generate-print.mjs',      args: ['--lang', LANG] },
  { script: 'generate-social.mjs',     args: ['--lang', LANG] },
  { script: 'generate-identity.mjs',   args: ['--lang', LANG] },
  { script: 'generate-video.mjs',      args: ['--lang', LANG] },
  { script: 'narrate-video.mjs',       args: [LANG] },
];

console.log(`\n🌍 Building localized asset set for lang=${LANG}\n`);
const failures = [];
for (const s of steps) {
  console.log(`\n▸ ${s.script}`);
  const r = spawnSync('node', [resolve(__dirname, s.script), ...s.args], { stdio: 'inherit' });
  if (r.status !== 0) {
    failures.push(s.script);
    console.log(`  ⚠️  ${s.script} exited ${r.status}`);
  }
}

console.log(failures.length
  ? `\n⚠️  Finished with ${failures.length} failure(s): ${failures.join(', ')}`
  : `\n✅ All steps complete.`);
console.log(`\nOutputs: etsy-package/output/${LANG}/ (video, screenshots, heroes, gifs, speed-test,\n         captions, accessibility, chatbot, print, social, identity, narrated/)\n`);
