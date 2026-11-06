// GET ?token=...  → activates the subscription, then sends the visitor back to the Skope site,
// which shows the result. (Supabase serves function HTML as plain text, so no pages are rendered here.)
import { db, SITE } from '../_shared/util.ts';

const UUID = /^[0-9a-f-]{36}$/i;
const go = (q: string) => new Response(null, { status: 302, headers: { Location: `${SITE}?${q}`, 'Cache-Control': 'no-store' } });

Deno.serve(async req => {
  const token = new URL(req.url).searchParams.get('token') || '';
  if (!UUID.test(token)) return go('status=invalid');
  try {
    const rows = await db(`subscribers?confirm_token=eq.${token}`, { method: 'PATCH', body: JSON.stringify({ confirmed: true, confirmed_at: new Date().toISOString() }) });
    if (!rows.length) return go('status=expired');
    const s = rows[0];
    return go(`status=subscribed&f=${encodeURIComponent(s.frequency)}&b=${encodeURIComponent(s.benchmark)}`);
  } catch (e) {
    console.error(e);
    return go('status=error');
  }
});
