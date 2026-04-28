/**
 * A/B-ready caption generator for hero images + social posts.
 *
 * Produces N variants of: hero title, hero subtitle, social caption, pin
 * caption, email subject line — one set per audience (teacher/kid/maker).
 *
 * Dual-mode:
 *   - If ANTHROPIC_API_KEY is set, uses Claude for creative variants.
 *   - Otherwise, uses a deterministic template-based generator that
 *     combines word banks to produce diverse-feeling output. Never
 *     blocks on a missing API key.
 *
 * Usage:
 *   export ANTHROPIC_API_KEY=sk-...       # optional
 *   node etsy-package/tools/generate-captions.mjs
 *
 * Output:
 *   output/captions/captions.json   (structured, per-audience × per-format)
 *   output/captions/captions.md     (human-readable table)
 */

import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const argLangIdx = process.argv.indexOf('--lang');
const LANG = argLangIdx > 0 ? process.argv[argLangIdx + 1] : 'en';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(__dirname, '..');
const OUT = resolve(PKG, 'output', LANG, 'captions');
mkdirSync(OUT, { recursive: true });

const CFG = JSON.parse(readFileSync(resolve(__dirname, 'capture-config.json'), 'utf8'));
const PRODUCT = CFG.productName || 'Product';
const TAGLINE = CFG.altTextSuffix || 'browser-based · no install';

// ---------- template-based fallback ----------

