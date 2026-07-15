# Satakunta Website Agency — automated pipeline

A genuine, runnable version of the "find local businesses with bad/no websites,
build them a better one, pitch it" model, targeted at **Satakunta, Finland**
(and trivially expandable beyond it).

Everything here works today with zero paid APIs:

| Stage | Tool | What it does |
|-------|------|--------------|
| 1. Discover | `npm run discover` | Pulls every active company in Satakunta municipalities from the **PRH/YTJ open data API** (free, keyless), filtered to service industries that actually buy websites |
| 2. Audit | `npm run audit -- <csv>` | Finds which of them have **no site, a broken site, or an outdated site** (domain guessing + HTTPS/mobile/staleness checks), outputs a ranked opportunity report |
| 3. Build | `npm run generate -- <lead.json>` | Renders a tailored one-page Finnish site from a JSON profile — hero with trust stats, services, process, transparent pricing, FAQ (with FAQPage + LocalBusiness JSON-LD for Google), testimonials, credentials; 2 template designs, industry palettes, ~20 kB single file |
| 3b. Images | `npm run images -- <lead.json>` | Optional: one Nano Banana (Gemini) hero image per site — generic Nordic industry scene, no text/logos/faces, cached on disk. Needs `GEMINI_API_KEY`; sites render fine without |
| 4. Deploy | `vercel deploy` (see [DEPLOY.md](DEPLOY.md)) | Puts the demo on a temp URL, `noindex`ed, with an honest "this is a proposal" banner |
| 5. Pitch | [outreach/](outreach/) | Finnish first-touch email, call script, follow-ups, and a tracking CSV — with the Finnish e-marketing law rules baked in |

Operating loop: [RUNBOOK.md](RUNBOOK.md). Deployment: [DEPLOY.md](DEPLOY.md).

## Why Satakunta works for this

- ~210 000 residents, 17 municipalities: Pori (~83 k) and Rauma (~39 k) plus a
  long tail of small towns (Kankaanpää, Huittinen, Ulvila, Eura, …) that
  Helsinki/Tampere agencies ignore.
- The registry shows **thousands** of active companies per town (Pori alone:
  ~5 800 registered entities). After filtering to owner-operated service
  businesses, hundreds of realistic prospects remain — and in small towns a
  large share still have only a Facebook page or a 2010-era site.
- Local presence is the moat: "soitan Porista" beats any cold email from
  Helsinki. Small-town word of mouth compounds — 3 referenceable customers in
  Kankaanpää effectively closes Kankaanpää.

Scaling out: add municipalities to `config.json` (`expansionMunicipalities`
already lists the neighboring ring: Laitila, Uusikaupunki, Sastamala, Parkano,
Ikaalinen, Loimaa). The PRH API covers all of Finland.

## Unit economics (suggested, edit `config.json`)

- Site, delivered: **490–1190 €** (+ VAT 25.5 %), recommend anchoring at 690 €.
- Hosting/maintenance: **25 €/kk** — this is the real business. 40 maintenance
  customers ≈ 1 000 €/kk recurring for near-zero marginal work (static sites
  on Vercel's free/Pro tier cost you ≈ 0–20 €/month total).
- Upsells: domain+email setup 90 €, Google Business Profile setup 120 €,
  extra pages 90 €/page, logo refresh 150 €.
- Realistic funnel from the field: 100 audited candidates → ~30 hot
  (NO_SITE/BROKEN/OUTDATED) → 30 demos (minutes each with the generator) →
  ~4–8 conversations → **2–4 sales**. Repeat weekly per municipality.

## Legal & ethics rails (Finland) — read before first outreach

1. **Sähköinen suoramarkkinointi:** email/SMS marketing to natural persons —
   **including Tmi sole traders** — requires prior consent (Act 917/2014
   § 200). Emailing an Oy's generic address about their business is fine.
   Practical rule: **Oy → email ok; Tmi → call, visit, or letter.** The call
   converts better anyway. Honor every opt-out immediately
   (`do-not-contact` status in the tracker) and keep proof.
2. **GDPR:** the pipeline stores only public registry data + business contact
   info (legitimate interest). Keep it in `leads/data/` (gitignored — never
   push a list of "businesses with bad websites" to a public repo), delete
   lost leads after ~6 months, and answer access/deletion requests.
3. **Demos:** never copy the business's logo, photos, or text into a demo
   without permission — the generator builds from registry facts + neutral
   copy you write. Demos ship `noindex` + a visible "sivustoehdotus" banner,
   and you delete them on request or after 2 weeks of silence. Never register
   a domain containing their trademark; use your own temp-domain pattern.
4. **Y-tunnus on everything you send.** You're a business; look like one.
   (Starting as kevytyrittäjä/laskutuspalvelu is fine for the first sales.)

## Repo layout

```
agency/
├── config.json            # region, industries, pricing — the only file you must edit
├── scripts/
│   ├── discover.mjs       # PRH registry -> candidate CSVs
│   ├── audit.mjs          # candidates -> ranked opportunity report
│   ├── generate.mjs       # lead JSON -> static site
│   └── lib.mjs            # curl-based HTTP (proxy-safe), CSV, slugs
├── templates/nordic/      # light, clean template
├── templates/bold/        # dark, high-contrast template
├── leads/
│   ├── lead.schema.json   # what a lead profile looks like
│   ├── example.lead.json  # fictional example (drives the committed demo)
│   └── data/              # real pipeline data — GITIGNORED on purpose
├── sites/                 # generated sites (real ones gitignored, demo committed)
└── outreach/              # FI email/call/follow-up scripts + tracking CSV
```

## Quick start

```bash
cd agency
node scripts/discover.mjs --limit-pages 5 Kankaanpää   # 2-minute sample
node scripts/discover.mjs                              # full Satakunta sweep
node scripts/audit.mjs leads/data/candidates-*.csv     # rank opportunities
cp leads/example.lead.json leads/data/acme.lead.json   # profile a hot lead
node scripts/generate.mjs leads/data/acme.lead.json --template bold
npx vercel deploy sites/<slug> --prod                  # see DEPLOY.md
```

No dependencies to install — the scripts use only Node ≥ 18 and `curl`.
