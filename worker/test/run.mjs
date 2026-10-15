// Runs the worker against an in-memory Postgres (PGlite) with Resend and Google mocked.
//   npm test
import { build } from 'esbuild'
import { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert/strict'

const out = new URL('./.out/worker.mjs', import.meta.url).pathname
await build({ entryPoints: [new URL('../src/index.ts', import.meta.url).pathname], bundle: true, format: 'esm', platform: 'neutral', outfile: out, logLevel: 'error', external: ['@neondatabase/serverless'], mainFields: ['module', 'main'] })
const { createApp } = await import(out)

const pg = new PGlite()
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
  ALLOWED_ORIGINS: 'https://me.github.io', SITE_URL: 'https://me.github.io/santeria-tech', ADMIN_PASSWORD: 'correct horse',
  SESSION_SECRET: 's3cret', PRICE_SHEET_URL: 'https://docs.google.com/spreadsheets/d/1eOOq9a7rWEjyEBcQWlBjQQcIMzu5n3hD64yEeZ7Xj6M/edit?usp=sharing',
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

// Dashboard sign-in
assert.equal((await call('/admin/orders')).status, 401)
assert.equal((await call('/admin/login', { method: 'POST', body: JSON.stringify({ password: 'nope' }) })).status, 401)
r = await call('/admin/login', { method: 'POST', body: JSON.stringify({ password: 'correct horse' }) })
const { token } = await r.json()
const auth = { Authorization: `Bearer ${token}` }

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

console.log('All worker tests passed')
