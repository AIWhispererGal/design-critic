# Research notes: what already exists, and what the tool is built on

Compiled 1 Nov 2026. This is step one of the "fix AI design" system: survey the tools that try to make
coding agents design better, the psychology/design literature the evaluator should lean on, and the
evidence about whether AI judges of design are reliable.

## 1. Existing tools that help AIs design better

Ranked by how much is worth deep-diving. Star counts in blog posts vary wildly and were not verified.

### Worth a deep dive

**impeccable** (pbakaus/impeccable, Apache 2.0) — https://github.com/pbakaus/impeccable
The closest existing thing to what this project is building. 24 slash-command "moves" for a coding agent
(`bolder`, `quieter`, `typeset`, `layout`, `critique`, `audit`, `polish`, `harden`…), a **62-rule deterministic
slop detector** that runs without an LLM (`npx impeccable detect <dir|url>`), a design hook that scans every
UI file the agent edits, a Chrome extension overlay, and a `live` mode that hot-swaps variants in a dev server.
It writes `PRODUCT.md` (who/what/constraints) and `DESIGN.md` (the visual system) so later commands stay on
brand. It started from Anthropic's frontend-design skill. Weakness for our purposes: it is built for the agent
that owns the codebase, not for an owner reviewing a finished site and vetoing per suggestion.
*Note: running `npx impeccable detect --list-rules` was blocked by this session's permission classifier
(external code), so the rule list above is from its README, not verified by running it.*

**taste-skill** (Leonxlnx/taste-skill, MIT) — https://github.com/leonxlnx/taste-skill
The best *data*. v2 is built from a measured study of 247 sites (One Page Love + Awwwards, captured Oct 2026
in headless Chrome at 1440 and 390, scored by a 21-model panel with Awwwards weights). It quantifies which
"AI tells" actually separate weak from strong pages. The numbers this tool's AI-look weights come from:

| Device | Top sites (≥7.5) | Weak sites (<6.5) |
|---|---|---|
| Icon-topped feature cards | 1% | 28% |
| Rows of identical cards with a small icon | 7% | 26% |
| Pill badges | 14% | 34% |
| Tiny uppercase letter-spaced labels (≥3) | 6% | 43% |
| Gradient fills (not scrims) | 22% | 52% |
| Gradient text | 2% | 13% |
| Shadows on resting elements (≥5) | 10% | 30% |
| Emoji in the page | 10% | 26% |
| Centred statement hero with media below | 7% | 24% |
| Backdrop blur (no difference) | 32% | 39% |
| Monospace labels (more common on *strong* sites) | 44% | 24% |

