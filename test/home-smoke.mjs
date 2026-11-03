// Drives the home page: list, analyse form wiring, scoped mockup, delete. Needs `node cli.mjs serve`.
import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 1600 } });
p.on('pageerror', e => console.log('PAGEERR', e.message));
await p.goto('http://localhost:4310/'); await p.waitForTimeout(500);
console.log('title', await p.title(), '| reports listed:', await p.$$eval('li.report-row', e => e.length));
await p.screenshot({ path: 'out/ui-home.jpg', type: 'jpeg', quality: 70 });
// scoped report: mockup of the element only
await p.goto('http://localhost:4310/out/slop-features/report.html'); await p.waitForTimeout(500);
console.log('scoped unscored rows:', await p.$$eval('li.score em', els => els.filter(e => /not scored|page-level/.test(e.textContent)).length));
await p.click('#clear-all'); await p.click('#accept-all'); await p.click('#mock-css');
await p.waitForFunction(() => document.querySelectorAll('#mock .cmp').length >= 2, null, { timeout: 180000 });
console.log('scoped mock captions:', await p.$$eval('#mock figcaption', els => els.map(e => e.textContent)));
await p.locator('#actions').scrollIntoViewIfNeeded();
await p.screenshot({ path: 'out/ui-scoped.jpg', type: 'jpeg', quality: 70 });
await b.close();
