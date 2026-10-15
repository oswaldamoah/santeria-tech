/** Prices: the built-in catalog, updated from your Google Sheet when PRICE_SHEET_URL is set. */
import catalog from '../../src/data/catalog.json'
import { rowsFromCsv, sheetSources, type SheetRow } from '../../src/lib/priceSheet'

export interface Priced {
  id: string
  name: string
  price: number
}

const builtIn = new Map((catalog as Priced[]).map((p) => [p.id, { id: p.id, name: p.name, price: p.price }]))

let memo: { at: number; rows: SheetRow[] } | null = null

/** Reads the sheet (cached for a minute). Returns null when no sheet is set or it can't be read. */
export async function sheetRows(link: string | undefined): Promise<SheetRow[] | null> {
  if (!link) return null
  if (memo && Date.now() - memo.at < 60_000) return memo.rows
  for (const url of sheetSources(link)) {
    try {
      const res = await fetch(url, { redirect: 'follow', cf: { cacheTtl: 60, cacheEverything: true } } as RequestInit)
      if (!res.ok) continue
      const text = await res.text()
      if (/^\s*<!doctype html|<html/i.test(text)) continue // sign-in page: the sheet isn't shared
      const rows = rowsFromCsv(text)
      if (!rows.length || !rows.some((r) => r.price)) continue
      memo = { at: Date.now(), rows }
      return rows
    } catch {
      /* try the next address */
    }
  }
  return memo?.rows ?? null
}

/** Only the fields the public site needs. Retail, buyer quotes and profit never leave the worker. */
export function publicRows(rows: SheetRow[]) {
  return rows.map(({ id, name, category, series, price, hot, show, image, back }) => ({
    id,
    name,
    category,
    series,
    price,
    hot,
    show,
    image,
    back,
  }))
}

export async function currentPrices(link: string | undefined) {
  const map = new Map(builtIn)
  const rows = await sheetRows(link)
  for (const row of rows ?? []) {
    const known = map.get(row.id)
    if (row.show === false) map.delete(row.id)
    else if (known) map.set(row.id, { ...known, name: row.name || known.name, price: row.price || known.price })
    else if (row.name && row.price) map.set(row.id, { id: row.id, name: row.name, price: row.price })
  }
  return map
}
