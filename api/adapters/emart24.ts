import type { NormalizedProduct } from '../_lib/types.js'
import { absoluteUrl, hashKey, inferCategoryAndTags, inferPromotion, monthRange, normalizeName, parsePrice, stripTags } from '../_lib/utils.js'

const PAGE_URL = 'https://emart24.co.kr/goods/event?align=PRICE_DESC&base_category_seq=2&category_seq=1&search='

function parseEmart(html: string): NormalizedProduct[] {
  const blocks = html.match(/<div class="itemWrap">[\s\S]*?<\/div>\s*<\/div>/g) ?? []
  const range = monthRange()
  const collectedAt = new Date().toISOString()

  return blocks
    .map((block): NormalizedProduct | null => {
      const text = stripTags(block)
      const price = parsePrice(text.match(/([0-9,]+)\s*원/)?.[1] ?? '')
      const promo = inferPromotion(text)
      const name = text.replace(/NEW|신상품|1\s*\+\s*1|2\s*\+\s*1|3\s*\+\s*1|[0-9,]+\s*원/g, '').trim()
      if (!name || !price) return null
      const inferred = inferCategoryAndTags(name, promo.promotionType)
      return {
        retailerCode: 'emart24',
        externalKey: hashKey('emart24', promo.promotionType, name, String(price)),
        brand: '이마트24',
        name,
        normalizedName: normalizeName(name),
        price,
        category: inferred.category,
        tags: inferred.tags,
        imageUrl: absoluteUrl(PAGE_URL, block.match(/<img[^>]+src=["']([^"']+)["']/)?.[1]),
        ...promo,
        ...range,
        collectedAt,
        isNew: /NEW|신상품/.test(text),
      }
    })
    .filter(Boolean) as NormalizedProduct[]
}

export async function fetchEmart24Products(): Promise<NormalizedProduct[]> {
  const pages: string[] = []
  for (let page = 1; page <= 20; page += 1) {
    const url = `${PAGE_URL}&page=${page}`
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 convenience-combo-bot/1.0' } })
    if (!response.ok) break
    const html = await response.text()
    const parsed = parseEmart(html)
    if (parsed.length === 0 && page > 1) break
    pages.push(html)
  }
  return [...new Map(pages.flatMap(parseEmart).map((item) => [item.externalKey, item])).values()]
}
