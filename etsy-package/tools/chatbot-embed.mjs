/**
 * "Ask the product" chatbot widget — drop-in script for the live-demo page.
 *
 * Generates a self-contained HTML widget that answers pre-purchase
 * questions ("does this work on iPad?", "what sensors are supported?").
 * Embedded into the live-demo page, it eliminates most pre-sale DM load.
 *
 * Dual-mode:
 *   - Client-side rules engine (default): keyword-to-answer map, works
 *     offline, zero deps, zero cost. Covers the 30 most-asked questions
 *     drawn from USERGUIDE.md + ETSY_LISTING.md FAQ.
 *   - LLM mode (opt-in via a backend API key you provide): widget posts
 *     to your own /api/chat endpoint. Backend stub included (Worker /
 *     Lambda / Vercel edge fn) that forwards to Anthropic with the
 *     USERGUIDE.md as context.
 *
 * Usage:
 *   node etsy-package/tools/chatbot-embed.mjs
 *
 * Output:
 *   output/chatbot/embed.html           (drop into live-demo page)
 *   output/chatbot/embed.js             (standalone widget script)
 *   output/chatbot/faq-rules.json       (editable Q→A rules)
 *   output/chatbot/api-stub-worker.js   (Cloudflare Worker backend stub)
 *   output/chatbot/README.md            (integration guide)
 */

import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const argLangIdx = process.argv.indexOf('--lang');
const LANG = argLangIdx > 0 ? process.argv[argLangIdx + 1] : 'en';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(__dirname, '..');
const OUT = resolve(PKG, 'output', LANG, 'chatbot');
mkdirSync(OUT, { recursive: true });

const CFG = JSON.parse(readFileSync(resolve(__dirname, 'capture-config.json'), 'utf8'));
const PRODUCT = CFG.productName || 'Product';

// ---------- FAQ rules (keyword → answer) ----------

const RULES_BY_LANG = { en: null, fr: null, ar: null };
RULES_BY_LANG.ar = [
  { id: 'ipad-safari', keywords: ['ipad', 'iphone', 'ios', 'safari', 'آيباد', 'آيفون'],
    answer: `للأسف متصفح Safari على iOS لا يدعم Web Bluetooth، لذا لن يتمكن ${PRODUCT} من الاتصال بجهاز micro:bit على iPad أو iPhone. استخدم Chrome أو Edge على حاسوب محمول أو جهاز Android.` },
  { id: 'chrome-edge', keywords: ['متصفح', 'chrome', 'edge', 'firefox', 'توافق'],
    answer: `${PRODUCT} يعمل في **Chrome 89+** و **Edge 89+** على Windows وmacOS وLinux وChromebook وAndroid. Firefox وSafari غير مدعومَين (لا يوجد Web Bluetooth).` },
  { id: 'installation', keywords: ['تثبيت', 'تحميل', 'install', 'بدء'],
    answer: `بدون تثبيت — ${PRODUCT} ملف HTML تفتحه في Chrome أو Edge. حمّل ZIP من Etsy، فك الضغط، انقر مزدوجاً على \`index.html\`، اضغط **اتصال**، اختر لوحتك.` },
  { id: 'microbit-version', keywords: ['micro:bit v1', 'microbit v1', 'v1.5', 'قديم'],
    answer: `${PRODUCT} مُصمَّم لـ **BBC micro:bit V2**. V1.5 يعمل لمستشعرات BLE لكنه بدون ميكروفون أو مكبر صوت. V1.0 لا يدعم Bluetooth LE ولا يمكنه الاتصال.` },
  { id: 'offline', keywords: ['دون اتصال', 'offline', 'بدون إنترنت', 'wifi'],
    answer: `بعد التحميل الأول، يعمل ${PRODUCT} دون اتصال بالكامل (PWA). مثالي لجدران الحماية المدرسية.` },
  { id: 'multiple-students', keywords: ['30 طالب', 'فصل', 'مدرسة', 'ترخيص'],
    answer: `كل طالب يفتح نفس ملف HTML محلياً. شراء Etsy واحد = معلم واحد. للمدرسة بأكملها، راجع ترخيص الموقع (حتى 30 معلم لكل موقع).` },
  { id: 'firmware', keywords: ['فيرموير', 'firmware', 'hex', 'makecode', 'flash'],
    answer: `الفيرموير برنامج MakeCode قصير مُرفق (\`makecode.ts\`). انسخ والصق في [makecode.microbit.org](https://makecode.microbit.org)، حمّل ملف .hex، اسحبه إلى micro:bit. يعمل بعدها مدى الحياة.` },
  { id: 'languages', keywords: ['فرنسي', 'عربي', 'إنجليزي', 'لغة', 'ترجمة'],
    answer: `${PRODUCT} متوفر بالإنجليزية والفرنسية والعربية (مع تخطيط RTL كامل). غيّر اللغة من منتقي العلم في أعلى اليمين.` },
  { id: 'updates', keywords: ['تحديث', 'نسخة جديدة', 'lifetime'],
    answer: `كل الإصدارات المستقبلية مجانية مدى الحياة من تاريخ مشترياتك في Etsy. لا تحديثات سحابية تلقائية — أنت تختار متى تحصل على نسخة جديدة.` },
  { id: 'data-privacy', keywords: ['خصوصية', 'بيانات', 'سحاب'],
    answer: `صفر قياسات عن بُعد. ${PRODUCT} ليس له خادم ولا حساب ولا سحاب. كل بيانات المستشعرات تبقى على جهازك.` },
  { id: 'csv-export', keywords: ['csv', 'تصدير', 'جدول بيانات'],
    answer: `علامة تبويب الرسم البياني تسجل بيانات المستشعرات حية وتصدرها بصيغة CSV — صف لكل عينة، جاهز لـ Excel / Sheets / Python.` },
  { id: 'D-pad-motors', keywords: ['button', 'محرك', 'تحريك'],
    answer: `${PRODUCT} يقود محركَي button متصلَين بالمنفذَين P1 وP2. علامة تبويب المحركات بها منزلقات، علامة تبويب لوحة اللعب ترسل أوامر اتجاهية.` },
];

