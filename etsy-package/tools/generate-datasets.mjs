/**
 * Generate a synthetic sensor-data corpus — 100 CSV files covering plausible
 * micro:bit sensor sessions (temperature, light, sound, tilt, compass, etc.).
 *
 * Purpose: makes the product hardware-OPTIONAL. Teachers without a micro:bit
 * can still teach data-analysis using the shipped datasets. Expands TAM
 * from "schools with hardware budget" to "any classroom with laptops."
 *
 * Each CSV matches the format produced by the app's Distance tab CSV export:
 *   timestamp_ms,sensor_name,value
 *
 * Datasets are grouped by scenario:
 *   - classroom-ambient     (stable temp, quiet, steady light)
 *   - afternoon-sun         (rising light, warming)
 *   - morning-cold           (low temp rising, low light)
 *   - dropped-board          (accel spike, steady before/after)
 *   - shake-tilt-sequence    (accel oscillating in all 3 axes)
 *   - sound-detective        (sudden claps, otherwise quiet)
 *   - compass-walk-north     (heading ~10° drifting)
 *   - button-presses         (A/B presses at intervals)
 *   - 5-second-bursts        (short recordings for quick-look examples)
 *
 * Usage:
 *   node etsy-package/tools/generate-datasets.mjs [count]
 *     (default = 100)
 *
 * Output:
 *   output/datasets/<scenario>-<idx>.csv  (100 files total)
 *   output/datasets/README.md             (manifest + teacher guide)
 */

import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '..', 'output', 'shared', 'datasets');
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const COUNT = parseInt(process.argv[2], 10) || 100;

