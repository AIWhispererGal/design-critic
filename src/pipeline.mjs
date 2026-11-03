// pipeline.mjs — capture → rules → (judge | packet) → report
import './env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { capture } from './capture.mjs';
import { evaluate } from './rules.mjs';
import { judge, buildPacket, mergeJudge } from './judge.mjs';
import { writeReport } from './report.mjs';
import { buildPrompt } from './prompt.mjs';
import { loadProfile, describeProfile } from './taste.mjs';

export const OUT_ROOT = process.env.DC_OUT || path.resolve(process.cwd(), 'out');

export function slug(target) {
  return target.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60).toLowerCase() || 'page';
}

export async function analyze(target, { outDir, runJudge = false, selector = null, log = console.error } = {}) {
  outDir = outDir || path.join(OUT_ROOT, `${slug(target)}${selector ? '-' + slug(selector).slice(0, 20) : ''}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}`);
  fs.mkdirSync(outDir, { recursive: true });
  const cap = await capture(target, { outDir, selector, log });
  let ev = evaluate(cap);
  let judgeStatus = { ran: false, reason: 'Judge pass not requested (use --judge).' };
  buildPacket(cap, ev, outDir);
  if (runJudge) {
    judgeStatus = await judge(cap, ev, outDir, { log });
    if (judgeStatus.result) ev = mergeJudge(ev, { ...judgeStatus.result, model: judgeStatus.model });
    else if (!judgeStatus.ran) judgeStatus.reason = judgeStatus.reason;
  }
  const profile = loadProfile(OUT_ROOT);
  if (profile) ev.profileSummary = describeProfile(profile);
  const reportPath = writeReport(outDir, cap, ev, { judgeStatus, profile });
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

/** What to re-render for a mockup: the live URL when we have one, else the saved snapshot. */
export function mockupSource(dir, cap) {
  return /^https?:\/\//i.test(cap?.url || '') ? cap.url : path.join(dir, 'snapshot.html');
}

export function mergedCss(ev, accepted) {
  return ev.findings.filter(f => accepted.includes(f.id) && f.cssPatch).map(f => `/* ${f.id} ${f.title} */\n${f.cssPatch}`).join('\n\n');
}

/** CI gate: evaluate thresholds against an evaluation. Returns { pass, failures[] }. */
export function checkThresholds(ev, { minOverall = null, min = {}, maxSeverity = {} } = {}) {
  const failures = [];
  if (minOverall != null && ev.overall < minOverall) failures.push(`overall ${ev.overall} < ${minOverall}`);
  for (const [k, v] of Object.entries(min)) { const sc = ev.scores[k]; if (!sc) failures.push(`unknown parameter ${k}`); else if (sc.score != null && sc.score < v) failures.push(`${k} ${sc.score} < ${v}`); }
  for (const [sev, max] of Object.entries(maxSeverity)) { const n = ev.findings.filter(f => f.severity === sev).length; if (n > max) failures.push(`${n} ${sev} findings > ${max}: ${ev.findings.filter(f => f.severity === sev).map(f => f.title).slice(0, 5).join('; ')}`); }
  return { pass: failures.length === 0, failures };
}

export { buildPrompt, mergeJudge, writeReport };