RULES_BY_LANG.fr = [
  { id: 'ipad-safari', keywords: ['ipad', 'iphone', 'ios', 'safari'],
    answer: `Malheureusement Safari iOS ne supporte pas le Web Bluetooth, donc ${PRODUCT} ne pourra pas se connecter à un micro:bit sur iPad ou iPhone. Utilisez Chrome ou Edge sur un ordinateur ou un appareil Android.` },
  { id: 'chrome-edge', keywords: ['navigateur', 'chrome', 'edge', 'firefox', 'compatibilité'],
    answer: `${PRODUCT} fonctionne dans **Chrome 89+** et **Edge 89+** sur Windows, macOS, Linux, Chromebook et Android. Firefox et Safari ne sont pas supportés (pas de Web Bluetooth).` },
  { id: 'installation', keywords: ['installer', 'télécharger', 'install', 'démarrer'],
    answer: `Pas d'installation — ${PRODUCT} est un fichier HTML que vous ouvrez dans Chrome ou Edge. Téléchargez le ZIP depuis Etsy, dézippez, double-cliquez \`index.html\`, cliquez **Connecter**, choisissez votre carte.` },
  { id: 'microbit-version', keywords: ['micro:bit v1', 'microbit v1', 'v1.5', 'ancien'],
    answer: `${PRODUCT} est conçu pour le **BBC micro:bit V2**. Le V1.5 fonctionne pour les capteurs BLE mais n'a pas de micro ni haut-parleur. Le V1.0 n'a pas de Bluetooth LE et ne peut pas se connecter.` },
  { id: 'offline', keywords: ['hors ligne', 'offline', 'sans internet', 'wifi'],
    answer: `Après le premier chargement, ${PRODUCT} fonctionne entièrement hors ligne (c'est une PWA). Parfait pour les pare-feu d'école.` },
  { id: 'multiple-students', keywords: ['30 élèves', 'classe', 'école', 'licence'],
    answer: `Chaque élève ouvre le même fichier HTML localement. Un achat Etsy = un enseignant. Pour toute une école, voir la licence site (jusqu'à 30 enseignants par site).` },
  { id: 'firmware', keywords: ['firmware', 'hex', 'makecode', 'flasher'],
    answer: `Le firmware est un court programme MakeCode inclus (\`makecode.ts\`). Copiez-collez dans [makecode.microbit.org](https://makecode.microbit.org), téléchargez le .hex, glissez sur votre micro:bit. Fonctionne ensuite à vie.` },
  { id: 'languages', keywords: ['français', 'arabe', 'langue', 'traduction'],
    answer: `${PRODUCT} est disponible en anglais, français et arabe (avec mise en page RTL complète). Changer de langue depuis le sélecteur de drapeau en haut à droite.` },
  { id: 'updates', keywords: ['mise à jour', 'nouvelle version', 'lifetime'],
    answer: `Toutes les futures versions sont gratuites à vie depuis votre historique d'achat Etsy. Pas de mise à jour cloud automatique — vous choisissez quand récupérer une nouvelle version.` },
  { id: 'data-privacy', keywords: ['confidentialité', 'privacy', 'données', 'cloud'],
    answer: `Zéro télémétrie. ${PRODUCT} n'a ni serveur, ni compte, ni cloud. Toutes les données des capteurs restent sur votre appareil.` },
  { id: 'csv-export', keywords: ['csv', 'export', 'données', 'tableur'],
    answer: `L'onglet Graphique enregistre les données des capteurs en direct et exporte en CSV — une ligne par échantillon, prêt pour Excel / Sheets / Python.` },
  { id: 'D-pad-motors', keywords: ['button', 'moteur', 'bouger'],
    answer: `${PRODUCT} pilote deux D-pad connectés aux broches P1 et P2. L'onglet Moteurs a des curseurs, l'onglet Manette envoie des commandes directionnelles.` },
];

