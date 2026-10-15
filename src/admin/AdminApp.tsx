import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  LogOut,
  Mail,
  MessageSquare,
  Phone,
  RefreshCw,
  Search,
  X,
  AtSign,
  LoaderCircle,
  AlertCircle,
  ExternalLink,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useMatch, useNavigate } from 'react-router-dom'
import { site, telHref } from '../config'
import {
  AuthError,
  STATUSES,
  STATUS_HINT,
  STATUS_LABEL,
  ago,
  api,
  getSession,
  lastEmail,
  money,
  replyClock,
  setSession,
  type OrderDetail,
  type OrderSummary,
  type Stats,
  type Status,
} from './api'
import './admin.css'

const spring = { type: 'spring', bounce: 0, duration: 0.4 } as const

/* ---------------- Sign in ---------------- */

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState(lastEmail)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      setSession(await api.login(email.trim(), password))
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="adm-login">
      <motion.form
        className="adm-login-card"
        onSubmit={submit}
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={spring}
      >
        <img src={`${import.meta.env.BASE_URL}logo-mark.png`} alt="" width={56} height={56} className="adm-login-logo" />
        <h1>{site.name} orders</h1>
        <p>Sign in to see and manage purchase orders.</p>
        <label className="adm-field">
          <span className="sr-only">Email</span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            inputMode="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus={!email}
          />
        </label>
        <label className="adm-field">
          <span className="sr-only">Password</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus={!!email}
          />
        </label>
        {error && (
          <div className="adm-error">
            <AlertCircle size={16} /> {error}
          </div>
        )}
        <button className="btn btn-primary btn-block" disabled={!email.trim() || !password || busy}>
          {busy ? <LoaderCircle className="adm-spin" size={18} /> : 'Sign in'}
        </button>
        <Link to="/" className="adm-back">
          <ArrowLeft size={14} /> Back to the website
        </Link>
      </motion.form>
    </div>
  )
}

/* ---------------- Small pieces ---------------- */

function StatusPill({ status }: { status: Status }) {
  return <span className={`adm-pill s-${status}`}>{STATUS_LABEL[status]}</span>
}

function Payout({ o }: { o: Pick<OrderSummary, 'quoted_total' | 'final_total'> }) {
  if (o.final_total !== null && o.final_total !== o.quoted_total) {
    return (
      <span className="adm-payout">
        {money(o.final_total)}
        <s>{money(o.quoted_total)}</s>
      </span>
    )
  }
  return <span className="adm-payout">{money(o.quoted_total)}</span>
}

function ReplyClock({ o }: { o: OrderSummary }) {
  const c = replyClock(o)
  if (!c) return null
  return <span className={`adm-clock ${c.overdue ? 'is-late' : ''}`}>{c.label}</span>
}

function useCopy() {
  const [copied, setCopied] = useState('')
  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text)
    setCopied(text)
    setTimeout(() => setCopied(''), 1400)
  }
  return { copied, copy }
}

/* ---------------- Order drawer ---------------- */

function emailTemplate(o: OrderDetail) {
  const first = o.name.split(' ')[0]
  const items = o.items.map((i) => `${i.qty} x ${i.name}`).join(', ')
  const total = money(o.final_total ?? o.quoted_total)
  const body = `Hi ${first},

Thanks for sending ${site.name} your purchase order ${o.code}${items ? ` for ${items}` : ''}. Our offer is ${total} for devices in good working condition.

When works for you to meet so we can check the device${o.item_count === 1 ? '' : 's'} and pay you?

Thanks,
${site.name}
${site.phone || site.email}`
  return `mailto:${o.email}?subject=${encodeURIComponent(`Your ${site.name} purchase order ${o.code}`)}&body=${encodeURIComponent(body)}`
}

