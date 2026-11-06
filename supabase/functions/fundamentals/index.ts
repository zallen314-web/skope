// GET ?ticker=AAPL → trailing-twelve-month fundamentals from SEC EDGAR filings (no key needed).
// Price-based ratios (P/E, P/S, EV/EBITDA...) are computed in the browser with the live price.
import { cors, json } from '../_shared/util.ts';
import { getFundamentals } from '../_shared/sec.ts';

const TICKER = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const CACHE = new Map<string, { at: number; body: unknown }>();
const TTL = 6 * 3600 * 1000;

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const t = (new URL(req.url).searchParams.get('ticker') || '').toUpperCase().trim();
  if (!TICKER.test(t)) return json({ error: 'Invalid ticker.' }, 400);
  const hit = CACHE.get(t);
  if (hit && Date.now() - hit.at < TTL) return reply(hit.body);
  try {
    const f = await getFundamentals(t);
    const body = f ? { ok: true, data: f } : { ok: false, reason: 'No SEC financial statements for this ticker (ETFs, funds and most foreign companies are not covered).' };
    CACHE.set(t, { at: Date.now(), body });
    return reply(body);
  } catch (e) {
    console.error(t, e);
    return json({ error: 'SEC data is temporarily unavailable.' }, 502);
  }
});

const reply = (body: unknown) => new Response(JSON.stringify(body), {
  headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=21600' },
});