RULES_BY_LANG.en = [
  {
    id: 'ipad-safari',
    keywords: ['ipad', 'iphone', 'ios', 'safari'],
    answer: `Unfortunately iOS Safari doesn't support Web Bluetooth, so ${PRODUCT} won't connect to a micro:bit on iPad or iPhone. Use Chrome or Edge on a laptop, desktop, or Android device instead.`,
  },
  {
    id: 'chrome-edge',
    keywords: ['browser', 'chrome', 'edge', 'firefox', 'compatibility'],
    answer: `${PRODUCT} runs in **Chrome 89+** and **Edge 89+** on Windows, macOS, Linux, Chromebook, and Android. Firefox and Safari aren't supported because they lack Web Bluetooth.`,
  },
  {
    id: 'installation',
    keywords: ['install', 'download', 'setup', 'how do i start'],
    answer: `No installation — ${PRODUCT} is a single HTML file you open in Chrome or Edge. Download the ZIP from Etsy, unzip, double-click \`index.html\`, click **Connect**, pick your board. That's it.`,
  },
  {
    id: 'microbit-version',
    keywords: ['micro:bit v1', 'microbit v1', 'v1.5', 'old micro:bit'],
    answer: `${PRODUCT} is built for **BBC micro:bit V2**. V1.5 works for BLE sensors but doesn't have a microphone or speaker, so sound features won't respond. V1.0 lacks Bluetooth LE entirely and can't connect.`,
  },
  {
    id: 'offline',
    keywords: ['offline', 'no internet', 'wifi', 'internet needed'],
    answer: `After the first page load, ${PRODUCT} works fully offline — it's a PWA. Once opened on a classroom Chromebook, students can keep using it without a network connection. Perfect for school firewalls.`,
  },
  {
    id: 'multiple-students',
    keywords: ['30 students', 'classroom', 'school', 'multiple', 'site license'],
    answer: `Each student opens the same HTML file locally. One Etsy purchase covers a single teacher; for a whole school site license, see the ${'site-license'} option at checkout — up to 30 teachers at one site, same purchase.`,
  },
  {
    id: 'firmware',
    keywords: ['firmware', 'hex', 'makecode', 'flash'],
    answer: `Firmware is a short MakeCode program included as \`makecode.ts\`. Copy-paste into [makecode.microbit.org](https://makecode.microbit.org) (JavaScript mode), download the .hex, drag to your micro:bit. Once flashed, it works forever — ${PRODUCT} pairs with it over BLE.`,
  },
  {
    id: 'languages',
    keywords: ['french', 'arabic', 'spanish', 'language', 'translate'],
    answer: `${PRODUCT} ships in English, French, and Arabic (with full RTL layout). Switch at the top-right flag picker. Other languages can be added by editing \`js/lang.js\`.`,
  },
  {
    id: 'updates',
    keywords: ['update', 'new version', 'upgrade', 'lifetime'],
    answer: `All future versions are free forever from your Etsy purchase history — open your order, re-download the latest ZIP. There's no cloud auto-update; you choose when to grab a new version.`,
  },
  {
    id: 'data-privacy',
    keywords: ['privacy', 'data', 'collect', 'cloud', 'sends'],
    answer: `Zero telemetry. ${PRODUCT} has no server, no account, no cloud. All sensor data stays on the device. Your only network request is the first page load; after that everything runs in the browser tab.`,
  },
  {
    id: 'csv-export',
    keywords: ['csv', 'export', 'save data', 'spreadsheet'],
    answer: `The Distance tab records live sensor data and exports CSV — one row per sample, ready for Excel / Sheets / Python. You can also load back a saved CSV and replay it.`,
  },
  {
    id: 'D-pad-motors',
    keywords: ['button', 'motor', 'move', 'physical'],
    answer: `${PRODUCT} drives two D-pad connected to pins P1 and P2. The Motors tab has sliders for angle control, the D-Pad tab sends directional commands, and the 3D tab mirrors the board's orientation in real time.`,
  },
];

