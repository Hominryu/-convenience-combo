import type { ApiRequest, ApiResponse } from './_lib/http.js'
import { readEnv } from './_lib/env.js'
import { supabaseFetch } from './_lib/supabase.js'

type RequestWithBody = ApiRequest & { body?: unknown }
type Purpose = 'value' | 'meal' | 'diet' | 'protein' | 'night' | 'snack'
type Role = 'MAIN' | 'SIDE' | 'PROTEIN' | 'DRINK' | 'SNACK' | 'LIGHT' | 'DESSERT'
type PromotionKind = 'ONE_PLUS_ONE' | 'TWO_PLUS_ONE' | 'THREE_PLUS_ONE' | 'SALE' | 'NONE' | 'NEW'

type DbPromotion = {
  promotion_type: string
  promotion_price: number | null
  is_active: boolean | null
  start_date: string | null
  end_date: string | null
  last_seen_at: string | null
}

type DbProduct = {
  id: string
  store_code: string
  original_name: string
  price: number
  category: string | null
  image_url: string | null
  last_seen_at: string | null
  last_seen_general_at?: string | null
  last_seen_promotion_at?: string | null
  price_verified_at?: string | null
  promotion_end_at?: string | null
  is_active?: boolean | null
  promotions?: DbPromotion[]
}

type Candidate = {
  id: string
  name: string
  price: number
  category: string
  role: Role
  promotionType: string
  purchaseQuantity: number
  rewardQuantity: number
  paymentAmount: number
  receivedQuantity: number
  benefitAmount: number
  effectiveUnitPrice: number
  lastSeenAt: string | null
}

type VerifiedCombo = {
  title: string
  reason: string
  retailer: string
  budget: number
  purpose: Purpose
  items: Candidate[]
  paymentAmount: number
  receivedQuantity: number
  benefitAmount: number
  leftover: number
  lastSeenAt: string | null
}

