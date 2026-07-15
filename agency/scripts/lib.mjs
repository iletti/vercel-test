// Shared helpers for the agency pipeline.
// HTTP goes through `curl` instead of fetch(): curl honors HTTPS_PROXY /
// CURL_CA_BUNDLE in sandboxed environments and behaves the same on a laptop.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'

const execFileP = promisify(execFile)

const META_MARK = '\n===CURL_META===\n'

/**
 * GET a URL with curl. Returns { ok, status, finalUrl, body, bytes, error }.
 * Never throws; network failures come back as { ok:false, error }.
 */
export async function httpGet(url, { timeout = 15, maxBytes = 1_500_000 } = {}) {
  const args = [
    '-sS',
    '-L',
    '--max-time', String(timeout),
    '--max-redirs', '5',
    '--max-filesize', String(maxBytes),
    '-A', 'Mozilla/5.0 (compatible; SiteAuditBot/1.0)',
    '-w', `${META_MARK}%{http_code}\t%{url_effective}\t%{size_download}`,
    url
  ]
  try {
    const { stdout } = await execFileP('curl', args, {
      maxBuffer: maxBytes + 65536,
      encoding: 'utf8'
    })
    const idx = stdout.lastIndexOf(META_MARK)
    const body = idx === -1 ? stdout : stdout.slice(0, idx)
    const meta = idx === -1 ? '' : stdout.slice(idx + META_MARK.length)
    const [status, finalUrl, bytes] = meta.split('\t')
    return {
      ok: Number(status) >= 200 && Number(status) < 400,
      status: Number(status) || 0,
      finalUrl: finalUrl || url,
      body,
      bytes: Number(bytes) || body.length,
      error: null
    }
  } catch (err) {
    // curl exit codes worth distinguishing for lead scoring
    const code = err.code
    const reason =
      code === 6 ? 'DNS_FAIL' :
      code === 7 ? 'CONN_REFUSED' :
      code === 28 ? 'TIMEOUT' :
      code === 35 || code === 60 ? 'TLS_ERROR' :
      `CURL_${code}`
    return { ok: false, status: 0, finalUrl: url, body: '', bytes: 0, error: reason }
  }
}

export async function httpGetJson(url, opts) {
  const res = await httpGet(url, opts)
  if (!res.ok) return { ...res, json: null }
  try {
    return { ...res, json: JSON.parse(res.body) }
  } catch {
    return { ...res, ok: false, error: 'BAD_JSON', json: null }
  }
}

export function loadConfig() {
  const dir = path.dirname(new URL(import.meta.url).pathname)
  return JSON.parse(fs.readFileSync(path.join(dir, '..', 'config.json'), 'utf8'))
}

export function agencyRoot() {
  return path.join(path.dirname(new URL(import.meta.url).pathname), '..')
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[äå]/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/\b(oy|ab|ky|tmi|t:mi|oyj|avoin yhtiö)\b/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export function todayStamp() {
  return new Date().toISOString().slice(0, 10)
}

// --- minimal CSV (semicolon-separated, Excel-FI friendly) ---

export function csvEscape(v) {
  const s = String(v ?? '')
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows, headers) {
  const lines = [headers.join(';')]
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(';'))
  }
  return lines.join('\n') + '\n'
}

export function parseCsv(text) {
  const rows = []
  let field = ''
  let row = []
  let inQuotes = false
  const pushField = () => { row.push(field); field = '' }
  const pushRow = () => { if (row.length > 1 || row[0] !== '') rows.push(row); row = [] }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') inQuotes = false
      else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ';') pushField()
    else if (c === '\n') { pushField(); pushRow() }
    else if (c !== '\r') field += c
  }
  if (field !== '' || row.length) { pushField(); pushRow() }
  if (!rows.length) return []
  const headers = rows[0]
  return rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])))
}
