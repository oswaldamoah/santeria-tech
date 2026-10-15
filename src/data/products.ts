import catalog from './catalog.json'

export type CategoryId = 'iphone' | 'ipad' | 'mac' | 'watch' | 'airpods' | 'vision' | 'accessories'

export interface Product {
  id: string
  name: string
  category: CategoryId
  series: string
  /** What Santeria Tech pays, in USD. */
  price: number
  /** Main photo. A full URL, or a path inside /public such as "images/my-phone.webp". */
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

export const products = catalog as Product[]

export const categories: Category[] = [
  { id: 'iphone', name: 'iPhone', tagline: 'From the SE to the Duo.', cover: 'iphone-17-pro-max' },
  { id: 'mac', name: 'Mac', tagline: 'MacBook Air, Pro and Neo.', cover: 'macbook-pro-14in-m3-pro' },
  { id: 'ipad', name: 'iPad', tagline: 'Pro, Air, mini and iPad.', cover: 'ipad-pro-11in-m4' },
  { id: 'watch', name: 'Apple Watch', tagline: 'Ultra and Series 5 onward.', cover: 'apple-watch-ultra-2' },
  { id: 'airpods', name: 'AirPods', tagline: 'Max, Pro and the classics.', cover: 'airpods-max' },
  { id: 'vision', name: 'Vision Pro', tagline: 'Yes, we buy these too.', cover: 'apple-vision-pro' },
  { id: 'accessories', name: 'Pencil & Keyboard', tagline: 'Apple Pencil and Magic Keyboard.', cover: 'magic-keyboard-for-ipad-pro-13-12-9in' },
]

export const productById = new Map(products.map((p) => [p.id, p]))
export const categoryById = new Map(categories.map((c) => [c.id, c]))

export const hotProducts = products.filter((p) => p.hot).sort((a, b) => b.price - a.price)

export function productsIn(category: CategoryId) {
  return products.filter((p) => p.category === category)
}

export function seriesIn(category: CategoryId) {
  return [...new Set(productsIn(category).map((p) => p.series))]
}

export function topPriceIn(category: CategoryId) {
  return Math.max(...productsIn(category).map((p) => p.price))
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

/** Loose search: every word in the query must appear in the name or series. */
export function searchProducts(query: string, limit = 8) {
  const words = query.toLowerCase().replace(/["”]/g, '').split(/\s+/).filter(Boolean)
  if (!words.length) return []
  return products
    .filter((p) => {
      const hay = `${p.name} ${p.series} ${categoryById.get(p.category)?.name}`.toLowerCase().replace(/["”]/g, '')
      return words.every((w) => hay.includes(w))
    })
    .slice(0, limit)
}
