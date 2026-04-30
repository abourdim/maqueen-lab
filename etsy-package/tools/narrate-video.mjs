/**
 * Narrated-video generator — adds voice-over to the silent etsy-video-v1.mp4.
 *
 * Reads tools/captions/video-captions-<lang>.srt, generates TTS for each
 * cue, pads each clip with silence so its start time matches the SRT
 * cue timestamp, concatenates into a full 60-second voice track, and
 * mixes that track into the silent video.
 *
 * Why narrate? The silent version is correct for Etsy mobile autoplay
 * (muted by default), but YouTube, Pinterest video pins, and embedded
 * playback all play with sound. Narration nearly doubles engagement time
 * on those channels.
 *
 * Languages:
 *   - en: Zira / David / any en-* SAPI voice
 *   - fr: Hortense / any fr-* SAPI voice
 *   - ar: skipped unless a Microsoft Naayf or other ar-* voice is installed
 *
 * Requires: ffmpeg on PATH + OS-native TTS (Windows SAPI / macOS say /
 * Linux espeak-ng).
 *
 * Usage:
 *   node etsy-package/tools/narrate-video.mjs           # all available languages
 *   node etsy-package/tools/narrate-video.mjs en        # single language
 *
 * Output:
 *   output/narrated/etsy-video-v1-<lang>.mp4
 */

import { spawnSync } from 'child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG  = resolve(__dirname, '..');
const CAPTIONS_DIR = resolve(__dirname, 'captions');
// Silent base video lives at output/<lang>/etsy-video-v1.mp4 (produced by
// generate-video.mjs --lang <code>). Narrated output goes to
// output/<lang>/narrated/etsy-video-v1.mp4.
const silentVideoFor = (lang) => resolve(PKG, 'output', lang, 'etsy-video-v1.mp4');
const narratedOutFor = (lang) => resolve(PKG, 'output', lang, 'narrated', 'etsy-video-v1.mp4');
const tmpFor = (lang) => resolve(PKG, 'output', '_tmp', `narrate-${lang}`);

const ONLY_LANG = process.argv[2];

// ---------- platform detection ----------
const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';

function checkFfmpeg() {
  const r = spawnSync('ffmpeg', ['-version'], { stdio: 'pipe' });
  if (r.status !== 0) { console.error('❌ ffmpeg not on PATH.'); process.exit(1); }
}
checkFfmpeg();
if (!existsSync(resolve(PKG, 'output', 'en', 'etsy-video-v1.mp4'))) {
  console.error(`❌ base video missing at output/en/etsy-video-v1.mp4.\n   Run: node tools/generate-video.mjs`);
  process.exit(1);
}

function ff(args, label) {
  const r = spawnSync('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status !== 0) {
    console.error(`❌ ffmpeg failed (${label}):\n${r.stderr.toString().split('\n').slice(-12).join('\n')}`);
    process.exit(1);
  }
}

// ---------- SRT parser ----------
function parseSrt(path) {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8');
  const blocks = raw.split(/\r?\n\r?\n/).filter(b => b.trim());
  const cues = [];
  for (const b of blocks) {
    const lines = b.split(/\r?\n/);
    const tm = lines[1];
    if (!tm) continue;
    const m = tm.match(/(\d\d):(\d\d):(\d\d),(\d\d\d)\s*-->\s*(\d\d):(\d\d):(\d\d),(\d\d\d)/);
    if (!m) continue;
    const start = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000;
    const end   = (+m[5]) * 3600 + (+m[6]) * 60 + (+m[7]) + (+m[8]) / 1000;
    const text = lines.slice(2).join(' ').replace(/\s+/g, ' ').trim();
    cues.push({ start, end, text });
  }
  return cues;
}

// ---------- TTS per cue ----------
function ttsToWav(text, outWav, langPrefix) {
  if (isWin) {
    const ps = `
      Add-Type -AssemblyName System.Speech;
      $s = New-Object System.Speech.Synthesis.SpeechSynthesizer;
      $s.Rate = 1;
      try {
        $v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like '${langPrefix}-*' } | Select-Object -First 1;
        if ($v) { $s.SelectVoice($v.VoiceInfo.Name); }
        else { [Console]::Error.WriteLine('NO_VOICE'); exit 2; }
      } catch { [Console]::Error.WriteLine($_); exit 2; }
      $s.SetOutputToWaveFile('${outWav.replace(/\\/g, '\\\\')}');
      $s.Speak(${JSON.stringify(text)});
      $s.Dispose();
    `;
    const r = spawnSync('powershell.exe', ['-Command', ps], { stdio: ['ignore', 'pipe', 'pipe'] });
    if (r.status === 2) return { ok: false, reason: 'no_voice' };
    return { ok: r.status === 0 };
  }
  if (isMac) {
    const voice = langPrefix === 'en' ? 'Samantha' : langPrefix === 'fr' ? 'Thomas' : null;
    if (!voice) return { ok: false, reason: 'no_voice' };
    const aiff = outWav.replace(/\.wav$/, '.aiff');
    const r = spawnSync('say', ['-v', voice, '-o', aiff, text], { stdio: 'pipe' });
    if (r.status !== 0) return { ok: false };
    ff(['-y', '-i', aiff, outWav], 'aiff→wav');
    rmSync(aiff);
    return { ok: true };
  }
  // Linux: espeak-ng
  const voice = langPrefix === 'en' ? 'en' : langPrefix === 'fr' ? 'fr' : null;
  if (!voice) return { ok: false, reason: 'no_voice' };
  const r = spawnSync('espeak-ng', ['-v', voice, '-w', outWav, text], { stdio: 'pipe' });
  return { ok: r.status === 0 };
}

