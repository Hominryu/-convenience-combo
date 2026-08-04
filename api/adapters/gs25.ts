import type { NormalizedProduct } from '../_lib/types.js'
import { absoluteUrl, hashKey, inferCategoryAndTags, inferPromotion, monthRange, normalizeName, parsePrice } from '../_lib/utils.js'

const PAGE_URL = 'https://gs25.gsretail.com/gscvs/ko/products/event-goods'
const SEARCH_URL = 'https://gs25.gsretail.com/gscvs/ko/products/event-goods-search'

export async function fetchGs25Products(): Promise<NormalizedProduct[]> {
  const page = await fetch(PAGE_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 convenience-combo-bot/1.0' },
  })
  const html = await page.text()
  const csrfToken = html.match(/name="CSRFToken"\s+value="([^"]+)"/)?.[1] ?? html.match(/CSRFToken\s*[:=]\s*['"]([^'"]+)/)?.[1]
  const form = new URLSearchParams({
    pageNum: '1',
    pageSize: '2000',
    searchType: '',
    searchWord: '',
  })
  if (csrfToken) form.set('CSRFToken', csrfToken)

  const response = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Referer: PAGE_URL,
      'User-Agent': 'Mozilla/5.0 convenience-combo-bot/1.0',
      'X-Requested-With': 'XMLHttpRequest',
      Cookie: page.headers.get('set-cookie') ?? '',
    },
    body: form,
  })
  const text = await response.text()
  const json = JSON.parse(text)
  const rows = Array.isArray(json.results) ? json.results : []
  const range = monthRange()
  const collectedAt = new Date().toISOString()

  return rows
    .map((row: Record<string, unknown>): NormalizedProduct | null => {
      const name = String(row.goodsNm ?? '').trim()
      const price = typeof row.price === 'number' ? row.price : parsePrice(String(row.price ?? ''))
      if (!name || !price) return null
      const eventTypeSp = typeof row.eventTypeSp === 'object' && row.eventTypeSp !== null ? row.eventTypeSp as Record<string, unknown> : {}
      const rawPromo = String(row.eventTypeNm ?? row.eventTypeSpNm ?? eventTypeSp.code ?? '')
      const promo = inferPromotion(rawPromo)
      const inferred = inferCategoryAndTags(name, promo.promotionType)
      return {
        retailerCode: 'gs25',
        externalKey: String(row.goodsCode ?? row.goodsCd ?? hashKey('gs25', name, String(price))),
        brand: String(row.makerNm ?? 'GS25'),
        name,
        normalizedName: normalizeName(name),
        price,
        category: inferred.category,
        tags: inferred.tags,
        imageUrl: absoluteUrl(PAGE_URL, String(row.attFileNm ?? row.imgUrl ?? '')),
        ...promo,
        ...range,
        collectedAt,
      }
    })
    .filter(Boolean) as NormalizedProduct[]
}
