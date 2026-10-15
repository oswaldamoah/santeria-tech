import { motion } from 'motion/react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { site, telHref } from '../config'
import { formatPrice } from '../data/products'
import { WordsIn, spring } from '../components/motion'
import type { SentOrder } from '../lib/order'

function readSent(state: unknown): SentOrder | null {
  if (state && typeof state === 'object' && 'orderId' in state) return state as SentOrder
  try {
    const raw = sessionStorage.getItem('santeria-sent')
    return raw ? (JSON.parse(raw) as SentOrder) : null
  } catch {
    return null
  }
}

function Check() {
  return (
    <svg className="sent-check" viewBox="0 0 96 96" aria-hidden>
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#ffd60a" />
          <stop offset="0.5" stopColor="#ff9f0a" />
          <stop offset="1" stopColor="#ff5a1f" />
        </linearGradient>
      </defs>
      <motion.circle
        cx="48"
        cy="48"
        r="44"
        fill="url(#g)"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', bounce: 0.35, duration: 0.7 }}
        style={{ transformOrigin: '48px 48px' }}
      />
      <motion.circle
        cx="48"
        cy="48"
        r="44"
        fill="none"
        stroke="#ff9f0a"
        strokeWidth="2"
        initial={{ scale: 1, opacity: 0.7 }}
        animate={{ scale: 1.6, opacity: 0 }}
        transition={{ duration: 1.2, delay: 0.35, ease: 'easeOut' }}
        style={{ transformOrigin: '48px 48px' }}
      />
      <motion.path
        d="M30 49.5 L42.5 62 L66 36"
        fill="none"
        stroke="#fff"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.45, delay: 0.35, ease: [0.65, 0, 0.35, 1] }}
      />
    </svg>
  )
}

export default function SentPage() {
  const { state } = useLocation()
  const sent = readSent(state)
  if (!sent) return <Navigate to="/" replace />

  const by = new Date(sent.sentAt + site.responseHours * 3600 * 1000)
  const byText = by.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  return (
    <div className="wrap sent">
      <div>
        <Check />
        <h1 className="h1">
          <WordsIn text="Purchase order sent." delay={0.45} />
        </h1>
        <motion.p
          className="lede"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, duration: 0.8, delay: 0.75 }}
        >
          Thanks. We'll contact you within {site.responseHours} hours to confirm the details and set up the handoff.
        </motion.p>

        <motion.dl
          className="sent-meta"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, duration: 0.8, delay: 0.9 }}
        >
          <dt>Order</dt>
          <dd>{sent.orderId}</dd>
          {sent.total > 0 && (
            <>
              <dt>Payout</dt>
              <dd className="gold-deep-text">{formatPrice(sent.total)}</dd>
            </>
          )}
          <dt>Hear from us by</dt>
          <dd>{byText}</dd>
          <dt>We'll write to</dt>
          <dd style={{ wordBreak: 'break-all' }}>{sent.email}</dd>
        </motion.dl>

        <motion.div
          style={{ marginTop: 34, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1, duration: 0.6 }}
        >
          <Link to="/" className="btn btn-dark">
            Sell something else
          </Link>
          <a className="btn btn-ghost" href={`mailto:${site.email}?subject=${encodeURIComponent(`Order ${sent.orderId}`)}`}>
            Email us about this order
          </a>
          {site.phone && (
            <a className="btn btn-ghost" href={telHref(site.phone)}>
              Call {site.phone}
            </a>
          )}
        </motion.div>
      </div>
    </div>
  )
}
