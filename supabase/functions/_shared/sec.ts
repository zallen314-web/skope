// Fundamentals from SEC EDGAR XBRL "company facts" (free, official filings).
// Pure logic + a fetcher; price-based ratios are computed by the caller with a live price.

export const SEC_UA = 'Skope reports@skoperesearch.com';
const DAY = 86400000;

type Fact = { start?: string; end: string; val: number; fy?: number; fp?: string; form?: string; filed: string; frame?: string };

const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / DAY;

// All USD (or USD/shares, shares) facts for the first concept in `names` that has data, de-duplicated by period.
function candidates(facts: any, names: string[], unit = 'USD', ns = 'us-gaap'): { name: string; list: Fact[] }[] {
  const all: { name: string; list: Fact[] }[] = [];
  for (const n of names) {
    const u = facts?.[ns]?.[n]?.units?.[unit] as Fact[] | undefined;
    if (!u || !u.length) continue;
    const by = new Map<string, Fact>();
    for (const f of u) {
      if (!['10-K', '10-Q', '10-K/A', '10-Q/A', '20-F', '40-F'].includes(f.form || '')) continue;
      const k = `${f.start || ''}|${f.end}`;
      const p = by.get(k);
      if (!p || f.filed > p.filed) by.set(k, f);       // latest filing wins (restatements)
    }
    const list = [...by.values()].sort((a, b) => a.end.localeCompare(b.end));
    if (!list.length) continue;
    all.push({ name: n, list });
  }
  // most recent data first (companies switch tags over time)
  return all.sort((a, b) => b.list[b.list.length - 1].end.localeCompare(a.list[a.list.length - 1].end));
}
function series(facts: any, names: string[], unit = 'USD', ns = 'us-gaap') {
  return candidates(facts, names, unit, ns)[0] || null;
}

// Trailing-twelve-months value of a flow concept as of `asOf` (period end), from annual + year-to-date facts.
function ttm(list: Fact[], asOf?: string): { val: number; end: string } | null {
  const dur = list.filter(f => f.start && (!asOf || f.end <= asOf));
  const annual = dur.filter(f => { const d = days(f.start!, f.end); return d > 350 && d < 380; });
  if (!annual.length) return null;
  const A = annual[annual.length - 1];
  // latest year-to-date period that starts right after A ends
  const ytd = dur.filter(f => f.end > A.end && Math.abs(days(A.end, f.start!) - 1) <= 7 && days(f.start!, f.end) < 350)
    .sort((a, b) => a.end.localeCompare(b.end));
  if (!ytd.length) return { val: A.val, end: A.end };
  const Y = ytd[ytd.length - 1];
  // same year-to-date period one year earlier (starts with A)
  const P = dur.find(f => Math.abs(days(A.start!, f.start!)) <= 7 && Math.abs(days(f.end, Y.end) - 365) <= 10 && days(f.start!, f.end) < 350);
  if (!P) return { val: A.val, end: A.end };
  return { val: A.val + Y.val - P.val, end: Y.end };
}

// Value for the three months ending on `end` (±7 days). Fiscal Q4 is usually only reported as a full year,
// so it is derived as full year minus the nine-month year-to-date figure.
function quarter(list: Fact[], end: string): number | null {
  const near = (a: string, b: string) => Math.abs(days(a, b)) <= 7;
  const q = list.filter(f => f.start && near(f.end, end) && days(f.start, f.end) > 75 && days(f.start, f.end) < 120);
  if (q.length) return q[q.length - 1].val;
  const A = list.find(f => f.start && near(f.end, end) && days(f.start, f.end) > 350 && days(f.start, f.end) < 380);
  if (!A) return null;
  const N = list.find(f => f.start && Math.abs(days(A.start!, f.start)) <= 7 && days(f.start, f.end) > 240 && days(f.start, f.end) < 300);
  return N ? A.val - N.val : null;
}
function quarterGrowth(list: Fact[], end: string): number | null {
  const cur = quarter(list, end);
  const prevEnd = new Date(Date.parse(end) - 364 * DAY).toISOString().slice(0, 10);
  const prev = quarter(list, prevEnd) ?? quarter(list, new Date(Date.parse(end) - 365 * DAY).toISOString().slice(0, 10));
  return cur != null && prev != null && prev > 0 ? cur / prev - 1 : null;
}

