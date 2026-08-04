import type { NormalizedProduct, PromotionType } from './types.js'

export function stripTags(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

export function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

export function parsePrice(value: string) {
  return Number(value.replace(/[^0-9]/g, '')) || 0
}

export function hashKey(...parts: string[]) {
  const input = parts.join('|')
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash >>> 0).toString(36)
}

export function normalizeName(value: string) {
  return value
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\d+(\.\d+)?\s?(g|ml|l|kg|개입|입)/gi, ' ')
    .replace(/[^가-힣a-zA-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function inferPromotion(raw: string): Pick<NormalizedProduct, 'promotionType' | 'purchaseQuantity' | 'rewardQuantity'> {
  const text = raw.replace(/\s+/g, '')
  if (/1\+1|원플러스원|one\+one/i.test(text)) {
    return { promotionType: '1+1', purchaseQuantity: 1, rewardQuantity: 2 }
  }
  if (/2\+1|투플러스원/i.test(text)) {
    return { promotionType: '2+1', purchaseQuantity: 2, rewardQuantity: 3 }
  }
  if (/3\+1|쓰리플러스원/i.test(text)) {
    return { promotionType: '3+1', purchaseQuantity: 3, rewardQuantity: 4 }
  }
  if (/할인|SALE|세일/i.test(raw)) {
    return { promotionType: 'sale', purchaseQuantity: 1, rewardQuantity: 1 }
  }
  if (/NEW|신상품/i.test(raw)) {
    return { promotionType: 'new', purchaseQuantity: 1, rewardQuantity: 1 }
  }
  return { promotionType: 'none', purchaseQuantity: 1, rewardQuantity: 1 }
}

export function inferCategoryAndTags(name: string, promotionType: PromotionType) {
  const lower = name.toLowerCase()
  const tags = new Set<string>(['value'])
  let category = 'snack'

  if (/김밥|삼각|도시락|샌드|버거|라면|컵|우동|국수|비빔|밥/.test(name)) {
    category = 'meal'
    tags.add('meal')
    tags.add('night')
  }
  if (/닭가슴|프로틴|단백|계란|란|두부|그릭|요거트/i.test(name)) {
    category = 'protein'
    tags.add('protein')
    tags.add('diet')
  }
  if (/제로|라이트|샐러드|바나나|플레인|저당/i.test(name)) {
    tags.add('diet')
  }
  if (/콜라|사이다|생수|우유|커피|음료|주스|물|차|tea|캔/i.test(lower)) {
    category = category === 'protein' ? category : 'drink'
    tags.add('snack')
  }
  if (/초콜릿|쿠키|젤리|멘토스|캔디|아이스|크림|케이크|빵/i.test(name)) {
    category = 'dessert'
    tags.add('snack')
  }
  if (/오징어|육포|먹태|칩|과자|닭강정|떡볶이|만두/i.test(name)) {
    category = 'snack'
    tags.add('night')
    tags.add('snack')
  }
  if (promotionType !== 'none') tags.add('value')

  return { category, tags: [...tags] }
}

export function monthRange(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  }
}

export function absoluteUrl(base: string, path?: string) {
  if (!path) return undefined
  try {
    return new URL(path, base).toString()
  } catch {
    return undefined
  }
}
