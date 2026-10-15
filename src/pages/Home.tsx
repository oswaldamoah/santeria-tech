import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react'
import { ChevronLeft, ChevronRight, Flame, Mail, MapPin, Phone, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { site, telHref } from '../config'
import { categories, formatPrice, hotProducts, productById, products, topPriceIn, type Category } from '../data/products'
import { PriceSearch } from '../components/PriceSearch'
import { ProductCard } from '../components/ProductCard'
import { ProductImage } from '../components/ProductImage'
import { Money, MoneyValue, Reveal, WordsIn, spring } from '../components/motion'

/* ---------- Hero ---------- */

function Ticker() {
  const [i, setI] = useState(0)
  const items = hotProducts.slice(0, 8)
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % items.length), 3200)
    return () => clearInterval(t)
  }, [items.length])
  const p = items[i]
  // The old and new values share one grid cell, so one fades out while the next fades in.
  const fade = {
    initial: { opacity: 0, filter: 'blur(6px)' },
    animate: { opacity: 1, filter: 'blur(0px)' },
    exit: { opacity: 0, filter: 'blur(6px)' },
    transition: { duration: 0.9, ease: [0.4, 0, 0.2, 1] as const },
  }
  return (
    <motion.div
      className="hero-ticker"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.9, duration: 0.8 }}
      aria-live="off"
    >
      <span className="ticker-lead">
        We'll pay{' '}
        <span className="ticker-slot ticker-price-slot">
          <AnimatePresence initial={false}>
            <motion.strong key={p.id} className="ticker-price gold-text" {...fade}>
              {formatPrice(p.price)}
            </motion.strong>
          </AnimatePresence>
        </span>{' '}
        for your
      </span>
      <span className="ticker-slot ticker-name-slot">
        <AnimatePresence initial={false}>
          <motion.strong key={p.id} {...fade}>
            {p.name}
          </motion.strong>
        </AnimatePresence>
      </span>
    </motion.div>
  )
}

function Hero() {
  return (
    <section className="hero" data-dark>
      <motion.div
        className="hero-glow"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 2.2, ease: [0.16, 1, 0.3, 1] }}
      />
      <div className="wrap hero-inner">
        <motion.p
          className="eyebrow"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, duration: 0.8 }}
        >
          {site.name} · {site.address.city}, {site.address.region}
        </motion.p>
        <h1 className="display">
          <WordsIn text="Your old Apple gear" delay={0.1} />
          <br />
          <WordsIn text="is worth real money." className="gold-text" delay={0.35} />
        </h1>
        <motion.p
          className="lede"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, duration: 1, delay: 0.6 }}
        >
          Look up your model and see our offer right away. Send us a purchase order and we'll get back to you within{' '}
          {site.responseHours} hours.
        </motion.p>
        <Ticker />
        <motion.div
          style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ ...spring, duration: 1, delay: 0.75 }}
        >
          <PriceSearch />
        </motion.div>
      </div>
    </section>
  )
}

/* ---------- Depreciation scene ---------- */

const LADDER = [
  'iphone-18-pro-max-1tb',
  'iphone-17-pro-max',
  'iphone-16-pro-max',
  'iphone-15-pro-max',
  'iphone-14-pro-max',
  'iphone-13-pro-max',
  'iphone-12-pro-max',
  'iphone-11-pro-max',
]
  .map((id) => productById.get(id)!)
  .filter(Boolean)

const avgDrop = Math.round(
  (LADDER.slice(1).reduce((sum, p, i) => sum + (LADDER[i].price - p.price) / LADDER[i].price, 0) / (LADDER.length - 1)) * 100,
)

function DecayRow({ index, active, progress }: { index: number; active: number; progress: ReturnType<typeof useSpring> }) {
  const p = LADDER[index]
  const max = LADDER[0].price
  const n = LADDER.length
  // Each bar fills as the scroll reaches it.
  const start = (index / n) * 0.55
  const fill = useTransform(progress, [start, start + 0.18], [0.02, p.price / max])
  return (
    <motion.div className="decay-row" animate={{ opacity: index === active ? 1 : 0.42 }} transition={{ duration: 0.3 }}>
      <span className="decay-row-name">{p.name.replace('iPhone ', '').replace(/\s*\(.*\)/, '')}</span>
      <span className="decay-bar">
        <motion.span className="decay-bar-fill" style={{ display: 'block', scaleX: fill }} />
      </span>
      <span className="decay-row-price">{formatPrice(p.price)}</span>
    </motion.div>
  )
}

