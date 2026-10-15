import { AnimatePresence, motion } from 'motion/react'
import { Flame, Plus } from 'lucide-react'
import { useRef, type RefObject } from 'react'
import type { Product } from '../data/products'
import { useBag } from '../lib/bag'
import { ProductImage } from './ProductImage'
import { QtyStepper } from './QtyStepper'
import { Money, spring } from './motion'

export function HotBadge() {
  return (
    <span className="hot-badge">
      <Flame className="hot-flame" size={13} strokeWidth={2.6} fill="currentColor" aria-hidden />
      Hot
    </span>
  )
}

export function AddButton({ product, source }: { product: Product; source: RefObject<HTMLDivElement | null> }) {
  const bag = useBag()
  const qty = bag.lines.find((l) => l.product.id === product.id)?.qty ?? 0

  const add = () => {
    const el = source.current
    bag.add(product, el ? { rect: el.getBoundingClientRect(), src: el.dataset.src } : undefined)
  }

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {qty === 0 ? (
        <motion.button
          key="add"
          className="add-btn"
          onClick={add}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={spring}
          aria-label={`Add ${product.name} to your sell bag`}
        >
          <Plus size={16} strokeWidth={2.6} /> Sell
        </motion.button>
      ) : (
        <motion.div
          key="stepper"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={spring}
        >
          <QtyStepper qty={qty} name={product.name} onChange={(n) => bag.setQty(product.id, n)} onIncrement={add} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function ProductCard({ product, showHot = false, eager }: { product: Product; showHot?: boolean; eager?: boolean }) {
  const imgRef = useRef<HTMLDivElement>(null)
  return (
    <motion.article className={`pcard ${showHot && product.hot ? 'is-hot' : ''}`} whileHover={{ y: -4 }} transition={spring}>
      {showHot && product.hot && <HotBadge />}
      <ProductImage ref={imgRef} product={product} eager={eager} flippable />
      <div className="pcard-body">
        <div className="pcard-series">{product.series}</div>
        <h3 className="pcard-name">{product.name}</h3>
        <div className="pcard-foot">
          <div>
            <div className="pcard-label">We pay</div>
            <Money value={product.price} className="pcard-price" from={product.price * 0.6} duration={0.9} />
          </div>
          <AddButton product={product} source={imgRef} />
        </div>
      </div>
    </motion.article>
  )
}