function OrderDrawer({ code, onClose, onChanged }: { code: string; onClose: () => void; onChanged: (o: OrderDetail) => void }) {
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState<string>('')
  const [savedFlash, setSavedFlash] = useState('')
  const [payout, setPayout] = useState('')
  const [notes, setNotes] = useState('')
  const { copied, copy } = useCopy()

  useEffect(() => {
    let alive = true
    setOrder(null)
    setError('')
    api
      .get(code)
      .then((o) => {
        if (!alive) return
        setOrder(o)
        setPayout(o.final_total === null ? '' : String(o.final_total))
        setNotes(o.admin_notes)
      })
      .catch((err) => alive && setError(err instanceof Error ? err.message : 'Could not load this order.'))
    return () => {
      alive = false
    }
  }, [code])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = async (what: string, patch: Parameters<typeof api.update>[1]) => {
    if (!order) return
    setSaving(what)
    try {
      const o = await api.update(order.code, patch)
      setOrder(o)
      onChanged(o)
      setSavedFlash(what)
      setTimeout(() => setSavedFlash(''), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setSaving('')
    }
  }

  const savePayout = () => {
    if (!order) return
    const v = payout.trim() === '' ? null : Number(payout.replace(/[$,]/g, ''))
    if (v !== null && !Number.isFinite(v)) return setError('Type the payout as a number, like 1450 or 1450.50.')
    if (v === order.final_total) return
    void save('payout', { final_total: v })
  }

  return (
    <>
      <motion.div className="adm-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.aside
        className="adm-drawer"
        role="dialog"
        aria-label={`Order ${code}`}
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', bounce: 0.08, duration: 0.42 }}
      >
        <header className="adm-drawer-head">
          <div>
            <div className="adm-code">{code}</div>
            {order && (
              <div className="adm-sub">
                {new Date(order.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })} ·{' '}
                {ago(order.created_at)}
              </div>
            )}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </header>

        <div className="adm-drawer-body">
          {error && (
            <div className="adm-error">
              <AlertCircle size={16} /> {error}
            </div>
          )}
          {!order && !error && (
            <div className="adm-loading">
              <LoaderCircle className="adm-spin" size={22} />
            </div>
          )}

          {order && (
            <>
              <section className="adm-block">
                <div className="adm-block-title">Status</div>
                <div className="adm-status-row" role="radiogroup" aria-label="Status">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      role="radio"
                      aria-checked={order.status === s}
                      className={`adm-status-btn s-${s} ${order.status === s ? 'is-on' : ''}`}
                      onClick={() => order.status !== s && save('status', { status: s })}
                      disabled={!!saving}
                    >
                      {order.status === s && <Check size={14} strokeWidth={3} />}
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
                <p className="adm-hint">{STATUS_HINT[order.status]}</p>
                {replyClock(order) && <ReplyClock o={order} />}
              </section>

              <section className="adm-block">
                <div className="adm-block-title">Seller</div>
                <div className="adm-seller">
                  <div className="adm-seller-name">{order.name}</div>
                  <div className="adm-sub">Prefers {order.prefer}</div>
                </div>
                <div className="adm-actions">
                  <a className="adm-action" href={emailTemplate(order)}>
                    <Mail size={16} /> Email
                  </a>
                  {order.phone && (
                    <>
                      <a className="adm-action" href={telHref(order.phone)}>
                        <Phone size={16} /> Call
                      </a>
                      <a className="adm-action" href={`sms:${order.phone.replace(/[^\d+]/g, '')}`}>
                        <MessageSquare size={16} /> Text
                      </a>
                    </>
                  )}
                  {order.social && (
                    <a
                      className="adm-action"
                      href={/^https?:\/\//.test(order.social) ? order.social : '#'}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => {
                        if (!/^https?:\/\//.test(order.social)) {
                          e.preventDefault()
                          copy(order.social)
                        }
                      }}
                    >
                      <AtSign size={16} /> {/^https?:\/\//.test(order.social) ? 'Social' : copied === order.social ? 'Copied' : 'Copy handle'}
                    </a>
                  )}
                </div>
                <dl className="adm-contact">
                  {[
                    ['Email', order.email],
                    ['Phone', order.phone],
                    ['Social', order.social],
                  ]
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>
                          <span>{v}</span>
                          <button className="adm-copy" onClick={() => copy(v)} aria-label={`Copy ${k}`}>
                            {copied === v ? <Check size={14} /> : <Copy size={14} />}
                          </button>
                        </dd>
                      </div>
                    ))}
                </dl>
                {order.note && (
                  <div className="adm-quote">
                    <div className="adm-sub">Their note</div>
                    {order.note}
                  </div>
                )}
              </section>

              <section className="adm-block">
                <div className="adm-block-title">Devices</div>
                {order.items.length === 0 ? (
                  <p className="adm-hint">No devices picked; see their note.</p>
                ) : (
                  <table className="adm-items">
                    <tbody>
                      {order.items.map((i) => (
                        <tr key={i.product_id}>
                          <td>
                            <span className="adm-qty">{i.qty}×</span> {i.name}
                          </td>
                          <td className="num">{money(i.unit_price)}</td>
                          <td className="num strong">{money(i.unit_price * i.qty)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={2}>Quoted on the site</td>
                        <td className="num strong">{money(order.quoted_total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                )}
                <label className="adm-inline">
                  <span>Final payout</span>
                  <div className="adm-money-input">
                    <span>$</span>
                    <input
                      inputMode="decimal"
                      placeholder={String(order.quoted_total)}
                      value={payout}
                      onChange={(e) => setPayout(e.target.value)}
                      onBlur={savePayout}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    />
                  </div>
                  <span className="adm-saved">
                    {saving === 'payout' ? 'Saving' : savedFlash === 'payout' ? 'Saved' : ''}
                  </span>
                </label>
                <p className="adm-hint">Set this after you've checked the device, if the amount changes.</p>
              </section>

              <section className="adm-block">
                <div className="adm-block-title">
                  Your notes
                  <span className="adm-saved">{saving === 'notes' ? 'Saving' : savedFlash === 'notes' ? 'Saved' : ''}</span>
                </div>
                <textarea
                  className="adm-notes"
                  placeholder="Meeting place, device condition, serial numbers, anything you want to remember."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={() => notes !== order.admin_notes && save('notes', { admin_notes: notes })}
                />
              </section>

              <section className="adm-block">
                <div className="adm-block-title">History</div>
                <ol className="adm-timeline">
                  {order.events.map((e, i) => (
                    <li key={i}>
                      <span className={`adm-dot k-${e.kind}`} />
                      <div>
                        <div>{e.detail.replace(/\b(new|contacted|scheduled|received|paid|cancelled)\b/g, (m) => STATUS_LABEL[m as Status])}</div>
                        <div className="adm-sub">
                          {new Date(e.at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                        </div>
                      </div>
                    </li>
                  ))}
                  {!order.email_sent && (
                    <li>
                      <span className="adm-dot k-warn" />
                      <div>The email for this order didn't go out. Check your Resend settings.</div>
                    </li>
                  )}
                </ol>
              </section>
            </>
          )}
        </div>
      </motion.aside>
    </>
  )
}

/* ---------------- Dashboard ---------------- */

type Filter = 'all' | 'overdue' | Status

function Dashboard({ onSignOut }: { onSignOut: () => void }) {
  const navigate = useNavigate()
  const user = getSession()?.user
  const match = useMatch('/admin/orders/:code')
  const openCode = match?.params.code
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updated, setUpdated] = useState<number>(0)
  const [, tick] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const countRef = useRef(0)
  countRef.current = orders.length

  const load = useCallback(
    async (opts: { append?: boolean } = {}) => {
      setLoading(true)
      try {
        const res = await api.list({ status: filter, q: query, offset: opts.append ? countRef.current : 0 })
        setOrders((prev) => (opts.append ? [...prev, ...res.orders] : res.orders))
        setTotal(res.total)
        setStats(res.stats)
        setUpdated(Date.now())
        setError('')
      } catch (err) {
        if (err instanceof AuthError) onSignOut()
        else setError(err instanceof Error ? err.message : 'Could not load orders.')
      } finally {
        setLoading(false)
      }
    },
    [filter, query, onSignOut],
  )

  useEffect(() => {
    void load()
  }, [load])

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])

  // Refresh every 45 seconds while the tab is open, and when you come back to it.
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && void load(), 45_000)
    const c = setInterval(() => tick((n) => n + 1), 15_000)
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(t)
      clearInterval(c)
      window.removeEventListener('focus', onFocus)
    }
  }, [load])

  // "/" jumps to search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const exportCsv = async () => {
    try {
      const csv = await api.exportCsv()
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `santeria-orders-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.')
    }
  }

  const onChanged = (o: OrderDetail) => {
    setOrders((prev) => prev.map((x) => (x.code === o.code ? { ...x, ...o } : x)))
    void load()
  }

  const filters: { id: Filter; label: string; count?: number }[] = useMemo(
    () => [
      { id: 'all', label: 'All', count: stats?.all },
      ...(stats?.overdue ? [{ id: 'overdue' as Filter, label: 'Past 12 hours', count: stats.overdue }] : []),
      ...STATUSES.map((s) => ({ id: s as Filter, label: STATUS_LABEL[s], count: stats?.[s] })),
    ],
    [stats],
  )

  const inProgress = (stats?.contacted ?? 0) + (stats?.scheduled ?? 0) + (stats?.received ?? 0)

  return (
    <div className="adm">
      <header className="adm-top">
        <div className="adm-top-inner">
          <Link to="/" className="brand" title="Back to the website">
            <img className="brand-mark" src={`${import.meta.env.BASE_URL}logo-mark.png`} alt="" width={28} height={28} />
            Orders
          </Link>
          <span className="adm-updated">{updated ? `Updated ${ago(new Date(updated).toISOString())}` : ''}</span>
          <button className="icon-btn" onClick={() => void load()} aria-label="Refresh" title="Refresh">
            <RefreshCw size={17} className={loading ? 'adm-spin' : ''} />
          </button>
          <button className="icon-btn" onClick={exportCsv} aria-label="Download all orders as CSV" title="Download CSV">
            <Download size={17} />
          </button>
          {user && <span className="adm-user">{user.name || user.email}</span>}
          <button className="icon-btn" onClick={onSignOut} aria-label="Sign out" title={user ? `Sign out ${user.email}` : 'Sign out'}>
            <LogOut size={17} />
          </button>
        </div>
      </header>

      <main className="adm-main">
        <section className="adm-kpis">
          <button className={`adm-kpi ${stats?.overdue ? 'is-alert' : ''}`} onClick={() => setFilter(stats?.overdue ? 'overdue' : 'new')}>
            <span className="adm-kpi-label">Waiting for a reply</span>
            <span className="adm-kpi-num">{stats?.new ?? '…'}</span>
            <span className="adm-kpi-sub">
              {stats?.overdue ? `${stats.overdue} past ${site.responseHours} hours` : `All within ${site.responseHours} hours`}
            </span>
          </button>
          <button className="adm-kpi" onClick={() => setFilter('contacted')}>
            <span className="adm-kpi-label">In progress</span>
            <span className="adm-kpi-num">{stats ? inProgress : '…'}</span>
            <span className="adm-kpi-sub">Contacted, scheduled or received</span>
          </button>
          <div className="adm-kpi">
            <span className="adm-kpi-label">Open payouts</span>
            <span className="adm-kpi-num">{stats ? money(stats.open_value) : '…'}</span>
            <span className="adm-kpi-sub">If every open order goes through</span>
          </div>
          <div className="adm-kpi">
            <span className="adm-kpi-label">Paid this month</span>
            <span className="adm-kpi-num">{stats ? money(stats.paid_this_month) : '…'}</span>
            <span className="adm-kpi-sub">{stats ? `${stats.last_7_days} orders in the last 7 days` : ''}</span>
          </div>
        </section>

        <section className="adm-toolbar">
          <div className="adm-filters" role="tablist">
            {filters.map((f) => (
              <button
                key={f.id}
                role="tab"
                aria-selected={filter === f.id}
                className={`adm-filter ${filter === f.id ? 'is-on' : ''} ${f.id === 'overdue' ? 'is-alert' : ''}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
                {f.count !== undefined && <span className="adm-count">{f.count}</span>}
              </button>
            ))}
          </div>
          <label className="adm-search">
            <Search size={16} />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, email, phone, order or model"
            />
            {q && (
              <button onClick={() => setQ('')} aria-label="Clear search">
                <X size={14} />
              </button>
            )}
          </label>
        </section>

        {error && (
          <div className="adm-error">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <section className="adm-list">
          <div className="adm-row adm-row-head" aria-hidden>
            <span>Order</span>
            <span>Seller</span>
            <span>Devices</span>
            <span className="num">Payout</span>
            <span>Status</span>
          </div>
          {orders.map((o) => (
            <button key={o.code} className={`adm-row ${openCode === o.code ? 'is-open' : ''}`} onClick={() => navigate(`/admin/orders/${o.code}`)}>
              <span className="adm-cell-order">
                <span className="adm-code">{o.code}</span>
                <span className="adm-sub">{ago(o.created_at)}</span>
              </span>
              <span className="adm-cell-seller">
                <span className="adm-name">{o.name}</span>
                <span className="adm-sub">{o.prefer === 'phone' && o.phone ? o.phone : o.prefer === 'social' && o.social ? o.social : o.email}</span>
              </span>
              <span className="adm-cell-items">
                <span className="adm-items-text">{o.items_summary || 'Note only, no devices picked'}</span>
                {o.has_notes && <span className="adm-sub">Has your notes</span>}
              </span>
              <span className="adm-cell-payout num">
                <Payout o={o} />
              </span>
              <span className="adm-cell-status">
                <StatusPill status={o.status} />
                <ReplyClock o={o} />
              </span>
            </button>
          ))}
          {!loading && orders.length === 0 && !error && (
            <div className="adm-empty">
              {query || filter !== 'all' ? 'Nothing matches. Try another filter or search.' : 'No purchase orders yet. New ones show up here as soon as they arrive.'}
            </div>
          )}
          {orders.length < total && (
            <button className="btn btn-light adm-more" onClick={() => void load({ append: true })} disabled={loading}>
              Show more ({total - orders.length} left)
            </button>
          )}
        </section>

        <p className="adm-foot">
          Press <kbd>/</kbd> to search. Orders refresh every 45 seconds.{' '}
          <a href={site.apiUrl || '#'} target="_blank" rel="noreferrer">
            API <ExternalLink size={11} />
          </a>
        </p>
      </main>

      <AnimatePresence>
        {openCode && <OrderDrawer key={openCode} code={openCode} onClose={() => navigate('/admin')} onChanged={onChanged} />}
      </AnimatePresence>
    </div>
  )
}

export default function AdminApp() {
  const [signedIn, setSignedIn] = useState(() => !!getSession())

  useEffect(() => {
    const prevTitle = document.title
    document.title = `Orders · ${site.name}`
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => {
      document.title = prevTitle
      meta.remove()
    }
  }, [])

  const signOut = useCallback(() => {
    void api.logout().catch(() => {}).finally(() => setSession(null))
    setSignedIn(false)
  }, [])

  if (!site.apiUrl) {
    return (
      <div className="adm-login">
        <div className="adm-login-card">
          <h1>Almost there</h1>
          <p>
            The dashboard talks to your API. Fill in <code>.env</code> (see <code>.env.example</code>) and run{' '}
            <code>npm run deploy</code>. It publishes the API, saves its address as <code>VITE_API_URL</code> and rebuilds this
            site.
          </p>
        </div>
      </div>
    )
  }

  return signedIn ? <Dashboard onSignOut={signOut} /> : <Login onDone={() => setSignedIn(true)} />
}
