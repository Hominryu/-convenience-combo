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

type Role = 'MAIN' | 'SIDE' | 'PROTEIN' | 'DRINK' | 'SNACK' | 'LIGHT' | 'DESSERT'

type PurposeProfile = {
  requiredAny: Role[][]
  preferred: Role[]
  support: Role[]
  idealRoles: Role[]
  promotionWeight: number
  budgetWeight: number
  diversityWeight: number
  promotionCap: number
  maxPromotionItems?: number
  minItems?: number
  preferredPromotions?: PromotionType[]
}

const purposeProfiles: Record<Purpose, PurposeProfile> = {
  value: {
    requiredAny: [],
    preferred: ['MAIN', 'SIDE', 'PROTEIN', 'DRINK', 'SNACK', 'LIGHT', 'DESSERT'],
    support: ['MAIN', 'DRINK', 'SNACK'],
    idealRoles: ['MAIN', 'DRINK', 'SNACK'],
    promotionWeight: 1.35,
    budgetWeight: 1.1,
    diversityWeight: 0.7,
    promotionCap: 14,
    preferredPromotions: ['1+1', '2+1', '3+1', 'sale'],
  },
  meal: {
    requiredAny: [['MAIN']],
    preferred: ['MAIN', 'SIDE', 'PROTEIN'],
    support: ['DRINK', 'LIGHT'],
    idealRoles: ['MAIN', 'SIDE', 'DRINK'],
    promotionWeight: 0.72,
    budgetWeight: 1,
    diversityWeight: 1.35,
    promotionCap: 10,
    maxPromotionItems: 3,
    minItems: 2,
  },
  diet: {
    requiredAny: [['LIGHT', 'MAIN']],
    preferred: ['LIGHT', 'PROTEIN'],
    support: ['DRINK', 'MAIN'],
    idealRoles: ['LIGHT', 'PROTEIN', 'DRINK'],
    promotionWeight: 0.58,
    budgetWeight: 0.82,
    diversityWeight: 1.15,
    promotionCap: 8,
    maxPromotionItems: 2,
    minItems: 2,
  },
  protein: {
    requiredAny: [['PROTEIN']],
    preferred: ['PROTEIN'],
    support: ['MAIN', 'DRINK', 'LIGHT'],
    idealRoles: ['PROTEIN', 'DRINK', 'MAIN'],
    promotionWeight: 0.75,
    budgetWeight: 0.9,
    diversityWeight: 1.05,
    promotionCap: 8,
    maxPromotionItems: 3,
    minItems: 2,
  },
  night: {
    requiredAny: [['MAIN', 'SNACK']],
    preferred: ['MAIN', 'SNACK', 'SIDE'],
    support: ['DRINK', 'DESSERT'],
    idealRoles: ['MAIN', 'SIDE', 'DRINK'],
    promotionWeight: 0.92,
    budgetWeight: 0.95,
    diversityWeight: 1.1,
    promotionCap: 9,
    maxPromotionItems: 3,
    minItems: 2,
  },
  snack: {
    requiredAny: [['SNACK', 'DESSERT']],
    preferred: ['SNACK', 'DESSERT'],
    support: ['DRINK', 'LIGHT'],
    idealRoles: ['SNACK', 'DRINK', 'DESSERT'],
    promotionWeight: 0.95,
    budgetWeight: 0.86,
    diversityWeight: 1.05,
    promotionCap: 8,
    maxPromotionItems: 3,
    minItems: 2,
  },
}

const roleByCategory: Record<ProductCategory, Role> = {
  meal: 'MAIN',
  protein: 'PROTEIN',
  drink: 'DRINK',
  snack: 'SNACK',
  fresh: 'LIGHT',
  dessert: 'DESSERT',
}

const sidePattern = /핫바|소시지|소세지|어묵|계란|달걀|반숙|구운란|만두|치킨|닭강정|떡갈비|닭갈비|감자|두부/i
const lightPattern = /샐러드|과일|요거트|요구르트|그릭|바나나|토마토|고구마|저당/i
const mainPattern = /도시락|김밥|삼각|주먹밥|쌈밥|유부초밥|샌드|버거|라면|누들|우동|국수|파스타|스파게티|정식|정찬|덮밥|비빔밥|볶음밥|브리또/i

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

function roleOf(item: Pick<ComboItem, 'category' | 'name'>): Role {
  if (lightPattern.test(item.name)) return 'LIGHT'
  if (mainPattern.test(item.name)) return 'MAIN'
  if (sidePattern.test(item.name)) return item.category === 'protein' ? 'PROTEIN' : 'SIDE'
  return roleByCategory[item.category]
}

function satisfiesRequired(roles: Role[], purpose: Purpose) {
  return purposeProfiles[purpose].requiredAny.every((group) => group.some((role) => roles.includes(role)))
}

