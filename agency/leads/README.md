# leads/

- `lead.schema.json` — the profile format `generate.mjs` consumes.
- `example.lead.json` — fictional example; drives the committed demo site.
- `data/` — **real pipeline output (candidate CSVs, audit reports, real lead
  profiles). Gitignored on purpose:** a public repo must never contain a
  ranked list of real, named businesses labeled "bad website", nor personal
  contact details. Keep `data/` local, or move it to a private CRM
  (Airtable/HubSpot/Notion) once volume grows.
