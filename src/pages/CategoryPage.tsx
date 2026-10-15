import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { categories, categoryById, formatPrice, productsIn, seriesIn, topPriceIn, type CategoryId } from '../data/products'
import { ProductCard } from '../components/ProductCard'
import { PriceSearch } from '../components/PriceSearch'
import { Reveal, WordsIn, spring } from '../components/motion'
import { ContactBand } from './Home'

type Sort = 'price' | 'name'

export default function CategoryPage() {
  const { id } = useParams()
  const category = categoryById.get(id as CategoryId)
  const [series, setSeries] = useState<string>('All')
  const [sort, setSort] = useState<Sort>('price')

  const list = useMemo(() => {
    if (!category) return []
    const all = productsIn(category.id).filter((p) => series === 'All' || p.series === series)
    return sort === 'price' ? [...all].sort((a, b) => b.price - a.price) : all
  }, [category, series, sort])

  if (!category) return <Navigate to="/" replace />
  const allSeries = ['All', ...seriesIn(category.id)]
  const name = category.id === 'accessories' ? 'your accessories' : `your ${category.name}`

  return (
    <div key={category.id}>
      <div className="wrap page-head">
        <nav className="cat-tabs" aria-label="Categories">
          {categories.map((c) => (
            <Link key={c.id} to={`/sell/${c.id}`} className={`cat-tab ${c.id === category.id ? 'active' : ''}`}>
              {c.name}
            </Link>
          ))}
        </nav>
        <h1 className="h1" style={{ marginTop: 18 }}>
          <WordsIn text={`Sell ${name}.`} />
        </h1>
        <Reveal delay={0.25}>
          <p className="lede">
            We pay up to <strong style={{ color: 'var(--text)' }}>{formatPrice(topPriceIn(category.id))}</strong>. Add
            everything you want to sell, then send one purchase order.
          </p>
        </Reveal>
        <Reveal delay={0.35}>
          <div style={{ marginTop: 26 }}>
            <PriceSearch variant="light" />
          </div>
        </Reveal>
      </div>

      <div className="filter-bar">
        <div className="wrap" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LayoutGroup id="series">
            <div className="filter-row" role="tablist" style={{ flex: 1 }}>
              {allSeries.map((s) => (
                <button
                  key={s}
                  role="tab"
                  aria-selected={s === series}
                  className={`filter-chip ${s === series ? 'is-on' : ''}`}
                  onClick={() => setSeries(s)}
                >
                  {s === series && <motion.span layoutId="pill" className="filter-pill" transition={spring} />}
                  {s}
                </button>
              ))}
            </div>
          </LayoutGroup>
          <button
            className="btn-ghost"
            style={{ fontSize: '0.86rem', whiteSpace: 'nowrap' }}
            onClick={() => setSort(sort === 'price' ? 'name' : 'price')}
          >
            Sort: {sort === 'price' ? 'Highest offer' : 'Newest'}
          </button>
        </div>
      </div>

      <div className="wrap">
        <motion.div className="grid" layout>
          <AnimatePresence mode="popLayout">
            {list.map((p, i) => (
              <motion.div
                key={p.id}
                layout
                initial={{ opacity: 0, y: 24, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.94 }}
                transition={{ ...spring, delay: Math.min(i, 8) * 0.035 }}
              >
                <ProductCard product={p} showHot eager={i < 4} />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </div>
      <ContactBand />
    </div>
  )
}
