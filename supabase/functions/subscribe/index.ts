// POST {email, frequency, benchmark, holdings:[{ticker, weight}]}
// Saves the request as UNCONFIRMED and emails a confirmation link (double opt-in),
// so nobody can sign someone else up. Changing an existing subscription also needs re-confirming.
import { button, cors, db, EmailError, emailShell, esc, FN, json, sendEmail } from '../_shared/util.ts';

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i, TICKER = /^[A-Z][A-Z0-9.\-]{0,9}$/;

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  let b: any; try { b = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const email = String(b.email || '').trim().toLowerCase();
  const frequency = b.frequency === 'monthly' ? 'monthly' : 'weekly';
  const benchmark = ['SPY', 'QQQ', 'IWM'].includes(b.benchmark) ? b.benchmark : 'SPY';
  if (!EMAIL.test(email)) return json({ error: 'Please enter a valid email address.' }, 400);
  if (!Array.isArray(b.holdings) || b.holdings.length < 1 || b.holdings.length > 15) return json({ error: 'Add between 1 and 15 holdings.' }, 400);
  const holdings = b.holdings.map((h: any) => ({ ticker: String(h.ticker || '').trim().toUpperCase(), weight: Math.round(Number(h.weight) * 100) / 100 }));
  if (holdings.some((h: any) => !TICKER.test(h.ticker) || !(h.weight > 0))) return json({ error: 'Each holding needs a valid ticker and a weight above 0.' }, 400);
  if (new Set(holdings.map((h: any) => h.ticker)).size !== holdings.length) return json({ error: 'Each ticker can only appear once.' }, 400);
  const total = holdings.reduce((s: number, h: any) => s + h.weight, 0);
  if (Math.abs(total - 100) > 0.5) return json({ error: `Weights add up to ${total.toFixed(1)}%. They need to total 100%.` }, 400);

  try {
    const existing = await db(`subscribers?email=eq.${encodeURIComponent(email)}&select=id,created_at,confirmed`);
    const token = crypto.randomUUID();
    if (existing.length) {
      const prev = existing[0];
      await db(`subscribers?id=eq.${prev.id}`, { method: 'PATCH', body: JSON.stringify({ frequency, benchmark, holdings, confirmed: false, confirm_token: token, created_at: new Date().toISOString() }) });
    } else {
      await db('subscribers', { method: 'POST', body: JSON.stringify({ email, frequency, benchmark, holdings, confirm_token: token }) });
    }
    const list = holdings.map((h: any) => `${esc(h.ticker)} ${h.weight}%`).join(', ');
    await sendEmail(email, 'Confirm your Skope portfolio reports', emailShell(
      `<p style="margin:0 0 14px">Confirm that you'd like <b>${frequency}</b> Skope reports on this portfolio, compared against <b>${benchmark}</b>:</p>
       <p style="margin:0 0 20px;color:#3e4340">${list}</p>
       <p style="margin:0 0 22px">${button(`${FN}/confirm?token=${token}`, 'Confirm my reports')}</p>
       <p style="margin:0;font-size:13px;color:#6a6f6b">If you didn't request this, ignore this email and nothing will be sent.</p>`));
    return json({ ok: true, message: 'Almost done: check your inbox for a confirmation link.' });
  } catch (e) {
    console.error(e);
    if (e instanceof EmailError) return json({ error: `Your request was saved, but the confirmation email couldn't be sent: ${e.message}` }, 502);
    return json({ error: 'Something went wrong saving your request. Please try again.' }, 500);
  }
});
