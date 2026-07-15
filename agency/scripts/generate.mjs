// Site generator: lead profile JSON -> ready-to-deploy static site.
//
// Usage:
//   node scripts/generate.mjs leads/example.lead.json
//   node scripts/generate.mjs leads/data/xyz.lead.json --template bold
//
// Output: sites/<slug>/{index.html,robots.txt,vercel.json}
// If sites/<slug>/img/hero.png exists (see images.mjs) it is wired in
// automatically. Demo sites (demoBanner: true) get robots.txt Disallow-all
// so prospect demos never get indexed under a temp domain.
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
    if (Array.isArray(val)) return val.map((item, i) => render(inner, itemCtx(ctx, item, i))).join('')
    return val ? render(inner, typeof val === 'object' ? { ...ctx, ...val } : ctx) : ''
  })
  tpl = tpl.replace(/\{\{\{([\w.]+)\}\}\}/g, (m, key) => String(lookup(ctx, key) ?? ''))
  tpl = tpl.replace(/\{\{([\w.]+)\}\}/g, (m, key) => esc(lookup(ctx, key)))
  return tpl
}
function itemCtx(ctx, item, i) {
  const base = { ...ctx, index1: String(i + 1).padStart(2, '0') }
  if (typeof item === 'object') return { ...base, ...item, '.': item }
  return { ...base, '.': item, value: item }
}
function lookup(ctx, key) {
  if (key === '.') return ctx['.']
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), ctx)
}

// Structured data: LocalBusiness (+ FAQPage when FAQ exists). This is a big
// part of what makes the page read as "professional" to Google.
function buildJsonLd(lead, ctx) {
  const biz = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: lead.name,
    description: lead.description,
    telephone: lead.phone,
    ...(lead.email ? { email: lead.email } : {}),
    ...(lead.businessId ? { vatID: `FI${lead.businessId.replace('-', '')}` } : {}),
    ...(lead.siteUrl ? { url: lead.siteUrl } : {}),
    ...(lead.address
      ? {
          address: {
            '@type': 'PostalAddress',
            streetAddress: lead.address,
            addressLocality: lead.town,
            ...(lead.postCode ? { postalCode: lead.postCode } : {}),
            addressCountry: 'FI'
          }
        }
      : {}),
    ...(lead.serviceArea?.length ? { areaServed: lead.serviceArea } : {}),
    ...(lead.founded ? { foundingDate: String(lead.founded) } : {}),
    ...(ctx.heroImage && lead.siteUrl
      ? { image: new URL(ctx.heroImage, lead.siteUrl).href }
      : {}),
    ...(lead.services?.length
      ? {
          hasOfferCatalog: {
            '@type': 'OfferCatalog',
            name: 'Palvelut',
            itemListElement: lead.services.map((s) => ({
              '@type': 'Offer',
              itemOffered: { '@type': 'Service', name: s.title, ...(s.desc ? { description: s.desc } : {}) }
            }))
          }
        }
      : {})
  }
  const blocks = [biz]
  if (lead.faq?.length) {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: lead.faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a }
      }))
    })
  }
  return blocks
    .map((b) => `<script type="application/ld+json">${JSON.stringify(b)}</script>`)
    .join('\n')
}

function faviconDataUri(name, primary) {
  const letter = (name || 'A').trim()[0].toUpperCase()
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<rect width="64" height="64" rx="14" fill="${primary}"/>` +
    `<text x="32" y="43" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="34" font-weight="700" fill="#ffffff">${esc(letter)}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
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

  const outDir = path.join(agencyRoot(), 'sites', slug)
  const palette = lead.brand || INDUSTRY_PALETTES[lead.industryKey] || INDUSTRY_PALETTES.default
  const phoneHref = (lead.phone || '').replace(/[^+\d]/g, '')
  const heroImage = fs.existsSync(path.join(outDir, 'img', 'hero.png')) ? 'img/hero.png' : ''

  const ctx = {
    year: new Date().getFullYear(),
    ...lead,
    slug,
    primary: palette.primary,
    accent: palette.accent,
    phoneHref,
    heroImage,
    favicon: faviconDataUri(lead.name, palette.primary),
    mapUrl: lead.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lead.address}, ${lead.town}`)}`
      : '',
    hasServices: (lead.services || []).length > 0,
    hasHours: (lead.hours || []).length > 0,
    hasUsps: (lead.usps || []).length > 0,
    hasArea: (lead.serviceArea || []).length > 0,
    hasStats: (lead.stats || []).length > 0,
    hasFaq: (lead.faq || []).length > 0,
    hasProcess: (lead.process || []).length > 0,
    hasTestimonials: (lead.testimonials || []).length > 0,
    hasCerts: (lead.certifications || []).length > 0,
    hasPrices: (lead.priceList || []).length > 0,
    hasAbout: Boolean(lead.about?.text)
  }
  ctx.jsonld = buildJsonLd(lead, ctx)

  const html = render(fs.readFileSync(tplPath, 'utf8'), ctx)
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
  console.log(
    `Generated sites/${slug}/ (template: ${templateName}` +
    `${heroImage ? ', hero image: yes' : ''}${lead.demoBanner ? ', demo mode: noindex' : ''})`
  )
}
