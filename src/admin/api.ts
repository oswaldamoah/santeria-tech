import { site } from '../config'

export const STATUSES = ['new', 'contacted', 'scheduled', 'received', 'paid', 'cancelled'] as const
export type Status = (typeof STATUSES)[number]

export const STATUS_LABEL: Record<Status, string> = {
  new: 'New',
  contacted: 'Contacted',
  scheduled: 'Scheduled',
  received: 'Received',
  paid: 'Paid',
  cancelled: 'Cancelled',
}

export const STATUS_HINT: Record<Status, string> = {
  new: 'Just came in. Reply within 12 hours.',
  contacted: 'You reached out to the seller.',
  scheduled: 'A handoff time is set.',
  received: 'You have the device and are checking it.',
  paid: 'Seller has been paid. Done.',
  cancelled: 'Seller backed out or the deal fell through.',
}

export interface OrderSummary {
  code: string
  created_at: string
  updated_at: string
  status: Status
  name: string
  email: string
  phone: string
  social: string
  prefer: string
  quoted_total: number
  final_total: number | null
  item_count: number
  contacted_at: string | null
  email_sent: boolean
  has_notes: boolean
  items_summary: string
}

export interface OrderDetail extends OrderSummary {
  note: string
  admin_notes: string
  page: string
  items: { product_id: string; name: string; unit_price: number; qty: number }[]
  events: { at: string; kind: string; detail: string }[]
}

export interface Stats {
  new: number
  overdue: number
  contacted: number
  scheduled: number
  received: number
  paid: number
  cancelled: number
  all: number
  open_value: number
  paid_this_month: number
  last_7_days: number
}

const KEY = 'santeria-admin-session'

export function getSession(): { token: string; expires: number } | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { token: string; expires: number } | null
    return s && s.expires > Date.now() ? s : null
  } catch {
    return null
  }
}

export function setSession(s: { token: string; expires: number } | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s))
    else localStorage.removeItem(KEY)
  } catch {
    /* storage blocked: you'll sign in each visit */
  }
}

export class AuthError extends Error {}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!site.apiUrl) throw new Error('The dashboard needs your worker address (apiUrl in src/config.ts).')
  const session = getSession()
  const res = await fetch(`${site.apiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      ...(init.headers ?? {}),
    },
  })
  if (res.status === 401 && path !== '/admin/login') {
    setSession(null)
    throw new AuthError('Please sign in again.')
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `The server answered ${res.status}.`)
  }
  return (path.endsWith('.csv') ? res.text() : res.json()) as Promise<T>
}

export const api = {
  login: (password: string) => call<{ token: string; expires: number }>('/admin/login', { method: 'POST', body: JSON.stringify({ password }) }),
  list: (params: { status?: string; q?: string; offset?: number }) => {
    const qs = new URLSearchParams()
    if (params.status && params.status !== 'all') qs.set('status', params.status)
    if (params.q) qs.set('q', params.q)
    qs.set('limit', '50')
    qs.set('offset', String(params.offset ?? 0))
    return call<{ orders: OrderSummary[]; total: number; stats: Stats }>(`/admin/orders?${qs}`)
  },
  get: (code: string) => call<OrderDetail>(`/admin/orders/${encodeURIComponent(code)}`),
  update: (code: string, patch: { status?: Status; final_total?: number | null; admin_notes?: string }) =>
    call<OrderDetail>(`/admin/orders/${encodeURIComponent(code)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  exportCsv: () => call<string>('/admin/export.csv'),
}

export const money = (n: number) =>
  n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  })

/** "4m ago", "3h ago", "Oct 12" */
export function ago(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.round(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** For new orders: how long until (or since) the 12-hour reply promise. */
export function replyClock(o: Pick<OrderSummary, 'status' | 'created_at'>) {
  if (o.status !== 'new') return null
  const due = new Date(o.created_at).getTime() + site.responseHours * 3600 * 1000
  const mins = Math.round((due - Date.now()) / 60000)
  const fmt = (x: number) => (x >= 60 ? `${Math.floor(x / 60)}h ${x % 60}m` : `${x}m`)
  return mins >= 0 ? { overdue: false, label: `Reply within ${fmt(mins)}` } : { overdue: true, label: `${fmt(-mins)} past due` }
}
