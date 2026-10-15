import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { productById, type Product } from '../data/products'

export interface BagLine {
  product: Product
  qty: number
}

interface Flight {
  key: number
  from: DOMRect
  src?: string
}

interface BagContext {
  lines: BagLine[]
  count: number
  total: number
  add: (product: Product, from?: { rect: DOMRect; src?: string }) => void
  setQty: (id: string, qty: number) => void
  remove: (id: string) => void
  clear: () => void
  has: (id: string) => boolean
  isOpen: boolean
  open: () => void
  close: () => void
  /** The bag button registers itself so added items can fly toward it. */
  bagButton: RefObject<HTMLButtonElement | null>
  flights: Flight[]
  landed: (key: number) => void
  /** Increments every time something lands, so the bag button can bump. */
  bumps: number
  /** Most recent addition, for the confirmation toast. */
  lastAdded: { product: Product; at: number } | null
  dismissToast: () => void
}

const Ctx = createContext<BagContext | null>(null)
const KEY = 'santeria-bag-v1'
export const MAX_QTY = 999

function load(): Record<string, number> {
  try {
    const raw = localStorage.getItem(KEY)
    const data = raw ? (JSON.parse(raw) as Record<string, number>) : {}
    return Object.fromEntries(Object.entries(data).filter(([id, q]) => productById.has(id) && q > 0))
  } catch {
    return {}
  }
}

export function BagProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Record<string, number>>(load)
  const [isOpen, setOpen] = useState(false)
  const [flights, setFlights] = useState<Flight[]>([])
  const [bumps, setBumps] = useState(0)
  const [lastAdded, setLastAdded] = useState<BagContext['lastAdded']>(null)
  const bagButton = useRef<HTMLButtonElement | null>(null)
  const flightKey = useRef(0)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(items))
    } catch {
      /* private mode: the bag just won't survive a reload */
    }
  }, [items])

  const add = useCallback<BagContext['add']>((product, from) => {
    setItems((s) => ({ ...s, [product.id]: Math.min((s[product.id] ?? 0) + 1, MAX_QTY) }))
    setLastAdded({ product, at: Date.now() })
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (from && bagButton.current && !reduce) {
      const key = ++flightKey.current
      setFlights((f) => [...f, { key, from: from.rect, src: from.src }])
    } else {
      setBumps((b) => b + 1)
    }
    if ('vibrate' in navigator) navigator.vibrate?.(8)
  }, [])

  const setQty = useCallback((id: string, qty: number) => {
    setItems((s) => {
      const next = { ...s }
      if (qty <= 0) delete next[id]
      else next[id] = Math.min(Math.floor(qty), MAX_QTY)
      return next
    })
  }, [])

  const remove = useCallback((id: string) => setQty(id, 0), [setQty])
  const clear = useCallback(() => setItems({}), [])
  const landed = useCallback((key: number) => {
    setFlights((f) => f.filter((x) => x.key !== key))
    setBumps((b) => b + 1)
  }, [])

  const value = useMemo<BagContext>(() => {
    const lines = Object.entries(items)
      .map(([id, qty]) => ({ product: productById.get(id)!, qty }))
      .filter((l) => l.product)
    return {
      lines,
      count: lines.reduce((n, l) => n + l.qty, 0),
      total: lines.reduce((n, l) => n + l.qty * l.product.price, 0),
      add,
      setQty,
      remove,
      clear,
      has: (id) => id in items,
      isOpen,
      open: () => {
        setLastAdded(null)
        setOpen(true)
      },
      close: () => setOpen(false),
      bagButton,
      flights,
      landed,
      bumps,
      lastAdded,
      dismissToast: () => setLastAdded(null),
    }
  }, [items, isOpen, flights, bumps, lastAdded, add, setQty, remove, clear, landed])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useBag() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useBag must be used inside BagProvider')
  return ctx
}
