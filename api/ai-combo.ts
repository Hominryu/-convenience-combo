import type { ApiRequest, ApiResponse } from './_lib/http.js'
import { readEnv } from './_lib/env.js'

type RequestWithBody = ApiRequest & {
  body?: unknown
}

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>
    }
  }>
}

function parseBody(request: RequestWithBody) {
  if (typeof request.body === 'string') return JSON.parse(request.body) as Record<string, unknown>
  if (request.body && typeof request.body === 'object') return request.body as Record<string, unknown>
  return {}
}

function fallbackMessage() {
  return '행사상품 위주로 예산을 꽉 채우기보다, 식사류 1개와 음료/간식 1개를 섞으면 만족도가 더 좋아요. 결제 전 매장에서 행사 적용 여부만 한 번 확인해 주세요.'
}

export default async function handler(request: RequestWithBody, response: ApiResponse) {
  response.setHeader('Access-Control-Allow-Origin', readEnv('CORS_ALLOW_ORIGIN') ?? '*')
  response.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (request.method === 'OPTIONS') {
    response.status(204).end()
    return
  }

  if (request.method !== 'POST') {
    response.status(405).json({ ok: false, message: 'Method not allowed' })
    return
  }

  const apiKey = readEnv('GEMINI_API_KEY')
  const model = readEnv('GEMINI_MODEL') ?? 'gemini-2.5-flash'
  const body = parseBody(request)

  if (!apiKey) {
    response.status(200).json({ ok: true, message: fallbackMessage(), source: 'fallback' })
    return
  }

  const prompt = [
    '너는 편의점 행사상품 조합을 짧고 친절하게 설명하는 도우미야.',
    '가격, 행사 종류, 결제금액 계산은 이미 앱에서 끝났으니 숫자를 새로 만들지 마.',
    '사용자가 광고 시청을 완료한 뒤 받는 보너스 추천이므로 2문장 이내로 구체적으로 말해.',
    `요청 데이터: ${JSON.stringify(body)}`,
  ].join('\n')

  const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 180,
      },
    }),
  })

  if (!geminiResponse.ok) {
    response.status(200).json({ ok: true, message: fallbackMessage(), source: 'fallback' })
    return
  }

  const data = (await geminiResponse.json()) as GeminiResponse
  const message = data.candidates?.[0]?.content?.parts?.map((part) => part.text).filter(Boolean).join('\n').trim()
  response.status(200).json({ ok: true, message: message || fallbackMessage(), source: message ? 'gemini' : 'fallback' })
}
