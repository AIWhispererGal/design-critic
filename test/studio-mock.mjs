// Exercises the studio loop without a key: a fake student returns the slop fixture, then a cleaner page.
import fs from 'node:fs';
import path from 'node:path';
import { studio, critLog } from '../src/studio.mjs';
const slop = fs.readFileSync('fixtures/slop.html', 'utf8');
const clean = slop.replace(/linear-gradient\([^)]*\)/g, '#1f4e5f').replace(/Inter/g, 'Georgia').replace('user-scalable=no', '').replace('maximum-scale=1, ', '').replace('<html>', '<html lang="en">').replace(/\.icon \{[^}]*\}/, '.icon{display:none}');
let call = 0;
const fake = { messages: { stream() {
  const n = call++;
  const html = (n === 0 ? slop : clean).replace('<!doctype html>', `<!-- intent: round ${n}: ${n === 0 ? 'the stock dark SaaS launch' : 'drop the gradients, serif display, keep the structure'} -->\n<!doctype html>`) + (n > 0 ? '\n<!-- reflection: next I would add real pictures of the product -->' : '');
  const chunks = html.match(/[\s\S]{1,4000}/g);
  const it = (async function* () { for (const t of chunks) yield { type: 'content_block_delta', delta: { type: 'text_delta', text: t } }; })();
  it.finalMessage = async () => ({ stop_reason: 'end_turn' });
  return it;
} } };
const r = await studio('a collaboration tool for small teams', { rounds: 3, minGain: 0.2, _client: fake, log: m => console.log('  ' + m) });
console.log('rounds:', r.state.rounds.map(x => `${x.r}:${x.overall}`).join(' '), '| stopped:', r.state.stoppedBecause);
console.log('intents:', r.state.rounds.map(x => x.intent.slice(0, 40)));
console.log('reflection r1:', r.state.rounds[1].reflection);
console.log('files:', fs.readdirSync(path.dirname(r.base)).filter(f => f.startsWith(path.basename(r.base))).join(', '));
console.log('auto-decisions separate from decisions:', fs.existsSync(path.join(r.base + '-r0', 'auto-decisions.json')), !fs.existsSync(path.join(r.base + '-r0', 'decisions.json')));
console.log(critLog(r.state).split('\n').slice(0, 9).join('\n'));
