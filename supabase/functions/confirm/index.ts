// GET ?token=...  → activates the subscription.
import { db, page, SITE } from '../_shared/util.ts';

const UUID = /^[0-9a-f-]{36}$/i;

Deno.serve(async req => {
  const token = new URL(req.url).searchParams.get('token') || '';
  if (!UUID.test(token)) return page('Link not valid', 'This confirmation link is incomplete. Try the link in your email again, or sign up again on Skope.');
  try {
    const rows = await db(`subscribers?confirm_token=eq.${token}`, { method: 'PATCH', body: JSON.stringify({ confirmed: true, confirmed_at: new Date().toISOString() }) });
    if (!rows.length) return page('Link expired', `This link has already been used or was replaced by a newer one. <a href="${SITE}" style="color:#1d4433">Back to Skope</a>`);
    const s = rows[0];
    return page("You're subscribed", `Your <b>${s.frequency}</b> Skope report will arrive ${s.frequency === 'weekly' ? 'every Monday morning' : 'on the first Monday of each month'}, comparing your portfolio with <b>${s.benchmark}</b>.
      <br><br>Every report has an unsubscribe link at the bottom. <a href="${SITE}" style="color:#1d4433">Back to Skope</a>`);
  } catch (e) {
    console.error(e);
    return page('Something went wrong', 'Please try the link again in a minute.');
  }
});
