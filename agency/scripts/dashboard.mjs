// Lead dashboard generator: merges every candidates-*.csv and audited-*.csv
// in leads/data/ into a single local CRM page.
//
//   node scripts/dashboard.mjs        ->  leads/data/dashboard.html
//
// Open the file in a browser. Statuses, notes, demo URLs and follow-up dates
// are edited right in the page and saved to the browser's localStorage
// (export/import buttons give you a tracker.json backup). The page also
// builds copy-paste outreach emails personalized per lead.
//
// Everything stays in leads/data/ (gitignored) — real business data never
// leaves your machine.
import fs from 'node:fs'
import path from 'node:path'
import { agencyRoot, parseCsv, loadConfig } from './lib.mjs'

const config = loadConfig()
const dataDir = path.join(agencyRoot(), 'leads', 'data')
if (!fs.existsSync(dataDir)) {
  console.error('leads/data/ is empty — run discover.mjs (and audit.mjs) first.')
  process.exit(1)
}

const files = fs.readdirSync(dataDir).filter((f) => /^(candidates|audited)-.*\.csv$/.test(f))
if (!files.length) {
  console.error('No candidates-*.csv or audited-*.csv in leads/data/ — run discover.mjs first.')
  process.exit(1)
}

// Merge by businessId. Audited rows beat candidate rows; newer files beat older.
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
const leadList = [...leads.values()].map(({ _audited, ...r }) => r)

// tracker.json can be the old flat map or the exported bundle {tracker, manualLeads}
let tracker = {}
const trackerFile = path.join(dataDir, 'tracker.json')
if (fs.existsSync(trackerFile)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(trackerFile, 'utf8'))
    tracker = parsed.tracker && typeof parsed.tracker === 'object' ? parsed.tracker : parsed
    for (const m of parsed.manualLeads || []) {
      if (m.businessId && !leads.has(m.businessId)) leadList.push(m)
    }
  } catch { tracker = {} }
}

// one lead per line: diff-friendly and safe for line-based tooling
const payload =
  `window.__LEADS__=[\n${leadList.map((l) => JSON.stringify(l)).join(',\n')}\n];\n` +
  `window.__TRACKER__=${JSON.stringify(tracker)};\n` +
  `window.__CONFIG__=${JSON.stringify({
    price: config.pricing.site.recommended,
    maint: config.pricing.hostingPerMonth,
    region: config.region
  })};`

// Output goes to its own folder containing ONLY the dashboard, so deploying
// it can never accidentally upload the raw CSVs/tracker.json sitting in
// leads/data/. Keep Vercel Deployment Protection ON for this project — the
// page contains your real prospect list.
//
// The shell (index.html) is static across regenerations; only data.js
// changes when you re-run discovery/audit.
const tpl = fs.readFileSync(path.join(agencyRoot(), 'templates', 'dashboard.html'), 'utf8')
const html = tpl.replace('<script>/*__DATA__*/</script>', '<script src="data.js"></script>')
const outDir = path.join(dataDir, 'dashboard')
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'index.html'), html)
fs.writeFileSync(path.join(outDir, 'data.js'), payload + '\n')
fs.writeFileSync(path.join(outDir, 'robots.txt'), 'User-agent: *\nDisallow: /\n')
fs.writeFileSync(
  path.join(outDir, 'vercel.json'),
  JSON.stringify({
    cleanUrls: true,
    headers: [{ source: '/(.*)', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }]
  }, null, 2) + '\n'
)

const audited = leadList.filter((l) => l.auditStatus).length
console.log(`Dashboard: ${leadList.length} leads (${audited} audited) from ${files.length} file(s)`)
console.log(`Open it:    ${path.join(outDir, 'index.html')}`)
console.log(`Put online: npm run dashboard:deploy   (keep Vercel Deployment Protection ON)`)
