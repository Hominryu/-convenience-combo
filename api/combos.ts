import type { ApiRequest, ApiResponse } from './_lib/http.js'
import { supabaseFetch } from './_lib/supabase.js'
import { readEnv } from './_lib/env.js'

type Purpose = 'value' | 'meal' | 'diet' | 'protein' | 'night' | 'snack'
type ProductCategory = 'meal' | 'drink' | 'protein' | 'snack' | 'fresh' | 'dessert'
type PromotionType = 'none' | '1+1' | '2+1' | '3+1' | 'sale' | 'new'

type ApiProduct = {
  id: string
  retailer: string
  name: string
  price: number
  category: ProductCategory
  tags: string[]
  promotionType: PromotionType
  purchaseQuantity: number
  rewardQuantity: number
  discountPrice?: number | null
}

type ComboItem = ReturnType<typeof toItem>

const profiles: Record<Purpose, {
  targetCategories: ProductCategory[]
  supportCategories: ProductCategory[]
  promotionWeight: number
  budgetWeight: number
  diversityWeight: number
  maxPromotionItems?: number
  minItems?: number
}> = {
  value: { targetCategories: ['meal', 'snack', 'drink', 'protein', 'dessert', 'fresh'], supportCategories: ['meal', 'snack', 'drink'], promotionWeight: 1.35, budgetWeight: 1.1, diversityWeight: 0.7 },
  meal: { targetCategories: ['meal', 'protein', 'fresh'], supportCategories: ['drink', 'snack'], promotionWeight: 0.72, budgetWeight: 1, diversityWeight: 1.35, maxPromotionItems: 3, minItems: 2 },
  diet: { targetCategories: ['fresh', 'protein', 'drink'], supportCategories: ['meal'], promotionWeight: 0.58, budgetWeight: 0.82, diversityWeight: 1.15, maxPromotionItems: 2, minItems: 2 },
  protein: { targetCategories: ['protein', 'fresh'], supportCategories: ['meal', 'drink'], promotionWeight: 0.75, budgetWeight: 0.9, diversityWeight: 1.05, maxPromotionItems: 3, minItems: 2 },
  night: { targetCategories: ['meal', 'snack', 'drink'], supportCategories: ['dessert'], promotionWeight: 0.92, budgetWeight: 0.95, diversityWeight: 1.1, maxPromotionItems: 3, minItems: 2 },
  snack: { targetCategories: ['snack', 'dessert', 'drink'], supportCategories: ['fresh'], promotionWeight: 0.95, budgetWeight: 0.86, diversityWeight: 1.05, maxPromotionItems: 3, minItems: 2 },
}

function toItem(product: ApiProduct) {
  const unitPayment = product.discountPrice ?? product.price
  const paymentAmount = unitPayment * product.purchaseQuantity
  const receivedQuantity = product.rewardQuantity
  const benefitAmount = Math.max(0, product.price * receivedQuantity - paymentAmount)
  return {
    ...product,
    paymentAmount,
    receivedQuantity,
    benefitAmount,
    effectiveUnitPrice: Math.round(paymentAmount / receivedQuantity),
  }
}

function isPromotion(item: ComboItem) {
  return item.promotionType !== 'none' && item.promotionType !== 'new'
}