// Latest point-in-time value (balance sheet items).
function instant(list: Fact[] | undefined, asOf?: string): { val: number; end: string } | null {
  const l = (list || []).filter(f => !f.start && (!asOf || f.end <= asOf));
  return l.length ? { val: l[l.length - 1].val, end: l[l.length - 1].end } : null;
}

const C = {
  revenue: ['Revenues', 'RevenuesNetOfInterestExpense', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueNet', 'SalesRevenueGoodsNet', 'TotalRevenuesAndOtherIncome'],
  netIncome: ['NetIncomeLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic', 'ProfitLoss'],
  opIncome: ['OperatingIncomeLoss'],
  pretax: ['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments'],
  interest: ['InterestExpense', 'InterestExpenseNonoperating', 'InterestExpenseDebt'],
  grossProfit: ['GrossProfit'],
  costOfRevenue: ['CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold', 'CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization'],
  ocf: ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'],
  capex: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'],
  da: ['DepreciationDepletionAndAmortization', 'DepreciationAndAmortization', 'DepreciationAmortizationAndAccretionNet', 'Depreciation'],
  dividends: ['PaymentsOfDividendsCommonStock', 'PaymentsOfDividends', 'PaymentsOfOrdinaryDividends', 'DividendsCommonStockCash', 'DividendsCommonStock'],
  equity: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],
  assets: ['Assets'],
  curAssets: ['AssetsCurrent'],
  curLiab: ['LiabilitiesCurrent'],
  cash: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents', 'Cash'],
  ltDebt: ['LongTermDebtNoncurrent', 'LongTermDebt'],
  stDebt: ['LongTermDebtCurrent', 'DebtCurrent', 'ShortTermBorrowings', 'CommercialPaper'],
};

