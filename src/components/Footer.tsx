import { Link } from 'react-router-dom'
import { site, telHref } from '../config'
import { categories } from '../data/products'

export function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-grid">
          <div>
            <p style={{ color: 'var(--text)', fontWeight: 600 }}>{site.name}</p>
            <p>
              {site.address.street}, {site.address.city}, {site.address.region}
            </p>
            <p>
              <a href={`mailto:${site.email}`}>{site.email}</a>
              {site.phone && (
                <>
                  {' · '}
                  <a href={telHref(site.phone)}>{site.phone}</a>
                </>
              )}
            </p>
          </div>
          <div>
            <p style={{ color: 'var(--text)', fontWeight: 600 }}>Sell</p>
            <p style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', maxWidth: 360 }}>
              {categories.map((c) => (
                <Link key={c.id} to={`/sell/${c.id}`}>
                  {c.name}
                </Link>
              ))}
            </p>
          </div>
        </div>
        <div className="footer-note">
          Offers are for devices in good working condition and are confirmed after we look at the device. Prices as of{' '}
          {site.pricesUpdated}. {site.name} is an independent reseller and isn't affiliated with Apple Inc. Apple, iPhone,
          iPad, Mac, MacBook, Apple Watch, AirPods, Apple Pencil and Apple Vision Pro are trademarks of Apple Inc. Product
          photos © Apple Inc.
          <br />© {year} {site.name}
        </div>
      </div>
    </footer>
  )
}
