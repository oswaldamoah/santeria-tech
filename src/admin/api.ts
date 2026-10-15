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

export interface AdminUser {
  email: string
  name: string
}

export interface Session {
  token: string
  expires: number
  user?: AdminUser
}

export function getSession(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Session | null
    return s && s.expires > Date.now() ? s : null
  } catch {
    return null
  }
}

/** The last email that signed in on this device, to prefill the form. */
export function lastEmail() {
  try {
    return localStorage.getItem(`${KEY}-email`) ?? ''
  } catch {
    return ''
  }
}

export function setSession(s: Session | null) {
  try {
    if (s?.user?.email) localStorage.setItem(`${KEY}-email`, s.user.email)
    if (s) localStorage.setItem(KEY, JSON.stringify(s))
    else localStorage.removeItem(KEY)
  } catch {
    /* storage blocked: you'll sign in each visit */
  }
}

export class AuthError extends Error {}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!site.apiUrl) throw new Error(`The dashboard needs your API's address. Run npm run deploy, which fills VITE_API_URL in .env and rebuilds the site.`)
  const session = getSession()
  let res: Response
  try {
    res = await fetch(`${site.apiUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
        ...(init.headers ?? {}),
      },
    })
  } catch {
    throw new Error(
      `Can't reach the API at ${site.apiUrl}. Check VITE_API_URL in .env, that npm run deploy finished, and that ALLOWED_ORIGINS includes ${location.origin}.`,
    )
  }
  if (res.status === 401 && path !== '/admin/login') {
    setSession(null)
    throw new AuthError('Please sign in again.')
  }
  const type = res.headers.get('Content-Type') ?? ''
  if (!res.ok) {
    if (!type.includes('json')) {
      throw new Error(
        `The API at ${site.apiUrl} answered with an error page (${res.status}) instead of a message. Open that address in your browser to see its setup check.`,
      )
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `The API answered ${res.status}.`)
  }
  if (path.endsWith('.csv')) return res.text() as Promise<T>
  if (!type.includes('json')) {
    throw new Error(`${site.apiUrl} doesn't look like your Santeria Tech API. Check VITE_API_URL in .env.`)
  }
  return res.json() as Promise<T>
}

export const api = {
  login: (email: string, password: string) =>
    call<Session>('/admin/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => call<{ ok: true }>('/admin/logout', { method: 'POST' }),
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
