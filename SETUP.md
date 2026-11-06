# Setting up Skope's email reports

How it fits together:

| Piece | Where it runs | What it does |
|---|---|---|
| `index.html` | GitHub Pages | The Skope site. The Portfolio tab has an **Email reports** form. |
| `supabase/functions/subscribe` | Supabase | Saves a sign-up as *unconfirmed* and emails a confirmation link. |
| `supabase/functions/confirm` | Supabase | Activates the subscription when the link is clicked. |
| `supabase/functions/unsubscribe` | Supabase | Deletes the subscriber and their history (with a confirm button). |
| `supabase/schema.sql` | Supabase database | `subscribers` and `snapshots` tables, RLS on, no public access. |
| `reports/` | GitHub Actions, Mondays | Pulls prices + Fama-French factors, runs the analysis, emails the report, saves a snapshot so next week can show what changed. |

Keys never go in the code. They live in **Supabase secrets** and **GitHub secrets**.

---

## 1. Create the tables (Supabase)
Supabase dashboard → **SQL Editor** → **New query** → paste all of `supabase/schema.sql` → **Run**.

## 2. Let GitHub deploy the functions
1. Supabase → your avatar → **Account preferences → Access Tokens** → **Generate new token** (name it `github-skope`). Copy it.
2. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `SUPABASE_ACCESS_TOKEN`, Value: the token.

## 3. Secrets the functions need (Supabase)
Supabase → **Edge Functions → Secrets** → add:

| Name | Value |
|---|---|
| `RESEND_API_KEY` | Resend → API Keys → Create (Sending access) |
| `EMAIL_FROM` | `Skope <onboarding@resend.dev>` until you verify your own domain in Resend |
| `SITE_URL` | `https://zallen314-web.github.io/skope/` |

## 4. Secrets the weekly job needs (GitHub)
GitHub repo → **Settings → Secrets and variables → Actions** → add:

| Name | Value |
|---|---|
| `SB_SERVICE_ROLE_KEY` | Supabase → Project Settings → **API Keys** → the **secret** key (or legacy `service_role` key) |
| `TWELVEDATA_KEY` | your Twelve Data key |
| `RESEND_API` | same Resend key as above |
| `EMAIL_FROM` | same as above |

## 5. Deploy and test
1. GitHub → **Actions → Deploy Supabase functions → Run workflow**. It should finish green.
2. Open Skope → **Portfolio** tab → add holdings → **Email me reports** with the email you used to sign up for Resend.
   (With the `onboarding@resend.dev` sender, Resend only delivers to that address.)
3. Click the confirmation link in the email.
4. GitHub → **Actions → Portfolio reports → Run workflow** → put your email in *only_email* → Run. The report arrives in a minute or two.

After that it runs on its own every Monday morning. Monthly subscribers get theirs on the first Monday of the month.

## Notes
- **Free-plan limits:** Twelve Data allows ~8 requests a minute, so the job waits 8 seconds between tickers. Fine for you and a handful of people.
- **Sending to other people** needs your own domain verified in Resend, then change `EMAIL_FROM` to e.g. `Skope <reports@yourdomain.com>` in both places.
- **Preview without sending:** run the *Portfolio reports* workflow with *dry_run* checked; the emails are attached to the run as `report-previews`.
- **Local test (no keys needed):** `cd reports && npm install && npm test` builds sample reports from simulated holdings into `reports/out/`.
