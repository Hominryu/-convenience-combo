import type { Product, ProductCategory, PromotionType, Purpose, RetailerCode } from './data'
import { products } from './data'

export type ComboItem = Product & {
  paymentQuantity: number
  receivedQuantity: number
  paymentAmount: number
  benefitAmount: number
  effectiveUnitPrice: number
}

export type ComboResult = {
  retailer: RetailerCode
  purpose: Purpose
  budget: number
  items: ComboItem[]
  paymentAmount: number
  receivedQuantity: number
  benefitAmount: number
  leftover: number
  score: number
}

type PurposeProfile = {
  targetCategories: ProductCategory[]
  supportCategories: ProductCategory[]
  promotionWeight: number
  budgetWeight: number
  diversityWeight: number
  maxPromotionItems?: number
  minItems?: number
  preferredPromotions?: PromotionType[]
}

const purposeProfiles: Record<Purpose, PurposeProfile> = {
  value: {
    targetCategories: ['meal', 'snack', 'drink', 'protein', 'dessert', 'fresh'],
    supportCategories: ['meal', 'snack', 'drink'],
    promotionWeight: 1.35,
    budgetWeight: 1.1,
    diversityWeight: 0.7,
    preferredPromotions: ['1+1', '2+1', '3+1', 'sale'],
  },
  meal: {
    targetCategories: ['meal', 'protein', 'fresh'],
    supportCategories: ['drink', 'snack'],
    promotionWeight: 0.72,
    budgetWeight: 1,
    diversityWeight: 1.35,
    maxPromotionItems: 3,
    minItems: 2,
  },
  diet: {
    targetCategories: ['fresh', 'protein', 'drink'],
    supportCategories: ['meal'],
    promotionWeight: 0.58,
    budgetWeight: 0.82,
    diversityWeight: 1.15,
    maxPromotionItems: 2,
    minItems: 2,
  },
  protein: {
    targetCategories: ['protein', 'fresh'],
    supportCategories: ['meal', 'drink'],
    promotionWeight: 0.75,
    budgetWeight: 0.9,
    diversityWeight: 1.05,
    maxPromotionItems: 3,
    minItems: 2,
  },
  night: {
    targetCategories: ['meal', 'snack', 'drink'],
    supportCategories: ['dessert'],
    promotionWeight: 0.92,
    budgetWeight: 0.95,
    diversityWeight: 1.1,
    maxPromotionItems: 3,
    minItems: 2,
  },
  snack: {
    targetCategories: ['snack', 'dessert', 'drink'],
    supportCategories: ['fresh'],
    promotionWeight: 0.95,
    budgetWeight: 0.86,
    diversityWeight: 1.05,
    maxPromotionItems: 3,
    minItems: 2,
  },
}

export function formatWon(value: number) {
  return `${value.toLocaleString('ko-KR')}원`
}

export function toComboItem(product: Product): ComboItem {
  const unitPayment = product.discountPrice ?? product.price
  const paymentAmount = unitPayment * product.purchaseQuantity
  const receivedQuantity = product.rewardQuantity
  const originalValue = product.price * receivedQuantity
  const benefitAmount = Math.max(0, originalValue - paymentAmount)

  return {
    ...product,
    paymentQuantity: product.purchaseQuantity,
    receivedQuantity,
    paymentAmount,
    benefitAmount,
    effectiveUnitPrice: Math.round(paymentAmount / receivedQuantity),
  }
}

function isPromotion(item: ComboItem) {
  return item.promotionType !== 'none' && item.promotionType !== 'new'
}

function hasCategory(items: ComboItem[], categories: ProductCategory[]) {
  return items.some((item) => categories.includes(item.category))
}

