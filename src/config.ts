// Business details shown across the site. Edit these freely.
export const site = {
  name: 'Santeria Tech',
  email: 'santeriatech@atomicmail.io',
  /** Shown as written. Leave empty ('') to hide the phone number everywhere. */
  phone: '(713) 555-0100',
  address: {
    street: 'Williams Tell St',
    city: 'Houston',
    region: 'Texas',
  },
  /** Promise shown after someone sends a purchase order. */
  responseHours: 12,
  /** Month the price list was last updated. */
  pricesUpdated: 'October 2026',
  /**
   * Address of your Cloudflare Worker (see worker/ and the README), e.g. "https://santeria-orders.you.workers.dev".
   * It saves purchase orders to Neon, emails them through Resend, serves prices from your
   * Google Sheet and powers the dashboard. Set VITE_API_URL as a GitHub repository variable, or paste it here.
   */
  apiUrl: ((import.meta.env.VITE_API_URL || import.meta.env.VITE_ORDER_ENDPOINT || '') as string).replace(/\/+$/, ''),
  /**
   * Only used if apiUrl is empty: a "Publish to web" link to the Site Prices tab, read straight from the browser.
   * With apiUrl set, the worker reads your sheet privately instead.
   */
  priceSheetUrl: (import.meta.env.VITE_PRICE_SHEET_URL as string | undefined) || '',
}

export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`
