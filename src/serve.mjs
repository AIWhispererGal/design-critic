// serve.mjs — tiny local server: hosts reports, saves decisions, renders mockups, runs analyses on demand.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { OUT_ROOT, analyze, loadReport, mergedCss, mockupSource, buildPrompt, mergeJudge, writeReport } from './pipeline.mjs';
import { renderWithCss, renderHtml } from './capture.mjs';
import { redesign } from './judge.mjs';
import { ENV_FILE } from './env.mjs';
import { diffImages } from './diff.mjs';
import { refreshProfile, loadProfile, describeProfile, explainProfile, setHypothesis } from './taste.mjs';
import { homePage } from './home.mjs';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.md': 'text/markdown; charset=utf-8', '.css': 'text/css', '.txt': 'text/plain' };

function json(res, code, obj) { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); }
function body(req) { return new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); }); }
function listReports() {
  if (!fs.existsSync(OUT_ROOT)) return [];
  return fs.readdirSync(OUT_ROOT).filter(d => fs.existsSync(path.join(OUT_ROOT, d, 'report.html'))).map(d => {
    let ev; try { ev = JSON.parse(fs.readFileSync(path.join(OUT_ROOT, d, 'evaluation.json'), 'utf8')); } catch { return null; }
    let dec = null; try { dec = JSON.parse(fs.readFileSync(path.join(OUT_ROOT, d, 'decisions.json'), 'utf8')); } catch {}
    return { id: d, url: ev.summary?.url, title: ev.summary?.title, selector: ev.summary?.selector || null, overall: ev.overall, findings: ev.findings?.length || 0, decided: dec ? (dec.accepted?.length || 0) + (dec.vetoed?.length || 0) : 0, judged: !!ev.judge, mtime: fs.statSync(path.join(OUT_ROOT, d, 'report.html')).mtimeMs };
  }).filter(Boolean).sort((a, b) => b.mtime - a.mtime);
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
        const { url, judge, selector } = await body(req);
        if (!url) return json(res, 400, { error: 'url required' });
        const r = await analyze(url, { runJudge: !!judge && !!process.env.ANTHROPIC_API_KEY, selector: selector || null });
        if (!r.capture.viewports.some(v => v.metrics)) return json(res, 400, { error: r.capture.viewports[0]?.error || 'capture failed' });
        return json(res, 200, { report: path.basename(r.outDir), href: `/out/${path.basename(r.outDir)}/report.html`, overall: r.evaluation.overall });
      }
      if (u.pathname === '/api/decisions' && req.method === 'POST') {
        const b = await body(req); const dir = safeDir(b.report);
        fs.writeFileSync(path.join(dir, 'decisions.json'), JSON.stringify({ accepted: b.accepted || [], vetoed: b.vetoed || [], notes: b.notes || {}, savedAt: new Date().toISOString() }, null, 1));
        const profile = refreshProfile(OUT_ROOT);
        return json(res, 200, { ok: true, profile: { observations: profile.observations, reports: profile.reports, usual: profile.usual, summary: describeProfile(profile) } });
      }
      if (u.pathname === '/api/report' && req.method === 'DELETE') {
        const dir = safeDir(u.searchParams.get('id'));
        fs.rmSync(dir, { recursive: true, force: true });
        refreshProfile(OUT_ROOT);
        return json(res, 200, { ok: true });
      }
      if (u.pathname === '/api/taste/explain' && req.method === 'POST') {
        const profile = await explainProfile(OUT_ROOT, { log: console.error });
        return json(res, 200, { ok: true, hypotheses: profile.hypotheses });
      }
      if (u.pathname === '/api/taste/hypothesis' && req.method === 'POST') {
        const b = await body(req);
        return json(res, 200, { ok: true, hypothesis: setHypothesis(OUT_ROOT, b.id, b.status === 'confirmed' ? 'confirmed' : 'rejected') });
      }
      if (u.pathname === '/api/taste') {
        const profile = loadProfile(OUT_ROOT) || refreshProfile(OUT_ROOT);
        return json(res, 200, { profile, summary: describeProfile(profile) });
      }
      if (u.pathname === '/api/prompt' && req.method === 'POST') {
        const b = await body(req); const dir = safeDir(b.report); const { ev } = loadReport(dir);
        return json(res, 200, { prompt: buildPrompt(ev, { accepted: b.accepted || [], vetoed: b.vetoed || [], notes: b.notes || {}, url: ev.summary?.url }) });
      }
      if (u.pathname === '/api/mockup' && req.method === 'POST') {
        const b = await body(req); const dir = safeDir(b.report); const { cap, ev } = loadReport(dir);
        const css = `:root{--dc-accent:#1f4e5f}\n` + mergedCss(ev, b.accepted || []);
        fs.writeFileSync(path.join(dir, 'mockup-accepted.css'), css);
        const src = mockupSource(dir, cap);
        const full = !!b.fullPage;
        const pairs = [];
        for (const vp of [{ name: 'laptop', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844, mobile: true }]) {
          // Re-render the unchanged page too, in the same session, so before/after differ only by the CSS
          const before = path.join(dir, 'shots', `mock-${vp.name}-before${full ? '-full' : ''}.jpg`);
          const after = path.join(dir, 'shots', `mock-${vp.name}${full ? '-full' : ''}.jpg`);
          const selector = cap.selector || null;
          await renderWithCss(src, '', { outPath: before, width: vp.width, height: vp.height, mobile: !!vp.mobile, fullPage: full, selector });
          await renderWithCss(src, css, { outPath: after, width: vp.width, height: vp.height, mobile: !!vp.mobile, fullPage: full, selector });
          const d = await diffImages(before, after);
          pairs.push({ label: vp.name + (full ? ' · full page' : ''), width: vp.width, height: vp.height, before: `/out/${path.basename(dir)}/shots/${path.basename(before)}`, after: `/out/${path.basename(dir)}/shots/${path.basename(after)}`, changedPct: d.changedPct });
        }
        const applied = ev.findings.filter(f => (b.accepted || []).includes(f.id) && f.cssPatch).map(f => ({ id: f.id, title: f.title }));
        const notApplied = ev.findings.filter(f => (b.accepted || []).includes(f.id) && !f.cssPatch).map(f => ({ id: f.id, title: f.title }));
        return json(res, 200, { pairs, applied, notApplied, source: /^https?:/.test(src) ? 'live page' : 'saved snapshot', message: `Re-rendered the ${/^https?:/.test(src) ? 'live page' : 'saved snapshot'} with ${applied.length} of ${(b.accepted || []).length} accepted changes applied as CSS.`, note: 'CSS-override mockups show direction, not finish: they remove tells and fix measurable faults but cannot add imagery, copy or an idea. Use the prompt for the real change.' });
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
      if (u.pathname === '/') {
        const profile = loadProfile(OUT_ROOT) || refreshProfile(OUT_ROOT);
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return res.end(homePage({ reports: listReports(), profile, profileSummary: describeProfile(profile), judgeEnabled: !!process.env.ANTHROPIC_API_KEY }));
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
