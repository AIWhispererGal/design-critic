// taste.mjs — learn from accept/veto decisions across reports.
// Level 1 (deterministic): per-rule and per-parameter accept rates, and which page/finding features
//   shift the accept rate away from the owner's base rate ("lifts").
// Level 2 (optional, LLM): hypotheses in plain language about what the yes/nos are capturing,
//   which the owner confirms or rejects, so the model only ever acts on confirmed ones.
import fs from 'node:fs';
import path from 'node:path';

const PROFILE = 'taste-profile.json';
const r2 = v => Math.round(v * 100) / 100;

function pageFeatures(ev) {
  const o = ev.observed || {};
  const l = (() => { const h = (o.ground || '#ffffff').replace('#', ''); if (h.length < 6) return 1; return (parseInt(h.slice(0, 2), 16) * 0.2126 + parseInt(h.slice(2, 4), 16) * 0.7152 + parseInt(h.slice(4, 6), 16) * 0.0722) / 255; })();
  return {
    'page:dark': l < 0.25, 'page:light': l >= 0.25,
    'page:has-accent': (o.accents || []).length > 0,
    'page:ai-font': /inter|dm sans|space grotesk|plus jakarta|manrope|poppins/i.test(o.typeface || ''),
    'page:score<6': ev.overall < 6, 'page:score>=8': ev.overall >= 8,
  };
}

export function collectObservations(outRoot) {
  const obs = [];
  if (!fs.existsSync(outRoot)) return obs;
  for (const d of fs.readdirSync(outRoot)) {
    const dir = path.join(outRoot, d);
    const ep = path.join(dir, 'evaluation.json'), dp = path.join(dir, 'decisions.json');
    if (!fs.existsSync(ep) || !fs.existsSync(dp)) continue;
    let ev, dec; try { ev = JSON.parse(fs.readFileSync(ep, 'utf8')); dec = JSON.parse(fs.readFileSync(dp, 'utf8')); } catch { continue; }
    const pf = pageFeatures(ev);
    for (const f of ev.findings) {
      const decision = dec.accepted?.includes(f.id) ? 'accept' : dec.vetoed?.includes(f.id) ? 'veto' : null;
      if (!decision) continue;
      obs.push({ report: d, url: ev.summary?.url, id: f.id, rule: f.rule || `${f.param}.${f.title}`, param: f.param, severity: f.severity, title: f.title, decision, note: dec.notes?.[f.id] || '', features: { ...pf, [`sev:${f.severity}`]: true, 'finding:has-css-patch': !!f.cssPatch, 'finding:from-juror': !!f.fromJudge, 'finding:taste-call': !!f.taste, 'finding:phone-only': Array.isArray(f.viewports) && f.viewports[0] === 'phone', [`param:${f.param}`]: true } });
    }
  }
  return obs;
}

export function buildProfile(outRoot, { previous } = {}) {
  const obs = collectObservations(outRoot);
  const n = obs.length, accepts = obs.filter(o => o.decision === 'accept').length;
  const base = n ? accepts / n : 0.5;
  const group = key => {
    const g = {};
    for (const o of obs) { const k = key(o); (g[k] ||= { n: 0, accepts: 0, vetoes: 0, titles: new Set(), notes: [] }); g[k].n++; g[k][o.decision === 'accept' ? 'accepts' : 'vetoes']++; g[k].titles.add(o.title); if (o.note) g[k].notes.push(o.note); }
    return Object.fromEntries(Object.entries(g).map(([k, v]) => [k, { n: v.n, accepts: v.accepts, vetoes: v.vetoes, rate: r2((v.accepts + 1) / (v.n + 2)), titles: [...v.titles].slice(0, 3), notes: v.notes.slice(0, 5) }]));
  };
  const rules = group(o => o.rule), params = group(o => o.param);
  // feature lifts: accept rate when feature present vs base rate
  const feats = {};
  for (const o of obs) for (const [f, on] of Object.entries(o.features)) { if (!on) continue; (feats[f] ||= { n: 0, accepts: 0 }); feats[f].n++; if (o.decision === 'accept') feats[f].accepts++; }
  const lifts = Object.entries(feats).map(([f, v]) => ({ feature: f, n: v.n, rate: r2(v.accepts / v.n), lift: r2(v.accepts / v.n - base) })).filter(x => x.n >= 3 && Math.abs(x.lift) >= 0.15).sort((a, b) => Math.abs(b.lift) - Math.abs(a.lift));
  const usual = {};
  for (const [rule, v] of Object.entries(rules)) { if (v.n >= 2 && v.rate >= 0.75) usual[rule] = 'accepted'; else if (v.n >= 2 && v.rate <= 0.25) usual[rule] = 'vetoed'; }
  const profile = { builtAt: new Date().toISOString(), observations: n, reports: [...new Set(obs.map(o => o.report))].length, baseAcceptRate: r2(base), rules, params, lifts, usual, hypotheses: previous?.hypotheses || [], notes: obs.filter(o => o.note).map(o => ({ rule: o.rule, decision: o.decision, note: o.note })).slice(-40) };
  return profile;
}

