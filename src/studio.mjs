// studio.mjs — the art-school loop. A student model builds a page from a brief, the critic reviews it
// (measurements + juror), the owner's taste profile and the quality floor decide what to fix, the
// student revises with its own prior intents in hand, and a crit log records every round.
//
// Design rules for this loop (see DECISIONS.md):
// - Automatic decisions are written to auto-decisions.json, never decisions.json, so the machine's
//   choices never feed the owner's taste profile. Only a human's clicks do.
// - The student writes an intent before building and a reflection after; both go in the crit log and
//   back into the next round's prompt. That is the student's half of the notebook.
// - The loop stops when the score stalls, not just when rounds run out.
import fs from 'node:fs';
import path from 'node:path';
import { analyze, OUT_ROOT, slug, buildPrompt } from './pipeline.mjs';
import { loadProfile, describeProfile } from './taste.mjs';
import { extractHtml } from './judge.mjs';
import { toUrl } from './capture.mjs';

const MODEL = process.env.DC_MODEL || 'claude-opus-5-5';

async function client() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('studio needs ANTHROPIC_API_KEY (the student and the juror are both model calls)');
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  return new Anthropic();
}

async function generate(c, prompt, { log, maxTokens = 32000 }) {
  let text = '';
  const stream = c.messages.stream({ model: MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] });
  for await (const ev of stream) if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') text += ev.delta.text;
  const final = await stream.finalMessage().catch(() => null);
  const intent = (text.match(/<!--\s*intent:\s*([\s\S]*?)-->/i) || [])[1]?.trim() || '';
  const reflection = (text.match(/<!--\s*reflection:\s*([\s\S]*?)-->/i) || [])[1]?.trim() || '';
  const html = extractHtml(text, { truncated: final?.stop_reason === 'max_tokens' });
  return { html, intent, reflection, truncated: final?.stop_reason === 'max_tokens' };
}

const STUDENT_RULES = `You are a design student in a studio critique. Build the page as a single standalone HTML file (inline CSS; Google Fonts <link> allowed; no external scripts; real copy for the subject, no lorem ipsum; pictures from open collections may be referenced by URL or drawn with CSS/SVG). Keep the CSS compact so the whole file fits.

Before the markup, write one HTML comment:
<!-- intent: the idea in one sentence (something only this subject could own), and the one place you are spending boldness. -->
After </html> write nothing. Do not use markdown fences.

Defaults that will be marked down because they appear regardless of subject: purple-to-blue gradients, gradient text, Inter/DM Sans/Space Grotesk for everything, icon-topped card rows, tracked-caps eyebrow labels, pill badges above headings, 01/02/03 numbering on non-sequences, a centred headline + two buttons + screenshot hero, "→" on every link, one 12–16px radius on everything, a grey shadow under every box, emoji as icons, buzzword copy ("seamless", "unlock", "build the future").
Floor that is always checked: WCAG AA contrast, visible :focus-visible, one h1, landmarks, lang attribute, zoom enabled, no horizontal overflow at 390px, headlines ≤2 lines on desktop and ≤3 on phone, body ≥16px, prefers-reduced-motion respected, no transition: all.`;

function autoDecide(ev, profile) {
  // Quality floor + the owner's usual decisions. Juror taste calls are left undecided (they are the owner's to make).
  const accepted = [], vetoed = [], undecided = [];
  for (const f of ev.findings) {
    const usual = profile?.usual?.[f.rule];
    if (usual === 'vetoed') vetoed.push(f.id);
    else if (f.fromJudge && f.taste) undecided.push(f.id);
    else accepted.push(f.id);
  }
  return { accepted, vetoed, undecided };
}

function scoreLine(ev) {
  const keys = ['accessibility', 'ai_look', 'typography', 'hierarchy', 'responsive', 'creativity', 'color', 'copy'];
  return keys.map(k => `${k} ${ev.scores[k]?.score ?? '–'}`).join(' · ');
}

