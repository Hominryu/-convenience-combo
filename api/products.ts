import type { ApiRequest, ApiResponse } from './_lib/http.js'
import { supabaseFetch } from './_lib/supabase.js'
import { readEnv } from './_lib/env.js'

export default async function handler(request: ApiRequest, response: ApiResponse) {
  const corsOrigin = readEnv('CORS_ALLOW_ORIGIN') ?? '*'
  response.setHeader('Access-Control-Allow-Origin', corsOrigin)
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (request.method === 'OPTIONS') {
    response.status(204).end()
    return
  }

  try {
    const retailer = String(request.query.retailer ?? '')
    const promotionType = String(request.query.promotionType ?? '')
    const query = String(request.query.query ?? '').trim()
    const limit = Math.min(Number(request.query.limit ?? 120), 300)
    const filters = [
      'select=id,name,normalized_name,price,category,tags,image_url,active,retailers!inner(code,name),promotions(promotion_type,purchase_quantity,reward_quantity,discount_price,start_date,end_date,collected_at)',
      'active=eq.true',
      `limit=${limit}`,
      'order=name.asc',
    ]
    if (retailer) filters.push(`retailers.code=eq.${encodeURIComponent(retailer)}`)
    if (query) filters.push(`name=ilike.*${encodeURIComponent(query)}*`)
    const rows = await supabaseFetch(`products?${filters.join('&')}`) as Array<Record<string, unknown>>
    const products = rows
      .map((row) => {
        const promotions = Array.isArray(row.promotions) ? row.promotions as Array<Record<string, unknown>> : []
        const promo = promotions.sort((a, b) => String(b.collected_at ?? '').localeCompare(String(a.collected_at ?? '')))[0]
        if (!promo) return null
        if (promotionType && promo.promotion_type !== promotionType) return null
        const retailerInfo = row.retailers as Record<string, unknown> | undefined
        return {
          id: row.id,
          retailer: retailerInfo?.code,
          retailerName: retailerInfo?.name,
          name: row.name,
          normalizedName: row.normalized_name,
          price: row.price,
          category: row.category,
          tags: row.tags,
          imageUrl: row.image_url,
          promotionType: promo.promotion_type,
          purchaseQuantity: promo.purchase_quantity,
          rewardQuantity: promo.reward_quantity,
          discountPrice: promo.discount_price,
          startDate: promo.start_date,
          endDate: promo.end_date,
          collectedAt: promo.collected_at,
        }
      })
      .filter(Boolean)

    response.status(200).json({ ok: true, products })
  } catch (error) {
    response.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' })
  }
}
