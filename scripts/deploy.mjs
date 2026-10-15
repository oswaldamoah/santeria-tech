#!/usr/bin/env node
/**
 * Publishes everything from your computer, using the settings in .env.
 *
 *   npm run deploy        the API (orders, emails, prices, dashboard) and the website
 *   npm run deploy:api    only the API, e.g. after changing a key in .env
 *   npm run deploy:site   only the website, e.g. after changing text or photos
 *
 * The first time, it opens your browser to sign in to Cloudflare (free account).
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const envPath = join(root, '.env')
const bin = (pkg, file) => join(root, 'node_modules', pkg, 'bin', file)
const args = process.argv.slice(2)
const doApi = !args.includes('--site')
const doSite = !args.includes('--api')

// Settings the API needs. Everything else in .env (VITE_…) is only for the website.
const SERVER_KEYS = ['RESEND_API_KEY', 'DATABASE_URL', 'PRICE_SHEET_URL', 'FROM_EMAIL', 'TO_EMAILS', 'ALLOWED_ORIGINS', 'SITE_URL']

const bold = (s) => `\x1b[1m${s}\x1b[0m`
const green = (s) => `\x1b[32m${s}\x1b[0m`
const yellow = (s) => `\x1b[33m${s}\x1b[0m`
const red = (s) => `\x1b[31m${s}\x1b[0m`
const step = (s) => console.log(`\n${bold('›')} ${bold(s)}`)
const warn = (s) => console.log(`  ${yellow('!')} ${s}`)
const ok = (s) => console.log(`  ${green('✓')} ${s}`)
function fail(s) {
  console.error(`\n${red('✗')} ${s}\n`)
  process.exit(1)
}

/* ---------- .env ---------- */

if (!existsSync(envPath)) fail('No .env file yet. Copy .env.example to .env (same folder), fill it in, and run this again.')

function readEnv() {
  const out = {}
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1)
    out[m[1]] = v
  }
  return out
}

/** Sets KEY=value in .env, keeping every comment and line where it was. */
function writeEnv(key, value) {
  const text = readFileSync(envPath, 'utf8')
  const re = new RegExp(`^(\\s*${key}\\s*=).*$`, 'm')
  writeFileSync(envPath, re.test(text) ? text.replace(re, `$1${value}`) : `${text.replace(/\s*$/, '\n')}${key}=${value}\n`)
}

const isSet = (v) => !!v && !/YOUR-/i.test(v)
let env = readEnv()

/* ---------- Work out the site's address from the GitHub repo ---------- */

function siteAddress() {
  const cname = join(root, 'public', 'CNAME')
  if (existsSync(cname)) {
    const domain = readFileSync(cname, 'utf8').trim()
    if (domain) return `https://${domain}/`
  }
  const r = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8' })
  const m = (r.stdout ?? '').trim().match(/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/i)
  if (!m) return ''
  const [, user, repo] = m
  return repo.toLowerCase() === `${user.toLowerCase()}.github.io` ? `https://${user}.github.io/` : `https://${user}.github.io/${repo}/`
}

/* ---------- Helpers ---------- */

function run(file, argv, opts = {}) {
  const r = spawnSync(process.execPath, [file, ...argv], { cwd: root, stdio: 'inherit', ...opts })
  return r.status === 0
}

/** Runs a command, showing its output live while also keeping a copy. */
function runCapture(file, argv, extraEnv = {}) {
  return new Promise((resolve) => {
    let out = ''
    const child = spawn(process.execPath, [file, ...argv], { cwd: root, stdio: ['inherit', 'pipe', 'pipe'], env: { ...process.env, ...extraEnv } })
    child.stdout.on('data', (d) => {
      out += d
      process.stdout.write(d)
    })
    child.stderr.on('data', (d) => {
      out += d
      process.stderr.write(d)
    })
    child.on('close', (code) => resolve({ ok: code === 0, out }))
  })
}

/* ---------- API ---------- */

