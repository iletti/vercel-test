// Build the deployable cloud dashboard into agency/dashboard-app/.
// The app talks to /api/state (Vercel KV) for always-up-to-date, multi-device
// data. It carries NO business data itself — data.js ships empty; leads and
// tracker come from the cloud store at runtime (or browser-local as fallback).
import fs from 'node:fs'
import path from 'node:path'
import { agencyRoot } from './lib.mjs'

const root = agencyRoot()
const appDir = path.join(root, 'dashboard-app')
fs.mkdirSync(path.join(appDir, 'api'), { recursive: true })

const tpl = fs.readFileSync(path.join(root, 'templates', 'dashboard.html'), 'utf8')
const html = tpl.replace('<script>/*__DATA__*/</script>', '<script src="data.js"></script>')
fs.writeFileSync(path.join(appDir, 'index.html'), html)

// Empty seed: no business data leaves the machine via the deployment.
fs.writeFileSync(
  path.join(appDir, 'data.js'),
  'window.__LEADS__=[];\nwindow.__TRACKER__={};\nwindow.__CONFIG__={"price":690,"maint":25,"region":"Satakunta"};\n'
)
fs.writeFileSync(path.join(appDir, 'robots.txt'), 'User-agent: *\nDisallow: /\n')
// Make api/state.js resolve as CommonJS (the agency package is type:module).
fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({ private: true, type: 'commonjs' }, null, 2) + '\n')
fs.writeFileSync(
  path.join(appDir, 'vercel.json'),
  JSON.stringify({
    cleanUrls: true,
    headers: [{ source: '/(.*)', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }]
  }, null, 2) + '\n'
)

if (!fs.existsSync(path.join(appDir, 'api', 'state.js'))) {
  console.error('WARNING: dashboard-app/api/state.js is missing — the sync backend will not deploy.')
}
console.log('Built dashboard-app/ (index.html, data.js, api/state.js, vercel.json).')
console.log('Deploy: npm run app:deploy   (keep Vercel Deployment Protection ON)')
