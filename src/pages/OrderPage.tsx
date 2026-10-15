import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { AlertCircle, ArrowRight, Check, ChevronRight, LoaderCircle, Lock, Plus, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState, type ChangeEvent, type FormEvent, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { site } from '../config'
import { formatPrice } from '../data/products'
import { ProductImage } from '../components/ProductImage'
import { QtyStepper } from '../components/QtyStepper'
import { PriceSearch } from '../components/PriceSearch'
import { Money, Reveal, WordsIn, spring } from '../components/motion'
import { useBag } from '../lib/bag'
import { mailtoHref, newOrderId, sendOrder, validate, type ContactPref, type OrderForm, type SentOrder } from '../lib/order'

const PREFS: { id: ContactPref; label: string }[] = [
  { id: 'email', label: 'Email' },
  { id: 'phone', label: 'Phone' },
  { id: 'social', label: 'Social' },
]

function Field({
  id,
  label,
  optional,
  error,
  hint,
  textarea,
  className = '',
  ...input
}: {
  id: keyof OrderForm
  label: string
  optional?: boolean
  error?: string
  hint?: string
  textarea?: boolean
  className?: string
} & InputHTMLAttributes<HTMLInputElement>) {
  const props = { id, name: id, placeholder: ' ', 'aria-invalid': !!error, 'aria-describedby': error ? `${id}-err` : undefined }
  return (
    <div className={`field ${error ? 'has-error' : ''} ${className}`}>
      {textarea ? (
        <textarea {...props} {...(input as TextareaHTMLAttributes<HTMLTextAreaElement>)} />
      ) : (
        <input {...props} {...input} />
      )}
      <label htmlFor={id}>
        {label}
        {optional && <span className="optional"> (optional)</span>}
      </label>
      <AnimatePresence initial={false}>
        {error ? (
          <motion.p
            key="err"
            id={`${id}-err`}
            className="field-error"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            {error}
          </motion.p>
        ) : hint ? (
          <p className="field-hint">{hint}</p>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export default function OrderPage() {
  const bag = useBag()
  const navigate = useNavigate()
  const orderId = useRef(newOrderId()).current
  const [form, setForm] = useState<OrderForm>({
    name: '',
    email: '',
    phone: '',
    social: '',
    prefer: 'email',
    note: '',
    website: '',
  })
  const [touched, setTouched] = useState<Partial<Record<keyof OrderForm, boolean>>>({})
  const [submitted, setSubmitted] = useState(false)
  const [status, setStatus] = useState<'idle' | 'sending' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const errors = useMemo(() => validate(form, bag.lines), [form, bag.lines])
  const show = (k: keyof OrderForm) => ((touched[k] || submitted) && errors[k]) || undefined

  const set = (k: keyof OrderForm) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))
  const blur = (k: keyof OrderForm) => () => setTouched((t) => ({ ...t, [k]: true }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (Object.keys(errors).length) {
      const first = document.querySelector<HTMLElement>('[aria-invalid="true"]')
      first?.focus()
      return
    }
    setStatus('sending')
    try {
      await sendOrder(orderId, form, bag.lines)
      const sent: SentOrder = { orderId, total: bag.total, count: bag.count, email: form.email.trim(), sentAt: Date.now() }
      try {
        sessionStorage.setItem('santeria-sent', JSON.stringify(sent))
      } catch {
        /* ignore */
      }
      bag.clear()
      navigate('/sent', { state: sent })
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  return (
    <div className="wrap">
      <div className="page-head" style={{ paddingBottom: 28 }}>
        <div className="progress" aria-label="Progress">
          <span className="done">
            <Check size={13} strokeWidth={3} style={{ verticalAlign: '-2px' }} /> Pick devices
          </span>
          <ChevronRight size={14} />
          <span className="now">Send purchase order</span>
          <ChevronRight size={14} />
          <span>Hear back within {site.responseHours} hours</span>
        </div>
        <h1 className="h1">
          <WordsIn text="Send your purchase order." />
        </h1>
        <Reveal delay={0.2}>
          <p className="lede">
            Tell us how to reach you. We'll reply within {site.responseHours} hours to confirm the details.
          </p>
        </Reveal>
      </div>

      <div className="order-grid">
        <Reveal delay={0.1}>
          <form className="card" onSubmit={submit} noValidate>
            <div className="form-grid">
              <Field
                id="name"
                label="Full name"
                autoComplete="name"
                value={form.name}
                onChange={set('name')}
                onBlur={blur('name')}
                error={show('name')}
                className="full"
              />
              <Field
                id="email"
                label="Email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={form.email}
                onChange={set('email')}
                onBlur={blur('email')}
                error={show('email')}
              />
              <Field
                id="phone"
                label="Phone"
                optional
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={set('phone')}
                onBlur={blur('phone')}
                error={show('phone')}
              />
              <Field
                id="social"
                label="Social media username or URL"
                optional
                autoComplete="off"
                value={form.social}
                onChange={set('social')}
                onBlur={blur('social')}
                error={show('social')}
                hint="Instagram, X, TikTok, Facebook, whatever you check most."
                className="full"
              />

              <div className="full">
                <span className="form-label">How should we reach you?</span>
                <LayoutGroup id="prefer">
                  <div className="segmented" role="radiogroup" aria-label="Preferred contact method">
                    {PREFS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        role="radio"
                        aria-checked={form.prefer === p.id}
                        onClick={() => setForm((f) => ({ ...f, prefer: p.id }))}
                      >
                        {form.prefer === p.id && <motion.span layoutId="seg" className="seg-pill" transition={spring} />}
                        {p.label}
                      </button>
                    ))}
                  </div>
                </LayoutGroup>
              </div>

              <Field
                id="note"
                label="Note"
                optional
                textarea
                value={form.note}
                onChange={set('note') as never}
                onBlur={blur('note') as never}
                hint="Condition, color, carrier lock, a model we don't list, a good time to call."
                className="full"
              />

              <div className="hp" aria-hidden>
                <label htmlFor="website">Website</label>
                <input id="website" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} />
              </div>
            </div>

            <AnimatePresence>
              {submitted && errors.items && (
                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ marginTop: 18 }}>
                  <div className="notice error">
                    <AlertCircle size={18} />
                    <span>{errors.items}</span>
                  </div>
                </motion.div>
              )}
              {status === 'error' && (
                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ marginTop: 18 }}>
                  <div className="notice error">
                    <AlertCircle size={18} />
                    <span>
                      We couldn't send that just now. {errorMsg} Try again, or{' '}
                      <a href={mailtoHref(orderId, form, bag.lines)}>email the order to us</a> and we'll take it from there.
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              type="submit"
              className="btn btn-primary btn-large btn-block"
              style={{ marginTop: 22 }}
              disabled={status === 'sending'}
              whileTap={{ scale: 0.98 }}
            >
              <AnimatePresence mode="wait" initial={false}>
                {status === 'sending' ? (
                  <motion.span key="s" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                    <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }} style={{ display: 'inline-flex' }}>
                      <LoaderCircle size={18} />
                    </motion.span>
                    Sending
                  </motion.span>
                ) : (
                  <motion.span key="i" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                    Send Purchase Order <ArrowRight size={18} />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>

            <div className="notice" style={{ marginTop: 16 }}>
              <Lock size={16} />
              <span>
                We only use these details to contact you about this order. Sending it doesn't commit you to sell, and you
                can still reach us at <a href={`mailto:${site.email}`}>{site.email}</a>.
              </span>
            </div>
          </form>
        </Reveal>

        <Reveal className="order-summary">
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <h2 className="h3">Your devices</h2>
              <span style={{ color: 'var(--text-3)', fontSize: '0.8rem' }}>Order {orderId}</span>
            </div>

            {bag.lines.length === 0 ? (
              <div style={{ padding: '14px 0 4px' }}>
                <p style={{ color: 'var(--text-2)', margin: '0 0 14px' }}>
                  Your bag is empty. Search for a model below, or describe your device in the note.
                </p>
                <PriceSearch variant="light" />
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {bag.lines.map(({ product, qty }) => (
                  <motion.div
                    key={product.id}
                    className="line"
                    layout
                    exit={{ opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0 }}
                    transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
                  >
                    <ProductImage product={product} />
                    <div className="line-main">
                      <div className="line-name">{product.name}</div>
                      <div className="line-controls">
                        <QtyStepper qty={qty} name={product.name} onChange={(n) => bag.setQty(product.id, n)} size="small" />
                        <button type="button" className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => bag.remove(product.id)} aria-label={`Remove ${product.name}`}>
                          <Trash2 size={15} color="var(--text-2)" />
                        </button>
                      </div>
                    </div>
                    <div className="line-price">{formatPrice(product.price * qty)}</div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}

            <div style={{ marginTop: 8, paddingTop: 16 }}>
              <div className="total-row" style={{ marginBottom: 4 }}>
                <span>Your payout</span>
                <Money value={bag.total} className="total-amount" from={0} />
              </div>
              <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.78rem' }}>
                Offer for devices in good working condition, confirmed when we see them.
              </p>
            </div>
            <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 14, fontSize: '0.92rem' }}>
              <Plus size={15} /> Add more devices
            </Link>
          </div>
        </Reveal>
      </div>
    </div>
  )
}
