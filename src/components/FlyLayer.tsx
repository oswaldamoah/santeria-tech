import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { formatPrice } from '../data/products'
import { useBag } from '../lib/bag'
import { Glyph } from './Glyph'

const SIZE = 72

/** Items arc from where they were tapped into the bag icon. */
export function FlyLayer() {
  const bag = useBag()
  const target = bag.bagButton.current?.getBoundingClientRect()

  return (
    <>
      {bag.flights.map((f) => {
        const startX = f.from.left + f.from.width / 2 - SIZE / 2
        const startY = f.from.top + f.from.height / 2 - SIZE / 2
        const endX = target ? target.left + target.width / 2 - SIZE / 2 : window.innerWidth - 60
        const endY = target ? target.top + target.height / 2 - SIZE / 2 : 0
        const startScale = Math.min(2.2, Math.max(0.8, f.from.width / SIZE))
        // Rise a little before falling into the bag, so the path hints at where it's going.
        const peakY = Math.min(startY, endY) - 70
        return (
          <motion.div
            key={f.key}
            className="flyer"
            initial={{ x: startX, y: startY, scale: startScale, opacity: 0.95 }}
            animate={{
              x: endX,
              y: [startY, peakY, endY],
              scale: [startScale, 0.9, 0.25],
              opacity: [0.95, 1, 0.6],
            }}
            transition={{
              x: { type: 'spring', bounce: 0, duration: 0.7 },
              y: { duration: 0.7, times: [0, 0.35, 1], ease: ['easeOut', 'easeIn'] },
              scale: { duration: 0.7, times: [0, 0.35, 1], ease: 'easeInOut' },
              opacity: { duration: 0.7 },
            }}
            onAnimationComplete={() => bag.landed(f.key)}
          >
            {f.src ? <img src={f.src} alt="" /> : <Glyph category="iphone" className="glyph" />}
          </motion.div>
        )
      })}
    </>
  )
}

export function AddedToast() {
  const bag = useBag()
  const last = bag.lastAdded

  const dismiss = useRef(bag.dismissToast)
  dismiss.current = bag.dismissToast

  useEffect(() => {
    if (!last) return
    const t = setTimeout(() => dismiss.current(), 3600)
    return () => clearTimeout(t)
  }, [last])

  return (
    <AnimatePresence>
      {last && !bag.isOpen && (
        <motion.div
          key="toast"
          className="toast"
          role="status"
          initial={{ opacity: 0, y: 24, x: '-50%', scale: 0.96 }}
          animate={{ opacity: 1, y: 0, x: '-50%', scale: 1 }}
          exit={{ opacity: 0, y: 24, x: '-50%', scale: 0.96 }}
          transition={{ type: 'spring', bounce: 0.15, duration: 0.45 }}
        >
          <span>
            Added. Payout so far: <strong className="tabular">{formatPrice(bag.total)}</strong>
          </span>
          <button className="btn btn-light" onClick={bag.open}>
            View bag
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
