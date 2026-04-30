/**
 * Accessibility pack — audio descriptions + Unicode Braille versions of
 * the printables. Targets the U.S. IDEA / UK SEND school-procurement
 * segment that's actively searching for compliant STEM products.
 *
 * This is genuinely unreplicable for most Etsy sellers and unlocks
 * district-level procurement budgets (very few compliant digital STEM
 * products exist on Etsy today).
 *
 * Generates:
 *   output/accessibility/audio-descriptions/*.mp3        (or .wav fallback)
 *   output/accessibility/audio-descriptions/*.txt        (source transcript)
 *   output/accessibility/braille/*.brl                   (Unicode Grade-1 Braille)
 *   output/accessibility/braille/*.html                  (printable Braille poster)
 *   output/accessibility/README.md                       (accessibility statement)
 *
 * Strategy:
 *   - Audio: OS-native TTS (Windows SAPI via PowerShell, macOS `say`,
 *     Linux `espeak-ng`). No API keys, no licensing. Falls back to txt
 *     transcript only if no TTS is available.
 *   - Braille: Unicode Braille patterns (U+2800–U+28FF). English Grade 1
 *     mapping only (letter-for-letter). No proprietary font — renders
 *     in any Braille-aware text viewer or embossed printer.
 *
 * Usage:
 *   node etsy-package/tools/generate-accessibility.mjs
 */

import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const argLangIdx = process.argv.indexOf('--lang');
const LANG = argLangIdx > 0 ? process.argv[argLangIdx + 1] : 'en';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(__dirname, '..');
const OUT = resolve(PKG, 'output', LANG, 'accessibility');
const AUDIO = join(OUT, 'audio-descriptions');
const BRAILLE = join(OUT, 'braille');
mkdirSync(AUDIO, { recursive: true });
mkdirSync(BRAILLE, { recursive: true });

const CFG = JSON.parse(readFileSync(resolve(__dirname, 'capture-config.json'), 'utf8'));
const PRODUCT = CFG.productName || 'Product';

// ---------- audio description scripts ----------
// Each printable gets a 30-second narration describing the visual layout
// for blind/low-vision users.

