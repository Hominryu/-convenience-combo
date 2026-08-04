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
    const promotionMap: Record<string, string> = { '1+1': 'ONE_PLUS_ONE', '2+1': 'TWO_PLUS_ONE', '3+1': 'THREE_PLUS_ONE', sale: 'SALE', gift: 'GIFT', new: 'NEW', none: 'NONE' }
    const dbPromotionType = promotionMap[promotionType] ?? promotionType
    const query = String(request.query.query ?? '').trim()
    const limit = Math.min(Number(request.query.limit ?? 120), 300)
    const filters = [
      'select=id,store_code,original_name,normalized_name,brand_name,price,category,image_url,is_active,last_seen_at,promotions(promotion_type,promotion_price,is_active,start_date,end_date,last_seen_at)',
      'is_active=eq.true',
      `limit=${limit}`,
      'order=original_name.asc',
    ]
    if (retailer) filters.push(`store_code=eq.${encodeURIComponent(retailer.toUpperCase())}`)
    if (query) filters.push(`original_name=ilike.*${encodeURIComponent(query)}*`)
    const rows = await supabaseFetch(`products?${filters.join('&')}`) as Array<Record<string, unknown>>
    const products = rows
      .map((row) => {
        const promotions = (Array.isArray(row.promotions) ? row.promotions as Array<Record<string, unknown>> : []).filter((item) => item.is_active !== false)
        const promo = promotions.sort((a, b) => String(b.last_seen_at ?? '').localeCompare(String(a.last_seen_at ?? '')))[0]
        if (promotionType && dbPromotionType !== 'NONE' && promo?.promotion_type !== dbPromotionType) return null
        if (promotionType === 'none' && promo) return null
        const code = String(row.store_code ?? '').toLowerCase()
        const categoryMap: Record<string, string> = { MAIN_MEAL:'meal', RAMEN:'meal', RICE:'meal', SANDWICH:'meal', SIDE:'protein', SNACK:'snack', DRINK:'drink', COFFEE:'drink', DESSERT:'dessert', ALCOHOL_SIDE:'snack', ETC:'snack' }
        return {
          id: row.id,
          retailer: code,
          retailerName: row.store_code,
          name: row.original_name,
          normalizedName: row.normalized_name,
          price: row.price,
          category: categoryMap[String(row.category)] ?? 'snack',
          tags: [],
          imageUrl: row.image_url,
          promotionType: promo?.promotion_type === 'ONE_PLUS_ONE' ? '1+1' : promo?.promotion_type === 'TWO_PLUS_ONE' ? '2+1' : promo?.promotion_type === 'THREE_PLUS_ONE' ? '3+1' : promo?.promotion_type === 'SALE' ? 'sale' : promo?.promotion_type === 'NEW' ? 'new' : 'none',
          purchaseQuantity: promo?.promotion_type === 'TWO_PLUS_ONE' ? 2 : promo?.promotion_type === 'THREE_PLUS_ONE' ? 3 : 1,
          rewardQuantity: promo?.promotion_type === 'ONE_PLUS_ONE' ? 2 : promo?.promotion_type === 'TWO_PLUS_ONE' ? 3 : promo?.promotion_type === 'THREE_PLUS_ONE' ? 4 : 1,
          discountPrice: promo?.promotion_price,
          startDate: promo?.start_date,
          endDate: promo?.end_date,
          collectedAt: promo?.last_seen_at ?? row.last_seen_at,
        }
      })
      .filter(Boolean)

    response.status(200).json({ ok: true, products })
  } catch (error) {
    response.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' })
  }
}
