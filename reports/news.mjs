// Highlights for the weekly email: what each holding filed with the SEC since the last report
// (8-K events in plain words, with earnings numbers and guidance quoted from the release),
// plus news headlines from Finnhub when FINNHUB_API_KEY is set.
import { readFileSync } from 'node:fs';
import { recentFilings, earningsRelease, filingUrl } from '../supabase/functions/_shared/filings.ts';

const TICKERS = JSON.parse(readFileSync(new URL('../supabase/functions/_shared/tickers.json', import.meta.url), 'utf8'));
const UA = { headers: { 'User-Agent': 'Skope reports@skoperesearch.com' } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let last = 0;
async function secFetch(url, opt) {
  for (let i = 0; i < 4; i++) {
    const w = last + 170 - Date.now(); if (w > 0) await sleep(w); last = Date.now();
    const r = await fetch(url, { ...UA, ...(opt || {}) });
    if (r.status !== 429 && r.status < 500) return r;
    await sleep(2000 * (i + 1));
  }
  return fetch(url, UA);
}

// 8-K item codes in plain words (9.01 is just the exhibit list, so it's skipped)
export const ITEMS = {
  '1.01': 'Entered a material agreement', '1.02': 'Ended a material agreement', '1.03': 'Bankruptcy or receivership',
  '1.05': 'Disclosed a cybersecurity incident', '2.01': 'Completed an acquisition or sale of assets', '2.02': 'Reported quarterly results',
  '2.03': 'Took on new debt or financing', '2.04': 'Debt acceleration triggered', '2.05': 'Announced restructuring or exit costs',
  '2.06': 'Recorded an asset impairment', '3.01': 'Received a listing-standards notice', '3.02': 'Sold unregistered shares',
  '3.03': 'Changed shareholder rights', '4.01': 'Changed auditor', '4.02': 'Said past financial statements can no longer be relied on',
  '5.01': 'Change in control', '5.02': 'Executive or board change', '5.03': 'Amended bylaws or changed fiscal year',
  '5.07': 'Shareholder vote results', '7.01': 'Public disclosure (Reg FD)', '8.01': 'Other material event',
};
const FORMS = { '10-Q': 'Filed quarterly report (10-Q)', '10-K': 'Filed annual report (10-K)', 'DEF 14A': 'Filed proxy statement', 'SC 13D': 'Activist stake disclosed (13D)' };

export async function filingHighlights(tickers, since) {
  const out = [];
  for (const t of tickers) {
    const cik = TICKERS[t] || TICKERS[t.replace('.', '-')];
    if (!cik) continue;
    try {
      const fl = (await recentFilings(cik, secFetch)).filter(f => f.date >= since);
      const events = [];
      let earnings = null;
      for (const f of fl) {
        if (f.form === '8-K' || f.form === '8-K/A') {
          for (const it of f.items) if (ITEMS[it]) events.push({ date: f.date, label: ITEMS[it], url: filingUrl(cik, f) });
          if (f.items.includes('2.02') && !earnings) {
            const e = await earningsRelease(cik, f, secFetch).catch(() => null);
            if (e) earnings = { date: e.date, url: e.url, highlights: e.highlights.slice(0, 3), outlook: e.outlook.slice(0, 2) };
          }
        } else if (FORMS[f.form]) events.push({ date: f.date, label: FORMS[f.form], url: filingUrl(cik, f) });
      }
      // one line per label per day
      const seen = new Set(), ev = events.filter(e => { const k = e.date + e.label; if (seen.has(k)) return false; seen.add(k); return true; });
      out.push({ ticker: t, events: ev.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6), earnings, news: [] });
    } catch (e) { console.warn(`filings ${t}: ${e.message}`); out.push({ ticker: t, events: [], earnings: null, news: [] }); }
  }
  return out;
}

// Finnhub company news (free key): headline, source and link only
export async function addNews(highlights, since, today) {
  const key = (process.env.FINNHUB_API_KEY || '').trim();
  if (!key) return false;
  for (const h of highlights) {
    try {
      const r = await fetch(`https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(h.ticker)}&from=${since}&to=${today}&token=${key}`);
      if (!r.ok) { console.warn(`news ${h.ticker}: HTTP ${r.status}`); continue; }
      const seen = new Set();
      h.news = (await r.json()).filter(n => n.headline && n.url && !seen.has(n.headline.toLowerCase()) && seen.add(n.headline.toLowerCase()))
        .sort((a, b) => b.datetime - a.datetime).slice(0, highlights.length > 4 ? 2 : 3)
        .map(n => ({ headline: n.headline, source: n.source, url: n.url, date: new Date(n.datetime * 1000).toISOString().slice(0, 10) }));
    } catch (e) { console.warn(`news ${h.ticker}: ${e.message}`); }
    await sleep(1100);   // free tier: 60 requests a minute
  }
  return true;
}
