// GET ?token=...  → shows a confirm button (email scanners that pre-open links can't unsubscribe you by accident)
// POST ?token=... → deletes the subscriber and all their snapshots (also used by one-click List-Unsubscribe)
import { db, page, SITE } from '../_shared/util.ts';

const UUID = /^[0-9a-f-]{36}$/i;
const G = '#1d4433';

Deno.serve(async req => {
  const token = new URL(req.url).searchParams.get('token') || '';
  if (!UUID.test(token)) return page('Link not valid', 'This unsubscribe link is incomplete. Try the link in your email again.');
  if (req.method === 'POST') {
    try {
      await db(`subscribers?unsubscribe_token=eq.${token}`, { method: 'DELETE' });
      return page("You're unsubscribed", `You won't receive any more Skope reports, and your saved portfolio has been deleted. <a href="${SITE}" style="color:${G}">Back to Skope</a>`);
    } catch (e) {
      console.error(e);
      return page('Something went wrong', 'Please try again in a minute.');
    }
  }
  return page('Unsubscribe from Skope reports?', `This stops your reports and deletes your saved portfolio.
    <form method="POST" style="margin-top:22px"><button type="submit" style="background:${G};color:#fff;border:0;padding:11px 20px;border-radius:4px;font-size:14px;font-weight:600;cursor:pointer">Unsubscribe</button></form>`);
});
