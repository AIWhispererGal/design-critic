// serve.mjs — tiny local server: hosts reports, saves decisions, renders mockups, runs analyses on demand.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { OUT_ROOT, analyze, loadReport, mergedCss, buildPrompt, mergeJudge, writeReport } from './pipeline.mjs';
import { renderWithCss, renderHtml } from './capture.mjs';
import { redesign } from './judge.mjs';
import { ENV_FILE } from './env.mjs';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.md': 'text/markdown; charset=utf-8', '.css': 'text/css', '.txt': 'text/plain' };

function json(res, code, obj) { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); }
function body(req) { return new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); }); }
function listReports() {
  if (!fs.existsSync(OUT_ROOT)) return [];
  return fs.readdirSync(OUT_ROOT).filter(d => fs.existsSync(path.join(OUT_ROOT, d, 'report.html'))).map(d => { const ev = JSON.parse(fs.readFileSync(path.join(OUT_ROOT, d, 'evaluation.json'), 'utf8')); return { id: d, url: ev.summary?.url, title: ev.summary?.title, overall: ev.overall, mtime: fs.statSync(path.join(OUT_ROOT, d, 'report.html')).mtimeMs }; }).sort((a, b) => b.mtime - a.mtime);
}
function safeDir(id) { const d = path.join(OUT_ROOT, path.basename(String(id || ''))); if (!fs.existsSync(path.join(d, 'evaluation.json'))) throw new Error('unknown report ' + id); return d; }

