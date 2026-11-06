// Shared helpers for Skope edge functions.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically by Supabase.
// Set these yourself (Edge Functions → Secrets): RESEND_API_KEY, EMAIL_FROM, SITE_URL.

export const SB = Deno.env.get('SUPABASE_URL')!;
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
export const SITE = (Deno.env.get('SITE_URL') || 'https://zallen314-web.github.io/skope/').replace(/\/?$/, '/');
export const FN = `${SB}/functions/v1`;

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
};
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export async function db(path: string, opts: RequestInit = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: SRK, ...(SRK.startsWith('eyJ') ? { Authorization: `Bearer ${SRK}` } : {}), 'Content-Type': 'application/json', Prefer: 'return=representation', ...(opts.headers || {}) },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`db ${r.status}: ${t}`);
  return t ? JSON.parse(t) : null;
}

export async function sendEmail(to: string, subject: string, html: string) {
  const r = await fetch(Deno.env.get('RESEND_URL') || 'https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: Deno.env.get('EMAIL_FROM'), to: [to], subject, html }),
  });
  if (!r.ok) throw new Error(`resend ${r.status}: ${await r.text()}`);
}

const G = '#1d4433', SERIF = "Georgia,'Times New Roman',serif", SANS = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
export const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]);

// simple branded page for confirm / unsubscribe
export function page(title: string, body: string) {
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Skope</title></head>
<body style="margin:0;background:#f4f5f3;font-family:${SANS};color:#111">
<div style="background:${G};padding:22px 28px"><a href="${SITE}" style="font:600 26px ${SERIF};color:#fff;text-decoration:none">Skope</a></div>
<div style="max-width:560px;margin:48px auto;padding:0 24px"><h1 style="font:400 28px ${SERIF};margin:0 0 14px">${esc(title)}</h1>
<div style="font-size:15px;line-height:1.6;color:#3e4340">${body}</div></div></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// branded transactional email shell
export function emailShell(inner: string) {
  return `<!doctype html><html><body style="margin:0;background:#f4f5f3"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#fff">
<tr><td style="background:${G};padding:20px 28px;font:600 24px ${SERIF};color:#fff">Skope</td></tr>
<tr><td style="padding:26px 28px;font:400 15px/1.6 ${SANS};color:#111">${inner}</td></tr>
<tr><td style="padding:14px 28px 20px;border-top:1px solid #dfe3df;font:400 11px/1.6 ${SANS};color:#6a6f6b">Skope is for informational and educational purposes only and is not investment advice.</td></tr>
</table></td></tr></table></body></html>`;
}
export const button = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;background:${G};color:#fff;text-decoration:none;font:600 14px ${SANS};padding:11px 20px;border-radius:4px">${esc(label)}</a>`;
