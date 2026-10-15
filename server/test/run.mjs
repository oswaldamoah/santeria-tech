// Runs the API against an in-memory Postgres (PGlite) with Resend and Google mocked.
//   npm run test:api
import { build } from 'esbuild'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const out = fileURLToPath(new URL('./.out/server.mjs', import.meta.url))
await build({ entryPoints: [fileURLToPath(new URL('../index.ts', import.meta.url))], bundle: true, format: 'esm', platform: 'neutral', outfile: out, logLevel: 'error', external: ['@neondatabase/serverless'], mainFields: ['module', 'main'] })
const { createApp, cleanDatabaseUrl } = await import(pathToFileURL(out).href)

const pg = new PGlite({ extensions: { pgcrypto } })
const db = { query: async (text, params) => (await pg.query(text, params ?? [])).rows }
const app = createApp(() => db)

const emails = []
const sheetCsv = 'ID,Model,Category,Series,Price,Hot,Show on site,Image URL,Back image URL\niphone-17-pro-max,iPhone 17 Pro Max,iPhone,iPhone 17 & Air,"$1,000.00",yes,yes,,\niphone-11,iPhone 11,iPhone,iPhone 11,108,,no,,\n'
globalThis.fetch = async (url, init) => {
  if (String(url).includes('api.resend.com')) { emails.push(JSON.parse(init.body)); return new Response('{"id":"x"}') }
  if (String(url).includes('docs.google.com')) return new Response(sheetCsv)
  throw new Error('unexpected fetch ' + url)
}

const env = {
  RESEND_API_KEY: 're_test', FROM_EMAIL: 'Orders <o@x.com>', TO_EMAILS: 'santeriatech@atomicmail.io,oswaldamoah00@gmail.com',
  ALLOWED_ORIGINS: 'https://me.github.io', SITE_URL: 'https://me.github.io/santeria-tech', DATABASE_URL: 'postgresql://test',
  PRICE_SHEET_URL: 'https://docs.google.com/spreadsheets/d/1eOOq9a7rWEjyEBcQWlBjQQcIMzu5n3hD64yEeZ7Xj6M/edit?usp=sharing',
}
const O = 'https://me.github.io'
const call = (path, init = {}) => app.fetch(new Request('https://api.test' + path, { ...init, headers: { Origin: O, 'Content-Type': 'application/json', ...(init.headers || {}) } }), env)

// Prices endpoint hides margins and applies the sheet
let r = await call('/prices')
let j = await r.json()
assert.equal(r.status, 200)
assert.equal(j.rows.find((x) => x.id === 'iphone-17-pro-max').price, 1000)
assert.ok(!JSON.stringify(j).includes('Buyer'))

// Place an order (price from the sheet, hidden model ignored)
r = await call('/orders', { method: 'POST', body: JSON.stringify({ orderId: 'ST-ABC-123', name: 'Ama Owusu', email: 'ama@example.com', phone: '713 555 0100', prefer: 'phone', note: 'Box included', items: [{ id: 'iphone-17-pro-max', qty: 2 }, { id: 'iphone-11', qty: 1 }, { id: 'airpods-pro-3', qty: 1 }] }) })
assert.equal(r.status, 200, await r.clone().text())
assert.equal(emails.length, 1)
assert.deepEqual(emails[0].to, ['santeriatech@atomicmail.io', 'oswaldamoah00@gmail.com'])
assert.ok(emails[0].html.includes('https://me.github.io/santeria-tech/#/admin/orders/ST-ABC-123'))
assert.ok(emails[0].subject.includes('3 devices, $2,162'))

// Retrying the same order doesn't duplicate it
r = await call('/orders', { method: 'POST', body: JSON.stringify({ orderId: 'ST-ABC-123', name: 'Ama Owusu', email: 'ama@example.com', items: [{ id: 'iphone-17-pro-max', qty: 2 }] }) })
assert.equal(r.status, 200)
assert.equal(emails.length, 1)

// A second order
await call('/orders', { method: 'POST', body: JSON.stringify({ orderId: 'ST-XYZ-789', name: 'Kofi Mensah', email: 'kofi@example.com', items: [{ id: 'macbook-air-13in-m5-2026', qty: 1 }] }) })

