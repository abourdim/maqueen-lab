// ============================================================
// telemetry-export.js — One-click session export.
//
// Two flavors:
//   📊 JSON  — full snapshot: meta, pose, trail, obstacles,
//              dashboard stats, settings, last-known sensor
//              readings. Self-describing, language-agnostic.
//   📈 CSV   — just the trail (t, x, y) for Excel/Python plotting.
//
// All data is read from the live in-page state (mqOdometry,
// localStorage, DOM readouts). No network calls. No firmware
// changes. Works whether or not the robot is connected.
// ============================================================
(function () {
  'use strict';

  function isoStamp() {
    // Filename-safe ISO-ish timestamp (no colons, no millis).
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  }

  function readDashboard() {
    // Pull whatever the dashboard cards happen to be showing right now.
    // Defensive: if an element is missing, omit the field rather than
    // crash the export.
    const get = (id) => {
      const el = document.getElementById(id);
      return el ? (el.textContent || '').trim() : null;
    };
    // Real dashboard IDs (verified by grep): the gauges put their
    // numeric readouts in mqGaugeVal* divs, and the LCD trip-computer
    // cells use mqDash{ODO,TRIP,PEAK,AVG,Time}.
    return {
      speed_cms:    get('mqGaugeValSpeed'),
      power_pct:    get('mqGaugeValPower'),
      heading_deg:  get('mqGaugeValHead'),
      sonar_cm:     get('mqGaugeValSonar'),
      odo:          get('mqDashODO'),
      trip:         get('mqDashTRIP'),
      peak_cms:     get('mqDashPEAK'),
      avg_cms:      get('mqDashAVG'),
      drive_time:   get('mqDashTime'),
    };
  }

  function readSensors() {
    // The live sensor strip's current text — line L/R, dist, IR, acc.
    // These are all populated by maqueen-panel.js as messages stream in.
    const get = (id) => {
      const el = document.getElementById(id);
      return el ? (el.textContent || '').trim() : null;
    };
    return {
      line_l:  get('mq-line-l') ? null : null,    // dot, no text
      dist:    get('mq-dist'),
      ir:      get('mq-ir'),
      acc:     get('mq-acc'),
      bench:   get('mq-bench'),
    };
  }

  function readSettings() {
    // Every persisted preference under our 'maqueen.' prefix, plus a
    // few non-prefixed ones we own (mb_theme, mb_active_tab).
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k.startsWith('maqueen.') || k === 'mb_theme' || k === 'mb_active_tab') {
          out[k] = localStorage.getItem(k);
        }
      }
    } catch {}
    return out;
  }

  function buildSnapshot() {
    const odo = window.mqOdometry || null;
    const pose      = odo && odo.getPose      ? odo.getPose()      : null;
    const trail     = odo && odo.getTrail     ? odo.getTrail()     : [];
    const obstacles = odo && odo.getObstacles ? odo.getObstacles() : [];
    const totalDist = odo && odo.getTotalDist ? odo.getTotalDist() : null;

    return {
      schema:     'maqueen-lab.telemetry',
      version:    1,
      exported_at: new Date().toISOString(),
      app: {
        version:  document.getElementById('appVersion')?.textContent || null,
        build:    document.getElementById('appBuildDate')?.textContent || null,
        commit:   document.getElementById('appCommit')?.textContent || null,
        url:      window.location.href,
      },
      pose: pose ? {
        x_cm:      +pose.x.toFixed(2),
        y_cm:      +pose.y.toFixed(2),
        theta_rad: +pose.theta.toFixed(4),
        theta_deg: +(pose.theta * 180 / Math.PI).toFixed(1),
      } : null,
      total_dist_cm: totalDist != null ? +totalDist.toFixed(2) : null,
      trail: trail.map(p => ({ x: +p.x.toFixed(2), y: +p.y.toFixed(2) })),
      obstacles: obstacles.map(o => ({
        x:  +o.x.toFixed(2),
        y:  +o.y.toFixed(2),
        cm: o.cm,
        t_ms: o.t,
      })),
      dashboard: readDashboard(),
      sensors:   readSensors(),
      settings:  readSettings(),
    };
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  }

  function exportJSON() {
    const snap = buildSnapshot();
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `maqueen-lab-${isoStamp()}.json`);
  }

  function exportCSV() {
    // Trail-only CSV. Header row + one row per trail point.
    // Index used as a synthetic sample number since trail points don't
    // carry per-point timestamps in the current odometry buffer.
    const odo = window.mqOdometry;
    const trail = (odo && odo.getTrail) ? odo.getTrail() : [];
    const lines = ['n,x_cm,y_cm'];
    for (let i = 0; i < trail.length; i++) {
      lines.push(`${i},${trail[i].x.toFixed(3)},${trail[i].y.toFixed(3)}`);
    }
    // Append obstacles as a second section so a single CSV captures
    // both motion and SLAM hits without forcing two downloads.
    const obs = (odo && odo.getObstacles) ? odo.getObstacles() : [];
    if (obs.length) {
      lines.push('');
      lines.push('# obstacles');
      lines.push('n,x_cm,y_cm,distance_cm,t_ms');
      for (let i = 0; i < obs.length; i++) {
        const o = obs[i];
        lines.push(`${i},${o.x.toFixed(3)},${o.y.toFixed(3)},${o.cm},${o.t}`);
      }
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    downloadBlob(blob, `maqueen-lab-trail-${isoStamp()}.csv`);
  }

  function init() {
    const jsonBtn = document.getElementById('exportTelemetryBtn');
    const csvBtn  = document.getElementById('exportTelemetryCsvBtn');
    if (jsonBtn) jsonBtn.addEventListener('click', exportJSON);
    if (csvBtn)  csvBtn.addEventListener('click',  exportCSV);
  }

  window.mqTelemetryExport = { exportJSON, exportCSV, buildSnapshot };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
