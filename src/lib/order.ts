import { site } from '../config'
import { formatPrice } from '../data/products'
import type { BagLine } from './bag'

export type ContactPref = 'email' | 'phone' | 'social'

export interface OrderForm {
  name: string
  email: string
  phone: string
  social: string
  prefer: ContactPref
  note: string
  /** Honeypot. Real people never see or fill this. */
  website: string
}

export interface SentOrder {
  orderId: string
  total: number
  count: number
  email: string
  sentAt: number
}

export function newOrderId() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  for (const b of bytes) s += alphabet[b % alphabet.length]
  return `ST-${s.slice(0, 3)}-${s.slice(3)}`
}

export function validate(f: OrderForm, lines: BagLine[]) {
  const errors: Partial<Record<keyof OrderForm | 'items', string>> = {}
  if (!f.name.trim()) errors.name = 'Add your name so we know who to ask for.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) errors.email = 'That email address looks off.'
  if (f.phone.trim() && f.phone.replace(/\D/g, '').length < 7) errors.phone = 'That phone number looks too short.'
  if (f.prefer === 'phone' && !f.phone.trim()) errors.phone = 'Add a number if you want us to call.'
  if (f.prefer === 'social' && !f.social.trim()) errors.social = 'Add your handle or profile link.'
  if (!lines.length && !f.note.trim()) errors.items = 'Add a device to your bag, or describe what you have in the note.'
  return errors
}

/** Sends the purchase order to the email relay. Throws with a readable message on failure. */
export async function sendOrder(orderId: string, f: OrderForm, lines: BagLine[]) {
  if (!site.orderEndpoint) throw new Error('The order form is not connected yet.')
  const res = await fetch(site.orderEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId,
      name: f.name.trim(),
      email: f.email.trim(),
      phone: f.phone.trim(),
      social: f.social.trim(),
      prefer: f.prefer,
      note: f.note.trim(),
      website: f.website,
      items: lines.map((l) => ({ id: l.product.id, qty: l.qty })),
      page: window.location.href,
    }),
  })
  if (!res.ok) {
    let msg = `The server answered ${res.status}.`
    try {
      const j = (await res.json()) as { error?: string }
      if (j.error) msg = j.error
    } catch {
      /* not JSON */
    }
    throw new Error(msg)
  }
}

/** Plain-text version of the order, used for the "email it instead" fallback. */
export function mailtoHref(orderId: string, f: OrderForm, lines: BagLine[]) {
  const total = lines.reduce((n, l) => n + l.qty * l.product.price, 0)
  const body = [
    `Purchase order ${orderId}`,
    '',
    ...lines.map((l) => `${l.qty} x ${l.product.name} at ${formatPrice(l.product.price)} = ${formatPrice(l.qty * l.product.price)}`),
    '',
    `Total: ${formatPrice(total)}`,
    '',
    `Name: ${f.name}`,
    `Email: ${f.email}`,
    f.phone ? `Phone: ${f.phone}` : null,
    f.social ? `Social: ${f.social}` : null,
    `Preferred contact: ${f.prefer}`,
    f.note ? `Note: ${f.note}` : null,
  ]
    .filter((x) => x !== null)
    .join('\n')
  return `mailto:${site.email}?subject=${encodeURIComponent(`Purchase order ${orderId}`)}&body=${encodeURIComponent(body)}`
}
