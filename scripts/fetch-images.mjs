// Looks up a photo for every product on Wikipedia and writes public/images.json.
// Runs in the GitHub Pages workflow; you can also run it locally with `npm run images`.
import { readFile, writeFile } from 'node:fs/promises'

const API = 'https://en.wikipedia.org/w/api.php'
const UA = 'SanteriaTechSite/1.0 (santeriatech@atomicmail.io)'

const products = JSON.parse(await readFile(new URL('../src/data/catalog.json', import.meta.url), 'utf8'))
const titles = [...new Set(products.flatMap((p) => p.wiki))]
const found = new Map()

for (let i = 0; i < titles.length; i += 50) {
  const batch = titles.slice(i, i + 50)
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    redirects: '1',
    prop: 'pageimages',
    piprop: 'thumbnail|name',
    pithumbsize: '800',
    titles: batch.join('|'),
  })
  const res = await fetch(`${API}?${params}`, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`Wikipedia returned ${res.status}`)
  const { query = {} } = await res.json()
  const byFinal = new Map()
  for (const p of query.pages ?? []) {
    if (p.thumbnail?.source) byFinal.set(p.title, { src: p.thumbnail.source, file: p.pageimage, article: p.title })
  }
  const normalized = new Map((query.normalized ?? []).map((n) => [n.from, n.to]))
  const redirects = new Map((query.redirects ?? []).map((r) => [r.from, r.to]))
  for (const t of batch) {
    const n = normalized.get(t) ?? t
    const img = byFinal.get(redirects.get(n) ?? n)
    if (img) found.set(t, img)
  }
}

const out = {}
let hits = 0
for (const p of products) {
  const img = p.wiki.map((t) => found.get(t)).find(Boolean)
  out[p.id] = img ?? null
  if (img) hits++
  else console.log(`  no photo: ${p.name}`)
}

await writeFile(new URL('../public/images.json', import.meta.url), JSON.stringify(out, null, 2) + '\n')
console.log(`Found photos for ${hits} of ${products.length} products.`)
