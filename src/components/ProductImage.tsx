import { motion } from 'motion/react'
import { forwardRef, useRef, useState, type CSSProperties } from 'react'
import type { Product } from '../data/products'
import { Glyph } from './Glyph'

interface Props {
  product: Product
  className?: string
  /** Use eager loading for images above the fold. */
  eager?: boolean
  /** Show the second photo on hover (mouse) or tap (touch). */
  flippable?: boolean
}

export const imageUrl = (src: string) => (/^https?:\/\//.test(src) ? src : `${import.meta.env.BASE_URL}${src}`)

const fade = { type: 'spring', bounce: 0, duration: 0.55 } as const

/** Product photo inside a soft gray tile. Shimmers while loading, falls back to a drawn glyph. */
export const ProductImage = forwardRef<HTMLDivElement, Props>(function ProductImage(
  { product, className = '', eager, flippable },
  ref,
) {
  const [loaded, setLoaded] = useState(false)
  const [broken, setBroken] = useState(false)
  const [back, setBack] = useState(false)
  const pointer = useRef<string>('mouse')
  const canFlip = !!(flippable && product.back && !broken)
  const front = imageUrl(product.image)

  const style = {
    '--zoom': product.zoom ?? 1,
    '--tilt': product.tilt ? '-38deg' : '0deg',
  } as CSSProperties

  return (
    <div
      ref={ref}
      className={`thumb ${canFlip ? 'can-flip' : ''} ${className}`}
      data-src={broken ? undefined : front}
      style={style}
      onPointerDown={(e) => (pointer.current = e.pointerType)}
      onPointerEnter={(e) => canFlip && e.pointerType === 'mouse' && setBack(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setBack(false)}
      onClick={() => canFlip && pointer.current !== 'mouse' && setBack((b) => !b)}
      onKeyDown={(e) => {
        if (canFlip && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          setBack((b) => !b)
        }
      }}
      role={canFlip ? 'button' : undefined}
      tabIndex={canFlip ? 0 : undefined}
      aria-label={canFlip ? `${product.name}: show ${back ? 'front' : 'back'}` : undefined}
      aria-pressed={canFlip ? back : undefined}
    >
      {broken ? (
        <Glyph category={product.category} />
      ) : (
        <motion.img
          className="thumb-img"
          src={front}
          alt={product.name}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setBroken(true)}
          initial={{ opacity: 0, scale: 1.04, filter: 'blur(8px)' }}
          animate={
            loaded
              ? { opacity: back ? 0 : 1, scale: back ? 0.94 : 1, filter: back ? 'blur(4px)' : 'blur(0px)' }
              : undefined
          }
          transition={fade}
        />
      )}
      {canFlip && (
        <motion.img
          className="thumb-img"
          src={imageUrl(product.back!)}
          alt={`${product.name}, back`}
          loading="lazy"
          decoding="async"
          draggable={false}
          aria-hidden={!back}
          initial={false}
          animate={{ opacity: back ? 1 : 0, scale: back ? 1 : 1.06, filter: back ? 'blur(0px)' : 'blur(4px)' }}
          transition={fade}
        />
      )}
      {canFlip && (
        <span className="flip-dots" aria-hidden>
          <span className={back ? '' : 'on'} />
          <span className={back ? 'on' : ''} />
        </span>
      )}
      {canFlip && (
        <span className="flip-hint" aria-hidden>
          {back ? 'Tap for front' : 'Tap for back'}
        </span>
      )}
      {!loaded && !broken && <div className="thumb-shimmer" aria-hidden />}
    </div>
  )
})
