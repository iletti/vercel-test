// Push discovered/audited leads into the shared cloud store (Vercel KV), so
// the online dashboard shows them on every device. Preserves all your pipeline
// edits (statuses, notes, follow-ups) — leads are merged by businessId, the
// tracker is left untouched.
//
//   npm run push        # reads leads/data/*.csv, merges into the cloud store
//
// Needs KV credentials. Put them in agency/.env.local (gitignored):
//   KV_REST_API_URL=https://...upstash.io
//   KV_REST_API_TOKEN=xxxxxxxx
// (Copy these from Vercel: Storage -> your KV store -> ".env.local" tab.)
import path from 'node:path'
import { agencyRoot, loadEnvLocal, kvConfigured, kvGetState, kvSetState } from './lib.mjs'
import { collectLeads, mergeState } from './leads.mjs'

loadEnvLocal()

if (!kvConfigured()) {
  console.error('KV not configured. Add KV_REST_API_URL and KV_REST_API_TOKEN to agency/.env.local')
  console.error('(Vercel dashboard -> Storage -> your KV store -> ".env.local" tab.) See SYNC-SETUP.md')
  process.exit(1)
}

const KEY = 'agency:state:v1'
const leads = collectLeads(path.join(agencyRoot(), 'leads', 'data'))
if (!leads.length) {
  console.error('No leads found in leads/data/ — run discover.mjs (and audit.mjs) first.')
  process.exit(1)
}

const current = await kvGetState(KEY)
const before = current?.leads?.length || 0
const merged = mergeState(current, { leads })
await kvSetState(KEY, merged)

console.log(`Pushed ${leads.length} leads to the cloud store.`)
console.log(`Cloud now holds ${merged.leads.length} leads (was ${before}), ${Object.keys(merged.tracker).length} tracked.`)
console.log('Open your dashboard on any device — it will refresh automatically.')
