// Website audit: takes a candidate CSV (from discover.mjs), figures out which
// businesses have no site / a broken site / an outdated site, and writes a
// ranked opportunity report.
//
// For rows with an empty `website` column it first tries obvious Finnish
// domain guesses (<company-name>.fi/.com/.net). A guess is only accepted when
// the page content actually mentions the company name, and it is marked
// websiteSource=guess so a human verifies it before outreach.
//
// Usage:
//   node scripts/audit.mjs leads/data/candidates-pori-2026-07-15.csv [more.csv ...]
import fs from 'node:fs'
import path from 'node:path'
import { httpGet, loadConfig, agencyRoot, sleep, parseCsv, toCsv, slugify, todayStamp } from './lib.mjs'

const config = loadConfig()
const files = process.argv.slice(2)
if (!files.length) {
  console.error('Usage: node scripts/audit.mjs <candidates.csv> [...]')
  process.exit(1)
}

const CURRENT_YEAR = new Date().getFullYear()

function analyzeHtml(html) {
  const flags = []
  let score = 100
  const lower = html.toLowerCase()

  if (!/<meta[^>]+viewport/i.test(html)) { flags.push('no-mobile-viewport'); score -= 30 }
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]?.trim() || ''
  if (!title) { flags.push('no-title'); score -= 10 }
  if (!/<meta[^>]+name=["']description["']/i.test(html)) { flags.push('no-meta-description'); score -= 10 }

  if (/<frameset|<table[^>]+(width=["']?\d{3}|cellpadding)/i.test(html)) { flags.push('90s-layout'); score -= 25 }
  if (lower.includes('kotisivukone')) flags.push('kotisivukone')
  if (lower.includes('wordpress')) flags.push('wordpress')
  if (/wix\.com|parastorage/.test(lower)) flags.push('wix')
  if (/nettisivu\.org|webnode|yhdistysavain/.test(lower)) flags.push('site-builder')

  const years = [...html.matchAll(/(?:©|&copy;|copyright)\D{0,20}(20\d\d)/gi)].map((m) => Number(m[1]))
  if (years.length) {
    const newest = Math.max(...years)
    if (newest < CURRENT_YEAR - config.audit.currentYearGrace) {
      flags.push(`stale-copyright-${newest}`)
      score -= 20
    }
  }
  if (html.length < 2000) { flags.push('near-empty-page'); score -= 20 }
  if (/facebook\.com\/[^"']+/i.test(html) && html.length < 6000) flags.push('mostly-facebook-link')

  return { flags, score: Math.max(0, score), title }
}

async function auditUrl(url) {
  let target = url
  if (!/^https?:\/\//i.test(target)) target = 'https://' + target
  const res = await httpGet(target, { timeout: config.audit.timeoutSeconds })
  if (res.error === 'TLS_ERROR') {
    // retry over plain http — a cert failure on the canonical domain is itself a finding
    const httpRes = await httpGet(target.replace(/^https:/i, 'http:'), { timeout: config.audit.timeoutSeconds })
    if (httpRes.ok) {
      const a = analyzeHtml(httpRes.body)
      return { status: 'OUTDATED', score: Math.max(0, a.score - 25), flags: ['broken-https', ...a.flags], finalUrl: httpRes.finalUrl, title: a.title }
    }
    return { status: 'BROKEN', score: 0, flags: ['tls-error'], finalUrl: target, title: '' }
  }
  if (res.error) return { status: 'BROKEN', score: 0, flags: [res.error.toLowerCase()], finalUrl: target, title: '' }
  if (!res.ok) return { status: 'BROKEN', score: 0, flags: [`http-${res.status}`], finalUrl: res.finalUrl, title: '' }
  if (!res.finalUrl.startsWith('https://')) { /* redirected to http */ }

  const a = analyzeHtml(res.body)
  const flags = [...a.flags]
  let score = a.score
  if (res.finalUrl.startsWith('http://')) { flags.push('no-https'); score -= 25 }
  const status = score >= 80 ? 'GOOD' : score >= 55 ? 'OK' : score >= 30 ? 'WEAK' : 'OUTDATED'
  return { status, score: Math.max(0, score), flags, finalUrl: res.finalUrl, title: a.title }
}

function nameAppearsIn(html, name) {
  const stem = name
    .replace(/\b(oy|ab|ky|tmi|t:mi|oyj)\b/gi, '')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 3)
  if (!stem.length) return false
  const lower = html.toLowerCase()
  return stem.every((w) => lower.includes(w.toLowerCase()))
}

async function guessDomain(row) {
  const base = slugify(row.name).replace(/-/g, '')
  const dashed = slugify(row.name)
  const candidates = new Set()
  for (const tld of config.audit.guessTlds) {
    candidates.add(`https://${base}${tld}`)
    if (dashed !== base) candidates.add(`https://${dashed}${tld}`)
    candidates.add(`https://www.${base}${tld}`)
  }
  for (const url of candidates) {
    const res = await httpGet(url, { timeout: 8 })
    if (res.ok && nameAppearsIn(res.body, row.name)) return res.finalUrl
    await sleep(150)
  }
  return ''
}

const outDir = path.join(agencyRoot(), 'leads', 'data')
const allRows = []

for (const file of files) {
  const rows = parseCsv(fs.readFileSync(file, 'utf8'))
  console.log(`Auditing ${rows.length} candidates from ${path.basename(file)}`)
  for (const row of rows) {
    if (!row.website) {
      const guessed = await guessDomain(row)
      if (guessed) {
        row.website = guessed
        row.websiteSource = 'guess'
      }
    }
    if (row.website) {
      const audit = await auditUrl(row.website)
      row.auditStatus = audit.status
      row.auditScore = String(audit.score)
      row.auditFlags = audit.flags.join(',')
      row.pageTitle = audit.title
      row.website = audit.finalUrl
    } else {
      row.auditStatus = 'NO_SITE'
      row.auditScore = '0'
      row.auditFlags = 'no-web-presence-found'
      row.pageTitle = ''
    }
    row.auditedAt = todayStamp()
    process.stdout.write(`  ${row.auditStatus.padEnd(8)} ${row.name}\n`)
    allRows.push(row)
    await sleep(200)
  }
}

const headers = ['businessId', 'name', 'companyForm', 'industryKey', 'industry',
  'street', 'postCode', 'city', 'registered', 'website', 'websiteSource',
  'auditStatus', 'auditScore', 'auditFlags', 'pageTitle', 'auditedAt', 'notes']

const priority = { NO_SITE: 0, BROKEN: 1, OUTDATED: 2, WEAK: 3, OK: 4, GOOD: 5 }
allRows.sort((a, b) => (priority[a.auditStatus] ?? 9) - (priority[b.auditStatus] ?? 9) || Number(a.auditScore) - Number(b.auditScore))

const stamp = todayStamp()
const csvOut = path.join(outDir, `audited-${stamp}.csv`)
fs.writeFileSync(csvOut, toCsv(allRows, headers))

const counts = {}
for (const r of allRows) counts[r.auditStatus] = (counts[r.auditStatus] || 0) + 1
const top = allRows.filter((r) => ['NO_SITE', 'BROKEN', 'OUTDATED', 'WEAK'].includes(r.auditStatus))

const report = [
  `# Opportunity report — ${stamp}`,
  '',
  `Audited **${allRows.length}** candidates. ` +
  Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(' · '),
  '',
  '| # | Business | Town | Industry | Status | Flags | Site |',
  '|---|----------|------|----------|--------|-------|------|',
  ...top.slice(0, 60).map((r, i) =>
    `| ${i + 1} | ${r.name} | ${r.city} | ${r.industryKey} | ${r.auditStatus} | ${r.auditFlags} | ${r.website || '—'} |`),
  '',
  '`websiteSource=guess` rows must be manually verified before any outreach.',
  ''
].join('\n')
const reportOut = path.join(outDir, `report-${stamp}.md`)
fs.writeFileSync(reportOut, report)

console.log(`\nWrote ${path.relative(process.cwd(), csvOut)} and ${path.relative(process.cwd(), reportOut)}`)
console.log(`Hot leads (NO_SITE/BROKEN/OUTDATED/WEAK): ${top.length}`)
