// Shared lead-collection + state-merge logic, used by the local dashboard
// generator, the cloud push script, and mirrored in the serverless function.
import fs from 'node:fs'
import path from 'node:path'
import { parseCsv } from './lib.mjs'

// Merge every candidates-*.csv / audited-*.csv in a data dir into one lead
// list, keyed by businessId (audited rows beat candidate rows; newer files win).
export function collectLeads(dataDir) {
  if (!fs.existsSync(dataDir)) return []
  const files = fs.readdirSync(dataDir).filter((f) => /^(candidates|audited)-.*\.csv$/.test(f))
  const leads = new Map()
  for (const f of files.sort()) {
    const audited = f.startsWith('audited-')
    const rows = parseCsv(fs.readFileSync(path.join(dataDir, f), 'utf8'))
    for (const row of rows) {
      if (!row.businessId || !row.name) continue
      const existing = leads.get(row.businessId)
      if (existing && existing._audited && !audited) continue
      leads.set(row.businessId, { ...existing, ...row, _audited: audited || existing?._audited || false })
    }
  }
  return [...leads.values()].map(({ _audited, ...r }) => r)
}

// --- state merge (KEEP IN SYNC with dashboard-app/api/state.js) ---
// State shape: { leads:[], tracker:{id:{...,updatedAt}}, manualLeads:[], settings:{}, rev:0 }

export function mergeLeads(a = [], b) {
  if (!b) return a
  const m = new Map(a.map((x) => [x.businessId, x]))
  for (const x of b) m.set(x.businessId, { ...m.get(x.businessId), ...x })
  return [...m.values()]
}

export function mergeState(base, inc) {
  base = base || { leads: [], tracker: {}, manualLeads: [], settings: {}, rev: 0 }
  inc = inc || {}
  const tracker = { ...base.tracker }
  for (const [id, t] of Object.entries(inc.tracker || {})) {
    if (!tracker[id] || (t.updatedAt || '') >= (tracker[id].updatedAt || '')) tracker[id] = t
  }
  let settings = base.settings || {}
  if (inc.settings && (inc.settings.updatedAt || '') >= (settings.updatedAt || '')) settings = inc.settings
  return {
    leads: mergeLeads(base.leads, inc.leads),
    manualLeads: mergeLeads(base.manualLeads, inc.manualLeads),
    tracker,
    settings,
    rev: (base.rev || 0) + 1
  }
}
