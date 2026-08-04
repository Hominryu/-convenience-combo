import type { ApiRequest, ApiResponse } from './_lib/http.js'
import { readEnv } from './_lib/env.js'

export default function handler(_request: ApiRequest, response: ApiResponse) {
  response.setHeader('Access-Control-Allow-Origin', readEnv('CORS_ALLOW_ORIGIN') ?? '*')
  response.status(200).json({
    ok: true,
    env: {
      hasSupabaseUrl: Boolean(readEnv('SUPABASE_URL')),
      hasSupabaseServiceRoleKey: Boolean(readEnv('SUPABASE_SERVICE_ROLE_KEY')),
      hasGeminiKey: Boolean(readEnv('GEMINI_API_KEY')),
      hasSyncSecret: Boolean(readEnv('SYNC_SECRET')),
    },
    now: new Date().toISOString(),
  })
}
