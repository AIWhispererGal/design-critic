// prompt.mjs — build the hand-off prompt for a coding AI from accepted findings + vetoes.
// Shared by the CLI and (as plain text) by the HTML report, which re-implements the same shape in the browser.

export function buildPrompt(evaluation, { accepted = [], vetoed = [], notes = {}, url = '' } = {}) {
  const acc = evaluation.findings.filter(f => accepted.includes(f.id));
  const vet = evaluation.findings.filter(f => vetoed.includes(f.id));
  const byParam = {};
  for (const f of acc) (byParam[f.param] ||= []).push(f);
  const o = evaluation.observed || {};
  const L = [];
  L.push(`# Design upgrade brief`);
  L.push(`Target: ${url || evaluation.summary?.url || ''}`);
  L.push(`Overall design score before changes: ${evaluation.overall}/10.`);
  if (evaluation.judge?.concept) L.push(`Juror's read of the current concept: ${evaluation.judge.concept}`);
  L.push(`\n## Role\nYou are the design lead on this change. Make deliberate, opinionated choices specific to this subject. Keep the stack, the content and what already works. Do not migrate frameworks. Every change below was reviewed and accepted by the owner; implement all of them. Everything under "Vetoed" was explicitly rejected: do not do those things, even if they seem like improvements.`);
  L.push(`\n## What the page is now (measured)\n- Typeface: ${o.typeface} (${(o.families || []).join(', ')})\n- Body size ${o.bodySize}px, h1 ${o.heroSize}px\n- Ground ${o.ground}; accents ${(o.accents || []).join(', ') || 'none'}\n- Border radii in use: ${(o.radii || []).join(', ') || 'n/a'}\n- Section gaps: ${(o.sectionGaps || []).join(', ') || 'n/a'}px`);
  if (evaluation.tells?.length) L.push(`\nGenerated-page tells detected: ${evaluation.tells.join('; ')}.`);
  L.push(`\n## Accepted changes (${acc.length})`);
  const order = ['accessibility', 'responsive', 'ai_look', 'typography', 'color', 'hierarchy', 'placement', 'space', 'negative_space', 'ux_principles', 'copy', 'imagery', 'motion', 'consistency', 'craft', 'creativity'];
  for (const p of order) {
    if (!byParam[p]) continue;
    L.push(`\n### ${p.replace('_', ' ')}`);
    for (const f of byParam[p]) {
      L.push(`- **${f.title}** [${f.severity}]\n  - Now: ${f.evidence.replace(/\n/g, ' ')}\n  - Change: ${f.suggestion}\n  - Why: ${f.why}`);
      if (notes[f.id]) L.push(`  - Owner's note: ${notes[f.id]}`);
      if (f.cssPatch) L.push(`  - Mockup CSS that approximated it (translate into the real stylesheet, do not paste as-is):\n\`\`\`css\n${f.cssPatch.split('\n').slice(0, 12).join('\n')}\n\`\`\``);
    }
  }
  if (vet.length) {
    L.push(`\n## Vetoed (do NOT do these)`);
    for (const f of vet) L.push(`- ${f.title}${notes[f.id] ? ` — owner: ${notes[f.id]}` : ''}`);
  }
  if (evaluation.profileSummary) L.push(`\n## Owner's preferences (learned from past decisions)\n${evaluation.profileSummary}\nTreat "usually vetoes" items as vetoed here too unless listed under Accepted changes.`);
  L.push(`\n## Quality floor (always)\n- WCAG 2.2 AA contrast; visible :focus-visible; one h1; landmarks; lang attribute; zoom not disabled.\n- Responsive at 390, 768, 1440, 1920: no horizontal overflow; headlines ≤2 lines on desktop, ≤3 on phone; body ≥16px.\n- prefers-reduced-motion respected; no transition: all.\n- Line length 45–75 characters for running text.`);
  L.push(`\n## Process\n1. Before coding, write a 6-line design plan: palette (4–6 named hex values, one job each), typefaces and roles, layout concept in one sentence, the one place you will spend boldness.\n2. Check the plan against the vetoes and against the generic defaults (purple gradients, Inter-for-everything, icon-topped card rows, tracked-caps eyebrows, pill badges, 01/02/03 numbering, centred headline + two buttons + screenshot). If any part is a default rather than a choice for this subject, change it and say why.\n3. Implement. Then screenshot at 390 and 1440 and fix the top three problems you see.\n4. Report what changed, per accepted item, and anything you deliberately left alone.`);
  return L.join('\n');
}
