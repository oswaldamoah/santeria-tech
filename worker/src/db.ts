import { neon } from '@neondatabase/serverless'

/** The tiny slice of a Postgres client the worker needs. Neon in production, PGlite in tests. */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>
}

export function neonDb(url: string): Db {
  const sql = neon(url)
  return { query: async (text, params) => (await sql.query(text, params ?? [])) as never }
}

export const STATUSES = ['new', 'contacted', 'scheduled', 'received', 'paid', 'cancelled'] as const
export type Status = (typeof STATUSES)[number]

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS orders (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'new',
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    social TEXT NOT NULL DEFAULT '',
    prefer TEXT NOT NULL DEFAULT 'email',
    note TEXT NOT NULL DEFAULT '',
    quoted_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    final_total NUMERIC(12,2),
    item_count INT NOT NULL DEFAULT 0,
    admin_notes TEXT NOT NULL DEFAULT '',
    contacted_at TIMESTAMPTZ,
    email_sent BOOLEAN NOT NULL DEFAULT false,
    page TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS orders_created_idx ON orders (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status)`,
  `CREATE TABLE IF NOT EXISTS order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    name TEXT NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL,
    qty INT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items (order_id)`,
  `CREATE TABLE IF NOT EXISTS order_events (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    at TIMESTAMPTZ NOT NULL DEFAULT now(),
    kind TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS order_events_order_idx ON order_events (order_id, at)`,
]

let ready: Promise<void> | null = null

/** Creates the tables the first time this worker instance talks to the database. */
export function ensureSchema(db: Db) {
  ready ??= (async () => {
    for (const statement of SCHEMA) await db.query(statement)
  })().catch((err) => {
    ready = null
    throw err
  })
  return ready
}

export interface NewOrder {
  code: string
  name: string
  email: string
  phone: string
  social: string
  prefer: string
  note: string
  page: string
  items: { product_id: string; name: string; unit_price: number; qty: number }[]
}

/** Saves an order, its items and a "received" event in one statement. */
export async function insertOrder(db: Db, o: NewOrder) {
  const total = o.items.reduce((n, i) => n + i.unit_price * i.qty, 0)
  const count = o.items.reduce((n, i) => n + i.qty, 0)
  const rows = await db.query<{ id: string }>(
    `WITH o AS (
       INSERT INTO orders (code, name, email, phone, social, prefer, note, page, quoted_total, item_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id
     ),
     i AS (
       INSERT INTO order_items (order_id, product_id, name, unit_price, qty)
       SELECT o.id, x.product_id, x.name, x.unit_price, x.qty
       FROM o, jsonb_to_recordset($11::jsonb) AS x(product_id text, name text, unit_price numeric, qty int)
     ),
     e AS (
       INSERT INTO order_events (order_id, kind, detail) SELECT o.id, 'received', 'Purchase order sent from the website' FROM o
     )
     SELECT id FROM o`,
    [o.code, o.name, o.email, o.phone, o.social, o.prefer, o.note, o.page, total, count, JSON.stringify(o.items)],
  )
  return rows[0]?.id
}

export async function markEmailed(db: Db, code: string) {
  await db.query(`UPDATE orders SET email_sent = true WHERE code = $1`, [code])
}

const SUMMARY_COLUMNS = `o.code, o.created_at, o.updated_at, o.status, o.name, o.email, o.phone, o.social, o.prefer,
  o.quoted_total::float8 AS quoted_total, o.final_total::float8 AS final_total, o.item_count, o.contacted_at, o.email_sent,
  (o.admin_notes <> '') AS has_notes,
  COALESCE((SELECT string_agg(it.qty || ' × ' || it.name, ', ' ORDER BY it.unit_price * it.qty DESC)
            FROM order_items it WHERE it.order_id = o.id), '') AS items_summary`

export async function listOrders(db: Db, opts: { status?: string; q?: string; limit: number; offset: number }) {
  const where: string[] = []
  const params: unknown[] = []
  if (opts.status === 'overdue') {
    where.push(`o.status = 'new' AND o.created_at < now() - interval '12 hours'`)
  } else if (opts.status === 'open') {
    where.push(`o.status IN ('new','contacted','scheduled','received')`)
  } else if (opts.status && (STATUSES as readonly string[]).includes(opts.status)) {
    params.push(opts.status)
    where.push(`o.status = $${params.length}`)
  }
  if (opts.q) {
    params.push(`%${opts.q.toLowerCase()}%`)
    const p = `$${params.length}`
    where.push(`(lower(o.code) LIKE ${p} OR lower(o.name) LIKE ${p} OR lower(o.email) LIKE ${p}
      OR lower(o.phone) LIKE ${p} OR lower(o.social) LIKE ${p} OR lower(o.note) LIKE ${p} OR lower(o.admin_notes) LIKE ${p}
      OR EXISTS (SELECT 1 FROM order_items it WHERE it.order_id = o.id AND lower(it.name) LIKE ${p}))`)
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  params.push(opts.limit, opts.offset)
  const rows = await db.query(
    `SELECT ${SUMMARY_COLUMNS}, count(*) OVER()::int AS total_count
     FROM orders o ${clause}
     ORDER BY o.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )
  const total = rows.length ? Number((rows[0] as { total_count: number }).total_count) : 0
  return { orders: rows.map(({ total_count, ...r }) => (void total_count, r)), total }
}

export async function stats(db: Db) {
  const [s] = await db.query<Record<string, number>>(
    `SELECT
       count(*) FILTER (WHERE status = 'new')::int AS new,
       count(*) FILTER (WHERE status = 'new' AND created_at < now() - interval '12 hours')::int AS overdue,
       count(*) FILTER (WHERE status = 'contacted')::int AS contacted,
       count(*) FILTER (WHERE status = 'scheduled')::int AS scheduled,
       count(*) FILTER (WHERE status = 'received')::int AS received,
       count(*) FILTER (WHERE status = 'paid')::int AS paid,
       count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
       count(*)::int AS all,
       COALESCE(sum(COALESCE(final_total, quoted_total)) FILTER (WHERE status IN ('new','contacted','scheduled','received')), 0)::float8 AS open_value,
       COALESCE(sum(COALESCE(final_total, quoted_total)) FILTER (WHERE status = 'paid' AND updated_at >= date_trunc('month', now())), 0)::float8 AS paid_this_month,
       count(*) FILTER (WHERE created_at >= now() - interval '7 days')::int AS last_7_days
     FROM orders`,
  )
  return s
}

export async function getOrder(db: Db, code: string) {
  const [order] = await db.query(
    `SELECT o.id, ${SUMMARY_COLUMNS}, o.note, o.admin_notes, o.page FROM orders o WHERE o.code = $1`,
    [code],
  )
  if (!order) return null
  const id = (order as { id: string }).id
  const items = await db.query(
    `SELECT product_id, name, unit_price::float8 AS unit_price, qty FROM order_items WHERE order_id = $1 ORDER BY unit_price * qty DESC`,
    [id],
  )
  const events = await db.query(`SELECT at, kind, detail FROM order_events WHERE order_id = $1 ORDER BY at DESC, id DESC`, [id])
  const { id: _omit, ...rest } = order as Record<string, unknown>
  void _omit
  return { ...rest, items, events }
}

export async function updateOrder(
  db: Db,
  code: string,
  patch: { status?: Status; final_total?: number | null; admin_notes?: string },
) {
  const [current] = await db.query<{ id: string; status: string; final_total: number | null; admin_notes: string }>(
    `SELECT id, status, final_total::float8 AS final_total, admin_notes FROM orders WHERE code = $1`,
    [code],
  )
  if (!current) return false
  const events: [string, string][] = []
  if (patch.status && patch.status !== current.status) events.push(['status', `${current.status} → ${patch.status}`])
  if (patch.final_total !== undefined && patch.final_total !== current.final_total) {
    events.push(['payout', patch.final_total === null ? 'Final payout cleared' : `Final payout set to $${patch.final_total.toFixed(2)}`])
  }
  if (patch.admin_notes !== undefined && patch.admin_notes !== current.admin_notes) events.push(['note', 'Notes updated'])
  if (!events.length) return true

  await db.query(
    `WITH u AS (
       UPDATE orders SET
         status = COALESCE($2, status),
         final_total = CASE WHEN $3::boolean THEN $4::numeric ELSE final_total END,
         admin_notes = COALESCE($5, admin_notes),
         contacted_at = CASE WHEN $2 = 'contacted' AND contacted_at IS NULL THEN now() ELSE contacted_at END,
         updated_at = now()
       WHERE id = $1
       RETURNING id
     )
     INSERT INTO order_events (order_id, kind, detail)
     SELECT u.id, e.kind, e.detail FROM u, jsonb_to_recordset($6::jsonb) AS e(kind text, detail text)`,
    [
      current.id,
      patch.status ?? null,
      patch.final_total !== undefined,
      patch.final_total ?? null,
      patch.admin_notes ?? null,
      JSON.stringify(events.map(([kind, detail]) => ({ kind, detail }))),
    ],
  )
  return true
}

export async function exportOrders(db: Db) {
  return db.query<Record<string, unknown>>(
    `SELECT o.code, o.created_at, o.status, o.name, o.email, o.phone, o.social, o.prefer,
       o.item_count, o.quoted_total::float8 AS quoted_total, o.final_total::float8 AS final_total, o.note, o.admin_notes,
       COALESCE((SELECT string_agg(it.qty || ' x ' || it.name || ' @ ' || it.unit_price, '; ')
                 FROM order_items it WHERE it.order_id = o.id), '') AS items
     FROM orders o ORDER BY o.created_at DESC`,
  )
}
