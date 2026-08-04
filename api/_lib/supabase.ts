import type { NormalizedProduct } from './types.js'
import { requireEnv } from './env.js'

const retailerCodes = ['cu', 'gs25', 'seven', 'emart24'] as const

type SupabaseRow = Record<string, unknown>

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

  if (response.status === 204) return null
  return response.json()
}

export async function getRetailerMap() {
  await supabaseFetch('retailers?on_conflict=code', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify([
      { code: 'cu', name: 'CU' },
      { code: 'gs25', name: 'GS25' },
      { code: 'seven', name: '세븐일레븐' },
      { code: 'emart24', name: '이마트24' },
    ]),
  })

  const rows = (await supabaseFetch('retailers?select=id,code')) as Array<{ id: string; code: string }>
  return new Map(rows.filter((row) => retailerCodes.includes(row.code as never)).map((row) => [row.code, row.id]))
}

export async function upsertProducts(items: NormalizedProduct[]) {
  if (items.length === 0) return { products: 0, promotions: 0 }

  const retailerMap = await getRetailerMap()
  const productRows = items
    .map((item) => {
      const retailerId = retailerMap.get(item.retailerCode)
      if (!retailerId) return null
      return {
        retailer_id: retailerId,
        external_key: item.externalKey,
        name: item.name,
        normalized_name: item.normalizedName,
        price: item.price,
        category: item.category,
        tags: item.tags,
        image_url: item.imageUrl ?? null,
        active: true,
      }
    })
    .filter(Boolean) as SupabaseRow[]

  const savedProducts = (await supabaseFetch('products?on_conflict=retailer_id,external_key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(productRows),
  })) as Array<{ id: string; retailer_id: string; external_key: string }>

  const productIdByKey = new Map(savedProducts.map((row) => [`${row.retailer_id}:${row.external_key}`, row.id]))
  const promotionRows = items
    .map((item) => {
      const retailerId = retailerMap.get(item.retailerCode)
      const productId = retailerId ? productIdByKey.get(`${retailerId}:${item.externalKey}`) : undefined
      if (!productId) return null
      return {
        product_id: productId,
        promotion_type: item.promotionType,
        purchase_quantity: item.purchaseQuantity,
        reward_quantity: item.rewardQuantity,
        discount_price: item.discountPrice ?? null,
        start_date: item.startDate ?? null,
        end_date: item.endDate ?? null,
        collected_at: item.collectedAt,
      }
    })
    .filter(Boolean) as SupabaseRow[]

  await supabaseFetch('promotions', {
    method: 'POST',
    body: JSON.stringify(promotionRows),
  })

  return { products: productRows.length, promotions: promotionRows.length }
}
