// designmd.mjs — write "what the page should become" as a DESIGN.md (Google Stitch format, version alpha):
// YAML tokens + markdown rationale. Tokens start from what was measured and are moved by the accepted
// findings; vetoes and the owner's profile become Do's and Don'ts. Deterministic; no model needed.
// Spec: https://github.com/google-labs-code/design.md/blob/main/docs/spec.md

const hexRe = /^#[0-9a-f]{6}$/i;
const lum = hex => { const h = hex.replace('#', ''); const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(parseInt(h.slice(0, 2), 16)) + 0.7152 * f(parseInt(h.slice(2, 4), 16)) + 0.0722 * f(parseInt(h.slice(4, 6), 16)); };
const contrast = (a, b) => { const la = lum(a) + 0.05, lb = lum(b) + 0.05; return la > lb ? la / lb : lb / la; };
const snap = (v, step = 4) => Math.max(step, Math.round(v / step) * step);
const q = s => `"${String(s).replace(/"/g, '\\"')}"`;
const fam = f => String(f || '').replace(/["']/g, '').split(',')[0].trim();

export function buildDesignMd(ev, cap, { accepted = [], vetoed = [], notes = {} } = {}) {
  const vps = cap.viewports.filter(v => v.metrics);
  const M = (vps.find(v => v.name === 'laptop') || vps[vps.length - 1]).metrics;
  const acc = new Set(accepted), vet = new Set(vetoed);
  const has = ruleFrag => ev.findings.some(f => acc.has(f.id) && f.rule.includes(ruleFrag));
  const vetoedHas = ruleFrag => ev.findings.some(f => vet.has(f.id) && f.rule.includes(ruleFrag));
  const todo = [];

  // ---------- colours ----------
  const surface = hexRe.test(M.bodyBg) ? M.bodyBg : '#ffffff';
  const dark = lum(surface) < 0.25;
  const texts = (M.textColors || []).map(t => t.hex).filter(h => hexRe.test(h));
  // ink = the highest-contrast colour among the three most-used text colours (headlines are few characters but set the ink)
  let onSurface = [...texts.slice(0, 4)].sort((a, b) => contrast(b, surface) - contrast(a, surface))[0] || (dark ? '#f2f2f2' : '#161616');
  let secondary = texts.find(h => h !== onSurface && contrast(h, surface) >= 4.5) || null;
  if (!secondary || has('text-fails-wcag-contrast')) secondary = dark ? '#c9c9c9' : '#4a4a4a'; // guaranteed ≥ 4.5:1 on near-black / near-white
  let tertiary = (M.accents || [])[0] || null;
  let colourNote = '';
  if (has('purple-indigo-to-blue-gradient') || has('too-many-accent-hues')) { tertiary = '#1f4e5f'; todo.push('colors.tertiary: placeholder. Choose one accent from the subject\'s own material (a product colour, a place, a material) and replace it.'); colourNote = 'The accent below is a placeholder; the gradient palette was rejected and no subject-derived colour has been chosen yet.'; }
  if (!tertiary) { tertiary = dark ? '#e8e2d6' : '#161616'; colourNote = colourNote || 'Monochrome: there is no accent. Hierarchy comes from scale and space; if an accent is added later it gets exactly one job.'; }
  if (has('tinted-near-black') ) { todo.push('colors.surface: the tinted near-black was rejected; decide the ground on purpose (true black, a palette-derived dark, or go light).'); }
  const colors = { surface, 'on-surface': onSurface, secondary, tertiary };

  // ---------- typography ----------
  const fonts = Object.entries(M.fonts || {}).sort((a, b) => b[1] - a[1]);
  let display = fam(fonts[0]?.[0] || 'system-ui'), text = display;
  if (fonts[1] && fonts[1][1] / Math.max(1, M.totalChars) > 0.05) text = fam(fonts[1][0]);
  if (has('font-everywhere')) { display = 'TODO: chosen display face'; todo.push('typography: the default/AI-favourite typeface was rejected. Pick one display face that belongs to the subject; keep it for everything or pair with one clearly different text face.'); }
  const body = Math.max(has('text-under-n') ? 16 : 14, Math.round(M.bodySize || 16));
  const heroPx = M.hero?.size ? Math.round(M.hero.size) : 48;
  const h1 = has('hero-timid') ? Math.max(heroPx, 72) : heroPx;
  const h2 = (M.headings || []).find(h => h.tag === 'h2')?.size;
  const label = has('text-under-n') ? 13 : Math.max(12, Math.min(13, ...Object.keys(M.fontSizes || {}).map(Number).filter(n => n < body)) || 13);
  const typography = {
    'display-lg': { fontFamily: display, fontSize: `${h1}px`, fontWeight: +(M.hero?.weight) || 600, lineHeight: 1.0, letterSpacing: '-0.02em' },
    'headline-md': { fontFamily: display, fontSize: `${Math.round(h2 || Math.max(28, h1 / 2))}px`, fontWeight: 600, lineHeight: 1.1, letterSpacing: '-0.01em' },
    'body-md': { fontFamily: text, fontSize: `${body}px`, fontWeight: 400, lineHeight: has('leading-too-tight') ? 1.55 : 1.5 },
    'label-sm': { fontFamily: text, fontSize: `${label}px`, fontWeight: 500, lineHeight: 1.3 },
  };
  const noTrackedCaps = has('tell-cluster') || vetoedHas('tell-cluster') === false;

  // ---------- spacing ----------
  const observed = Object.entries(M.spacing || {}).map(([v, c]) => [+v, c]).filter(([v, c]) => c >= 2).map(([v]) => v);
  const sectionGap = M.sectionGaps?.length ? Math.round(M.sectionGaps.reduce((a, b) => a + b, 0) / M.sectionGaps.length) : 96;
  const spacing = { base: '8px', xs: '4px', sm: '8px', md: '16px', lg: '32px', xl: '64px', section: `${has('not-clearly-separated') ? Math.max(120, snap(sectionGap, 8)) : snap(sectionGap, 8)}px`, measure: '42rem' }; // ≈ 68ch at 16px; the spec allows px/em/rem only
  const offGrid = observed.filter(v => v % 4 !== 0);

  // ---------- shapes ----------
  const radii = Object.entries(M.radii || {}).map(([k, c]) => [parseFloat(k), c]).filter(([r, c]) => !isNaN(r) && c >= 2).sort((a, b) => b[1] - a[1]);
  const pill = radii.some(([r]) => r >= 100);
  const mid = radii.map(([r]) => r).filter(r => r > 0 && r < 100).sort((a, b) => a - b);
  let rounded;
  if (has('different-border-radii') || has('tell-cluster')) rounded = { none: '0px', sm: `${Math.min(8, ...(mid.length ? mid : [4]))}px`, full: '9999px' };
  else rounded = Object.fromEntries([['none', '0px'], ...(mid.slice(0, 2).map((r, i) => [['sm', 'md'][i], `${r}px`])), ...(pill ? [['full', '9999px']] : [])]);

  // ---------- components ----------
  const btn = (M.aboveFoldButtons || []).find(b => !b.inNav) || (M.buttonsLike || [])[0];
  const parseRgb = s => { const m = String(s || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); return m ? '#' + [m[1], m[2], m[3]].map(v => (+v).toString(16).padStart(2, '0')).join('') : null; };
  const btnBg = parseRgb(btn?.bg), btnFg = parseRgb(btn?.color);
  const components = { 'button-primary': { backgroundColor: has('purple-indigo-to-blue-gradient') || !btnBg ? '{colors.tertiary}' : btnBg, textColor: btnFg || (dark ? '{colors.surface}' : '#ffffff'), rounded: pill && !has('tell-cluster') ? '{rounded.full}' : '{rounded.none}', padding: '12px 20px', height: '44px' } };

  // ---------- YAML ----------
  const y = [];
  y.push('---', 'version: alpha', `name: ${q(ev.summary?.title || cap.url)}`, `description: ${q('What this page should become: measured tokens moved by the accepted review findings. Generated by design-critic.')}`);
  y.push('colors:'); for (const [k, v] of Object.entries(colors)) y.push(`  ${k}: ${q(v)}`);
  y.push('typography:'); for (const [k, t] of Object.entries(typography)) { y.push(`  ${k}:`); for (const [p, v] of Object.entries(t)) y.push(`    ${p}: ${typeof v === 'number' ? v : q(v)}`); }
  y.push('spacing:'); for (const [k, v] of Object.entries(spacing)) y.push(`  ${k}: ${q(v)}`);
  y.push('rounded:'); for (const [k, v] of Object.entries(rounded)) y.push(`  ${k}: ${q(v)}`);
  y.push('components:'); for (const [k, c] of Object.entries(components)) { y.push(`  ${k}:`); for (const [p, v] of Object.entries(c)) y.push(`    ${p}: ${q(v)}`); }
  y.push('---');

  // ---------- prose ----------
  const accFindings = ev.findings.filter(f => acc.has(f.id)), vetFindings = ev.findings.filter(f => vet.has(f.id));
  const L = [y.join('\n'), ''];
  L.push(`# ${ev.summary?.title || 'Design system'}`, '');
  L.push('## Overview', '');
  L.push(`Source: ${cap.url}${ev.summary?.selector ? ` (component \`${ev.summary.selector}\`)` : ''}. Measured ${cap.capturedAt.slice(0, 10)}; review score ${ev.overall}/10 before changes.`, '');
  if (ev.judge?.concept) L.push(`**Current concept (juror):** ${ev.judge.concept}`, '');
  if (ev.judge?.redesign_direction) L.push(`**Direction:** ${ev.judge.redesign_direction}`, '');
  else L.push(`**Direction:** TODO. Write one sentence tying this subject's own material to a visual idea no competitor could paste. Spend the boldness in one place; keep everything else quiet.`, '');
  if (ev.profileSummary) L.push(`**Owner's preferences:** ${ev.profileSummary.split('\n').join(' ')}`, '');
  if (todo.length) L.push('**Open decisions:**', ...todo.map(t => `- ${t}`), '');

  L.push('## Colors', '');
  L.push(colourNote || `One ground, one ink, one secondary, one accent with a single job.`, '');
  L.push(`- **Surface (${surface}):** the page ground${dark ? ' (dark)' : ''}.`);
  L.push(`- **On-surface (${onSurface}):** running text and headlines, ${contrast(onSurface, surface).toFixed(1)}:1 against the surface.`);
  L.push(`- **Secondary (${secondary}):** captions and metadata only, never running text; ${contrast(secondary, surface).toFixed(1)}:1 against the surface (WCAG AA needs 4.5:1).`);
  L.push(`- **Tertiary (${tertiary}):** the sole interaction colour: primary buttons, focus rings, one highlight. Nowhere else.`, '');

  L.push('## Typography', '');
  L.push(display === text ? `One family, **${display}**, carries everything; hierarchy comes from size and weight, not from mixing faces.` : `**${display}** for display and headlines, **${text}** for text. Two faces, clearly distinct, no third.`, '');
  L.push(`- **Display:** ${h1}px on desktop, two lines or fewer at every width; use \`clamp()\` down to ~${Math.round(h1 * 0.5)}px on phones.`);
  L.push(`- **Body:** ${body}px, line-height ${typography['body-md'].lineHeight}, measure 45–75 characters (max-width ${spacing.measure}, about 68ch).`);
  L.push(`- **Labels:** ${label}px minimum. ${noTrackedCaps ? 'No tracked uppercase labels, no eyebrow labels above headings, no index numbering unless the content is a sequence.' : 'Uppercase labels only where they encode information.'}`, '');

  L.push('## Layout', '');
  L.push(`An 8px scale with a 4px half-step${offGrid.length ? ` (the page currently uses ${offGrid.slice(0, 6).join(', ')}px; snap those)` : ''}. Sections are separated by **${spacing.section}** on desktop, clearly more than any gap inside a section, so grouping reads from space alone. One pair of equal outer margins at every width; large media runs edge to edge. Running text is capped at ${spacing.measure} (about 68 characters).`, '');

  L.push('## Elevation & Depth', '');
  if (has('tell-cluster') || has('distinct-shadow-recipes')) L.push('Flat. Depth is conveyed by a change of ground colour between sections and by scale, not by resting shadows or frosted glass. Shadows, if any, appear only on elements that are actually floating (menus, dialogs).', '');
  else if ((M.tells?.shadows || 0) > 0) L.push(`One elevation scale with at most two levels. Resting content carries none; floating elements carry one.`, '');
  else L.push('Flat. No resting shadows; section grounds and scale do the work.', '');

  L.push('## Shapes', '');
  L.push(Object.keys(rounded).length <= 2 ? `Square corners by default (${rounded.none}).${rounded.full ? ' Fully round only for pills that are genuinely toggles or avatars.' : ''}` : `Two radii, decided once: ${Object.entries(rounded).map(([k, v]) => `${k} ${v}`).join(', ')}. Controls take one, surfaces take one; nothing else.`, '');

  L.push('## Components', '');
  L.push(`- **Primary button:** ${components['button-primary'].backgroundColor} fill, ${components['button-primary'].height} tall, ${components['button-primary'].rounded} corners, label names the outcome ("Start free trial", not "Get started →"). One per screen.`);
  L.push(`- **Secondary action:** a text link in on-surface, underlined on hover; never a second filled button beside the primary.`);
  L.push(`- **Focus:** 2px ${tertiary} outline, 2px offset, on \`:focus-visible\`.`);
  L.push(`- **Tap targets:** 44px minimum on touch; 24px absolute floor.`, '');

  L.push("## Do's and Don'ts", '');
  const seenDo = new Set();
  for (const f of accFindings) { const line = f.suggestion.split('. ')[0].replace(/\.$/, ''); if (seenDo.has(line) || seenDo.size >= 14) continue; seenDo.add(line); L.push(`- Do: ${line}.${notes[f.id] ? ` (${notes[f.id]})` : ''}`); }
  for (const f of vetFindings) L.push(`- Don't ${f.rule.includes('tell-cluster') ? 'strip the devices the owner kept' : 'change'}: ${f.title.toLowerCase()} was reviewed and kept on purpose.${notes[f.id] ? ` (${notes[f.id]})` : ''}`);
  if (!vetFindings.length && !accFindings.length) L.push('- Decide on the review findings first; this section fills from accepted and vetoed items.');
  L.push('- Do keep WCAG 2.2 AA contrast, visible focus, one h1, landmarks, and zoom enabled.');
  L.push("- Don't use purple-to-blue gradients, gradient text, icon-topped card rows, tracked-caps eyebrows, pill badges above headings, or \"→\" on every link.", '');
  return L.join('\n');
}
