// Drives the report UI end to end against a running `node cli.mjs serve` (port 4310).
import { chromium } from 'playwright';
const report = process.argv[2] || 'slop';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
p.on('pageerror', e => console.log('PAGEERR', e.message));
await p.goto(`http://localhost:4310/out/${report}/report.html`); await p.waitForTimeout(800);
console.log('title', await p.title());
await p.click('#clear-all');
await p.click('#accept-all-p01');
const p2 = p.locator('li.finding[data-sev="P2"]').first();
await p2.locator('button.veto').click();
await p2.locator('input[data-note]').fill('we like our cards');
await p.waitForTimeout(400);
console.log('count:', await p.textContent('#count'));
await p.click('#gen-prompt');
const prompt = await p.inputValue('#prompt');
console.log('prompt length', prompt.length, '| veto section:', prompt.includes('## Vetoed'), '| note carried:', prompt.includes('we like our cards'), '| preferences section:', prompt.includes("Owner's preferences"));
await p.click('#mock-css');
await p.waitForFunction(() => document.querySelectorAll('#mock .cmp').length >= 2, null, { timeout: 180000 });
console.log('status:', await p.textContent('#status'));
console.log('captions:', await p.$$eval('#mock figcaption', els => els.map(e => e.textContent)));
// drag the slider and check the clip moves
const cmp = p.locator('#mock .cmp').first();
await cmp.locator('input[type=range]').fill('20');
console.log('cut after drag:', await cmp.evaluate(el => el.style.getPropertyValue('--cut')));
await p.locator('#actions').scrollIntoViewIfNeeded();
await p.screenshot({ path: `out/ui-${report}.jpg`, type: 'jpeg', quality: 70 });
console.log('taste summary:', (await p.textContent('#taste-summary')).slice(0, 160));
await b.close();