Other findings used here: hero type median 5.0vw (top 6.0vw, weak 4.7vw); headline÷body median 4.3;
body 16px; strong sites have 2 distinct section grounds vs 1; buttons on top sites are 52% square-cornered,
weak sites 59% fully round and 24% "soft" 9–16px radius; images per page median 37 (top) vs 5 (weak); the
single clearest pattern is a *concept taken from the subject* vs its absence ("the standard dark SaaS launch
formula"). Also useful: its own skill lost to the no-skill baseline in blind tests for three rounds before
winning, which is an honest data point about how hard "teaching taste" is.

**Anthropic frontend-design skill** (anthropics/skills, Apache 2.0) — https://github.com/anthropics/skills/tree/main/skills/frontend-design
Short, dense, and the best *written* guidance. Names the current AI clusters precisely (warm cream + serif +
terracotta #D97757; near-black + acid green; broadsheet hairlines; the SaaS card kit; template chrome: ALL-CAPS
eyebrows, middle-dot meta strings, tinted near-black, "→" on every link). Process: plan tokens → review the
plan against "what would I produce for any similar brief" → build → critique screenshots. Also the best
guidance on copy as design content.

### Worth knowing about

**Vercel Web Interface Guidelines** (vercel-labs/web-interface-guidelines, agent-skills) — a terse, code-level
checklist: accessibility, focus, forms, animation (`prefers-reduced-motion`, never `transition: all`),
typography micro-rules, touch, safe areas, i18n, hydration. Output in `file:line` form. This tool's
accessibility/motion/craft rules borrow from it. It reviews source, not rendered pages.

**DESIGN.md** (Google Stitch spec, open-sourced Apr 2026; `npx @google/design.md lint`) and
**awesome-design-md** (VoltAgent) — a format for handing a visual system to an agent (YAML tokens + prose
rationale), with a linter that checks token references and WCAG contrast, plus a community collection of
DESIGN.md files extracted from real brand sites. Relevant as the *output* format for the "what should it
become" half of our tool.

**ui-ux-pro-max** (nextlevelbuilder) — a large searchable database (192 industry rules, 79 styles, 192
palettes, 74 font pairings) that generates a "design system recommendation" per brief. Breadth over depth;
useful as a lookup table, but it tends to produce exactly the template-y output ("Hero-centric + social
proof, Cormorant/Montserrat") the other tools warn against.

Also seen, not evaluated: pencilplaybook, aesthetic-frontend-skills, avoid-ai-design, taste-skill-classics.

### Commercial screenshot graders
UXReviewerAI, SiteSpeakAI "rate my website", Design Buddy (Figma plugin), UX Pilot, Frescai. Vendor marketing,
no independent benchmark found. Frescai's own caveat is the right one: image-only review can flag obvious
contrast problems but is no substitute for a code-level accessibility audit.

## 2. Design psychology and principles the evaluator uses

- **Laws of UX** (Jon Yablonski, O'Reilly 2nd ed.): Fitts (target size/distance → tap targets, button reach),
  Hick (choices → competing CTAs, nav count), Jakob (expectation → folded phone nav, wayfinding), Miller/
  chunking (≤7 top-level items), Von Restorff (isolation only works if one thing is isolated → one accent,
  one filled button), Aesthetic-Usability (attractive designs are forgiven usability faults — which is why
  the study's best sites were *no easier to use* than average), Peak-End.
- **Gestalt**: proximity (gap between groups must exceed gaps within → section spacing rule), similarity,
  common region (boxes override every other grouping cue → the card-row rule), continuity, closure.
- **Nielsen's 10 heuristics**: visibility of status, match to the real world (plain-language labels),
  recognition over recall (show the product), aesthetic & minimalist design, error messages that say what to do.
- **Typography**: Bringhurst, *The Elements of Typographic Style* — measure 45–75 characters (66 classic),
  leading 1.45–1.6 for text, a type scale with clear steps, one or two families. WCAG 1.4.8 (AAA) caps lines
  at 80 characters; the 45–75 range is convention, not WCAG, and the tool cites it that way.
- **Accessibility**: WCAG 2.2 AA via axe-core plus our own contrast walk (1.4.3 contrast, 1.4.4 resize/zoom,
  2.4.7 focus visible, 2.4.11 focus not obscured, 2.5.8 target size 24px floor, 1.1.1 alt, 3.1.1 lang,
  4.1.2 name/role/value, 2.3.3 motion). Automated checks cover roughly 30% of WCAG; the report says so.
- **Spacing systems**: 4/8-pt grids and token scales (the point is a small vocabulary, not the specific base).

## 3. Can an AI judge design? (why the veto matters)

- **DesignPref** (arXiv 2511.20513): 12k pairwise UI comparisons by 20 professional designers.
  **Krippendorff's alpha = 0.25** for binary preference — designers disagree with each other a lot, and the
  disagreements come from weighting design aspects differently. Majority-vote judge models do not reflect
  individuals; personalised models (fine-tuned or RAG on a designer's own annotations) beat aggregates with 20×
  fewer examples. **Implication:** a per-suggestion veto is not a UX nicety, it is the training signal. The
  tool exports decisions as a "taste profile" for exactly this reason.
- **UI-Bench** (arXiv 2508.20410): 10 text-to-app tools, 300 sites, 4,000+ expert pairwise judgments,
  TrueSkill ranking. Establishes that "visual excellence" can be benchmarked by expert preference; notes that
  prior benchmarks rarely measured holistic taste. DesignPref reports that multimodal LLM judges achieve only
  moderate alignment with these human preferences, and that UICLIP (a trained design-quality encoder) did
  better than off-the-shelf models.
- **UXBench** (arXiv 2606.16262): LLMs as interaction-grounded UX judges; gaps between human and LLM scores.
- A small open experiment (CAPTH69/mllm-ui-judge) found position bias in pairwise judging and unstable
  absolute scores; useful as a critic, not as the sole signal.

**Design consequence for this tool:** measure what can be measured deterministically (most of the 16
parameters), use an LLM only for what cannot (idea, hierarchy-as-seen, whether imagery belongs), make the
LLM cite visible evidence and separate "principle violation" from "taste", and let the human veto.

## 4. The hard problem the user named

"Give AIs continuity and put them through art school / a client engagement from concept to end product."
None of the surveyed tools do this. The nearest fragments: impeccable's `PRODUCT.md`/`DESIGN.md` and
`.impeccable/critique/*.md` (per-project memory), taste-skill's "look at your own screenshots, fix the top
three, three rounds" loop, Anthropic's "jot notes about what you've tried for future passes", and
DesignPref's personalisation result. A plausible architecture is: a persistent taste profile per owner
(the veto log), a per-project design memory (DESIGN.md + critique history), and a critique→revise loop
judged against *that owner's* profile rather than an aggregate. That is step two.

## Sources

- https://github.com/pbakaus/impeccable
- https://github.com/leonxlnx/taste-skill (README, `skills/taste-skill/SKILL.md`, `references/research.md`)
- https://github.com/anthropics/skills/tree/main/skills/frontend-design
- https://github.com/vercel-labs/web-interface-guidelines · https://github.com/vercel-labs/agent-skills
- https://github.com/google-labs-code/design.md · https://github.com/VoltAgent/awesome-design-md
- https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- https://arxiv.org/abs/2511.20513 (DesignPref) · https://arxiv.org/abs/2508.20410 (UI-Bench) · https://arxiv.org/abs/2606.16262 (UXBench)
- https://github.com/CAPTH69/mllm-ui-judge
- https://www.uxdesigninstitute.com/blog/?p=10305 (21 laws of UX) · O'Reilly, *Laws of UX* 2nd ed.
- https://medium.com/codetodeploy/your-ai-frontend-looks-generic-heres-the-one-repo-that-fixes-it-f67de5ff48cc
- https://dev.to/alanwest/why-every-ai-built-website-looks-the-same-blame-tailwinds-indigo-500-3h2p
- https://www.925studios.co/blog/ai-slop-design-tells · https://scalr.sg/blog/20-signs-a-website-was-made-by-ai/
- https://www.uxreviewerai.com/ · https://sitespeak.ai/tools/rate-my-website-design · https://designbuddy.net/ · https://frescai.com/ui-design-analyzer