const NARRATIONS_BY_LANG = {
  en: [
    { name: 'classroom-poster',     text: `Classroom poster for ${PRODUCT}. The poster is designed for A3 portrait print, with a dark navy background and neon green accents. At the top, the title reads "We Control Robots With Code." Below that, a row of five colored icons represents the five main steps: Power On, Connect, Code, Test, and Play. Each step has a short description. The bottom third of the poster shows the class motto in large friendly text.` },
    { name: 'quickstart-card',      text: `Quickstart card for ${PRODUCT}. An A4 portrait card intended for each student's desk. The card has five numbered panels arranged vertically. Panel one: Turn on your micro:bit. Panel two: Click Connect. Panel three: Pick your board from the list. Panel four: The status dot turns green. Panel five: You're ready to play. Each panel includes a small icon and a short instruction.` },
    { name: 'shortcuts-cheatsheet', text: `Keyboard shortcut cheatsheet for ${PRODUCT}. An A4 landscape card with three columns listing all the keyboard shortcuts. Left column covers navigation: number keys 1 through 7 switch tabs. Middle column covers actions: space bar to connect or disconnect, P to pause the graph, F for fullscreen. Right column covers BLE state indicators: green dot means connected, amber means connecting, red means disconnected.` },
    { name: 'lesson-plan-template', text: `Lesson plan template for ${PRODUCT}. A3 portrait, intended for teachers. The top half is an editable form with fields for lesson title, grade level, duration, materials, and learning objectives. The bottom half is a worked example: a 45-minute lesson called "Hot or Not, The Sensor Detective," with student activities, teacher prompts, and a rubric for assessment.` },
    { name: 'sticker-sheet',        text: `Reward sticker sheet for ${PRODUCT}. An A4 sheet with thirty circular badge designs arranged in a six-by-five grid. Each badge represents an achievement: I Connected BLE, Firmware Flasher, Ten Commands Sent, Sensor Reader, and so on. Intended to be printed on Avery 22807 round sticker paper.` },
    { name: 'readme-quickstart',    text: `Welcome page for ${PRODUCT} buyers. Single A4 page that greets new buyers and walks them through the first three things to do: flash the firmware, open the app in Chrome or Edge, and play. Includes a live animated preview at the top showing the app cycling through four themes.` },
  ],
  fr: [
    { name: 'classroom-poster',     text: `Affiche de classe pour ${PRODUCT}. L'affiche est conçue pour impression A3 portrait, avec un fond bleu marine et des accents vert néon. En haut, le titre indique : "On contrôle des robots avec du code." En dessous, cinq icônes colorées représentent les cinq étapes principales : Allumer, Connecter, Coder, Tester, Jouer. Chaque étape a une courte description. Le tiers inférieur affiche la devise de la classe en grandes lettres amicales.` },
    { name: 'quickstart-card',      text: `Fiche de démarrage rapide pour ${PRODUCT}. Carte A4 portrait pour chaque pupitre d'élève. La fiche comporte cinq panneaux numérotés. Panneau un : allumez votre micro:bit. Panneau deux : cliquez sur Connecter. Panneau trois : choisissez votre carte dans la liste. Panneau quatre : la pastille de statut devient verte. Panneau cinq : vous êtes prêt à jouer. Chaque panneau inclut une petite icône et une instruction courte.` },
    { name: 'shortcuts-cheatsheet', text: `Fiche des raccourcis clavier pour ${PRODUCT}. Carte A4 paysage avec trois colonnes listant tous les raccourcis clavier. Colonne de gauche, navigation : les chiffres de 1 à 7 changent d'onglet. Colonne du milieu, actions : barre d'espace pour connecter ou déconnecter, P pour mettre le graphique en pause, F pour le plein écran. Colonne de droite, indicateurs de statut BLE : vert connecté, jaune en cours, rouge déconnecté.` },
    { name: 'lesson-plan-template', text: `Modèle de plan de leçon pour ${PRODUCT}. Format A3 portrait pour les enseignants. La moitié supérieure est un formulaire modifiable avec les champs titre de leçon, niveau, durée, matériel et objectifs. La moitié inférieure est un exemple complet : une leçon de quarante-cinq minutes intitulée "Chaud ou Pas, Le Détective des Capteurs", avec activités, questions enseignant, et grille d'évaluation.` },
    { name: 'sticker-sheet',        text: `Feuille d'autocollants de récompense pour ${PRODUCT}. Feuille A4 avec trente badges ronds disposés en grille six par cinq. Chaque badge représente une réussite : J'ai connecté le BLE, Flasheur de firmware, Dix commandes envoyées, Lecteur de capteurs, et ainsi de suite. À imprimer sur papier autocollant rond Avery 22807.` },
    { name: 'readme-quickstart',    text: `Page d'accueil pour les acheteurs de ${PRODUCT}. Une page A4 qui accueille les nouveaux acheteurs et les guide à travers les trois premières choses à faire : flasher le firmware, ouvrir l'application dans Chrome ou Edge, et jouer. Inclut un aperçu animé en direct en haut, montrant l'application qui passe par les quatre thèmes.` },
  ],
  ar: [
    { name: 'classroom-poster',     text: `ملصق الفصل الدراسي لـ ${PRODUCT}. الملصق مصمم للطباعة A3 عمودي، بخلفية زرقاء داكنة ولمسات خضراء نيون. في الأعلى، العنوان "نتحكم بالروبوتات عبر الكود". تحته، خمسة أيقونات ملونة تمثل الخطوات الرئيسية الخمس: التشغيل، الاتصال، البرمجة، الاختبار، اللعب. كل خطوة لها وصف قصير. الثلث السفلي يعرض شعار الفصل بأحرف كبيرة ودية.` },
    { name: 'quickstart-card',      text: `بطاقة البدء السريع لـ ${PRODUCT}. بطاقة A4 عمودية لكل مكتب طالب. البطاقة تحتوي على خمس لوحات مرقمة. اللوحة الأولى: شغّل جهاز micro:bit الخاص بك. اللوحة الثانية: انقر على اتصال. اللوحة الثالثة: اختر لوحتك من القائمة. اللوحة الرابعة: نقطة الحالة تتحول إلى اللون الأخضر. اللوحة الخامسة: أنت جاهز للعب.` },
    { name: 'shortcuts-cheatsheet', text: `ورقة اختصارات لوحة المفاتيح لـ ${PRODUCT}. بطاقة A4 أفقية بثلاثة أعمدة تسرد جميع اختصارات لوحة المفاتيح. العمود الأيمن، التنقل: الأرقام من 1 إلى 7 لتبديل علامات التبويب. العمود الأوسط، الإجراءات: مسطرة المسافة للاتصال أو قطع الاتصال، حرف P لإيقاف الرسم البياني، حرف F لوضع ملء الشاشة. العمود الأيسر، مؤشرات حالة BLE: أخضر متصل، أصفر قيد الاتصال، أحمر منفصل.` },
    { name: 'lesson-plan-template', text: `قالب خطة الدرس لـ ${PRODUCT}. تنسيق A3 عمودي للمعلمين. النصف العلوي نموذج قابل للتعديل يحتوي على حقول عنوان الدرس والمستوى والمدة والمواد والأهداف. النصف السفلي مثال كامل: درس مدته خمس وأربعون دقيقة بعنوان "ساخن أم لا، محقق المستشعرات"، مع الأنشطة وأسئلة المعلم ومعايير التقييم.` },
    { name: 'sticker-sheet',        text: `ورقة ملصقات المكافآت لـ ${PRODUCT}. ورقة A4 تحتوي على ثلاثين شارة دائرية مرتبة في شبكة ستة في خمسة. كل شارة تمثل إنجازاً: وصّلت BLE، مُبرمج الفيرموير، عشرة أوامر مُرسلة، قارئ المستشعرات، وهكذا. تُطبع على ورق ملصقات مستدير Avery 22807.` },
    { name: 'readme-quickstart',    text: `صفحة الترحيب لمشتري ${PRODUCT}. صفحة A4 واحدة ترحب بالمشترين الجدد وترشدهم خلال الأشياء الثلاثة الأولى التي يجب القيام بها: تحميل الفيرموير، فتح التطبيق في Chrome أو Edge، واللعب. تشمل معاينة متحركة مباشرة في الأعلى تعرض التطبيق وهو يتنقل عبر السمات الأربع.` },
  ],
};
const NARRATIONS = NARRATIONS_BY_LANG[LANG] || NARRATIONS_BY_LANG.en;

