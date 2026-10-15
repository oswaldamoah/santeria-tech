// Local stand-in for the worker: in-memory Postgres, emails printed instead of sent.
import { build } from 'esbuild'
import { PGlite } from '@electric-sql/pglite'
import http from 'node:http'
import { readFileSync } from 'node:fs'

const out = new URL('./.out/worker.mjs', import.meta.url).pathname
await build({ entryPoints: [new URL('../src/index.ts', import.meta.url).pathname], bundle: true, format: 'esm', platform: 'neutral', outfile: out, logLevel: 'error', external: ['@neondatabase/serverless'], mainFields: ['module', 'main'] })
const { createApp } = await import(out)
const pg = new PGlite()
const app = createApp(() => ({ query: async (t, p) => (await pg.query(t, p ?? [])).rows }))
const sheet = process.env.SHEET_CSV ? readFileSync(process.env.SHEET_CSV, 'utf8') : null
const realFetch = globalThis.fetch
globalThis.fetch = async (url, init) => {
  if (String(url).includes('api.resend.com')) { console.log('EMAIL', JSON.parse(init.body).subject); return new Response('{"id":"x"}') }
  if (String(url).includes('docs.google.com')) return sheet ? new Response(sheet) : new Response('nope', { status: 404 })
  return realFetch(url, init)
}
const env = { RESEND_API_KEY: 'test', FROM_EMAIL: 'o@x.com', TO_EMAILS: 'santeriatech@atomicmail.io,oswaldamoah00@gmail.com', ALLOWED_ORIGINS: 'http://localhost:4173,http://localhost:5173', SITE_URL: 'http://localhost:4173/', ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'test-password', SESSION_SECRET: 'x', PRICE_SHEET_URL: sheet ? 'https://docs.google.com/spreadsheets/d/1eOOq9a7rWEjyEBcQWlBjQQcIMzu5n3hD64yEeZ7Xj6M/edit' : '' }
http.createServer(async (req, res) => {
  const chunks = []
  for await (const c of req) chunks.push(c)
  const body = chunks.length ? Buffer.concat(chunks) : undefined
  const r = await app.fetch(new Request('http://localhost:8787' + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env)
  res.writeHead(r.status, Object.fromEntries(r.headers))
  res.end(Buffer.from(await r.arrayBuffer()))
}).listen(8787, () => console.log('local API on http://localhost:8787'))
