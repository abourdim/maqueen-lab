/* docs/_md-render.js — tiny markdown renderer + theme/lang shell.
 * Each docs/<name>.html is a thin wrapper that:
 *   <script>window.MD_FILE = "CHANGELOG.md"; window.MD_TITLE = "Changelog";</script>
 *   <script src="_md-render.js" defer></script>
 * Fetches the sibling .md file and renders it inline. Keeps HTML & MD in sync.
 */
(function () {
  'use strict';

  // ───────── Markdown parser (compact, common subset) ─────────
  function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function inline(s) {
    // Code spans first (protect from other rules)
    s = s.replace(/`([^`]+)`/g, function (_, c) { return '<code>' + escapeHtml(c) + '</code>'; });
    // Bold then italic
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    // Links [text](url)
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_, t, u) {
      var safe = u.replace(/"/g,'&quot;');
      return '<a href="' + safe + '">' + t + '</a>';
    });
    return s;
  }
  function renderMd(md) {
    var lines = md.replace(/\r\n/g, '\n').split('\n');
    var out = [];
    var i = 0;
    while (i < lines.length) {
      var line = lines[i];

      // Fenced code
      if (/^```/.test(line)) {
        var lang = line.slice(3).trim();
        i++;
        var buf = [];
        while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++; // skip closing fence
        out.push('<pre><code' + (lang ? ' class="lang-' + lang + '"' : '') + '>'
                 + escapeHtml(buf.join('\n')) + '</code></pre>');
        continue;
      }

      // Heading
      var h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        var lvl = h[1].length;
        var id  = h[2].toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
        out.push('<h' + lvl + ' id="' + id + '">' + inline(h[2]) + '</h' + lvl + '>');
        i++; continue;
      }

      // Horizontal rule
      if (/^---+$/.test(line)) { out.push('<hr>'); i++; continue; }

      // Blockquote
      if (/^>\s?/.test(line)) {
        var q = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) {
          q.push(lines[i].replace(/^>\s?/, ''));
          i++;
        }
        out.push('<blockquote>' + renderMd(q.join('\n')) + '</blockquote>');
        continue;
      }

      // Table (pipe table with header + ---|--- separator)
      if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-+/.test(lines[i + 1])) {
        var header = line.split('|').slice(1, -1).map(function (c) { return c.trim(); });
        i += 2; // skip separator
        var rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) {
          rows.push(lines[i].split('|').slice(1, -1).map(function (c) { return c.trim(); }));
          i++;
        }
        var t = '<table><thead><tr>';
        header.forEach(function (c) { t += '<th>' + inline(c) + '</th>'; });
        t += '</tr></thead><tbody>';
        rows.forEach(function (r) {
          t += '<tr>';
          r.forEach(function (c) { t += '<td>' + inline(c) + '</td>'; });
          t += '</tr>';
        });
        t += '</tbody></table>';
        out.push(t);
        continue;
      }

      // Lists (unordered or ordered)
      if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
        var ordered = /^\s*\d+\.\s+/.test(line);
        var items = [];
        while (i < lines.length && (/^\s*[-*+]\s+/.test(lines[i]) || /^\s*\d+\.\s+/.test(lines[i]))) {
          items.push(lines[i].replace(/^\s*(?:[-*+]|\d+\.)\s+/, ''));
          i++;
        }
        var tag = ordered ? 'ol' : 'ul';
        out.push('<' + tag + '>' + items.map(function (it) {
          // checkbox lists
          var cb = it.match(/^\[([ xX])\]\s+(.*)$/);
          if (cb) {
            var checked = /[xX]/.test(cb[1]) ? ' checked' : '';
            return '<li><input type="checkbox" disabled' + checked + '> ' + inline(cb[2]) + '</li>';
          }
          return '<li>' + inline(it) + '</li>';
        }).join('') + '</' + tag + '>');
        continue;
      }

      // Blank line
      if (/^\s*$/.test(line)) { i++; continue; }

      // Paragraph (gather consecutive non-blank lines that aren't block starts)
      var p = [line];
      i++;
      while (i < lines.length && lines[i].trim() !== ''
             && !/^#{1,6}\s/.test(lines[i])
             && !/^---+$/.test(lines[i])
             && !/^```/.test(lines[i])
             && !/^>\s?/.test(lines[i])
             && !/^\s*[-*+]\s+/.test(lines[i])
             && !/^\s*\d+\.\s+/.test(lines[i])
             && !/^\s*\|/.test(lines[i])) {
        p.push(lines[i]);
        i++;
      }
      out.push('<p>' + inline(p.join(' ')) + '</p>');
    }
    return out.join('\n');
  }

  // ───────── Theme + lang selectors (mirrors workshops/hub.html) ─────────
  function applyTheme(t) {
    var valid = ['carbon','forest','steel','paper','pearl'];
    if (valid.indexOf(t) === -1) t = 'carbon';
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('robi.theme', t); } catch (e) {}
    var sel = document.getElementById('themeSelect');
    if (sel) sel.value = t;
  }
  function applyLang(l) {
    if (!/^(en|fr|ar)$/.test(l)) l = 'en';
    document.documentElement.lang = l;
    document.documentElement.dir = (l === 'ar') ? 'rtl' : 'ltr';
    try { localStorage.setItem('robi.lang', l); } catch (e) {}
    var sel = document.getElementById('langSelect');
    if (sel) sel.value = l;
    // Re-load the markdown in the chosen language (will fall back to base file if no translation)
    if (window._mdRenderReady) loadMd(l);
  }
  // Source priority:
  //   1. <script type="text/markdown" id="md-<lang>"> for chosen lang
  //   2. <script type="text/markdown" id="md-en"> as fallback
  //   3. fetch <file>.<lang>.md (HTTP only — fails on file:// silently)
  //   4. fetch <file> (English source)
  // Inline blocks let lessons work over file:// (no CORS); fetch is the dev hot-reload path.
  function readInline(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    // Decode escaped markers used by the inliner
    return el.textContent.replace(/<\\\/script>/g, '</script>');
  }
  function loadMd(lang) {
    var file = window.MD_FILE;
    var host = document.getElementById('mdContent');
    if (!host) return;
    var inlineLang = readInline('md-' + lang);
    var inlineEn   = readInline('md-en');
    if (inlineLang) {
      host.innerHTML = renderMd(inlineLang);
      return;
    }
    if (inlineEn && lang !== 'en') {
      host.innerHTML = renderMd(inlineEn);
      var hint = document.createElement('p');
      hint.style.cssText = 'color:var(--steel);font-style:italic;border-left:3px solid var(--amber);padding:6px 12px;margin:0 0 16px;background:var(--bg-card)';
      hint.innerHTML = '⚠ Translation for <b>' + lang.toUpperCase() + '</b> not available yet — showing English source.';
      host.insertBefore(hint, host.firstChild);
      return;
    }
    if (inlineEn) {
      host.innerHTML = renderMd(inlineEn);
      return;
    }
    if (!file) return;
    // Fall back to network fetch (dev mode over HTTP)
    var base = file.replace(/\.md$/i, '');
    var tries = [];
    if (lang && lang !== 'en') tries.push(base + '.' + lang + '.md');
    tries.push(file);
    var attempt = 0;
    function next() {
      if (attempt >= tries.length) {
        host.innerHTML = '<p style="color:var(--danger)">Could not load <code>' + file
          + '</code>. If you opened this page via <code>file://</code>, serve it via HTTP instead — '
          + 'or use the inlined version (rebuild docs).</p>';
        return;
      }
      var url = tries[attempt++];
      fetch(url).then(function (r) {
        if (!r.ok) { next(); return; }
        return r.text().then(function (txt) {
          host.innerHTML = renderMd(txt);
          if (lang && lang !== 'en' && url === file) {
            var hint = document.createElement('p');
            hint.style.cssText = 'color:var(--steel);font-style:italic;border-left:3px solid var(--amber);padding:6px 12px;margin:0 0 16px;background:var(--bg-card)';
            hint.innerHTML = '⚠ Translation for <b>' + lang.toUpperCase() + '</b> not available yet — showing English source.';
            host.insertBefore(hint, host.firstChild);
          }
        });
      }).catch(function () { next(); });
    }
    next();
  }

  // ───────── Boot ─────────
  function boot() {
    // Restore prefs
    var savedTheme = (function(){ try { return localStorage.getItem('robi.theme'); } catch(e){return null;} })() || 'carbon';
    var savedLang  = (function(){ try { return localStorage.getItem('robi.lang');  } catch(e){return null;} })() || 'en';
    applyTheme(savedTheme);
    applyLang(savedLang);

    var ts = document.getElementById('themeSelect');
    if (ts) ts.addEventListener('change', function () { applyTheme(this.value); });
    var ls = document.getElementById('langSelect');
    if (ls) ls.addEventListener('change', function () { applyLang(this.value); });

    window._mdRenderReady = true;
    loadMd(savedLang);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
