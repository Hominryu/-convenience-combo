import type { ApiRequest, ApiResponse } from './_lib/http.js'
import { fetchCuProducts } from './adapters/cu.js'
import { fetchEmart24Products } from './adapters/emart24.js'
import { fetchGs25Products } from './adapters/gs25.js'
import { fetchSevenProducts } from './adapters/seven.js'
import { upsertProducts } from './_lib/supabase.js'
import type { NormalizedProduct, RetailerCode } from './_lib/types.js'
import { readEnv } from './_lib/env.js'

const adapters: Record<RetailerCode, () => Promise<NormalizedProduct[]>> = {
  cu: fetchCuProducts,
  gs25: fetchGs25Products,
  seven: fetchSevenProducts,
  emart24: fetchEmart24Products,
}

function setCors(response: ApiResponse) {
  response.setHeader('Access-Control-Allow-Origin', readEnv('CORS_ALLOW_ORIGIN') ?? '*')
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
}

function isAuthorized(request: ApiRequest) {
  const secret = readEnv('SYNC_SECRET')
  if (!secret) return true
  return request.query.secret === secret || request.headers.authorization === `Bearer ${secret}`
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  setCors(response)

  try {
    if (request.method === 'OPTIONS') {
      response.status(204).end()
      return
    }

    if (request.method !== 'GET' && request.method !== 'POST') {
      response.status(405).json({ ok: false, error: 'Method not allowed' })
      return
    }

    if (!isAuthorized(request)) {
      response.status(401).json({ ok: false, error: 'Unauthorized' })
      return
    }

    const requested = String(request.query.retailer ?? 'all')
    const targets = requested === 'all' ? Object.keys(adapters) as RetailerCode[] : [requested as RetailerCode]
    const results: Array<{ retailer: RetailerCode; fetched: number; saved?: number; error?: string }> = []
    const allItems: NormalizedProduct[] = []

    for (const retailer of targets) {
      const adapter = adapters[retailer]
      if (!adapter) {
        results.push({ retailer, fetched: 0, error: 'Unknown retailer' })
        continue
      }

      try {
        const items = await adapter()
        allItems.push(...items)
        results.push({ retailer, fetched: items.length })
      } catch (error) {
        results.push({ retailer, fetched: 0, error: error instanceof Error ? error.message : 'Unknown error' })
      }
    }

    let saved = { products: 0, promotions: 0 }
    if (allItems.length > 0) {
      saved = await upsertProducts(allItems)
    }

    response.status(200).json({
      ok: true,
      collectedAt: new Date().toISOString(),
      totalFetched: allItems.length,
      saved,
      results,
    })
  } catch (error) {
    response.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
