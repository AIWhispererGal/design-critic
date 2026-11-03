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

## How to use it

### 1. Before a coding AI touches the UI

The main use. Most people prompt "make a landing page", get the purple gradient, then argue with it.
Flip the order:

```
# agent builds on a dev server, then:
node cli.mjs analyze http://localhost:3000
node cli.mjs serve            # open the report, accept / veto, add notes
```

Press **Generate coding-AI prompt** and paste it back to the agent. The brief contains only what you
accepted, your vetoes as hard "do not" lines, the measured current state, your learned preferences, a
quality floor, and a plan-then-build-then-screenshot process. Two or three rounds is the loop that moves
scores. Each round starts closer to you instead of closer to the training-data average.

### 2. As a gate in CI

The deterministic half needs no key, so it can run on every deploy preview:

```
node cli.mjs check https://preview.example.com --min-overall 7 --max P0=0 --min accessibility=8,responsive=7
```

Exit code 0 passes, 2 fails (with the reasons listed), 1 is an error. `--json` prints scores and findings
for machines; `--github` prints GitHub Actions annotations. A minimal workflow step:

```yaml
- run: npm ci && npx playwright install --with-deps chromium
- run: node cli.mjs check ${{ env.PREVIEW_URL }} --max P0=0 --min accessibility=8 --github
```

Gate on the measured parameters (accessibility, responsive, craft, the AI-look tells). Don't gate on
creativity; that one is a conversation, not a threshold.

### 3. With a client or a team

Run it on their current site before the first meeting. A measurement lands differently than an opinion:
"your text fails WCAG contrast in twenty places" is a fact, not a pitch. Then have them do the vetoes.
Their decisions become their taste profile, which is the thing every agency reconstructs by hand over
six weeks of revisions. Export it (`Export decisions`) and keep it with the project.

### 4. One component at a time

Most daily work is "this modal", "this pricing table", not "this site". Scope the review:

```
node cli.mjs analyze https://example.com --selector ".pricing"
```

or put the selector in the box on the home page. Page-level rules (hero, nav, imagery count, section
rhythm, creativity) switch off and their parameters show as unscored; the screenshot and the juror's view
are of the element only; mockups re-render just that element. The rules that remain are the ones that
matter inside a component: contrast, names, targets, typeface, tells, cards, radii, motion, overflow.

### 5. Studio: the art-school loop

With a key, one command runs the whole critique cycle:

```
node cli.mjs studio "a site for a 14-room family guesthouse on the Ligurian coast" --rounds 3 --pause
```

- **Round 0.** The student model builds a page from the brief and writes an intent: the idea in one
  sentence and the one place it spent boldness. (Or start from an existing page with `--from <url|file>`.)
- **Critique.** The critic measures it and the juror reads it. The quality floor and your usual decisions
  are applied automatically; juror taste calls are left for you.
- **Revision.** The student gets the brief built from that critique, plus its own earlier intents and
  reflections and the score history. It revises, writes a new intent, and a reflection: what it would
  change next and what it is unsure about.
- **Stop.** After `--rounds`, or earlier when the score stalls (`--min-gain`, default 0.2).
- **Crit log.** `out/studio-<brief>-<time>.md`: a score table across rounds and, per round, the student's
  intent, the juror's read, what works, the tells, the top findings, and the student's reflection. Every
  round's full report is in the list on the home page.

`--pause` stops after each round so you can be the teacher: open that round's report, accept/veto, add
notes, then `node cli.mjs studio --resume <studio-name>`. Your decisions override the automatic ones for
the next revision. Automatic decisions are written to `auto-decisions.json`, never `decisions.json`, so
the machine's choices never leak into your taste profile; only your clicks do.

Expect the first runs to produce pages that pass every rule and still bore you. That is the point where
your notes matter more than the scores. (taste-skill's own loop lost to the no-skill baseline for three
rounds before it won.)

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
   findings' CSS applied, shown as a drag-to-compare before/after slider with the percentage of pixels that
   changed and the list of which accepted items were (and were not) expressible as CSS. **Mock up full redesign** (needs a key): a standalone
   HTML rebuild from the page's real content, honouring accepts and vetoes.
7. **Generate DESIGN.md**: the same intent as a design-system file in Google Stitch's DESIGN.md format
   (YAML tokens + rationale). Measured tokens moved by what you accepted; vetoes become Don'ts; undecided
   things (an accent, a typeface) are marked `TODO` under Open decisions rather than invented. Drop it in the
   project root so later work stays on-system. Validate with `npx @google/design.md lint DESIGN.md`.
