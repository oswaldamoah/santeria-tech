import { AnimatePresence, animate, motion } from 'motion/react'
import { Menu, Search, ShoppingBag, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { site } from '../config'
import { categories } from '../data/products'
import { useBag } from '../lib/bag'
import { PriceSearch } from './PriceSearch'
import { spring } from './motion'

export function Nav() {
  const bag = useBag()
  const { pathname } = useLocation()
  const [scrolled, setScrolled] = useState(false)
  const [overDark, setOverDark] = useState(pathname === '/')
  const [menu, setMenu] = useState(false)
  const [search, setSearch] = useState(false)

  // The nav turns dark while it sits over a dark section.
  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 4)
      const probe = document.elementsFromPoint(window.innerWidth / 2, 60)
      setOverDark(probe.some((el) => el.closest('[data-dark]')))
    }
    onScroll()
    // Check again once the page transition has swapped the old page out.
    const timers = [150, 400, 800].map((ms) => setTimeout(onScroll, ms))
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      timers.forEach(clearTimeout)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [pathname])

  useEffect(() => {
    setMenu(false)
    setSearch(false)
  }, [pathname])

  // Bump the bag icon when something lands in it.
  useEffect(() => {
    const el = bag.bagButton.current
    if (!bag.bumps || !el) return
    animate(el, { scale: [1, 1.28, 1] }, { duration: 0.45, ease: [0.34, 1.56, 0.64, 1] })
  }, [bag.bumps, bag.bagButton])

  const dark = overDark && !menu && !search

  return (
    <>
      <header className={`nav ${dark ? 'is-dark' : ''} ${scrolled ? 'is-scrolled' : ''}`}>
        <div className="wrap nav-inner">
          <Link to="/" className="brand" aria-label={`${site.name} home`}>
            <img className="brand-mark" src={`${import.meta.env.BASE_URL}logo-mark.png`} alt="" width={28} height={28} />
            {site.name}
          </Link>
          <nav className="nav-links" aria-label="Categories">
            {categories.map((c) => (
              <NavLink key={c.id} to={`/sell/${c.id}`} className={({ isActive }) => (isActive ? 'active' : '')}>
                {c.name}
              </NavLink>
            ))}
          </nav>
          <button className="icon-btn" aria-label="Search prices" onClick={() => setSearch((s) => !s)}>
            {search ? <X size={19} /> : <Search size={18} />}
          </button>
          <button
            ref={bag.bagButton}
            className="icon-btn bag-btn"
            aria-label={`Sell bag, ${bag.count} item${bag.count === 1 ? '' : 's'}`}
            onClick={bag.open}
          >
            <ShoppingBag size={18} />
            <AnimatePresence>
              {bag.count > 0 && (
                <motion.span
                  key="count"
                  className="bag-count"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  transition={{ type: 'spring', bounce: 0.4, duration: 0.4 }}
                >
                  {bag.count}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
          <button className="icon-btn menu-btn" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            {menu ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
      </header>

      <AnimatePresence>
        {menu && (
          <motion.nav
            className="mobile-menu"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={spring}
            aria-label="Categories"
          >
            {categories.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: 0.03 * i }}
              >
                <Link to={`/sell/${c.id}`}>{c.name}</Link>
              </motion.div>
            ))}
          </motion.nav>
        )}
        {search && (
          <motion.div
            className="mobile-menu"
            style={{ paddingTop: 18, paddingBottom: 30 }}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={spring}
          >
            <div className="wrap" style={{ padding: 0, maxWidth: 640 }}>
              <PriceSearch variant="light" autoFocus />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
