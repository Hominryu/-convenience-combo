export type AdEventName =
  | 'ad_load_requested'
  | 'ad_load_success'
  | 'ad_load_failed'
  | 'ad_show_requested'
  | 'ad_show_success'
  | 'ad_completed'
  | 'ad_closed'
  | 'ad_show_failed'
  | 'rewarded_ai_requested'
  | 'rewarded_ai_completed'
  | 'rewarded_ai_failed'

type LogPayload = Record<string, string | number | boolean | null | undefined>

function redactPayload(payload: LogPayload) {
  const nextPayload: LogPayload = {}
  for (const [key, value] of Object.entries(payload)) {
    if (key.toLowerCase().includes('adgroup') || key.toLowerCase().includes('ad_group')) continue
    nextPayload[key] = value
  }
  return nextPayload
}

export function logAdEvent(name: AdEventName, payload: LogPayload = {}) {
  const params = {
    ...redactPayload(payload),
    event: name,
    loggedAt: new Date().toISOString(),
  }

  import('@apps-in-toss/web-framework')
    .then(({ Analytics }) => Analytics.log({ log_name: name, log_type: 'event', params }))
    .catch(() => undefined)

  if (import.meta.env.DEV) {
    console.info('[ad-event]', name, params)
  }
}
