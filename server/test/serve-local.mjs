// Local stand-in for the API: in-memory Postgres, emails printed instead of sent.
import { build } from 'esbuild'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import http from 'node:http'
import { readFileSync } from 'node:fs'

const out = fileURLToPath(new URL('./.out/server.mjs', import.meta.url))
await build({ entryPoints: [fileURLToPath(new URL('../index.ts', import.meta.url))], bundle: true, format: 'esm', platform: 'neutral', outfile: out, logLevel: 'error', external: ['@neondatabase/serverless'], mainFields: ['module', 'main'] })
const { createApp } = await import(pathToFileURL(out).href)
const pg = new PGlite({ extensions: { pgcrypto } })
// A test login: admin@test.local / test-password (or ADMIN_PASSWORD)
await pg.exec(readFileSync(new URL('../../database/create-login.sql', import.meta.url), 'utf8').replaceAll('santeriatech@atomicmail.io', 'admin@test.local').replace('CHANGE-ME-to-a-long-password', process.env.ADMIN_PASSWORD || 'test-password'))
const app = createApp(() => ({ query: async (t, p) => (await pg.query(t, p ?? [])).rows }))
const sheet = process.env.SHEET_CSV ? readFileSync(process.env.SHEET_CSV, 'utf8') : null
const realFetch = globalThis.fetch
globalThis.fetch = async (url, init) => {
  if (String(url).includes('api.resend.com')) { console.log('EMAIL', JSON.parse(init.body).subject); return new Response('{"id":"x"}') }
  if (String(url).includes('docs.google.com')) return sheet ? new Response(sheet) : new Response('nope', { status: 404 })
  return realFetch(url, init)
}
const env = { RESEND_API_KEY: 'test', FROM_EMAIL: 'o@x.com', TO_EMAILS: 'santeriatech@atomicmail.io,oswaldamoah00@gmail.com', ALLOWED_ORIGINS: 'http://localhost:4173,http://localhost:5173', SITE_URL: 'http://localhost:4173/', DATABASE_URL: 'postgresql://local', PRICE_SHEET_URL: sheet ? 'https://docs.google.com/spreadsheets/d/1eOOq9a7rWEjyEBcQWlBjQQcIMzu5n3hD64yEeZ7Xj6M/edit' : '' }
http.createServer(async (req, res) => {
  const chunks = []
  for await (const c of req) chunks.push(c)
  const body = chunks.length ? Buffer.concat(chunks) : undefined
  const r = await app.fetch(new Request('http://localhost:8787' + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env)
  res.writeHead(r.status, Object.fromEntries(r.headers))
  res.end(Buffer.from(await r.arrayBuffer()))
}).listen(8787, () => console.log('local API on http://localhost:8787'))