function buildCombos(products: ApiProduct[], budget: number, purpose: Purpose) {
  const profile = profiles[purpose]
  const pool = products
    .map(toItem)
    .filter((item) => item.paymentAmount <= budget)
    .sort((a, b) => {
      const aTarget = profile.targetCategories.includes(a.category) ? 0 : 1
      const bTarget = profile.targetCategories.includes(b.category) ? 0 : 1
      return aTarget - bTarget || b.benefitAmount - a.benefitAmount || a.effectiveUnitPrice - b.effectiveUnitPrice
    })
    .slice(0, 80)
  const results: Array<Record<string, unknown>> = []

  function score(items: ComboItem[], paymentAmount: number) {
    const benefitAmount = items.reduce((sum, item) => sum + item.benefitAmount, 0)
    const categoryCounts = new Map<ProductCategory, number>()
    items.forEach((item) => categoryCounts.set(item.category, (categoryCounts.get(item.category) ?? 0) + 1))
    const useRate = paymentAmount / budget
    const targetCategoryScore = items.reduce((sum, item) => sum + (profile.targetCategories.includes(item.category) ? 42 : profile.supportCategories.includes(item.category) ? 18 : 0), 0)
    const tagScore = items.reduce((sum, item) => sum + (item.tags.includes(purpose) ? 34 : 0), 0)
    const promotionItems = items.filter(isPromotion).length
    const promotionScore = (benefitAmount / 42 + promotionItems * 18) * profile.promotionWeight
    const diversityScore = categoryCounts.size * 18 * profile.diversityWeight
    const duplicatePenalty = [...categoryCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1) * 20, 0)
    const balancedUse = (useRate > 0.72 ? 164 - Math.abs(0.9 - useRate) * 130 : useRate * 116) * profile.budgetWeight
    const tooManyPromotionPenalty = profile.maxPromotionItems && promotionItems > profile.maxPromotionItems ? (promotionItems - profile.maxPromotionItems) * 42 : 0
    const tooFewItemsPenalty = profile.minItems && items.length < profile.minItems ? 36 : 0
    const missingMainPenalty = items.some((item) => profile.targetCategories.includes(item.category)) ? 0 : 78
    const allPromotionPenalty = purpose !== 'value' && promotionItems === items.length && items.length >= 3 ? 48 : 0
    const valueBonus = purpose === 'value' ? promotionItems * 18 : 0

    return balancedUse + targetCategoryScore + tagScore + promotionScore + diversityScore + valueBonus - duplicatePenalty - tooManyPromotionPenalty - tooFewItemsPenalty - missingMainPenalty - allPromotionPenalty
  }

  function walk(start: number, picked: ComboItem[], paymentAmount: number) {
    if (picked.length > 0) {
      results.push({
        items: picked,
        paymentAmount,
        receivedQuantity: picked.reduce((sum, item) => sum + item.receivedQuantity, 0),
        benefitAmount: picked.reduce((sum, item) => sum + item.benefitAmount, 0),
        leftover: budget - paymentAmount,
        score: score(picked, paymentAmount),
      })
    }
    if (picked.length >= 4) return
    for (let index = start; index < pool.length; index += 1) {
      const next = pool[index]
      const nextAmount = paymentAmount + next.paymentAmount
      if (nextAmount <= budget) walk(index + 1, [...picked, next], nextAmount)
    }
  }

  walk(0, [], 0)
  return results.sort((a, b) => Number(b.score) - Number(a.score) || Number(a.leftover) - Number(b.leftover)).slice(0, 8)
}

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
    const retailer = String(request.query.retailer ?? 'gs25')
    const budget = Math.max(1000, Number(request.query.budget ?? 7000))
    const purpose = (String(request.query.purpose ?? 'meal') in profiles ? String(request.query.purpose ?? 'meal') : 'meal') as Purpose
    const rows = await supabaseFetch(
      `products?select=id,name,price,category,tags,retailers!inner(code),promotions(promotion_type,purchase_quantity,reward_quantity,discount_price,collected_at)&active=eq.true&retailers.code=eq.${encodeURIComponent(retailer)}&limit=300`,
    ) as Array<Record<string, unknown>>
    const products = rows
      .map((row): ApiProduct | null => {
        const retailerInfo = row.retailers as Record<string, unknown> | undefined
        const promotions = Array.isArray(row.promotions) ? row.promotions as Array<Record<string, unknown>> : []
        const promo = promotions.sort((a, b) => String(b.collected_at ?? '').localeCompare(String(a.collected_at ?? '')))[0]
        if (!promo || retailerInfo?.code !== retailer) return null
        return {
          id: String(row.id),
          retailer,
          name: String(row.name),
          price: Number(row.price),
          category: String(row.category) as ProductCategory,
          tags: Array.isArray(row.tags) ? row.tags as string[] : [],
          promotionType: String(promo.promotion_type) as PromotionType,
          purchaseQuantity: Number(promo.purchase_quantity ?? 1),
          rewardQuantity: Number(promo.reward_quantity ?? 1),
          discountPrice: promo.discount_price == null ? null : Number(promo.discount_price),
        }
      })
      .filter(Boolean) as ApiProduct[]

    response.status(200).json({ ok: true, retailer, budget, purpose, combos: buildCombos(products, budget, purpose) })
  } catch (error) {
    response.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' })
  }
}