type GeminiCombo = { title?: unknown; productIds?: unknown; reason?: unknown }
type GeminiParsed = { combinations?: GeminiCombo[] }
type GeminiResponse = { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
type GeminiResult = { combinations: GeminiCombo[]; status: string }

const purposes = new Set<Purpose>(['value', 'meal', 'diet', 'protein', 'night', 'snack'])
const retailers = new Set(['CU', 'GS25', 'EMART24'])
const dbCategoryMap: Record<string, string> = {
  MAIN_MEAL: 'meal',
  RAMEN: 'meal',
  RICE: 'meal',
  SANDWICH: 'meal',
  SIDE: 'protein',
  SNACK: 'snack',
  DRINK: 'drink',
  COFFEE: 'drink',
  DESSERT: 'dessert',
  ALCOHOL_SIDE: 'snack',
  ETC: 'snack',
}

const allRoles: Role[] = ['MAIN', 'SIDE', 'PROTEIN', 'DRINK', 'SNACK', 'LIGHT', 'DESSERT']

const purposeProfiles: Record<Purpose, { requiredAny: Role[][]; preferred: Role[]; support: Role[]; ideal: Role[]; promotionWeight: number; budgetWeight: number; diversityWeight: number; promotionCap: number; maxPromotionItems?: number; minItems?: number; preferredPromotions?: PromotionKind[] }> = {
  value: { requiredAny: [], preferred: ['MAIN', 'SIDE', 'PROTEIN', 'DRINK', 'SNACK', 'LIGHT', 'DESSERT'], support: ['MAIN', 'DRINK', 'SNACK'], ideal: ['MAIN', 'DRINK', 'SNACK'], promotionWeight: 1.35, budgetWeight: 1.1, diversityWeight: 0.7, promotionCap: 14, preferredPromotions: ['ONE_PLUS_ONE', 'TWO_PLUS_ONE', 'THREE_PLUS_ONE', 'SALE'] },
  meal: { requiredAny: [['MAIN']], preferred: ['MAIN', 'SIDE', 'PROTEIN'], support: ['DRINK', 'LIGHT'], ideal: ['MAIN', 'SIDE', 'DRINK'], promotionWeight: 0.72, budgetWeight: 1, diversityWeight: 1.35, promotionCap: 10, maxPromotionItems: 3, minItems: 2 },
  diet: { requiredAny: [['LIGHT', 'MAIN']], preferred: ['LIGHT', 'PROTEIN'], support: ['DRINK', 'MAIN'], ideal: ['LIGHT', 'PROTEIN', 'DRINK'], promotionWeight: 0.58, budgetWeight: 0.82, diversityWeight: 1.15, promotionCap: 8, maxPromotionItems: 2, minItems: 2 },
  protein: { requiredAny: [['PROTEIN']], preferred: ['PROTEIN'], support: ['MAIN', 'DRINK', 'LIGHT'], ideal: ['PROTEIN', 'DRINK', 'MAIN'], promotionWeight: 0.75, budgetWeight: 0.9, diversityWeight: 1.05, promotionCap: 8, maxPromotionItems: 3, minItems: 2 },
  night: { requiredAny: [['MAIN', 'SNACK']], preferred: ['MAIN', 'SNACK', 'SIDE'], support: ['DRINK', 'DESSERT'], ideal: ['MAIN', 'SIDE', 'DRINK'], promotionWeight: 0.92, budgetWeight: 0.95, diversityWeight: 1.1, promotionCap: 9, maxPromotionItems: 3, minItems: 2 },
  snack: { requiredAny: [['SNACK', 'DESSERT']], preferred: ['SNACK', 'DESSERT'], support: ['DRINK', 'LIGHT'], ideal: ['SNACK', 'DRINK', 'DESSERT'], promotionWeight: 0.95, budgetWeight: 0.86, diversityWeight: 1.05, promotionCap: 8, maxPromotionItems: 3, minItems: 2 },
}

const nonFoodPattern = /담배|궐련|전자담배|라이터|치약|칫솔|가글|샴푸|린스|바디워시|비누|세제|화장지|물티슈|생리대|면도|건전지|충전기|케이블|이어폰|우산|마스크|밴드|파스(?!타)|상비약|의약품|상품권|기프트카드|교통카드|유심|택배|봉투|종량제|복권|사료|펫|애견|반려|고양이|강아지|뉴트리플랜|방향제|살충제/i
const mainPattern = /도시락|김밥|삼각|주먹밥|쌈밥|유부초밥|샌드|버거|라면|누들|우동|국수|파스타|스파게티|정식|정찬|덮밥|비빔밥|볶음밥|브리또|한상|혜자/i
const sidePattern = /핫바|소시지|소세지|어묵|계란|달걀|반숙|구운란|만두|치킨|닭강정|떡갈비|닭갈비|감자|두부/i
const proteinPattern = /닭가슴살|프로틴|단백질|계란|달걀|반숙|구운란|훈제란|두부/i
const lightPattern = /샐러드|과일|요거트|요구르트|그릭|바나나|토마토|고구마|저당/i
const drinkPattern = /생수|삼다수|백산수|아이시스|탄산|콜라|사이다|제로(?:콜라|사이다|음료)?|음료|주스|쥬스|우유|두유|커피|라떼|에이드|아메리카노|카페|녹차|홍차|보리차|옥수수수염차|아이스티|tea/i
const dessertPattern = /빵|케이크|케익|카스테라|푸딩|마카롱|도넛|쿠키|초코|초콜릿|아이스크림|아이스|디저트|크림/i

function parseBody(request: RequestWithBody) {
  if (typeof request.body === 'string') return JSON.parse(request.body) as Record<string, unknown>
  if (request.body && typeof request.body === 'object') return request.body as Record<string, unknown>
  return {}
}

function toNumber(value: unknown, fallback = 0) {
  const next = Number(value)
  return Number.isFinite(next) ? next : fallback
}

function latestPromotion(row: DbProduct) {
  return (Array.isArray(row.promotions) ? row.promotions : [])
    .filter((item) => item.is_active !== false && isPromotionCurrentlyValid(item))
    .sort((a, b) => String(b.last_seen_at ?? '').localeCompare(String(a.last_seen_at ?? '')))[0]
}

function todayDateKey() {
  return new Date().toISOString().slice(0, 10)
}

function isPromotionCurrentlyValid(item: DbPromotion) {
  if (item.end_date && item.end_date < todayDateKey()) return false
  return true
}

function isProductRecentlyVerified(row: DbProduct, promo: DbPromotion | undefined) {
  if (promo) return true
  if (!row.last_seen_general_at) return false
  const verifiedAt = Date.parse(row.last_seen_general_at)
  if (!Number.isFinite(verifiedAt)) return false
  const maxAgeMs = 45 * 24 * 60 * 60 * 1000
  return Date.now() - verifiedAt <= maxAgeMs
}

function quantities(type: string | undefined) {
  if (type === 'TWO_PLUS_ONE') return { purchaseQuantity: 2, rewardQuantity: 3 }
  if (type === 'THREE_PLUS_ONE') return { purchaseQuantity: 3, rewardQuantity: 4 }
  if (type === 'ONE_PLUS_ONE') return { purchaseQuantity: 1, rewardQuantity: 2 }
  return { purchaseQuantity: 1, rewardQuantity: 1 }
}

function roleOf(name: string, category: string): Role | null {
  if (nonFoodPattern.test(name)) return null
  if (lightPattern.test(name)) return 'LIGHT'
  if (proteinPattern.test(name)) return 'PROTEIN'
  if (mainPattern.test(name)) return 'MAIN'
  if (sidePattern.test(name)) return 'SIDE'
  if (drinkPattern.test(name) || category === 'drink') return 'DRINK'
  if (dessertPattern.test(name) || category === 'dessert') return 'DESSERT'
  if (category === 'snack') return 'SNACK'
  if (category === 'protein') return 'PROTEIN'
  if (category === 'meal') return 'MAIN'
  return null
}

function toCandidate(row: DbProduct): Candidate | null {
  if (row.is_active === false || row.price <= 0 || nonFoodPattern.test(row.original_name)) return null
  const category = dbCategoryMap[String(row.category ?? 'ETC')] ?? 'snack'
  const role = roleOf(row.original_name, category)
  if (!role) return null
  const promo = latestPromotion(row)
  if (!isProductRecentlyVerified(row, promo)) return null
  const promotionType = promo?.promotion_type ?? 'NONE'
  const q = quantities(promotionType)
  const paymentUnit = promo?.promotion_price ?? row.price
  const paymentAmount = paymentUnit * q.purchaseQuantity
  const receivedQuantity = q.rewardQuantity
  const originalValue = row.price * receivedQuantity
  return {
    id: row.id,
    name: row.original_name,
    price: row.price,
    category,
    role,
    promotionType,
    purchaseQuantity: q.purchaseQuantity,
    rewardQuantity: q.rewardQuantity,
    paymentAmount,
    receivedQuantity,
    benefitAmount: Math.max(0, originalValue - paymentAmount),
    effectiveUnitPrice: Math.round(paymentAmount / receivedQuantity),
    lastSeenAt: promo?.last_seen_at ?? row.last_seen_at,
  }
}

function isPromotion(item: Candidate) {
  return item.promotionType !== 'NONE' && item.promotionType !== 'NEW'
}

async function loadCandidates(retailer: string, budget: number, excludeProductIds: string[]) {
  const rows = await supabaseFetch(
    `products?select=id,store_code,original_name,price,category,image_url,is_active,last_seen_at,last_seen_general_at,last_seen_promotion_at,price_verified_at,promotion_end_at,promotions(promotion_type,promotion_price,is_active,start_date,end_date,last_seen_at)&store_code=eq.${encodeURIComponent(retailer)}&is_active=eq.true&price=lte.${budget}&limit=1200`,
  ) as DbProduct[]
  const excluded = new Set(excludeProductIds)
  return rows
    .map(toCandidate)
    .filter((item): item is Candidate => item != null && !excluded.has(item.id) && item.paymentAmount <= budget)
}

function balancedCandidatePool(candidates: Candidate[], purpose: Purpose) {
  const profile = purposeProfiles[purpose]
  const roleOrder: Role[] = [...profile.preferred, ...profile.support, ...allRoles]
    .filter((role, index, list) => list.indexOf(role) === index)
  const groups = new Map<string, Candidate[]>()

  for (const item of candidates) {
    const key = `${item.role}:${isPromotion(item) ? 'promo' : 'normal'}`
    const group = groups.get(key) ?? []
    group.push(item)
    groups.set(key, group)
  }

  for (const group of groups.values()) {
    group.sort((a, b) => {
      const aFit = profile.preferred.includes(a.role) ? 0 : profile.support.includes(a.role) ? 1 : 2
      const bFit = profile.preferred.includes(b.role) ? 0 : profile.support.includes(b.role) ? 1 : 2
      return aFit - bFit || a.effectiveUnitPrice - b.effectiveUnitPrice || b.benefitAmount - a.benefitAmount
    })
  }

  const selected: Candidate[] = []
  const selectedIds = new Set<string>()
  const take = (items: Candidate[] | undefined, count: number) => {
    if (!items || count <= 0) return
    for (const item of items) {
      if (selected.length >= 100) return
      if (selectedIds.has(item.id)) continue
      selected.push(item)
      selectedIds.add(item.id)
      count -= 1
      if (count <= 0) return
    }
  }

  for (const role of roleOrder) {
    const isCore = profile.preferred.includes(role) || profile.support.includes(role)
    take(groups.get(`${role}:normal`), isCore ? 7 : 3)
    take(groups.get(`${role}:promo`), isCore ? 5 : 2)
  }

  for (const role of roleOrder) {
    take(groups.get(`${role}:normal`), 4)
    take(groups.get(`${role}:promo`), 4)
  }

  return selected.slice(0, 100)
}

function allowedRolesForPurpose(purpose: Purpose) {
  if (purpose === 'value') return new Set<Role>(allRoles)
  if (purpose === 'meal') return new Set<Role>(['MAIN', 'SIDE', 'PROTEIN', 'DRINK', 'LIGHT'])
  if (purpose === 'diet') return new Set<Role>(['LIGHT', 'PROTEIN', 'DRINK', 'MAIN'])
  if (purpose === 'protein') return new Set<Role>(['PROTEIN', 'MAIN', 'DRINK', 'LIGHT', 'SIDE'])
  if (purpose === 'night') return new Set<Role>(['MAIN', 'SIDE', 'SNACK', 'DRINK', 'DESSERT'])
  return new Set<Role>(['SNACK', 'DESSERT', 'DRINK', 'LIGHT'])
}

function satisfiesPurpose(items: Candidate[], purpose: Purpose) {
  const roles = items.map((item) => item.role)
  const allowed = allowedRolesForPurpose(purpose)
  if (items.some((item) => !allowed.has(item.role))) return false
  return purposeProfiles[purpose].requiredAny.every((group) => group.some((role) => roles.includes(role)))
}

function scoreItems(items: Candidate[], budget: number, purpose: Purpose) {
  if (!satisfiesPurpose(items, purpose)) return -10000
  const profile = purposeProfiles[purpose]
  const roles = new Set(items.map((item) => item.role))
  const paymentAmount = items.reduce((sum, item) => sum + item.paymentAmount, 0)
  const benefitAmount = items.reduce((sum, item) => sum + item.benefitAmount, 0)
  const useRate = paymentAmount / budget
  const promotionItems = items.filter(isPromotion).length
  const fit = Math.min(42, items.reduce((sum, item) => sum + (profile.preferred.includes(item.role) ? 15 : profile.support.includes(item.role) ? 8 : 0), 0))
  const balance = Math.min(30, profile.ideal.reduce((sum, role) => sum + (roles.has(role) ? 9 : 0), 0) + Math.min(6, roles.size * 2))
  const budgetScore = Math.max(0, 24 - Math.abs(0.88 - Math.min(useRate, 1)) * 30) * profile.budgetWeight
  const rawPromotionScore = benefitAmount / Math.max(budget, 1) * 18 + promotionItems * 2
  const promoScore = Math.min(profile.promotionCap, rawPromotionScore * profile.promotionWeight)
  const diversity = Math.min(14, roles.size * 3.2) * profile.diversityWeight
  const valuePromotionBonus = purpose === 'value' && profile.preferredPromotions
    ? items.reduce((sum, item) => sum + (profile.preferredPromotions?.includes(item.promotionType as PromotionKind) ? 4 : 0), 0)
    : 0
  const notAllowedPenalty = items.filter((item) => !allowedRolesForPurpose(purpose).has(item.role)).length * 18
  const duplicatePenalty = Math.max(0, items.length - roles.size) * 9
  const tooManyPromotionPenalty = profile.maxPromotionItems && promotionItems > profile.maxPromotionItems ? (promotionItems - profile.maxPromotionItems) * 12 : 0
  const tooFewItemsPenalty = profile.minItems && items.length < profile.minItems ? 18 : 0
  const allPromoPenalty = purpose !== 'value' && items.length >= 3 && items.every(isPromotion) ? 22 : 0
  return fit + balance + budgetScore + promoScore + diversity + valuePromotionBonus - notAllowedPenalty - duplicatePenalty - tooManyPromotionPenalty - tooFewItemsPenalty - allPromoPenalty
}

function verifyCombo(candidates: Candidate[], combo: GeminiCombo, budget: number, purpose: Purpose): VerifiedCombo | null {
  const productIds = Array.isArray(combo.productIds) ? combo.productIds.map(String) : []
  if (productIds.length < 2 || productIds.length > 4) return null
  if (new Set(productIds).size !== productIds.length) return null
  const byId = new Map(candidates.map((item) => [item.id, item]))
  const items = productIds.map((id) => byId.get(id)).filter(Boolean) as Candidate[]
  if (items.length !== productIds.length || !satisfiesPurpose(items, purpose)) return null
  const paymentAmount = items.reduce((sum, item) => sum + item.paymentAmount, 0)
  if (paymentAmount > budget) return null
  return {
    title: typeof combo.title === 'string' && combo.title.trim() ? combo.title.trim().slice(0, 40) : 'AI 추천 꿀조합',
    reason: typeof combo.reason === 'string' && combo.reason.trim() ? combo.reason.trim().slice(0, 140) : '선택한 목적과 예산에 맞춰 실제 상품으로 구성했어요.',
    retailer: '',
    budget,
    purpose,
    items,
    paymentAmount,
    receivedQuantity: items.reduce((sum, item) => sum + item.receivedQuantity, 0),
    benefitAmount: items.reduce((sum, item) => sum + item.benefitAmount, 0),
    leftover: budget - paymentAmount,
    lastSeenAt: items.map((item) => item.lastSeenAt).filter(Boolean).sort().at(-1) ?? null,
  }
}

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  const raw = fenced ?? text.match(/\{[\s\S]*\}/)?.[0] ?? text
  return JSON.parse(raw) as GeminiParsed
}

