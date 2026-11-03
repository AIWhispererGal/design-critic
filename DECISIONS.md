# Decisions

Why the tool is the way it is. Written for the people, so arguments can be had with the reasons rather
than the code. Newest at the bottom.

## 1. Measure first, judge second

Most "AI design review" products send a screenshot to a vision model and print what it says. We don't
trust that as the only signal: multimodal judges show only moderate agreement with expert preference,
position bias in pairwise comparisons, and unstable absolute scores (DesignPref, UXBench, mllm-ui-judge).
So the first layer is deterministic: a real browser, computed styles, axe-core, pixel geometry. Fourteen
of the sixteen parameters are scored entirely from measurements. The model is used only for what cannot
be measured (is there an idea; does the imagery belong; does the hierarchy read), and it must cite
visible evidence and label taste calls as taste.

## 2. Every finding carries its "why" and its source

A score with no reason teaches nothing and can't be argued with. Each finding states what was measured,
what to change, the principle, and where the principle comes from (a WCAG criterion, a study figure, a
named law). If a rule cites a number, that number has to be traceable to `CREDITS.md`.

## 3. The AI-look score is weighted by evidence, not vibes

Blog lists of "AI tells" are long and unweighted. We weight each tell by how strongly it separated weak
from strong sites in the taste-skill study (icon-topped cards 28% vs 1% is a strong signal; backdrop blur
39% vs 32% is noise and is barely weighted). No single tell is proof; the cluster is scored. Tells that
are *more* common on strong sites (monospace labels, index numbering) are flagged lightly, as
"fashion", not as faults.

## 4. The quality floor does not learn

Accessibility, contrast, zoom, overflow, tap targets, reduced motion, line length: these are measured
against WCAG and typographic practice, never against the owner. You can veto a finding on a page; the rule
never learns that contrast doesn't matter. Only taste-shaped parameters bend toward the owner.

## 5. Veto per suggestion, and the veto is data

DesignPref found alpha 0.25 among twenty professional designers. There is no aggregate "good taste" to
train toward; averaging produces the beige consensus everyone calls slop. So the unit of feedback is the
individual suggestion, the decision is stored with a free-text note, and the profile is personal. The
owner of the tool ends up with their own taste written down. If that taste is bad, the tool will say so
in the "why" and then do what it's told.

## 6. Two learning tiers, the second gated by the human

Tier one is arithmetic: accept rates per rule and parameter, and feature lifts (does severity, page
darkness, phone-only, juror-origin change the accept rate?). It runs on every save and is fully
explainable. Tier two asks a model for falsifiable hypotheses about what the yes/nos capture, each with
its evidence and what would disprove it. Hypotheses are *proposed*; only ones the owner confirms are ever
written into prompts or the juror brief. The model proposes features; the human decides; the decision is
itself more data.

## 7. The prompt is the deliverable; the mockup is for reacting

CSS-override mockups can remove tells and fix measurable faults on the existing markup, and they're worth
having because people react to pictures. They cannot add an image, copy, or an idea. So the hand-off
prompt is the primary output: accepted items only, vetoes as "do not", the measured current state, the
owner's learned preferences, a quality floor, and a plan-then-build-then-screenshot process borrowed
from Anthropic's skill. The mockup readout says which accepted items it could not express, so nobody
mistakes the mockup for the change.

## 8. No key required for the core

Capture, scoring, findings, report, veto, prompt and CSS mockups all run with no API key. The key only
adds the juror, the full redesign and the hypothesis pass. A review tool that needs a paid model to say
anything at all is a demo, not a tool.

## 9. The report must not be slop

The report page is left-anchored, one serif display face and the system sans, white ground, one accent,
no cards, no icons, no gradients, bars instead of radial charts. If the tool's own UI exhibited the tells it
measures, nobody should believe it.

## 10. Stable rule ids

Findings are numbered per report (F001…) for the UI, but every finding also carries a stable rule id
(`hierarchy.content-chopped-into-equal-cards`). Learning across sites is impossible without it. Titles
that embed numbers or font names are normalised so the id stays the same.

## 11. DESIGN.md is the third output, and it is deterministic

A prompt is consumed once; a DESIGN.md lives in the repo and keeps every later change on-system, which is
what "continuity" needs. We generate it in Google Stitch's format rather than inventing one, because
coding agents already read it and the linter exists. It is built without a model: measured tokens, moved by
the accepted findings, with vetoes and preferences as Do's and Don'ts. Where a decision has not been made
(an accent, a typeface) the file says `TODO` and lists it under Open decisions rather than inventing a
value, because an invented value would be exactly the default the tool exists to catch.

## 12. The studio loop keeps two notebooks and never mixes them

The owner's notebook is the taste profile, built only from their clicks. The student's notebook is its
own intents and reflections, fed back into every revision. In the studio loop the machine decides most
findings automatically (quality floor plus the owner's usual decisions), and those decisions are written
to `auto-decisions.json`, not `decisions.json`, so they never train the profile. Juror taste calls are
left undecided for the owner. `--pause` is how the owner steps in; when they do, their decisions win.
The loop also stops itself when the score stalls, because a loop that runs to the round limit regardless
is just a way to spend tokens on the same page.

The student and the juror are both the same model family, so the loop can flatter itself. The
deterministic rules and the owner's vetoes are the check on that, and the crit log is what makes the
self-flattery visible after the fact.

## 13. Things we chose not to do (yet)

- **Copy impeccable's rules.** We couldn't run it in the build environment and didn't want to transcribe
  someone else's rule list by hand. Overlap is convergence.
- **Score dark mode or motion.** One capture, light scheme, still frames. The juror brief says so.
- **Ship an npm package first.** The tool needs Chromium; a repo people clone is more honest until the
  weights have been calibrated on more than a fixture and one production site.
- **Average taste across users.** See decision 5.

## 14. Known weaknesses, stated on purpose

- The eyebrow-label detector over-counts (the source study has the same caveat). Low weight.
- Automated accessibility covers roughly 30% of WCAG. The report says so.
- Rule thresholds were calibrated on a synthetic slop fixture and a handful of real sites. They will move
  as decisions accumulate, and the taste profile is how.
