/**
 * The biometric dashboard SPA: one self-contained HTML document with inlined
 * CSS and vanilla JS. No external requests — fonts are system stacks, icons
 * are unicode, the network surface is exactly `/api/status` and `/api/stream`.
 *
 * CONSTRAINT: this string is an outer template literal, so the embedded client
 * script must never contain backticks or the sequence `${`. Client-side string
 * building uses concatenation only.
 */
export const dashboardHtml = (): string => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MANTEKA · BIOMETRIC DASHBOARD</title>
<style>
:root{--bg:#05080f;--panel:#0b1220;--line:#16324a;--text:#c9e7ff;--dim:#6b7a90;--green:#39ff88;--cyan:#22d3ee;--magenta:#ff2bd6;--amber:#ffb020;--red:#ff4d6a;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--mono);background-image:radial-gradient(ellipse at 20% -10%,rgba(34,211,238,.12),transparent 55%),radial-gradient(ellipse at 90% 10%,rgba(57,255,136,.08),transparent 45%)}
.scanlines{position:fixed;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(255,255,255,.03) 0 1px,transparent 1px 3px);mix-blend-mode:overlay;z-index:9}
header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid var(--line);box-shadow:0 0 24px rgba(34,211,238,.15)}
.brand{letter-spacing:.28em;font-weight:700;color:var(--green);text-shadow:0 0 12px rgba(57,255,136,.6);font-size:14px}
.chip{border:1px solid var(--line);border-radius:3px;padding:3px 8px;font-size:12px;color:var(--dim)}
.chip b{color:var(--green)}
.lamp{display:flex;align-items:center;gap:8px;font-size:12px;letter-spacing:.15em}
.dot{width:10px;height:10px;border-radius:50%;background:var(--dim)}
.lamp.live .dot{background:var(--green);box-shadow:0 0 10px var(--green);animation:pulse 1s infinite}
.lamp.reconnecting .dot{background:var(--amber);box-shadow:0 0 10px var(--amber);animation:pulse .4s infinite}
.lamp.offline .dot{background:var(--red);box-shadow:0 0 10px var(--red)}
@keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(.55);opacity:.5}}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;padding:18px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:14px 16px;box-shadow:0 0 18px rgba(0,0,0,.6),inset 0 0 24px rgba(34,211,238,.04)}
.panel h2{margin:0 0 10px;font-size:11px;letter-spacing:.24em;color:var(--cyan);text-transform:uppercase;border-bottom:1px dashed var(--line);padding-bottom:8px}
.panel.wide{grid-column:1/-1}
.stat{display:flex;justify-content:space-between;font-size:13px;padding:3px 0}
.stat b{color:var(--green);text-align:right;overflow-wrap:anywhere}
.verdict.active{color:var(--green)}.verdict.idle{color:var(--dim)}
.law{font-size:12px;color:var(--dim);padding:4px 0;border-top:1px solid rgba(22,50,74,.5)}
.law b{color:var(--text)}
.heat-row{display:flex;justify-content:space-between;gap:8px;font-size:12px;padding:4px 0 2px}
.heat-track{height:8px;border-radius:2px;background:#071018;margin-bottom:6px;overflow:hidden}
.heat-fill{height:100%;border-radius:2px;box-shadow:0 0 8px currentColor;transition:width .6s ease}
.weight-row{display:grid;grid-template-columns:180px 1fr 52px;gap:10px;align-items:center;font-size:12px;padding:5px 0}
.weight-track{height:14px;background:#071018;border:1px solid var(--line);border-radius:2px;overflow:hidden}
.weight-fill{height:100%;background:linear-gradient(90deg,var(--cyan),var(--green));box-shadow:0 0 10px rgba(57,255,136,.7);transition:width .6s ease}
.weight-value{text-align:right;color:var(--green)}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.entries{max-height:220px;overflow-y:auto;font-size:12px;line-height:1.6}
.log-line{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.log-line .t{color:var(--dim)}
.log-line.mutation{color:var(--magenta)}.log-line.guardian{color:var(--amber)}
.log-line.lineage{color:var(--green)}.log-line.system{color:var(--cyan)}
.empty{color:var(--dim);font-size:12px;font-style:italic;padding:6px 0}
@media(max-width:900px){.weight-row{grid-template-columns:1fr;gap:4px}}
</style>
</head>
<body>
<div class="scanlines"></div>
<header>
  <div class="brand">MANTEKA · BIOMETRIC DASHBOARD</div>
  <div class="chips"><span class="chip" id="root-chip">—</span><span class="chip" id="head-chip">HEAD —</span><span class="chip" id="beat-chip">daemon offline</span></div>
  <div class="lamp offline" id="lamp"><span class="dot"></span><span id="lamp-text">CONNECTING</span></div>
</header>
<main class="grid">
  <section class="panel" id="guardian-panel"><h2>◈ Semantic Guardian</h2><div id="guardian-body" class="empty">awaiting snapshot…</div></section>
  <section class="panel" id="heat-panel"><h2>◉ Thermal Field</h2><div id="heat-body" class="empty">awaiting snapshot…</div></section>
  <section class="panel" id="weights-panel"><h2>◆ Epigenetic Weights</h2><div id="weights-body" class="empty">awaiting snapshot…</div></section>
  <section class="panel" id="evolution-panel"><h2>⧫ Evolution Cycle</h2><div id="evolution-body" class="empty">awaiting snapshot…</div></section>
  <section class="panel wide" id="log-panel"><h2>⌨ Event Stream</h2><div class="entries" id="log-entries"></div></section>
</main>
<script>
(function () {
  'use strict';
  var failures = 0;
  var lastBeat = null;
  var source = null;
  var ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

  function esc(value) { return String(value).replace(/[&<>"]/g, function (c) { return ESCAPES[c]; }); }
  function el(id) { return document.getElementById(id); }
  function setLamp(state, text) { var lamp = el('lamp'); lamp.className = 'lamp ' + state; el('lamp-text').textContent = text; }
  function heatColor(t) { return t >= 80 ? '#ff4d6a' : t >= 60 ? '#ff2bd6' : t >= 40 ? '#ffb020' : t >= 20 ? '#39ff88' : '#22d3ee'; }
  function pct(weight, max) { return Math.max(4, Math.round((weight / (max || 1)) * 100)); }
  function delta(value) { return value === null ? '—' : (value > 0 ? '+' : '') + value.toFixed(1); }

  function beatAge() {
    if (lastBeat === null) { return 'no daemon beat yet'; }
    var seconds = Math.max(0, Math.round((Date.now() - lastBeat) / 1000));
    return 'beat ' + seconds + 's ago';
  }

  function renderGuardian(g) {
    if (!g.present) { el('guardian-body').innerHTML = '<div class="empty">○ inactive · no .manteka-laws.yaml</div>'; return; }
    var verdict = g.lawCount > 0 ? '● active' : '○ idle';
    var html = '<div class="stat verdict ' + (g.lawCount > 0 ? 'active' : 'idle') + '"><span>' + verdict + '</span><b>' + g.lawCount + ' law' + (g.lawCount === 1 ? '' : 's') + '</b></div>';
    g.laws.forEach(function (law) {
      html += '<div class="law"><b>' + esc(law.id) + '</b> — ' + esc(law.description) + '</div>';
    });
    el('guardian-body').innerHTML = html;
  }

  function renderHeat(t) {
    if (!t.present) { el('heat-body').innerHTML = '<div class="empty">no thermal report — run manteka heat</div>'; return; }
    var html = '<div class="chips"><span class="chip">max <b>' + t.maxTemperature.toFixed(1) + '°</b></span><span class="chip">mean <b>' + t.meanTemperature.toFixed(1) + '°</b></span><span class="chip">boiling <b>' + t.boilingFiles + '/' + t.fileCount + '</b></span></div>';
    t.hottestFiles.forEach(function (f) {
      var width = Math.max(4, Math.min(100, Math.round((f.temperature / 80) * 100)));
      var color = heatColor(f.temperature);
      html += '<div class="heat-row"><span>' + esc(f.file) + '</span><span style="color:' + color + '">' + f.temperature.toFixed(1) + '° · ' + esc(f.band) + '</span></div>';
      html += '<div class="heat-track"><div class="heat-fill" style="width:' + width + '%;background:' + color + ';color:' + color + '"></div></div>';
    });
    el('heat-body').innerHTML = html;
  }

  function renderWeights(l) {
    if (l.wins === 0) { el('weights-body').innerHTML = '<div class="empty">cold start · no recorded wins yet</div>'; return; }
    var entries = Object.keys(l.weights).map(function (op) { return [op, l.weights[op]]; });
    entries.sort(function (a, b) { return b[1] - a[1]; });
    var max = entries.length > 0 ? entries[0][1] : 1;
    var html = '<div class="stat"><span>recorded wins</span><b>' + l.wins + '</b></div>';
    entries.forEach(function (pair) {
      html += '<div class="weight-row"><span>' + esc(pair[0]) + '</span><div class="weight-track"><div class="weight-fill" style="width:' + pct(pair[1], max) + '%"></div></div><span class="weight-value">' + (pair[1] * 100).toFixed(1) + '%</span></div>';
    });
    el('weights-body').innerHTML = html;
  }

  function renderEvolution(s) {
    var e = s.evolution;
    if (!e.present) { el('evolution-body').innerHTML = '<div class="empty">no evolution report — run manteka evolve</div>'; return; }
    var html = '<div class="stat"><span>generated</span><b>' + esc(e.generatedAt || '—') + '</b></div>';
    html += '<div class="stat"><span>viable mutants</span><b>' + (e.summary ? e.summary.viable + '/' + e.summary.total : '—') + '</b></div>';
    html += '<div class="stat"><span>best mutant</span><b>' + esc((e.summary && e.summary.best) || '—') + '</b></div>';
    html += '<div class="stat"><span>operator · ΔT</span><b>' + esc(e.lastOperator || '—') + ' · ' + delta(e.lastDelta) + '</b></div>';
    html += '<div class="stat"><span>watcher</span><b id="beat-age">' + beatAge() + '</b></div>';
    el('evolution-body').innerHTML = html;
  }

  function render(s) {
    el('root-chip').textContent = s.root;
    el('head-chip').textContent = 'HEAD ' + (s.head || '—');
    el('beat-chip').textContent = s.watcher.lastBeatAt === null ? 'daemon offline' : 'daemon beat';
    renderGuardian(s.guardian);
    renderHeat(s.thermal);
    renderWeights(s.lineage);
    renderEvolution(s);
  }

  function logLine(kind, payload) {
    var box = el('log-entries');
    var line = document.createElement('div');
    line.className = 'log-line ' + kind;
    line.innerHTML = '<span class="t">[' + new Date().toLocaleTimeString() + ']</span> ' + esc(kind) + ' · ' + esc(payload);
    box.insertBefore(line, box.firstChild);
    while (box.childNodes.length > 50) { box.removeChild(box.lastChild); }
  }

  function connect() {
    source = new EventSource('/api/stream');
    source.onopen = function () { failures = 0; setLamp('live', 'LIVE'); logLine('system', 'stream connected'); };
    source.onerror = function () {
      failures += 1;
      if (failures >= 5) { setLamp('offline', 'OFFLINE'); } else { setLamp('reconnecting', 'RECONNECTING'); }
    };
    source.addEventListener('heartbeat', function () {
      lastBeat = Date.now();
      setLamp('live', 'LIVE');
      var age = document.getElementById('beat-age');
      if (age) { age.textContent = beatAge(); }
      el('beat-chip').textContent = beatAge();
    });
    source.addEventListener('snapshot', function (event) { render(JSON.parse(event.data)); });
    ['mutation', 'guardian', 'lineage'].forEach(function (kind) {
      source.addEventListener(kind, function (event) {
        var data = JSON.parse(event.data);
        logLine(kind, data.file ? data.file + ' changed' : JSON.stringify(data));
      });
    });
  }

  fetch('/api/status').then(function (r) { return r.json(); }).then(render).catch(function () { logLine('system', 'initial snapshot failed'); });
  connect();
  setInterval(function () {
    var age = document.getElementById('beat-age');
    if (age) { age.textContent = beatAge(); }
    if (lastBeat !== null) { el('beat-chip').textContent = beatAge(); }
  }, 1000);
})();
</script>
</body>
</html>
`;