export function serve({ port = 4310 } = {}) {
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    try {
      if (u.pathname === '/api/ping') {
        const decisions = {};
        for (const r of listReports()) { const p = path.join(OUT_ROOT, r.id, 'decisions.json'); if (fs.existsSync(p)) decisions[r.id] = JSON.parse(fs.readFileSync(p, 'utf8')); }
        return json(res, 200, { ok: true, judge: !!process.env.ANTHROPIC_API_KEY, decisions });
      }
      if (u.pathname === '/api/reports') return json(res, 200, listReports());
      if (u.pathname === '/api/analyze' && req.method === 'POST') {
        const { url, judge } = await body(req);
        if (!url) return json(res, 400, { error: 'url required' });
        const r = await analyze(url, { runJudge: !!judge && !!process.env.ANTHROPIC_API_KEY });
        return json(res, 200, { report: path.basename(r.outDir), href: `/out/${path.basename(r.outDir)}/report.html`, overall: r.evaluation.overall });
      }
      if (u.pathname === '/api/decisions' && req.method === 'POST') {
        const b = await body(req); const dir = safeDir(b.report);
        fs.writeFileSync(path.join(dir, 'decisions.json'), JSON.stringify({ accepted: b.accepted || [], vetoed: b.vetoed || [], notes: b.notes || {}, savedAt: new Date().toISOString() }, null, 1));
        return json(res, 200, { ok: true });
      }
      if (u.pathname === '/api/prompt' && req.method === 'POST') {
        const b = await body(req); const dir = safeDir(b.report); const { ev } = loadReport(dir);
        return json(res, 200, { prompt: buildPrompt(ev, { accepted: b.accepted || [], vetoed: b.vetoed || [], notes: b.notes || {}, url: ev.summary?.url }) });
      }
      if (u.pathname === '/api/mockup' && req.method === 'POST') {
        const b = await body(req); const dir = safeDir(b.report); const { ev } = loadReport(dir);
        const css = `:root{--dc-accent:#1f4e5f}\n` + mergedCss(ev, b.accepted || []);
        fs.writeFileSync(path.join(dir, 'mockup-accepted.css'), css);
        const snap = path.join(dir, 'snapshot.html');
        const shots = [];
        for (const vp of [{ name: 'laptop', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844, mobile: true }]) {
          const before = path.join(dir, 'shots', `${vp.name}-first.jpg`);
          const after = path.join(dir, 'shots', `mock-${vp.name}.jpg`);
          await renderWithCss(snap, css, { outPath: after, width: vp.width, height: vp.height, mobile: !!vp.mobile });
          shots.push({ src: `/out/${path.basename(dir)}/shots/${vp.name}-first.jpg`, label: `${vp.name} · before` }, { src: `/out/${path.basename(dir)}/shots/mock-${vp.name}.jpg`, label: `${vp.name} · after (accepted changes as CSS)` });
        }
        const patched = ev.findings.filter(f => (b.accepted || []).includes(f.id) && f.cssPatch).length;
        return json(res, 200, { shots, message: `Rendered ${patched} of ${(b.accepted || []).length} accepted changes (the rest have no CSS approximation; they need a code change or content).`, note: 'CSS-override mockups show direction, not finish: they remove tells and fix measurable faults but cannot add imagery or an idea. Use the prompt for the real change.' });
      }
      if (u.pathname === '/api/redesign' && req.method === 'POST') {
        const b = await body(req); const dir = safeDir(b.report); const { ev } = loadReport(dir);
        if (!process.env.ANTHROPIC_API_KEY) return json(res, 400, { error: 'Full redesign needs ANTHROPIC_API_KEY on the server. The CSS mockup and the prompt work without it.' });
        const promptText = buildPrompt(ev, { accepted: b.accepted || [], vetoed: b.vetoed || [], notes: b.notes || {}, url: ev.summary?.url });
        const html = await redesign(fs.readFileSync(path.join(dir, 'snapshot.html'), 'utf8'), { ...ev, promptText }, b.accepted, b.direction, { log: console.error });
        fs.writeFileSync(path.join(dir, 'redesign.html'), html);
        await renderHtml(html, { outPath: path.join(dir, 'shots', 'redesign-laptop.jpg'), width: 1440, height: 900 });
        await renderHtml(html, { outPath: path.join(dir, 'shots', 'redesign-phone.jpg'), width: 390, height: 844 });
        return json(res, 200, { shots: [{ src: `/out/${path.basename(dir)}/shots/redesign-laptop.jpg`, label: 'redesign · laptop' }, { src: `/out/${path.basename(dir)}/shots/redesign-phone.jpg`, label: 'redesign · phone' }], message: `Redesign saved to out/${path.basename(dir)}/redesign.html`, note: 'A full redesign is a sketch of a direction built from the page\'s real content. Treat it as a proposal to react to, not a deliverable.' });
      }
      if (u.pathname === '/api/judge' && req.method === 'POST') {
        const b = await body(req); const dir = safeDir(b.report); const { cap, ev } = loadReport(dir);
        const { judge } = await import('./judge.mjs');
        const js = await judge(cap, ev, dir, { log: console.error });
        if (!js.result) return json(res, 400, { error: js.reason || js.error });
        const merged = mergeJudge(ev, { ...js.result, model: js.model });
        writeReport(dir, cap, merged, { judgeStatus: js });
        return json(res, 200, { ok: true });
      }
      // static
      if (u.pathname === '/' ) {
        const rows = listReports().map(r => `<li><a href="/out/${r.id}/report.html">${r.title || r.url}</a> <span style="color:#666">${r.url} · ${r.overall}/10</span></li>`).join('') || '<li>No reports yet.</li>';
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>design-critic</title><body style="font:16px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:800px;margin:48px auto;padding:0 24px;color:#161616;background:#fff"><h1 style="font-family:Iowan Old Style,Palatino,Georgia,serif;font-weight:600">design-critic</h1><form onsubmit="event.preventDefault();const b=this.querySelector('button');b.disabled=true;b.textContent='Analysing… (1–3 min)';fetch('/api/analyze',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:this.url.value,judge:this.judge.checked})}).then(r=>r.json()).then(j=>{if(j.href)location.href=j.href;else{alert(j.error||'failed');b.disabled=false;b.textContent='Analyse'}})"><label>URL or local path<br><input name="url" required style="width:100%;font:inherit;padding:8px;border:1px solid #ccc" placeholder="https://…"></label><p><label><input type="checkbox" name="judge" ${process.env.ANTHROPIC_API_KEY ? '' : 'disabled'}> also run the juror pass ${process.env.ANTHROPIC_API_KEY ? '' : '(set ANTHROPIC_API_KEY to enable)'}</label></p><button style="font:inherit;padding:8px 14px;background:#161616;color:#fff;border:0">Analyse</button></form><h2 style="font-family:Iowan Old Style,Palatino,Georgia,serif;font-weight:600;margin-top:40px">Reports</h2><ul>${rows}</ul></body></html>`);
      }
      if (u.pathname.startsWith('/out/')) {
        const rel = decodeURIComponent(u.pathname.slice(5));
        const fp = path.join(OUT_ROOT, rel);
        if (!fp.startsWith(OUT_ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream' });
        return fs.createReadStream(fp).pipe(res);
      }
      res.writeHead(404); res.end('not found');
    } catch (e) {
      console.error(e);
      json(res, 500, { error: String(e.message || e) });
    }
  });
  server.listen(port, () => console.error(`design-critic serving on http://localhost:${port}/  (reports in ${OUT_ROOT}; env file: ${ENV_FILE || 'none'}; judge: ${process.env.ANTHROPIC_API_KEY ? 'enabled' : 'off'})`));
  return server;
}
