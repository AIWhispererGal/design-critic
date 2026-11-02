// pixel diff between two same-size jpegs, via a headless page (no native deps)
import { chromium } from 'playwright';
import fs from 'node:fs';
export async function diffImages(a, b) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const [da, db] = [a, b].map(p => 'data:image/jpeg;base64,' + fs.readFileSync(p).toString('base64'));
    return await page.evaluate(async ([da, db]) => {
      const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
      const [ia, ib] = await Promise.all([load(da), load(db)]);
      const w = Math.min(ia.width, ib.width), h = Math.min(ia.height, ib.height);
      const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
      x.drawImage(ia, 0, 0); const A = x.getImageData(0, 0, w, h).data;
      x.drawImage(ib, 0, 0); const B = x.getImageData(0, 0, w, h).data;
      let changed = 0; for (let i = 0; i < A.length; i += 4) { if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 40) changed++; }
      return { changedPct: +(100 * changed / (w * h)).toFixed(1), w, h };
    }, [da, db]);
  } finally { await browser.close(); }
}

