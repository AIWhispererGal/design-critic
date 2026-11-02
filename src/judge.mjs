// judge.mjs — the subjective pass. Two modes:
//   1. With ANTHROPIC_API_KEY: send screenshots + measurements to Claude with a juror brief, get scores,
//      a concept read, and extra suggestions back as JSON.
//   2. Without a key: write review-packet.md, a self-contained brief you can paste into any coding AI
//      (Claude Code, Cursor, etc.) with the screenshots, to get the same pass by hand.
import fs from 'node:fs';
import path from 'node:path';
import { PARAMETERS } from './rules.mjs';

const MODEL = process.env.DC_MODEL || 'claude-opus-5-5';

export const JUROR_BRIEF = `You are a juror on a design review panel. You judge from screenshots and measurements, the way an Awwwards jury judges from a submission: design 40%, usability 30%, creativity 20%, content 10%. You are not the person who built this page and you owe it nothing.

Ground rules:
- Cite what you can see. Every claim names a specific element, position or measurement. No generic advice.
- Judge the idea first: is there a concept only this subject could own, or is it the category template? Apply the competitor test: could a rival paste this page unchanged? Say what the idea is in one sentence, or say there is none.
- Remember that professional designers agree with each other only weakly (Krippendorff alpha ~0.25 in DesignPref). So separate "this violates a principle" (contrast, hierarchy, reach) from "this is not to my taste". Mark taste calls as taste.
- You are scoring from still frames. Say so when motion or interaction would change your view.
- Do not restate findings the deterministic pass already made (listed below). Add what a machine could not measure: hierarchy, idea, placement logic, whether the imagery belongs to the subject, whether the composition holds at each width.
- Be specific about upgrades: say what to change, what it becomes, and why that is better for THIS subject and audience.`;

function paramRubric() {
  return PARAMETERS.map(p => `- ${p.id}: ${p.name} — ${p.blurb}`).join('\n');
}

export function buildPacket(capture, evaluation, outDir) {
  const vps = capture.viewports.filter(v => v.metrics);
  const lines = [];
  lines.push(`# Design review packet — ${evaluation.summary.title || capture.url}`);
  lines.push(`URL: ${capture.url}\nCaptured: ${capture.capturedAt}\n`);
  lines.push(`## How to use this file\nPaste this whole file into a coding AI together with the screenshots in \`shots/\` (at least phone-first.jpg, laptop-first.jpg, laptop-full.jpg). Ask it to act as the juror below and return the JSON described at the end. Then run:\n\n    node cli.mjs merge-judge <this report dir> <judge.json>\n`);
  lines.push(`## Juror brief\n${JUROR_BRIEF}\n`);
  lines.push(`## Parameters\n${paramRubric()}\n`);
  lines.push(`## Measurements (laptop 1440 unless noted)`);
  const M = (vps.find(v => v.name === 'laptop') || vps[0]).metrics;
  lines.push('```json\n' + JSON.stringify({ title: M.copy.title, headline: M.hero, nav: M.nav, fonts: M.fonts, bodyBg: M.bodyBg, accents: M.accents, distinctSectionGrounds: M.distinctSectionGrounds, screens: M.screens, images: { count: M.images.count, videos: M.images.videos, canvases: M.images.canvases }, tells: evaluation.tells, headings: M.copy.headlineTexts, buttons: M.copy.buttonTexts, sectionGaps: M.sectionGaps, emptyScreens: M.emptyScreens, phone: vps.find(v => v.name === 'phone') ? { horizontalScroll: vps.find(v => v.name === 'phone').metrics.horizontalScroll, heroLines: vps.find(v => v.name === 'phone').metrics.hero?.lines } : null }, null, 1) + '\n```\n');
  lines.push(`## Deterministic findings already made (do not repeat)`);
  for (const f of evaluation.findings) lines.push(`- [${f.severity}] ${f.param}: ${f.title}`);
  lines.push(`\n## Screenshots\n${vps.map(v => `- ${v.name} ${v.width}×${v.height}: shots/${v.name}-first.jpg (first screen), shots/${v.name}-full.jpg (full page)`).join('\n')}\n`);
  lines.push(`## Return exactly this JSON\n\`\`\`json\n${JSON.stringify(JUDGE_SCHEMA_EXAMPLE, null, 1)}\n\`\`\``);
  const text = lines.join('\n');
  fs.writeFileSync(path.join(outDir, 'review-packet.md'), text);
  return text;
}

export const JUDGE_SCHEMA_EXAMPLE = {
  concept: 'One sentence: the idea this page owns, or "none: <what template it is>"',
  competitor_test: 'pass | fail — one line why',
  scores: { creativity: 0, ai_look: 0, placement: 0, hierarchy: 0, color: 0, typography: 0, imagery: 0, responsive: 0, overall_impression: 0 },
  what_works: ['specific thing, where'],
  suggestions: [{ param: 'hierarchy', severity: 'P1', title: 'short', evidence: 'what you see and where', why: 'principle, and why it matters for this subject', suggestion: 'what to change and what it becomes', taste: false, mockup_css: 'optional CSS that approximates the change on the current markup, or empty' }],
  redesign_direction: 'Two or three sentences: if this page were rebuilt around one idea from the subject, what would it be?',
  frame_check: { phone: 'one line', laptop: 'one line', desktop: 'one line' },
};

function img(p) {
  const data = fs.readFileSync(p).toString('base64');
  return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } };
}

