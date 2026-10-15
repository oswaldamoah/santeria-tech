/** Dashboard sign-in: one password, then a signed token that lasts 12 hours. */

const enc = new TextEncoder()
const SESSION_HOURS = 12

const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(data)))
}

/** Compares two strings without leaking where they differ. */
async function same(a: string, b: string) {
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))])
  const ax = new Uint8Array(x)
  const by = new Uint8Array(y)
  let diff = 0
  for (let i = 0; i < ax.length; i++) diff |= ax[i] ^ by[i]
  return diff === 0
}

function signingKey(env: { ADMIN_PASSWORD?: string; SESSION_SECRET?: string }) {
  return `${env.SESSION_SECRET ?? ''}:${env.ADMIN_PASSWORD ?? ''}`
}

export async function issueToken(env: { ADMIN_PASSWORD?: string; SESSION_SECRET?: string }) {
  const exp = Date.now() + SESSION_HOURS * 3600 * 1000
  return { token: `${exp}.${await hmac(signingKey(env), String(exp))}`, expires: exp }
}

export async function checkToken(env: { ADMIN_PASSWORD?: string; SESSION_SECRET?: string }, header: string | null) {
  if (!env.ADMIN_PASSWORD) return false
  const token = header?.replace(/^Bearer\s+/i, '') ?? ''
  const [exp, sig] = token.split('.')
  if (!exp || !sig || Number(exp) < Date.now()) return false
  return same(sig, await hmac(signingKey(env), exp))
}

export async function checkPassword(env: { ADMIN_PASSWORD?: string }, attempt: unknown) {
  if (!env.ADMIN_PASSWORD || typeof attempt !== 'string') return false
  return same(attempt, env.ADMIN_PASSWORD)
}

/** Slows down password guessing: 8 wrong tries per address per 15 minutes. */
const attempts = new Map<string, { count: number; until: number }>()
export function tooManyAttempts(ip: string) {
  const a = attempts.get(ip)
  return !!a && a.until > Date.now() && a.count >= 8
}
export function recordFailure(ip: string) {
  const a = attempts.get(ip)
  if (!a || a.until < Date.now()) attempts.set(ip, { count: 1, until: Date.now() + 15 * 60 * 1000 })
  else a.count++
}
