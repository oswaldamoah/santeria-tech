import { AnimatePresence, motion, useDragControls, type PanInfo } from 'motion/react'
import { ArrowRight, ShoppingBag, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { categories, formatPrice, topPriceIn } from '../data/products'
import { useBag } from '../lib/bag'
import { ProductImage } from './ProductImage'
import { QtyStepper } from './QtyStepper'
import { Money } from './motion'

function useIsPhone() {
  const q = '(max-width: 600px)'
  const [match, setMatch] = useState(() => window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const on = () => setMatch(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return match
}

/** Apple's momentum projection: where a flick would come to rest. */
const project = (velocity: number, rate = 0.998) => ((velocity / 1000) * rate) / (1 - rate)

const sheetSpring = { type: 'spring', bounce: 0.12, duration: 0.42 } as const

export function BagSheet() {
  const bag = useBag()
  const navigate = useNavigate()
  const phone = useIsPhone()
  const drag = useDragControls()

  useEffect(() => {
    if (!bag.isOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && bag.close()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [bag.isOpen, bag.close])

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const travel = phone ? info.offset.y + project(info.velocity.y) : info.offset.x + project(info.velocity.x)
    if (travel > 160) bag.close()
  }

  const hidden = phone ? { y: '100%' } : { x: '110%' }
  const shown = phone ? { y: 0 } : { x: 0 }

  return (
    <AnimatePresence>
      {bag.isOpen && (
        <>
          <motion.div
            className="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={bag.close}
          />
          <motion.aside
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Your sell bag"
            initial={hidden}
            animate={shown}
            exit={hidden}
            transition={sheetSpring}
            drag={phone ? 'y' : 'x'}
            dragListener={false}
            dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0, left: 0, right: 0 }}
            dragElastic={phone ? { top: 0.06, bottom: 1 } : { left: 0.06, right: 1 }}
            onDragEnd={onDragEnd}
          >
            <div onPointerDown={(e) => drag.start(e)} style={{ touchAction: 'none', cursor: 'grab' }}>
              <div className="grabber" />
              <div className="sheet-head">
                <div>
                  <h2 className="h3">Your sell bag</h2>
                  {bag.count > 0 && (
                    <div style={{ color: 'var(--text-2)', fontSize: '0.86rem', marginTop: 2 }}>
                      {bag.count} item{bag.count === 1 ? '' : 's'}
                    </div>
                  )}
                </div>
                <button className="icon-btn" onClick={bag.close} aria-label="Close" onPointerDown={(e) => e.stopPropagation()}>
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="sheet-body">
              {bag.lines.length === 0 ? (
                <div className="empty">
                  <div className="empty-icon">
                    <ShoppingBag size={28} />
                  </div>
                  <h3 className="h3">Nothing in here yet</h3>
                  <p>Pick the devices you want to sell and they'll show up here with our offer.</p>
                  <div style={{ display: 'grid', gap: 8, textAlign: 'left' }}>
                    {categories.slice(0, 4).map((c) => (
                      <Link
                        key={c.id}
                        to={`/sell/${c.id}`}
                        onClick={bag.close}
                        className="search-row"
                        style={{ color: 'var(--text)', textDecoration: 'none' }}
                      >
                        <span className="search-row-name">{c.name}</span>
                        <span style={{ color: 'var(--text-2)', fontSize: '0.86rem' }}>
                          up to {formatPrice(topPriceIn(c.id))}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {bag.lines.map(({ product, qty }) => (
                    <motion.div
                      key={product.id}
                      className="line"
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0 }}
                      transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
                    >
                      <ProductImage product={product} />
                      <div className="line-main">
                        <div className="line-name">{product.name}</div>
                        <div className="line-sub">{formatPrice(product.price)} each</div>
                        <div className="line-controls">
                          <QtyStepper qty={qty} name={product.name} onChange={(n) => bag.setQty(product.id, n)} size="small" />
                          <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={() => bag.remove(product.id)} aria-label={`Remove ${product.name}`}>
                            <Trash2 size={16} color="var(--text-2)" />
                          </button>
                        </div>
                      </div>
                      <div className="line-price">{formatPrice(product.price * qty)}</div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>

            {bag.lines.length > 0 && (
              <div className="sheet-foot">
                <div className="total-row">
                  <span>Your payout</span>
                  <Money value={bag.total} className="total-amount" from={bag.total} />
                </div>
                <button
                  className="btn btn-primary btn-large btn-block"
                  onClick={() => {
                    bag.close()
                    navigate('/order')
                  }}
                >
                  Send Purchase Order <ArrowRight size={18} />
                </button>
                <p style={{ margin: '12px 0 0', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-2)' }}>
                  Takes about a minute. Sending it doesn't commit you to sell.
                </p>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
