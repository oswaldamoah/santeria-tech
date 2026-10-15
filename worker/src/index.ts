/**
 * Santeria Tech API (Cloudflare Worker).
 *
 *   POST /orders               the website sends a purchase order here
 *   GET  /prices               current prices from your Google Sheet, without your margins
 *   POST /admin/login          dashboard sign-in
 *   GET  /admin/orders         list, search and filter orders (+ counts and totals)
 *   GET  /admin/orders/:code   one order with items and history
 *   PATCH /admin/orders/:code  change status, final payout or notes
 *   GET  /admin/export.csv     every order as a spreadsheet
 *
 * Orders are saved in Neon (Postgres) and emailed through Resend. Secrets live in Cloudflare,
 * never in the website's code.
 */
import { checkPassword, checkToken, issueToken, recordFailure, tooManyAttempts } from './auth'
import {
  STATUSES,
  ensureSchema,
  exportOrders,
  getOrder,
  insertOrder,
  listOrders,
  markEmailed,
  neonDb,
  stats,
  updateOrder,
  type Db,
  type Status,
} from './db'
import { sendWithResend } from './email'
import { currentPrices, publicRows, sheetRows } from './prices'

export interface Env {
  /** Secret. Resend API key. */
  RESEND_API_KEY?: string
  /** Secret. Neon connection string (postgresql://…). */
  DATABASE_URL?: string
  /** Secret. Password for the dashboard. */
  ADMIN_PASSWORD?: string
  /** Secret, optional. Extra randomness for dashboard sessions. */
  SESSION_SECRET?: string
  /** Secret. Link to your Google Sheet (share link or "Publish to web" link). */
  PRICE_SHEET_URL?: string
  /** e.g. "Santeria Tech <orders@yourdomain.com>" (must be on a domain verified in Resend) */
  FROM_EMAIL: string
  /** Comma-separated list of inboxes that receive each purchase order. */
  TO_EMAILS: string
  /** Comma-separated list of site origins allowed to post, e.g. "https://you.github.io,http://localhost:5173" */
  ALLOWED_ORIGINS: string
  /** Your site's address, for the "Open in dashboard" link in emails, e.g. "https://you.github.io/santeria-tech/" */
  SITE_URL?: string
}

interface Payload {
  orderId?: string
  name?: string
  email?: string
  phone?: string
  social?: string
  prefer?: string
  note?: string
  website?: string
  page?: string
  items?: { id?: string; qty?: number }[]
}

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

function corsHeaders(origin: string | null, env: Env, open = false) {
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  const ok = !!origin && (allowed.includes(origin) || allowed.includes('*'))
  return {
    ok: ok || open,
    headers: {
      'Access-Control-Allow-Origin': open ? '*' : ok ? origin! : allowed[0] ?? '',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    } as Record<string, string>,
  }
}

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } })

const isDuplicate = (err: unknown) => /duplicate key|23505/.test(String((err as { code?: string })?.code ?? err))

