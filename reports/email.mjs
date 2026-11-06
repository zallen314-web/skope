// Skope report email (HTML, inline styles, email-client safe).
import { FACTOR_LABEL } from './core.mjs';

const G = '#1d4433', INK = '#111111', MUT = '#6a6f6b', RULE = '#dfe3df', POS = '#2e7d4f', NEG = '#a12a2a';
const SERIF = "Georgia,'Times New Roman',serif", SANS = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pc = (v, d = 1) => { if (v == null || !isFinite(v)) return '—'; const a = Math.abs(v * 100).toFixed(d); return +a === 0 ? `${a}%` : `${v >= 0 ? '+' : '−'}${a}%`; };
const fx = (v, d = 2) => (v < 0 && +Math.abs(v).toFixed(d) !== 0 ? '−' : '') + Math.abs(v).toFixed(d);
const pcu = (v, d = 1) => (v == null || !isFinite(v) ? '—' : `${v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(d)}%`);
const sgn = (v, d = 2) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`;
const col = v => (v == null ? INK : v >= 0 ? POS : NEG);

function section(title, inner) {
  return `<tr><td style="padding:22px 32px 4px;border-top:1px solid ${RULE}">
    <div style="font:600 11px ${SANS};letter-spacing:.08em;text-transform:uppercase;color:${MUT};margin-bottom:10px">${title}</div>${inner}</td></tr>`;
}
const td = (v, o = {}) => `<td style="padding:6px 0;border-bottom:1px solid #eef0ee;font:${o.bold ? 600 : 400} 13px ${SANS};color:${o.color || INK};text-align:${o.right ? 'right' : 'left'}">${v}</td>`;
const th = (v, right) => `<td style="padding:4px 0 6px;border-bottom:1px solid ${RULE};font:600 11px ${SANS};color:${MUT};text-align:${right ? 'right' : 'left'}">${v}</td>`;

export function buildEmail(m, { siteUrl, unsubscribeUrl, ffThrough }) {
  const per = m.frequency === 'monthly' ? 'month' : 'week';
  const dateTxt = new Date(m.asOf + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const head = m.label.words.charAt(0).toUpperCase() + m.label.words.slice(1);
  const alphaTxt = m.alphaP < 0.05 ? (m.alphaAnn > 0 ? `positive alpha (${pc(m.alphaAnn)}/yr)` : `negative alpha (${pc(m.alphaAnn)}/yr)`) : 'no reliable alpha';
  const beta = m.exposures[0].beta;
  const openUrl = `${siteUrl}?p=${encodeURIComponent(m.holdingsKey)}&b=${m.benchmark}`;

  const changes = m.changes.first
    ? `<p style="margin:0;font:400 14px/1.6 ${SANS};color:${INK}">This is your first report, so it sets the baseline. Future reports will show how your exposures shift from here.</p>`
    : m.changes.items.length
      ? `<ul style="margin:0;padding-left:18px;font:400 14px/1.6 ${SANS};color:${INK}">${m.changes.items.map(i => `<li style="margin-bottom:4px">${esc(i)}</li>`).join('')}</ul>`
      : `<p style="margin:0;font:400 14px/1.6 ${SANS};color:${INK}">No meaningful change in your exposures since ${new Date(m.changes.prevDate + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.</p>`;

  const expRows = m.exposures.map(e => `<tr>${td(FACTOR_LABEL[e.factor])}${td(fx(e.beta), { right: true, bold: e.sig })}${td(fx(e.bench), { right: true, color: MUT })}${td(sgn(e.active), { right: true, color: Math.abs(e.active) >= 0.15 ? INK : MUT, bold: Math.abs(e.active) >= 0.15 })}</tr>`).join('');

  const maxAbs = Math.max(...m.attribution.map(a => Math.abs(a.contrib)), 0.0001);
  const attrRows = m.attribution.map(a => {
    const w = Math.round((Math.abs(a.contrib) / maxAbs) * 120);
    const bar = `<span style="display:inline-block;height:8px;width:${Math.max(w, 2)}px;background:${a.contrib >= 0 ? G : NEG};opacity:.8;border-radius:1px"></span>`;
    return `<tr>${td(a.factor === 'ALPHA' ? 'Alpha (stock selection)' : FACTOR_LABEL[a.factor], { bold: a.factor === 'ALPHA' })}<td style="padding:6px 10px;border-bottom:1px solid #eef0ee">${bar}</td>${td(pc(a.contrib), { right: true, color: col(a.contrib) })}</tr>`;
  }).join('');

  const c = m.concentration;
  const conc = [
    `Largest holding: <b>${pcu(c.largest)}</b> &nbsp;·&nbsp; Top 3: <b>${pcu(c.top3)}</b> &nbsp;·&nbsp; Effective number of holdings: <b>${c.effN.toFixed(1)}</b> of ${c.count}`,
    ...m.overlaps.map(o => `<span style="color:${NEG}">Overlap:</span> ${pcu(o.weight, 0)} of the portfolio (${o.tickers.join(', ')}) leans the same way: <b>${esc(o.tilt)}</b>. These holdings tend to move together.`),
  ].map(t => `<p style="margin:0 0 8px;font:400 14px/1.6 ${SANS};color:${INK}">${t}</p>`).join('');

  const hRows = m.perHolding.map(h => `<tr>${td(`<b>${esc(h.ticker)}</b>`)}${td(pcu(h.weight), { right: true })}${td(pc(h.period), { right: true, color: col(h.period) })}${td(h.beta == null ? '—' : fx(h.beta), { right: true })}${td(esc(h.tilt), { right: true, color: MUT })}</tr>`).join('');

  return `<!doctype html><html><body style="margin:0;background:#f4f5f3">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f3;padding:24px 0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff">
  <tr><td style="background:${G};padding:22px 32px">
    <span style="font:600 26px ${SERIF};color:#fff">Skope</span>
    <span style="float:right;font:400 12px/34px ${SANS};color:rgba(255,255,255,.75)">${m.frequency === 'monthly' ? 'Monthly' : 'Weekly'} portfolio report · ${dateTxt}</span>
  </td></tr>
  <tr><td style="padding:26px 32px 18px">
    <div style="font:400 12px ${SANS};color:${MUT};margin-bottom:6px">This ${per}</div>
    <div style="font:400 30px ${SERIF};color:${col(m.period.port)}">${pc(m.period.port, 2)} <span style="font:400 14px ${SANS};color:${MUT}">vs ${esc(m.benchmark)} ${pc(m.period.bench, 2)}</span></div>
    <div style="font:400 20px/1.35 ${SERIF};color:${INK};margin-top:16px">${esc(head)} portfolio, ${alphaTxt}.</div>
    <div style="font:400 12px ${SANS};color:${MUT};margin-top:6px">Based on ${m.n} months of returns (${m.firstMonth.slice(4)}/${m.firstMonth.slice(0, 4)} to ${m.lastMonth.slice(4)}/${m.lastMonth.slice(0, 4)}), Fama-French five factors plus momentum.</div>
  </td></tr>
  ${section('What changed', changes)}
  ${section('Your exposures', `<table width="100%" cellpadding="0" cellspacing="0"><tr>${th('Factor')}${th('You', 1)}${th(esc(m.benchmark), 1)}${th('Difference', 1)}</tr>${expRows}</table>
    <p style="margin:8px 0 0;font:400 11px ${SANS};color:${MUT}">Bold = statistically significant at 5%. Large differences from ${esc(m.benchmark)} are what make your returns behave differently from the index.</p>`)}
  ${section('Where your returns came from', `<table width="100%" cellpadding="0" cellspacing="0">${attrRows}</table>
    <p style="margin:8px 0 0;font:400 11px ${SANS};color:${MUT}">Annualized contribution to your return above cash: each factor's beta times that factor's average return over the period. Factors explain ${(m.r2 * 100).toFixed(0)}% of your monthly return variation.</p>`)}
  ${section('Risk', `<p style="margin:0 0 8px;font:400 14px/1.6 ${SANS};color:${INK}">If the market falls 10%, your factor beta of <b>${beta.toFixed(2)}</b> implies roughly a <b>${(beta * 10).toFixed(1)}%</b> drop.</p>
    <p style="margin:0;font:400 14px/1.6 ${SANS};color:${INK}">Volatility <b>${pcu(m.vol)}</b>/yr &nbsp;·&nbsp; Worst drawdown <b>${pcu(m.maxDD)}</b> &nbsp;·&nbsp; Tracking error vs ${esc(m.benchmark)} <b>${pcu(m.trackingError)}</b> &nbsp;·&nbsp; Return <b>${pc(m.annReturn)}</b>/yr vs ${esc(m.benchmark)} <b>${pc(m.benchAnnReturn)}</b>/yr</p>`)}
  ${section('Concentration', conc)}
  ${section('Holdings', `<table width="100%" cellpadding="0" cellspacing="0"><tr>${th('Ticker')}${th('Weight', 1)}${th('This ' + per, 1)}${th('Beta', 1)}${th('Main tilt', 1)}</tr>${hRows}</table>`)}
  <tr><td style="padding:24px 32px 28px;border-top:1px solid ${RULE}" align="left">
    <a href="${openUrl}" style="display:inline-block;background:${G};color:#fff;text-decoration:none;font:600 14px ${SANS};padding:11px 20px;border-radius:4px">Open the full analysis in Skope</a>
  </td></tr>
  <tr><td style="padding:16px 32px 24px;background:#fafbfa;border-top:1px solid ${RULE};font:400 11px/1.6 ${SANS};color:${MUT}">
    Prices: Twelve Data. Factors: Kenneth R. French Data Library, released monthly with a lag (data through ${esc(ffThrough)}). Portfolio assumes constant weights rebalanced monthly.
    Skope is for informational and educational purposes only and is not investment advice.<br>
    <a href="${unsubscribeUrl}" style="color:${MUT}">Unsubscribe</a> · <a href="${siteUrl}" style="color:${MUT}">Skope</a>
  </td></tr>
</table></td></tr></table></body></html>`;
}

export function buildSubject(m) {
  const per = m.frequency === 'monthly' ? 'month' : 'week';
  return `Skope: your portfolio ${pc(m.period.port, 1)} this ${per} (${m.benchmark} ${pc(m.period.bench, 1)})`;
}
