import type { ApiRequest, ApiResponse } from './_lib/http.js'
import { fetchCuProducts } from './adapters/cu.js'
import { fetchEmart24Products } from './adapters/emart24.js'
import { fetchGs25Products } from './adapters/gs25.js'
import { fetchSevenProducts } from './adapters/seven.js'
import { readEnv } from './_lib/env.js'
import type { RetailerCode } from './_lib/types.js'

const adapters: Record<RetailerCode, () => Promise<unknown[]>> = {
  cu: fetchCuProducts,
  gs25: fetchGs25Products,
  seven: fetchSevenProducts,
  emart24: fetchEmart24Products,
}

const sourceUrls: Record<RetailerCode, string> = {
  cu: 'https://cu.bgfretail.com/event/plus.do?category=event&depth2=1&sf=N',
  gs25: 'https://gs25.gsretail.com/gscvs/ko/products/event-goods',
  seven: 'https://www.7-eleven.co.kr/product/presentList.asp',
  emart24: 'https://emart24.co.kr/goods/event?align=PRICE_DESC&base_category_seq=2&category_seq=1&search=',
}

function setCors(response: ApiResponse) {
  response.setHeader('Access-Control-Allow-Origin', readEnv('CORS_ALLOW_ORIGIN') ?? '*')
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function isAuthorized(request: ApiRequest) {
  const secret = readEnv('SYNC_SECRET')
  if (!secret) return true
  return request.query.secret === secret || request.headers.authorization === `Bearer ${secret}`
}

async function checkRetailer(retailer: RetailerCode) {
  const startedAt = Date.now()
  const sourceUrl = sourceUrls[retailer]
  const source: Record<string, unknown> = { url: sourceUrl }

  try {
    const response = await fetch(sourceUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.7,en;q=0.6',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 convenience-combo/1.0',
      },
    })
    const text = await response.text()
    source.status = response.status
    source.ok = response.ok
    source.contentType = response.headers.get('content-type')
    source.length = text.length
    source.hasWon = text.includes('원')
    source.hasOnePlusOne = /1\s*\+\s*1/.test(text)
    source.hasTwoPlusOne = /2\s*\+\s*1/.test(text)
    source.sample = text.replace(/\s+/g, ' ').slice(0, 240)
  } catch (error) {
    source.error = error instanceof Error ? error.message : 'Unknown fetch error'
  }

  try {
    const items = await adapters[retailer]()
    return {
      retailer,
      source,
      parsed: items.length,
      examples: items.slice(0, 3),
      elapsedMs: Date.now() - startedAt,
    }
  } catch (error) {
    return {
      retailer,
      source,
      parsed: 0,
      error: error instanceof Error ? error.message : 'Unknown adapter error',
      elapsedMs: Date.now() - startedAt,
    }
  }
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  setCors(response)

  if (request.method === 'OPTIONS') {
    response.status(204).end()
    return
  }

  if (!isAuthorized(request)) {
    response.status(401).json({ ok: false, error: 'Unauthorized' })
    return
  }

  const requested = String(request.query.retailer ?? 'all')
  const targets = requested === 'all' ? Object.keys(adapters) as RetailerCode[] : [requested as RetailerCode]
  const results = await Promise.all(targets.map(checkRetailer))
  response.status(200).json({ ok: true, checkedAt: new Date().toISOString(), results })
}
