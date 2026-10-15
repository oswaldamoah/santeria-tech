import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'motion/react'
import { useEffect, useRef, type ReactNode } from 'react'
import { formatPrice } from '../data/products'

/** Apple's default: critically damped spring, no overshoot. */
export const spring = { type: 'spring', bounce: 0, duration: 0.5 } as const
/** For things that carry momentum (a flick, a drop). */
export const bouncy = { type: 'spring', bounce: 0.22, duration: 0.5 } as const

/** Fades content up and into focus the first time it scrolls into view. */
export function Reveal({
  children,
  delay = 0,
  y = 28,
  className,
  as = 'div',
}: {
  children: ReactNode
  delay?: number
  y?: number
  className?: string
  as?: 'div' | 'section' | 'li' | 'p' | 'h2'
}) {
  const Comp = motion[as]
  return (
    <Comp
      className={className}
      initial={{ opacity: 0, y, filter: 'blur(6px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ type: 'spring', bounce: 0, duration: 0.9, delay }}
    >
      {children}
    </Comp>
  )
}

/** Headline that rises in word by word. */
export function WordsIn({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  const words = text.split(' ')
  return (
    <span aria-label={text}>
      {words.map((w, i) => (
        <motion.span
          key={i}
          aria-hidden
          // Gradient text has to live on each word: transformed children don't inherit background-clip.
          className={className}
          style={{ display: 'inline-block', whiteSpace: 'pre', paddingBottom: '0.08em' }}
          initial={{ opacity: 0, y: '0.45em', filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ type: 'spring', bounce: 0, duration: 1, delay: delay + i * 0.06 }}
        >
          {w}
          {i < words.length - 1 ? ' ' : ''}
        </motion.span>
      ))}
    </span>
  )
}

/** A dollar amount that counts up when it appears, and glides when the value changes. */
export function Money({
  value,
  className,
  from = 0,
  duration = 1.1,
}: {
  value: number
  className?: string
  from?: number
  duration?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const reduce = useReducedMotion()
  const mv = useMotionValue(reduce ? value : from)
  const cents = !Number.isInteger(value)
  const text = useTransform(mv, (v) => formatPrice(cents ? Math.round(v * 100) / 100 : Math.round(v), { cents }))

  useEffect(() => {
    if (!inView) return
    if (reduce) {
      mv.set(value)
      return
    }
    const controls = animate(mv, value, { duration, ease: [0.16, 1, 0.3, 1] })
    return () => controls.stop()
  }, [inView, value, reduce, mv, duration])

  return (
    <motion.span ref={ref} className={`tabular ${className ?? ''}`}>
      {text}
    </motion.span>
  )
}

/** Renders a MotionValue<number> as currency. */
export function MoneyValue({ mv, className }: { mv: MotionValue<number>; className?: string }) {
  const text = useTransform(mv, (v) => formatPrice(Math.round(v)))
  return <motion.span className={`tabular ${className ?? ''}`}>{text}</motion.span>
}