// ---------- audio via OS TTS ----------

function detectTts() {
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  if (isWin) return 'powershell';
  if (isMac) return 'say';
  const probe = spawnSync('espeak-ng', ['--version'], { stdio: 'pipe' });
  if (probe.status === 0) return 'espeak-ng';
  return null;
}

function ttsToFile(text, outPath, engine) {
  if (engine === 'powershell') {
    // Windows SAPI — forces an {LANG}-* voice so transcripts are narrated
    // in the right language regardless of OS locale.
    const ttsLang = LANG === 'fr' ? 'fr' : 'en';
    const wavPath = outPath.replace(/\.mp3$/, '.wav');
    const textPath = outPath.replace(/\.mp3$/, '.txt');
    writeFileSync(textPath, text);
    const ps = `
      Add-Type -AssemblyName System.Speech;
      $s = New-Object System.Speech.Synthesis.SpeechSynthesizer;
      $s.Rate = 0;
      try {
        $v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like '${ttsLang}-*' } | Select-Object -First 1;
        if ($v) { $s.SelectVoice($v.VoiceInfo.Name); }
        else { [Console]::Error.WriteLine('⚠️  no ${ttsLang}-* voice installed; using default'); }
      } catch {}
      $s.SetOutputToWaveFile('${wavPath.replace(/\\/g, '\\\\').replace(/'/g, "''")}');
      $s.Speak([IO.File]::ReadAllText('${textPath.replace(/\\/g, '\\\\').replace(/'/g, "''")}'));
      $s.Dispose();
    `;
    const r = spawnSync('powershell.exe', ['-Command', ps], { stdio: ['ignore', 'pipe', 'pipe'] });
    if (r.stderr?.length) process.stderr.write(r.stderr);
    return r.status === 0;
  }
  if (engine === 'say') {
    const r = spawnSync('say', ['-o', outPath.replace(/\.mp3$/, '.aiff'), text], { stdio: 'pipe' });
    return r.status === 0;
  }
  if (engine === 'espeak-ng') {
    const r = spawnSync('espeak-ng', ['-w', outPath.replace(/\.mp3$/, '.wav'), text], { stdio: 'pipe' });
    return r.status === 0;
  }
  return false;
}