// ---------- helpers ----------
function gauss(mean = 0, sd = 1) {
  // Box-Muller
  const u = 1 - Math.random();
  const v = Math.random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---------- scenario generators ----------
// Each returns an array of {t_ms, sensor, value} samples.

const SCENARIOS = {
  'classroom-ambient': ({ duration_s = 60, hz = 10 }) => {
    const out = [];
    const baseT = 21.5 + Math.random() * 1.5;    // 21-23°C
    const baseL = 140 + Math.random() * 30;      // bright room
    const baseS = 38 + Math.random() * 4;        // quiet-ish
    for (let i = 0; i < duration_s * hz; i++) {
      const t = i * (1000 / hz);
      out.push([t, 'temp', +(baseT + gauss(0, 0.08)).toFixed(2)]);
      out.push([t, 'light', +(baseL + gauss(0, 3)).toFixed(0)]);
      out.push([t, 'sound', +(baseS + Math.abs(gauss(0, 2))).toFixed(0)]);
    }
    return out;
  },

  'afternoon-sun': ({ duration_s = 120, hz = 10 }) => {
    const out = [];
    const startT = 22, endT = 27.5;
    const startL = 80, endL = 320;
    for (let i = 0; i < duration_s * hz; i++) {
      const t = i * (1000 / hz);
      const p = i / (duration_s * hz);
      out.push([t, 'temp', +(startT + (endT - startT) * p + gauss(0, 0.15)).toFixed(2)]);
      out.push([t, 'light', +clamp(startL + (endL - startL) * p + gauss(0, 8), 0, 1023).toFixed(0)]);
    }
    return out;
  },

  'morning-cold': ({ duration_s = 90, hz = 10 }) => {
    const out = [];
    for (let i = 0; i < duration_s * hz; i++) {
      const t = i * (1000 / hz);
      const p = i / (duration_s * hz);
      out.push([t, 'temp', +(14 + 4 * p + gauss(0, 0.1)).toFixed(2)]);
      out.push([t, 'light', +(30 + 120 * p + gauss(0, 4)).toFixed(0)]);
    }
    return out;
  },

  'dropped-board': ({ duration_s = 8, hz = 50 }) => {
    const out = [];
    const dropAt = duration_s * hz * 0.4;
    for (let i = 0; i < duration_s * hz; i++) {
      const t = i * (1000 / hz);
      let ax = gauss(0, 40), ay = gauss(0, 40), az = 1000 + gauss(0, 25);
      if (i > dropAt && i < dropAt + 15) {
        // Impact spike
        ax += gauss(0, 1500);
        ay += gauss(0, 1500);
        az = gauss(0, 2000);
      } else if (i >= dropAt + 15 && i < dropAt + 40) {
        // Oscillation / settling
        const decay = 1 - (i - dropAt - 15) / 25;
        ax += gauss(0, 400) * decay;
        ay += gauss(0, 400) * decay;
      }
      out.push([t, 'accel_x', Math.round(ax)]);
      out.push([t, 'accel_y', Math.round(ay)]);
      out.push([t, 'accel_z', Math.round(az)]);
    }
    return out;
  },

  'shake-tilt-sequence': ({ duration_s = 20, hz = 25 }) => {
    const out = [];
    for (let i = 0; i < duration_s * hz; i++) {
      const t = i * (1000 / hz);
      const tSec = i / hz;
      const ax = Math.sin(tSec * 2.3) * 600 + gauss(0, 80);
      const ay = Math.cos(tSec * 1.7) * 450 + gauss(0, 80);
      const az = 1000 + Math.sin(tSec * 0.8) * 150 + gauss(0, 60);
      out.push([t, 'accel_x', Math.round(ax)]);
      out.push([t, 'accel_y', Math.round(ay)]);
      out.push([t, 'accel_z', Math.round(az)]);
    }
    return out;
  },

  'sound-detective': ({ duration_s = 30, hz = 10 }) => {
    const out = [];
    const clapIdx = new Set(
      Array.from({ length: 4 }, () => Math.floor(Math.random() * duration_s * hz)));
    for (let i = 0; i < duration_s * hz; i++) {
      const t = i * (1000 / hz);
      let s = 38 + Math.abs(gauss(0, 2));
      if (clapIdx.has(i)) s = 180 + Math.abs(gauss(0, 20));   // clap spike
      out.push([t, 'sound', Math.round(s)]);
    }
    return out;
  },

  'compass-walk-north': ({ duration_s = 60, hz = 5 }) => {
    const out = [];
    let h = 8 + gauss(0, 3);
    for (let i = 0; i < duration_s * hz; i++) {
      const t = i * (1000 / hz);
      h += gauss(0, 1.2);
      if (h < 0) h += 360;
      if (h >= 360) h -= 360;
      out.push([t, 'compass', +h.toFixed(1)]);
    }
    return out;
  },

  'button-presses': ({ duration_s = 30, hz = 20 }) => {
    const out = [];
    const pressA = new Set(), pressB = new Set();
    for (let i = 0; i < 6; i++) pressA.add(Math.floor(Math.random() * duration_s * hz));
    for (let i = 0; i < 4; i++) pressB.add(Math.floor(Math.random() * duration_s * hz));
    for (let i = 0; i < duration_s * hz; i++) {
      const t = i * (1000 / hz);
      out.push([t, 'button_a', pressA.has(i) ? 1 : 0]);
      out.push([t, 'button_b', pressB.has(i) ? 1 : 0]);
    }
    return out;
  },

  '5-second-bursts': ({ duration_s = 5, hz = 20, sensor = 'temp' }) => {
    const out = [];
    const base = sensor === 'temp' ? 22 : sensor === 'light' ? 140 : 38;
    const sd   = sensor === 'temp' ? 0.3 : sensor === 'light' ? 8 : 3;
    for (let i = 0; i < duration_s * hz; i++) {
      const t = i * (1000 / hz);
      out.push([t, sensor, +(base + gauss(0, sd)).toFixed(2)]);
    }
    return out;
  },
};

function toCsv(samples) {
  const header = 'timestamp_ms,sensor,value\n';
  return header + samples.map(r => r.join(',')).join('\n') + '\n';
}

// ---------- distribute COUNT across scenarios ----------

const plan = [
  { scenario: 'classroom-ambient', n: 15 },
  { scenario: 'afternoon-sun', n: 8 },
  { scenario: 'morning-cold', n: 6 },
  { scenario: 'dropped-board', n: 10 },
  { scenario: 'shake-tilt-sequence', n: 12 },
  { scenario: 'sound-detective', n: 10 },
  { scenario: 'compass-walk-north', n: 9 },
  { scenario: 'button-presses', n: 10 },
  { scenario: '5-second-bursts', n: 20 },
];

let planned = plan.reduce((a, p) => a + p.n, 0);
if (planned !== COUNT) {
  const scale = COUNT / planned;
  plan.forEach(p => p.n = Math.max(1, Math.round(p.n * scale)));
  planned = plan.reduce((a, p) => a + p.n, 0);
}

const manifest = [];
for (const { scenario, n } of plan) {
  for (let i = 1; i <= n; i++) {
    const extras = {};
    if (scenario === '5-second-bursts') {
      extras.sensor = ['temp', 'light', 'sound', 'compass'][i % 4];
    }
    const samples = SCENARIOS[scenario]({ ...extras });
    const name = `${scenario}-${String(i).padStart(2, '0')}.csv`;
    writeFileSync(join(OUT, name), toCsv(samples));
    manifest.push({ name, scenario, samples: samples.length, duration_ms: samples[samples.length - 1]?.[0] ?? 0 });
  }
}

const readme = `# Synthetic sensor-data corpus (${manifest.length} CSVs)

Auto-generated plausible micro:bit sensor sessions. **No real hardware required** —
teach data-analysis directly from these files.

## Format

Every CSV is three columns:

\`\`\`
timestamp_ms,sensor,value
0,temp,21.87
100,temp,21.92
100,light,145
...
\`\`\`

Import into Excel, Google Sheets, Python/pandas, or back into the
\`Graph\` tab of ${'Maqueen Lab'} via its "Load CSV" button.

## Scenarios

| Scenario | Files | Typical use |
|---|---|---|
| \`classroom-ambient\` | ${plan.find(p => p.scenario === 'classroom-ambient').n} | Baseline noise analysis |
| \`afternoon-sun\` | ${plan.find(p => p.scenario === 'afternoon-sun').n} | Trend + correlation (temp ↔ light) |
| \`morning-cold\` | ${plan.find(p => p.scenario === 'morning-cold').n} | Same, reversed direction |
| \`dropped-board\` | ${plan.find(p => p.scenario === 'dropped-board').n} | Event detection / impact physics |
| \`shake-tilt-sequence\` | ${plan.find(p => p.scenario === 'shake-tilt-sequence').n} | FFT / periodicity |
| \`sound-detective\` | ${plan.find(p => p.scenario === 'sound-detective').n} | Threshold detection |
| \`compass-walk-north\` | ${plan.find(p => p.scenario === 'compass-walk-north').n} | Circular data, drift analysis |
| \`button-presses\` | ${plan.find(p => p.scenario === 'button-presses').n} | Event-count histograms |
| \`5-second-bursts\` | ${plan.find(p => p.scenario === '5-second-bursts').n} | Quick-look examples for lesson starters |

Total: ${manifest.reduce((a, m) => a + m.samples, 0).toLocaleString()} data points.

## Lesson starter ideas

1. **Plot & interpret** — load a \`classroom-ambient\` CSV, plot light vs time,
   discuss measurement noise.
2. **Find the event** — open a \`dropped-board\` CSV, have students identify
   the impact millisecond.
3. **Compare days** — side-by-side plot of \`afternoon-sun\` vs \`morning-cold\`.
4. **Frequency hunting** — import \`shake-tilt-sequence\` into a spreadsheet,
   compute the Fourier transform, find the shake frequency.

## Regenerate

\`\`\`
node etsy-package/tools/generate-datasets.mjs [count]
\`\`\`

Defaults to 100 files.
`;

writeFileSync(join(OUT, 'README.md'), readme);

console.log(`\n📊 Generated ${manifest.length} CSV files in ${OUT}`);
console.log(`   Total samples: ${manifest.reduce((a, m) => a + m.samples, 0).toLocaleString()}`);
console.log(`   Manifest: README.md\n`);
