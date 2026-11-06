// Refreshes the bundled ticker -> SEC CIK map used by the fundamentals function.
// Run weekly by .github/workflows/tickers.yml (and on demand).
import { writeFileSync, readFileSync } from 'node:fs';
const r = await fetch('https://www.sec.gov/files/company_tickers.json', { headers: { 'User-Agent': 'Skope reports@skoperesearch.com' } });
if (!r.ok) throw new Error(`SEC HTTP ${r.status}`);
const j = await r.json();
const map = {};
for (const k of Object.keys(j)) map[String(j[k].ticker).toUpperCase()] = j[k].cik_str;
const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
const out = new URL('../supabase/functions/_shared/tickers.json', import.meta.url);
const next = JSON.stringify(sorted);
let prev = ''; try { prev = readFileSync(out, 'utf8'); } catch {}
if (prev === next) console.log('Ticker map unchanged:', Object.keys(sorted).length, 'tickers');
else { writeFileSync(out, next); console.log('Ticker map updated:', Object.keys(sorted).length, 'tickers'); }