const TEMPLATES_BY_LANG = { en: null, fr: null, ar: null };
TEMPLATES_BY_LANG.ar = {
  teacher: {
    heroTitles: [
      `كل مستشعر، مباشرةً في المتصفح`,
      `${PRODUCT} للفصول التي ليس لديها 30 حاسوباً جديداً`,
      `STEM بدون تثبيت، متوافق مع Wi-Fi المدرسة`,
      `علّم المستشعر، لا عملية التثبيت`,
      `لوحة micro:bit التي لن يمنعها مسؤول تقنية المعلومات`,
    ],
    subtitles: [
      `Chrome / Edge · بدون تثبيت · 30 Chromebook في 60 ثانية`,
      `اقرن مرة، وابثّ دائماً · تصدير CSV لكل درس`,
      `مُصمَّم لفصول STEM · ترخيص مدرسي متاح`,
      `تحديثات مدى الحياة · فيرموير مفتوح · يعمل دون اتصال`,
      `مستشعرات حقيقية، رسوم بيانية حية، CSV جاهزة للتحليل`,
    ],
    socialCaptions: [
      `علامة تبويب متصفح حوّلت micro:bit إلى مختبر بيانات حية. أجرى الطلاب تجربة 20 دقيقة دون تثبيت شيء. 🔬`,
      `إذا سبق وشاهدت 30 Chromebook عالقة على تثبيت Python، فهذا هو البديل.`,
      `عملية شراء واحدة من Etsy. صفر تذاكر دعم تقني. ثلاثون طالباً يرسمون بيانات تسارع حقيقية.`,
    ],
    pinCaptions: [
      `معلمو STEM — يجب أن تروا هذا`,
      `لوحة micro:bit في المتصفح (بدون تثبيت)`,
      `حوّل 30 Chromebook إلى محطات علوم بيانات`,
    ],
    emailSubjects: [
      `30 طالباً. 60 ثانية. بيانات حية.`,
      `لوحة micro:bit التي تعمل على أي شيء به متصفح`,
      `توقفوا عن تثبيت Python على Chromebook`,
    ],
  },
  kid: {
    heroTitles: [
      `micro:bit الخاص بك\nيصبح ساحة لعب`,
      `تحكم بالروبوتات بالكود\n(وعلامة تبويب متصفح)`,
      `اجعل micro:bit\nيفعل أشياء على الشاشة`,
      `ارسم. استشعر. حرّك.\nكل ذلك من صفحة واحدة.`,
      `${PRODUCT}: حوّل micro:bit إلى لعبة`,
    ],
    subtitles: [
      `مستشعرات، محركات، نماذج ثلاثية الأبعاد. بدون تثبيت. بدون حساب.`,
      `يعمل دون اتصال بعد الفتح الأول.`,
      `ارسم على مصابيح LED. استمع للجرس. أمل النموذج ثلاثي الأبعاد.`,
      `8 علامات تبويب لتجرّبها. والداك لن يفهما معظمها.`,
      `برمج، أرسل، شاهد الحدث.`,
    ],
    socialCaptions: [
      `رسمت قلباً بالفأرة وأضاءت مصابيح micro:bit. ❤️`,
      `أمل اللوحة الحقيقية ← يميل النموذج ثلاثي الأبعاد أيضاً. هذا سحر حقيقي. ✨`,
      `بدون تثبيت. فقط علامة تبويب تعمل. 🎮`,
    ],
    pinCaptions: [
      `اخترق micro:bit بمتصفح`,
      `3D + LEDs + محركات، كلها في علامة تبويب`,
      `صندوق ألعاب لـ micro:bit`,
    ],
    emailSubjects: [
      `أمل micro:bit، يتبعه توأمه`,
      `علامة تبويب واحدة. كل الميزات الثماني.`,
      `ارسم قلباً واجعله يضيء.`,
    ],
  },
  maker: {
    heroTitles: [
      `لوحة تحكم BLE\nللمبدعين`,
      `${PRODUCT}: اخترق micro:bit\nمن المتصفح`,
      `Web Bluetooth يعمل\nفعلاً`,
      `فيرموير MakeCode +\nلوحة تحكم المتصفح`,
      `سطح تحكم BLE\nمتوافق مع المصدر المفتوح`,
    ],
    subtitles: [
      `محركات حية · انعكاس ثلاثي الأبعاد · تصدير CSV · فيرموير مفتوح`,
      `متوافق مع MakeCode. قابل للاختراق. بدون قفل احتكاري.`,
      `رسم SVG gauges · نماذج Three.js · مصدر makecode.ts مُرفق`,
      `Web Bluetooth، واجهة متصفح قابلة للاختراق، رخصة MIT.`,
      `تشحن جهاز BLE خاصاً بك؟ اعمل fork وابنِ فوقه.`,
    ],
    socialCaptions: [
      `Web Bluetooth جاهز للإنتاج. الدليل بالمثال. 📡`,
      `متصفح → BLE → micro:bit → عودة. ذهاب وإياب 5 مللي ثانية. بدون تثبيت.`,
      `رخصة MIT، قابل للاختراق، قابل للنشر. استخدمه كقاعدة لجهاز BLE الخاص بك.`,
    ],
    pinCaptions: [
      `Web Bluetooth، بشكل صحيح`,
      `قالب لوحة معلومات BLE (قابل للاختراق)`,
      `فيرموير MakeCode + واجهة متصفح`,
    ],
    emailSubjects: [
      `Web Bluetooth ينجو من الإنتاج`,
      `قالب BLE الذي كنت أتمنى امتلاكه منذ سنتين`,
      `Fork · ابنِ فوق · انشر`,
    ],
  },
};
TEMPLATES_BY_LANG.fr = {
  teacher: {
    heroTitles: [
      `Chaque capteur, en direct dans le navigateur`,
      `${PRODUCT} pour les salles sans 30 ordinateurs neufs`,
      `STEM sans installation, compatible Wi-Fi d'école`,
      `Enseignez le capteur, pas l'installation`,
      `Le panneau micro:bit que votre DSI ne va pas bloquer`,
    ],
    subtitles: [
      `Chrome / Edge · zéro installation · 30 Chromebooks en 60 sec`,
      `Appairez une fois, streamez toujours · export CSV pour chaque leçon`,
      `Conçu pour les salles de STEM · licence école disponible`,
      `Mises à jour à vie · firmware ouvert · fonctionne hors ligne`,
      `Capteurs réels, graphiques en direct, CSV prêts pour l'analyse`,
    ],
    socialCaptions: [
      `Un onglet de navigateur a transformé mon micro:bit en labo de données. Les élèves ont mené une expérience de 20 minutes sans rien installer. 🔬`,
      `Si vous avez déjà vu 30 Chromebooks bloqués sur une install Python, voici l'alternative.`,
      `Un achat Etsy. Zéro ticket DSI. Trente élèves qui tracent des données d'accéléromètre en direct.`,
    ],
    pinCaptions: [
      `Profs de STEM — à voir absolument`,
      `Panneau micro:bit dans le navigateur (sans install)`,
      `Transformez 30 Chromebooks en stations de data science`,
    ],
    emailSubjects: [
      `30 élèves. 60 secondes. Données en direct.`,
      `Le panneau micro:bit qui tourne sur tout ce qui a un navigateur`,
      `Arrêtez d'installer Python sur vos Chromebooks`,
    ],
  },
  kid: {
    heroTitles: [
      `Ton micro:bit\ndevient un terrain de jeu`,
      `Commande des robots avec du code\n(et un onglet)`,
      `Fais bouger\nton micro:bit depuis l'écran`,
      `Dessine. Détecte. Bouge.\nTout sur une page.`,
      `${PRODUCT} : transforme un micro:bit en jeu`,
    ],
    subtitles: [
      `Capteurs, servos, obstacles SLAM. Sans install. Sans compte.`,
      `Fonctionne hors ligne après la première ouverture.`,
      `Dessine sur les LEDs. Écoute le buzzer. Incline le obstacle SLAM.`,
      `8 onglets à explorer. Tes parents n'y comprendront rien.`,
      `Code-le, envoie-le, regarde-le se passer.`,
    ],
    socialCaptions: [
      `J'ai dessiné un cœur à la souris et les LEDs de mon micro:bit se sont allumées. ❤️`,
      `Incline la carte réelle → la 3D s'incline aussi. C'est de la magie. ✨`,
      `Zéro install. Juste un onglet qui marche. 🎮`,
    ],
    pinCaptions: [
      `Bidouille ton micro:bit avec un navigateur`,
      `3D + LEDs + moteurs, tout sur un onglet`,
      `Une boîte à jouets pour ton micro:bit`,
    ],
    emailSubjects: [
      `Incline ton micro:bit, son jumeau suit`,
      `Un onglet. Toutes les 8 fonctions.`,
      `Dessine un cœur, fais-le briller.`,
    ],
  },
  maker: {
    heroTitles: [
      `Panneau BLE\npour makers`,
      `${PRODUCT} : bidouille le micro:bit\ndepuis le navigateur`,
      `Du Web Bluetooth\nqui fonctionne vraiment`,
      `Firmware MakeCode +\ntableau de bord navigateur`,
      `Surface de contrôle BLE\ncompatible open source`,
    ],
    subtitles: [
      `Moteurs en direct · miroir 3D · export CSV · firmware ouvert`,
      `Compatible MakeCode. Hackable. Sans verrou propriétaire.`,
      `Graphique SVG gauges · modèles Three.js · source makecode.ts inclus`,
      `Web Bluetooth, UI navigateur hackable, licence MIT.`,
      `Tu expédies ton propre BLE ? Fork et construis par-dessus.`,
    ],
    socialCaptions: [
      `Web Bluetooth est prêt pour la prod. Preuve par l'exemple. 📡`,
      `Navigateur → BLE → micro:bit → retour. 5 ms aller-retour. Sans install.`,
      `Licence MIT, hackable, déployable. Utilise-le comme base pour ton propre device BLE.`,
    ],
    pinCaptions: [
      `Web Bluetooth, bien fait`,
      `Template de dashboard BLE (hackable)`,
      `Firmware MakeCode + UI navigateur`,
    ],
    emailSubjects: [
      `Du Web Bluetooth qui survit à la prod`,
      `Le template BLE que j'aurais voulu avoir il y a 2 ans`,
      `Fork · build par-dessus · expédie`,
    ],
  },
};
TEMPLATES_BY_LANG.en = {
  teacher: {
    heroTitles: [
      `Every sensor, live in every browser`,
      `${PRODUCT} for classrooms that don't have 30 laptops`,
      `Zero-install STEM for real school Wi-Fi`,
      `Teach the sensor, not the setup`,
      `The micro:bit panel your IT team won't fight`,
    ],
    subtitles: [
      `Chrome / Edge · no install · 30 Chromebooks in 60 seconds`,
      `Pair once, stream forever · CSV export for every lesson`,
      `Built for STEM classrooms · site license available`,
      `Lifetime updates · open firmware · offline-ready`,
      `Real sensors, live graphs, data-analysis-ready CSVs`,
    ],
    socialCaptions: [
      `A browser tab turned my micro:bit into a live-data lab. Students ran 20-minute experiments without installing a thing. 🔬`,
      `If you've ever watched 30 Chromebooks stall on a Python install, this is the alternative.`,
      `One Etsy download. Zero IT tickets. Thirty students graphing real accelerometer data.`,
    ],
    pinCaptions: [
      `STEM teachers — you need to see this`,
      `Browser-based micro:bit panel (no install)`,
      `Turn 30 Chromebooks into data-science stations`,
    ],
    emailSubjects: [
      `30 kids. 60 seconds. Real sensor data.`,
      `The micro:bit panel that runs on anything with a browser`,
      `Stop installing Python on Chromebooks`,
    ],
  },
  kid: {
    heroTitles: [
      `Your micro:bit\nbecomes a playground`,
      `Control robots with code\n(and a browser tab)`,
      `Make the micro:bit\ndo stuff on screen`,
      `Draw. Sense. Move.\nAll from one page.`,
      `${PRODUCT}: turn a micro:bit into a game`,
    ],
    subtitles: [
      `Sensors, servos, 3D models. No install. No account.`,
      `Works offline after the first open.`,
      `Draw on the LEDs. Hear the buzzer. Tilt the 3D model.`,
      `8 tabs of things to try. Your parents won't understand most of them.`,
      `Code it, send it, watch it happen.`,
    ],
    socialCaptions: [
      `I drew a heart with my mouse and my micro:bit's LEDs lit up. ❤️`,
      `Tilt the real board → the 3D one tilts too. This is actual magic.`,
      `No install. Just open a tab and go. 🎮`,
    ],
    pinCaptions: [
      `Hack your micro:bit with a browser`,
      `3D + LEDs + motors, all from one tab`,
      `A toybox for your micro:bit`,
    ],
    emailSubjects: [
      `Tilt your micro:bit, tilt its twin`,
      `One browser tab. All 8 features.`,
      `Draw a heart, make it glow.`,
    ],
  },
  maker: {
    heroTitles: [
      `BLE Control Panel\nfor Makers`,
      `${PRODUCT}: hack the micro:bit\nfrom the browser`,
      `Web Bluetooth that\nactually works`,
      `MakeCode firmware\n+ live browser dashboard`,
      `Open source friendly\nBLE control surface`,
    ],
    subtitles: [
      `Live motors · 3D mirrors · CSV export · open firmware`,
      `MakeCode-compatible. Hackable. No vendor lock-in.`,
      `SVG gauges graph · Three.js models · makecode.ts source included`,
      `Web Bluetooth, a fully hackable browser UI, MIT license.`,
      `Ship your own BLE device? Fork this and build on top.`,
    ],
    socialCaptions: [
      `Web Bluetooth is production-ready. This proves it. 📡`,
      `Browser → BLE → micro:bit → back again. 5ms round-trip. No install.`,
      `MIT-licensed, hackable, shippable. Use it as a reference for your own BLE device.`,
    ],
    pinCaptions: [
      `Web Bluetooth, done right`,
      `BLE dashboard template (hackable)`,
      `MakeCode firmware + browser UI`,
    ],
    emailSubjects: [
      `Web Bluetooth that survives production`,
      `The BLE control panel template I wish I'd had 2 years ago`,
      `Fork this · build on top · ship`,
    ],
  },
};

