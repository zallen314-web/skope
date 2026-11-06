// Skope report engine: pure functions, no network. Used by send-reports.mjs.
// Monthly Fama-French 5 factors + momentum, constant-weight portfolio rebalanced monthly.

export const FACTORS = ['MKT', 'SMB', 'HML', 'RMW', 'CMA', 'MOM'];
export const FACTOR_LABEL = { MKT: 'Market', SMB: 'Size (SMB)', HML: 'Value (HML)', RMW: 'Profitability (RMW)', CMA: 'Investment (CMA)', MOM: 'Momentum (MOM)' };

// ── Ken French CSV (first, monthly block) ─────────────────────────────────────
export function parseFrenchMonthly(text) {
  const out = {};
  const lines = text.replace(/\r/g, '').split('\n');
  let started = false;
  for (const raw of lines) {
    const l = raw.trim();
    const m = /^(\d{6})\s*,(.*)$/.exec(l);
    if (m) { started = true; out[m[1]] = m[2].split(',').map(v => parseFloat(v) / 100); continue; }
    if (started && /^\d{4}\s*,/.test(l)) break;      // annual block begins
    if (started && l === '') break;
  }
  return out;                                          // { '202609': [values...] } in decimals
}

// ── prices → returns ──────────────────────────────────────────────────────────
// values: [{datetime:'YYYY-MM-DD', close:'123.4'}] ascending
export function cleanDaily(values) {
  return values.filter(v => v && v.close && +v.close > 0).map(v => ({ date: v.datetime.slice(0, 10), close: +v.close }));
}
export function monthlyReturns(daily, { dropMonth } = {}) {
  const last = {};                                     // last close in each month
  for (const d of daily) last[d.date.slice(0, 4) + d.date.slice(5, 7)] = d.close;
  const yms = Object.keys(last).sort();
  const out = {};
  for (let i = 1; i < yms.length; i++) if (yms[i] !== dropMonth) out[yms[i]] = last[yms[i]] / last[yms[i - 1]] - 1;
  return out;
}
export function periodReturn(daily, nDays) {
  if (daily.length <= nDays) return null;
  return daily[daily.length - 1].close / daily[daily.length - 1 - nDays].close - 1;
}