function csvCell(v: unknown) {
  const s = v instanceof Date ? v.toISOString() : v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function createApp(getDb: (env: Env) => Db | null) {
  async function db(env: Env) {
    const d = getDb(env)
    if (d) await ensureSchema(d)
    return d
  }

  async function handleOrder(req: Request, env: Env, headers: Record<string, string>) {
    const raw = await req.text()
    if (raw.length > 20_000) return json({ error: 'That order is too large.' }, 413, headers)
    let body: Payload
    try {
      body = JSON.parse(raw) as Payload
    } catch {
      return json({ error: 'Could not read the order.' }, 400, headers)
    }
    if (body.website) return json({ ok: true }, 200, headers) // bot filled the hidden field

    const name = clip(body.name, 120)
    const email = clip(body.email, 200)
    const phone = clip(body.phone, 40)
    const social = clip(body.social, 300)
    const note = clip(body.note, 3000)
    const page = clip(body.page, 500)
    const prefer = ['email', 'phone', 'social'].includes(body.prefer ?? '') ? body.prefer! : 'email'
    const code = /^ST-[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(body.orderId ?? '')
      ? body.orderId!
      : `ST-${crypto.randomUUID().slice(0, 3).toUpperCase()}-${crypto.randomUUID().slice(0, 3).toUpperCase()}`

    if (!name) return json({ error: 'Name is missing.' }, 400, headers)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: 'Email looks invalid.' }, 400, headers)

    // Prices come from the sheet (or the built-in catalog), never from the browser.
    const products = await currentPrices(env.PRICE_SHEET_URL)
    const lines = (Array.isArray(body.items) ? body.items : [])
      .slice(0, 50)
      .map((i) => ({ p: products.get(String(i.id)), qty: Math.max(1, Math.min(999, Math.floor(Number(i.qty) || 1))) }))
      .filter((l): l is { p: { id: string; name: string; price: number }; qty: number } => !!l.p)
      .map((l) => ({ id: l.p.id, name: l.p.name, price: l.p.price, qty: l.qty }))
    if (!lines.length && !note) return json({ error: 'The order has no devices and no note.' }, 400, headers)

    // 1. Save it.
    let saved = false
    let duplicate = false
    const database = await db(env).catch((err) => {
      console.error('Database unavailable', err)
      return null
    })
    if (database) {
      try {
        await insertOrder(database, {
          code,
          name,
          email,
          phone,
          social,
          prefer,
          note,
          page,
          items: lines.map((l) => ({ product_id: l.id, name: l.name, unit_price: l.price, qty: l.qty })),
        })
        saved = true
      } catch (err) {
        if (isDuplicate(err)) duplicate = true
        else console.error('Saving order failed', err)
      }
    }
    if (duplicate) return json({ ok: true, orderId: code }, 200, headers) // a retry of an order we already have

    // 2. Email it.
    let emailed = false
    try {
      const site = env.SITE_URL?.replace(/\/?$/, '/')
      await sendWithResend(env, {
        code,
        name,
        email,
        phone,
        social,
        prefer,
        note,
        lines,
        dashboardUrl: site ? `${site}#/admin/orders/${code}` : undefined,
      })
      emailed = true
      if (saved && database) await markEmailed(database, code).catch(() => {})
    } catch (err) {
      console.error('Email failed', err)
    }

    if (!saved && !emailed) return json({ error: 'We could not record your order.' }, 502, headers)
    return json({ ok: true, orderId: code }, 200, headers)
  }

  async function handleAdmin(req: Request, env: Env, url: URL, headers: Record<string, string>) {
    const path = url.pathname.replace(/\/+$/, '')

    if (path === '/admin/login' && req.method === 'POST') {
      const ip = req.headers.get('CF-Connecting-IP') ?? 'local'
      if (!env.ADMIN_PASSWORD) return json({ error: 'The dashboard password has not been set up yet.' }, 503, headers)
      if (tooManyAttempts(ip)) return json({ error: 'Too many tries. Wait 15 minutes and try again.' }, 429, headers)
      const body = (await req.json().catch(() => ({}))) as { password?: string }
      if (!(await checkPassword(env, body.password))) {
        recordFailure(ip)
        await new Promise((r) => setTimeout(r, 400))
        return json({ error: 'That password is not right.' }, 401, headers)
      }
      return json(await issueToken(env), 200, headers)
    }

    if (!(await checkToken(env, req.headers.get('Authorization')))) {
      return json({ error: 'Please sign in again.' }, 401, headers)
    }
    const database = await db(env)
    if (!database) return json({ error: 'The database is not connected yet (DATABASE_URL).' }, 503, headers)

    if (path === '/admin/orders' && req.method === 'GET') {
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50))
      const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0)
      const [list, s] = await Promise.all([
        listOrders(database, {
          status: url.searchParams.get('status') ?? undefined,
          q: clip(url.searchParams.get('q'), 100) || undefined,
          limit,
          offset,
        }),
        stats(database),
      ])
      return json({ ...list, stats: s }, 200, headers)
    }

    if (path === '/admin/export.csv' && req.method === 'GET') {
      const rows = await exportOrders(database)
      const cols = ['code', 'created_at', 'status', 'name', 'email', 'phone', 'social', 'prefer', 'item_count', 'quoted_total', 'final_total', 'items', 'note', 'admin_notes']
      const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n')
      return new Response(csv, { headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8' } })
    }

    const m = path.match(/^\/admin\/orders\/(ST-[A-Z0-9-]{3,12})$/)
    if (m && req.method === 'GET') {
      const order = await getOrder(database, m[1])
      return order ? json(order, 200, headers) : json({ error: 'No order with that number.' }, 404, headers)
    }
    if (m && req.method === 'PATCH') {
      const body = (await req.json().catch(() => ({}))) as { status?: string; final_total?: number | null; admin_notes?: string }
      const patch: { status?: Status; final_total?: number | null; admin_notes?: string } = {}
      if (body.status !== undefined) {
        if (!(STATUSES as readonly string[]).includes(body.status)) return json({ error: 'Unknown status.' }, 400, headers)
        patch.status = body.status as Status
      }
      if (body.final_total !== undefined) {
        if (body.final_total === null) patch.final_total = null
        else {
          const n = Number(body.final_total)
          if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return json({ error: 'That payout amount looks wrong.' }, 400, headers)
          patch.final_total = Math.round(n * 100) / 100
        }
      }
      if (body.admin_notes !== undefined) patch.admin_notes = clip(body.admin_notes, 5000)
      const ok = await updateOrder(database, m[1], patch)
      if (!ok) return json({ error: 'No order with that number.' }, 404, headers)
      return json(await getOrder(database, m[1]), 200, headers)
    }

    return json({ error: 'Not found.' }, 404, headers)
  }

  return {
    async fetch(req: Request, env: Env): Promise<Response> {
      const url = new URL(req.url)
      const origin = req.headers.get('Origin')

      if (url.pathname === '/prices') {
        const { headers } = corsHeaders(origin, env, true)
        if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
        const rows = await sheetRows(env.PRICE_SHEET_URL)
        return json(
          { rows: rows ? publicRows(rows) : null },
          200,
          { ...headers, 'Cache-Control': 'public, max-age=60' },
        )
      }

      const { ok, headers } = corsHeaders(origin, env)
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })

      if (url.pathname.startsWith('/admin')) {
        if (!ok) return json({ error: 'This site is not allowed to use the dashboard.' }, 403, headers)
        try {
          return await handleAdmin(req, env, url, headers)
        } catch (err) {
          console.error('Dashboard error', err)
          return json({ error: 'Something went wrong on the server.' }, 500, headers)
        }
      }

      if (req.method === 'POST' && (url.pathname === '/' || url.pathname === '/orders')) {
        if (!ok) return json({ error: 'This site is not allowed to send orders.' }, 403, headers)
        return handleOrder(req, env, headers)
      }

      if (req.method === 'GET' && url.pathname === '/') return json({ ok: true, service: 'santeria-tech' }, 200, headers)
      return json({ error: 'Not found.' }, 404, headers)
    },
  }
}

export default createApp((env) => (env.DATABASE_URL ? neonDb(env.DATABASE_URL) : null))
