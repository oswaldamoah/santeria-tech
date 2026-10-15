/**
 * Santeria Tech order relay (Cloudflare Worker).
 *
 * GitHub Pages can only serve static files, and a Resend API key must never ship
 * in browser code. The site posts purchase orders here; this worker checks them,
 * looks up the real prices from the same catalog the site uses, and emails the
 * order through Resend.
 */
import catalog from '../../src/data/catalog.json'

interface Env {
  RESEND_API_KEY: string
  /** e.g. "Santeria Tech <orders@yourdomain.com>" (must be on a domain verified in Resend) */
  FROM_EMAIL: string
  /** Comma-separated list of inboxes that receive each purchase order. */
  TO_EMAILS: string
  /** Comma-separated list of site origins allowed to post, e.g. "https://you.github.io,http://localhost:5173" */
  ALLOWED_ORIGINS: string
}

interface Product {
  id: string
  name: string
  price: number
}

interface Payload {
  orderId?: string
  name?: string
  email?: string
  phone?: string
  social?: string
  prefer?: string
  note?: string
  website?: string
  page?: string
  items?: { id?: string; qty?: number }[]
}

const products = new Map((catalog as Product[]).map((p) => [p.id, p]))

const money = (n: number) =>
  n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  })

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

function cors(origin: string | null, env: Env) {
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  const ok = origin && (allowed.includes(origin) || allowed.includes('*'))
  return {
    'Access-Control-Allow-Origin': ok ? origin : allowed[0] ?? '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
    __ok: ok ? '1' : '',
  }
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  const { __ok, ...h } = headers
  void __ok
  return new Response(JSON.stringify(body), { status, headers: { ...h, 'Content-Type': 'application/json' } })
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('Origin')
    const headers = cors(origin, env)

    if (req.method === 'OPTIONS') return json({}, 204, headers)
    if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405, headers)
    if (!headers.__ok) return json({ error: 'This site is not allowed to send orders.' }, 403, headers)

    const raw = await req.text()
    if (raw.length > 20_000) return json({ error: 'That order is too large.' }, 413, headers)

    let body: Payload
    try {
      body = JSON.parse(raw) as Payload
    } catch {
      return json({ error: 'Could not read the order.' }, 400, headers)
    }

    // Bots fill the hidden field. Pretend it worked so they move on.
    if (body.website) return json({ ok: true }, 200, headers)

    const name = clip(body.name, 120)
    const email = clip(body.email, 200)
    const phone = clip(body.phone, 40)
    const social = clip(body.social, 300)
    const note = clip(body.note, 3000)
    const prefer = ['email', 'phone', 'social'].includes(body.prefer ?? '') ? body.prefer! : 'email'
    const orderId = /^ST-[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(body.orderId ?? '')
      ? body.orderId!
      : `ST-${crypto.randomUUID().slice(0, 6).toUpperCase()}`

    if (!name) return json({ error: 'Name is missing.' }, 400, headers)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: 'Email looks invalid.' }, 400, headers)

    // Prices come from the catalog, not from the browser.
    const lines = (Array.isArray(body.items) ? body.items : [])
      .slice(0, 50)
      .map((i) => ({ product: products.get(String(i.id)), qty: Math.max(1, Math.min(999, Math.floor(Number(i.qty) || 1))) }))
      .filter((l): l is { product: Product; qty: number } => !!l.product)

    if (!lines.length && !note) return json({ error: 'The order has no devices and no note.' }, 400, headers)

    const total = lines.reduce((n, l) => n + l.qty * l.product.price, 0)
    const count = lines.reduce((n, l) => n + l.qty, 0)
    const received = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' })

    const rows = lines
      .map(
        (l) => `<tr>
          <td style="padding:10px 0;border-bottom:1px solid #eee">${esc(l.product.name)}</td>
          <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:center">${l.qty}</td>
          <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right">${money(l.product.price)}</td>
          <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right;font-weight:600">${money(l.qty * l.product.price)}</td>
        </tr>`,
      )
      .join('')

    const detail = (label: string, value: string) =>
      value
        ? `<tr><td style="padding:4px 16px 4px 0;color:#6e6e73;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:4px 0">${value}</td></tr>`
        : ''

    const socialHtml = /^https?:\/\//i.test(social) ? `<a href="${esc(social)}">${esc(social)}</a>` : esc(social)

    const html = `<!doctype html><html><body style="margin:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1d1d1f">
  <div style="max-width:600px;margin:0 auto;padding:28px 16px">
    <div style="background:#fff;border-radius:18px;padding:28px">
      <div style="font-size:13px;color:#6e6e73">New purchase order · ${esc(received)} (Houston time)</div>
      <h1 style="font-size:26px;letter-spacing:-0.5px;margin:6px 0 2px">${esc(orderId)}</h1>
      <div style="font-size:15px;color:#6e6e73">${count} device${count === 1 ? '' : 's'} · payout ${money(total)}</div>

      <h2 style="font-size:15px;margin:26px 0 8px">Seller</h2>
      <table style="font-size:15px;border-collapse:collapse">
        ${detail('Name', esc(name))}
        ${detail('Email', `<a href="mailto:${esc(email)}">${esc(email)}</a>`)}
        ${detail('Phone', phone ? `<a href="tel:${esc(phone.replace(/[^\d+]/g, ''))}">${esc(phone)}</a>` : '')}
        ${detail('Social', socialHtml)}
        ${detail('Prefers', esc(prefer))}
      </table>

      ${
        lines.length
          ? `<h2 style="font-size:15px;margin:26px 0 4px">Devices</h2>
      <table style="width:100%;font-size:14px;border-collapse:collapse">
        <tr style="color:#6e6e73;font-size:12px"><td>Model</td><td style="text-align:center">Qty</td><td style="text-align:right">Each</td><td style="text-align:right">Line</td></tr>
        ${rows}
        <tr><td colspan="3" style="padding:14px 0 0;font-weight:600">Total payout</td><td style="padding:14px 0 0;text-align:right;font-size:20px;font-weight:700">${money(total)}</td></tr>
      </table>`
          : ''
      }

      ${note ? `<h2 style="font-size:15px;margin:26px 0 6px">Note</h2><div style="font-size:15px;white-space:pre-wrap;background:#f5f5f7;border-radius:12px;padding:14px">${esc(note)}</div>` : ''}

      <p style="font-size:13px;color:#6e6e73;margin:26px 0 0">Reply to this email to answer the seller directly. They were told to expect contact within 12 hours.</p>
    </div>
  </div>
</body></html>`

    const text = [
      `New purchase order ${orderId} (${received}, Houston time)`,
      '',
      `Name: ${name}`,
      `Email: ${email}`,
      phone ? `Phone: ${phone}` : null,
      social ? `Social: ${social}` : null,
      `Prefers: ${prefer}`,
      '',
      ...lines.map((l) => `${l.qty} x ${l.product.name} @ ${money(l.product.price)} = ${money(l.qty * l.product.price)}`),
      lines.length ? `Total payout: ${money(total)}` : null,
      note ? `\nNote:\n${note}` : null,
    ]
      .filter((x) => x !== null)
      .join('\n')

    const to = env.TO_EMAILS.split(',').map((s) => s.trim()).filter(Boolean)
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': orderId,
      },
      body: JSON.stringify({
        from: env.FROM_EMAIL,
        to,
        reply_to: email,
        subject: `Purchase order ${orderId}: ${count ? `${count} device${count === 1 ? '' : 's'}, ${money(total)}` : 'quote request'} from ${name}`,
        html,
        text,
      }),
    })

    if (!res.ok) {
      console.error('Resend error', res.status, await res.text())
      return json({ error: 'Our mail service is having trouble.' }, 502, headers)
    }

    return json({ ok: true, orderId }, 200, headers)
  },
}
