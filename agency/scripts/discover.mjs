// Lead discovery: pulls every registered company in the target municipalities
// from the PRH/YTJ open data API (free, no key), keeps active companies in the
// configured target industries, and writes a candidate CSV per municipality.
//
// Usage:
//   node scripts/discover.mjs                 # all municipalities in config
//   node scripts/discover.mjs Pori Rauma      # only these
//   node scripts/discover.mjs --limit-pages 5 Pori   # quick sample run
import fs from 'node:fs'
import path from 'node:path'
import { httpGetJson, loadConfig, agencyRoot, sleep, toCsv, todayStamp } from './lib.mjs'

const config = loadConfig()

const args = process.argv.slice(2)
let pageCap = config.prh.maxPagesPerMunicipality
const towns = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--limit-pages') pageCap = Number(args[++i])
  else towns.push(args[i])
}
const municipalities = towns.length ? towns : config.municipalities

const industryMatchers = config.targetIndustries.map((t) => ({
  key: t.key,
  re: new RegExp(t.match, 'i')
}))
const excludeFormRe = new RegExp(config.excludeCompanyForms, 'i')

function fiDescription(descriptions = []) {
  const fi = descriptions.find((d) => d.languageCode === '1')
  return (fi || descriptions[0] || {}).description || ''
}

function classify(company) {
  const industry = fiDescription(company.mainBusinessLine?.descriptions)
  for (const m of industryMatchers) {
    if (m.re.test(industry)) return { key: m.key, industry }
  }
  return null
}

function isActive(company) {
  // status "2" = registered/active in the v3 API; also drop companies with
  // situations (bankruptcy, liquidation, restructuring).
  if (company.companySituations?.length) return false
  if (company.tradeRegisterStatus === '3') return false // ceased
  return true
}

function pickAddress(company) {
  const addrs = company.addresses || []
  const visit = addrs.find((a) => a.type === 1) || addrs[0]
  if (!visit) return { street: '', postCode: '', city: '' }
  const street = [visit.street, visit.buildingNumber].filter(Boolean).join(' ')
  const city = visit.postOffices?.find((p) => p.languageCode === '1')?.city || ''
  return { street, postCode: visit.postCode || '', city }
}

async function discoverMunicipality(town) {
  const rows = []
  let page = 1
  let total = Infinity
  while ((page - 1) * 100 < total && page <= pageCap) {
    const url = `${config.prh.baseUrl}?location=${encodeURIComponent(town)}&page=${page}`
    const res = await httpGetJson(url, { timeout: 30 })
    if (!res.json) {
      console.error(`  ${town} page ${page}: ${res.error || res.status} — retrying once`)
      await sleep(2000)
      const retry = await httpGetJson(url, { timeout: 30 })
      if (!retry.json) { console.error(`  ${town} page ${page}: giving up`); break }
      res.json = retry.json
    }
    total = res.json.totalResults ?? 0
    for (const c of res.json.companies || []) {
      if (!isActive(c)) continue
      const form = fiDescription(c.companyForms?.[0]?.descriptions)
      if (excludeFormRe.test(form)) continue
      const hit = classify(c)
      if (!hit) continue
      const name = c.names?.[0]?.name
      if (!name) continue
      const addr = pickAddress(c)
      rows.push({
        businessId: c.businessId?.value || '',
        name,
        companyForm: form,
        industryKey: hit.key,
        industry: hit.industry,
        street: addr.street,
        postCode: addr.postCode,
        city: addr.city || town.toUpperCase(),
        registered: c.registrationDate || '',
        website: '',
        websiteSource: '',
        notes: ''
      })
    }
    process.stdout.write(`\r  ${town}: page ${page}/${Math.ceil(total / 100)} — ${rows.length} candidates`)
    page++
    await sleep(config.prh.pageDelayMs)
  }
  process.stdout.write('\n')
  return rows
}

const outDir = path.join(agencyRoot(), 'leads', 'data')
fs.mkdirSync(outDir, { recursive: true })

const headers = ['businessId', 'name', 'companyForm', 'industryKey', 'industry',
  'street', 'postCode', 'city', 'registered', 'website', 'websiteSource', 'notes']

let grandTotal = 0
for (const town of municipalities) {
  console.log(`Discovering: ${town}`)
  const rows = await discoverMunicipality(town)
  rows.sort((a, b) => a.industryKey.localeCompare(b.industryKey) || a.name.localeCompare(b.name))
  const file = path.join(outDir, `candidates-${town.toLowerCase()}-${todayStamp()}.csv`)
  fs.writeFileSync(file, toCsv(rows, headers))
  console.log(`  wrote ${rows.length} candidates -> ${path.relative(process.cwd(), file)}`)
  grandTotal += rows.length
}
console.log(`\nDone. ${grandTotal} candidates total.`)
console.log('Next: fill the "website" column (see RUNBOOK step 2), then run: npm run audit -- <csv>')