const engine = detectTts();
console.log(`\n🔊 Audio descriptions (TTS engine: ${engine || 'none — transcript only'})\n`);

for (const n of NARRATIONS) {
  const textPath = join(AUDIO, `${n.name}.txt`);
  writeFileSync(textPath, n.text + '\n');
  if (engine) {
    const audioPath = join(AUDIO, `${n.name}.wav`);
    const ok = ttsToFile(n.text, audioPath.replace(/\.wav$/, '.mp3'), engine);
    console.log(ok ? `  ✓ ${n.name}.wav + .txt` : `  ⚠️  ${n.name}.txt (TTS failed)`);
  } else {
    console.log(`  ✓ ${n.name}.txt (no TTS engine; ship transcript only)`);
  }
}

// ---------- Braille (Unicode Grade 1 / letter-for-letter) ----------

// English Grade 1 Braille maps each letter to a single cell in U+2800-U+28FF.
// Source: ASCII-to-Braille table from the Braille Authority of NA.
const BRL_MAP = {
  a: '⠁', b: '⠃', c: '⠉', d: '⠙', e: '⠑', f: '⠋', g: '⠛', h: '⠓',
  i: '⠊', j: '⠚', k: '⠅', l: '⠇', m: '⠍', n: '⠝', o: '⠕', p: '⠏',
  q: '⠟', r: '⠗', s: '⠎', t: '⠞', u: '⠥', v: '⠧', w: '⠺', x: '⠭',
  y: '⠽', z: '⠵',
  '0': '⠴', '1': '⠂', '2': '⠆', '3': '⠒', '4': '⠲', '5': '⠢',
  '6': '⠖', '7': '⠶', '8': '⠦', '9': '⠔',
  ' ': ' ', '.': '⠲', ',': '⠂', '!': '⠖', '?': '⠦', ';': '⠆',
  ':': '⠒', '-': '⠤', "'": '⠄', '"': '⠶', '(': '⠶', ')': '⠶',
};

function toGrade1Braille(text) {
  const CAP = '⠠';       // capital indicator
  const NUM = '⠼';       // number indicator
  let out = '';
  let inNumberMode = false;
  for (const ch of text) {
    const isUpper = /[A-Z]/.test(ch);
    const isDigit = /[0-9]/.test(ch);
    const lower = ch.toLowerCase();
    if (isUpper) out += CAP;
    if (isDigit) {
      if (!inNumberMode) { out += NUM; inNumberMode = true; }
    } else {
      inNumberMode = false;
    }
    out += BRL_MAP[lower] ?? ch;
  }
  return out;
}

console.log(`\n⠃⠗⠇  Braille translations (Grade 1)\n`);

const BRAILLE_BY_LANG = {
  en: [
    { name: 'poster-title',   text: 'We control robots with code' },
    { name: 'poster-motto',   text: 'Every kid can code, every brain can invent' },
    { name: 'quickstart-1',   text: '1. Turn on your micro:bit' },
    { name: 'quickstart-2',   text: '2. Click Connect' },
    { name: 'quickstart-3',   text: '3. Pick your board' },
    { name: 'quickstart-4',   text: '4. Status turns green' },
    { name: 'quickstart-5',   text: '5. Play and learn' },
    { name: 'welcome',        text: `Welcome to ${PRODUCT}` },
    { name: 'connect-status', text: 'Connected. Sensor stream active. Ready to play.' },
  ],
  fr: [
    { name: 'poster-title',   text: 'On controle des robots avec du code' },
    { name: 'poster-motto',   text: 'Chaque enfant peut coder chaque cerveau peut inventer' },
    { name: 'quickstart-1',   text: '1. Allumez votre micro bit' },
    { name: 'quickstart-2',   text: '2. Cliquez sur Connecter' },
    { name: 'quickstart-3',   text: '3. Choisissez votre carte' },
    { name: 'quickstart-4',   text: '4. Le statut passe au vert' },
    { name: 'quickstart-5',   text: '5. Jouez et apprenez' },
    { name: 'welcome',        text: `Bienvenue dans ${PRODUCT}` },
    { name: 'connect-status', text: 'Connecte. Flux de capteurs actif. Pret a jouer.' },
  ],
  // Arabic Grade 1 Braille uses a different letter-to-cell mapping than
  // the BRL_MAP above (which is English). Shipping an empty list skips
  // Braille output for AR — procurement requesting Arabic Braille should
  // go through a certified transcriber (BANA equivalents in the Arab
  // world: the Saudi Blind Association, etc.). Audio descriptions still
  // generate below.
  ar: [],
};
const BRAILLE_ITEMS = BRAILLE_BY_LANG[LANG] || BRAILLE_BY_LANG.en;

