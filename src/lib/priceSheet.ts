/**
 * Reads the public "Site Prices" tab of your Google Sheet (published to the web as CSV).
 * Shared by the website and the API, so both always agree on prices.
 */

export type CategoryKey = 'iphone' | 'ipad' | 'mac' | 'watch' | 'airpods' | 'vision' | 'accessories'

export interface SheetRow {
  id: string
  name?: string
  category?: CategoryKey
  series?: string
  price?: number
  hot?: boolean
  /** false hides the model from the site. */
  show?: boolean
  image?: string
  back?: string
}

/** Minimal CSV parser that handles quoted fields, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

const CATEGORY_ALIASES: Record<string, CategoryKey> = {
  iphone: 'iphone',
  ipad: 'ipad',
  mac: 'mac',
  macbook: 'mac',
  watch: 'watch',
  'apple watch': 'watch',
  airpods: 'airpods',
  vision: 'vision',
  'vision pro': 'vision',
  'apple vision pro': 'vision',
  accessories: 'accessories',
  accessory: 'accessories',
  pencil: 'accessories',
  keyboard: 'accessories',
  'pencil & keyboard': 'accessories',
}

const truthy = (v: string) => /^(y|yes|true|1|x|✓)$/i.test(v.trim())
const falsy = (v: string) => /^(n|no|false|0|hide|hidden)$/i.test(v.trim())

/** Turns the CSV into rows, matching columns by their header names. */
export function rowsFromCsv(text: string): SheetRow[] {
  const table = parseCsv(text.replace(/^﻿/, ''))
  if (table.length < 2) return []
  const header = table[0].map((h) => h.trim().toLowerCase())
  const col = (...names: string[]) => header.findIndex((h) => names.some((n) => h === n || h.startsWith(n)))
  const idx = {
    id: col('id'),
    name: col('model', 'name'),
    category: col('category'),
    series: col('series', 'group'),
    price: col('price', 'your price', 'my quote', 'we pay'),
    hot: col('hot'),
    show: col('show'),
    image: col('image', 'photo'),
    back: col('back', 'second'),
  }
  if (idx.id < 0) return []
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '')

  const out: SheetRow[] = []
  for (const r of table.slice(1)) {
    const id = cell(r, idx.id)
    if (!id) continue
    const row: SheetRow = { id }
    const name = cell(r, idx.name)
    if (name) row.name = name
    const cat = CATEGORY_ALIASES[cell(r, idx.category).toLowerCase()]
    if (cat) row.category = cat
    const series = cell(r, idx.series)
    if (series) row.series = series
    const price = parseFloat(cell(r, idx.price).replace(/[$,\s]/g, ''))
    if (Number.isFinite(price) && price > 0) row.price = Math.round(price * 100) / 100
    const hot = cell(r, idx.hot)
    if (idx.hot >= 0) row.hot = truthy(hot)
    const show = cell(r, idx.show)
    if (show && falsy(show)) row.show = false
    const image = cell(r, idx.image)
    if (/^https?:\/\//.test(image) || /^images\//.test(image)) row.image = image
    const back = cell(r, idx.back)
    if (/^https?:\/\//.test(back) || /^images\//.test(back)) row.back = back
    out.push(row)
  }
  return out
}

/**
 * Server-side: every CSV address worth trying for a sheet link, best first.
 * A normal share link (…/spreadsheets/d/<id>/edit) needs "Anyone with the link: Viewer" and
 * reads the first tab (Site Prices), then falls back to that tab by name.
 */
export function sheetSources(link: string): string[] {
  const url = link.trim()
  if (!url) return []
  const doc = url.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/)
  if (doc && !url.includes('/d/e/')) {
    const gid = url.match(/[#&?]gid=(\d+)/)?.[1]
    return [
      `https://docs.google.com/spreadsheets/d/${doc[1]}/export?format=csv${gid ? `&gid=${gid}` : ''}`,
      `https://docs.google.com/spreadsheets/d/${doc[1]}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent('Site Prices')}`,
    ]
  }
  return [csvUrl(url)]
}

/**
 * Accepts any link Google gives you for a published sheet and returns its CSV address.
 * "…/pubhtml?gid=123&single=true" becomes "…/pub?gid=123&single=true&output=csv".
 */
export function csvUrl(link: string) {
  const url = link.trim()
  if (!url) return ''
  if (/output=csv/.test(url)) return url
  const m = url.match(/^(https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/[^/]+)\/pub(?:html)?(?:\?(.*))?/)
  if (m) {
    const params = new URLSearchParams(m[2] ?? '')
    params.set('output', 'csv')
    if (params.get('gid')) params.set('single', 'true')
    return `${m[1]}/pub?${params}`
  }
  return url
}
