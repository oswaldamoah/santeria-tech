import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { site } from './config'
import { applyPriceRows } from './data/products'
import { csvUrl, rowsFromCsv, type SheetRow } from './lib/priceSheet'
import './styles.css'

const CACHE_KEY = 'santeria-prices-v1'

/** Fetches the latest prices from the Google Sheet, falling back to the last copy we saw. */
async function loadPrices(): Promise<SheetRow[] | null> {
  // Prefer the API: it reads your sheet privately and strips out your margins.
  const url = site.apiUrl ? `${site.apiUrl}/prices` : csvUrl(site.priceSheetUrl)
  if (!url) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3500)
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' })
    if (!res.ok) throw new Error(String(res.status))
    const rows = site.apiUrl
      ? ((await res.json()) as { rows: SheetRow[] | null }).rows ?? []
      : rowsFromCsv(await res.text())
    if (!rows.length) throw new Error('no sheet prices')
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(rows))
    } catch {
      /* storage blocked */
    }
    return rows
  } catch {
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      return cached ? (JSON.parse(cached) as SheetRow[]) : null
    } catch {
      return null
    }
  } finally {
    clearTimeout(timer)
  }
}

async function start() {
  const rows = await loadPrices()
  if (rows) applyPriceRows(rows)
  // Load the app only after prices are settled, so every page reads the same numbers.
  const { default: App } = await import('./App')
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void start()
