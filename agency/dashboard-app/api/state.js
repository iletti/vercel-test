// Shared state store for the leads dashboard, backed by Vercel KV (Upstash
// Redis) over its REST API. Deployed as a Vercel serverless function.
//
// GET  /api/state           -> { configured, state }
// PUT  /api/state  { ... }   -> merges the body into stored state, returns merged
//
// Access is gated by Vercel Deployment Protection (the whole deployment,
// including /api, requires the owner's Vercel login). The KV token lives only
// in this function's server-side env — it is never sent to the browser.
//
// If no KV store is connected yet, every call returns { configured:false } and
// the dashboard falls back to browser-local storage (and says so in its badge).
//
// NOTE: mergeState is kept in sync with scripts/leads.mjs.

const KEY = 'agency:state:v1'

function creds() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  return { url, token }
}

async function kv(cmd) {
  const { url, token } = creds()
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  })
  if (!r.ok) throw new Error(`kv ${r.status}`)
  const j = await r.json()
  return j.result
}

function mergeLeads(a, b) {
  if (!b) return a || []
  const m = new Map((a || []).map((x) => [x.businessId, x]))
  for (const x of b) m.set(x.businessId, { ...m.get(x.businessId), ...x })
  return [...m.values()]
}

function mergeState(base, inc) {
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

function readBody(req) {
  return new Promise((resolve) => {
    let d = ''
    req.on('data', (c) => { d += c })
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')) } catch { resolve({}) } })
    req.on('error', () => resolve({}))
  })
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  const { url, token } = creds()
  if (!url || !token) { res.statusCode = 200; return res.end(JSON.stringify({ configured: false })) }
  try {
    const raw = await kv(['GET', KEY])
    const cur = raw ? JSON.parse(raw) : { leads: [], tracker: {}, manualLeads: [], settings: {}, rev: 0 }
    if (req.method === 'GET') {
      res.statusCode = 200
      return res.end(JSON.stringify({ configured: true, state: cur }))
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const inc = req.body && typeof req.body === 'object' ? req.body : await readBody(req)
      const merged = mergeState(cur, inc)
      await kv(['SET', KEY, JSON.stringify(merged)])
      res.statusCode = 200
      return res.end(JSON.stringify({ configured: true, state: merged }))
    }
    res.statusCode = 405
    return res.end(JSON.stringify({ error: 'method not allowed' }))
  } catch (e) {
    res.statusCode = 500
    return res.end(JSON.stringify({ configured: true, error: String(e && e.message || e) }))
  }
}
