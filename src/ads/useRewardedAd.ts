import { useCallback, useEffect, useRef, useState } from 'react'
import { adsConfig, isRewardedAdEnabled, type AdStatus } from './config'
import { logAdEvent } from './logger'
import { canLoadRewardedAd, canShowRewardedAd, reduceRewardedStatus } from './rewardedController'

type UseRewardedAdParams = {
  enabled?: boolean
  onCompleted: () => Promise<void> | void
}

let requestCounter = 0

export function useRewardedAd({ enabled = true, onCompleted }: UseRewardedAdParams) {
  const [status, setStatus] = useState<AdStatus>('IDLE')
  const [message, setMessage] = useState('')
  const cleanupLoadRef = useRef<(() => void) | null>(null)
  const cleanupShowRef = useRef<(() => void) | null>(null)
  const statusRef = useRef<AdStatus>('IDLE')
  const mountedRef = useRef(true)
  const completedHandledRef = useRef(false)
  const requestIdRef = useRef(0)
  const onCompletedRef = useRef(onCompleted)

  useEffect(() => {
    onCompletedRef.current = onCompleted
  }, [onCompleted])

  const updateStatus = useCallback((nextStatus: AdStatus) => {
    if (!mountedRef.current) return
    statusRef.current = nextStatus
    setStatus(nextStatus)
  }, [])

  const transition = useCallback((type: Parameters<typeof reduceRewardedStatus>[1]['type']) => {
    const nextStatus = reduceRewardedStatus(statusRef.current, { type })
    updateStatus(nextStatus)
    return nextStatus
  }, [updateStatus])

  const load = useCallback(async () => {
    if (!enabled || !isRewardedAdEnabled()) return
    if (!canLoadRewardedAd(statusRef.current)) return

    const requestId = requestCounter + 1
    requestCounter = requestId
    requestIdRef.current = requestId
    completedHandledRef.current = false
    cleanupLoadRef.current?.()
    cleanupLoadRef.current = null
    setMessage('')
    transition('LOAD_REQUESTED')
    logAdEvent('ad_load_requested', { placement: 'ai_combo_rewarded', environment: adsConfig.environment })

    try {
      const { loadFullScreenAd } = await import('@apps-in-toss/web-framework')
      if (!loadFullScreenAd.isSupported()) throw new Error('rewarded ad load is not supported')

      cleanupLoadRef.current = loadFullScreenAd({
        options: { adGroupId: adsConfig.rewardedAdGroupId },
        onEvent: (event) => {
          if (!mountedRef.current || requestIdRef.current !== requestId) return
          if (event.type !== 'loaded') return
          transition('LOAD_SUCCESS')
          logAdEvent('ad_load_success', { placement: 'ai_combo_rewarded', environment: adsConfig.environment })
        },
        onError: (error) => {
          if (!mountedRef.current || requestIdRef.current !== requestId) return
          transition('LOAD_FAILED')
          setMessage('광고를 준비하지 못했어요. 기본 추천은 계속 이용할 수 있어요.')
          logAdEvent('ad_load_failed', { placement: 'ai_combo_rewarded', reason: error.message })
        },
      })
    } catch (error) {
      transition('LOAD_FAILED')
      setMessage('광고를 사용할 수 없는 환경이에요. 기본 추천은 계속 이용할 수 있어요.')
      logAdEvent('ad_load_failed', {
        placement: 'ai_combo_rewarded',
        reason: error instanceof Error ? error.message : 'unknown',
      })
    }
  }, [enabled, transition])

  const show = useCallback(async () => {
    if (!enabled || !canShowRewardedAd(statusRef.current)) return

    cleanupShowRef.current?.()
    cleanupShowRef.current = null
    transition('SHOW_REQUESTED')
    logAdEvent('ad_show_requested', { placement: 'ai_combo_rewarded', environment: adsConfig.environment })

    try {
      const { showFullScreenAd } = await import('@apps-in-toss/web-framework')
      if (!showFullScreenAd.isSupported()) throw new Error('rewarded ad show is not supported')

      cleanupShowRef.current = showFullScreenAd({
        options: { adGroupId: adsConfig.rewardedAdGroupId },
        onEvent: (event) => {
          if (!mountedRef.current) return

          if (event.type === 'show') {
            logAdEvent('ad_show_success', { placement: 'ai_combo_rewarded', environment: adsConfig.environment })
            return
          }

          if (event.type === 'userEarnedReward') {
            transition('REWARD_EARNED')
            logAdEvent('ad_completed', { placement: 'ai_combo_rewarded', environment: adsConfig.environment })
            if (completedHandledRef.current) return
            completedHandledRef.current = true
            void Promise.resolve(onCompletedRef.current()).finally(() => {
              void load()
            })
            return
          }

          if (event.type === 'dismissed') {
            if (!completedHandledRef.current) {
              transition('CLOSED')
              logAdEvent('ad_closed', { placement: 'ai_combo_rewarded', environment: adsConfig.environment })
              void load()
            }
            return
          }

          if (event.type === 'failedToShow') {
            transition('LOAD_FAILED')
            setMessage('광고를 보여주지 못했어요. 기본 추천은 계속 이용할 수 있어요.')
            logAdEvent('ad_show_failed', { placement: 'ai_combo_rewarded', reason: 'failedToShow' })
            void load()
          }
        },
        onError: (error) => {
          transition('LOAD_FAILED')
          setMessage('광고를 보여주지 못했어요. 기본 추천은 계속 이용할 수 있어요.')
          logAdEvent('ad_show_failed', { placement: 'ai_combo_rewarded', reason: error.message })
          void load()
        },
      })
    } catch (error) {
      transition('LOAD_FAILED')
      setMessage('광고를 사용할 수 없는 환경이에요. 기본 추천은 계속 이용할 수 있어요.')
      logAdEvent('ad_show_failed', {
        placement: 'ai_combo_rewarded',
        reason: error instanceof Error ? error.message : 'unknown',
      })
      void load()
    }
  }, [enabled, load, transition])

  useEffect(() => {
    return () => {
      mountedRef.current = false
      cleanupLoadRef.current?.()
      cleanupShowRef.current?.()
    }
  }, [])

  return {
    enabled: enabled && isRewardedAdEnabled(),
    status,
    message,
    canShow: canShowRewardedAd(status),
    load,
    show,
  }
}
