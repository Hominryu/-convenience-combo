import type { NormalizedProduct } from '../_lib/types.js'
import { absoluteUrl, hashKey, inferCategoryAndTags, inferPromotion, monthRange, normalizeName, parsePrice, stripTags } from '../_lib/utils.js'

const PAGE_URL = 'https://cu.bgfretail.com/event/plus.do?category=event&depth2=1&sf=N'
const AJAX_URL = 'https://cu.bgfretail.com/event/plusAjax.do'

function parseCards(html: string, promoCode: string): NormalizedProduct[] {
  const blocks = html.match(/<li[\s\S]*?<\/li>/g) ?? html.match(/<div[^>]+prod[^>]*>[\s\S]*?<\/div>\s*<\/div>/g) ?? []
  const range = monthRange()
  const collectedAt = new Date().toISOString()

  return blocks
    .map((block): NormalizedProduct | null => {
      const text = stripTags(block)
      const price = parsePrice(text.match(/([0-9,]+)\s*원/)?.[1] ?? '')
      const imageUrl = absoluteUrl(PAGE_URL, block.match(/<img[^>]+src=["']([^"']+)["']/)?.[1])
      let name = stripTags(block.match(/<p[^>]*class=["'][^"']*prodName[^"']*["'][^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '')
      if (!name) name = text.replace(/[0-9,]+\s*원/g, '').replace(/1\+1|2\+1|3\+1|NEW|행사|신상품/g, '').trim()
      if (!name || !price) return null
      const promo = promoCode === '23' ? { promotionType: '1+1' as const, purchaseQuantity: 1, rewardQuantity: 2 } : promoCode === '24' ? { promotionType: '2+1' as const, purchaseQuantity: 2, rewardQuantity: 3 } : inferPromotion(text)
      const inferred = inferCategoryAndTags(name, promo.promotionType)
      return {
        retailerCode: 'cu',
        externalKey: hashKey('cu', promo.promotionType, name, String(price)),
        brand: 'CU',
        name,
        normalizedName: normalizeName(name),
        price,
        category: inferred.category,
        tags: inferred.tags,
        imageUrl,
        ...promo,
        ...range,
        collectedAt,
        isNew: /NEW|신상품/.test(text),
      }
    })
    .filter(Boolean) as NormalizedProduct[]
}

export async function fetchCuProducts(): Promise<NormalizedProduct[]> {
  const session = await fetch(PAGE_URL, { headers: { 'User-Agent': 'Mozilla/5.0 convenience-combo-bot/1.0' } })
  const cookie = session.headers.get('set-cookie') ?? ''
  const all: NormalizedProduct[] = []

  for (const promoCode of ['23', '24', '']) {
    for (let pageIndex = 1; pageIndex <= 10; pageIndex += 1) {
      const form = new URLSearchParams({ pageIndex: String(pageIndex), listType: '0', searchCondition: promoCode })
      const response = await fetch(AJAX_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Referer: PAGE_URL,
          'User-Agent': 'Mozilla/5.0 convenience-combo-bot/1.0',
          'X-Requested-With': 'XMLHttpRequest',
          Cookie: cookie,
        },
        body: form,
      })
      if (!response.ok) break
      const html = await response.text()
      const pageItems = parseCards(html, promoCode)
      if (pageItems.length === 0) break
      all.push(...pageItems)
    }
  }

  return [...new Map(all.map((item) => [item.externalKey, item])).values()]
}