// Probe duration of a WAV in seconds
function durationOf(wav) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', wav], { stdio: ['ignore', 'pipe', 'pipe'] });
  return parseFloat(r.stdout.toString().trim()) || 0;
}

// ---------- build one narrated track ----------
async function buildTrack(lang, langPrefix) {
  const srtPath = join(CAPTIONS_DIR, `video-captions-${lang}.srt`);
  const cues = parseSrt(srtPath);
  if (!cues) { console.log(`  ⚠️  no SRT for ${lang}`); return null; }
  const TMP = tmpFor(lang);
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });

  console.log(`  · generating ${cues.length} TTS cues (${lang})`);
  const clipPaths = [];
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    const wav = join(TMP, `cue-${String(i).padStart(2, '0')}.wav`);
    const res = ttsToWav(c.text, wav, langPrefix);
    if (!res.ok) {
      if (res.reason === 'no_voice') {
        console.log(`  ⚠️  no ${langPrefix}-* voice installed — skipping ${lang}`);
        return null;
      }
      console.log(`  ⚠️  TTS failed for cue ${i}; inserting silence`);
      // Fabricate silence of cue length
      const dur = c.end - c.start;
      ff(['-y', '-f', 'lavfi', '-i', `anullsrc=r=22050:cl=mono:d=${dur}`, wav], `silence cue ${i}`);
    }
    clipPaths.push({ wav, start: c.start, end: c.end });
  }

  // Build a 60-second track with each cue placed at its SRT start time.
  // Strategy: for each cue, if TTS duration > cue slot, speed it up via
  // atempo; pad with silence after to fill out to next cue's start.
  const segments = [];
  for (let i = 0; i < clipPaths.length; i++) {
    const c = clipPaths[i];
    const slotEnd = (clipPaths[i + 1]?.start) ?? c.end + 0.5;
    const slotDur = slotEnd - c.start;
    const ttsDur = durationOf(c.wav);
    let processed = c.wav;
    if (ttsDur > slotDur * 0.98) {
      // Speed up (atempo can span 0.5–100; chain if >2×)
      const speed = ttsDur / (slotDur * 0.92);
      const filters = [];
      let remaining = speed;
      while (remaining > 2) { filters.push('atempo=2.0'); remaining /= 2; }
      filters.push(`atempo=${remaining.toFixed(3)}`);
      const faster = join(TMP, `cue-${String(i).padStart(2, '0')}-fast.wav`);
      ff(['-y', '-i', c.wav, '-filter:a', filters.join(','), faster], `tempo cue ${i}`);
      processed = faster;
    }
    const finalDur = durationOf(processed);
    const silenceAfter = Math.max(0, slotDur - finalDur);
    segments.push({ wav: processed, silenceAfter });
  }

  // Front-pad for first cue's start time
  const leadPad = clipPaths[0].start;
  const concatList = [];
  if (leadPad > 0) {
    const lead = join(TMP, 'lead.wav');
    ff(['-y', '-f', 'lavfi', '-i', `anullsrc=r=22050:cl=mono:d=${leadPad}`, lead], 'lead silence');
    concatList.push(lead);
  }
  for (let i = 0; i < segments.length; i++) {
    concatList.push(segments[i].wav);
    if (segments[i].silenceAfter > 0.05) {
      const pad = join(TMP, `pad-${i}.wav`);
      ff(['-y', '-f', 'lavfi', '-i', `anullsrc=r=22050:cl=mono:d=${segments[i].silenceAfter.toFixed(3)}`, pad], `pad ${i}`);
      concatList.push(pad);
    }
  }

  const concatTxt = join(TMP, 'concat.txt');
  writeFileSync(concatTxt, concatList.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
  const trackWav = join(TMP, `narration-${lang}.wav`);
  ff(['-y', '-f', 'concat', '-safe', '0', '-i', concatTxt, '-ar', '44100', '-ac', '2', trackWav], 'concat narration');

  // ---------- mux into the silent video ----------
  const outMp4 = narratedOutFor(lang);
  mkdirSync(dirname(outMp4), { recursive: true });
  ff([
    '-y', '-i', silentVideoFor(lang), '-i', trackWav,
    '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '128k',
    '-shortest',
    '-movflags', '+faststart',
    outMp4,
  ], 'mux video+narration');

  rmSync(TMP, { recursive: true, force: true });
  return outMp4;
}

// ---------- run ----------
const LANGS = [
  { code: 'en', prefix: 'en' },
  { code: 'fr', prefix: 'fr' },
  { code: 'ar', prefix: 'ar' },
];

console.log(`\n🎤 Narrating etsy-video-v1 (will prefer per-language silent base if present)\n`);
for (const l of LANGS) {
  if (ONLY_LANG && ONLY_LANG !== l.code) continue;
  console.log(`▸ ${l.code}`);
  const out = await buildTrack(l.code, l.prefix);
  if (out) console.log(`  ✅ ${out}`);
}
console.log('');
