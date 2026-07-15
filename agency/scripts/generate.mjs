// Site generator: lead profile JSON -> ready-to-deploy static site.
//
// Usage:
//   node scripts/generate.mjs leads/example.lead.json
//   node scripts/generate.mjs leads/data/xyz.lead.json --template bold
//
// Output: sites/<slug>/{index.html,robots.txt,vercel.json}
// Demo sites (demoBanner: true) are generated with robots.txt Disallow-all so
// prospect demos never get indexed under a temp domain.
import fs from 'node:fs'
import path from 'node:path'
import { agencyRoot, slugify } from './lib.mjs'

const args = process.argv.slice(2)
let templateOverride = null
const inputs = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--template') templateOverride = args[++i]
  else inputs.push(args[i])
}
if (!inputs.length) {
  console.error('Usage: node scripts/generate.mjs <lead.json> [--template nordic|bold]')
  process.exit(1)
}

const INDUSTRY_PALETTES = {
  'parturi-kampaamo': { primary: '#6d4c41', accent: '#c9a227' },
  kauneushoitola: { primary: '#8d5b6f', accent: '#d4a5b5' },
  autokorjaamo: { primary: '#1a2a3a', accent: '#e05c2a' },
  rakennus: { primary: '#2b3a2e', accent: '#d9a441' },
  remontointi: { primary: '#3a3a2b', accent: '#c98f2a' },
  putkiasennus: { primary: '#173a5e', accent: '#2ba0c9' },
  'sähköasennus': { primary: '#26323a', accent: '#f2b52a' },
  'kiinteistöhuolto': { primary: '#1f3d33', accent: '#57b87b' },
  maansiirto: { primary: '#3d2f1f', accent: '#d97f2a' },
  'ravintola-kahvila': { primary: '#4a1f26', accent: '#d9a441' },
  'fysioterapia-hieronta': { primary: '#1f3d4a', accent: '#5bbcae' },
  default: { primary: '#16324f', accent: '#2a9d8f' }
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// mustache-lite: {{key}}, {{{rawKey}}}, {{#list}}...{{/list}}, {{#flag}}...{{/flag}}, {{^flag}}...{{/flag}}
function render(tpl, ctx) {
  tpl = tpl.replace(/\{\{([#^])([\w.]+)\}\}([\s\S]*?)\{\{\/\2\}\}/g, (m, kind, key, inner) => {
    const val = lookup(ctx, key)
    if (kind === '^') return !val || (Array.isArray(val) && !val.length) ? render(inner, ctx) : ''
    if (Array.isArray(val)) return val.map((item) => render(inner, itemCtx(ctx, item))).join('')
    return val ? render(inner, typeof val === 'object' ? { ...ctx, ...val } : ctx) : ''
  })
  tpl = tpl.replace(/\{\{\{([\w.]+)\}\}\}/g, (m, key) => String(lookup(ctx, key) ?? ''))
  tpl = tpl.replace(/\{\{([\w.]+)\}\}/g, (m, key) => esc(lookup(ctx, key)))
  return tpl
}
function itemCtx(ctx, item) {
  if (typeof item === 'object') return { ...ctx, ...item, '.': item }
  return { ...ctx, '.': item, value: item }
}
function lookup(ctx, key) {
  if (key === '.') return ctx['.']
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), ctx)
}

for (const input of inputs) {
  const lead = JSON.parse(fs.readFileSync(input, 'utf8'))
  const slug = lead.slug || slugify(lead.name)
  const templateName = templateOverride || lead.template || 'nordic'
  const tplPath = path.join(agencyRoot(), 'templates', templateName, 'index.html')
  if (!fs.existsSync(tplPath)) {
    console.error(`Template not found: ${templateName}`)
    process.exit(1)
  }

  const palette = lead.brand || INDUSTRY_PALETTES[lead.industryKey] || INDUSTRY_PALETTES.default
  const phoneHref = (lead.phone || '').replace(/[^+\d]/g, '')
  const ctx = {
    year: new Date().getFullYear(),
    ...lead,
    slug,
    primary: palette.primary,
    accent: palette.accent,
    phoneHref,
    mapUrl: lead.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lead.address}, ${lead.town}`)}`
      : '',
    hasServices: (lead.services || []).length > 0,
    hasHours: (lead.hours || []).length > 0,
    hasUsps: (lead.usps || []).length > 0,
    hasArea: (lead.serviceArea || []).length > 0
  }

  const html = render(fs.readFileSync(tplPath, 'utf8'), ctx)
  const outDir = path.join(agencyRoot(), 'sites', slug)
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'index.html'), html)
  fs.writeFileSync(
    path.join(outDir, 'robots.txt'),
    lead.demoBanner ? 'User-agent: *\nDisallow: /\n' : 'User-agent: *\nAllow: /\n'
  )
  fs.writeFileSync(
    path.join(outDir, 'vercel.json'),
    JSON.stringify({ cleanUrls: true, trailingSlash: false }, null, 2) + '\n'
  )
  console.log(`Generated sites/${slug}/ (template: ${templateName}${lead.demoBanner ? ', demo mode: noindex' : ''})`)
}