async function deployApi() {
  step('Checking your .env')
  const missing = []
  if (!isSet(env.RESEND_API_KEY)) missing.push('RESEND_API_KEY (resend.com > API Keys)')
  else if (!env.RESEND_API_KEY.startsWith('re_')) warn('RESEND_API_KEY usually starts with re_. Double-check you copied the whole key.')
  if (!isSet(env.DATABASE_URL)) missing.push('DATABASE_URL (Neon > Connect)')
  else if (!/postgres(ql)?:\/\//i.test(env.DATABASE_URL)) warn('DATABASE_URL should contain postgresql://… (copy it from Neon > Connect).')
  if (missing.length) fail(`Fill these in your .env first:\n    ${missing.join('\n    ')}`)
  ok('Resend key and Neon connection string are there')

  const site = siteAddress()
  if (!isSet(env.SITE_URL) && site) {
    writeEnv('SITE_URL', site)
    ok(`SITE_URL was empty, so I set it to ${site}`)
  }
  if (!isSet(env.ALLOWED_ORIGINS) && site) {
    const origins = `${new URL(site).origin},http://localhost:5173,http://localhost:4173`
    writeEnv('ALLOWED_ORIGINS', origins)
    ok(`ALLOWED_ORIGINS was empty, so I set it to ${origins}`)
  }
  env = readEnv()
  if (!isSet(env.FROM_EMAIL)) warn('FROM_EMAIL is empty, so emails come from Resend\'s test sender and only reach the email on your Resend account. Verify a domain in Resend and set FROM_EMAIL to get them everywhere.')
  if (!isSet(env.PRICE_SHEET_URL)) warn('PRICE_SHEET_URL is empty, so the site uses its built-in prices.')

  step('Signing in to Cloudflare')
  const who = spawnSync(process.execPath, [bin('wrangler', 'wrangler.js'), 'whoami'], { cwd: root, encoding: 'utf8' })
  if (/not authenticated|not logged in/i.test(`${who.stdout}${who.stderr}`)) {
    console.log('  Your browser will open. Sign in (or create a free account) and click Allow.')
    if (!run(bin('wrangler', 'wrangler.js'), ['login'])) fail('Cloudflare sign-in did not finish. Run npm run deploy again.')
  }
  ok('Signed in')

  step('Publishing the API with your settings')
  const dir = mkdtempSync(join(tmpdir(), 'santeria-'))
  const secretsFile = join(dir, 'settings.json')
  const settings = Object.fromEntries(SERVER_KEYS.filter((k) => isSet(env[k])).map((k) => [k, env[k]]))
  writeFileSync(secretsFile, JSON.stringify(settings))
  let result
  try {
    result = await runCapture(bin('wrangler', 'wrangler.js'), ['deploy', '--secrets-file', secretsFile])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  if (!result.ok) {
    if (/workers\.dev subdomain/i.test(result.out)) {
      fail('Cloudflare needs a free workers.dev address first. Open dash.cloudflare.com > Workers & Pages, pick a subdomain when it asks, then run npm run deploy again.')
    }
    if (/already in use|binding name/i.test(result.out)) {
      fail('A setting with the same name was typed into the Cloudflare website as plain text. In dash.cloudflare.com > Workers & Pages > santeria-orders > Settings > Variables and Secrets, delete those, then run npm run deploy again.')
    }
    fail('The API did not publish. The message above says why.')
  }
  ok(`Uploaded ${Object.keys(settings).length} settings: ${Object.keys(settings).join(', ')}`)

  const url = result.out.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/i)?.[0]
  if (url && env.VITE_API_URL !== url) {
    writeEnv('VITE_API_URL', url)
    ok(`Saved the API's address in .env: VITE_API_URL=${url}`)
  }
  env = readEnv()

  if (env.VITE_API_URL) {
    step('Asking the API how it\'s doing')
    await new Promise((r) => setTimeout(r, 2500))
    try {
      const s = await (await fetch(`${env.VITE_API_URL}/`)).json()
      for (const [k, v] of Object.entries(s.settings ?? {})) (/MISSING/.test(v) ? warn : /not set/.test(v) ? warn : ok)(`${k}: ${v}`)
      ;(/connected/.test(s.database) ? ok : warn)(`Database: ${s.database}`)
      ;(/none yet|unknown/.test(s.logins) ? warn : ok)(`Dashboard logins: ${s.logins}`)
      ;(/^read/.test(s.sheet) ? ok : warn)(`Price sheet: ${s.sheet}`)
    } catch {
      warn(`Couldn't reach ${env.VITE_API_URL} yet. Open it in your browser in a minute to see the same checklist.`)
    }
  } else {
    warn('Couldn\'t find the API\'s address in the output above. Copy the https://….workers.dev address into VITE_API_URL in .env.')
  }
}

/* ---------- Website ---------- */

function deploySite() {
  env = readEnv()
  step('Building the website')
  if (!env.VITE_API_URL) warn('VITE_API_URL is empty, so the order form falls back to "email us" and the dashboard can\'t sign in. Run npm run deploy (not :site) to fill it.')
  const buildEnv = { ...process.env, VITE_API_URL: env.VITE_API_URL ?? '' }
  if (!run(bin('typescript', 'tsc'), ['-b'], { env: buildEnv })) fail('The website has a code error (shown above).')
  if (!run(bin('vite', 'vite.js'), ['build'], { env: buildEnv })) fail('The website did not build (see above).')

  step('Publishing to GitHub Pages')
  if (!run(bin('gh-pages', 'gh-pages.js'), ['-d', 'dist', '--dotfiles', '-m', 'Publish site'])) {
    fail('Publishing to GitHub failed. Check this folder is connected to your GitHub repo (git remote -v) and that you can push to it.')
  }
  ok('Published to the gh-pages branch')
  const site = isSet(env.SITE_URL) ? env.SITE_URL : siteAddress()
  if (site) {
    console.log(`\n  Your site: ${bold(site)}  (GitHub can take a minute to update)`)
    console.log(`  Dashboard: ${bold(`${site.replace(/\/?$/, '/')}#/admin`)}`)
  }
}

if (doApi) await deployApi()
if (doSite) deploySite()
console.log(`\n${green('Done.')}\n`)
