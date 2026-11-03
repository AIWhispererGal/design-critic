// report.mjs — writes report.html: scores, screenshots, findings with accept/veto, prompt generator, mockup buttons.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PARAMETERS } from './rules.mjs';
import { describeProfile } from './taste.mjs';
import { BASE_CSS } from './theme.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const promptSource = fs.readFileSync(path.join(here, 'prompt.mjs'), 'utf8').replace(/^export /gm, '');

export function writeReport(outDir, capture, evaluation, { judgeStatus, profile } = {}) {
  const vps = capture.viewports.filter(v => v.metrics && v.shots);
  if (profile && profile.usual) for (const f of evaluation.findings) { const u = profile.usual[f.rule]; const r = profile.rules?.[f.rule]; if (u) f.usual = { decision: u, n: r?.n, rate: r?.rate }; }
  const data = { profileSummary: profile ? describeProfile(profile) : '', reportId: path.basename(outDir), url: capture.url, capturedAt: capture.capturedAt, parameters: PARAMETERS, evaluation, shots: vps.map(v => ({ name: v.name, width: v.width, height: v.height, first: v.shots.first, full: v.shots.full })), judgeStatus: judgeStatus || null };
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
    if (s.score == null) return `<li class="score"><span class="score-name">${esc(p.name)} <em>${esc(s.unscored || 'not scored')}</em></span><span class="bar"></span><b>–</b></li>`;
    return `<li class="score"><span class="score-name">${esc(p.name)}${s.provisional ? ' <em title="Heuristic only; run the judge pass or paste review-packet.md into a reviewer for the subjective read">provisional</em>' : ''}${s.judge != null ? ` <em>juror ${s.judge}</em>` : ''}</span><span class="bar"><i style="width:${s.score * 10}%"></i></span><b>${s.score}</b></li>`;
  }).join('');
  const findings = E.findings.map(f => `
    <li class="finding" data-id="${f.id}" data-param="${f.param}" data-sev="${f.severity}">
      <div class="f-head">
        <span class="sev sev-${f.severity}">${f.severity} ${sevName[f.severity]}</span>
        <span class="param">${esc(data.parameters.find(p => p.id === f.param)?.name || f.param)}</span>
        ${f.fromJudge ? `<span class="tag">juror${f.taste ? ' · taste' : ''}</span>` : ''}
        ${f.viewports && f.viewports[0] !== 'laptop' ? `<span class="tag">${f.viewports.join(', ')}</span>` : ''}
        ${f.usual ? `<span class="tag usual-${f.usual.decision}" title="From your past decisions on this rule">you usually ${f.usual.decision === 'accepted' ? 'accept' : 'veto'} this (${Math.round(f.usual.rate * 100)}%, n=${f.usual.n})</span>` : ''}
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
${BASE_CSS}
</style>
</head>
<body>
<div class="wrap">
<header class="top">
  <p class="url"><a href="/" style="color:inherit">design-critic</a> · ${esc(data.url)}${E.summary?.selector ? ` · component <code>${esc(E.summary.selector)}</code>` : ''} · captured ${esc(data.capturedAt.slice(0, 16).replace('T', ' '))}</p>
  <h1>${esc(E.summary?.title || 'Design review')}</h1>
  <div class="overall"><b>${E.overall}</b><span>of 10, weighted across ${Object.values(E.scores).filter(s => s.score != null).length} parameters${E.summary?.scoped ? ' (page-level parameters are not scored for a component)' : ''}. Accessibility, AI-look, typography, hierarchy and responsive consistency weigh most.</span></div>
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
    <button id="apply-usual" title="Accept/veto every finding the way you usually decide this rule">Apply my usual decisions</button>
    <button id="accept-all-p01">Accept all P0+P1</button>
    <button id="accept-all">Accept all</button>
    <button id="clear-all">Clear decisions</button>
    <span class="count" id="count"></span>
  </div>
  <ol class="findings">${findings}</ol>
</section>

<section id="actions">
  <h2>Hand off</h2>
  <p class="muted">Three outputs. The prompt is for whatever coding AI owns the codebase. DESIGN.md is the same intent as a token file that lives in the repo and keeps later work on-system. <b>Mock up accepted changes</b> re-renders the live page with only your accepted items applied as CSS; nothing else changes. <b>Mock up full redesign</b> (needs a key) rebuilds the page from its content around one idea, honouring accepts and vetoes; it does not need everything accepted. Hover the buttons for details.</p>
  <div class="toolbar" style="position:static;border:0">
    <button class="primary" id="gen-prompt">Generate coding-AI prompt</button>
    <button id="copy-prompt">Copy</button>
    <button id="dl-prompt">Download .md</button>
    <button id="gen-design" title="Writes a DESIGN.md (Google Stitch format: YAML tokens + rationale) describing what the page should become: measured tokens moved by your accepted items, vetoes as Don'ts. Drop it in the project root; coding agents read it.">Generate DESIGN.md</button>
    <button id="mock-css" title="Re-renders the live page with ONLY the accepted suggestions applied as CSS overrides. Everything you did not accept stays exactly as it is. Vetoed and undecided items are untouched.">Mock up accepted changes</button>
    <label class="muted" style="font-size:.9rem" title="By default the mockup shows only the first screen (before scrolling). Tick this to render the whole page top to footer, so changes further down (card rows, section spacing, footer) are visible."><input type="checkbox" id="mock-fullpage"> whole page, not just the first screen</label>
    <button id="mock-full" title="Asks the model (needs ANTHROPIC_API_KEY) to rebuild the whole page from its real content around one idea, honouring every accepted item and never doing anything you vetoed. It does not require accepting everything; undecided items are left to the model's judgement.">Mock up full redesign</button>
    <button id="export">Export decisions (taste profile)</button>
  </div>
  <p class="status" id="status"></p>
  <textarea id="prompt" placeholder="Your prompt appears here after you accept at least one suggestion and press Generate."></textarea>
  <div class="mock" id="mock"></div>
</section>

<section id="taste">
  <h2>What your decisions say</h2>
  <p class="muted" id="taste-summary">${esc(data.profileSummary || 'No decisions recorded yet. Accept and veto a few suggestions, here and on other reports, and this fills in.')}</p>
  <p class="muted">Rule-level accept rates come from every <code>decisions.json</code> under <code>out/</code>. To get hypotheses about what the yes/nos capture, run <code>node cli.mjs taste --explain</code> (needs a key), then confirm or reject each one; only confirmed hypotheses are written into prompts and the juror brief.</p>
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
let noteTimer; document.querySelector('ol.findings').addEventListener('input', e => { const i = e.target.closest('input[data-note]'); if (!i) return; state.notes[i.dataset.note] = i.value; clearTimeout(noteTimer); noteTimer = setTimeout(save, 400); });
document.getElementById('apply-usual').onclick = () => {
  let n = 0;
  for (const f of E.findings) { if (!f.usual) continue; if (state.accepted.includes(f.id) || state.vetoed.includes(f.id)) continue; (f.usual.decision === 'accepted' ? state.accepted : state.vetoed).push(f.id); n++; }
  save(); status(n ? 'Applied your usual decision to ' + n + ' finding(s).' : 'No undecided findings have a usual decision yet.');
};
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
document.getElementById('gen-design').onclick = async () => {
  if (!serverOk) { status('DESIGN.md needs the local server (node cli.mjs serve), or run: node cli.mjs design-md ' + DATA.reportId); return; }
  status('Writing DESIGN.md…');
  try {
    const r = await fetch('/api/designmd', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ report: DATA.reportId, accepted: state.accepted, vetoed: state.vetoed, notes: state.notes }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || r.statusText);
    document.getElementById('prompt').value = j.text;
    status('DESIGN.md written to out/' + DATA.reportId + '/DESIGN.md (also shown below; Copy and Download work on it). Built from ' + state.accepted.length + ' accepted and ' + state.vetoed.length + ' vetoed item(s).');
    document.getElementById('dl-prompt').dataset.name = 'DESIGN.md';
  } catch (e) { status('Failed: ' + e.message); }
};
document.getElementById('gen-prompt').addEventListener('click', () => { document.getElementById('dl-prompt').dataset.name = ''; });
document.getElementById('copy-prompt').onclick = async () => { const t = document.getElementById('prompt').value; if (!t) return status('Nothing to copy yet.'); try { await navigator.clipboard.writeText(t); status('Copied.'); } catch { status('Clipboard blocked; select the text and copy manually.'); } };
document.getElementById('dl-prompt').onclick = () => { const t = document.getElementById('prompt').value; if (!t) return status('Generate the prompt first.'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'text/markdown' })); a.download = document.getElementById('dl-prompt').dataset.name || 'design-upgrade-brief.md'; a.click(); };
document.getElementById('export').onclick = () => {
  const profile = { report: DATA.reportId, url: DATA.url, exportedAt: new Date().toISOString(), accepted: state.accepted.map(id => E.findings.find(f => f.id === id)).filter(Boolean).map(f => ({ id: f.id, param: f.param, title: f.title, note: state.notes[f.id] || '' })), vetoed: state.vetoed.map(id => E.findings.find(f => f.id === id)).filter(Boolean).map(f => ({ id: f.id, param: f.param, title: f.title, note: state.notes[f.id] || '' })) };
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(profile, null, 1)], { type: 'application/json' })); a.download = 'decisions-' + DATA.reportId + '.json'; a.click();
};
async function mock(kind) {
  const box = document.getElementById('mock'); box.innerHTML = '';
  if (!serverOk) { status('Mockups need the local server: run  node cli.mjs serve  and open this report through it (http://localhost:4310/). The prompt generator works without it.'); return; }
  if (kind === 'css' && !state.accepted.length) { status('Accept at least one suggestion first.'); return; }
  status(kind === 'css' ? 'Re-rendering the live page twice (as is, and with the accepted changes as CSS) at two widths… about 20–40 s' : 'Asking the model for a full redesign and rendering it… (30–90 s)');
  try {
    const r = await fetch(kind === 'css' ? '/api/mockup' : '/api/redesign', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ report: DATA.reportId, accepted: state.accepted, vetoed: state.vetoed, notes: state.notes, fullPage: document.getElementById('mock-fullpage').checked }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || r.statusText);
    const pairs = j.pairs || (j.shots ? j.shots.reduce((a, s, i, arr) => (i % 2 === 0 ? a.concat([{ label: s.label.split(' ·')[0], before: s.src, after: arr[i + 1] && arr[i + 1].src }]) : a), []) : []);
    for (const p of pairs) {
      const id = 'cmp' + Math.random().toString(36).slice(2, 7);
      box.insertAdjacentHTML('beforeend', '<figure' + (p.width && p.width < 600 ? ' style="max-width:' + Math.round(p.width * 0.9) + 'px"' : '') + '><div class="cmp" id="' + id + '"><img class="after" src="' + p.after + '?t=' + Date.now() + '" alt="after"><img class="before" src="' + p.before + '?t=' + Date.now() + '" alt="before"><div class="handle"></div><span class="lbl l">before</span><span class="lbl r">after</span><input type="range" min="0" max="100" value="50" aria-label="Compare before and after"></div><figcaption>' + p.label + (p.changedPct != null ? ' · ' + p.changedPct + '% of pixels changed' : '') + ' · drag to compare</figcaption></figure>');
      const el = document.getElementById(id); const rng = el.querySelector('input'); const set = v => { el.style.setProperty('--cut', (100 - v) + '%'); el.querySelector('.handle').style.left = v + '%'; };
      rng.addEventListener('input', () => set(rng.value)); set(50);
      // keep the box the height of the "after" image so the clipped "before" overlays it exactly
      el.querySelector('.after').addEventListener('load', e => { el.style.height = e.target.getBoundingClientRect().height + 'px'; el.querySelector('.after').style.position = 'static'; });
    }
    if (j.applied) box.insertAdjacentHTML('beforeend', '<div class="mock-note muted"><b>Applied as CSS (' + j.applied.length + '):</b><ul>' + j.applied.map(a => '<li>' + a.title + '</li>').join('') + '</ul>' + (j.notApplied && j.notApplied.length ? '<b>Accepted but not mockable as CSS (' + j.notApplied.length + '), they need code or content:</b><ul>' + j.notApplied.map(a => '<li>' + a.title + '</li>').join('') + '</ul>' : '') + '</div>');
    if (j.note) box.insertAdjacentHTML('beforeend', '<p class="muted mock-note">' + j.note + '</p>');
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