export function loadProfile(outRoot) {
  const p = path.join(outRoot, PROFILE);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

export function saveProfile(outRoot, profile) {
  fs.mkdirSync(outRoot, { recursive: true });
  fs.writeFileSync(path.join(outRoot, PROFILE), JSON.stringify(profile, null, 1));
  return path.join(outRoot, PROFILE);
}

export function refreshProfile(outRoot) {
  const prev = loadProfile(outRoot);
  const p = buildProfile(outRoot, { previous: prev });
  saveProfile(outRoot, p);
  return p;
}

/** Plain-language summary used in the report, the prompt and the juror brief. */
export function describeProfile(profile, { max = 12 } = {}) {
  if (!profile || !profile.observations) return '';
  const L = [];
  L.push(`Learned from ${profile.observations} decisions on ${profile.reports} report(s); base accept rate ${Math.round(profile.baseAcceptRate * 100)}%.`);
  const acc = Object.entries(profile.rules).filter(([r]) => profile.usual[r] === 'accepted').sort((a, b) => b[1].n - a[1].n).slice(0, max);
  const vet = Object.entries(profile.rules).filter(([r]) => profile.usual[r] === 'vetoed').sort((a, b) => b[1].n - a[1].n).slice(0, max);
  if (acc.length) L.push('Usually accepts: ' + acc.map(([r, v]) => `${v.titles[0]} (${v.accepts}/${v.n})`).join('; ') + '.');
  if (vet.length) L.push('Usually vetoes: ' + vet.map(([r, v]) => `${v.titles[0]} (${v.vetoes}/${v.n})${v.notes[0] ? ` — "${v.notes[0]}"` : ''}`).join('; ') + '.');
  if (profile.lifts.length) L.push('Patterns: ' + profile.lifts.slice(0, 6).map(l => `${l.feature} → ${Math.round(l.rate * 100)}% accept (${l.lift > 0 ? '+' : ''}${Math.round(l.lift * 100)} pts, n=${l.n})`).join('; ') + '.');
  const confirmed = (profile.hypotheses || []).filter(h => h.status === 'confirmed');
  if (confirmed.length) L.push('Confirmed preferences: ' + confirmed.map(h => h.statement).join(' / '));
  return L.join('\n');
}

/** Ask Claude what the decisions might be capturing. Returns proposed hypotheses for the owner to confirm. */
export async function explainProfile(outRoot, { log = () => {} } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
  const profile = refreshProfile(outRoot);
  const obs = collectObservations(outRoot);
  if (obs.length < 5) throw new Error(`Only ${obs.length} decisions so far; make at least 5 before asking for hypotheses.`);
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();
  const model = process.env.DC_MODEL || 'claude-opus-5-5';
  const prompt = `You are helping a design-tool owner understand their own taste. Below are their accept/veto decisions on design suggestions across several websites, with the measured features of each page and finding, plus their free-text notes.

Your job: propose 3–8 hypotheses, in plain language, about what their yes/nos are capturing. Each hypothesis must be a discernible, checkable feature of a page or a suggestion (not "they have good taste"). Examples of the right shape: "Vetoes any suggestion that removes boxes/cards on dark-ground pages", "Accepts every accessibility finding regardless of severity", "Rejects typeface swaps but accepts type-scale changes", "Cares about phone more than desktop". Say what evidence supports each, and name a decision that would contradict it if it were wrong. Mark confidence low/medium/high. Prefer fewer, sharper hypotheses.

Return ONLY JSON: {"hypotheses":[{"statement":"...","evidence":"...","would_be_wrong_if":"...","confidence":"low|medium|high","rules_involved":["rule.id"]}]}

## Aggregates
${JSON.stringify({ base: profile.baseAcceptRate, rules: profile.rules, lifts: profile.lifts }, null, 1)}

## Decisions (${obs.length})
${obs.map(o => `- ${o.decision.toUpperCase()} [${o.severity}] ${o.rule} on ${o.url} | features: ${Object.entries(o.features).filter(([, v]) => v).map(([k]) => k).join(', ')}${o.note ? ` | note: "${o.note}"` : ''}`).join('\n').slice(0, 60000)}`;
  log(`taste: asking ${model} for hypotheses from ${obs.length} decisions`);
  const resp = await client.messages.create({ model, max_tokens: 3000, messages: [{ role: 'user', content: prompt }] });
  const text = resp.content.filter(c => c.type === 'text').map(c => c.text).join('');
  const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  const existing = profile.hypotheses || [];
  const nextId = existing.reduce((a, h) => Math.max(a, h.id || 0), 0) + 1;
  const proposed = (parsed.hypotheses || []).map((h, i) => ({ id: nextId + i, status: 'proposed', proposedAt: new Date().toISOString(), model, ...h }));
  profile.hypotheses = [...existing.filter(h => h.status !== 'proposed'), ...proposed];
  saveProfile(outRoot, profile);
  return profile;
}

export function setHypothesis(outRoot, id, status) {
  const profile = loadProfile(outRoot); if (!profile) throw new Error('no profile yet');
  const h = (profile.hypotheses || []).find(h => h.id === +id); if (!h) throw new Error('no hypothesis ' + id);
  h.status = status; h.decidedAt = new Date().toISOString();
  saveProfile(outRoot, profile);
  return h;
}
