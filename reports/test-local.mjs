// Offline test: simulated holdings with KNOWN factor exposures, built from real
// Fama-French daily data. Checks the regression recovers them and renders the email.
import { strFromU8, unzipSync } from 'fflate';
import { mkdirSync, writeFileSync } from 'node:fs';
import { analyze, parseFrenchMonthly } from './core.mjs';
import { buildEmail, buildSubject } from './email.mjs';

async function zip(name) {
  const r = await fetch(`https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/${name}_CSV.zip`);
  return strFromU8(Object.values(unzipSync(new Uint8Array(await r.arrayBuffer())))[0]);
}
const parseDaily = t => { const o = {}; for (const l of t.replace(/\r/g, '').split('\n')) { const m = /^\s*(\d{8})\s*,(.*)$/.exec(l); if (m) o[m[1]] = m[2].split(',').map(v => +v / 100); } return o; };

const [ff5d, momd, ff5m, momm] = await Promise.all([zip('F-F_Research_Data_5_Factors_2x3_daily'), zip('F-F_Momentum_Factor_daily'), zip('F-F_Research_Data_5_Factors_2x3'), zip('F-F_Momentum_Factor')]);
const FD = parseDaily(ff5d), MD = parseDaily(momd), ff = parseFrenchMonthly(ff5m), mom = parseFrenchMonthly(momm);
const days = Object.keys(FD).filter(d => MD[d] && d >= '20200101').sort();

let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, g = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
// exposures: [MKT, SMB, HML, RMW, CMA, MOM], daily idiosyncratic vol
const TRUE = {
  GRW1: [1.25, 0.10, -0.60, -0.20, -0.30, 0.25, 0.016],
  GRW2: [1.15, 0.05, -0.50, 0.00, -0.20, 0.20, 0.015],
  VAL1: [0.85, -0.20, 0.55, 0.40, 0.25, -0.05, 0.012],
  DEF1: [0.60, -0.30, 0.10, 0.45, 0.30, 0.00, 0.010],
  SPY: [1.00, -0.15, 0.02, 0.05, 0.02, 0.00, 0.0015],
};
function series(b) {
  let p = 100; return days.map(d => { const [m, s, h, r, c, rf] = FD[d], mo = MD[d][0];
    p *= 1 + rf + b[0] * m + b[1] * s + b[2] * h + b[3] * r + b[4] * c + b[5] * mo + b[6] * g();
    return { date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`, close: p }; });
}
const daily = Object.fromEntries(Object.entries(TRUE).map(([k, b]) => [k, series(b)]));
const asOf = new Date(daily.SPY.at(-1).date + 'T20:00:00Z');

const holdingsA = [{ ticker: 'GRW1', weight: 30 }, { ticker: 'GRW2', weight: 25 }, { ticker: 'VAL1', weight: 25 }, { ticker: 'DEF1', weight: 20 }];
const holdingsB = [{ ticker: 'GRW1', weight: 45 }, { ticker: 'GRW2', weight: 35 }, { ticker: 'VAL1', weight: 10 }, { ticker: 'DEF1', weight: 10 }];
const run = (h, prev) => analyze({ holdings: h, daily, bench: { ticker: 'SPY', daily: daily.SPY }, ff, mom, frequency: 'weekly', prev, asOf });

const m1 = run(holdingsA, null);
const m2 = run(holdingsB, m1);
// expected portfolio betas = weighted average of true betas
const expB = h => [0, 1, 2, 3, 4, 5].map(i => h.reduce((s, x) => s + (x.weight / 100) * TRUE[x.ticker][i], 0));
console.log('Months used:', m1.n, `(${m1.firstMonth}–${m1.lastMonth})`);
console.log('Factor    true    est (portfolio A)');
m1.exposures.forEach((e, i) => console.log(e.factor.padEnd(8), expB(holdingsA)[i].toFixed(2).padStart(6), e.beta.toFixed(2).padStart(7), `t=${e.t.toFixed(1)}`));
console.log('Label A:', m1.label.words, '| alpha', (m1.alphaAnn * 100).toFixed(2) + '%', 't', m1.alphaT.toFixed(2));
console.log('Label B:', m2.label.words);
console.log('Concentration B:', m2.concentration, 'overlaps:', JSON.stringify(m2.overlaps));
console.log('Changes A→B:', m2.changes.items);
console.log('Attribution A:', m1.attribution.map(a => `${a.factor} ${(a.contrib * 100).toFixed(2)}%`).join(', '));
const sumAttr = m1.attribution.reduce((s, a) => s + a.contrib, 0);
console.log('Attribution sums to', (sumAttr * 100).toFixed(2) + '%/yr');
mkdirSync('out', { recursive: true });
const opts = { siteUrl: 'https://skoperesearch.com/', unsubscribeUrl: 'https://example/unsubscribe', ffThrough: 'September 30, 2026' };
const { filingHighlights } = await import('./news.mjs');
const hl = await filingHighlights(['AAPL','MSFT','AMZN','XOM'], new Date(Date.now()-14*864e5).toISOString().slice(0,10));
writeFileSync('out/test_first.html', buildEmail(m1, { ...opts, highlights: hl })); writeFileSync('out/test_second.html', buildEmail(m2, opts));
console.log('Subject:', buildSubject(m2));