8. **Learning from decisions.** Every accept/veto is an observation. `node cli.mjs taste` builds
   `out/taste-profile.json`: accept rate per rule and per parameter, and which page/finding features shift
   your accept rate away from your base rate (dark pages, phone-only findings, juror taste calls, severity…).
   Rules you decide the same way at least twice are marked "you usually accept/veto this" on new reports,
   with an **Apply my usual decisions** button; the prompt and the juror brief carry a preferences section.
   `node cli.mjs taste --explain` asks Claude for plain-language hypotheses about what the yes/nos are
   capturing, each with its evidence and what would disprove it; you `--confirm` or `--reject` each, and only
   confirmed hypotheses are ever written into prompts. Designers agree with each other only weakly
   (DesignPref, alpha 0.25), so this is the part that makes the next review yours.

## CLI

```
node cli.mjs analyze <url|file> [--out dir] [--judge] [--selector ".pricing"]
node cli.mjs check <url|file> [--min-overall 7] [--min accessibility=8,responsive=7] [--max P0=0,P1=2] [--json] [--github] [--selector ...]
node cli.mjs serve [--port 4310]
node cli.mjs prompt <report> [--all | --p01 | --accept F001,F002] [--veto F003]
node cli.mjs design-md <report> [--all | --p01 | --accept ...]     # DESIGN.md (Stitch format)
node cli.mjs studio "<brief>" [--rounds 3] [--from <url|file>] [--pause] [--min-gain 0.2]   # needs key
node cli.mjs studio --resume <studio-name>
node cli.mjs mockup <report> [--all | --p01 | --accept ...] [--viewport phone] [--full]
node cli.mjs judge <report>                   # needs ANTHROPIC_API_KEY (model: DC_MODEL, default claude-opus-5-5)
node cli.mjs merge-judge <report> <judge.json>
node cli.mjs taste [--explain] [--confirm id | --reject id] [--json]
```

`<report>` is a directory under `out/` (or any path containing `evaluation.json`).

## Setup

Copy `.env.example` to `.env` and fill in what you need. `ANTHROPIC_API_KEY` turns on the juror pass and
full-redesign mockups; `DC_MODEL`, `DC_OUT` and `DC_PORT` are optional. Shell variables override the file,
and `DC_ENV=/path/to/file` points at a different one. `.env` is git-ignored.

Node 22+. Playwright with Chromium must be importable (`npm i playwright && npx playwright install chromium`
if it isn't already on the machine).

```
npm install
```

## Credit and decisions

This tool stands on other people's work, mostly the taste-skill study (Leonxlnx, MIT), Anthropic's
frontend-design skill (Apache 2.0), Vercel's Web Interface Guidelines (MIT), impeccable's ideas (Paul
Bakaus, Apache 2.0), axe-core (Deque, MPL 2.0), and the DesignPref / UI-Bench papers. Exactly what was taken
from each, and under which licence, is in [`CREDITS.md`](CREDITS.md). Why the tool is built the way it is,
including what we chose not to do, is in [`DECISIONS.md`](DECISIONS.md). The research survey behind both is
[`RESEARCH.md`](RESEARCH.md).

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
src/designmd.mjs   DESIGN.md generator (Google Stitch format)
src/studio.mjs     the art-school loop: student builds, critic reviews, student revises; crit log
src/report.mjs     report.html generator
src/home.mjs       the server's front page (analyse, reports, taste, how-to)
src/theme.mjs      the one stylesheet both pages share
src/serve.mjs      local server + API (/api/analyze, /decisions, /mockup, /redesign, /judge, /prompt)
src/pipeline.mjs   glue
src/taste.mjs      decisions → profile (rates, lifts, hypotheses); applied to reports, prompts, juror brief
src/diff.mjs       pixel diff between two screenshots (for the mockup readout)
src/env.mjs        .env loader
fixtures/slop.html a deliberately generic page for testing (scores 5.7; accessibility, AI-look, responsive all 0)
test/ui-smoke.mjs  drives the report UI end to end against a running server
test/home-smoke.mjs drives the home page and a scoped mockup
test/studio-mock.mjs runs the studio loop with a fake student (no key needed)
RESEARCH.md        survey of existing tools, the design literature, and AI-judge reliability
CREDITS.md         what was taken from whom, with licences
DECISIONS.md       why it is built this way, and what was deliberately left out
```
