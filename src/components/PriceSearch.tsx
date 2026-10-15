import { AnimatePresence, motion } from 'motion/react'
import { Check, Plus, Search } from 'lucide-react'
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { categoryById, formatPrice, searchProducts, type Product } from '../data/products'
import { useBag } from '../lib/bag'
import { ProductImage } from './ProductImage'

const SUGGESTIONS = ['iPhone 18 Pro', 'iPhone 18', 'iPhone 17 Pro', 'iPhone 16', 'MacBook Air M2', 'iPad Pro M4', 'Watch Ultra', 'AirPods Pro']

function Row({ product, active, onPick }: { product: Product; active: boolean; onPick: (p: Product, el: HTMLDivElement | null) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const bag = useBag()
  const inBag = bag.has(product.id)
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      className={`search-row ${active ? 'is-active' : ''}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onPick(product, ref.current)}
      data-id={product.id}
    >
      <ProductImage ref={ref} product={product} />
      <span className="search-row-name">
        {product.name}
        <small>{categoryById.get(product.category)?.name}</small>
      </span>
      <span className="search-row-price">{formatPrice(product.price)}</span>
      <span className={`search-row-add ${inBag ? 'is-in' : ''}`} aria-hidden>
        {inBag ? <Check size={16} strokeWidth={2.8} /> : <Plus size={16} strokeWidth={2.8} />}
      </span>
    </button>
  )
}

export function PriceSearch({ variant = 'dark', autoFocus }: { variant?: 'dark' | 'light'; autoFocus?: boolean }) {
  const [q, setQ] = useState('')
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const bag = useBag()
  const results = useMemo(() => searchProducts(q, 7), [q])
  const open = focused && q.trim().length > 0

  const pick = (p: Product, el: HTMLDivElement | null) => {
    bag.add(p, el ? { rect: el.getBoundingClientRect(), src: el.dataset.src } : undefined)
  }

  const onKey = (e: KeyboardEvent) => {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault()
      const row = document.querySelector<HTMLElement>(`[data-id="${results[active].id}"] .thumb`)
      pick(results[active], row as HTMLDivElement | null)
    } else if (e.key === 'Escape') {
      inputRef.current?.blur()
    }
  }

  return (
    <div className={`price-search ${variant === 'light' ? 'light' : ''}`}>
      <label className="search-field">
        <Search size={20} strokeWidth={2.2} style={{ opacity: 0.6, flex: 'none' }} aria-hidden />
        <span className="sr-only">Search for your device</span>
        <input
          ref={inputRef}
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => {
            setQ(e.target.value)
            setActive(0)
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKey}
          placeholder="Search, e.g. iPhone 15 Pro"
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
        />
      </label>

      <AnimatePresence>
        {open && (
          <motion.div
            id={listId}
            role="listbox"
            className="search-results"
            initial={{ opacity: 0, scale: 0.97, y: -6, filter: 'blur(6px)' }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.97, y: -6, filter: 'blur(6px)' }}
            transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
          >
            {results.length ? (
              results.map((p, i) => <Row key={p.id} product={p} active={i === active} onPick={pick} />)
            ) : (
              <div className="search-empty">
                We don't list that one yet. Send us a note on the order page and we'll quote it by hand.
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {variant === 'dark' && (
        <div className="search-chips">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="chip"
              onClick={() => {
                setQ(s)
                setActive(0)
                inputRef.current?.focus()
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
