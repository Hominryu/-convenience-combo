import type { ComboResult } from './combo'
import type { Purpose, RetailerCode } from './data'
import { logAdEvent } from './ads/logger'

type AiComboParams = {
  combo: ComboResult
  retailer: RetailerCode
  budget: number
  purpose: Purpose
}

type AiComboResponse = {
  ok?: boolean
  message?: string
}

export async function requestAiCombo(params: AiComboParams) {
  const apiBaseUrl = import.meta.env.VITE_COMBO_API_BASE_URL?.replace(/\/$/, '')
  if (!apiBaseUrl) {
    return '지금 조합에서 행사상품 비중을 유지하면서, 같은 예산 안에서 카테고리가 겹치지 않게 한 번 더 골라보는 걸 추천해요.'
  }

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

  if (!response.ok) {
    throw new Error('ai_combo_failed')
  }

  const data = (await response.json()) as AiComboResponse
  logAdEvent('rewarded_ai_completed', {
    retailer: params.retailer,
    budget: params.budget,
    purpose: params.purpose,
    ok: Boolean(data.ok),
  })

  return data.message ?? '예산과 목적에 맞춰 조합을 다시 정리했어요.'
}