const TEMPLATES = TEMPLATES_BY_LANG[LANG] || TEMPLATES_BY_LANG.en;

function templateGen() {
  return Object.fromEntries(
    Object.entries(TEMPLATES).map(([audience, t]) => [audience, {
      hero_titles: t.heroTitles,
      subtitles: t.subtitles,
      social_captions: t.socialCaptions,
      pin_captions: t.pinCaptions,
      email_subjects: t.emailSubjects,
    }])
  );
}

// ---------- Anthropic-powered variants ----------

async function llmGen() {
  const { default: Anthropic } = await import('@anthropic-ai/sdk').catch(() => ({ default: null }));
  if (!Anthropic) {
    console.log('⚠️  @anthropic-ai/sdk not installed; using template fallback.');
    return null;
  }
  const client = new Anthropic();
  const audiences = Object.keys(TEMPLATES);
  const out = {};

  for (const audience of audiences) {
    const prompt = `You are writing Etsy listing copy for "${PRODUCT}" — ${TAGLINE}.
Target audience: ${audience}.

Produce 5 each of: hero_titles (max 2 lines, punchy), subtitles (1 line, supportive),
social_captions (1-2 sentences, emoji-light), pin_captions (Pinterest-ready, under 60 chars),
email_subjects (under 50 chars, curiosity gap).

Return pure JSON with exactly these 5 keys. No markdown fences, no prose.`;

    try {
      console.log(`  · LLM generating for ${audience}`);
      const msg = await client.messages.create({
        model: 'claude-opus-4-7',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      });
      const text = msg.content?.[0]?.text || '';
      const json = text.match(/\{[\s\S]*\}/)?.[0];
      out[audience] = json ? JSON.parse(json) : null;
    } catch (e) {
      console.log(`  ⚠️  LLM failed for ${audience}: ${e.message}`);
      out[audience] = null;
    }
  }
  return out;
}

