// GET ?ticker=AAPL → five years of daily prices plus a live quote, fetched with Skope's own
// Twelve Data key, so a visitor without a key can try one real stock.
// Limits protect the key (which the weekly reports also use): 3 runs per visitor per day, 250 in total.
import { cors, json, db } from '../_shared/util.ts';

const TICKER = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const PER_VISITOR = 3, PER_DAY = 250;
const CACHE = new Map<string, { at: number; body: unknown }>();   // same ticker within 30 min costs nothing

async function visitorId(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const raw = new TextEncoder().encode(`skope-demo|${ip}|${req.headers.get('user-agent') || ''}`);
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', raw));
  return [...h.slice(0, 12)].map(b => b.toString(16).padStart(2, '0')).join('');   // no raw IPs are stored
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const key = Deno.env.get('TWELVEDATA_API_KEY');
  if (!key) return json({ error: "The live example isn't available right now." }, 503);
  const t = (new URL(req.url).searchParams.get('ticker') || '').toUpperCase().trim();
  if (!TICKER.test(t)) return json({ error: 'Enter a valid US ticker, like AAPL.' }, 400);

  const day = new Date().toISOString().slice(0, 10), visitor = await visitorId(req);
  let mine = 0, total = 0;
  try {
    const rows: { visitor: string; n: number }[] = await db(`demo_usage?day=eq.${day}&select=visitor,n`);
    for (const r of rows) { total += r.n; if (r.visitor === visitor) mine = r.n; }
  } catch (e) { console.error('usage read', e); return json({ error: "The live example isn't available right now." }, 503); }
  if (mine >= PER_VISITOR) return json({ error: "You've used today's free live analyses. Add your own free Twelve Data key to keep going.", limit: true }, 429);
  if (total >= PER_DAY) return json({ error: 'The free live example is at capacity for today. Add your own free Twelve Data key, or try again tomorrow.', limit: true }, 429);

  let body: any = CACHE.get(t);
  if (body && Date.now() - body.at < 30 * 60e3) body = body.body;
  else {
    const td = (path: string) => fetch(`https://api.twelvedata.com/${path}&apikey=${key}`).then(r => r.json());
    const [series, quote] = await Promise.all([
      td(`time_series?symbol=${encodeURIComponent(t)}&interval=1day&outputsize=1260&order=ASC`),
      td(`quote?symbol=${encodeURIComponent(t)}`),
    ]);
    if (series.status === 'error' || !series.values) {
      const busy = /credits|limit/i.test(series.message || '');
      return json({ error: busy ? 'The live example is busy right now. Please try again in a minute.' : `Couldn't find price data for ${t}. Try a US-listed stock or ETF, like AAPL or SPY.` }, busy ? 503 : 404);
    }
    body = { ok: true, ticker: t, series, quote };
    CACHE.set(t, { at: Date.now(), body });
  }
  try {
    await db('demo_usage?on_conflict=day,visitor', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ day, visitor, n: mine + 1 }) });
  } catch (e) { console.error('usage write', e); }
  return json(body);
});