export async function judge(capture, evaluation, outDir, { log = () => {} } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) return { ran: false, reason: 'ANTHROPIC_API_KEY not set; wrote review-packet.md instead' };
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();
  const vps = capture.viewports.filter(v => v.metrics && v.shots);
  const pick = ['phone-first', 'laptop-first', 'laptop-full', 'phone-full', 'desktop-first'];
  const images = [];
  for (const name of pick) {
    const [vp, kind] = name.split('-');
    const v = vps.find(x => x.name === vp);
    if (!v) continue;
    const p = path.join(outDir, v.shots[kind]);
    if (fs.existsSync(p) && fs.statSync(p).size < 4.5e6) { images.push({ type: 'text', text: `Screenshot: ${vp} ${v.width}×${v.height}, ${kind === 'first' ? 'first screen' : 'full page'}` }); images.push(img(p)); }
  }
  const packet = buildPacket(capture, evaluation, outDir);
  const content = [{ type: 'text', text: packet.split('## Screenshots')[0] }, ...images, { type: 'text', text: `Return ONLY the JSON object described here, no prose before or after:\n${JSON.stringify(JUDGE_SCHEMA_EXAMPLE, null, 1)}` }];
  log(`judge: calling ${MODEL} with ${images.length / 2} screenshots`);
  const resp = await client.messages.create({ model: MODEL, max_tokens: 4000, system: JUROR_BRIEF, messages: [{ role: 'user', content }] });
  const text = resp.content.filter(c => c.type === 'text').map(c => c.text).join('');
  const jsonText = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  let parsed;
  try { parsed = JSON.parse(jsonText); } catch (e) { fs.writeFileSync(path.join(outDir, 'judge-raw.txt'), text); return { ran: true, error: 'judge returned non-JSON; saved judge-raw.txt' }; }
  fs.writeFileSync(path.join(outDir, 'judge.json'), JSON.stringify(parsed, null, 1));
  return { ran: true, model: MODEL, result: parsed };
}

/** Merge a judge result into an evaluation: blend subjective scores, append suggestions. */
export function mergeJudge(evaluation, j) {
  if (!j || !j.scores) return evaluation;
  const out = structuredClone(evaluation);
  const map = { creativity: 'creativity', ai_look: 'ai_look', placement: 'placement', hierarchy: 'hierarchy', color: 'color', typography: 'typography', imagery: 'imagery', responsive: 'responsive' };
  for (const [k, p] of Object.entries(map)) {
    const js = Number(j.scores[k]);
    if (!Number.isFinite(js) || !out.scores[p]) continue;
    const w = (p === 'creativity' || p === 'ai_look') ? 0.7 : 0.4; // judge dominates taste parameters, measurements dominate the rest
    out.scores[p].judge = js;
    out.scores[p].score = Math.round((out.scores[p].score * (1 - w) + js * w) * 10) / 10;
    out.scores[p].provisional = false;
  }
  let n = out.findings.length;
  for (const s of (j.suggestions || []).slice(0, 12)) {
    out.findings.push({ id: `J${String(++n).padStart(3, '0')}`, param: map[s.param] || s.param || 'creativity', severity: ['P0', 'P1', 'P2', 'P3'].includes(s.severity) ? s.severity : 'P2', title: s.title || 'Judge suggestion', evidence: s.evidence || '', why: s.why || '', source: `Design juror (${j.model || 'LLM'})${s.taste ? ' — taste call' : ''}`, suggestion: s.suggestion || '', cssPatch: s.mockup_css || undefined, viewports: ['laptop'], fromJudge: true, taste: !!s.taste });
  }
  out.judge = { concept: j.concept, competitor_test: j.competitor_test, what_works: j.what_works, redesign_direction: j.redesign_direction, frame_check: j.frame_check, overall_impression: j.scores.overall_impression };
  const weights = { accessibility: 1.5, ai_look: 1.3, typography: 1.2, hierarchy: 1.1, responsive: 1.1, creativity: 1.0, color: 1, placement: 1, space: 0.8, negative_space: 0.8, ux_principles: 1, copy: 0.8, motion: 0.6, consistency: 0.7, imagery: 0.9, craft: 0.5 };
  out.overall = Math.round(Object.entries(out.scores).reduce((a, [k, v]) => a + v.score * (weights[k] || 1), 0) / Object.values(weights).reduce((a, b) => a + b, 0) * 10) / 10;
  return out;
}

/** Full-redesign mockup: ask Claude for a standalone HTML page built from the snapshot's real content. */
export async function redesign(snapshotHtml, evaluation, acceptedFindings, direction, { log = () => {} } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();
  // Strip scripts/styles, keep the content skeleton so the model designs around real copy.
  const content = snapshotHtml.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/\s(class|style|id)="[^"]*"/gi, '').replace(/\s+/g, ' ').slice(0, 30000);
  const prompt = `${evaluation.promptText || ''}

## The page's real content (HTML, styling stripped)
${content}

## Direction
${direction || evaluation.judge?.redesign_direction || 'Find one idea in the subject itself and build the page around it.'}

Produce ONE complete standalone HTML file (inline CSS, no external scripts; Google Fonts <link> allowed) that redesigns this page using its real content. Honour every accepted change and every veto listed above. Return only the HTML.`;
  log(`redesign: calling ${MODEL}`);
  const resp = await client.messages.create({ model: MODEL, max_tokens: 16000, messages: [{ role: 'user', content: prompt }] });
  const text = resp.content.filter(c => c.type === 'text').map(c => c.text).join('');
  const m = text.match(/<!doctype html>[\s\S]*<\/html>/i) || text.match(/<html[\s\S]*<\/html>/i);
  return m ? m[0] : text;
}
