# Weekly operating loop (RUNBOOK)

This is the repeatable cycle. Steps 1, 3, 4 and 6 are fully automated; steps
2 and 5 are where a human (or an AI session with web search) adds judgment.
Budget: ~half a day per week once warmed up.

## 1. Discover (automated, ~15 min unattended)

```bash
cd agency
node scripts/discover.mjs            # all municipalities in config.json
```

Rotate focus: full sweep monthly, then weekly re-runs only for the towns you
are actively working (`node scripts/discover.mjs Pori Ulvila`). New
registrations show up with fresh `registered` dates — recently founded
companies are excellent prospects (they need a site and know it).

## 2. Fill in web presence (AI-assisted, ~30 min per 100 candidates)

The audit script guesses obvious domains itself, but for candidates it can't
resolve, search `"<name>" <town>` and record what you find in the CSV
`website` column (their real site, or blank if they truly have none — a
Facebook page alone still counts as blank, but note it in `notes`).

This step is ideal for a Claude session: *"Open
leads/data/candidates-pori-<date>.csv, web-search each business with an empty
website column, fill in real sites, mark Facebook-only businesses in notes."*

## 3. Audit & rank (automated)

```bash
node scripts/audit.mjs leads/data/candidates-pori-*.csv
```

Read `leads/data/report-<date>.md`. Work statuses in this order:
**NO_SITE** (best: no incumbent to compare against) → **BROKEN** →
**OUTDATED** → **WEAK**. Verify every `websiteSource=guess` row by eye before
believing it.

## 4. Build demos (automated, ~10 min per lead)

Pick 5–15 leads per week — quality of the profile beats quantity of demos.
For each:

```bash
cp leads/example.lead.json leads/data/<slug>.lead.json
# edit: real name, Y-tunnus, phone (from their FB/directory), services you
# KNOW they offer, honest neutral copy. No invented claims, no stolen photos.
node scripts/images.mjs leads/data/<slug>.lead.json   # optional hero image (GEMINI_API_KEY)
node scripts/generate.mjs leads/data/<slug>.lead.json          # or --template bold
open sites/<slug>/index.html                                    # eyeball it
```

Content rules for cold demos — this is what makes the page look *expert*
instead of *generic*, and keeps it honest:

- **stats / certifications / testimonials / priceList: only what you can
  verify.** In a cold demo that usually means leaving testimonials out and
  putting `[täydennetään]`-style placeholders in the pricing — or filling
  pricing with industry-typical "alk." prices and saying so in the pitch.
  The full sections light up when the customer supplies real facts after
  the sale; the demo shows them *where their content will go*.
- **faq**: safe to write — questions every customer in that industry asks
  (vasteaika, tarjouksen sitovuus, irtisanominen). This section does the
  most "expertise" work per line, and it emits FAQPage JSON-LD.
- **AI hero images** are generic industry scenes by design (no text, no
  logos, no faces). Never imply they are the prospect's premises or staff;
  they are placeholders the customer's real photos replace at delivery.

Alternate templates and palettes so demos in the same town don't look like
siblings. Then deploy per [DEPLOY.md](DEPLOY.md) — you get a
`https://<slug>-xxxx.vercel.app` URL.

## 5. Outreach (human, the actual work)

- Log every lead in your tracker (copy `outreach/tracking-template.csv`, or
  import into your CRM).
- **Oy** → email `outreach/1-ensikontakti.fi.md`. **Tmi** → call with
  `outreach/2-soittorunko.fi.md` (legal requirement, see README, and it
  converts better).
- Follow-ups on day 5–7 and day 14 (`outreach/3-seuranta.fi.md`). After the
  day-14 message, **actually delete** the demo deployment and mark
  `closed-removed`.
- Any "ei kiitos" → `do-not-contact`, permanently.

## 6. Deliver & maintain

Sale closed → get photos/exact info → set `demoBanner: false` → regenerate →
customer's own domain (registered in *their* name) → invoice → add to the
maintenance rota. Maintenance = you re-edit the JSON and redeploy; minutes of
work, 25 €/kk.

## Weekly KPIs to write down

new candidates · hot leads · demos shipped · conversations · sales ·
MRR (maintenance). If demos ship but conversations don't happen, the
bottleneck is always step 5 — do more calls, not more demos.
