import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 2200 } });
await p.goto('http://localhost:4310/out/' + (process.argv[2] || 'slop') + '/report.html'); await p.waitForTimeout(800);
await p.screenshot({ path: process.argv[3] || '/home/user/design-critic/out/report-top.jpg', type: 'jpeg', quality: 70 });
await b.close();
