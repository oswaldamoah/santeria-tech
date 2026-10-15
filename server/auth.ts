/**
 * Dashboard sign-in. Logins live in your Neon database (admin_users, created with the SQL in
 * database/schema.sql). Signing in creates a random session token; only its SHA-256 hash is stored.
 */
import { createSession, endSession, sessionUser, verifyLogin, type AdminUser, type Db } from './db'

export const SESSION_HOURS = 12

const enc = new TextEncoder()

async function sha256(text: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const bearer = (header: string | null) => header?.replace(/^Bearer\s+/i, '').trim() ?? ''

export async function signIn(db: Db, email: string, password: string) {
  const user = await verifyLogin(db, email, password)
  if (!user) return null
  const token = randomToken()
  await createSession(db, user.id, await sha256(token), SESSION_HOURS)
  return { token, expires: Date.now() + SESSION_HOURS * 3600 * 1000, user }
}

export async function currentUser(db: Db, header: string | null): Promise<AdminUser | null> {
  const token = bearer(header)
  if (token.length < 20) return null
  return sessionUser(db, await sha256(token))
}

export async function signOut(db: Db, header: string | null) {
  const token = bearer(header)
  if (token) await endSession(db, await sha256(token))
}

/** Slows down password guessing: 8 wrong tries per address per 15 minutes. */
const attempts = new Map<string, { count: number; until: number }>()
export function tooManyAttempts(key: string) {
  const a = attempts.get(key)
  return !!a && a.until > Date.now() && a.count >= 8
}
export function recordFailure(key: string) {
  const a = attempts.get(key)
  if (!a || a.until < Date.now()) attempts.set(key, { count: 1, until: Date.now() + 15 * 60 * 1000 })
  else a.count++
}
