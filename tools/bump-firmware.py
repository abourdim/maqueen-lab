#!/usr/bin/env python3
"""
bump-firmware.py — bumps the firmware patch version + build date,
re-encodes the firmware as base64, and embeds it into index.html.

Run before committing any change that affects the firmware (or any
time you want the version stamp to reflect the latest source).

Usage:  python tools/bump-firmware.py
        python tools/bump-firmware.py --bump major   (0.1.5 -> 1.0.0)
        python tools/bump-firmware.py --bump minor   (0.1.5 -> 0.2.0)
        python tools/bump-firmware.py --no-bump      (just refresh date)
"""
import re, sys, base64, datetime, pathlib

FW_PATH = pathlib.Path('firmware/v1-maqueen-lib.ts')
HTML_PATH = pathlib.Path('index.html')

bump = 'patch'
for arg in sys.argv[1:]:
    if arg == '--bump' and sys.argv.index(arg) + 1 < len(sys.argv):
        bump = sys.argv[sys.argv.index(arg) + 1]
    elif arg == '--no-bump':
        bump = 'none'

src = FW_PATH.read_text(encoding='utf-8')

# ---- Bump BUILD_VERSION ----
m = re.search(r'const BUILD_VERSION = "(\d+)\.(\d+)\.(\d+)"', src)
if not m:
    print('ERROR: BUILD_VERSION not found in', FW_PATH)
    sys.exit(1)
major, minor, patch = int(m[1]), int(m[2]), int(m[3])

if bump == 'major':
    major += 1; minor = 0; patch = 0
elif bump == 'minor':
    minor += 1; patch = 0
elif bump == 'patch':
    patch += 1
new_ver = f'{major}.{minor}.{patch}'

src = re.sub(r'const BUILD_VERSION = "[^"]*"',
             f'const BUILD_VERSION = "{new_ver}"', src)

# ---- Refresh BUILD_DATE (date + UTC time) ----
today = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
src = re.sub(r'const BUILD_DATE = "[^"]*"',
             f'const BUILD_DATE = "{today}"', src)

FW_PATH.write_text(src, encoding='utf-8', newline='\n')

# ---- Re-embed in index.html ----
fw_b64 = base64.b64encode(src.encode('utf-8')).decode('ascii')
html = HTML_PATH.read_text(encoding='utf-8')
html = re.sub(
    r'(<script id="firmwareSource" type="text/plain">)[^<]+(</script>)',
    r'\g<1>' + fw_b64 + r'\g<2>',
    html,
)
HTML_PATH.write_text(html, encoding='utf-8', newline='\n')

print(f'Firmware bumped -> v{new_ver}  built {today}')
print(f'  - {FW_PATH} updated')
print(f'  - {HTML_PATH} embedded blob refreshed ({len(fw_b64)} chars b64)')