export async function studio(brief, { rounds = 3, from = null, outRoot = OUT_ROOT, pause = false, resume = null, minGain = 0.2, log = console.error, _client = null } = {}) {
  const c = _client || await client(); // _client: injected stand-in for tests
  const profile = loadProfile(outRoot);
  const prefs = profile ? describeProfile(profile) : '';
  let base, state;
  if (resume) {
    base = resume.replace(/-r\d+$/, '').replace(/\.json$/, '');
    state = JSON.parse(fs.readFileSync(path.join(outRoot, path.basename(base) + '.json'), 'utf8'));
    brief = state.brief;
    log(`studio: resuming ${path.basename(base)} at round ${state.rounds.length}`);
  } else {
    base = path.join(outRoot, `studio-${slug(brief).slice(0, 32)}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}`);
    state = { brief, model: MODEL, startedAt: new Date().toISOString(), rounds: [] };
  }
  const stateFile = base + '.json', critFile = base + '.md';
  const save = () => { fs.writeFileSync(stateFile, JSON.stringify(state, null, 1)); fs.writeFileSync(critFile, critLog(state)); };

  for (let r = state.rounds.length; r < rounds; r++) {
    const dir = `${base}-r${r}`;
    fs.mkdirSync(dir, { recursive: true });
    const prev = state.rounds[r - 1];
    let html, intent = '', reflection = '', truncated = false;

    if (r === 0 && from) {
      // Round 0 from an existing page: capture as-is; the student starts from the critique of it.
      log(`studio r0: reviewing the given page ${from}`);
      html = null;
    } else if (r === 0) {
      log(`studio r0: ${MODEL} builds from the brief`);
      const prompt = `${STUDENT_RULES}\n\n## Brief\n${brief}\n${prefs ? `\n## The client's known preferences (from past reviews)\n${prefs}\n` : ''}\nReturn the intent comment, then the complete HTML.`;
      ({ html, intent, reflection, truncated } = await generate(c, prompt, { log }));
    } else {
      log(`studio r${r}: ${MODEL} revises after the critique`);
      const history = state.rounds.map((x, i) => `Round ${i}: overall ${x.overall}. Intent: ${x.intent || '(none)'}${x.reflection ? ` Reflection: ${x.reflection}` : ''} Juror: ${x.concept || ''}`).join('\n');
      const prompt = `${STUDENT_RULES}\n\n## Brief\n${brief}\n\n## Your previous rounds\n${history}\n\n## The critique of your last round (implement everything under Accepted; never do anything under Vetoed)\n${prev.briefText}\n\n## Your last page\n${prev.html.slice(0, 60000)}\n\nRevise the page. Keep what the critique did not touch. Before the markup write <!-- intent: ... --> (what you kept, what you changed, the one bold move). After the markup, inside the last comment before </html>, write <!-- reflection: what you would change next if given one more round, and what you are unsure about -->. Return the complete HTML.`;
      ({ html, intent, reflection, truncated } = await generate(c, prompt, { log }));
    }

    let target;
    if (html) { fs.writeFileSync(path.join(dir, 'index.html'), html); target = path.join(dir, 'index.html'); }
    else { target = from; }

    log(`studio r${r}: critic reviews`);
    const review = await analyze(target, { outDir: dir, runJudge: true, log: () => {} });
    const ev = review.evaluation;
    if (!html) html = fs.existsSync(path.join(dir, 'snapshot.html')) ? fs.readFileSync(path.join(dir, 'snapshot.html'), 'utf8') : '';

    const d = autoDecide(ev, profile);
    fs.writeFileSync(path.join(dir, 'auto-decisions.json'), JSON.stringify({ ...d, note: 'Decided by the quality floor and the owner\'s usual decisions; not the owner\'s clicks. Not used by the taste profile.' }, null, 1));
    const briefText = buildPrompt(ev, { accepted: d.accepted, vetoed: d.vetoed, url: ev.summary?.url });
    fs.writeFileSync(path.join(dir, 'design-upgrade-brief.md'), briefText);

    const round = { r, dir: path.basename(dir), report: path.join(path.basename(dir), 'report.html'), overall: ev.overall, scores: Object.fromEntries(Object.entries(ev.scores).map(([k, v]) => [k, v.score])), concept: ev.judge?.concept || '', competitor: ev.judge?.competitor_test || '', whatWorks: ev.judge?.what_works || [], direction: ev.judge?.redesign_direction || '', topFindings: ev.findings.slice(0, 6).map(f => `[${f.severity}] ${f.title}`), tells: ev.tells || [], intent, reflection, truncated, accepted: d.accepted.length, vetoed: d.vetoed.length, undecided: d.undecided.length, briefText, html, judged: !!ev.judge };
    state.rounds.push(round);
    save();
    log(`studio r${r}: overall ${ev.overall}  (${scoreLine(ev)})${prev ? `  Δ ${(ev.overall - prev.overall).toFixed(1)}` : ''}`);

    if (prev && ev.overall - prev.overall < minGain && r >= 2) { state.stoppedBecause = `score stalled (Δ ${(ev.overall - prev.overall).toFixed(1)} < ${minGain})`; save(); break; }
    if (pause && r < rounds - 1) { state.pausedAt = r; save(); log(`studio: paused after round ${r}. Review ${round.report} (accept/veto there if you want to override the auto-decisions), then: node cli.mjs studio --resume ${path.basename(base)}`); return { base, state, paused: true }; }
    // If the owner reviewed a paused round in the UI, their decisions override the automatic ones next round.
    const human = path.join(dir, 'decisions.json');
    if (fs.existsSync(human)) { try { const hd = JSON.parse(fs.readFileSync(human, 'utf8')); if (hd.accepted?.length || hd.vetoed?.length) { round.briefText = buildPrompt(ev, { accepted: hd.accepted, vetoed: hd.vetoed, notes: hd.notes, url: ev.summary?.url }); round.humanReviewed = true; save(); } } catch {} }
  }
  if (!state.stoppedBecause && !state.pausedAt) state.stoppedBecause = `${rounds} rounds complete`;
  delete state.pausedAt;
  save();
  return { base, state, paused: false };
}

