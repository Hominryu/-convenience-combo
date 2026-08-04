import { requireEnv } from './env.js'

function env(name: string) {
  return requireEnv(name)
}

export async function supabaseFetch(path: string, init: RequestInit = {}) {
  const baseUrl = env('SUPABASE_URL').replace(/\/$/, '')
  const key = env('SUPABASE_SERVICE_ROLE_KEY')
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Supabase ${response.status}: ${body}`)
  }

  if (response.status === 204 || !response.body) return null
  return response.json()
}
