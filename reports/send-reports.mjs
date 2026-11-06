// Skope report job. Runs on GitHub Actions (weekly cron) or by hand.
//   node send-reports.mjs                 → send to everyone who is due today
//   node send-reports.mjs --force         → send to every confirmed subscriber now
//   node send-reports.mjs --only=a@b.com  → just this subscriber (implies --force)
//   node send-reports.mjs --dry-run       → build reports, write HTML to ./out, send nothing, save nothing
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TWELVEDATA_API_KEY, RESEND_API_KEY, EMAIL_FROM, SITE_URL
import { strFromU8, unzipSync } from 'fflate';
import { mkdirSync, writeFileSync } from 'node:fs';
import { analyze, cleanDaily, parseFrenchMonthly } from './core.mjs';
import { buildEmail, buildSubject } from './email.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const DRY = !!args['dry-run'], ONLY = typeof args.only === 'string' ? args.only.toLowerCase() : null, FORCE = !!args.force || !!ONLY;
const env = k => { const v = process.env[k]; if (!v && !(DRY && ['RESEND_API_KEY', 'EMAIL_FROM'].includes(k))) throw new Error(`Missing env ${k}`); return v; };
const SB = env('SUPABASE_URL').replace(/\/$/, ''), SRK = env('SUPABASE_SERVICE_ROLE_KEY');
const SITE = (process.env.SITE_URL || 'https://zallen314-web.github.io/skope/').replace(/\/?$/, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ── Supabase REST (service role: bypasses RLS, server-side only) ──────────────
async function db(path, opts = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...opts, headers: { apikey: SRK, ...(SRK.startsWith('eyJ') ? { Authorization: `Bearer ${SRK}` } : {}), 'Content-Type': 'application/json', Prefer: 'return=representation', ...(opts.headers || {}) } });
  const t = await r.text(); if (!r.ok) throw new Error(`Supabase ${r.status}: ${t}`); return t ? JSON.parse(t) : null;
}

// ── data sources ──────────────────────────────────────────────────────────────
async function frenchZip(name) {
  const url = `https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/${name}_CSV.zip`;
  const r = await fetch(url); if (!r.ok) throw new Error(`French ${name}: HTTP ${r.status}`);
  const files = unzipSync(new Uint8Array(await r.arrayBuffer()));
  return parseFrenchMonthly(strFromU8(Object.values(files)[0]));
}
let lastTD = 0; const tdCache = {};
async function prices(ticker) {
  if (tdCache[ticker]) return tdCache[ticker];
  const key = env('TWELVEDATA_API_KEY');
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = lastTD + 8000 - Date.now(); if (wait > 0) await sleep(wait);   // free plan: 8 requests / minute
    lastTD = Date.now();
    const r = await fetch(`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(ticker)}&interval=1day&outputsize=1400&order=asc&apikey=${key}`);
    const d = await r.json();
    if (d.status === 'error') { if (d.code === 429) { await sleep(20000); continue; } throw new Error(`${ticker}: ${d.message}`); }
    return (tdCache[ticker] = cleanDaily(d.values || []));
  }
  throw new Error(`${ticker}: rate limited`);
}

// ── email ─────────────────────────────────────────────────────────────────────
async function sendEmail(to, subject, html, unsubscribeUrl) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env('EMAIL_FROM'), to: [to], subject, html, headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
}

const isDue = (s, today) => s.frequency === 'weekly' || today.getUTCDate() <= 7;   // monthly = first Monday of the month

async function main() {
  const today = new Date();
  let subs = await db('subscribers?confirmed=eq.true&select=id,email,frequency,benchmark,holdings,unsubscribe_token');
  if (ONLY) subs = subs.filter(s => s.email.toLowerCase() === ONLY);
  if (!FORCE) subs = subs.filter(s => isDue(s, today));
  log(`${subs.length} subscriber(s) to process${DRY ? ' (dry run)' : ''}`);
  if (!subs.length) return;

  log('Loading Fama-French factors from the Ken French Data Library...');
  const [ff, mom] = [await frenchZip('F-F_Research_Data_5_Factors_2x3'), await frenchZip('F-F_Momentum_Factor')];
  const lastYM = Object.keys(ff).sort().pop();
  const ffThrough = new Date(Date.UTC(+lastYM.slice(0, 4), +lastYM.slice(4), 0)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  log(`Factors through ${ffThrough}`);

  let ok = 0, failed = 0;
  for (const s of subs) {
    try {
      const holdings = s.holdings.map(h => ({ ticker: String(h.ticker).toUpperCase(), weight: +h.weight }));
      const daily = {}; for (const h of holdings) daily[h.ticker] = await prices(h.ticker);
      const bench = { ticker: s.benchmark, daily: await prices(s.benchmark) };
      const prevRows = await db(`snapshots?subscriber_id=eq.${s.id}&select=metrics&order=created_at.desc&limit=1`);
      const m = analyze({ holdings, daily, bench, ff, mom, frequency: s.frequency, prev: prevRows[0]?.metrics || null, asOf: today });
      const unsub = `${SB}/functions/v1/unsubscribe?token=${s.unsubscribe_token}`;
      const html = buildEmail(m, { siteUrl: SITE, unsubscribeUrl: unsub, ffThrough }), subject = buildSubject(m);
      if (DRY) { mkdirSync('out', { recursive: true }); writeFileSync(`out/${s.email.replace(/[^a-z0-9]/gi, '_')}.html`, html); log(`[dry] ${s.email}: ${subject}`); }
      else {
        await sendEmail(s.email, subject, html, unsub);
        await db('snapshots', { method: 'POST', body: JSON.stringify({ subscriber_id: s.id, metrics: m }) });
        await db(`subscribers?id=eq.${s.id}`, { method: 'PATCH', body: JSON.stringify({ last_sent_at: today.toISOString() }) });
        log(`Sent to ${s.email}: ${subject}`);
      }
      ok++;
    } catch (e) { failed++; console.error(`Failed for ${s.email}: ${e.message}`); }
  }
  log(`Done: ${ok} sent, ${failed} failed`);
  if (failed && !ok) process.exit(1);
}
main().catch(e => { console.error(e); process.exit(1); });
