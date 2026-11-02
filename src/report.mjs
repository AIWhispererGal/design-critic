// report.mjs — writes report.html: scores, screenshots, findings with accept/veto, prompt generator, mockup buttons.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PARAMETERS } from './rules.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const promptSource = fs.readFileSync(path.join(here, 'prompt.mjs'), 'utf8').replace(/^export /gm, '');

export function writeReport(outDir, capture, evaluation, { judgeStatus } = {}) {
  const vps = capture.viewports.filter(v => v.metrics && v.shots);
  const data = { reportId: path.basename(outDir), url: capture.url, capturedAt: capture.capturedAt, parameters: PARAMETERS, evaluation, shots: vps.map(v => ({ name: v.name, width: v.width, height: v.height, first: v.shots.first, full: v.shots.full })), judgeStatus: judgeStatus || null };
  const html = template(data);
  fs.writeFileSync(path.join(outDir, 'report.html'), html);
  fs.writeFileSync(path.join(outDir, 'evaluation.json'), JSON.stringify(evaluation, null, 1));
  return path.join(outDir, 'report.html');
}

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function template(data) {
  const E = data.evaluation;
  const sevName = { P0: 'Blocking', P1: 'Major', P2: 'Minor', P3: 'Polish' };
  const scoreRows = data.parameters.map(p => {
    const s = E.scores[p.id];
    return `<li class="score"><span class="score-name">${esc(p.name)}${s.provisional ? ' <em title="Heuristic only; run the judge pass or paste review-packet.md into a reviewer for the subjective read">provisional</em>' : ''}${s.judge != null ? ` <em>juror ${s.judge}</em>` : ''}</span><span class="bar"><i style="width:${s.score * 10}%"></i></span><b>${s.score}</b></li>`;
  }).join('');
  const findings = E.findings.map(f => `
    <li class="finding" data-id="${f.id}" data-param="${f.param}" data-sev="${f.severity}">
      <div class="f-head">
        <span class="sev sev-${f.severity}">${f.severity} ${sevName[f.severity]}</span>
        <span class="param">${esc(data.parameters.find(p => p.id === f.param)?.name || f.param)}</span>
        ${f.fromJudge ? `<span class="tag">juror${f.taste ? ' · taste' : ''}</span>` : ''}
        ${f.viewports && f.viewports[0] !== 'laptop' ? `<span class="tag">${f.viewports.join(', ')}</span>` : ''}
        <span class="decide"><button class="accept" data-act="accept" title="Accept this suggestion">Accept</button><button class="veto" data-act="veto" title="Veto: do not do this">Veto</button><button class="undo" data-act="undo" title="Clear decision">Undo</button></span>
      </div>
      <h3>${esc(f.title)}</h3>
      <dl>
        <dt>Now</dt><dd class="pre">${esc(f.evidence)}</dd>
        <dt>Change</dt><dd>${esc(f.suggestion)}</dd>
        <dt>Why</dt><dd>${esc(f.why)}</dd>
        <dt>Source</dt><dd class="src">${esc(f.source)}</dd>
        ${f.cssPatch ? `<dt>Mockup CSS</dt><dd><details><summary>show</summary><pre>${esc(f.cssPatch)}</pre></details></dd>` : ''}
      </dl>
      <label class="note">Your note <input type="text" data-note="${f.id}" placeholder="optional: why you accepted or vetoed, or how you'd do it instead"></label>
    </li>`).join('');
  const shots = data.shots.map(s => `<figure><img src="${s.first}" alt="${s.name} first screen" loading="lazy"><figcaption>${s.name} · ${s.width}×${s.height} · <a href="${s.full}" target="_blank" rel="noopener">full page</a></figcaption></figure>`).join('');
  const judgeBlock = E.judge ? `<section id="judge"><h2>Juror's read</h2><p class="lede">${esc(E.judge.concept)}</p><p><b>Competitor test:</b> ${esc(E.judge.competitor_test)}</p>${E.judge.what_works?.length ? `<p><b>What works:</b></p><ul>${E.judge.what_works.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}<p><b>If rebuilt around one idea:</b> ${esc(E.judge.redesign_direction)}</p>${E.judge.frame_check ? `<p class="src">Frame: phone — ${esc(E.judge.frame_check.phone)} · laptop — ${esc(E.judge.frame_check.laptop)} · desktop — ${esc(E.judge.frame_check.desktop)}</p>` : ''}</section>` : `<section id="judge"><h2>Juror's read</h2><p class="muted">${esc(data.judgeStatus?.reason || 'No judge pass yet.')} Creativity and AI-look scores are heuristic until a reviewer looks at the screenshots. Either set ANTHROPIC_API_KEY and run <code>node cli.mjs judge ${esc(data.reportId)}</code>, or paste <a href="review-packet.md">review-packet.md</a> plus the screenshots into any coding AI and merge its JSON with <code>node cli.mjs merge-judge</code>.</p></section>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Design review · ${esc(E.summary?.title || data.url)}</title>
<style>
:root{--ink:#161616;--ink-2:#4a4a4a;--paper:#ffffff;--line:#e4e4e4;--accent:#1f4e5f;--accept:#1d6b3a;--veto:#9b2c2c;--p0:#9b2c2c;--p1:#b4531a;--p2:#6b6b6b;--p3:#9a9a9a}
*{box-sizing:border-box}
html{color-scheme:light}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
h1,h2,h3{font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;font-weight:600;letter-spacing:-.01em;line-height:1.1;margin:0}
h1{font-size:clamp(2rem,5vw,4rem)}
h2{font-size:1.75rem;margin:0 0 1rem}
h3{font-size:1.15rem;margin:.25rem 0 .5rem}
a{color:var(--accent)}
.wrap{max-width:1120px;margin:0 auto;padding:0 24px}
header.top{padding:56px 0 32px;border-bottom:1px solid var(--line)}
header.top .url{color:var(--ink-2);word-break:break-all}
.overall{display:flex;align-items:baseline;gap:16px;margin-top:24px}
.overall b{font-family:"Iowan Old Style",Palatino,Georgia,serif;font-size:clamp(3rem,8vw,6rem);line-height:1}
.overall span{color:var(--ink-2);max-width:40ch}
section{padding:40px 0;border-bottom:1px solid var(--line)}
.lede{font-size:1.25rem;max-width:60ch}
.muted{color:var(--ink-2);max-width:70ch}
ul.scores{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr;gap:8px;max-width:760px}
li.score{display:grid;grid-template-columns:minmax(180px,1fr) 2fr 3ch;align-items:center;gap:16px}
li.score em{font-style:normal;color:var(--ink-2);font-size:.8rem;margin-left:6px}
.bar{height:10px;background:var(--line);position:relative}
.bar i{position:absolute;left:0;top:0;bottom:0;background:var(--accent)}
li.score b{text-align:right;font-variant-numeric:tabular-nums}
.shots{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:24px}
figure{margin:0}figure img{width:100%;height:auto;border:1px solid var(--line);display:block}
figcaption{font-size:.85rem;color:var(--ink-2);margin-top:6px}
.toolbar{display:flex;flex-wrap:wrap;gap:12px;align-items:center;position:sticky;top:0;background:var(--paper);padding:12px 0;border-bottom:1px solid var(--line);z-index:5}
.toolbar .count{color:var(--ink-2);margin-left:auto;font-variant-numeric:tabular-nums}
button{font:inherit;cursor:pointer;border:1px solid var(--ink);background:var(--paper);color:var(--ink);padding:8px 14px;border-radius:0}
button:hover{background:#f2f2f2}
button.primary{background:var(--ink);color:#fff}
button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
select{font:inherit;padding:8px}
ol.findings{list-style:none;margin:0;padding:0}
li.finding{padding:24px 0;border-bottom:1px solid var(--line)}
li.finding[data-state="accept"]{border-left:4px solid var(--accept);padding-left:16px}
li.finding[data-state="veto"]{border-left:4px solid var(--veto);padding-left:16px;opacity:.6}
.f-head{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;font-size:.85rem}
.sev{font-weight:600}.sev-P0{color:var(--p0)}.sev-P1{color:var(--p1)}.sev-P2{color:var(--p2)}.sev-P3{color:var(--p3)}
.param,.tag{color:var(--ink-2)}
.decide{margin-left:auto;display:flex;gap:6px}
.decide button{padding:4px 10px;font-size:.85rem}
button.accept{border-color:var(--accept);color:var(--accept)}button.veto{border-color:var(--veto);color:var(--veto)}button.undo{border-color:var(--line);color:var(--ink-2)}
[data-state="accept"] button.accept,[data-state="veto"] button.veto{background:currentColor}
[data-state="accept"] button.accept{color:#fff;background:var(--accept)}[data-state="veto"] button.veto{color:#fff;background:var(--veto)}
dl{display:grid;grid-template-columns:7ch 1fr;gap:6px 16px;margin:0;max-width:85ch}
dt{color:var(--ink-2);font-size:.85rem;padding-top:2px}dd{margin:0}
.pre{white-space:pre-wrap}.src{font-size:.85rem;color:var(--ink-2)}
pre{background:#f6f6f6;padding:12px;overflow:auto;font-size:.8rem;max-width:85ch}
label.note{display:block;margin-top:12px;font-size:.85rem;color:var(--ink-2)}
label.note input{display:block;width:100%;max-width:85ch;font:inherit;padding:8px;border:1px solid var(--line);margin-top:4px}
textarea#prompt{width:100%;min-height:360px;font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;padding:12px;border:1px solid var(--line)}
.mock{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:24px;margin-top:16px}
.status{color:var(--ink-2);font-size:.9rem;min-height:1.4em}
.hidden{display:none}
@media (max-width:600px){li.score{grid-template-columns:1fr 3ch;}li.score .bar{grid-column:1/-1}dl{grid-template-columns:1fr}.decide{margin-left:0;width:100%}}
</style>
</head>
<body>
<div class="wrap">
<header class="top">
  <p class="url">${esc(data.url)} · captured ${esc(data.capturedAt.slice(0, 16).replace('T', ' '))}</p>
  <h1>${esc(E.summary?.title || 'Design review')}</h1>
  <div class="overall"><b>${E.overall}</b><span>of 10, weighted across ${data.parameters.length} parameters. Accessibility, AI-look, typography, hierarchy and responsive consistency weigh most.</span></div>
</header>

<section id="scores"><h2>Scores</h2><ul class="scores">${scoreRows}</ul></section>

<section id="shots"><h2>As captured</h2><div class="shots">${shots}</div></section>

${judgeBlock}

<section id="findings-section">
  <h2>Suggestions <span class="muted" style="font-size:1rem">(${E.findings.length})</span></h2>
  <p class="muted">Accept what you want built, veto what you don't. Vetoes are remembered and written into the hand-off prompt as "do not", so the coding AI won't sneak them back in. Decisions are saved in this browser and, when the local server is running, to <code>decisions.json</code> beside this report.</p>
  <div class="toolbar">
    <select id="filter-param"><option value="">All parameters</option>${data.parameters.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
    <select id="filter-sev"><option value="">All severities</option><option value="P0">P0 blocking</option><option value="P1">P1 major</option><option value="P2">P2 minor</option><option value="P3">P3 polish</option></select>
    <button id="accept-all-p01">Accept all P0+P1</button>
    <button id="accept-all">Accept all</button>
    <button id="clear-all">Clear decisions</button>
    <span class="count" id="count"></span>
  </div>
  <ol class="findings">${findings}</ol>
</section>

<section id="actions">
  <h2>Hand off</h2>
  <p class="muted">Two outputs. The prompt is for whatever coding AI owns the codebase. The mockups show roughly what the accepted changes look like on the real page (CSS overrides on a snapshot), or a full rebuild if a key is configured.</p>
  <div class="toolbar" style="position:static;border:0">
    <button class="primary" id="gen-prompt">Generate coding-AI prompt</button>
    <button id="copy-prompt">Copy</button>
    <button id="dl-prompt">Download .md</button>
    <button id="mock-css">Mock up accepted changes</button>
    <button id="mock-full">Mock up full redesign</button>
    <button id="export">Export decisions (taste profile)</button>
  </div>
  <p class="status" id="status"></p>
  <textarea id="prompt" placeholder="Your prompt appears here after you accept at least one suggestion and press Generate."></textarea>
  <div class="mock" id="mock"></div>
</section>
<footer style="padding:40px 0;color:var(--ink-2);font-size:.85rem">design-critic · deterministic measurements + optional juror pass. Scores are a diagnostic, not a verdict; designers themselves agree only weakly on taste.</footer>
</div>
<script id="data" type="application/json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
<script>
${promptSource}
const DATA = JSON.parse(document.getElementById('data').textContent);
const E = DATA.evaluation;
const KEY = 'dc:' + DATA.reportId;
let state = { accepted: [], vetoed: [], notes: {} };
try { state = Object.assign(state, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}
let serverOk = false;
fetch('/api/ping').then(r => r.ok ? r.json() : null).then(j => { serverOk = !!j; if (j && j.decisions && j.decisions[DATA.reportId]) { state = Object.assign(state, j.decisions[DATA.reportId]); paint(); } }).catch(() => {});

const items = Array.from(document.querySelectorAll('li.finding'));
function paint() {
  for (const li of items) {
    const id = li.dataset.id;
    li.dataset.state = state.accepted.includes(id) ? 'accept' : state.vetoed.includes(id) ? 'veto' : '';
    const n = li.querySelector('input[data-note]'); if (n && state.notes[id] != null) n.value = state.notes[id];
  }
  document.getElementById('count').textContent = state.accepted.length + ' accepted · ' + state.vetoed.length + ' vetoed · ' + (items.length - state.accepted.length - state.vetoed.length) + ' undecided';
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  if (serverOk) fetch('/api/decisions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ report: DATA.reportId, ...state }) }).catch(() => {});
  paint();
}
function decide(id, act) {
  state.accepted = state.accepted.filter(x => x !== id); state.vetoed = state.vetoed.filter(x => x !== id);
  if (act === 'accept') state.accepted.push(id); if (act === 'veto') state.vetoed.push(id);
  save();
}
document.querySelector('ol.findings').addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (!b) return; decide(b.closest('li').dataset.id, b.dataset.act); });
document.querySelector('ol.findings').addEventListener('change', e => { const i = e.target.closest('input[data-note]'); if (!i) return; state.notes[i.dataset.note] = i.value; save(); });
document.getElementById('accept-all-p01').onclick = () => { for (const li of items) if (['P0','P1'].includes(li.dataset.sev) && !state.vetoed.includes(li.dataset.id) && !state.accepted.includes(li.dataset.id)) state.accepted.push(li.dataset.id); save(); };
document.getElementById('accept-all').onclick = () => { for (const li of items) if (!state.vetoed.includes(li.dataset.id) && !state.accepted.includes(li.dataset.id)) state.accepted.push(li.dataset.id); save(); };
document.getElementById('clear-all').onclick = () => { state = { accepted: [], vetoed: [], notes: {} }; save(); };
function applyFilter() {
  const p = document.getElementById('filter-param').value, s = document.getElementById('filter-sev').value;
  for (const li of items) li.classList.toggle('hidden', (p && li.dataset.param !== p) || (s && li.dataset.sev !== s));
}
document.getElementById('filter-param').onchange = applyFilter; document.getElementById('filter-sev').onchange = applyFilter;

const status = m => document.getElementById('status').textContent = m;
document.getElementById('gen-prompt').onclick = () => {
  if (!state.accepted.length) { status('Accept at least one suggestion first.'); return; }
  document.getElementById('prompt').value = buildPrompt(E, { accepted: state.accepted, vetoed: state.vetoed, notes: state.notes, url: DATA.url });
  status('Prompt generated for ' + state.accepted.length + ' accepted change(s), ' + state.vetoed.length + ' veto(es).');
};
document.getElementById('copy-prompt').onclick = async () => { const t = document.getElementById('prompt').value; if (!t) return status('Nothing to copy yet.'); try { await navigator.clipboard.writeText(t); status('Copied.'); } catch { status('Clipboard blocked; select the text and copy manually.'); } };
document.getElementById('dl-prompt').onclick = () => { const t = document.getElementById('prompt').value; if (!t) return status('Generate the prompt first.'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'text/markdown' })); a.download = 'design-upgrade-brief.md'; a.click(); };
document.getElementById('export').onclick = () => {
  const profile = { report: DATA.reportId, url: DATA.url, exportedAt: new Date().toISOString(), accepted: state.accepted.map(id => E.findings.find(f => f.id === id)).filter(Boolean).map(f => ({ id: f.id, param: f.param, title: f.title, note: state.notes[f.id] || '' })), vetoed: state.vetoed.map(id => E.findings.find(f => f.id === id)).filter(Boolean).map(f => ({ id: f.id, param: f.param, title: f.title, note: state.notes[f.id] || '' })) };
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(profile, null, 1)], { type: 'application/json' })); a.download = 'decisions-' + DATA.reportId + '.json'; a.click();
};
async function mock(kind) {
  const box = document.getElementById('mock'); box.innerHTML = '';
  if (!serverOk) { status('Mockups need the local server: run  node cli.mjs serve  and open this report through it (http://localhost:4310/). The prompt generator works without it.'); return; }
  if (kind === 'css' && !state.accepted.length) { status('Accept at least one suggestion first.'); return; }
  status(kind === 'css' ? 'Rendering before/after with the accepted changes applied as CSS…' : 'Asking the model for a full redesign and rendering it… (30–90 s)');
  try {
    const r = await fetch(kind === 'css' ? '/api/mockup' : '/api/redesign', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ report: DATA.reportId, accepted: state.accepted, vetoed: state.vetoed, notes: state.notes }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || r.statusText);
    for (const s of j.shots) box.insertAdjacentHTML('beforeend', '<figure><img src="' + s.src + '?t=' + Date.now() + '" alt="' + s.label + '"><figcaption>' + s.label + '</figcaption></figure>');
    if (j.note) box.insertAdjacentHTML('beforeend', '<p class="muted" style="grid-column:1/-1">' + j.note + '</p>');
    status(j.message || 'Done.');
  } catch (e) { status('Mockup failed: ' + e.message); }
}
document.getElementById('mock-css').onclick = () => mock('css');
document.getElementById('mock-full').onclick = () => mock('full');
paint();
</script>
</body>
</html>`;
}
