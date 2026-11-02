// capture.mjs — load a page at several viewports, screenshot it, and measure it.
// Everything downstream (rules, judge, report) works from the JSON this produces.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const AXE_SRC = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

export const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844, mobile: true },
  { name: 'tablet', width: 768, height: 1024, mobile: true },
  { name: 'laptop', width: 1440, height: 900, mobile: false },
  { name: 'desktop', width: 1920, height: 1080, mobile: false },
];

export function toUrl(target) {
  if (/^https?:\/\//i.test(target)) return target;
  const abs = path.resolve(target);
  if (!fs.existsSync(abs)) throw new Error(`Not a URL and file not found: ${target}`);
  return pathToFileURL(abs).href;
}

/** Runs inside the page. Must be self-contained (no imports). */
function collectMetrics(opts) {
  const { mobile } = opts;
  const vw = window.innerWidth, vh = window.innerHeight;
  const doc = document.documentElement;
  const docHeight = Math.max(doc.scrollHeight, document.body ? document.body.scrollHeight : 0);
  const tally = (obj, k, n = 1) => { k = String(k); obj[k] = (obj[k] || 0) + n; };
  const px = v => parseFloat(v) || 0;
  // short, reasonably specific CSS path for mockup targeting
  function sel(el, depth = 3) {
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.body && parts.length < depth) {
      let s = node.tagName.toLowerCase();
      if (node.id && /^[A-Za-z][\w-]*$/.test(node.id)) { parts.unshift('#' + node.id); break; }
      const cls = Array.from(node.classList).filter(c => /^[A-Za-z_][\w-]*$/.test(c) && c.length < 40).slice(0, 2);
      if (cls.length) s += '.' + cls.join('.');
      else { const sib = Array.from(node.parentElement?.children || []).filter(c => c.tagName === node.tagName); if (sib.length > 1) s += `:nth-of-type(${sib.indexOf(node) + 1})`; }
      parts.unshift(s);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }
  const selectors = { gradients: [], gradientText: [], shadows: [], pills: [], eyebrows: [], cardRows: [], iconTiles: [], blurs: [], trackedCaps: [], indexNumbering: [], tinyText: [], contrastFails: [], h1: null, buttons: [], smallTargets: [], overflow: [] };
  const addSel = (k, el) => { if (selectors[k].length < 25) { const s = sel(el); if (!selectors[k].includes(s)) selectors[k].push(s); } };

  // ---------- colour helpers ----------
  function parseColor(c) {
    if (!c) return null;
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  const lum = ({ r, g, b }) => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contrast = (a, b) => { const la = lum(a) + 0.05, lb = lum(b) + 0.05; return la > lb ? la / lb : lb / la; };
  const hex = ({ r, g, b }) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  function hsl({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h, s, l };
  }
  const blend = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  function effectiveBg(el) {
    let node = el, hasImage = false;
    const layers = [];
    while (node && node.nodeType === 1) {
      const cs = getComputedStyle(node);
      const bg = parseColor(cs.backgroundColor);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') hasImage = true;
      if (bg && bg.a > 0) { layers.push(bg); if (bg.a >= 1) break; }
      node = node.parentElement;
    }
    let out = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) out = blend(layers[i], out);
    return { color: out, hasImage };
  }
  const gradientHues = s => {
    const hues = [];
    const re = /rgba?\([^)]+\)|#[0-9a-f]{3,8}/gi; let m;
    while ((m = re.exec(s))) {
      const c = parseColor(m[0]) || hexToRgb(m[0]);
      if (c) hues.push(hsl(c));
    }
    return hues;
  };
  function hexToRgb(h) {
    h = h.replace('#', '');
    if (h.length === 3 || h.length === 4) h = h.split('').map(x => x + x).join('');
    if (h.length < 6) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
  }

  // ---------- gather elements ----------
  const all = Array.from(document.body.querySelectorAll('*')).slice(0, 8000);
  const visible = [];
  for (const el of all) {
    const tag = el.tagName.toLowerCase();
    if (['script', 'style', 'noscript', 'template', 'svg', 'path', 'g', 'defs', 'use', 'symbol', 'clipPath', 'linearGradient', 'stop', 'head', 'meta', 'link'].includes(tag)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || px(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    visible.push({ el, cs, r: { x: r.left, y: r.top + window.scrollY, w: r.width, h: r.height, right: r.right, bottom: r.bottom + window.scrollY } });
  }

  // ---------- text nodes ----------
  const fonts = {}, fontSizes = {}, weights = {}, textColors = {}, bgColors = {};
  const paragraphs = [], headings = [], contrastFails = [], textBlocks = [];
  let totalChars = 0, tinyChars = 0, emoji = 0, trackedCaps = 0, indexNumbering = 0, middleDots = 0, arrowLinks = 0, loremIpsum = 0;
  const buzz = /(unlock|seamless|elevate|supercharge|empower|revolutioni[sz]e|next[- ]gen|cutting[- ]edge|effortless|game[- ]chang|build the future|all[- ]in[- ]one|10x|limitless|unleash|frictionless)/i;
  let buzzwords = 0;
  const emojiRe = /\p{Extended_Pictographic}/gu;
  const textEls = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const t = n.nodeValue.replace(/\s+/g, ' ').trim();
    if (!t) continue;
    const el = n.parentElement;
    if (!el || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const chars = t.length;
    totalChars += chars;
    const size = px(cs.fontSize);
    const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    tally(fonts, fam, chars);
    tally(fontSizes, Math.round(size), chars);
    tally(weights, cs.fontWeight, chars);
    if (size < 13) tinyChars += chars;
    const em = t.match(emojiRe); if (em) emoji += em.length;
    if (/^0\d$/.test(t) || /^\(?0\d\)?[./]?$/.test(t)) indexNumbering++;
    if (/ · /.test(t)) middleDots++;
    if (/lorem ipsum/i.test(t)) loremIpsum++;
    if (buzz.test(t)) buzzwords++;
    const upper = cs.textTransform === 'uppercase' || (t.length > 3 && t === t.toUpperCase() && /[A-Z]/.test(t));
    if (upper && size <= 14 && px(cs.letterSpacing) > 0) { trackedCaps++; addSel('trackedCaps', el); }
    if (size < 13) addSel('tinyText', el);
    if (/^0\d$/.test(t)) addSel('indexNumbering', el);
    const fg = parseColor(cs.color);
    const { color: bg, hasImage } = effectiveBg(el);
    if (fg) {
      const fgb = fg.a < 1 ? blend(fg, bg) : fg;
      tally(textColors, hex(fgb), chars);
      if (!hasImage) {
        const cr = contrast(fgb, bg);
        const large = size >= 24 || (size >= 18.66 && px(cs.fontWeight) >= 700);
        if (cr < (large ? 3 : 4.5)) { contrastFails.push({ text: t.slice(0, 60), ratio: +cr.toFixed(2), size, fg: hex(fgb), bg: hex(bg), sel: sel(el) }); addSel('contrastFails', el); }
      }
    }
    textEls.push({ el, cs, t, size, r });
  }
  // de-dupe elements for paragraph/heading measurement
  const seen = new Set();
  for (const { el, cs, t, size, r } of textEls) {
    if (seen.has(el)) continue; seen.add(el);
    const tag = el.tagName.toLowerCase();
    const full = (el.innerText || t).replace(/\s+/g, ' ').trim();
    const lh = px(cs.lineHeight) || size * 1.2;
    const lines = Math.max(1, Math.round(r.height / lh));
    if (/^h[1-6]$/.test(tag)) {
      headings.push({ tag, text: full.slice(0, 120), size, lines, align: cs.textAlign, letterSpacing: px(cs.letterSpacing), uppercase: cs.textTransform === 'uppercase', y: r.top + window.scrollY, weight: cs.fontWeight, family: cs.fontFamily.split(',')[0].replace(/["']/g, ''), gradientText: cs.webkitBackgroundClip === 'text' || cs.backgroundClip === 'text' });
    }
    if (full.length >= 80 && lines >= 2 && !/^h[1-6]$/.test(tag)) {
      // approximate characters per line
      const cpl = Math.round(full.length / lines);
      paragraphs.push({ chars: full.length, lines, cpl, size, lineHeight: +(lh / size).toFixed(2), align: cs.textAlign, color: cs.color, width: Math.round(r.width) });
    }
    if (['a', 'button'].includes(tag) && /→|->|›|»/.test(full.slice(-3))) arrowLinks++;
  }

  // ---------- heading above-label (eyebrow) & pill badges ----------
  let eyebrows = 0, pills = 0;
  for (const h of headings) {
    const near = textEls.find(x => x.size <= 14 && Math.abs((x.r.top + window.scrollY) + x.r.height - h.y) < 40 && x.t.length < 40 && x.el.tagName !== 'A');
    if (near) { eyebrows++; addSel('eyebrows', near.el); }
  }
  // ---------- boxes: radius, shadow, gradient, blur ----------
  const radii = {}, shadows = [], gradients = [], blurs = [], spacing = {};
  let purpleGradient = false, gradientText = 0, transitionAll = 0, animated = 0;
  const sectionBgs = new Set();
  const boxes = [];
  for (const { el, cs, r } of visible) {
    const tag = el.tagName.toLowerCase();
    if (r.w >= 40 && r.h >= 24) {
      const br = cs.borderTopLeftRadius;
      const bgc = parseColor(cs.backgroundColor);
      const hasBg = (bgc && bgc.a > 0) || cs.backgroundImage !== 'none' || cs.borderTopWidth !== '0px' || cs.boxShadow !== 'none';
      if (hasBg) { tally(radii, br); boxes.push({ el, cs, r, tag }); }
      if (bgc && bgc.a > 0) tally(bgColors, hex(bgc), Math.round(r.w * r.h / 1000));
    }
    if (cs.boxShadow && cs.boxShadow !== 'none' && r.w > 40) { shadows.push(cs.boxShadow.slice(0, 80)); addSel('shadows', el); }
    if (cs.backgroundImage && /gradient/.test(cs.backgroundImage)) {
      const hues = gradientHues(cs.backgroundImage);
      const isScrim = hues.length && hues.every(h => h.s < 0.12);
      if (!isScrim) {
        gradients.push({ tag, w: Math.round(r.w), h: Math.round(r.h), hues: hues.map(h => Math.round(h.h)), sel: sel(el) }); addSel('gradients', el);
        if (hues.some(h => h.h >= 240 && h.h <= 300 && h.s > 0.35)) purpleGradient = true;
        if (cs.webkitBackgroundClip === 'text' || cs.backgroundClip === 'text') { gradientText++; addSel('gradientText', el); }
      }
    }
    const bf = cs.backdropFilter || cs.webkitBackdropFilter;
    if (bf && bf !== 'none') { blurs.push(bf); addSel('blurs', el); }
    if (/\ball\b/.test(cs.transitionProperty) && px(cs.transitionDuration) > 0) transitionAll++;
    if (cs.animationName && cs.animationName !== 'none') animated++;
    for (const p of ['paddingTop', 'paddingBottom', 'marginTop', 'marginBottom', 'gap']) { const v = Math.round(px(cs[p])); if (v > 0) tally(spacing, v); }
    if (['section', 'header', 'footer', 'main', 'article'].includes(tag) || (el.parentElement === document.body && r.h > vh * 0.3)) {
      const b = parseColor(cs.backgroundColor); if (b && b.a > 0) sectionBgs.add(hex(b));
    }
    if (r.h <= 40 && r.w <= 240 && r.w > 30 && (/9999|999px|50%|100px/.test(cs.borderTopLeftRadius) || px(cs.borderTopLeftRadius) >= r.h / 2) && (parseColor(cs.backgroundColor)?.a > 0 || cs.borderTopWidth !== '0px') && el.innerText && el.innerText.trim().length < 40 && el.innerText.trim().length > 0 && tag !== 'button' && tag !== 'a') { pills++; addSel('pills', el); }
  }
  // pill-shaped label above a heading
  let pillAboveHeading = 0;
  for (const h of headings) {
    for (const { el, cs, r } of visible) {
      if (r.h <= 40 && r.w <= 260 && px(cs.borderTopLeftRadius) >= r.h / 2 && Math.abs(r.bottom - h.y) < 48 && el.innerText && el.innerText.trim().length < 40) { pillAboveHeading++; break; }
    }
  }

  // ---------- card rows & icon tiles ----------
  let cardRows = 0, iconTiles = 0, cardRowDetails = [];
  const parentsChecked = new Set();
  for (const { el } of visible) {
    const p = el.parentElement; if (!p || parentsChecked.has(p)) continue; parentsChecked.add(p);
    const kids = Array.from(p.children).filter(k => { const r = k.getBoundingClientRect(); return r.width > 120 && r.height > 80; });
    if (kids.length < 3) continue;
    const r0 = kids[0].getBoundingClientRect();
    const same = kids.filter(k => { const r = k.getBoundingClientRect(); return Math.abs(r.width - r0.width) < 4 && Math.abs(r.height - r0.height) < Math.max(12, r0.height * 0.15); });
    if (same.length >= 3 && same.length === kids.length) {
      const cs0 = getComputedStyle(kids[0]);
      const boxed = (parseColor(cs0.backgroundColor)?.a > 0) || cs0.borderTopWidth !== '0px' || cs0.boxShadow !== 'none';
      if (!boxed) continue;
      const withIcon = same.filter(k => { const ic = k.querySelector('svg, img, i, [class*="icon"]'); if (!ic) return false; const ir = ic.getBoundingClientRect(); const kr = k.getBoundingClientRect(); return ir.width <= 80 && ir.height <= 80 && ir.top - kr.top < kr.height * 0.4 && k.querySelector('h1,h2,h3,h4,h5,h6,strong'); }).length;
      cardRows++;
      cardRowDetails.push({ count: same.length, withIcon, radius: cs0.borderTopLeftRadius, shadow: cs0.boxShadow !== 'none', sel: sel(p) });
      addSel('cardRows', p);
      if (withIcon >= 3) { iconTiles++; const ic = kids[0].querySelector('svg, img, i, [class*="icon"]'); if (ic) addSel('iconTiles', ic.parentElement === kids[0] ? ic : ic.parentElement); }
    }
  }

  // ---------- hero / first viewport ----------
  const h1 = document.querySelector('h1');
  let hero = null;
  const firstScreen = visible.filter(v => v.r.y < vh);
  const mediaArea = firstScreen.filter(v => ['img', 'video', 'canvas', 'picture'].includes(v.el.tagName.toLowerCase()) || (v.cs.backgroundImage && /url\(/.test(v.cs.backgroundImage)))
    .reduce((a, v) => a + Math.min(v.r.w, vw) * Math.min(v.r.h, vh - Math.max(0, v.r.y)), 0);
  const buttonsLike = visible.filter(v => {
    const tag = v.el.tagName.toLowerCase();
    if (!(tag === 'button' || (tag === 'a' && (parseColor(v.cs.backgroundColor)?.a > 0 || v.cs.borderTopWidth !== '0px')) || v.el.getAttribute('role') === 'button')) return false;
    return v.r.w >= 40 && v.r.h >= 24 && (v.el.innerText || '').trim().length > 0;
  }).map(v => ({ sel: sel(v.el), inNav: !!v.el.closest('nav, header, [role=navigation]'), text: (v.el.innerText || '').trim().slice(0, 40), x: Math.round(v.r.x), y: Math.round(v.r.y), w: Math.round(v.r.w), h: Math.round(v.r.h), bg: v.cs.backgroundColor, color: v.cs.color, radius: v.cs.borderTopLeftRadius }));
  const aboveFoldButtons = buttonsLike.filter(b => b.y < vh);
  if (h1) {
    selectors.h1 = sel(h1);
    const cs = getComputedStyle(h1), r = h1.getBoundingClientRect();
    const centred = cs.textAlign === 'center' || (Math.abs((r.left + r.width / 2) - vw / 2) < 24 && r.width < vw * 0.7 && r.left > vw * 0.12);
    const words = (h1.innerText || '').trim().split(/\s+/).length;
    const lh = px(cs.lineHeight) || px(cs.fontSize) * 1.2;
    hero = { text: (h1.innerText || '').trim().slice(0, 160), words, size: px(cs.fontSize), sizeVw: +(px(cs.fontSize) / vw * 100).toFixed(2), lines: Math.max(1, Math.round(r.height / lh)), centred, y: Math.round(r.top + window.scrollY), buttonsBelow: aboveFoldButtons.filter(b => b.y > r.top + window.scrollY).length, weight: cs.fontWeight, family: cs.fontFamily.split(',')[0].replace(/["']/g, '') };
  }
  const firstScreenImgs = firstScreen.filter(v => v.el.tagName === 'IMG').length;

  // ---------- navigation ----------
  const navEl = document.querySelector('nav, header nav, [role="navigation"], header');
  let nav = { exists: false };
  if (navEl) {
    const cs = getComputedStyle(navEl);
    nav = { exists: true, links: navEl.querySelectorAll('a').length, sticky: ['fixed', 'sticky'].includes(cs.position), height: Math.round(navEl.getBoundingClientRect().height) };
  }

  // ---------- images ----------
  const imgs = Array.from(document.images);
  const images = {
    count: imgs.length,
    visibleCount: imgs.filter(i => { const r = i.getBoundingClientRect(); return r.width > 30 && r.height > 30; }).length,
    missingAlt: imgs.filter(i => !i.hasAttribute('alt')).length,
    missingDims: imgs.filter(i => !i.getAttribute('width') || !i.getAttribute('height')).length,
    lazyBelowFold: imgs.filter(i => i.getBoundingClientRect().top > vh && i.loading === 'lazy').length,
    belowFold: imgs.filter(i => i.getBoundingClientRect().top > vh).length,
    videos: document.querySelectorAll('video').length,
    canvases: document.querySelectorAll('canvas').length,
    svgIllustrations: Array.from(document.querySelectorAll('svg')).filter(s => { const r = s.getBoundingClientRect(); return r.width > 120 && r.height > 120; }).length,
    aspectRatios: imgs.slice(0, 60).map(i => { const r = i.getBoundingClientRect(); return r.height ? +(r.width / r.height).toFixed(2) : 0; }).filter(Boolean),
  };

  // ---------- interactive / accessibility hygiene ----------
  const interactive = visible.filter(v => ['a', 'button', 'input', 'select', 'textarea'].includes(v.el.tagName.toLowerCase()) || v.el.getAttribute('role') === 'button' || v.el.hasAttribute('onclick'));
  const smallTargetEls = interactive.filter(v => v.r.w < 44 || v.r.h < 44);
  const smallTargets = smallTargetEls.length; smallTargetEls.slice(0, 10).forEach(v => addSel('smallTargets', v.el));
  const tinyTargets = interactive.filter(v => v.r.w < 24 || v.r.h < 24).length;
  const iconButtonsNoName = interactive.filter(v => ['a', 'button'].includes(v.el.tagName.toLowerCase()) && !(v.el.innerText || '').trim() && !v.el.getAttribute('aria-label') && !v.el.getAttribute('aria-labelledby') && !v.el.getAttribute('title') && !v.el.querySelector('img[alt]:not([alt=""])')).length;
  const divClick = all.filter(el => ['DIV', 'SPAN'].includes(el.tagName) && (el.hasAttribute('onclick') || el.getAttribute('role') === 'button')).length;
  const inputsNoLabel = Array.from(document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea')).filter(i => !i.labels?.length && !i.getAttribute('aria-label') && !i.getAttribute('aria-labelledby') && !i.getAttribute('placeholder')).length;
  const genericLinks = Array.from(document.querySelectorAll('a')).filter(a => /^(click here|learn more|read more|here|more|submit|continue)$/i.test((a.innerText || '').trim())).length;
  const vpMeta = document.querySelector('meta[name="viewport"]')?.getAttribute('content') || '';
  const zoomBlocked = /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?(\s|,|$)/i.test(vpMeta);
  let outlineNone = 0, reducedMotion = false, focusVisibleRules = 0, mediaQueries = 0, containerQueries = 0, clampUsage = 0;
  try {
    for (const ss of document.styleSheets) {
      let rules; try { rules = ss.cssRules; } catch { continue; }
      const walk = list => { for (const rule of list) {
        if (rule.media) { mediaQueries++; if (/prefers-reduced-motion/.test(rule.conditionText || rule.media.mediaText)) reducedMotion = true; if (rule.cssRules) walk(rule.cssRules); continue; }
        if (rule.constructor.name === 'CSSContainerRule') { containerQueries++; if (rule.cssRules) walk(rule.cssRules); continue; }
        if (rule.style) {
          if (/outline:\s*(none|0)/.test(rule.cssText) && !/focus-visible/.test(rule.selectorText || '')) outlineNone++;
          if (/focus-visible/.test(rule.selectorText || '')) focusVisibleRules++;
          if (/clamp\(/.test(rule.cssText)) clampUsage++;
        }
      } };
      walk(rules);
    }
  } catch {}
  const headingLevels = headings.map(h => +h.tag[1]);
  let headingSkips = 0; for (let i = 1; i < headingLevels.length; i++) if (headingLevels[i] - headingLevels[i - 1] > 1) headingSkips++;
  const h1Count = document.querySelectorAll('h1').length;
  const lang = doc.getAttribute('lang') || '';
  const skipLink = !!Array.from(document.querySelectorAll('a[href^="#"]')).find(a => /skip/i.test(a.innerText || ''));
  const landmarks = { main: !!document.querySelector('main, [role=main]'), nav: !!document.querySelector('nav, [role=navigation]'), footer: !!document.querySelector('footer, [role=contentinfo]') };

  // ---------- layout: margins, overflow, empty screens, section gaps ----------
  const textRects = textEls.map(x => ({ l: x.r.left, r: x.r.right, y: x.r.top + window.scrollY, h: x.r.height }));
  const slabs = Math.min(40, Math.ceil(docHeight / vh));
  const slabInfo = [];
  for (let i = 0; i < slabs; i++) {
    const y0 = i * vh, y1 = y0 + vh;
    const chars = textEls.filter(x => { const y = x.r.top + window.scrollY; return y >= y0 && y < y1; }).reduce((a, x) => a + x.t.length, 0);
    const media = visible.filter(v => ['IMG', 'VIDEO', 'CANVAS', 'SVG', 'PICTURE'].includes(v.el.tagName) && v.r.y >= y0 - v.r.h && v.r.y < y1).reduce((a, v) => a + v.r.w * v.r.h, 0);
    const lefts = textRects.filter(t => t.y >= y0 && t.y < y1 && t.r > t.l).map(t => t.l);
    const rights = textRects.filter(t => t.y >= y0 && t.y < y1 && t.r > t.l).map(t => vw - t.r);
    slabInfo.push({ chars, mediaFrac: +(media / (vw * vh)).toFixed(2), leftMargin: lefts.length ? Math.round(Math.min(...lefts)) : null, rightMargin: rights.length ? Math.round(Math.min(...rights)) : null });
  }
  const emptyScreens = slabInfo.filter(s => s.chars < 40 && s.mediaFrac < 0.15).length;
  const clipped = el => { let n = el.parentElement; while (n && n !== document.documentElement) { const o = getComputedStyle(n); if (/(hidden|clip|auto|scroll)/.test(o.overflowX) || /(hidden|clip|auto|scroll)/.test(o.overflow)) return true; n = n.parentElement; } return false; };
  const overflowList = visible.filter(v => v.r.right > vw + 2 && v.r.w > 20 && !clipped(v.el));
  const overflowEls = overflowList.length; overflowList.slice(0, 10).forEach(v => addSel('overflow', v.el));
  const horizontalScroll = doc.scrollWidth > vw + 2;
  const sections = Array.from(document.querySelectorAll('main > section, body > section, main > *, body > *')).filter(s => { const r = s.getBoundingClientRect(); return r.height > 80 && !['SCRIPT', 'STYLE', 'NAV', 'HEADER', 'FOOTER'].includes(s.tagName); });
  const sectionGaps = [];
  for (let i = 1; i < sections.length; i++) {
    const a = sections[i - 1].getBoundingClientRect(), b = sections[i].getBoundingClientRect();
    const inner = sections[i].firstElementChild?.getBoundingClientRect();
    const innerPrev = sections[i - 1].lastElementChild?.getBoundingClientRect();
    const gap = Math.round((inner ? inner.top : b.top) - (innerPrev ? innerPrev.bottom : a.bottom));
    if (gap > 0 && gap < 1000) sectionGaps.push(gap);
  }
  const textAreaFrac = +(textEls.reduce((a, x) => a + x.r.width * x.r.height, 0) / (vw * docHeight)).toFixed(3);
  const contentWidths = textRects.filter(t => t.r - t.l > vw * 0.3).map(t => Math.round(t.r - t.l));
  const maxContentWidth = contentWidths.length ? Math.max(...contentWidths) : 0;

  // ---------- palette summary ----------
  const topBg = Object.entries(bgColors).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c, w]) => ({ hex: c, weight: w, hsl: hsl(hexToRgb(c)) }));
  const topText = Object.entries(textColors).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c, w]) => ({ hex: c, chars: w, hsl: hsl(hexToRgb(c)) }));
  const accents = [...topBg, ...topText, ...buttonsLike.map(b => { const c = parseColor(b.bg); return c && c.a > 0 ? { hex: hex(c), hsl: hsl(c), weight: 1 } : null; }).filter(Boolean)].filter(c => c.hsl.s > 0.35 && c.hsl.l > 0.15 && c.hsl.l < 0.85);
  const accentHues = [...new Set(accents.map(a => Math.round(a.hsl.h / 15) * 15))];
  const bodyBg = effectiveBg(document.body).color;
  const tintedBlack = topBg.some(c => c.hsl.l < 0.08 && c.hsl.l > 0.02 && /^#(0b0b0b|111111|0a0a0a|0d0d0d|121212|0f0f0f)$/.test(c.hex));

  // ---------- copy ----------
  const buttonTexts = buttonsLike.map(b => b.text).slice(0, 30);
  const paraSizeTally = {}; for (const p of paragraphs) tally(paraSizeTally, Math.round(p.size), p.chars);
  const bodySize = Object.entries(paraSizeTally).sort((a, b) => b[1] - a[1])[0]?.[0];
  const vagueButtons = buttonTexts.filter(t => /^(submit|continue|click here|learn more|get started|ok)$/i.test(t)).length;
  const title = document.title;

  return {
    selectors,
    viewport: { w: vw, h: vh, mobile }, docHeight, horizontalScroll, scrollWidth: doc.scrollWidth, overflowEls,
    totalChars, tinyChars, fonts, fontSizes, weights, textColors: topText, bgColors: topBg, bodyBg: hex(bodyBg), accentHues, accents: accents.slice(0, 10).map(a => a.hex), tintedBlack,
    distinctSectionGrounds: sectionBgs.size,
    paragraphs: paragraphs.slice(0, 80), headings: headings.slice(0, 60), hero, aboveFoldButtons, buttonsLike: buttonsLike.slice(0, 40), nav,
    contrastFails: contrastFails.slice(0, 40), contrastFailCount: contrastFails.length,
    tells: { emoji, trackedCaps, indexNumbering, middleDots, arrowLinks, eyebrows, pills, pillAboveHeading, cardRows, iconTiles, cardRowDetails, gradients: gradients.length, gradientText, purpleGradient, gradientSamples: gradients.slice(0, 6), shadows: shadows.length, shadowSamples: [...new Set(shadows)].slice(0, 5), backdropBlur: blurs.length, buzzwords, loremIpsum, tintedBlack, mediaCoverFrac: +(mediaArea / (vw * vh)).toFixed(2), firstScreenImgs },
    radii, spacing, transitionAll, animated, reducedMotion, outlineNone, focusVisibleRules, mediaQueries, containerQueries, clampUsage,
    a11y: { smallTargets, tinyTargets, interactiveCount: interactive.length, iconButtonsNoName, divClick, inputsNoLabel, genericLinks, zoomBlocked, viewportMeta: vpMeta, headingSkips, h1Count, lang, skipLink, landmarks, missingAlt: images.missingAlt },
    images, slabs: slabInfo, emptyScreens, sectionGaps, textAreaFrac, maxContentWidth, screens: +(docHeight / vh).toFixed(1),
    bodySize: bodySize ? +bodySize : null,
    copy: { title, buttonTexts, vagueButtons, headlineTexts: headings.slice(0, 12).map(h => h.text) },
  };
}

async function runAxe(page) {
  try {
    await page.addScriptTag({ content: AXE_SRC });
    const res = await page.evaluate(async () => {
      const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'] }, resultTypes: ['violations'] });
      return r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl, nodes: v.nodes.length, sample: v.nodes.slice(0, 3).map(n => ({ target: n.target.join(' '), summary: n.failureSummary?.split('\n').slice(0, 3).join(' ') })) }));
    });
    return { ok: true, violations: res };
  } catch (e) {
    return { ok: false, error: String(e.message || e).slice(0, 200), violations: [] };
  }
}

async function dismissBanners(page) {
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button, a')).find(b => /^(accept|accept all|accept all cookies|i agree|agree|allow all|got it|ok|okay)$/i.test((b.innerText || '').trim()));
    if (btn) btn.click();
  }).catch(() => {});
  await page.waitForTimeout(300);
}

async function settle(page) {
  // Scroll through to trigger lazy loading and scroll-reveal animations, then return to top.
  await page.evaluate(async () => {
    const h = document.documentElement.scrollHeight;
    for (let y = 0; y < Math.min(h, 20000); y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); }
    window.scrollTo(0, 0);
    // force reveal-on-scroll elements that may still be hidden
    await new Promise(r => setTimeout(r, 300));
  });
  await page.waitForTimeout(400);
}

export async function capture(target, { outDir, viewports = VIEWPORTS, timeout = 45000, log = () => {} } = {}) {
  const url = toUrl(target);
  fs.mkdirSync(path.join(outDir, 'shots'), { recursive: true });
  const browser = await chromium.launch();
  const results = { url, target, capturedAt: new Date().toISOString(), viewports: [] };
  let snapshotSaved = false;
  try {
    for (const vp of viewports) {
      log(`capturing ${vp.name} ${vp.width}×${vp.height}`);
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, isMobile: vp.mobile, hasTouch: vp.mobile, colorScheme: 'light', reducedMotion: 'no-preference', userAgent: vp.mobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' : undefined });
      const page = await ctx.newPage();
      const consoleErrors = [];
      page.on('pageerror', e => consoleErrors.push(String(e.message).slice(0, 120)));
      const t0 = Date.now();
      let status = null;
      try {
        const resp = await page.goto(url, { waitUntil: 'load', timeout });
        status = resp ? resp.status() : null;
        await page.waitForTimeout(800);
      } catch (e) {
        results.viewports.push({ ...vp, error: `load failed: ${e.message.split('\n')[0]}` });
        await ctx.close();
        continue;
      }
      const loadMs = Date.now() - t0;
      await dismissBanners(page);
      await settle(page);
      const shotFirst = path.join('shots', `${vp.name}-first.jpg`);
      const shotFull = path.join('shots', `${vp.name}-full.jpg`);
      await page.screenshot({ path: path.join(outDir, shotFirst), type: 'jpeg', quality: 72 });
      const docH = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.screenshot({ path: path.join(outDir, shotFull), type: 'jpeg', quality: 60, fullPage: true, clip: docH > 8000 ? { x: 0, y: 0, width: vp.width, height: 8000 } : undefined }).catch(async () => { await page.screenshot({ path: path.join(outDir, shotFull), type: 'jpeg', quality: 60 }); });
      const metrics = await page.evaluate(collectMetrics, { mobile: vp.mobile });
      const axe = await runAxe(page);
      if (!snapshotSaved) {
        // HTML snapshot (for mockups): absolute base so relative assets resolve.
        let html = await page.content();
        if (!/<base\s/i.test(html)) html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${url}">`);
        fs.writeFileSync(path.join(outDir, 'snapshot.html'), html);
        snapshotSaved = true;
      }
      results.viewports.push({ ...vp, status, loadMs, consoleErrors: consoleErrors.slice(0, 5), shots: { first: shotFirst, full: shotFull }, metrics, axe });
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(outDir, 'capture.json'), JSON.stringify(results, null, 1));
  return results;
}

/** Re-render a page with extra CSS injected and screenshot it. Used for mockups.
 *  `target` is the live URL (preferred: JS runs, lazy images and web fonts load) or a snapshot .html path. */
export async function renderWithCss(target, css, { outPath, width = 1440, height = 900, fullPage = false, mobile = false, timeout = 45000 } = {}) {
  const url = /^https?:\/\//i.test(target) ? target : pathToFileURL(path.resolve(target)).href;
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, colorScheme: 'light' });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'load', timeout }).catch(() => {});
    await page.waitForTimeout(800);
    await dismissBanners(page);
    await settle(page);
    if (css) await page.addStyleTag({ content: css });
    await page.waitForTimeout(400);
    const docH = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.screenshot({ path: outPath, type: 'jpeg', quality: 75, fullPage, clip: fullPage ? { x: 0, y: 0, width, height: Math.min(8000, docH) } : undefined });
    await ctx.close();
  } finally { await browser.close(); }
  return outPath;
}

/** Render a standalone HTML string (full redesign mockup). */
export async function renderHtml(html, { outPath, width = 1440, height = 900, fullPage = true } = {}) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(600);
    await page.screenshot({ path: outPath, type: 'jpeg', quality: 75, fullPage });
  } finally { await browser.close(); }
  return outPath;
}
