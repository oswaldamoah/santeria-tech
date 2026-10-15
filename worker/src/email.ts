/** Builds and sends the purchase order email through Resend. */

export interface OrderEmail {
  code: string
  name: string
  email: string
  phone: string
  social: string
  prefer: string
  note: string
  lines: { name: string; price: number; qty: number }[]
  dashboardUrl?: string
}

export const money = (n: number) =>
  n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  })

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export function renderOrderEmail(o: OrderEmail) {
  const total = o.lines.reduce((n, l) => n + l.qty * l.price, 0)
  const count = o.lines.reduce((n, l) => n + l.qty, 0)
  const received = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' })

  const rows = o.lines
    .map(
      (l) => `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #eee">${esc(l.name)}</td>
        <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:center">${l.qty}</td>
        <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right">${money(l.price)}</td>
        <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right;font-weight:600">${money(l.qty * l.price)}</td>
      </tr>`,
    )
    .join('')

  const detail = (label: string, value: string) =>
    value
      ? `<tr><td style="padding:4px 16px 4px 0;color:#6e6e73;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:4px 0">${value}</td></tr>`
      : ''
  const socialHtml = /^https?:\/\//i.test(o.social) ? `<a href="${esc(o.social)}">${esc(o.social)}</a>` : esc(o.social)
  const button = o.dashboardUrl
    ? `<a href="${esc(o.dashboardUrl)}" style="display:inline-block;margin-top:22px;background:#0071e3;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:980px">Open in dashboard</a>`
    : ''

  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1d1d1f">
  <div style="max-width:600px;margin:0 auto;padding:28px 16px">
    <div style="background:#fff;border-radius:18px;padding:28px">
      <div style="font-size:13px;color:#6e6e73">New purchase order · ${esc(received)} (Houston time)</div>
      <h1 style="font-size:26px;letter-spacing:-0.5px;margin:6px 0 2px">${esc(o.code)}</h1>
      <div style="font-size:15px;color:#6e6e73">${count} device${count === 1 ? '' : 's'} · payout ${money(total)}</div>
      ${button}

      <h2 style="font-size:15px;margin:26px 0 8px">Seller</h2>
      <table style="font-size:15px;border-collapse:collapse">
        ${detail('Name', esc(o.name))}
        ${detail('Email', `<a href="mailto:${esc(o.email)}">${esc(o.email)}</a>`)}
        ${detail('Phone', o.phone ? `<a href="tel:${esc(o.phone.replace(/[^\d+]/g, ''))}">${esc(o.phone)}</a>` : '')}
        ${detail('Social', socialHtml)}
        ${detail('Prefers', esc(o.prefer))}
      </table>

      ${
        o.lines.length
          ? `<h2 style="font-size:15px;margin:26px 0 4px">Devices</h2>
      <table style="width:100%;font-size:14px;border-collapse:collapse">
        <tr style="color:#6e6e73;font-size:12px"><td>Model</td><td style="text-align:center">Qty</td><td style="text-align:right">Each</td><td style="text-align:right">Line</td></tr>
        ${rows}
        <tr><td colspan="3" style="padding:14px 0 0;font-weight:600">Total payout</td><td style="padding:14px 0 0;text-align:right;font-size:20px;font-weight:700">${money(total)}</td></tr>
      </table>`
          : ''
      }

      ${o.note ? `<h2 style="font-size:15px;margin:26px 0 6px">Note</h2><div style="font-size:15px;white-space:pre-wrap;background:#f5f5f7;border-radius:12px;padding:14px">${esc(o.note)}</div>` : ''}

      <p style="font-size:13px;color:#6e6e73;margin:26px 0 0">Reply to this email to answer the seller directly. They were told to expect contact within 12 hours.</p>
    </div>
  </div>
</body></html>`

  const text = [
    `New purchase order ${o.code} (${received}, Houston time)`,
    o.dashboardUrl ? `Dashboard: ${o.dashboardUrl}` : null,
    '',
    `Name: ${o.name}`,
    `Email: ${o.email}`,
    o.phone ? `Phone: ${o.phone}` : null,
    o.social ? `Social: ${o.social}` : null,
    `Prefers: ${o.prefer}`,
    '',
    ...o.lines.map((l) => `${l.qty} x ${l.name} @ ${money(l.price)} = ${money(l.qty * l.price)}`),
    o.lines.length ? `Total payout: ${money(total)}` : null,
    o.note ? `\nNote:\n${o.note}` : null,
  ]
    .filter((x) => x !== null)
    .join('\n')

  const subject = `Purchase order ${o.code}: ${count ? `${count} device${count === 1 ? '' : 's'}, ${money(total)}` : 'quote request'} from ${o.name}`
  return { html, text, subject, total, count }
}

export async function sendWithResend(
  env: { RESEND_API_KEY?: string; FROM_EMAIL: string; TO_EMAILS: string },
  o: OrderEmail,
) {
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set')
  const { html, text, subject } = renderOrderEmail(o)
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': o.code,
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      to: env.TO_EMAILS.split(',').map((s) => s.trim()).filter(Boolean),
      reply_to: o.email,
      subject,
      html,
      text,
    }),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`)
}