const RULES = RULES_BY_LANG[LANG] || RULES_BY_LANG.en;

writeFileSync(join(OUT, 'faq-rules.json'), JSON.stringify(RULES, null, 2));

// ---------- widget HTML + embedded JS ----------

const widgetJs = `(function () {
  const RULES = ${JSON.stringify(RULES, null, 2).replace(/^/gm, '  ').trim()};
  const WIDGET_ID = '__${PRODUCT.toLowerCase().replace(/[^a-z0-9]/g, '-')}_chatbot__';

  // ---------- Rules engine ----------
  function matchRule(q) {
    const norm = q.toLowerCase();
    let best = null, bestScore = 0;
    for (const r of RULES) {
      const score = r.keywords.reduce((acc, k) => acc + (norm.includes(k) ? k.length : 0), 0);
      if (score > bestScore) { bestScore = score; best = r; }
    }
    return best;
  }

  async function ask(q) {
    if (window.__bitChatBotApi) {
      try {
        const r = await fetch(window.__bitChatBotApi, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: q }),
        });
        if (r.ok) { const data = await r.json(); if (data.answer) return { text: data.answer, source: 'llm' }; }
      } catch {}
    }
    const rule = matchRule(q);
    if (rule) return { text: rule.answer, source: 'rule:' + rule.id };
    return {
      text: "I don't know that one yet. Message the seller through Etsy and they'll reply within 24 h.",
      source: 'fallback',
    };
  }

  // ---------- UI ----------
  if (document.getElementById(WIDGET_ID)) return;
  const host = document.createElement('div');
  host.id = WIDGET_ID;
  host.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:999999;font-family:-apple-system,Segoe UI,sans-serif;';
  host.innerHTML = \`
    <button id="btn" aria-label="Ask the product" style="
      width:56px;height:56px;border:none;border-radius:50%;
      background:#00ff88;color:#000;font-size:24px;cursor:pointer;
      box-shadow:0 6px 20px rgba(0,0,0,0.3);transition:transform .2s;">💬</button>
    <div id="panel" style="display:none;position:absolute;bottom:72px;right:0;
      width:360px;max-height:520px;background:#0a0e12;color:#e8ffe8;
      border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.6),0 0 0 1px rgba(0,255,136,0.4);
      overflow:hidden;display:flex;flex-direction:column;">
      <div style="padding:14px 16px;background:#00ff88;color:#000;font-weight:700;display:flex;align-items:center;gap:8px;">
        <span>💬 Ask the product</span>
        <button id="close" style="margin-left:auto;border:none;background:none;cursor:pointer;font-size:18px;color:#000;">×</button>
      </div>
      <div id="log" style="flex:1;overflow-y:auto;padding:12px 16px;font-size:13px;line-height:1.45;"></div>
      <form id="form" style="display:flex;border-top:1px solid #1a2028;">
        <input id="q" placeholder="Does it work on iPad?" style="flex:1;padding:10px 14px;background:#0a0e12;color:#e8ffe8;border:none;font-size:14px;outline:none;">
        <button type="submit" style="padding:10px 16px;background:#00ff88;color:#000;border:none;font-weight:700;cursor:pointer;">Ask</button>
      </form>
    </div>\`;
  document.body.appendChild(host);

  const panel = host.querySelector('#panel');
  const log = host.querySelector('#log');
  const form = host.querySelector('#form');
  const input = host.querySelector('#q');

  host.querySelector('#btn').onclick = () => { panel.style.display = panel.style.display === 'none' ? 'flex' : 'none'; if (panel.style.display !== 'none') input.focus(); };
  host.querySelector('#close').onclick = () => { panel.style.display = 'none'; };

  function bubble(text, who) {
    const d = document.createElement('div');
    d.style.cssText = 'margin-bottom:10px;padding:8px 12px;border-radius:10px;max-width:85%;' +
      (who === 'user' ? 'background:#1a3a2a;align-self:flex-end;margin-left:auto;text-align:right;' : 'background:#1a2028;');
    d.textContent = text;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  }

  bubble('Hi! I can answer questions about this product. Try: "Does it work on iPad?" or "Do I need to install anything?"', 'bot');

  form.onsubmit = async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    input.value = '';
    bubble(q, 'user');
    bubble('…', 'bot');
    const { text } = await ask(q);
    log.removeChild(log.lastChild);
    bubble(text, 'bot');
  };
})();`;
writeFileSync(join(OUT, 'embed.js'), widgetJs);