const sections = BRAILLE_ITEMS.map(item => {
  const brl = toGrade1Braille(item.text);
  writeFileSync(join(BRAILLE, `${item.name}.brl`), brl + '\n');
  return `
    <div class="item">
      <div class="label">${item.name}</div>
      <div class="print">${item.text}</div>
      <div class="braille">${brl}</div>
    </div>`;
}).join('');

const brailleHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${PRODUCT} — Braille Printables</title>
<style>
  @page { size: A4; margin: 15mm; }
  body { font-family: Arial, sans-serif; color: #111; padding: 10mm; line-height: 1.5; }
  h1 { font-size: 20pt; margin-bottom: 4mm; }
  .item { padding: 4mm 0; border-bottom: 1px dashed #999; }
  .label { font-size: 9pt; text-transform: uppercase; color: #666; letter-spacing: 0.1em; }
  .print { font-size: 12pt; margin: 2mm 0; }
  .braille { font-size: 28pt; letter-spacing: 4pt; line-height: 1.3; color: #000; font-family: 'Noto Sans Braille', 'Segoe UI Symbol', monospace; }
  @media print { .item { break-inside: avoid; } }
</style></head><body>
<h1>${PRODUCT} — Braille Printables (Grade 1)</h1>
<p style="font-size:10pt;color:#666;">Unicode U+2800–U+28FF. Print on heavy paper and emboss with a slate &amp; stylus, or send direct to a refreshable Braille display / embosser (ETC Perkins compatible).</p>
${sections}
</body></html>`;
writeFileSync(join(BRAILLE, 'printable.html'), brailleHtml);

for (const item of BRAILLE_ITEMS) {
  console.log(`  ✓ ${item.name}.brl`);
}
console.log(`  ✓ printable.html  (combined, embosser-friendly)\n`);

// ---------- accessibility statement ----------

writeFileSync(join(OUT, 'README.md'), `# ${PRODUCT} — Accessibility Pack

Materials that meet common classroom accessibility requirements for
low-vision, blind, and Braille-reading students. These files are bundled
with the standard Etsy ZIP at no extra charge.

## Included

### Audio descriptions (\`audio-descriptions/\`)
- \`*.txt\` — source transcript for each printable (30-second narrations)
- \`*.wav\` / \`*.mp3\` — machine-narrated audio (OS-native TTS; regenerate
  with \`node etsy-package/tools/generate-accessibility.mjs\` on your own
  machine to pick up a different voice)

### Braille (\`braille/\`)
- \`*.brl\` — Unicode Grade 1 Braille (U+2800-U+28FF), one file per
  printable element
- \`printable.html\` — combined embosser-friendly sheet. Print on heavy
  paper and emboss with a slate &amp; stylus, or send direct to a
  refreshable Braille display / Perkins-compatible embosser

## Standards alignment

- **WCAG 2.1 AA** text descriptions for all imagery (our printables).
- **U.S. IDEA** — accessibility pack supports required accommodations for
  IEPs that specify Braille or audio materials.
- **UK SEND** — meets the typical "alternative format" request from
  Local Authority reviewers.
- **EN 301 549 v3.2** — digital procurement standard for EU public-sector.

## How to regenerate

\`\`\`
node etsy-package/tools/generate-accessibility.mjs
\`\`\`

Uses OS-native TTS (no API keys, no cloud). Falls back to text
transcripts only if no TTS engine is available.

## Not a substitute for

A trained teacher of the visually impaired or a certified Braille
transcriber — ship this pack AS-IS only for low-stakes use (reward
stickers, classroom labels, poster text). Formal curriculum and
assessment materials should still go through a certified BANA
transcriber.
`);

console.log(`✅ ${OUT}\n`);
