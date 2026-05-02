"""Read-only audit of HTML reachability + broken links across the repo."""
import os, re
from collections import deque

ROOT = '.'
SKIP = {'.git', 'node_modules', '.claude', 'etsy-package'}
SLASH = lambda p: p.replace('\\', '/')

htmls = []
for r, d, f in os.walk(ROOT):
    d[:] = [x for x in d if x not in SKIP]
    for n in f:
        if n.endswith('.html'):
            htmls.append(SLASH(os.path.relpath(os.path.join(r, n))))

all_set = set(p[2:] if p.startswith('./') else p for p in htmls)

ref_targets = set()
back = {}      # target -> list of sources that link to it
graph = {}     # source -> list of href targets
href_re = re.compile(r'''href\s*=\s*["']([^"'#?]+\.html)(?:[#?][^"']*)?["']''', re.I)

for src in htmls:
    src_norm = src[2:] if src.startswith('./') else src
    src_dir = os.path.dirname(src_norm)
    try:
        with open(src, 'r', encoding='utf-8', errors='ignore') as fh:
            s = fh.read()
    except Exception:
        continue
    edges = []
    for m in href_re.finditer(s):
        t = m.group(1)
        if t.startswith(('http:', 'https:', 'mailto:', '//')):
            continue
        joined = SLASH(os.path.normpath(os.path.join(src_dir, t)))
        if joined.startswith('../'):
            continue
        edges.append(joined)
        ref_targets.add(joined)
        back.setdefault(joined, []).append(src_norm)
    graph[src_norm] = edges

# BFS reachability from index.html
roots = ['index.html']
seen = set(roots)
q = deque(roots)
while q:
    cur = q.popleft()
    for nb in graph.get(cur, []):
        if nb in all_set and nb not in seen:
            seen.add(nb)
            q.append(nb)

orphans = sorted(all_set - seen)
broken = sorted(t for t in ref_targets if t not in all_set)

print('=' * 60)
print(f'HTML files in repo (excluding etsy-package): {len(all_set)}')
print(f'Reachable from index.html: {len(seen)}')
print(f'Orphans: {len(orphans)}')
print(f'Broken hrefs: {len(broken)}')
print('=' * 60)

print('\n--- ORPHANS (not reachable from index.html via clicks) ---')
for o in orphans:
    inc = back.get(o, [])
    print(f'  {o}')
    if inc:
        print(f'      ↑ incoming from: {inc}')
    else:
        print(f'      ↑ NO incoming links anywhere')

print('\n--- BROKEN HREFS (link targets that do not exist as files) ---')
for b in broken:
    print(f'  {b}')
    print(f'      ↑ from: {back.get(b, [])[:5]}')

print('\n--- INCOMING-LINK COUNT (most lonely first) ---')
sorted_by_inc = sorted(all_set, key=lambda f: (len(back.get(f, [])), f))
for f in sorted_by_inc:
    inc = len(back.get(f, []))
    out = len(graph.get(f, []))
    print(f'  in={inc:>2}  out={out:>2}  {f}')