// ── statistics ────────────────────────────────────────────────────────────────
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
function nCDF(z) { const t = 1 / (1 + 0.2316419 * Math.abs(z)), p = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))); const c = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z) * p; return z >= 0 ? c : 1 - c; }
function invM(M) {
  const n = M.length, a = M.map((r, i) => [...r, ...Array(n).fill(0).map((_, j) => (j === i ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[c], a[p]] = [a[p], a[c]]; const d = a[c][c]; if (Math.abs(d) < 1e-14) throw new Error('Singular matrix');
    for (let j = 0; j < 2 * n; j++) a[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = a[r][c]; for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[c][j]; }
  }
  return a.map(r => r.slice(n));
}
export function ols(y, Xcols) {
  const n = y.length, k = Xcols.length, p = k + 1;
  const X = y.map((_, t) => [1, ...Xcols.map(c => c[t])]);
  const XtX = Array(p).fill(0).map(() => Array(p).fill(0)), Xty = Array(p).fill(0);
  for (let t = 0; t < n; t++) for (let i = 0; i < p; i++) { Xty[i] += X[t][i] * y[t]; for (let j = 0; j < p; j++) XtX[i][j] += X[t][i] * X[t][j]; }
  const inv = invM(XtX), b = Array(p).fill(0);
  for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) b[i] += inv[i][j] * Xty[j];
  let rss = 0, tss = 0; const ybar = mean(y);
  for (let t = 0; t < n; t++) { let yh = 0; for (let i = 0; i < p; i++) yh += X[t][i] * b[i]; rss += (y[t] - yh) ** 2; tss += (y[t] - ybar) ** 2; }
  const s2 = rss / (n - p), se = b.map((_, i) => Math.sqrt(Math.max(0, s2 * inv[i][i]))), t = b.map((v, i) => v / se[i]);
  return { alpha: b[0], betas: b.slice(1), se: se.slice(1), t: t.slice(1), alphaT: t[0], alphaP: 2 * (1 - nCDF(Math.abs(t[0]))), r2: 1 - rss / tss, n };
}

// ── labelling (same rules as the Skope site summary) ──────────────────────────
export function styleLabel(reg) {
  const S = {}; FACTORS.forEach((f, i) => (S[f] = { b: reg.betas[i], sig: Math.abs(reg.t[i]) >= 1.96 }));
  const pos = f => S[f] && S[f].sig && S[f].b > 0, neg = f => S[f] && S[f].sig && S[f].b < 0;
  let style = '';
  if (pos('HML') && pos('RMW')) style = 'quality-value';
  else if (pos('HML') && neg('RMW')) style = 'deep-value';
  else if (pos('HML')) style = 'value';
  else if (neg('HML') && pos('MOM')) style = 'growth-momentum';
  else if (neg('HML')) style = 'growth';
  else if (pos('RMW') && pos('CMA')) style = 'quality-compounder';
  else if (pos('MOM')) style = 'momentum';
  else if (pos('RMW')) style = 'quality';
  else if (neg('RMW')) style = 'low-quality';
  let size = pos('SMB') ? 'small-cap' : neg('SMB') ? 'large-cap' : '';
  const mb = S.MKT.b; let risk = !S.MKT.sig ? '' : mb < 0.8 ? 'defensive' : mb >= 1.2 ? 'high-beta' : '';
  if (pos('SMB') && S.MKT.sig && mb >= 1.2) { size = 'speculative small-cap'; risk = ''; }
  const words = [risk, size, style].filter(Boolean);
  return { style: style || 'core', words: words.length ? words.join(' ') : 'market-like' };
}
function mainTilt(reg) {
  // strongest significant style factor for a single holding
  let best = null;
  FACTORS.slice(1).forEach((f, j) => { const i = j + 1; if (Math.abs(reg.t[i]) >= 1.96 && (!best || Math.abs(reg.t[i]) > Math.abs(best.t))) best = { f, b: reg.betas[i], t: reg.t[i] }; });
  if (!best) return 'no clear style';
  const map = { SMB: ['small-cap', 'large-cap'], HML: ['value', 'growth'], RMW: ['profitable', 'low profitability'], CMA: ['conservative investor', 'aggressive investor'], MOM: ['momentum', 'contrarian'] };
  return map[best.f][best.b > 0 ? 0 : 1];
}

// ── the report ────────────────────────────────────────────────────────────────
// input: holdings [{ticker, weight(%)}], daily {TICKER: cleanDaily[]}, bench {ticker, daily},
//        ff {ym: [mkt,smb,hml,rmw,cma,rf]}, mom {ym: [mom]}, frequency, prev (previous metrics|null)
export function analyze({ holdings, daily, bench, ff, mom, frequency = 'weekly', prev = null, asOf = new Date() }) {
  const curYM = asOf.toISOString().slice(0, 4) + asOf.toISOString().slice(5, 7);
  const W = holdings.map(h => ({ ticker: h.ticker, w: h.weight / 100 }));
  const totW = W.reduce((s, h) => s + h.w, 0); W.forEach(h => (h.w /= totW));
  const mret = {}; for (const h of W) mret[h.ticker] = monthlyReturns(daily[h.ticker], { dropMonth: curYM });
  const bret = monthlyReturns(bench.daily, { dropMonth: curYM });
  // months where every holding, the benchmark and the factors exist
  const months = Object.keys(bret).filter(ym => ff[ym] && mom[ym] && W.every(h => mret[h.ticker][ym] !== undefined)).sort().slice(-60);
  if (months.length < 24) throw new Error(`Only ${months.length} months of overlapping history; need at least 24.`);
  const rp = months.map(ym => W.reduce((s, h) => s + h.w * mret[h.ticker][ym], 0));
  const rb = months.map(ym => bret[ym]);
  const rf = months.map(ym => ff[ym][5]);
  const F = { MKT: months.map(ym => ff[ym][0]), SMB: months.map(ym => ff[ym][1]), HML: months.map(ym => ff[ym][2]), RMW: months.map(ym => ff[ym][3]), CMA: months.map(ym => ff[ym][4]), MOM: months.map(ym => mom[ym][0]) };
  const X = FACTORS.map(f => F[f]);
  const reg = ols(rp.map((r, i) => r - rf[i]), X);
  const regB = ols(rb.map((r, i) => r - rf[i]), X);
  const n = months.length;
  const ann = a => Math.pow(a.reduce((s, r) => s * (1 + r), 1), 12 / a.length) - 1;
  let peak = 1, v = 1, mdd = 0; for (const r of rp) { v *= 1 + r; peak = Math.max(peak, v); mdd = Math.min(mdd, v / peak - 1); }
  const active = rp.map((r, i) => r - rb[i]), te = sd(active) * Math.sqrt(12);
  // attribution of annualized excess return: beta_k * mean(f_k) * 12, plus alpha
  const attribution = FACTORS.map((f, i) => ({ factor: f, contrib: reg.betas[i] * mean(F[f]) * 12 }));
  attribution.push({ factor: 'ALPHA', contrib: reg.alpha * 12 });
  // per-holding regressions
  const perHolding = W.map(h => {
    const y = months.map((ym, i) => mret[h.ticker][ym] - rf[i]);
    let r = null; try { r = ols(y, X); } catch (e) { /* ignore */ }
    const nd = frequency === 'monthly' ? 21 : 5;
    return { ticker: h.ticker, weight: h.w, beta: r ? r.betas[0] : null, tilt: r ? mainTilt(r) : 'n/a', period: periodReturn(daily[h.ticker], nd) };
  }).sort((a, b) => b.weight - a.weight);
  // concentration + hidden overlap
  const ws = W.map(h => h.w).sort((a, b) => b - a);
  const effN = 1 / W.reduce((s, h) => s + h.w * h.w, 0);
  const groups = {}; perHolding.forEach(h => { if (h.tilt !== 'no clear style' && h.tilt !== 'n/a') (groups[h.tilt] = groups[h.tilt] || []).push(h); });
  const overlaps = Object.entries(groups).map(([tilt, hs]) => ({ tilt, tickers: hs.map(h => h.ticker), weight: hs.reduce((s, h) => s + h.weight, 0) }))
    .filter(g => g.tickers.length >= 2 && g.weight >= 0.35).sort((a, b) => b.weight - a.weight);
  // this period
  const nd = frequency === 'monthly' ? 21 : 5;
  const pPer = W.reduce((s, h) => { const r = periodReturn(daily[h.ticker], nd); return r == null ? s : s + h.w * r; }, 0);
  const bPer = periodReturn(bench.daily, nd);
  const exposures = FACTORS.map((f, i) => ({ factor: f, beta: reg.betas[i], t: reg.t[i], sig: Math.abs(reg.t[i]) >= 1.96, bench: regB.betas[i], active: reg.betas[i] - regB.betas[i] }));
  const label = styleLabel(reg);
  const metrics = {
    asOf: asOf.toISOString().slice(0, 10), firstMonth: months[0], lastMonth: months[n - 1], n,
    benchmark: bench.ticker, frequency,
    period: { days: nd, port: pPer, bench: bPer },
    annReturn: ann(rp), benchAnnReturn: ann(rb), vol: sd(rp) * Math.sqrt(12), maxDD: mdd,
    trackingError: te, infoRatio: te > 0 ? (mean(active) * 12) / te : null,
    alphaAnn: reg.alpha * 12, alphaT: reg.alphaT, alphaP: reg.alphaP, r2: reg.r2,
    exposures, attribution, label,
    concentration: { largest: ws[0], top3: ws.slice(0, 3).reduce((s, x) => s + x, 0), effN, count: W.length },
    overlaps, perHolding,
    holdingsKey: W.map(h => `${h.ticker}:${(h.w * 100).toFixed(1)}`).join(','),
  };
  metrics.changes = compare(metrics, prev);
  return metrics;
}

// what changed since the previous report
export function compare(cur, prev) {
  const f2 = v => (v < 0 ? '−' : '') + Math.abs(v).toFixed(2);
  if (!prev) return { first: true, items: [] };
  const items = [];
  if (prev.holdingsKey && prev.holdingsKey !== cur.holdingsKey) items.push('Your holdings or weights changed since the last report, so some of the shifts below come from that.');
  for (const e of cur.exposures) {
    const p = (prev.exposures || []).find(x => x.factor === e.factor); if (!p) continue;
    const d = e.beta - p.beta;
    if (Math.abs(d) >= 0.1) items.push(`${FACTOR_LABEL[e.factor]} exposure ${d > 0 ? 'rose' : 'fell'} from ${f2(p.beta)} to ${f2(e.beta)}.`);
  }
  if (prev.label && prev.label.words !== cur.label.words) items.push(`Overall profile shifted from "${prev.label.words}" to "${cur.label.words}".`);
  if (prev.concentration && Math.abs(cur.concentration.effN - prev.concentration.effN) >= 1) items.push(`Effective number of holdings moved from ${prev.concentration.effN.toFixed(1)} to ${cur.concentration.effN.toFixed(1)}.`);
  return { first: false, items, prevDate: prev.asOf };
}