async function requestGemini(candidates: Candidate[], retailer: string, budget: number, purpose: Purpose, excludeProductIds: string[]): Promise<GeminiResult> {
  const apiKey = readEnv('GEMINI_API_KEY')
  if (!apiKey) return { combinations: [], status: 'missing_api_key' }
  const model = readEnv('GEMINI_MODEL') ?? 'gemini-2.5-flash'
  const purposeGuide: Record<Purpose, string> = {
    value: '가성비. 행사 혜택은 보너스로 보되 예산 안에서 만족도 높은 조합.',
    meal: '든든한 한 끼. MAIN 필수, 가능하면 SIDE 또는 DRINK 포함.',
    diet: '가볍게. LIGHT 또는 가벼운 MAIN, 가능하면 DRINK 포함.',
    protein: '단백질. PROTEIN 필수, 가능하면 DRINK 또는 MAIN 포함.',
    night: '야식. MAIN 또는 SNACK 중심, 가능하면 DRINK 포함.',
    snack: '간식. SNACK 또는 DESSERT 중심, 가능하면 DRINK 포함.',
  }
  const prompt = [
    'You are a Korean convenience-store combo recommender.',
    'Use only the provided candidate products. Never invent names, IDs, prices, promotions, or calculations.',
    'Select up to 3 combinations. Each combination must have 2 to 4 product IDs and stay within budget.',
    'Prioritize eating purpose and category composition first. Promotion benefits are only a small bonus.',
    `retailer=${retailer}, budget=${budget}, purpose=${purpose}, guide=${purposeGuide[purpose]}`,
    `excludeProductIds=${JSON.stringify(excludeProductIds)}`,
    'Return strict JSON only in this shape: {"combinations":[{"title":"...","productIds":["..."],"reason":"..."}]}',
    `candidates=${JSON.stringify(candidates.map(({ id, name, price, category, role, promotionType }) => ({ id, name, price, category, role, promotionType })))}`,
  ].join('\n')

  const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.35, maxOutputTokens: 600 } }),
  })
  if (!geminiResponse.ok) return { combinations: [], status: `http_${geminiResponse.status}` }
  const data = await geminiResponse.json() as GeminiResponse
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text).filter(Boolean).join('\n').trim()
  if (!text) return { combinations: [], status: 'empty_response' }
  try {
    const parsed = extractJson(text)
    return { combinations: Array.isArray(parsed.combinations) ? parsed.combinations : [], status: 'ok' }
  } catch {
    return { combinations: [], status: 'invalid_json' }
  }
}

