// home.mjs — the server's front page: analyse, browse reports, see what your decisions say.
import { BASE_CSS } from './theme.mjs';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const when = ms => { const d = new Date(ms); return d.toISOString().slice(0, 10) + ' ' + d.toTimeString().slice(0, 5); };

export function homePage({ reports, studios = [], profile, profileSummary, judgeEnabled }) {
  const studioRows = studios.map(st => `<li class="hyp"><b>${esc(st.brief.slice(0, 120))}</b><br><span class="small">${st.rounds.map((o, i) => `r${i} ${o}`).join(' → ')} · ${esc(st.stopped)} · <a href="${st.md}">crit log</a></span></li>`).join('');
  const rows = reports.map(r => `
    <li class="report-row">
      <a class="thumb" href="/out/${esc(r.id)}/report.html"><img src="/out/${esc(r.id)}/shots/laptop-first.jpg" alt="" loading="lazy"></a>
      <div class="meta">
        <a class="title" href="/out/${esc(r.id)}/report.html">${esc(r.title || r.url)}</a>
        <span class="url">${esc(r.url)}${r.selector ? ` <span class="tag">component: <code>${esc(r.selector)}</code></span>` : ''}</span>
        <span class="small">${esc(when(r.mtime))} · ${r.findings} suggestions · ${r.decided} decided${r.judged ? ' · juror ran' : ''}</span>
      </div>
      <div class="scorecell"><span class="bar"><i style="width:${(r.overall || 0) * 10}%"></i></span><b>${r.overall ?? '–'}</b></div>
      <button class="undo del" data-id="${esc(r.id)}" title="Delete this report and its decisions">Delete</button>
    </li>`).join('');
  const hyps = (profile?.hypotheses || []);
  const hypRows = hyps.map(h => `<li class="hyp" data-id="${h.id}"><span class="sev sev-${h.status === 'confirmed' ? 'P1' : h.status === 'rejected' ? 'P3' : 'P2'}">${esc(h.status)}</span> <b>${esc(h.statement)}</b> <span class="small">(${esc(h.confidence)})</span><br><span class="small">Evidence: ${esc(h.evidence)} · Wrong if: ${esc(h.would_be_wrong_if)}</span>${h.status === 'proposed' ? ` <span class="decide"><button class="accept" data-h="${h.id}" data-s="confirmed">Confirm</button><button class="veto" data-h="${h.id}" data-s="rejected">Reject</button></span>` : ''}</li>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>design-critic</title>
<style>
${BASE_CSS}
form.analyse{display:grid;grid-template-columns:1fr;gap:12px;max-width:760px}
form.analyse input[type=text],form.analyse input[type=url]{font:inherit;padding:10px 12px;border:1px solid var(--ink);width:100%}
form.analyse .row{display:flex;flex-wrap:wrap;gap:16px;align-items:center}
form.analyse .small{color:var(--ink-2);font-size:.85rem}
ol.reports{list-style:none;margin:0;padding:0}
li.report-row{display:grid;grid-template-columns:120px 1fr 220px auto;gap:20px;align-items:center;padding:16px 0;border-bottom:1px solid var(--line)}
li.report-row .thumb img{width:120px;height:75px;object-fit:cover;object-position:top;border:1px solid var(--line);display:block;background:#f6f6f6}
li.report-row .meta{display:flex;flex-direction:column;gap:2px;min-width:0}
li.report-row .title{font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;font-size:1.15rem;font-weight:600;color:var(--ink);text-decoration:none}
li.report-row .url{color:var(--ink-2);font-size:.9rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.small{color:var(--ink-2);font-size:.85rem}
.scorecell{display:grid;grid-template-columns:1fr 3ch;gap:12px;align-items:center}
.scorecell b{font-variant-numeric:tabular-nums;text-align:right}
ul.hyps{list-style:none;margin:0;padding:0}li.hyp{padding:12px 0;border-bottom:1px solid var(--line)}
.howto{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:32px 40px;max-width:1120px}
.howto h3{margin-bottom:.4rem}.howto p{margin:0 0 .5rem;color:var(--ink-2)}.howto code{font-size:.85em}
.progress{color:var(--ink-2)}
@media (max-width:700px){li.report-row{grid-template-columns:1fr;gap:8px}.scorecell{grid-template-columns:1fr 3ch}}
</style>
</head>
<body>
<div class="wrap">
<header class="top">
  <h1>design-critic</h1>
  <p class="lede">Measure a site or a component on sixteen design parameters. Accept or veto each suggestion. Hand off a prompt or a mockup. Over time, it learns what you mean by good.</p>
</header>

<section id="analyse">
  <h2>Analyse</h2>
  <form class="analyse" id="f">
    <label>URL or local path<input type="text" name="url" required placeholder="https://… or http://localhost:3000 or ./index.html" autocomplete="off" spellcheck="false"></label>
    <label>Only this component <span class="small">(optional CSS selector, e.g. <code>.pricing</code>, <code>#hero</code>, <code>main section:nth-of-type(2)</code>)</span><input type="text" name="selector" placeholder="leave empty for the whole page" autocomplete="off" spellcheck="false"></label>
    <div class="row">
      <label><input type="checkbox" name="judge" ${judgeEnabled ? '' : 'disabled'}> also run the juror pass${judgeEnabled ? '' : ' <span class="small">(set ANTHROPIC_API_KEY in .env to enable)</span>'}</label>
      <button class="primary" type="submit">Analyse</button>
      <span class="progress" id="progress"></span>
    </div>
  </form>
</section>

<section id="reports">
  <h2>Reports <span class="muted" style="font-size:1rem">(${reports.length})</span></h2>
  ${reports.length ? `<ol class="reports">${rows}</ol>` : '<p class="muted">None yet. Analyse something above, or from the terminal: <code>node cli.mjs analyze https://example.com</code></p>'}
</section>

${studios.length ? `<section id="studio"><h2>Studio</h2><p class="muted">Art-school loops: a student model builds from a brief, the critic reviews, the student revises with its own notes in hand. Each round's report is in the list above.</p><ul class="hyps">${studioRows}</ul></section>` : ''}

<section id="taste">
  <h2>What your decisions say</h2>
  <p class="muted" id="taste-summary">${esc(profileSummary || 'No decisions recorded yet. Open a report and accept or veto a few suggestions; this fills in as you go.')}</p>
  ${hyps.length ? `<h3>Hypotheses about what your yes/nos capture</h3><ul class="hyps">${hypRows}</ul>` : ''}
  <p class="toolbar" style="position:static;border:0"><button id="explain" ${judgeEnabled && profile?.observations >= 5 ? '' : 'disabled'} title="${judgeEnabled ? (profile?.observations >= 5 ? 'Ask the model for falsifiable hypotheses about your decisions' : 'Needs at least 5 decisions') : 'Needs ANTHROPIC_API_KEY'}">Propose hypotheses</button><span class="small" id="taste-status">${profile?.observations ? `${profile.observations} decisions on ${profile.reports} report(s).` : ''} Only confirmed hypotheses are written into prompts and the juror brief.</span></p>
</section>

<section id="howto">
  <h2>How to use it</h2>
  <div class="howto">
    <div><h3>Before a coding AI touches the UI</h3><p>Build on a dev server, analyse <code>http://localhost:3000</code>, veto what you disagree with, press <b>Generate coding-AI prompt</b>, paste it back. Repeat two or three times. Each round starts closer to you.</p></div>
    <div><h3>As a gate in CI</h3><p>No key needed. <code>node cli.mjs check &lt;url&gt; --min-overall 7 --max P0=0 --min accessibility=8</code> exits 2 on failure; <code>--json</code> for machines, <code>--github</code> for annotations.</p></div>
    <div><h3>With a client or a team</h3><p>Run it on their current site as the first meeting. A measurement lands differently than an opinion. Their vetoes become their taste profile, which is what every agency rebuilds by hand over six weeks of revisions.</p></div>
    <div><h3>Studio: the art-school loop</h3><p>With a key: <code>node cli.mjs studio "a site for a 14-room guesthouse on the Ligurian coast" --rounds 3 --pause</code>. The student builds, the critic reviews, your usual decisions and the floor are applied, the student revises with its own intent and reflection in hand. <code>--pause</code> lets you step in as the teacher between rounds. A crit log records every round.</p></div>
    <div><h3>One component at a time</h3><p>Put a selector in the box above (or <code>--selector ".pricing"</code>). Page-level rules switch off, the screenshot is of the element, and the juror sees only that. That's how it fits daily work rather than audits.</p></div>
  </div>
  <p class="small" style="margin-top:24px">Full guide, credits and the reasoning behind the tool: <a href="https://github.com/AIWhispererGal/design-critic#readme">README</a> · <a href="https://github.com/AIWhispererGal/design-critic/blob/main/CREDITS.md">CREDITS</a> · <a href="https://github.com/AIWhispererGal/design-critic/blob/main/DECISIONS.md">DECISIONS</a></p>
</section>
<footer style="padding:40px 0;color:var(--ink-2);font-size:.85rem">design-critic · measurements first, judgement second, your veto last.</footer>
</div>
<script>
const f = document.getElementById('f'), prog = document.getElementById('progress');
f.addEventListener('submit', async e => {
  e.preventDefault();
  const b = f.querySelector('button[type=submit]'); b.disabled = true;
  const url = f.url.value.trim(), selector = f.selector.value.trim();
  prog.textContent = 'Capturing at four widths' + (f.judge.checked ? ', then the juror pass' : '') + '… usually 1–3 minutes.';
  try {
    const r = await fetch('/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url, selector: selector || null, judge: f.judge.checked }) });
    const j = await r.json();
    if (!r.ok || !j.href) throw new Error(j.error || 'failed');
    location.href = j.href;
  } catch (err) { prog.textContent = 'Failed: ' + err.message; b.disabled = false; }
});
document.querySelectorAll('button.del').forEach(btn => btn.onclick = async () => {
  if (!confirm('Delete this report and its decisions? The taste profile is rebuilt without them.')) return;
  const r = await fetch('/api/report?id=' + encodeURIComponent(btn.dataset.id), { method: 'DELETE' });
  if (r.ok) btn.closest('li').remove(); else alert('Delete failed');
});
document.querySelectorAll('button[data-h]').forEach(btn => btn.onclick = async () => {
  const r = await fetch('/api/taste/hypothesis', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: +btn.dataset.h, status: btn.dataset.s }) });
  if (r.ok) location.reload(); else alert('Failed');
});
const ex = document.getElementById('explain');
if (ex) ex.onclick = async () => { ex.disabled = true; document.getElementById('taste-status').textContent = 'Asking the model… 20–60 s'; const r = await fetch('/api/taste/explain', { method: 'POST' }); const j = await r.json(); if (r.ok) location.reload(); else { document.getElementById('taste-status').textContent = 'Failed: ' + (j.error || r.statusText); ex.disabled = false; } };
</script>
</body>
</html>`;
}
