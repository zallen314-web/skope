// GET ?ticker=AAPL → latest earnings release highlights (numbers, management quotes, guidance)
// and 10-K risk-factor headings, quoted word for word from SEC filings.
import { cors, json } from '../_shared/util.ts';
import { lookupCik } from '../_shared/sec.ts';
import { getHighlights } from '../_shared/filings.ts';

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
    const c = await lookupCik(t);
    if (!c) return reply({ ok: false, reason: 'No SEC filings for this ticker.' });
    const h = await getHighlights(c.cik);
    const body = { ok: true, data: { ticker: t, ...h } };
    CACHE.set(t, { at: Date.now(), body });
    return reply(body);
  } catch (e) {
    console.error(t, e);
    return json({ error: 'SEC filings are temporarily unavailable.', detail: String((e as Error)?.message || e) }, 502);
  }
});

const reply = (body: unknown) => new Response(JSON.stringify(body), {
  headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=21600' },
});