export function computeFundamentals(cf: any) {
  const f = cf?.facts || {};
  const S = (k: keyof typeof C) => series(f, C[k]);
  const rev = S('revenue'), ni = S('netIncome');
  if (!rev && !ni) return null;
  // first tag (most recent first) that yields a trailing-twelve-month figure
  const T = (k: keyof typeof C, asOf?: string) => { for (const c of candidates(f, C[k])) { const r = ttm(c.list, asOf); if (r) return r; } return null; };

  const revT = T('revenue'), niT = T('netIncome');
  const asOf = [revT?.end, niT?.end].filter(Boolean).sort().pop();
  if (!asOf) return null;
  const yearAgo = new Date(Date.parse(asOf) - 365 * DAY + 10 * DAY).toISOString().slice(0, 10);
  const revP = T('revenue', yearAgo), niP = T('netIncome', yearAgo);
  // latest quarter revenue vs the same quarter a year earlier
  let revenueGrowthQ: number | null = null;
  for (const c of candidates(f, C.revenue)) { const g = quarterGrowth(c.list, revT ? revT.end : asOf); if (g != null) { revenueGrowthQ = g; break; } }
  // diluted EPS, trailing twelve months, and its change vs the prior twelve months
  let epsT: { val: number; end: string } | null = null, epsP: { val: number; end: string } | null = null;
  for (const c of candidates(f, ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted', 'EarningsPerShareBasic'], 'USD/shares')) {
    const a = ttm(c.list);
    if (a && Math.abs(days(a.end, asOf)) < 40) { epsT = a; epsP = ttm(c.list, yearAgo); break; }
  }
  const opT = T('opIncome'), corT = T('costOfRevenue'), gpT0 = T('grossProfit'), ocfT = T('ocf'), capT = T('capex'), daT = T('da'), divT = T('dividends'), ptT = T('pretax'), intT = T('interest');

  const inst = (k: keyof typeof C, at?: string) => instant(S(k)?.list, at);
  const eq = inst('equity'), assets = inst('assets'), ca = inst('curAssets'), cl = inst('curLiab'), cash = inst('cash');
  const ltd = inst('ltDebt'), std = inst('stDebt');
  // the same figures as of one year earlier, for year-over-year comparisons
  const opP = T('opIncome', yearAgo), ocfP = T('ocf', yearAgo), capP = T('capex', yearAgo), daP = T('da', yearAgo), corP = T('costOfRevenue', yearAgo), gpP0 = T('grossProfit', yearAgo);
  const eqP = inst('equity', yearAgo), cashP = inst('cash', yearAgo), ltdP = inst('ltDebt', yearAgo), stdP = inst('stDebt', yearAgo);

  // shares outstanding: dei cover-page count (summed across share classes on the same date), else weighted diluted
  let shares: number | null = null;
  const dei = f?.dei?.EntityCommonStockSharesOutstanding?.units?.shares as Fact[] | undefined;
  if (dei?.length) {
    const lastFiled = dei.reduce((m, x) => (x.filed > m ? x.filed : m), '');
    const latest = dei.filter(x => x.filed === lastFiled);
    const lastEnd = latest.reduce((m, x) => (x.end > m ? x.end : m), '');
    // only trust the cover-page count if it is recent
    if (Math.abs(days(lastEnd, asOf)) < 400) shares = latest.filter(x => x.end === lastEnd).reduce((s, x) => s + x.val, 0) || null;
  }
  if (!shares && niT && niT.val > 0) {
    // implied share count: TTM net income / TTM diluted EPS
    for (const c of candidates(f, ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted', 'EarningsPerShareBasic'], 'USD/shares')) {
      const e = ttm(c.list);
      if (e && e.val > 0 && Math.abs(days(e.end, niT.end)) < 40) { shares = niT.val / e.val; break; }
    }
  }
  if (!shares) {
    const w = series(f, ['WeightedAverageNumberOfDilutedSharesOutstanding', 'WeightedAverageNumberOfSharesOutstandingBasic'], 'shares');
    if (w && Math.abs(days(w.list[w.list.length - 1].end, asOf)) < 200) shares = w.list[w.list.length - 1].val;
  }

  const v = (x: { val: number } | null) => (x ? x.val : null);
  // gross profit: reported line, else revenue minus cost of revenue (same period only)
  const gpT = gpT0 && revT && Math.abs(days(gpT0.end, revT.end)) < 40 ? gpT0
    : revT && corT && Math.abs(days(corT.end, revT.end)) < 40 ? { val: revT.val - corT.val, end: revT.end } : null;
  const recent = (k: string) => { const c = candidates(f, [k])[0]; return !!c && Math.abs(days(c.list[c.list.length - 1].end, asOf)) < 400; };
  const isBank = recent('Deposits') || recent('InterestAndDividendIncomeOperating');
  const debt = (v(ltd) || 0) + (v(std) || 0);
  const growth = (a: { val: number } | null, b: { val: number } | null) => (a && b && b.val > 0 ? a.val / b.val - 1 : null);

  return {
    source: 'SEC EDGAR',
    name: cf.entityName,
    cik: cf.cik,
    periodEnd: asOf,
    revenueTTM: v(revT), netIncomeTTM: v(niT), operatingIncomeTTM: v(opT), grossProfitTTM: v(gpT),
    operatingCashFlowTTM: v(ocfT), capexTTM: v(capT), freeCashFlowTTM: ocfT && !isBank ? ocfT.val - (v(capT) || 0) : null,
    ebitdaTTM: daT && !isBank ? (opT ? opT.val + daT.val : ptT ? ptT.val + (v(intT) || 0) + daT.val : null) : null, dividendsTTM: v(divT),
    revenueGrowth: growth(revT, revP), earningsGrowth: growth(niT, niP), revenueGrowthQ,
    prev: (() => {
      const near = (a: { end: string } | null, b: { end: string } | null) => !!a && !!b && Math.abs(days(a.end, b.end)) < 40;
      const gp = gpP0 && near(gpP0, revP) ? gpP0.val : revP && corP && near(corP, revP) ? revP.val - corP.val : null;
      return {
        periodEnd: revP ? revP.end : niP ? niP.end : null,
        revenueTTM: v(revP), netIncomeTTM: v(niP), operatingIncomeTTM: near(opP, revP) ? v(opP) : null, grossProfitTTM: gp,
        freeCashFlowTTM: ocfP && !isBank ? ocfP.val - (v(capP) || 0) : null,
        ebitdaTTM: daP && opP && !isBank ? opP.val + daP.val : null,
        epsTTM: v(epsP), equity: v(eqP), cash: v(cashP), debt: ltdP || stdP ? (v(ltdP) || 0) + (v(stdP) || 0) : null,
      };
    })(),
    epsTTM: v(epsT), epsGrowth: epsT && epsP && epsP.val > 0 ? epsT.val / epsP.val - 1 : null,
    equity: v(eq), assets: v(assets), currentAssets: v(ca), currentLiabilities: v(cl), cash: v(cash), debt: ltd || std ? debt : null,
    shares, isBank,
  };
}

// ── network ──────────────────────────────────────────────────────────────────
import TICKER_MAP from './tickers.json' with { type: 'json' };

// Ticker -> CIK from the bundled map (refreshed weekly); the live SEC list is only a fallback
// for tickers listed since the last refresh, because sec.gov rate-limits shared cloud servers.
let LIVE: Record<string, number> | null = null;
let LIVE_AT = 0;

export async function lookupCik(ticker: string, fetcher = fetch) {
  const t = ticker.toUpperCase(), keys = [t, t.replace('.', '-'), t.replace('-', '.')];
  const M = TICKER_MAP as Record<string, number>;
  for (const k of keys) if (M[k]) return { cik: M[k] };
  if (!LIVE || Date.now() - LIVE_AT > DAY) {
    try {
      const r = await fetcher('https://www.sec.gov/files/company_tickers.json', { headers: { 'User-Agent': SEC_UA } });
      if (r.ok) { const j = await r.json(); LIVE = {}; for (const k of Object.keys(j)) LIVE[String(j[k].ticker).toUpperCase()] = j[k].cik_str; LIVE_AT = Date.now(); }
    } catch { /* fall through */ }
  }
  for (const k of keys) if (LIVE?.[k]) return { cik: LIVE[k] };
  return null;
}

// Companies that re-registered under a new holding company: successor CIK -> predecessor CIK.
// The successor's early filings lack full-year history, so the predecessor's facts fill it in.
export const PREDECESSOR: Record<number, number> = { 2115436: 34088 }; // ExxonMobil Holdings <- Exxon Mobil Corp

async function facts(cik: number, fetcher: typeof fetch, tries = 2): Promise<any> {
  const r = await fetcher(`https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, '0')}.json`, { headers: { 'User-Agent': SEC_UA } });
  if (r.status === 404) return null;
  if (!r.ok) {
    if (tries > 1) { await new Promise(res => setTimeout(res, 600)); return facts(cik, fetcher, tries - 1); }
    throw new Error(`SEC company facts HTTP ${r.status}`);
  }
  return r.json();
}

function merge(succ: any, pred: any) {
  if (!pred) return succ;
  const out = { ...succ, facts: { ...succ.facts } };
  for (const ns of ['us-gaap']) {
    const a = pred.facts?.[ns] || {}, b = succ.facts?.[ns] || {}, m: any = {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const units: any = {};
      for (const u of new Set([...Object.keys(a[k]?.units || {}), ...Object.keys(b[k]?.units || {})]))
        units[u] = [...(a[k]?.units?.[u] || []), ...(b[k]?.units?.[u] || [])];
      m[k] = { units };
    }
    out.facts[ns] = m;
  }
  return out;
}

export async function getFundamentals(ticker: string, fetcher = fetch) {
  const hit = await lookupCik(ticker, fetcher);
  if (!hit) return null;
  let cf = await facts(hit.cik, fetcher);
  if (!cf) return null;
  if (PREDECESSOR[hit.cik]) cf = merge(cf, await facts(PREDECESSOR[hit.cik], fetcher));
  const out = computeFundamentals(cf);
  return out ? { ticker: ticker.toUpperCase(), ...out } : null;
}
