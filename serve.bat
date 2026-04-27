@echo off
rem ============================================================
rem  serve.bat — double-click to launch Maqueen Lab locally.
rem  Tries Python first (everyone has it), falls back to npx serve.
rem  Why: opening index.html via file:// triggers CORS errors on
rem  manifest.json / product.json / build-info.json. Serving over
rem  http://localhost makes them load cleanly. See README.md.
rem ============================================================

cd /d "%~dp0"

where python >nul 2>nul
if %errorlevel% == 0 (
    python tools\serve.py
    goto :eof
)

where py >nul 2>nul
if %errorlevel% == 0 (
    py tools\serve.py
    goto :eof
)

where npx >nul 2>nul
if %errorlevel% == 0 (
    echo Python not found. Falling back to npx serve.
    npx serve .
    goto :eof
)

echo.
echo ERROR: neither Python nor Node/npx is installed.
echo Install Python from https://python.org or Node from https://nodejs.org
echo and run this file again.
pause