export function critLog(state) {
  const L = [`# Studio crit log`, '', `**Brief:** ${state.brief}`, `**Student / juror model:** ${state.model} · started ${state.startedAt.slice(0, 16).replace('T', ' ')}`, ''];
  if (state.rounds.length) {
    L.push('| Round | Overall | Accessibility | AI-look | Typography | Hierarchy | Responsive | Creativity |', '|---|---|---|---|---|---|---|---|');
    for (const x of state.rounds) L.push(`| ${x.r} | **${x.overall}** | ${x.scores.accessibility ?? '–'} | ${x.scores.ai_look ?? '–'} | ${x.scores.typography ?? '–'} | ${x.scores.hierarchy ?? '–'} | ${x.scores.responsive ?? '–'} | ${x.scores.creativity ?? '–'} |`);
    L.push('');
  }
  for (const x of state.rounds) {
    L.push(`## Round ${x.r} — ${x.overall}/10${x.humanReviewed ? ' · reviewed by the owner' : ''}`, '');
    L.push(`Report: \`${x.report}\``, '');
    if (x.intent) L.push(`**Student's intent:** ${x.intent}`, '');
    if (x.concept) L.push(`**Juror's read:** ${x.concept} (competitor test: ${x.competitor})`, '');
    if (x.whatWorks?.length) L.push(`**What works:** ${x.whatWorks.join('; ')}`, '');
    if (x.tells?.length) L.push(`**Tells:** ${x.tells.join('; ')}`, '');
    L.push(`**Top findings:**`, ...x.topFindings.map(t => `- ${t}`), '');
    L.push(`**Decided for the next round:** ${x.accepted} accepted, ${x.vetoed} vetoed by the owner's usual decisions, ${x.undecided} taste call(s) left to the owner.`, '');
    if (x.reflection) L.push(`**Student's reflection:** ${x.reflection}`, '');
    if (x.truncated) L.push(`> The student hit its output limit this round; the page was closed off and reviewed as-is.`, '');
  }
  if (state.stoppedBecause) L.push(`---`, `Stopped: ${state.stoppedBecause}.`);
  if (state.pausedAt != null) L.push(`---`, `Paused after round ${state.pausedAt}. Resume with \`node cli.mjs studio --resume ${path.basename(state.base || '')}\`.`);
  return L.join('\n');
}
