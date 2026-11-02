#!/usr/bin/env node
// design-critic CLI
//   node cli.mjs analyze <url|file> [--out dir] [--judge]
//   node cli.mjs serve [--port 4310]
//   node cli.mjs prompt <reportDir> [--accept F001,F002 | --all | --p01] [--veto F003]
//   node cli.mjs mockup <reportDir> [--accept ...] [--viewport laptop|phone]
//   node cli.mjs judge <reportDir>              (needs ANTHROPIC_API_KEY)
//   node cli.mjs merge-judge <reportDir> <judge.json>
import './src/env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { analyze, loadReport, mergedCss, buildPrompt, mergeJudge, writeReport, OUT_ROOT } from './src/pipeline.mjs';
import { renderWithCss } from './src/capture.mjs';

const [, , cmd, ...rest] = process.argv;
const flags = {}; const pos = [];
for (let i = 0; i < rest.length; i++) { if (rest[i].startsWith('--')) { const k = rest[i].slice(2); const v = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true; flags[k] = v; } else pos.push(rest[i]); }
const KNOWN = { analyze: ['out', 'judge'], serve: ['port'], prompt: ['accept', 'veto', 'all', 'p01'], mockup: ['accept', 'veto', 'all', 'p01', 'viewport', 'full'], judge: [], 'merge-judge': [] };
for (const k of Object.keys(flags)) if (KNOWN[cmd] && !KNOWN[cmd].includes(k)) console.error(`warning: --${k} is not used by "${cmd}"${k === 'judge' ? ' (put --judge on "analyze", or run: node cli.mjs judge <report>)' : ''}`);
const resolveDir = d => fs.existsSync(path.join(d, 'evaluation.json')) ? d : path.join(OUT_ROOT, d);

function pickIds(ev, decisions) {
  let accepted = decisions.accepted || [], vetoed = decisions.vetoed || [];
  if (flags.accept) accepted = String(flags.accept).split(',');
  if (flags.veto) vetoed = String(flags.veto).split(',');
  if (flags.all) accepted = ev.findings.map(f => f.id).filter(id => !vetoed.includes(id));
  if (flags.p01) accepted = ev.findings.filter(f => ['P0', 'P1'].includes(f.severity)).map(f => f.id).filter(id => !vetoed.includes(id));
  return { accepted, vetoed, notes: decisions.notes || {} };
}

(async () => {
  switch (cmd) {
    case 'analyze': {
      if (!pos[0]) throw new Error('usage: analyze <url|file>');
      const r = await analyze(pos[0], { outDir: flags.out, runJudge: !!flags.judge });
      console.log(`\nReport: ${r.reportPath}`);
      console.log(`Overall ${r.evaluation.overall}/10`);
      for (const [k, v] of Object.entries(r.evaluation.scores)) console.log(`  ${k.padEnd(16)} ${String(v.score).padStart(4)}  (${v.findings} finding${v.findings === 1 ? '' : 's'}${v.provisional ? ', provisional' : ''})`);
      console.log(`${r.evaluation.findings.length} suggestions. Judge: ${r.judgeStatus.ran ? 'ran (' + (r.judgeStatus.model || '') + ')' : r.judgeStatus.reason}`);
      console.log(`Open with: node cli.mjs serve  → http://localhost:4310/out/${path.basename(r.outDir)}/report.html`);
      break;
    }
    case 'serve': { const { serve } = await import('./src/serve.mjs'); serve({ port: +(flags.port || process.env.DC_PORT || 4310) }); break; }
    case 'prompt': {
      const dir = resolveDir(pos[0]); const { ev, decisions } = loadReport(dir);
      const d = pickIds(ev, decisions);
      if (!d.accepted.length) throw new Error('No accepted findings. Use --all, --p01, or --accept F001,F002, or decide in the report.');
      const out = buildPrompt(ev, { ...d, url: ev.summary?.url });
      fs.writeFileSync(path.join(dir, 'design-upgrade-brief.md'), out);
      console.log(out);
      console.error(`\nSaved to ${path.join(dir, 'design-upgrade-brief.md')}`);
      break;
    }
    case 'mockup': {
      const dir = resolveDir(pos[0]); const { ev, decisions } = loadReport(dir);
      const d = pickIds(ev, decisions);
      const css = `:root{--dc-accent:#1f4e5f}\n` + mergedCss(ev, d.accepted);
      fs.writeFileSync(path.join(dir, 'mockup-accepted.css'), css);
      const vp = flags.viewport === 'phone' ? { w: 390, h: 844, m: true } : { w: 1440, h: 900, m: false };
      const out = path.join(dir, 'shots', `mock-${flags.viewport || 'laptop'}${flags.full ? '-full' : ''}.jpg`);
      await renderWithCss(path.join(dir, 'snapshot.html'), css, { outPath: out, width: vp.w, height: vp.h, mobile: vp.m, fullPage: !!flags.full });
      console.log(`Mockup: ${out}\nCSS: ${path.join(dir, 'mockup-accepted.css')} (${ev.findings.filter(f => d.accepted.includes(f.id) && f.cssPatch).length} of ${d.accepted.length} accepted changes have a CSS approximation)`);
      break;
    }
    case 'judge': {
      const dir = resolveDir(pos[0]); const { cap, ev } = loadReport(dir);
      const { judge } = await import('./src/judge.mjs');
      const js = await judge(cap, ev, dir, { log: console.error });
      if (!js.result) { console.error(js.reason || js.error); process.exit(1); }
      const merged = mergeJudge(ev, { ...js.result, model: js.model });
      writeReport(dir, cap, merged, { judgeStatus: js });
      console.log(`Judge merged. Overall now ${merged.overall}/10. Concept: ${merged.judge.concept}`);
      break;
    }
    case 'merge-judge': {
      const dir = resolveDir(pos[0]); const { cap, ev } = loadReport(dir);
      const j = JSON.parse(fs.readFileSync(pos[1], 'utf8'));
      const merged = mergeJudge(ev, { ...j, model: j.model || 'external reviewer' });
      writeReport(dir, cap, merged, { judgeStatus: { ran: true, model: 'external' } });
      console.log(`Merged. Overall now ${merged.overall}/10.`);
      break;
    }
    default:
      console.log(fs.readFileSync(new URL(import.meta.url)).toString().split('\n').slice(1, 8).join('\n').replace(/^\/\/ ?/gm, ''));
  }
})().catch(e => { console.error('error:', e.message); process.exit(1); });
