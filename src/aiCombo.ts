import type { Purpose, RetailerCode } from './data'
import { logAdEvent } from './ads/logger'

export type AiComboItem = {
  id: string
  name: string
  price: number
  category: string
  promotionType: string
  purchaseQuantity: number
  rewardQuantity: number
  paymentAmount: number
  receivedQuantity: number
  benefitAmount: number
  effectiveUnitPrice: number
  lastSeenAt: string | null
}

export type AiCombo = {
  title: string
  reason: string
  retailer: string
  budget: number
  purpose: Purpose
  items: AiComboItem[]
  paymentAmount: number
  receivedQuantity: number
  benefitAmount: number
  leftover: number
  lastSeenAt: string | null
}

type AiComboParams = {
  retailer: RetailerCode
  budget: number
  purpose: Purpose
  excludeProductIds?: string[]
}

type AiComboResponse = {
  ok?: boolean
  message?: string
  combinations?: AiCombo[]
  source?: string
}

export async function requestAiCombo(params: AiComboParams) {
  const apiBaseUrl = import.meta.env.VITE_COMBO_API_BASE_URL?.replace(/\/$/, '')
  if (!apiBaseUrl) throw new Error('api_base_url_missing')

  logAdEvent('rewarded_ai_requested', {
    retailer: params.retailer,
    budget: params.budget,
    purpose: params.purpose,
  })

  const response = await fetch(`${apiBaseUrl}/api/ai-combo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })

  if (!response.ok) throw new Error('ai_combo_failed')

  const data = (await response.json()) as AiComboResponse
  logAdEvent('rewarded_ai_completed', {
    retailer: params.retailer,
    budget: params.budget,
    purpose: params.purpose,
    ok: Boolean(data.ok),
    source: data.source,
  })

  if (!data.ok || !data.combinations?.length) throw new Error(data.message ?? 'ai_combo_empty')
  return data.combinations
}
