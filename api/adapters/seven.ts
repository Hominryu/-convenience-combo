import type { NormalizedProduct } from '../_lib/types.js'
import { absoluteUrl, hashKey, inferCategoryAndTags, inferPromotion, monthRange, normalizeName, parsePrice, stripTags } from '../_lib/utils.js'

const PAGE_URL = 'https://www.7-eleven.co.kr/product/presentList.asp'

function parseSeven(html: string): NormalizedProduct[] {
  const blocks = html.match(/<li[\s\S]*?<\/li>/g) ?? []
  const range = monthRange()
  const collectedAt = new Date().toISOString()

  return blocks
    .map((block): NormalizedProduct | null => {
      const text = stripTags(block)
      const price = parsePrice(text.match(/([0-9,]+)\s*원/)?.[1] ?? '')
      const promo = inferPromotion(text)
      let name = stripTags(block.match(/<div[^>]*class=["'][^"']*name[^"']*["'][^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '')
      if (!name) name = text.replace(/1\+1|2\+1|3\+1|NEW|신상품|[0-9,]+\s*원/g, '').trim()
      if (!name || !price || promo.promotionType === 'none') return null
      const inferred = inferCategoryAndTags(name, promo.promotionType)
      return {
        retailerCode: 'seven',
        externalKey: hashKey('seven', promo.promotionType, name, String(price)),
        brand: '세븐일레븐',
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

export async function fetchSevenProducts(): Promise<NormalizedProduct[]> {
  const pages: string[] = []
  for (let page = 1; page <= 20; page += 1) {
    const url = page === 1 ? PAGE_URL : `${PAGE_URL}?intPageSize=20&intCurrPage=${page}`
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 convenience-combo-bot/1.0' } })
    if (!response.ok) break
    const html = await response.text()
    if (!html.includes('원') && page > 1) break
    pages.push(html)
  }
  return [...new Map(pages.flatMap(parseSeven).map((item) => [item.externalKey, item])).values()]
}
