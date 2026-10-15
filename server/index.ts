/**
 * Santeria Tech API.
 *
 * The website's server side. GitHub Pages can only host files, and anything in the website's code
 * is public, while Resend and Neon both need secret keys (and Resend refuses calls from browsers).
 * So this runs on Cloudflare's free tier, reads its keys from your .env (uploaded by
 * `npm run deploy`), and does the jobs that need them:
 *
 *   GET  /                     setup check: shows which settings are missing (never their values)
 *   POST /orders               the website sends a purchase order here (saved to Neon, emailed via Resend)
 *   GET  /prices               current prices from your Google Sheet, without your margins
 *   POST /admin/login          dashboard sign-in (email + password from your admin_users table)
 *   POST /admin/logout
 *   GET  /admin/orders         list, search and filter orders (+ counts and totals)
 *   GET  /admin/orders/:code   one order with items and history
 *   PATCH /admin/orders/:code  change status, final payout or notes
 *   GET  /admin/export.csv     every order as a spreadsheet
 */
import { currentUser, recordFailure, signIn, signOut, tooManyAttempts } from './auth'
import {
  STATUSES,
  countAdmins,
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

/** Every setting comes from your .env file (uploaded by npm run deploy). Only RESEND_API_KEY and DATABASE_URL are needed for orders and the dashboard. */
export interface Env {
  RESEND_API_KEY?: string
  DATABASE_URL?: string
  PRICE_SHEET_URL?: string
  FROM_EMAIL?: string
  TO_EMAILS?: string
  ALLOWED_ORIGINS?: string
  SITE_URL?: string
}

const DEFAULTS = {
  // Works for testing only: Resend's shared sender can only deliver to the email on your Resend account.
  FROM_EMAIL: 'Santeria Tech <onboarding@resend.dev>',
  TO_EMAILS: 'santeriatech@atomicmail.io,oswaldamoah00@gmail.com',
  ALLOWED_ORIGINS: '*',
}

/** A setting's value, or '' when it's empty or still has a YOUR-… placeholder from the example file. */
const setting = (env: Env, k: keyof Env) => {
  const v = (env[k] ?? '').trim().replace(/^(['"])(.*)\1$/, '$2').trim()
  return /YOUR-/i.test(v) ? '' : v
}

function settings(env: Env) {
  const v = (k: keyof typeof DEFAULTS) => setting(env, k) || DEFAULTS[k]
  return {
    fromEmail: v('FROM_EMAIL'),
    toEmails: v('TO_EMAILS'),
    allowedOrigins: v('ALLOWED_ORIGINS'),
    siteUrl: setting(env, 'SITE_URL'),
  }
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

/** "https://santeria-tech-*.vercel.app" style entries match any one subdomain label there. */
function originAllowed(origin: string, entry: string) {
  const e = entry.replace(/\/+$/, '').toLowerCase()
  if (!e.includes('*')) return e === origin.toLowerCase()
  const re = new RegExp(`^${e.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[a-z0-9-]*')}$`)
  return re.test(origin.toLowerCase())
}

function corsHeaders(origin: string | null, env: Env, open = false) {
  const allowed = settings(env).allowedOrigins.split(',').map((s) => s.trim()).filter(Boolean)
  const any = allowed.includes('*')
  const ok = open || any || (!!origin && allowed.some((a) => originAllowed(origin, a)))
  return {
    ok,
    headers: {
      'Access-Control-Allow-Origin': open || (any && !origin) ? '*' : ok ? origin! : allowed[0] ?? '',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    } as Record<string, string>,
  }
}

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { ...headers, 'Content-Type': 'application/json' } })

const isDuplicate = (err: unknown) => /duplicate key|23505/.test(String((err as { code?: string })?.code ?? err))

/** Turns database errors into something a person can act on. */
function dbProblem(err: unknown) {
  return knownProblem(err) ?? `Database error: ${String((err as Error)?.message ?? err).slice(0, 200)}`
}

function knownProblem(err: unknown): string | null {
  const m = String((err as Error)?.message ?? err)
  if (m.startsWith('DATABASE_URL')) return m
  if (/password authentication failed/i.test(m)) return 'Neon rejected the login in DATABASE_URL. Copy the connection string again from Neon > Connect.'
  if (/ENOTFOUND|getaddrinfo|fetch failed|ECONNREFUSED|could not connect|endpoint .* (not found|does not exist)/i.test(m)) return 'Could not reach Neon. Check DATABASE_URL is the full postgresql://… string from Neon > Connect.'
  if (/function (crypt|gen_salt)|pgcrypto/i.test(m)) return 'The pgcrypto extension is missing. Run database/schema.sql in Neon\'s SQL Editor.'
  if (/relation "admin_users" does not exist/i.test(m)) return 'The login table is missing. Run database/create-login.sql in Neon\'s SQL Editor.'
  return null
}

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

  /** GET / : a plain checklist of what's configured, so you never have to guess. */
  async function status(env: Env, headers: Record<string, string>) {
    const s = settings(env)
    const checks: Record<string, string> = {
      RESEND_API_KEY: env.RESEND_API_KEY ? 'set' : 'MISSING: orders will not be emailed',
      DATABASE_URL: env.DATABASE_URL ? 'set' : 'MISSING: orders will not be saved and the dashboard will not work',
      PRICE_SHEET_URL: env.PRICE_SHEET_URL ? 'set' : 'not set: the site uses its built-in prices',
      FROM_EMAIL: setting(env, 'FROM_EMAIL') ? s.fromEmail : `not set: using ${DEFAULTS.FROM_EMAIL} (testing only)`,
      TO_EMAILS: s.toEmails,
      ALLOWED_ORIGINS: setting(env, 'ALLOWED_ORIGINS') ? s.allowedOrigins : 'not set: any website may send orders (set it to your site)',
      SITE_URL: s.siteUrl || 'not set: emails will not have an "Open in dashboard" button',
    }
    let database = 'not connected'
    let logins = 'unknown'
    if (env.DATABASE_URL) {
      try {
        const d = await db(env)
        database = 'connected'
        const n = await countAdmins(d!)
        logins = n ? `${n} dashboard login${n === 1 ? '' : 's'}` : 'none yet: run the SQL in database/create-login.sql in Neon'
      } catch (err) {
        database = dbProblem(err)
      }
    }
    let sheet = 'not set'
    if (env.PRICE_SHEET_URL) {
      const rows = await sheetRows(env.PRICE_SHEET_URL)
      sheet = rows ? `read ${rows.length} rows` : 'could not read it: set the sheet to "Anyone with the link: Viewer"'
    }
    return json({ service: 'Santeria Tech API', ok: !!(env.RESEND_API_KEY && env.DATABASE_URL), settings: checks, database, logins, sheet }, 200, headers)
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
    if (body.website) return json({ ok: true }, 200, headers) // a bot filled the hidden field

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

    // 1. Save it to Neon.
    let saved = false
    let duplicate = false
    let database: Db | null = null
    try {
      database = await db(env)
      if (database) {
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
      }
    } catch (err) {
      if (isDuplicate(err)) duplicate = true
      else console.error('Saving order failed:', dbProblem(err))
    }
    if (duplicate) return json({ ok: true, orderId: code }, 200, headers) // a retry of an order we already have

    // 2. Email it through Resend.
    let emailed = false
    if (env.RESEND_API_KEY) {
      try {
        const s = settings(env)
        const site = s.siteUrl ? s.siteUrl.replace(/\/?$/, '/') : ''
        await sendWithResend(
          { RESEND_API_KEY: env.RESEND_API_KEY, FROM_EMAIL: s.fromEmail, TO_EMAILS: s.toEmails },
          { code, name, email, phone, social, prefer, note, lines, dashboardUrl: site ? `${site}#/admin/orders/${code}` : undefined },
        )
        emailed = true
        if (saved && database) await markEmailed(database, code).catch(() => {})
      } catch (err) {
        console.error('Email failed:', err)
      }
    }

    if (!saved && !emailed) return json({ error: 'We could not record your order right now.' }, 502, headers)
    return json({ ok: true, orderId: code }, 200, headers)
  }

  async function handleAdmin(req: Request, env: Env, url: URL, headers: Record<string, string>) {
    const path = url.pathname.replace(/\/+$/, '')

    if (!env.DATABASE_URL) {
      return json({ error: 'The dashboard needs your database. Add DATABASE_URL (your Neon connection string) to your .env file, then run npm run deploy.' }, 503, headers)
    }
    let database: Db
    try {
      database = (await db(env))!
    } catch (err) {
      return json({ error: dbProblem(err) }, 503, headers)
    }

    if (path === '/admin/login' && req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string }
      const email = clip(body.email, 200)
      const key = `${req.headers.get('CF-Connecting-IP') ?? 'local'}:${email.toLowerCase()}`
      if (tooManyAttempts(key)) return json({ error: 'Too many tries. Wait 15 minutes and try again.' }, 429, headers)
      if (!email || typeof body.password !== 'string' || !body.password) {
        return json({ error: 'Enter your email and password.' }, 400, headers)
      }
      if ((await countAdmins(database)) === 0) {
        return json({ error: 'No dashboard logins exist yet. Run the SQL in database/create-login.sql in Neon\'s SQL Editor to create yours.' }, 401, headers)
      }
      const session = await signIn(database, email, body.password)
      if (!session) {
        recordFailure(key)
        await new Promise((r) => setTimeout(r, 400))
        return json({ error: 'That email and password don\'t match a dashboard login.' }, 401, headers)
      }
      return json(session, 200, headers)
    }

    const user = await currentUser(database, req.headers.get('Authorization'))
    if (!user) return json({ error: 'Please sign in again.' }, 401, headers)

    if (path === '/admin/logout' && req.method === 'POST') {
      await signOut(database, req.headers.get('Authorization'))
      return json({ ok: true }, 200, headers)
    }

    if (path === '/admin/me' && req.method === 'GET') return json(user, 200, headers)

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
      const ok = await updateOrder(database, m[1], patch, user.name || user.email)
      if (!ok) return json({ error: 'No order with that number.' }, 404, headers)
      return json(await getOrder(database, m[1]), 200, headers)
    }

    return json({ error: 'Not found.' }, 404, headers)
  }

  return {
    async fetch(req: Request, env: Env): Promise<Response> {
      const url = new URL(req.url)
      const origin = req.headers.get('Origin')
      const { ok, headers } = corsHeaders(origin, env, url.pathname === '/prices' || url.pathname === '/')
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })

      // Every failure comes back as a readable JSON message, never a Cloudflare error page.
      try {
        if (url.pathname === '/' && req.method === 'GET') return await status(env, headers)

        if (url.pathname === '/prices') {
          const rows = await sheetRows(env.PRICE_SHEET_URL)
          return json({ rows: rows ? publicRows(rows) : null }, 200, { ...headers, 'Cache-Control': 'public, max-age=60' })
        }

        if (url.pathname.startsWith('/admin')) {
          if (!ok) return json({ error: `This website (${origin}) isn't in ALLOWED_ORIGINS.` }, 403, headers)
          return await handleAdmin(req, env, url, headers)
        }

        if (req.method === 'POST' && (url.pathname === '/orders' || url.pathname === '/')) {
          if (!ok) return json({ error: `This website (${origin}) isn't in ALLOWED_ORIGINS.` }, 403, headers)
          return await handleOrder(req, env, headers)
        }

        return json({ error: 'Not found.' }, 404, headers)
      } catch (err) {
        console.error('Unhandled error', err)
        const known = knownProblem(err)
        if (known) return json({ error: known }, 503, headers)
        return json({ error: `Something went wrong on the server: ${String((err as Error)?.message ?? err).slice(0, 200)}` }, 500, headers)
      }
    },
  }
}

/** Accepts the string exactly as Neon shows it, including the `psql '…'` form. */
export function cleanDatabaseUrl(raw: string) {
  const url = raw.trim().replace(/^psql\s+/i, '').replace(/^['"]|['"]$/g, '').trim()
  if (!/^postgres(ql)?:\/\/[^\s]+@[^\s]+$/i.test(url)) {
    throw new Error('DATABASE_URL does not look like a Neon connection string. It should start with postgresql:// (copy it from Neon > Connect).')
  }
  return url
}

export default createApp((env) => (env.DATABASE_URL?.trim() ? neonDb(cleanDatabaseUrl(env.DATABASE_URL)) : null))
