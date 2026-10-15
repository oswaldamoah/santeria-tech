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
   * Endpoint that emails purchase orders through Resend (see worker/ and the README).
   * Set VITE_ORDER_ENDPOINT as a GitHub repository variable, or paste the URL here.
   */
  orderEndpoint: (import.meta.env.VITE_ORDER_ENDPOINT as string | undefined) ?? '',
}

export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`