function scoreItems(items: ComboItem[], budget: number, purpose: Purpose) {
  const profile = purposeProfiles[purpose]
  const paymentAmount = items.reduce((sum, item) => sum + item.paymentAmount, 0)
  const benefitAmount = items.reduce((sum, item) => sum + item.benefitAmount, 0)
  const useRate = paymentAmount / budget
  const categoryCounts = new Map<ProductCategory, number>()
  items.forEach((item) => categoryCounts.set(item.category, (categoryCounts.get(item.category) ?? 0) + 1))

  const targetCategoryScore = items.reduce((sum, item) => {
    if (profile.targetCategories.includes(item.category)) return sum + 42
    if (profile.supportCategories.includes(item.category)) return sum + 18
    return sum
  }, 0)
  const tagScore = items.reduce((sum, item) => sum + (item.tags.includes(purpose) ? 34 : 0), 0)
  const promotionItems = items.filter(isPromotion).length
  const promotionScore = (benefitAmount / 42 + promotionItems * 18) * profile.promotionWeight
  const diversityScore = categoryCounts.size * 18 * profile.diversityWeight
  const duplicatePenalty = [...categoryCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1) * 20, 0)
  const balancedUse = (useRate > 0.72 ? 164 - Math.abs(0.9 - useRate) * 130 : useRate * 116) * profile.budgetWeight
  const tooManyPromotionPenalty = profile.maxPromotionItems && promotionItems > profile.maxPromotionItems ? (promotionItems - profile.maxPromotionItems) * 42 : 0
  const tooFewItemsPenalty = profile.minItems && items.length < profile.minItems ? 36 : 0
  const missingMainPenalty = hasCategory(items, profile.targetCategories) ? 0 : 78
  const allPromotionPenalty = purpose !== 'value' && promotionItems === items.length && items.length >= 3 ? 48 : 0
  const valueBonus = purpose === 'value' && profile.preferredPromotions ? items.reduce((sum, item) => sum + (profile.preferredPromotions?.includes(item.promotionType) ? 18 : 0), 0) : 0

  return (
    balancedUse +
    targetCategoryScore +
    tagScore +
    promotionScore +
    diversityScore +
    valueBonus -
    duplicatePenalty -
    tooManyPromotionPenalty -
    tooFewItemsPenalty -
    missingMainPenalty -
    allPromotionPenalty
  )
}

export function buildCombosFromProducts(sourceProducts: Product[], retailer: RetailerCode, budget: number, purpose: Purpose, limit = 8): ComboResult[] {
  const pool = sourceProducts
    .filter((product) => product.retailer === retailer)
    .map(toComboItem)
    .filter((item) => item.paymentAmount <= budget)
    .sort((a, b) => {
      const profile = purposeProfiles[purpose]
      const aTarget = profile.targetCategories.includes(a.category) ? 0 : 1
      const bTarget = profile.targetCategories.includes(b.category) ? 0 : 1
      return aTarget - bTarget || b.benefitAmount - a.benefitAmount || a.effectiveUnitPrice - b.effectiveUnitPrice
    })
    .slice(0, 80)
  const results: ComboResult[] = []

  function walk(start: number, picked: ComboItem[], paymentAmount: number) {
    if (picked.length > 0) {
      const benefitAmount = picked.reduce((sum, item) => sum + item.benefitAmount, 0)
      results.push({
        retailer,
        purpose,
        budget,
        items: picked,
        paymentAmount,
        receivedQuantity: picked.reduce((sum, item) => sum + item.receivedQuantity, 0),
        benefitAmount,
        leftover: budget - paymentAmount,
        score: scoreItems(picked, budget, purpose),
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

  return results
    .sort((a, b) => b.score - a.score || a.leftover - b.leftover || b.benefitAmount - a.benefitAmount)
    .slice(0, limit)
}

export function buildCombos(retailer: RetailerCode, budget: number, purpose: Purpose, limit = 8): ComboResult[] {
  return buildCombosFromProducts(products, retailer, budget, purpose, limit)
}

export function buildCrossRetailerBest(budget: number, purpose: Purpose) {
  return (['cu', 'gs25', 'seven', 'emart24'] as RetailerCode[])
    .map((retailer) => buildCombos(retailer, budget, purpose, 1)[0])
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
}

export function buildCrossRetailerBestFromProducts(sourceProducts: Product[], budget: number, purpose: Purpose) {
  return (['cu', 'gs25', 'seven', 'emart24'] as RetailerCode[])
    .map((retailer) => buildCombosFromProducts(sourceProducts, retailer, budget, purpose, 1)[0])
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
}