// Dashboard sign-in: no logins yet gives a clear message
assert.equal((await call('/admin/orders')).status, 401)
r = await call('/admin/login', { method: 'POST', body: JSON.stringify({ email: 'owner@example.com', password: 'whatever' }) })
assert.equal(r.status, 401)
assert.match((await r.json()).error, /create-login\.sql/)

// The setup check shows the missing login
j = await (await call('/')).json()
assert.equal(j.database, 'connected')
assert.match(j.logins, /none yet/)

// Run database/create-login.sql exactly as the user will (with their details swapped in)
const loginSql = (email, pw) => readFileSync(new URL('../../database/create-login.sql', import.meta.url), 'utf8')
  .replaceAll('santeriatech@atomicmail.io', email).replace('CHANGE-ME-to-a-long-password', pw)
await pg.exec(loginSql('Owner@Example.com', 'correct horse'))
const [{ password_hash }] = (await pg.query(`SELECT password_hash FROM admin_users`)).rows
assert.ok(password_hash.startsWith('$2a$10$'), 'stored as bcrypt')

assert.equal((await call('/admin/login', { method: 'POST', body: JSON.stringify({ email: 'owner@example.com', password: 'nope' }) })).status, 401)
assert.equal((await call('/admin/login', { method: 'POST', body: JSON.stringify({ password: 'correct horse' }) })).status, 400)
r = await call('/admin/login', { method: 'POST', body: JSON.stringify({ email: ' OWNER@example.com ', password: 'correct horse' }) })
assert.equal(r.status, 200)
j = await r.json()
const token = j.token
assert.equal(j.user.name, 'Owner')
const auth = { Authorization: `Bearer ${token}` }
assert.equal((await (await call('/admin/me', { headers: auth })).json()).email, 'Owner@Example.com')
assert.match((await (await call('/')).json()).logins, /1 dashboard login/)

r = await call('/admin/orders', { headers: auth })
j = await r.json()
assert.equal(j.total, 2)
assert.equal(j.stats.new, 2)
assert.equal(j.orders[0].code, 'ST-XYZ-789')
assert.ok(j.orders[1].items_summary.startsWith('2 × iPhone 17 Pro Max'))

r = await call('/admin/orders?q=airpods', { headers: auth })
assert.equal((await r.json()).total, 1)

r = await call('/admin/orders/ST-ABC-123', { method: 'PATCH', headers: auth, body: JSON.stringify({ status: 'contacted', final_total: 2050.5, admin_notes: 'Meeting Saturday' }) })
j = await r.json()
assert.equal(r.status, 200)
assert.equal(j.status, 'contacted')
assert.equal(j.final_total, 2050.5)
assert.ok(j.contacted_at)
assert.equal(j.items.length, 2)
assert.equal(j.events.length, 4)

r = await call('/admin/orders?status=contacted', { headers: auth })
assert.equal((await r.json()).total, 1)
r = await call('/admin/orders/ST-ABC-123', { method: 'PATCH', headers: auth, body: JSON.stringify({ status: 'bogus' }) })
assert.equal(r.status, 400)

r = await call('/admin/export.csv', { headers: auth })
const csv = await r.text()
assert.ok(csv.split('\n').length === 3 && csv.includes('Meeting Saturday'))

assert.equal((await app.fetch(new Request('https://api.test/admin/orders', { headers: { Origin: 'https://evil.example', ...auth } }), env)).status, 403)

// History records who made the change
j = await (await call('/admin/orders/ST-ABC-123', { headers: auth })).json()
assert.ok(j.events.some((e) => e.detail.includes('(Owner)')), JSON.stringify(j.events))

// Re-running the SQL resets the password and signs that login out everywhere
await pg.exec(loginSql('Owner@Example.com', 'new password here'))
assert.equal((await call('/admin/orders', { headers: auth })).status, 401)
assert.equal((await call('/admin/login', { method: 'POST', body: JSON.stringify({ email: 'owner@example.com', password: 'correct horse' }) })).status, 401)
r = await call('/admin/login', { method: 'POST', body: JSON.stringify({ email: 'owner@example.com', password: 'new password here' }) })
const auth2 = { Authorization: `Bearer ${(await r.json()).token}` }
assert.equal((await call('/admin/orders', { headers: auth2 })).status, 200)

