import type { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(request: VercelRequest, response: VercelResponse) {
  const corsOrigin = process.env.CORS_ALLOW_ORIGIN ?? '*'
  response.setHeader('Access-Control-Allow-Origin', corsOrigin)
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (request.method === 'OPTIONS') {
    response.status(204).end()
    return
  }

  response.status(200).json({
    ok: true,
    message: 'Replace this endpoint with normalized promotion products from Supabase.',
  })
}
