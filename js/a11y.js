/* js/a11y.js — global accessibility enhancements.
 *
 * Loaded on every page. Idempotent and additive — never breaks existing UI.
 *
 * What it does:
 *   1. Injects a "Skip to main content" link as the first focusable element
 *      (visible only on focus, jumps to <main> or first <section>).
 *   2. Adds a visible focus ring globally (overrides legacy `outline:none`
 *      resets common in older themes).
 *   3. Auto-labels icon-only buttons whose text is just emoji/single char,
 *      using the `title` attribute as a fallback for `aria-label`.
 *   4. Marks decorative emoji-only spans (.deco, .ic) with aria-hidden so
 *      screen readers don't read them aloud.
 *   5. Ensures the document has a `lang` attribute (defaults to 'en').
 *
 * No external dependencies, no network. <2 KB.
 */
(function () {
  'use strict';

  // ───── 1. Inject focus-ring CSS once ─────
  function injectFocusCss() {
    if (document.getElementById('mq-a11y-css')) return;
    var style = document.createElement('style');
    style.id = 'mq-a11y-css';
    style.textContent = [
      '/* a11y: visible focus ring (uses :focus-visible to avoid mouse-click glow) */',
      ':focus-visible { outline: 3px solid var(--cyan, #38bdf8) !important; outline-offset: 2px !important; border-radius: 4px; }',
      'button:focus-visible, a:focus-visible, [role="button"]:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, summary:focus-visible {',
      '  outline: 3px solid var(--cyan, #38bdf8) !important; outline-offset: 2px !important;',
      '}',
      '/* skip link */',
      '.mq-skip-link { position: absolute; top: -100px; left: 8px; z-index: 99999; background: var(--neon, #4ade80); color: var(--ink, #0a1018); padding: 10px 16px; border-radius: 6px; font-weight: 700; text-decoration: none; box-shadow: 0 4px 14px rgba(0,0,0,0.4); }',
      '.mq-skip-link:focus { top: 8px; }',
      '/* prefers-reduced-motion: respect it */',
      '@media (prefers-reduced-motion: reduce) {',
      '  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; }',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  // ───── 2. Skip link ─────
  function injectSkipLink() {
    if (document.querySelector('.mq-skip-link')) return;
    // Find a target — first <main>, then first <section>, else <body>.
    var target = document.querySelector('main') || document.querySelector('section') || document.body;
    if (!target.id) target.id = 'mq-main';
    var a = document.createElement('a');
    a.className = 'mq-skip-link';
    a.href = '#' + target.id;
    a.textContent = 'Skip to main content';
    a.setAttribute('data-i18n', 'a11y_skip');
    document.body.insertBefore(a, document.body.firstChild);
  }

  // ───── 3. Auto-label icon-only buttons/links ─────
  function looksIconOnly(el) {
    var txt = (el.textContent || '').trim();
    if (!txt) return true;
    // Single emoji or short emoji+space (e.g., "🖨 Imprimer" is fine; "🖨" alone isn't)
    if (txt.length <= 2) return true;
    // Pure emoji string (no alphanumeric)
    return !/[a-zA-Z0-9؀-ۿ]/.test(txt);
  }
  function autoLabel() {
    var els = document.querySelectorAll('button, a, [role="button"]');
    els.forEach(function (el) {
      if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return;
      if (!looksIconOnly(el)) return;
      var label = el.getAttribute('title') || el.getAttribute('data-tooltip');
      if (!label) {
        // Try the visible text or alt of an inner img
        var img = el.querySelector('img');
        if (img && img.alt) label = img.alt;
        else label = (el.textContent || '').trim();
      }
      if (label) el.setAttribute('aria-label', label);
    });
  }

  // ───── 4. Hide purely decorative emoji from screen readers ─────
  function hideDecorativeEmoji() {
    document.querySelectorAll('.deco, .ic, .emoji, [data-decorative]').forEach(function (el) {
      if (!el.hasAttribute('aria-hidden')) el.setAttribute('aria-hidden', 'true');
    });
  }

  // ───── 5. Ensure lang attribute ─────
  function ensureLang() {
    if (!document.documentElement.lang) {
      var saved = null;
      try { saved = localStorage.getItem('robi.lang'); } catch (e) {}
      document.documentElement.lang = saved || 'en';
    }
  }

  // ───── 6. Boot ─────
  function boot() {
    try { ensureLang(); } catch (e) {}
    try { injectFocusCss(); } catch (e) {}
    try { injectSkipLink(); } catch (e) {}
    try { autoLabel(); } catch (e) {}
    try { hideDecorativeEmoji(); } catch (e) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
