import catalog from './catalog.json'
import type { SheetRow } from '../lib/priceSheet'

export type CategoryId = 'iphone' | 'ipad' | 'mac' | 'watch' | 'airpods' | 'vision' | 'accessories'

export interface Product {
  id: string
  name: string
  category: CategoryId
  series: string
  /** What Santeria Tech pays, in USD. */
  price: number
  /** Main photo. A full URL, or a path inside /public such as "images/my-phone.webp". Empty shows an outline. */
  image: string
  /** Second photo (usually the back), shown on hover or tap. */
  back?: string
  /** Scale up photos that have a lot of empty space around the product. */
  zoom?: number
  /** Show the product at an angle (used for the thin Apple Pencils). */
  tilt?: boolean
  hot?: boolean
}

export interface Category {
  id: CategoryId
  name: string
  tagline: string
  /** Product whose photo represents the category tile. */
  cover: string
}

/**
 * Built-in list from catalog.json. If a Google Sheet is connected (site.priceSheetUrl),
 * applyPriceRows() updates these in place before the app renders.
 */
export const products: Product[] = (catalog as Product[]).map((p) => ({ ...p }))

export const categories: Category[] = [
  { id: 'iphone', name: 'iPhone', tagline: 'From the SE to the Duo.', cover: 'iphone-17-pro-max' },
  { id: 'mac', name: 'Mac', tagline: 'MacBook Air, Pro and Neo, up to M5.', cover: 'macbook-pro-14in-m5-pro-max' },
  { id: 'ipad', name: 'iPad', tagline: 'Pro, Air, mini and iPad.', cover: 'ipad-pro-11in-m5' },
  { id: 'watch', name: 'Apple Watch', tagline: 'Ultra, Series and SE.', cover: 'apple-watch-ultra-2' },
  { id: 'airpods', name: 'AirPods', tagline: 'Max, Pro and the classics.', cover: 'airpods-max' },
  { id: 'vision', name: 'Vision Pro', tagline: 'Yes, we buy these too.', cover: 'apple-vision-pro' },
  { id: 'accessories', name: 'Pencil & Keyboard', tagline: 'Apple Pencil and Magic Keyboard.', cover: 'magic-keyboard-for-ipad-pro-13-12-9in' },
]

export const productById = new Map<string, Product>()
export const categoryById = new Map(categories.map((c) => [c.id, c]))
export const hotProducts: Product[] = []

function reindex() {
  productById.clear()
  for (const p of products) productById.set(p.id, p)
  hotProducts.splice(0, hotProducts.length, ...products.filter((p) => p.hot).sort((a, b) => b.price - a.price))
}
reindex()

/**
 * Applies rows from the Google Sheet. A row with a known ID updates that model; a row with a
 * new ID, a category and a price adds a model; "Show on site: no" hides one. Models missing
 * from the sheet keep their built-in price.
 */
export function applyPriceRows(rows: SheetRow[]) {
  for (const row of rows) {
    const existing = productById.get(row.id)
    if (row.show === false) {
      if (existing) products.splice(products.indexOf(existing), 1)
      productById.delete(row.id)
      continue
    }
    if (existing) {
      if (row.name) existing.name = row.name
      if (row.price) existing.price = row.price
      if (row.category) existing.category = row.category
      if (row.series) existing.series = row.series
      if (row.hot !== undefined) existing.hot = row.hot
      if (row.image) existing.image = row.image
      if (row.back) existing.back = row.back
    } else if (row.name && row.category && row.price) {
      const p: Product = {
        id: row.id,
        name: row.name,
        category: row.category,
        series: row.series || categoryById.get(row.category)!.name,
        price: row.price,
        image: row.image ?? '',
        ...(row.back ? { back: row.back } : {}),
        ...(row.hot ? { hot: true } : {}),
      }
      products.push(p)
      productById.set(p.id, p)
    }
  }
  reindex()
}

/** The product shown on a category tile, falling back to the priciest one if the chosen cover is hidden. */
export function coverFor(category: Category) {
  return productById.get(category.cover) ?? [...productsIn(category.id)].sort((a, b) => b.price - a.price)[0]
}

export function productsIn(category: CategoryId) {
  return products.filter((p) => p.category === category)
}

export function seriesIn(category: CategoryId) {
  return [...new Set(productsIn(category).map((p) => p.series))]
}

export function topPriceIn(category: CategoryId) {
  return Math.max(0, ...productsIn(category).map((p) => p.price))
}

export function formatPrice(n: number, opts: { cents?: boolean } = {}) {
  const hasCents = opts.cents ?? !Number.isInteger(n)
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  })
}

/** Loose search: every word must appear in the name (or, if nothing matches by name, the series). */
export function searchProducts(query: string, limit = 8) {
  const words = query.toLowerCase().replace(/["”]/g, '').split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const clean = (s: string) => s.toLowerCase().replace(/["”]/g, '')
  const matches = (hay: string) => words.every((w) => hay.includes(w))
  const byName = products.filter((p) => matches(clean(p.name)))
  const list = byName.length
    ? byName
    : products.filter((p) => matches(clean(`${p.name} ${p.series} ${categoryById.get(p.category)?.name}`)))
  return list.slice(0, limit)
}