// ---------- run ----------

const usedLlm = !!process.env.ANTHROPIC_API_KEY;
console.log(`\n✍️  Caption generator (${usedLlm ? 'LLM mode' : 'template mode'})\n`);

let result = null;
if (usedLlm) result = await llmGen();
if (!result || Object.values(result).some(v => !v)) {
  console.log('  · falling back to templates for missing audiences');
  const templates = templateGen();
  if (!result) result = templates;
  else for (const k of Object.keys(templates)) if (!result[k]) result[k] = templates[k];
}

writeFileSync(join(OUT, 'captions.json'), JSON.stringify(result, null, 2));

const md = [
  `# ${PRODUCT} — A/B caption bank`,
  '',
  `Generated ${new Date().toISOString().slice(0, 10)} · ${usedLlm ? 'LLM-generated' : 'template-generated'}`,
  '',
  ...Object.entries(result).flatMap(([audience, sets]) => [
    `## ${audience}`,
    '',
    ...Object.entries(sets).flatMap(([key, vals]) => [
      `### ${key}`,
      '',
      ...vals.map((v, i) => `${i + 1}. ${v.replace(/\n/g, ' / ')}`),
      '',
    ]),
  ]),
].join('\n');
writeFileSync(join(OUT, 'captions.md'), md);

console.log(`\n✅ ${join(OUT, 'captions.json')}`);
console.log(`✅ ${join(OUT, 'captions.md')}\n`);
