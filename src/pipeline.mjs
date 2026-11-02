// pipeline.mjs — capture → rules → (judge | packet) → report
import './env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { capture } from './capture.mjs';
import { evaluate } from './rules.mjs';
import { judge, buildPacket, mergeJudge } from './judge.mjs';
import { writeReport } from './report.mjs';
import { buildPrompt } from './prompt.mjs';

export const OUT_ROOT = process.env.DC_OUT || path.resolve(process.cwd(), 'out');

export function slug(target) {
  return target.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60).toLowerCase() || 'page';
}

export async function analyze(target, { outDir, runJudge = false, log = console.error } = {}) {
  outDir = outDir || path.join(OUT_ROOT, `${slug(target)}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}`);
  fs.mkdirSync(outDir, { recursive: true });
  const cap = await capture(target, { outDir, log });
  let ev = evaluate(cap);
  let judgeStatus = { ran: false, reason: 'Judge pass not requested (use --judge).' };
  buildPacket(cap, ev, outDir);
  if (runJudge) {
    judgeStatus = await judge(cap, ev, outDir, { log });
    if (judgeStatus.result) ev = mergeJudge(ev, { ...judgeStatus.result, model: judgeStatus.model });
    else if (!judgeStatus.ran) judgeStatus.reason = judgeStatus.reason;
  }
  const reportPath = writeReport(outDir, cap, ev, { judgeStatus });
  return { outDir, reportPath, evaluation: ev, capture: cap, judgeStatus };
}

export function loadReport(outDir) {
  const cap = JSON.parse(fs.readFileSync(path.join(outDir, 'capture.json'), 'utf8'));
  const ev = JSON.parse(fs.readFileSync(path.join(outDir, 'evaluation.json'), 'utf8'));
  let decisions = { accepted: [], vetoed: [], notes: {} };
  const dp = path.join(outDir, 'decisions.json');
  if (fs.existsSync(dp)) decisions = Object.assign(decisions, JSON.parse(fs.readFileSync(dp, 'utf8')));
  return { cap, ev, decisions };
}

export function mergedCss(ev, accepted) {
  return ev.findings.filter(f => accepted.includes(f.id) && f.cssPatch).map(f => `/* ${f.id} ${f.title} */\n${f.cssPatch}`).join('\n\n');
}

export { buildPrompt, mergeJudge, writeReport };
