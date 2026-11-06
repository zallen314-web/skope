// Monthly macro series from FRED (St. Louis Fed), saved as data/macro.json for Skope's macro sensitivities.
// No API key needed for FRED's CSV downloads. Each month uses the last available reading in that month.
//   rate   = change in the 10-year Treasury yield, percentage points (DGS10)
//   oil    = % change in WTI crude (DCOILWTICO)
//   usd    = % change in the broad trade-weighted dollar (DTWEXBGS, from 2006)
//   credit = change in the Baa corporate minus 10-year Treasury spread, percentage points (BAA10Y)
import { writeFileSync, mkdirSync } from 'node:fs';
const SERIES = { rate: 'DGS10', oil: 'DCOILWTICO', usd: 'DTWEXBGS', credit: 'BAA10Y' };
const KIND = { rate: 'diff', oil: 'pct', usd: 'pct', credit: 'diff' };

async function monthEnd(id) {
  const r = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, { headers: { 'User-Agent': 'Skope (skoperesearch.com)' } });
  if (!r.ok) throw new Error(`${id}: HTTP ${r.status}`);
  const out = {};
  for (const line of (await r.text()).trim().split('\n').slice(1)) {
    const [d, v] = line.split(',');
    const x = parseFloat(v);
    if (!isFinite(x)) continue;                 // FRED marks holidays with '.'
    out[d.slice(0, 4) + d.slice(5, 7)] = x;     // later days overwrite earlier ones → month-end value
  }
  return out;
}

const raw = {};
for (const [k, id] of Object.entries(SERIES)) raw[k] = await monthEnd(id);
const months = [...new Set(Object.values(raw).flatMap(o => Object.keys(o)))].filter(m => m >= '198912').sort();
const now = new Date(), cur = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
const series = {};
for (let i = 1; i < months.length; i++) {
  const m = months[i], p = months[i - 1];
  if (m >= cur) continue;                       // skip the month in progress
  series[m] = Object.keys(SERIES).map(k => {
    const a = raw[k][m], b = raw[k][p];
    if (a == null || b == null) return null;
    return KIND[k] === 'diff' ? +(a - b).toFixed(4) : (b > 0 ? +((a / b - 1)).toFixed(5) : null);
  });
}
mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
const keys = Object.keys(series);
writeFileSync(new URL('../data/macro.json', import.meta.url), JSON.stringify({ fields: Object.keys(SERIES), source: 'FRED, Federal Reserve Bank of St. Louis', from: keys[0], to: keys[keys.length - 1], series }));
console.log(`macro: ${keys.length} months, ${keys[0]}–${keys[keys.length - 1]}`);
