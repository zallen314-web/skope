# Skope

Factor, risk and valuation analysis for any US stock, ETF or portfolio, in the browser.

**Live site:** https://zallen314-web.github.io/skope/

- **What's driving returns:** CAPM through Fama-French five-factor + momentum regressions, with a written summary of the exposures.
- **How it behaves under stress:** return distribution, skewness, fat tails, Jarque-Bera, normal vs. historical VaR.
- **How a portfolio fits together:** custom-weight portfolios vs. SPY, QQQ or IWM, with tracking error and information ratio.
- **What you're paying for it:** valuation multiples, margins and growth next to the factor results.
- **Download report:** a two-page PDF of any analysis.

No API key? Click **See an example** on the homepage to run a simulated stock with known factor exposures.

## Data
- Prices and fundamentals: [Twelve Data](https://twelvedata.com) (each user supplies their own free API key, stored only in their browser).
- Factor returns: [Kenneth R. French Data Library](https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html), bundled in the page.

Built by Zach Allen. For informational and educational purposes only; not investment advice.

## Email reports
Subscribe from the Portfolio tab to get a weekly or monthly email with your portfolio's return vs. the benchmark, factor exposures vs. the index, where returns came from, risk, concentration and hidden overlap, and what changed since last time. Built with Supabase (subscribers, double opt-in), GitHub Actions (scheduled job) and Resend (email). See [SETUP.md](SETUP.md).
