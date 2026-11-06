// GET ?token=...  → redirects to the Skope site, which asks the visitor to confirm
//                   (email scanners that pre-open links can't unsubscribe anyone by accident).
// POST ?token=... → deletes the subscriber and all their snapshots. Used by the site's button
//                   and by one-click List-Unsubscribe in mail apps.
import { db, json, cors, SITE } from '../_shared/util.ts';

const UUID = /^[0-9a-f-]{36}$/i;

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const token = new URL(req.url).searchParams.get('token') || '';
  if (req.method === 'POST') {
    if (!UUID.test(token)) return json({ error: 'This unsubscribe link is incomplete.' }, 400);
    try {
      await db(`subscribers?unsubscribe_token=eq.${token}`, { method: 'DELETE' });
      return json({ ok: true });
    } catch (e) {
      console.error(e);
      return json({ error: 'Something went wrong. Please try again in a minute.' }, 500);
    }
  }
  const q = UUID.test(token) ? `unsubscribe=${token}` : 'status=invalid';
  return new Response(null, { status: 302, headers: { Location: `${SITE}?${q}`, 'Cache-Control': 'no-store' } });
});
