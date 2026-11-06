// Daily: fetch earnings-release highlights and 10-K risk factors from SEC filings and save them as
// static files the site serves (data/highlights/TICKER.json). Runs on GitHub's servers because sec.gov
// throttles the shared servers Supabase functions run on. Only re-downloads filings that changed.
// Run with: node --experimental-strip-types reports/update-highlights.mjs [--top=700] [--only=AAPL,MSFT]
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { recentFilings, earningsRelease, riskFactors, latestKeyFilings, filingUrl } from '../supabase/functions/_shared/filings.ts';

const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const TOP = +(args.top || 700);
const DIR = new URL('../data/highlights/', import.meta.url);
mkdirSync(DIR, { recursive: true });
const IDX = new URL('_index.json', DIR);
const index = existsSync(IDX) ? JSON.parse(readFileSync(IDX, 'utf8')) : {};
const UA = { headers: { 'User-Agent': 'Skope reports@skoperesearch.com' } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// polite SEC fetcher: ~6 requests/second, retries on 429/5xx
let last = 0;
async function secFetch(url, opt) {
  for (let i = 0; i < 4; i++) {
    const wait = last + 170 - Date.now(); if (wait > 0) await sleep(wait); last = Date.now();
    const r = await fetch(url, { ...UA, ...(opt || {}) });
    if (r.status !== 429 && r.status < 500) return r;
    await sleep(2000 * (i + 1));
  }
  return fetch(url, UA);
}

// universe: largest companies by SEC list order + every subscriber's holdings
const list = await (await secFetch('https://www.sec.gov/files/company_tickers.json')).json();
const all = Object.values(list).map(x => ({ ticker: String(x.ticker).toUpperCase(), cik: x.cik_str }));
const byTicker = Object.fromEntries(all.map(x => [x.ticker, x.cik]));
let tickers = all.slice(0, TOP).map(x => x.ticker);
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  try {
    const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/subscribers?select=holdings&confirmed=eq.true`, { headers: { apikey: k, ...(k.startsWith('eyJ') ? { Authorization: `Bearer ${k}` } : {}) } });
    for (const s of await r.json()) for (const h of s.holdings || []) tickers.push(String(h.ticker).toUpperCase());
  } catch (e) { console.warn('Could not read subscriber holdings:', e.message); }
}
if (args.only) tickers = args.only.split(',').map(t => t.toUpperCase());
tickers = [...new Set(tickers)].filter(t => byTicker[t] || byTicker[t.replace('.', '-')]);

// group tickers that share a company (GOOGL/GOOG, BRK-A/BRK-B)
const groups = new Map();
for (const t of tickers) { const cik = byTicker[t] || byTicker[t.replace('.', '-')]; (groups.get(cik) || groups.set(cik, []).get(cik)).push(t); }
console.log(`${tickers.length} tickers, ${groups.size} companies`);

let updated = 0, unchanged = 0, failed = 0;
for (const [cik, ts] of groups) {
  try {
    const fl = await recentFilings(cik, secFetch);
    const { earn, tenK, kCik } = await latestKeyFilings(cik, fl, secFetch);
    const prev = index[ts[0]] || {};
    const file = new URL(`${ts[0]}.json`, DIR);
    const old = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
    const eAcc = earn?.accession || null, kAcc = tenK?.accession || null;
    if (prev.e === eAcc && prev.k === kAcc && existsSync(file)) { unchanged++; continue; }
    const earnings = eAcc === prev.e && old.earnings !== undefined ? old.earnings : earn ? await earningsRelease(cik, earn, secFetch) : null;
    const items = kAcc === prev.k && old.risks !== undefined ? null : tenK ? await riskFactors(kCik, tenK, secFetch) : null;
    const risks = kAcc === prev.k && old.risks !== undefined ? old.risks : items ? { date: tenK.date, url: filingUrl(kCik, tenK), items } : null;
    const body = JSON.stringify({ earnings, risks, updated: new Date().toISOString().slice(0, 10) });
    for (const t of ts) { writeFileSync(new URL(`${t.replace('.', '-')}.json`, DIR), body); index[t] = { cik, e: eAcc, k: kAcc }; }
    updated++;
    if (updated % 25 === 0) console.log(`  ${updated} updated...`);
  } catch (e) { failed++; console.warn(`  ${ts.join('/')}: ${e.message}`); }
}
writeFileSync(IDX, JSON.stringify(index));
console.log(`Done: ${updated} updated, ${unchanged} unchanged, ${failed} failed`);
