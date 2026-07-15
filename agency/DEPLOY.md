# Deploying demos and customer sites

Generated sites are pure static files — `index.html`, `robots.txt`,
`vercel.json` — so any static host works. Vercel is the default here because
temp URLs are free, instant, and easy to delete.

## One-time setup

```bash
npm i -g vercel
vercel login
```

## Deploy a demo (temp URL for pitching)

```bash
cd agency
node scripts/generate.mjs leads/data/<slug>.lead.json
vercel deploy sites/<slug> --yes          # preview URL, fine for pitching
# or a stable-looking URL:
vercel deploy sites/<slug> --prod --yes   # <project>.vercel.app
```

Demo sites are generated with `robots.txt: Disallow /` and
`<meta name="robots" content="noindex">` (because `demoBanner: true`), so the
temp URL won't leak into Google and embarrass the prospect.

> **Gotcha — Deployment Protection:** if your Vercel account/team has
> "Vercel Authentication" protection on (it currently does), prospects will
> hit a login wall instead of the demo. For each demo project, open
> *Project → Settings → Deployment Protection* and set it to **Disabled**
> (or "Only Preview Deployments" and pitch with the production URL).

**Delete a demo** (promised in the follow-up flow):

```bash
vercel remove <project-name> --yes
```

## Going live after a sale

1. Edit the lead JSON: `demoBanner: false`, final copy, real photos
   (put images next to `index.html` in `sites/<slug>/` and reference them).
2. `node scripts/generate.mjs leads/data/<slug>.lead.json`
3. Register the customer's domain **in the customer's name** (e.g. via a
   Finnish registrar for .fi — Louhi, Zoner, domainhotelli). They own it; you
   administer it. This protects them and you.
4. `vercel deploy sites/<slug> --prod` and add the custom domain:
   `vercel domains add <domain> <project>`, then point DNS per Vercel's
   instructions.
5. Set up email forwarding (registrar feature or Cloudflare Email Routing) —
   `info@<domain>` → their existing address. This is the 90 € upsell.

## Alternatives

- **Cloudflare Pages / GitHub Pages** — equally fine and free for static
  files; use whatever you already know.
- Keep one Vercel project per customer. The free Hobby tier is technically
  non-commercial: once you have ~3 paying customers, move to Vercel Pro
  (20 $/mo) or Cloudflare Pages (free, commercial OK) — still far below one
  month of one customer's maintenance fee.
