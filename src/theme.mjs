// theme.mjs — the one stylesheet shared by the report and the home page.
// Rules for this UI: left-anchored, one serif display face + system sans, white ground, one accent,
// no cards, no icons, no gradients. If the tool's own pages showed the tells it measures, nobody should trust it.
export const BASE_CSS = `
:root{--ink:#161616;--ink-2:#4a4a4a;--paper:#ffffff;--line:#e4e4e4;--accent:#1f4e5f;--accept:#1d6b3a;--veto:#9b2c2c;--p0:#9b2c2c;--p1:#b4531a;--p2:#6b6b6b;--p3:#9a9a9a}
*{box-sizing:border-box}
html{color-scheme:light}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
h1,h2,h3{font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;font-weight:600;letter-spacing:-.01em;line-height:1.1;margin:0}
h1{font-size:clamp(2rem,5vw,4rem)}
h2{font-size:1.75rem;margin:0 0 1rem}
h3{font-size:1.15rem;margin:.25rem 0 .5rem}
a{color:var(--accent)}
.wrap{max-width:1120px;margin:0 auto;padding:0 24px}
header.top{padding:56px 0 32px;border-bottom:1px solid var(--line)}
header.top .url{color:var(--ink-2);word-break:break-all}
.overall{display:flex;align-items:baseline;gap:16px;margin-top:24px}
.overall b{font-family:"Iowan Old Style",Palatino,Georgia,serif;font-size:clamp(3rem,8vw,6rem);line-height:1}
.overall span{color:var(--ink-2);max-width:40ch}
section{padding:40px 0;border-bottom:1px solid var(--line)}
.lede{font-size:1.25rem;max-width:60ch}
.muted{color:var(--ink-2);max-width:70ch}
ul.scores{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr;gap:8px;max-width:760px}
li.score{display:grid;grid-template-columns:minmax(180px,1fr) 2fr 3ch;align-items:center;gap:16px}
li.score em{font-style:normal;color:var(--ink-2);font-size:.8rem;margin-left:6px}
.bar{height:10px;background:var(--line);position:relative}
.bar i{position:absolute;left:0;top:0;bottom:0;background:var(--accent)}
li.score b{text-align:right;font-variant-numeric:tabular-nums}
.shots{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:24px}
figure{margin:0}figure img{width:100%;height:auto;border:1px solid var(--line);display:block}
figcaption{font-size:.85rem;color:var(--ink-2);margin-top:6px}
.toolbar{display:flex;flex-wrap:wrap;gap:12px;align-items:center;position:sticky;top:0;background:var(--paper);padding:12px 0;border-bottom:1px solid var(--line);z-index:5}
.toolbar .count{color:var(--ink-2);margin-left:auto;font-variant-numeric:tabular-nums}
button{font:inherit;cursor:pointer;border:1px solid var(--ink);background:var(--paper);color:var(--ink);padding:8px 14px;border-radius:0}
button:hover{background:#f2f2f2}
button.primary{background:var(--ink);color:#fff}
button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
select{font:inherit;padding:8px}
ol.findings{list-style:none;margin:0;padding:0}
li.finding{padding:24px 0;border-bottom:1px solid var(--line)}
li.finding[data-state="accept"]{border-left:4px solid var(--accept);padding-left:16px}
li.finding[data-state="veto"]{border-left:4px solid var(--veto);padding-left:16px;opacity:.6}
.f-head{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;font-size:.85rem}
.sev{font-weight:600}.sev-P0{color:var(--p0)}.sev-P1{color:var(--p1)}.sev-P2{color:var(--p2)}.sev-P3{color:var(--p3)}
.param,.tag{color:var(--ink-2)}
.decide{margin-left:auto;display:flex;gap:6px}
.decide button{padding:4px 10px;font-size:.85rem}
button.accept{border-color:var(--accept);color:var(--accept)}button.veto{border-color:var(--veto);color:var(--veto)}button.undo{border-color:var(--line);color:var(--ink-2)}
[data-state="accept"] button.accept,[data-state="veto"] button.veto{background:currentColor}
[data-state="accept"] button.accept{color:#fff;background:var(--accept)}[data-state="veto"] button.veto{color:#fff;background:var(--veto)}
dl{display:grid;grid-template-columns:7ch 1fr;gap:6px 16px;margin:0;max-width:85ch}
dt{color:var(--ink-2);font-size:.85rem;padding-top:2px}dd{margin:0}
.pre{white-space:pre-wrap}.src{font-size:.85rem;color:var(--ink-2)}
pre{background:#f6f6f6;padding:12px;overflow:auto;font-size:.8rem;max-width:85ch}
label.note{display:block;margin-top:12px;font-size:.85rem;color:var(--ink-2)}
label.note input{display:block;width:100%;max-width:85ch;font:inherit;padding:8px;border:1px solid var(--line);margin-top:4px}
textarea#prompt{width:100%;min-height:360px;font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;padding:12px;border:1px solid var(--line)}
.mock{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:24px;margin-top:16px}
.status{color:var(--ink-2);font-size:.9rem;min-height:1.4em}
.hidden{display:none}
.tag.usual-accepted{color:var(--accept)}.tag.usual-vetoed{color:var(--veto)}
.cmp{position:relative;overflow:hidden;border:1px solid var(--line);user-select:none}
.cmp img{display:block;width:100%;height:auto}
.cmp .after{position:absolute;inset:0;width:100%}
.cmp .before{position:absolute;inset:0;width:100%;clip-path:inset(0 var(--cut,50%) 0 0)}
.cmp .handle{position:absolute;top:0;bottom:0;left:50%;width:2px;background:var(--ink);pointer-events:none}
.cmp .handle::after{content:'◂ ▸';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--ink);color:#fff;font-size:11px;padding:4px 6px;white-space:nowrap}
.cmp input[type=range]{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:ew-resize}
.cmp .lbl{position:absolute;top:8px;font-size:11px;background:rgba(255,255,255,.85);color:var(--ink);padding:2px 6px;pointer-events:none}
.cmp .lbl.l{left:8px}.cmp .lbl.r{right:8px}
.mock-note{grid-column:1/-1}
.mock-note ul{margin:.25rem 0 0;padding-left:1.2rem}
@media (max-width:600px){li.score{grid-template-columns:1fr 3ch;}li.score .bar{grid-column:1/-1}dl{grid-template-columns:1fr}.decide{margin-left:0;width:100%}}
`;