function fallbackCombos(candidates: Candidate[], budget: number, purpose: Purpose) {
  const pool = candidates.slice(0, 90)
  const combos: VerifiedCombo[] = []
  function walk(start: number, picked: Candidate[], amount: number) {
    if (picked.length >= 2) {
      const score = scoreItems(picked, budget, purpose)
      if (score > -10000) combos.push(verifyCombo(pool, { title: '검증된 꿀조합', productIds: picked.map((item) => item.id), reason: '실제 판매 상품과 예산을 서버에서 다시 계산해 구성했어요.' }, budget, purpose)!)
    }
    if (picked.length >= 4) return
    for (let index = start; index < pool.length; index += 1) {
      const next = pool[index]
      const nextAmount = amount + next.paymentAmount
      if (nextAmount <= budget) walk(index + 1, [...picked, next], nextAmount)
    }
  }
  walk(0, [], 0)
  return combos
    .filter(Boolean)
    .sort((a, b) => scoreItems(b.items, budget, purpose) - scoreItems(a.items, budget, purpose))
    .slice(0, 3)
}

export default async function handler(request: RequestWithBody, response: ApiResponse) {
  response.setHeader('Access-Control-Allow-Origin', readEnv('CORS_ALLOW_ORIGIN') ?? '*')
  response.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (request.method === 'OPTIONS') return response.status(204).end()
  if (request.method !== 'POST') return response.status(405).json({ ok: false, message: 'Method not allowed' })

  try {
    const body = parseBody(request)
    const retailer = String(body.retailer ?? '').toUpperCase()
    const budget = Math.max(1000, Math.min(toNumber(body.budget), 50000))
    const purpose = purposes.has(String(body.purpose) as Purpose) ? String(body.purpose) as Purpose : 'meal'
    const excludeProductIds = Array.isArray(body.excludeProductIds) ? body.excludeProductIds.map(String).slice(0, 40) : []
    if (!retailers.has(retailer)) throw new Error('invalid_retailer')

    const allCandidates = await loadCandidates(retailer, budget, excludeProductIds)
    const candidates = balancedCandidatePool(allCandidates, purpose)
    if (candidates.length < 2) return response.status(200).json({ ok: false, message: '조건에 맞는 실제 상품이 부족해요. 예산을 조금 올리거나 목적을 바꿔 다시 시도해 주세요.', combinations: [] })

    let gemini = await requestGemini(candidates, retailer, budget, purpose, excludeProductIds)
    let rawCombos = gemini.combinations
    let combinations = rawCombos.map((combo) => verifyCombo(candidates, combo, budget, purpose)).filter(Boolean) as VerifiedCombo[]
    let aiStatus = combinations.length > 0 ? 'gemini_validated' : gemini.status === 'ok' ? 'gemini_verification_failed' : gemini.status
    if (combinations.length === 0 && readEnv('GEMINI_API_KEY')) {
      gemini = await requestGemini(candidates, retailer, budget, purpose, excludeProductIds)
      rawCombos = gemini.combinations
      combinations = rawCombos.map((combo) => verifyCombo(candidates, combo, budget, purpose)).filter(Boolean) as VerifiedCombo[]
      aiStatus = combinations.length > 0 ? 'gemini_validated_after_retry' : gemini.status === 'ok' ? 'gemini_verification_failed_after_retry' : gemini.status
    }
    let source = 'gemini-validated'
    if (combinations.length === 0) {
      combinations = fallbackCombos(candidates, budget, purpose)
      source = 'fallback-validated'
    }

    combinations = combinations.slice(0, 3).map((combo) => ({ ...combo, retailer }))
    response.status(200).json({ ok: combinations.length > 0, combinations, source, aiStatus })
  } catch {
    response.status(200).json({ ok: false, message: 'AI 꿀조합을 만들지 못했어요. 잠시 후 다시 시도해 주세요.', combinations: [] })
  }
}





