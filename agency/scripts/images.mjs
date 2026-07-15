// Hero image generation via Google's Nano Banana (Gemini image model).
//
// Smart-usage rules built in:
//   - ONE hero image per site (that's ~0.04 $ / lead) — enough to lift the
//     page, cheap enough to do for every demo you actually pitch.
//   - Cached: if sites/<slug>/img/hero.png exists, we skip (use --force).
//   - Prompts ask for generic Nordic industry scenes: NO text, NO logos,
//     NO readable faces. Never present AI images as the prospect's own
//     premises or staff — they are illustrative, and honest demos sell.
//   - No API key -> clear message and exit 0; generate.mjs falls back to a
//     clean no-image layout, so images are always optional.
//
// Setup:  export GEMINI_API_KEY=...   (aistudio.google.com/apikey)
// Usage:  node scripts/images.mjs leads/data/<slug>.lead.json [--force]
import fs from 'node:fs'
import path from 'node:path'
import { httpPostJson, agencyRoot, slugify, loadConfig } from './lib.mjs'

const config = loadConfig()
const MODEL = process.env.GEMINI_IMAGE_MODEL || config.images?.model || 'gemini-3.1-flash-image'
const API_KEY = process.env.GEMINI_API_KEY

const args = process.argv.slice(2)
const force = args.includes('--force')
const inputs = args.filter((a) => a !== '--force')
if (!inputs.length) {
  console.error('Usage: node scripts/images.mjs <lead.json> [--force]')
  process.exit(1)
}
if (!API_KEY) {
  console.log('GEMINI_API_KEY not set — skipping image generation (sites render fine without images).')
  process.exit(0)
}

// Scene hints keep images relevant per industry without per-lead prompt work.
const SCENES = {
  'parturi-kampaamo': 'a bright modern Scandinavian hair salon interior, styling chair and mirror, warm wood tones',
  kauneushoitola: 'a calm minimalist beauty treatment room, soft towels and neutral tones, spa atmosphere',
  autokorjaamo: 'a clean professional car workshop, car on a lift, organized tools, cool lighting',
  rakennus: 'a timber frame house under construction in Finland, fresh wood, blue sky',
  remontointi: 'a freshly renovated bright Scandinavian living room, paint tools neatly set aside',
  putkiasennus: 'neat copper and PEX plumbing installation on a clean utility room wall, professional finish',
  'sähköasennus': 'a tidy modern electrical panel installation with neatly routed cables, professional tools',
  'kiinteistöhuolto': 'a well-kept Finnish apartment building yard in summer, trimmed lawn and clean walkways',
  maansiirto: 'an excavator working on a gravel site at golden hour in the Finnish countryside',
  'ravintola-kahvila': 'a cozy Nordic café interior, wooden tables, coffee and cinnamon buns, window light',
  'fysioterapia-hieronta': 'a bright physiotherapy studio with a treatment table and exercise equipment, calm and clean',
  autokoulu: 'a driving school car on a quiet Finnish small-town street in summer',
  valokuvaus: 'a photography studio with softbox lighting and a clean backdrop',
  'eläinpalvelut': 'a friendly golden retriever being groomed in a clean pet care studio',
  'puutarha-metsä': 'a beautifully maintained Finnish garden with stone path and green lawn',
  kuljetus: 'a clean delivery van on a Finnish country road in summer, no visible branding',
  default: 'a tidy Finnish small-business storefront on a summer morning, Scandinavian style'
}

function heroPrompt(lead) {
  const scene = SCENES[lead.industryKey] || SCENES.default
  return (
    `Photorealistic wide 16:9 photograph: ${scene}. ` +
    'Natural Nordic daylight, shallow depth of field, professional and trustworthy mood. ' +
    'Strictly no text, no watermarks, no logos, no brand names, no readable faces.'
  )
}

for (const input of inputs) {
  const lead = JSON.parse(fs.readFileSync(input, 'utf8'))
  const slug = lead.slug || slugify(lead.name)
  const imgDir = path.join(agencyRoot(), 'sites', slug, 'img')
  const outFile = path.join(imgDir, 'hero.png')

  if (fs.existsSync(outFile) && !force) {
    console.log(`sites/${slug}/img/hero.png exists — skipping (use --force to regenerate)`)
    continue
  }

  console.log(`Generating hero image for ${lead.name} (${lead.industryKey || 'default'})...`)
  const res = await httpPostJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      headers: { 'x-goog-api-key': API_KEY },
      body: {
        contents: [{ parts: [{ text: heroPrompt(lead) }] }],
        generationConfig: { responseModalities: ['IMAGE'] }
      },
      timeout: 180
    }
  )

  if (!res.ok) {
    const msg = res.json?.error?.message || res.error || `HTTP ${res.status}`
    console.error(`  FAILED: ${msg}`)
    process.exitCode = 1
    continue
  }
  const part = res.json?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)
  if (!part) {
    console.error('  FAILED: no image in response (model may have refused the prompt)')
    process.exitCode = 1
    continue
  }
  fs.mkdirSync(imgDir, { recursive: true })
  fs.writeFileSync(outFile, Buffer.from(part.inlineData.data, 'base64'))
  const kb = Math.round(fs.statSync(outFile).size / 1024)
  console.log(`  wrote sites/${slug}/img/hero.png (${kb} kB)`)
  console.log(`  re-run generate.mjs to wire it into the page: node scripts/generate.mjs ${input}`)
}