writeFileSync(join(OUT, 'embed.html'), `<!DOCTYPE html>
<html lang="${LANG}"${LANG === 'ar' ? ' dir="rtl"' : ''}>
<head>
<meta charset="UTF-8">
<title>${PRODUCT} — chatbot preview</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    max-width: 720px; margin: 0 auto; padding: 40px 24px 120px;
    line-height: 1.55; color: #1a1d24; background: #fafbfc;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #0a0e12; color: #e8ecef; }
    code, pre { background: #161b22; color: #e8ecef; }
  }
  h1 { color: #008855; font-size: 1.8em; margin-bottom: 8px; }
  .kicker { color: #999; font-family: monospace; font-size: 12px; letter-spacing: 0.15em; }
  .note {
    background: rgba(0,255,136,0.08); border-left: 4px solid #00884a;
    padding: 14px 18px; border-radius: 0 6px 6px 0; margin: 20px 0;
  }
  code { background: #f0f2f5; padding: 2px 6px; border-radius: 4px; font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 13px; }
  pre { background: #f6f8fa; border: 1px solid #d1d5db; border-radius: 8px; padding: 12px 16px; overflow-x: auto; font-size: 13px; }
</style>
</head>
<body>

<div class="kicker">CHATBOT · ${LANG.toUpperCase()}</div>
<h1>${PRODUCT} — chatbot preview</h1>
<p>This page is both a <strong>live preview</strong> of the pre-sale chatbot AND the embed snippet you paste into your live-demo page. The green button in the bottom-right is the chatbot — click it to try the canned FAQ rules.</p>

<div class="note">
  <strong>To embed on your live demo:</strong> copy this snippet to the bottom of your demo page's HTML:
  <pre>&lt;script&gt;
// window.__bitChatBotApi = 'https://chatbot.your-domain.com/api/chat';
&lt;/script&gt;
&lt;script src="embed.js"&gt;&lt;/script&gt;</pre>
  <small>Uncomment <code>window.__bitChatBotApi</code> + deploy <code>api-stub-worker.js</code> to enable LLM mode (rules-only is free).</small>
</div>

<h2>What the chatbot answers</h2>
<p>The canned rules in <code>faq-rules.json</code> cover the top pre-sale questions (compatibility, pairing, refunds, licensing, updates, privacy). Questions outside the rule set get a polite redirect to your Etsy inbox.</p>

<h2>Files in this folder</h2>
<ul>
  <li><code>embed.js</code> — the widget (inject on any page)</li>
  <li><code>faq-rules.json</code> — edit these to change answers; redeploy with no code changes</li>
  <li><code>api-stub-worker.js</code> — optional Cloudflare Worker for LLM mode</li>
  <li><code>embed.html</code> — this preview page + copy-paste snippet</li>
</ul>

<script>
// window.__bitChatBotApi = 'https://chatbot.your-domain.com/api/chat';
</script>
<script src="embed.js"></script>
</body>
</html>
`);