function scoreItems(items: ComboItem[], budget: number, purpose: Purpose) {
  const profile = purposeProfiles[purpose]
  const roles = items.map(roleOf)
  if (!satisfiesRequired(roles, purpose)) return -10000

  const paymentAmount = items.reduce((sum, item) => sum + item.paymentAmount, 0)
  const benefitAmount = items.reduce((sum, item) => sum + item.benefitAmount, 0)
  const useRate = paymentAmount / budget
  const uniqueRoles = new Set(roles)
  const promotionItems = items.filter(isPromotion).length

  const purposeFit = Math.min(42, roles.reduce((sum, role) => sum + (profile.preferred.includes(role) ? 15 : profile.support.includes(role) ? 8 : 0), 0))
  const tagScore = items.reduce((sum, item) => sum + (item.tags.includes(purpose) ? 12 : 0), 0)
  const compatibility = Math.min(30, profile.idealRoles.reduce((sum, role) => sum + (uniqueRoles.has(role) ? 9 : 0), 0) + Math.min(6, uniqueRoles.size * 2))
  const budgetScore = Math.max(0, 24 - Math.abs(0.88 - Math.min(useRate, 1)) * 30) * profile.budgetWeight
  const rawPromotionScore = benefitAmount / Math.max(budget, 1) * 18 + promotionItems * 2
  const promotionScore = Math.min(profile.promotionCap, rawPromotionScore * profile.promotionWeight)
  const diversityScore = Math.min(14, uniqueRoles.size * 3.2) * profile.diversityWeight
  const valuePromotionBonus = purpose === 'value' && profile.preferredPromotions
    ? items.reduce((sum, item) => sum + (profile.preferredPromotions?.includes(item.promotionType) ? 4 : 0), 0)
    : 0
  const duplicatePenalty = Math.max(0, roles.length - uniqueRoles.size) * 9
  const tooManyPromotionPenalty = profile.maxPromotionItems && promotionItems > profile.maxPromotionItems ? (promotionItems - profile.maxPromotionItems) * 12 : 0
  const tooFewItemsPenalty = profile.minItems && items.length < profile.minItems ? 18 : 0
  const allPromotionPenalty = purpose !== 'value' && promotionItems === items.length && items.length >= 3 ? 22 : 0

  return purposeFit + tagScore + compatibility + budgetScore + promotionScore + diversityScore + valuePromotionBonus - duplicatePenalty - tooManyPromotionPenalty - tooFewItemsPenalty - allPromotionPenalty
}

function balancedCandidatePool(items: ComboItem[], purpose: Purpose) {
  const profile = purposeProfiles[purpose]
  const groups = new Map<string, ComboItem[]>()
  for (const item of items) {
    const key = `${roleOf(item)}:${isPromotion(item) ? 'promo' : 'normal'}`
    const group = groups.get(key) ?? []
    group.push(item)
    groups.set(key, group)
  }

  const rankedGroups = [...groups.entries()].map(([key, group]) => [
    key,
    group.sort((a, b) => {
      const aRole = roleOf(a)
      const bRole = roleOf(b)
      const aFit = profile.preferred.includes(aRole) ? 0 : profile.support.includes(aRole) ? 1 : 2
      const bFit = profile.preferred.includes(bRole) ? 0 : profile.support.includes(bRole) ? 1 : 2
      return aFit - bFit || a.effectiveUnitPrice - b.effectiveUnitPrice || b.benefitAmount - a.benefitAmount
    }).slice(0, 16),
  ] as const)

  return rankedGroups.flatMap(([, group]) => group)
}

export function buildCombosFromProducts(sourceProducts: Product[], retailer: RetailerCode, budget: number, purpose: Purpose, limit = 8): ComboResult[] {
  const candidates = sourceProducts
    .filter((product) => product.retailer === retailer)
    .map(toComboItem)
    .filter((item) => item.paymentAmount <= budget)

  const pool = balancedCandidatePool(candidates, purpose).slice(0, 110)
  const results: ComboResult[] = []

  function walk(start: number, picked: ComboItem[], paymentAmount: number) {
    if (picked.length >= 2) {
      const benefitAmount = picked.reduce((sum, item) => sum + item.benefitAmount, 0)
      const score = scoreItems(picked, budget, purpose)
      if (score > -10000) {
        results.push({
          retailer,
          purpose,
          budget,
          items: picked,
          paymentAmount,
          receivedQuantity: picked.reduce((sum, item) => sum + item.receivedQuantity, 0),
          benefitAmount,
          leftover: budget - paymentAmount,
          score,
        })
      }
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
  return (['cu', 'gs25', 'emart24'] as RetailerCode[])
    .map((retailer) => buildCombos(retailer, budget, purpose, 1)[0])
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
}

export function buildCrossRetailerBestFromProducts(sourceProducts: Product[], budget: number, purpose: Purpose) {
  return (['cu', 'gs25', 'emart24'] as RetailerCode[])
    .map((retailer) => buildCombosFromProducts(sourceProducts, retailer, budget, purpose, 1)[0])
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
}


