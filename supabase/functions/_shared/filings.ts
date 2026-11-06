// Earnings highlights, guidance, management quotes and risk factors, pulled word for word
// from SEC filings: the earnings press release (8-K Item 2.02, Exhibit 99.1) and the 10-K (Item 1A).

import { PREDECESSOR } from './sec.ts';
export const SEC_UA = 'Skope reports@skoperesearch.com';
const ARCH = 'https://www.sec.gov/Archives/edgar/data';

const decode = (t: string) => t
  .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
const clean = (t: string) => decode(t.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// HTML -> text blocks (paragraphs, list items, table cells joined per row)
export function blocks(html: string): string[] {
  const s = html.replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(p|div|li|tr|h\d|table|ul|ol)>|<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ');
  return decode(s.replace(/<[^>]+>/g, ' ')).split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(l => l.length > 1);
}

// split after . ! ? when followed by a space and a capital or quote (keeps $114.5 and U.S. intact)
const sentences = (p: string) => p.split(/(?<=[.!?][”"’]?)\s+(?=[“"A-Z(])/).map(x => x.trim()).filter(Boolean);
const NUM = /\$\s?\d|\d(?:\.\d+)?\s?(?:%|percent|per cent)|\d+(?:\.\d+)?\s?(?:billion|million)/i;
const FIN = /revenue|sales|earnings per share|\bEPS\b|net income|operating income|gross margin|operating margin|cash flow|free cash|dividend|repurchase|buyback|bookings|backlog|subscribers|users|deliveries|same-store|comparable/i;
const BOILER = /forward-looking|Private Securities Litigation|safe harbor|non-GAAP financial measures? (?:is|are) (?:included|provided)|conference call|webcast|press contact|investor relations contact|about [A-Z]/i;
const GUIDE = /\b(?:expects?|expected to|is expected|are expected|anticipates?|guidance|outlook|forecasts?|now sees|reaffirm(?:s|ed)?)\b/i;
const QUOTE = /[“"]([^”"]{40,})[”"]/;

export function parseRelease(html: string) {
  const b = blocks(html);
  // body ends where the financial tables begin
  let end = b.findIndex((l, i) => i > 5 && /^(?:condensed |unaudited )?(?:consolidated )?(?:condensed )?(?:statements? of (?:operations|income|earnings)|balance sheets?|income statements?)/i.test(l));
  if (end < 0) end = Math.min(b.length, 120);
  const body = b.slice(0, end);
  const start = Math.max(0, body.findIndex(l => /^exhibit\s*99/i.test(l)) + 1);
  const text = body.slice(start).filter(l => !/^(?:EX-99|Document|.*\.htm)$/i.test(l));
  const title = text.find(l => l.length >= 15 && l.length <= 200 && !/^\(|^•/.test(l)) || '';

  const highlights: string[] = [], quotes: { text: string; by: string }[] = [], outlook: string[] = [];
  let inOutlook = false;
  for (const p0 of text) {
    if (p0 === title) continue;
    const p = p0.replace(/^(?:[n§▪●•◦–-]\s+)(?=[A-Z$\d“"])/, '');
    if (/^(?:financial )?(?:outlook|guidance|business outlook)\b/i.test(p) && p.length < 80) { inOutlook = true; continue; }
    if (BOILER.test(p)) { inOutlook = false; continue; }
    // management quotes: “...,” said Name, Title.
    const q = p.match(QUOTE);
    const by = p.match(/[”"],?\s*(?:said|says|stated|commented|added)\s+([^“”"]{3,140}?)\.(?:\s|$)/i) || p.match(/([A-Z][\w.\- ]{2,60}),[^.“”"]{0,60}\b(?:said|says|stated)\b/);
    if (q && by && quotes.length < 3) {
      let t = q[1].trim();
      const ss = sentences(t); t = ss.slice(0, 2).join(' ');
      if (t.length > 320) t = ss[0];
      if (!quotes.some(x => x.by === by[1].trim())) quotes.push({ text: t.replace(/,$/, '.'), by: by[1].trim() });
      continue;
    }
    if (q) continue;
    for (const s0 of sentences(p.replace(/^•\s*/, ''))) {
      const s = s0.length > 300 || !/^[A-Z$\d“"(]/.test(s0) ? '' : s0.replace(/\s+(\d)\s*([,.;:])?$/, '$2').trim();
      if (!s || !NUM.test(s)) continue;
      if ((inOutlook || GUIDE.test(s)) && !/\b(?:was|were|grew|increased|decreased|declined|rose|fell)\b.*\b(?:compared|versus|vs\.?|from)\b/i.test(s)) {
        if (outlook.length < 4 && !outlook.includes(s)) outlook.push(s);
      } else if (FIN.test(s) && highlights.length < 6 && !highlights.includes(s)) highlights.push(s);
    }
  }
  const TOP = /total revenue|^revenue|\brevenue (?:was|of|grew|increased|rose)|net sales|earnings per share|\bEPS\b|net income|operating income/i;
  const ranked = [...highlights.filter(h => TOP.test(h)), ...highlights.filter(h => !TOP.test(h))].slice(0, 5);
  return { title, highlights: ranked, quotes: quotes.slice(0, 2), outlook };
}

const RISKY = /\b(?:could|may|might|impact\w*|risks?|advers\w*|depend\w*|subject to|fail\w*|unable|expos\w*|uncertain\w*|harm\w*|affect\w*|disrupt\w*|volatil\w*|liabilit\w*|declin\w*|loss\w*)\b/i;
// 10-K Item 1A: the risk-factor headings (bold or italic lead sentences), grouped by category.
export function parseRisks(html: string, max = 6) {
  // filings sometimes split words across tags ("RIS</span><span>K FACTORS"), so allow tags between letters
  const G = '(?:<[^>]+>|\\s|&#160;|&nbsp;|&#xa0;|&#8212;|&#8211;|&#151;|—|–|-|:|\\.)*';
  const flex = (w: string) => w.split('').map(c => (c === ' ' ? G : c.replace(/[.]/, '\\.?') + '(?:<[^>]+>)*')).join('');
  const startRe = new RegExp(flex('Item 1A') + '\\.?' + G + flex('Risk Factors'), 'gi');
  const endRe = new RegExp(flex('Item 1B') + '|' + flex('Item 1C') + '|' + flex('Item 2') + '\\.?' + G + flex('Properties'), 'gi');
  const st = [...html.matchAll(startRe)].map(m => m.index!), en = [...html.matchAll(endRe)].map(m => m.index!);
  if (!st.length) return null;
  // the real section is the start marker followed (not too far) by the next Item; cross-references have no end after them
  const withEnd = st.map(x => ({ x, e: en.find(e => e > x) })).filter(c => c.e != null && c.e - c.x < 3_000_000) as { x: number; e: number }[];
  if (!withEnd.length) return null;
  const best = withEnd.reduce((b, c) => (c.e - c.x > b.e - b.x ? c : b));
  const sec = html.slice(best.x, best.e);
  const emph = [...sec.matchAll(/<(?:b|strong)\b[^>]*>([\s\S]*?)<\/(?:b|strong)>|<(?:span|font|p|div)\b[^>]*style="[^"]*(?:font-weight:\s*(?:bold|[6-9]00)|font-style:\s*italic)[^"]*"[^>]*>([\s\S]*?)<\/(?:span|font|p|div)>/gi)]
    .map(m => clean(m[1] || m[2] || '')).filter(Boolean);
  const INTRO = /^(?:the (?:above|following)|summary|in addition|these risk|this section)/i;
  const out: { heading: string; group: string }[] = [];
  let group = '';
  for (const t of emph) {
    if (/^item\s*1a/i.test(t) || INTRO.test(t)) continue;
    if (t.length < 70 && !/[.;:]$/.test(t)) { group = t; continue; }                       // category header
    if (t.length >= 50 && t.length <= 420 && /[.;]$/.test(t) && RISKY.test(t) && !out.some(o => o.heading === t)) out.push({ heading: t, group });
    if (out.length >= max) break;
  }
  if (out.length >= 3) return out;
  // some filers use short topic labels ("Economic conditions.") under category headers instead of full sentences
  const short: { heading: string; group: string }[] = [];
  group = '';
  for (const t of emph) {
    if (/^item\s*1a/i.test(t) || INTRO.test(t)) continue;
    if (t.length < 70 && !/[.;:]$/.test(t)) { group = t; continue; }
    if (t.length >= 8 && t.length < 80 && /\.$/.test(t) && !/^other\b/i.test(t)) short.push({ heading: (group ? group + ': ' : '') + t.replace(/\.$/, ''), group });
    if (short.length >= max) break;
  }
  return short.length >= 3 ? short : out.length ? out : null;
}

// ── network ──────────────────────────────────────────────────────────────────
async function get(url: string, fetcher: typeof fetch, as: 'json' | 'text', tries = 2): Promise<any> {
  const r = await fetcher(url, { headers: { 'User-Agent': SEC_UA } });
  if (!r.ok) {
    if (tries > 1 && (r.status === 429 || r.status >= 500)) { await new Promise(z => setTimeout(z, 900)); return get(url, fetcher, as, tries - 1); }
    throw new Error(`SEC HTTP ${r.status}`);
  }
  return as === 'json' ? r.json() : r.text();
}

export type Filing = { form: string; date: string; accession: string; doc: string; items: string[]; reportDate: string };
export async function recentFilings(cik: number, fetcher = fetch): Promise<Filing[]> {
  const j = await get(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, '0')}.json`, fetcher, 'json');
  const r = j.filings.recent, out: Filing[] = [];
  for (let i = 0; i < r.form.length; i++)
    out.push({ form: r.form[i], date: r.filingDate[i], accession: r.accessionNumber[i], doc: r.primaryDocument[i], items: String(r.items[i] || '').split(',').filter(Boolean), reportDate: r.reportDate[i] });
  return out;
}
export const filingUrl = (cik: number, f: Filing, doc = f.doc) => `${ARCH}/${cik}/${f.accession.replace(/-/g, '')}/${doc}`;

export async function earningsRelease(cik: number, f: Filing, fetcher = fetch) {
  const idx = await get(`${ARCH}/${cik}/${f.accession.replace(/-/g, '')}/index.json`, fetcher, 'json');
  const files: { name: string; size: string }[] = idx.directory.item;
  const htm = files.filter(x => /\.html?$/i.test(x.name) && !/index/i.test(x.name) && x.name !== f.doc && !/^R\d+\.htm/i.test(x.name));
  const ex = htm.find(x => /ex[-_]?99[-_.]?0?1|ex991|exhibit99|dex991|ex99\b/i.test(x.name)) || htm.find(x => /99/.test(x.name))
    || htm.sort((a, b) => (+b.size || 0) - (+a.size || 0))[0];
  if (!ex) return null;
  const html = await get(`${ARCH}/${cik}/${f.accession.replace(/-/g, '')}/${ex.name}`, fetcher, 'text');
  const p = parseRelease(html);
  if (!p.highlights.length && !p.quotes.length && !p.outlook.length) return null;
  return { ...p, date: f.date, url: filingUrl(cik, f, ex.name) };
}

export async function getHighlights(cik: number, fetcher = fetch) {
  const fl = await recentFilings(cik, fetcher);
  const earn = fl.find(f => f.form === '8-K' && f.items.includes('2.02'));
  let tenK = fl.find(f => f.form === '10-K' || f.form === '10-K405'), kCik = cik;
  if (!tenK && PREDECESSOR[cik]) { kCik = PREDECESSOR[cik]; tenK = (await recentFilings(kCik, fetcher)).find(f => f.form === '10-K'); }
  const errors: string[] = [];
  const [earnings, risks] = await Promise.all([
    earn ? earningsRelease(cik, earn, fetcher).catch(e => (errors.push('earnings: ' + e.message), null)) : null,
    tenK ? get(filingUrl(kCik, tenK), fetcher, 'text').then(h => parseRisks(h)).catch(e => (errors.push('risks: ' + e.message), null)) : null,
  ]);
  return {
    earnings,
    risks: risks ? { date: tenK!.date, url: filingUrl(kCik, tenK!), items: risks } : null,
    errors,
  };
}
