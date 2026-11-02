# Credits: what this tool took from whom

design-critic is built on other people's measurements, rules and writing. This file says exactly what was
used, from where, and under what licence, so credit lands where it belongs. No code was copied from any
of the projects below; what was taken is numbers, rules, phrasing and ideas, as described.

## taste-skill — Leonxlnx (MIT)
https://github.com/leonxlnx/taste-skill

The single biggest input. From `skills/taste-skill/references/research.md` (the study of 247 One Page
Love and Awwwards sites, October 2026) we took the numbers that drive the **AI-look weights** and many
rule thresholds:

- weak-vs-strong rates for icon-topped cards (28% / 1%), identical card rows (26% / 7%), pill badges
  (34% / 14%), tracked-caps labels (57% / 16%), gradients (52% / 22%), gradient text (13% / 2%), five-plus
  resting shadows (30% / 10%), emoji (26% / 10%), centred-statement hero (24% / 7%);
- hero type medians (5.0vw overall, 6.0vw top, 4.7vw weak), headline÷body 4.3, body 16px, headline word
  median 5, two-line/three-line headline rates, 120–240px section gaps, distinct section grounds (2 vs 1),
  button-shape split (top sites 52% square, weak 59% pill, 9–16px as the "soft" default), image counts
  (37 top vs 5 weak), illustration-led pages scoring lowest, the near-empty-screens failure, the
  "eyebrow detector over-counts" caveat (which we repeat), and the observation that strong sites are no
  easier to use than weak ones;
- the framing that high scores go with "a concept taken from the subject" and the vocabulary for it
  ("the product demonstrates itself", "the page is an artefact from the subject's world", "the name is the
  hero", "the competitor test"), which shapes our creativity rule and the juror brief;
- the Awwwards-style weighting (design 40 / usability 30 / creativity 20 / content 10) in the juror brief;
- the look-at-your-own-screenshots, fix-the-top-three loop, which the hand-off prompt asks the coding AI
  to perform.

Every finding that cites these numbers names the study as its source.

## Anthropic frontend-design skill — Anthropic (Apache 2.0)
https://github.com/anthropics/skills/tree/main/skills/frontend-design

We took:

- the catalogue of current AI clusters and "template chrome": warm cream + serif + terracotta, near-black
  + acid green, broadsheet hairlines, the SaaS card kit (one radius everywhere, one grey shadow, gradient
  washes), tracked ALL-CAPS eyebrows, middle-dot meta strings, tinted near-black (#0b0b0b / #111), "→"
  appended to links, numbered 01/02/03 markers when the content isn't a sequence; these became
  individual tells and rules;
- the typographic defaults to avoid (accenting one word in a headline, all-caps labels, labels above
  content), "one family or two clearly distinct", line length under 80, serif leading guidance;
- "spend your boldness in one place", "a single orchestrated moment" for motion, "fade-and-slide-up on
  every section reads as generated", the Chanel "remove one accessory" idea, the plan → check-against-
  generic → build → critique process, which our hand-off prompt reproduces as its Process section;
- the writing guidance (words are design content; name the outcome on buttons; active voice; errors say
  what to do), which drives the copy and vague-label rules.

## Vercel Web Interface Guidelines — Vercel Labs (MIT)
https://github.com/vercel-labs/web-interface-guidelines

Rules taken directly into our accessibility, motion, craft and responsive checks: `user-scalable=no` /
`maximum-scale=1` as an anti-pattern; icon buttons need `aria-label`; inputs need labels; never
`outline: none` without a `:focus-visible` replacement; honour `prefers-reduced-motion`; never
`transition: all`; images need width/height (CLS) and lazy loading below the fold; `<button>` for actions
not `<div onClick>`; `min-width: 0` on flex children and the overflow guidance; semantic landmarks and
skip links. Their terse "state the issue and location" output style influenced our finding format.

## impeccable — Paul Bakaus (Apache 2.0)
https://github.com/pbakaus/impeccable

Taken as **ideas, not code**: that a deterministic slop detector with no LLM is the right first layer;
the P0–P3 severity scale for findings; the split between a scored UX `critique` and a technical `audit`;
"cramped padding" and "skipped headings" as quality rules; `PRODUCT.md`/`DESIGN.md` as per-project memory,
which is where our taste profile idea extends. We were not able to run its rule list in our build
environment, so none of its 62 rules were read or reproduced; where ours overlap it is convergence on the
same tells. impeccable itself credits Anthropic's frontend-design skill as its origin.

## DESIGN.md — Google Labs (Apache 2.0) and awesome-design-md — VoltAgent
https://github.com/google-labs-code/design.md · https://github.com/VoltAgent/awesome-design-md

Read, not yet used. The token-plus-rationale format is the planned output format for "what the page
should become". Noted here so the lineage is clear if that lands.

## Research papers

- **DesignPref** — Krippendorff's alpha of 0.25 among 20 professional designers on 12k UI pairs; personalised
  judges beat aggregate ones. This is the justification for per-suggestion vetoes and the taste profile.
  https://arxiv.org/abs/2511.20513
- **UI-Bench** — expert pairwise benchmark of AI text-to-app tools; "design quality as probability a
  professional designer prefers it". https://arxiv.org/abs/2508.20410
- **UXBench** — LLMs as UX judges and the gap to human scores. https://arxiv.org/abs/2606.16262
- **CAPTH69/mllm-ui-judge** — small open experiment noting position bias and unstable absolute scores in
  multimodal UI judging; informed the "cite visible evidence, mark taste as taste" juror rules.

## Books and standards

- Jon Yablonski, *Laws of UX* (O'Reilly, 2nd ed.) — Fitts, Hick, Jakob, Miller, Von Restorff, aesthetic-
  usability, as cited in individual rules. https://lawsofux.com
- Robert Bringhurst, *The Elements of Typographic Style* — measure (45–75 characters), leading, scale.
- Jakob Nielsen, *10 Usability Heuristics for User Interface Design* (Nielsen Norman Group).
- Gestalt principles (proximity, similarity, common region) as commonly summarised in UX literature.
- W3C, *Web Content Accessibility Guidelines (WCAG) 2.2* — success criteria cited by number in findings.

## Blog posts that shaped the tell list (no numbers taken)

- "Why Every AI-Built Website Looks the Same (Blame Tailwind's Indigo-500)" — Alan West, DEV
- "AI Slop Fonts and Gradients: The Tells That Give Away AI Design" and the companion guide — 925 Studios
- "20 Signs a Website Was Made by AI" — SCALR
- "Your AI Frontend Looks Generic. Here's the One Repo That Fixes It." — Medium (pointed us to taste-skill)

## Software dependencies

- **axe-core** — Deque Systems (MPL 2.0). Runs the WCAG checks. https://github.com/dequelabs/axe-core
- **Playwright** — Microsoft (Apache 2.0). Captures, measures and renders. https://playwright.dev
- **@anthropic-ai/sdk** — Anthropic (Apache 2.0). Optional juror, redesign and hypothesis passes.

## How design-critic itself was made

The tool was designed and written in a working session between Michelle Gallagher and Claude (Fable 5.1,
Anthropic), November 2026. The research survey, rule thresholds, report design and the taste-profile
architecture came out of that session; the decisions behind them are recorded in `DECISIONS.md`.
