# design-critic

Evaluate a website or web app's design the way a jury would, with measurements instead of vibes.
Then accept or veto each suggestion, and press a button to get either a prompt for your coding AI or a
mockup of what the accepted changes look like.

```
node cli.mjs analyze https://example.com      # capture + measure + score + report
node cli.mjs serve                            # http://localhost:4310 — open reports, veto, mock up
```

No API key needed for the measurements, the report, the prompt, or the CSS mockups. An `ANTHROPIC_API_KEY`
adds the juror pass (concept, creativity, AI-look as seen) and full-redesign mockups.

## What it measures

Sixteen parameters, each scored 0–10 with every deduction tied to a finding you can read:

| Parameter | How |
|---|---|
| Color theory | accent hue count, purple/indigo gradients, gradient text, tinted near-black, dark+acid-green cluster |
| Accessibility | axe-core (WCAG 2.2 AA) + own contrast walk, zoom lock, lang, names, labels, focus, 24/44px targets, landmarks, reduced motion |
| Placement | competing CTAs above the fold, long centred headline, nav count, sticky header height, headline position |
| Use of space | spacing values off a 4px grid, section gap vs in-section gap (Gestalt proximity), rhythm, unequal margins |
| Negative space | near-empty screens, wall-to-wall density, cramped padding in boxes |
| UI/UX principles | vague labels, equal twin buttons, nothing shows the product, desktop nav on phone |
| Typography & AI fonts | Inter/DM Sans/Space Grotesk-for-everything, default faces, ≥3 families, measure >85ch, tight leading, <13px text, timid hero size, scale steps |
| Looks like typical AI | 19 weighted tells; weights follow how strongly each separates weak from strong sites in a 247-site study |
| Creativity | heuristic template signals; refined by the juror pass |
| Responsive consistency | 390 / 768 / 1440 / 1920: overflow, headline lines, text size, narrow columns, no media queries, fixed display sizes |
| Visual hierarchy | headline÷body ratio, ≥3-line headlines, every h2 centred, content chopped into equal cards |
| Copy | buzzwords, lorem ipsum, category-generic headline |
| Motion | `transition: all`, scattered entrance animations, no feedback |
| System consistency | radius vocabulary, shadow recipes, font changes across breakpoints |
| Imagery | none / too little / vector-only / dominant hero media / inconsistent crops |
| Craft | image dimensions, lazy loading, JS errors, slow load |

Every finding has: **Now** (the measurement), **Change** (what to do), **Why** (the principle), **Source**
(where the principle comes from), and often **Mockup CSS** (an approximation the renderer can apply).

## The loop

1. `analyze` captures the page at four viewports (screenshots + an HTML snapshot), runs axe-core, and
   measures fonts, colours, contrast, spacing, radii, shadows, gradients, card grids, labels, hero, nav,
   images, tap targets, overflow, empty screens.
2. `rules.mjs` turns measurements into findings and scores. `review-packet.md` is written for the subjective
   pass.
3. Optional juror pass (`--judge`, or `node cli.mjs judge <report>`): screenshots + measurements go to Claude
   with a juror brief that forces evidence, applies the competitor test, and marks taste calls as taste. No
   key? Paste `review-packet.md` and the screenshots into any coding AI and merge its JSON with
   `node cli.mjs merge-judge <report> judge.json`.
4. Open the report through `serve`. **Accept** or **Veto** each suggestion, add notes. Decisions persist in
   the browser and in `decisions.json`.
5. **Generate coding-AI prompt**: a brief built only from accepted items, with the vetoes listed as
   "do not", the measured current state, a quality floor, and a plan-then-build process. Copy or download.
6. **Mock up accepted changes**: the snapshot is re-rendered at laptop and phone widths with the accepted
   findings' CSS applied; before/after side by side. **Mock up full redesign** (needs a key): a standalone
   HTML rebuild from the page's real content, honouring accepts and vetoes.
7. **Export decisions**: a taste-profile JSON. Designers agree with each other only weakly
   (DesignPref, alpha 0.25), so your vetoes are the signal that makes the next review yours.

## CLI

```
node cli.mjs analyze <url|file> [--out dir] [--judge]
node cli.mjs serve [--port 4310]
node cli.mjs prompt <report> [--all | --p01 | --accept F001,F002] [--veto F003]
node cli.mjs mockup <report> [--all | --p01 | --accept ...] [--viewport phone] [--full]
node cli.mjs judge <report>                   # needs ANTHROPIC_API_KEY (model: DC_MODEL, default claude-opus-5-5)
node cli.mjs merge-judge <report> <judge.json>
```

`<report>` is a directory under `out/` (or any path containing `evaluation.json`).

## Setup

Node 22+. Playwright with Chromium must be importable (`npm i playwright && npx playwright install chromium`
if it isn't already on the machine).

```
npm install
```

## Honest limits

- Deterministic rules see the DOM, not the idea. Creativity and AI-look stay "provisional" until a reviewer
  looks at the screenshots.
- CSS-override mockups show direction (tells removed, measurable faults fixed). They cannot add imagery or a
  concept. The prompt is the real deliverable; the mockup is for reacting.
- One capture, one day, light colour scheme, cookie banner auto-dismissed if it has an obvious button.
  WebGL-heavy pages are under-measured.
- Automated accessibility checks cover roughly 30% of WCAG. Follow with a manual pass.
- The eyebrow-label detector over-counts (any small label directly above a heading), as the taste-skill study
  also notes; it carries a low weight.

## Files

```
cli.mjs            CLI
src/capture.mjs    Playwright capture + in-page measurement + axe + snapshot + mockup renderers
src/rules.mjs      parameters, findings, scores
src/judge.mjs      juror brief, Claude call, review packet, merge, full redesign
src/prompt.mjs     hand-off prompt builder (isomorphic; also runs in the report)
src/report.mjs     report.html generator
src/serve.mjs      local server + API (/api/analyze, /decisions, /mockup, /redesign, /judge, /prompt)
src/pipeline.mjs   glue
fixtures/slop.html a deliberately generic page for testing (scores 5.7; accessibility, AI-look, responsive all 0)
test/ui-smoke.mjs  drives the report UI end to end against a running server
RESEARCH.md        survey of existing tools, the design literature, and AI-judge reliability
```