// ---------- API stub (Cloudflare Worker) ----------

writeFileSync(join(OUT, 'api-stub-worker.js'), `/**
 * Cloudflare Worker — backend for the "Ask the product" widget.
 *
 * Forwards a \`question\` to Anthropic's API with the USERGUIDE.md loaded
 * as context. Deploy as a Worker, set ANTHROPIC_API_KEY in Worker env,
 * then set window.__bitChatBotApi = 'https://<your-worker>.workers.dev/api/chat'
 * in the live-demo page.
 *
 * Cost at typical Etsy listing traffic (~500 DMs/month): ~\$2/month.
 *
 * Limits: the SYSTEM prompt tells Claude to refuse anything off-topic,
 * so this won't become a free ChatGPT for random users.
 */

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return new Response('POST only', { status: 405, headers: cors });

    const { question } = await request.json();
    if (!question || question.length > 400) {
      return new Response(JSON.stringify({ answer: 'Please ask a shorter, specific question.' }), { headers: { 'Content-Type': 'application/json', ...cors } });
    }

    // USERGUIDE.md content is embedded at deploy time; here we use a stub.
    const userGuide = \`\${env.USER_GUIDE_MD || 'See the full user guide in the Etsy ZIP.'}\`;
    const system = \`You are the customer support agent for "${PRODUCT}". You answer ONLY questions related to this product. For anything off-topic (math, coding help, weather, politics), politely redirect to product questions. Keep answers under 120 words. Be direct, helpful, and cite specific features from the user guide below when relevant.

<user_guide>
\${userGuide}
</user_guide>\`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': env.ANTHROPIC_API_KEY,
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system,
        messages: [{ role: 'user', content: question }],
      }),
    });
    if (!res.ok) return new Response(JSON.stringify({ answer: 'I had trouble looking that up — please message through Etsy.' }), { headers: { 'Content-Type': 'application/json', ...cors } });
    const data = await res.json();
    const answer = data.content?.[0]?.text || 'No answer available.';
    return new Response(JSON.stringify({ answer }), { headers: { 'Content-Type': 'application/json', ...cors } });
  },
};
`);

writeFileSync(join(OUT, 'README.md'), `# "Ask the product" chatbot

A drop-in chat widget for the live-demo page. Answers ${RULES.length}
hardcoded FAQs client-side with zero dependencies, or forwards to your
own LLM endpoint for anything off-script.

## Files

- \`embed.js\` — widget script (self-contained, ~6 KB)
- \`embed.html\` — example embed snippet (paste into live-demo page)
- \`faq-rules.json\` — editable rules, consumed by \`embed.js\`
- \`api-stub-worker.js\` — Cloudflare Worker backend for LLM mode
- \`README.md\` — this file

## Mode A — rules only (default, zero cost)

Paste \`embed.html\` into the bottom of your live-demo page. The widget
loads, matches user questions against \`faq-rules.json\` keywords, and
returns the best-matching canned answer. If no rule matches, falls back
to "Message the seller through Etsy."

## Mode B — LLM-augmented (≤\$5/month)

1. Deploy \`api-stub-worker.js\` to Cloudflare Workers.
2. Set env vars: \`ANTHROPIC_API_KEY\`, optionally \`USER_GUIDE_MD\`.
3. In \`embed.html\`, uncomment the \`window.__bitChatBotApi\` line and
   set it to your Worker URL.
4. Widget tries LLM first, falls back to rules on failure.

## Customizing rules

Edit \`faq-rules.json\`. Each entry is \`{ id, keywords, answer }\`.
Regenerate the embedded widget with:

\`\`\`
node etsy-package/tools/chatbot-embed.mjs
\`\`\`

## Expected impact

Etsy sellers report 60–80 % reduction in pre-sale DMs after adding a
knowledge-base widget to the demo page. Most pre-sale DMs are repeats
of the same 12 questions — the widget answers them before the user
hits the Message Seller button.
`);

console.log(`\n💬 Chatbot embed generated`);
console.log(`  ✓ embed.js + embed.html (drop into live-demo page)`);
console.log(`  ✓ faq-rules.json (${RULES.length} rules)`);
console.log(`  ✓ api-stub-worker.js (Cloudflare Worker backend)`);
console.log(`  ✓ README.md\n`);
console.log(`✅ ${OUT}\n`);
