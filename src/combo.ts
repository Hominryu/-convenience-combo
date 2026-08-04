import type { Product, Purpose, RetailerCode } from './data'
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

function scoreItems(items: ComboItem[], budget: number, purpose: Purpose) {
  const paymentAmount = items.reduce((sum, item) => sum + item.paymentAmount, 0)
  const benefitAmount = items.reduce((sum, item) => sum + item.benefitAmount, 0)
  const useRate = paymentAmount / budget
  const categoryCounts = new Map<string, number>()
  items.forEach((item) => categoryCounts.set(item.category, (categoryCounts.get(item.category) ?? 0) + 1))

  const purposeFit = items.reduce((sum, item) => sum + (item.tags.includes(purpose) ? 36 : 0), 0)
  const diversity = categoryCounts.size * 16
  const duplicatePenalty = [...categoryCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1) * 18, 0)
  const balancedUse = useRate > 0.72 ? 160 - Math.abs(0.92 - useRate) * 120 : useRate * 120

  return balancedUse + benefitAmount / 45 + purposeFit + diversity - duplicatePenalty
}

export function buildCombos(retailer: RetailerCode, budget: number, purpose: Purpose, limit = 8): ComboResult[] {
  const pool = products
    .filter((product) => product.retailer === retailer)
    .map(toComboItem)
    .filter((item) => item.paymentAmount <= budget)
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

export function buildCrossRetailerBest(budget: number, purpose: Purpose) {
  return (['cu', 'gs25', 'seven', 'emart24'] as RetailerCode[])
    .map((retailer) => buildCombos(retailer, budget, purpose, 1)[0])
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
}