// Signing out ends the session
assert.equal((await call('/admin/logout', { method: 'POST', headers: auth2 })).status, 200)
assert.equal((await call('/admin/orders', { headers: auth2 })).status, 401)

// Problems come back as readable JSON, never an error page
const broken = createApp(() => ({ query: async () => { throw new Error('password authentication failed for user "neondb_owner"') } }))
r = await broken.fetch(new Request('https://api.test/admin/login', { method: 'POST', headers: { Origin: O }, body: JSON.stringify({ email: 'a@b.co', password: 'x' }) }), env)
assert.equal(r.status, 503)
assert.match((await r.json()).error, /Neon rejected/)
r = await createApp(() => null).fetch(new Request('https://api.test/admin/login', { method: 'POST', headers: { Origin: O }, body: '{}' }), { ...env, DATABASE_URL: '' })
assert.match((await r.json()).error, /DATABASE_URL/)
r = await createApp(() => null).fetch(new Request('https://api.test/'), {})
j = await r.json()
assert.equal(r.status, 200)
assert.match(j.settings.RESEND_API_KEY, /MISSING/)

assert.equal(cleanDatabaseUrl(`psql 'postgresql://u:p@ep-x.neon.tech/neondb?sslmode=require'`), 'postgresql://u:p@ep-x.neon.tech/neondb?sslmode=require')
assert.throws(() => cleanDatabaseUrl('neondb_owner'), /should start with postgresql/)

// Wildcard origins (Vercel preview addresses)
const vEnv = { ...env, ALLOWED_ORIGINS: 'https://me.github.io,https://santeria-tech*.vercel.app' }
const vcall = (origin) => app.fetch(new Request('https://api.test/admin/orders', { headers: { Origin: origin } }), vEnv).then((r) => r.status)
assert.equal(await vcall('https://santeria-tech.vercel.app'), 401)
assert.equal(await vcall('https://santeria-tech-git-main-oswald.vercel.app'), 401)
assert.equal(await vcall('https://evil.vercel.app'), 403)
assert.equal(await vcall('https://santeria-tech.vercel.app.evil.com'), 403)

// Settings still holding the example's YOUR-… placeholders count as not set
const placeholderEnv = { ...env, ALLOWED_ORIGINS: 'https://YOUR-GITHUB-USERNAME.github.io,http://localhost:5173', FROM_EMAIL: 'Santeria Tech Orders <orders@YOUR-VERIFIED-DOMAIN.com>', SITE_URL: 'https://YOUR-GITHUB-USERNAME.github.io/santeria-tech/' }
emails.length = 0
r = await app.fetch(new Request('https://api.test/orders', { method: 'POST', headers: { Origin: 'https://someone.github.io' }, body: JSON.stringify({ orderId: 'ST-PLC-111', name: 'P', email: 'p@example.com', items: [{ id: 'iphone-17-pro-max', qty: 1 }] }) }), placeholderEnv)
assert.equal(r.status, 200)
assert.equal(emails[0].from, 'Santeria Tech <onboarding@resend.dev>')
assert.ok(!emails[0].html.includes('YOUR-') && !emails[0].html.includes('Open in dashboard'))
j = await (await app.fetch(new Request('https://api.test/'), placeholderEnv)).json()
assert.match(j.settings.ALLOWED_ORIGINS, /not set/)

// The schema file matches what the API creates
const fresh = new PGlite({ extensions: { pgcrypto } })
await fresh.exec(readFileSync(new URL('../../database/schema.sql', import.meta.url), 'utf8'))
await fresh.exec(loginSql('a@b.co', 'pw'))
const cols = async (p) => (await p.query(`SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema='public' ORDER BY 1, 2`)).rows
assert.deepEqual(await cols(fresh), await cols(pg))

console.log('All API tests passed')