function Decay() {
  const track = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: track, offset: ['start 0.7', 'end end'] })
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.6 })
  const [active, setActive] = useState(0)
  const big = useSpring(LADDER[0].price, { stiffness: 120, damping: 24 })

  useMotionValueEvent(progress, 'change', (v) => {
    const i = Math.min(LADDER.length - 1, Math.max(0, Math.floor(((v - 0.2) / 0.7) * LADDER.length)))
    if (i !== active) {
      setActive(i)
      big.set(LADDER[i].price)
    }
  })

  return (
    <section className="decay" data-dark>
      <div className="decay-track" ref={track}>
        <div className="decay-sticky">
          <div className="wrap decay-grid">
            <div className="decay-copy">
              <Reveal>
                <p className="eyebrow">Why sell now</p>
                <h2 className="h1">
                  Every year it waits,
                  <br />
                  <span className="gold-text">it's worth less.</span>
                </h2>
              </Reveal>
              <Reveal delay={0.1}>
                <p className="lede">
                  On our own price list, each iPhone Pro Max is worth about {avgDrop}% less than the one that came after it.
                  The phone in your drawer is losing value on that same curve.
                </p>
              </Reveal>
              <div className="decay-big">
                <MoneyValue mv={big} className="gold-text" />
              </div>
              <AnimatePresence mode="wait">
                <motion.div
                  key={active}
                  className="decay-big-label"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                >
                  What we pay for an {LADDER[active].name} today
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="decay-bars">
              {LADDER.map((_, i) => (
                <DecayRow key={i} index={i} active={active} progress={progress} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------- Hot rail ---------- */

function HotRail() {
  const rail = useRef<HTMLDivElement>(null)
  const [edge, setEdge] = useState({ start: true, end: false })

  const update = () => {
    const el = rail.current
    if (!el) return
    setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth > el.scrollWidth - 8 })
  }

  useEffect(update, [])

  const by = (dir: 1 | -1) => {
    const el = rail.current
    if (!el) return
    const card = el.firstElementChild as HTMLElement | null
    el.scrollBy({ left: dir * ((card?.offsetWidth ?? 300) + 20) * 2, behavior: 'smooth' })
  }

  return (
    <section className="section section-gray" style={{ overflow: 'hidden' }}>
      <div className="wrap">
        <div className="section-head">
          <Reveal>
            <p className="eyebrow hot-eyebrow">
              <Flame size={14} fill="currentColor" aria-hidden /> Hot
            </p>
            <h2 className="h2">The models we want most.</h2>
            <p className="lede">Top offers on the list. Tap Sell to add one to your bag.</p>
          </Reveal>
          <div className="rail-controls">
            <button className="rail-arrow" onClick={() => by(-1)} disabled={edge.start} aria-label="Previous">
              <ChevronLeft size={20} />
            </button>
            <button className="rail-arrow" onClick={() => by(1)} disabled={edge.end} aria-label="Next">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
        <div className="rail" ref={rail} onScroll={update}>
          {hotProducts.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, x: 60 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '0px 0px -10% 0px' }}
              transition={{ ...spring, duration: 0.8, delay: Math.min(i, 4) * 0.07 }}
            >
              <ProductCard product={p} showHot />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------- Categories ---------- */

function CategoryTile({ c, className = '', delay = 0 }: { c: Category; className?: string; delay?: number }) {
  const cover = productById.get(c.cover)!
  const [hover, setHover] = useState(false)
  return (
    <motion.div
      className={`cat-tile ${className}`}
      style={{ padding: 0 }}
      initial={{ opacity: 0, y: 40, scale: 0.97 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ ...spring, duration: 0.9, delay }}
      whileTap={{ scale: 0.985 }}
      onHoverStart={() => setHover(true)}
      onHoverEnd={() => setHover(false)}
    >
      <Link
        to={`/sell/${c.id}`}
        style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '26px 26px 0', color: 'inherit', textDecoration: 'none' }}
      >
        <div className="cat-tile-name">{c.name}</div>
        <div className="cat-tile-sub">{c.tagline}</div>
        <div className="cat-tile-price">
          Up to <span className={className.includes('dark') ? 'gold-text' : 'gold-deep-text'}>{formatPrice(topPriceIn(c.id))}</span>
        </div>
        <span className="cat-tile-cta">
          See prices <ChevronRight size={16} />
        </span>
        <motion.div className="cat-tile-art" animate={{ scale: hover ? 1.05 : 1, y: hover ? -6 : 0 }} transition={spring}>
          <ProductImage product={cover} />
        </motion.div>
      </Link>
    </motion.div>
  )
}

function Categories() {
  const layout: Record<string, string> = {
    iphone: 'wide feature',
    mac: 'wide',
    vision: 'wide feature',
    accessories: 'wide',
  }
  return (
    <section className="section">
      <div className="wrap">
        <div className="section-head">
          <Reveal>
            <p className="eyebrow">Shop by category</p>
            <h2 className="h2">What are you selling?</h2>
          </Reveal>
        </div>
        <div className="cat-grid">
          {categories.map((c, i) => (
            <CategoryTile key={c.id} c={c} className={layout[c.id] ?? ''} delay={(i % 3) * 0.06} />
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------- How it works ---------- */

function Steps() {
  const steps = [
    {
      title: "Add what you're selling",
      body: 'Search your model or open a category. Our offer is on every device, so you know the number before you share anything.',
    },
    {
      title: 'Send a purchase order',
      body: 'Your email is all we need. Add a phone number, a social handle or a note about condition if you like.',
    },
    {
      title: `Hear back within ${site.responseHours} hours`,
      body: 'We reach out by email or phone to confirm the details and set up the handoff.',
    },
  ]
  return (
    <section className="section section-gray">
      <div className="wrap">
        <div className="section-head">
          <Reveal>
            <p className="eyebrow">How it works</p>
            <h2 className="h2">Three steps, about a minute.</h2>
          </Reveal>
        </div>
        <div className="steps">
          {steps.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.1} className="step">
              <div className="step-num gold-deep-text">{i + 1}</div>
              <h3 className="h3">{s.title}</h3>
              <p>{s.body}</p>
            </Reveal>
          ))}
        </div>
        <Reveal delay={0.2}>
          <div style={{ marginTop: 36, display: 'flex', justifyContent: 'center' }}>
            <Link to="/sell/iphone" className="btn btn-primary btn-large">
              <Plus size={18} /> Start with your iPhone
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* ---------- Numbers ---------- */

function Facts() {
  const top = products.reduce((a, b) => (b.price > a.price ? b : a))
  return (
    <section className="section section-dark" data-dark>
      <div className="wrap">
        <div className="facts">
          <Reveal className="fact">
            <div className="fact-num">
              <Money value={top.price} className="gold-text" />
            </div>
            <p>Our top offer on the list, for the {top.name}.</p>
          </Reveal>
          <Reveal className="fact" delay={0.1}>
            <div className="fact-num">{products.length}</div>
            <p>Apple models with a price you can see before you contact us.</p>
          </Reveal>
          <Reveal className="fact" delay={0.2}>
            <div className="fact-num">
              {site.responseHours}
              <span style={{ fontSize: '0.5em', marginLeft: 6 }}>hrs</span>
            </div>
            <p>The longest you'll wait for us to reply after you send a purchase order.</p>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/* ---------- FAQ ---------- */

const FAQ = [
  {
    q: 'Does sending a purchase order mean I have to sell?',
    a: "No. It tells us what you have and how to reach you. We confirm the details with you before anything changes hands, and you can say no at any point.",
  },
  {
    q: 'Is the price on the site the price I get?',
    a: "It's our offer for a device in good working condition. We confirm it once we see the device, and if anything changes we'll tell you why before you decide.",
  },
  {
    q: "My model isn't listed. Can I still sell it?",
    a: "Probably. Send a purchase order with a note describing the device, or email us, and we'll quote it by hand.",
  },
  {
    q: 'Where are you?',
    a: `${site.address.street}, ${site.address.city}, ${site.address.region}. Email ${site.email}${site.phone ? ` or call ${site.phone}` : ''}.`,
  },
  {
    q: 'Should I erase my device first?',
    a: 'Back it up, sign out of your Apple Account so Find My and Activation Lock are off, then erase it. If you need help with any of that, ask us when we reach out.',
  },
]

function Faq() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <section className="section">
      <div className="wrap">
        <Reveal>
          <p className="eyebrow">Questions</p>
          <h2 className="h2" style={{ marginBottom: 20 }}>
            Good to know.
          </h2>
        </Reveal>
        <div className="faq">
          {FAQ.map((f, i) => (
            <div className="faq-item" key={f.q}>
              <button className="faq-q" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                {f.q}
                <Plus size={22} />
              </button>
              <AnimatePresence initial={false}>
                {open === i && (
                  <motion.div
                    className="faq-a"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
                  >
                    <p>{f.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------- Contact ---------- */

export function ContactBand() {
  return (
    <section className="section section-dark" data-dark>
      <div className="wrap contact-band">
        <Reveal>
          <p className="eyebrow">Talk to us</p>
          <h2 className="h1">
            Rather ask first?
            <br />
            <span className="gold-text">We're easy to reach.</span>
          </h2>
        </Reveal>
        <div className="contact-list">
          <Reveal delay={0.05}>
            <a className="contact-card" href={`mailto:${site.email}`}>
              <span className="contact-icon">
                <Mail size={20} />
              </span>
              <span>
                <small>Email</small>
                {site.email}
              </span>
            </a>
          </Reveal>
          {site.phone && (
            <Reveal delay={0.1}>
              <a className="contact-card" href={telHref(site.phone)}>
                <span className="contact-icon">
                  <Phone size={20} />
                </span>
                <span>
                  <small>Phone</small>
                  {site.phone}
                </span>
              </a>
            </Reveal>
          )}
          <Reveal delay={0.15}>
            <a
              className="contact-card"
              href={`https://maps.google.com/?q=${encodeURIComponent(`${site.address.street}, ${site.address.city}, ${site.address.region}`)}`}
              target="_blank"
              rel="noreferrer"
            >
              <span className="contact-icon">
                <MapPin size={20} />
              </span>
              <span>
                <small>Address</small>
                {site.address.street}, {site.address.city}, {site.address.region}
              </span>
            </a>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

export default function Home() {
  return (
    <>
      <Hero />
      <HotRail />
      <Decay />
      <Categories />
      <Steps />
      <Facts />
      <Faq />
      <ContactBand />
    </>
  )
}
