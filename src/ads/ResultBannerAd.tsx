import { useEffect, useRef, useState } from 'react'
import { adsConfig, isBannerAdEnabled } from './config'
import { logAdEvent } from './logger'

let initializePromise: Promise<boolean> | null = null

async function initializeBannerSdk() {
  if (initializePromise) return initializePromise

  initializePromise = import('@apps-in-toss/web-framework')
    .then(({ TossAds }) => {
      if (!TossAds.initialize.isSupported() || !TossAds.attachBanner.isSupported()) return false

      return new Promise<boolean>((resolve) => {
        TossAds.initialize({
          callbacks: {
            onInitialized: () => resolve(true),
            onInitializationFailed: () => resolve(false),
          },
        })
      })
    })
    .catch(() => false)

  return initializePromise
}

export function ResultBannerAd() {
  const targetRef = useRef<HTMLDivElement | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!isBannerAdEnabled()) return undefined

    let cancelled = false

    async function attach() {
      const target = targetRef.current
      if (!target) return

      logAdEvent('ad_load_requested', { placement: 'result_bottom_banner', environment: adsConfig.environment })

      const initialized = await initializeBannerSdk()
      if (!initialized || cancelled) {
        logAdEvent('ad_load_failed', { placement: 'result_bottom_banner', reason: 'initialize_failed' })
        return
      }

      try {
        const { TossAds } = await import('@apps-in-toss/web-framework')
        const result = TossAds.attachBanner(adsConfig.bannerAdGroupId, target, {
          theme: 'light',
          tone: 'grey',
          variant: 'expanded',
          callbacks: {
            onAdRendered: () => {
              if (cancelled) return
              setVisible(true)
              logAdEvent('ad_load_success', { placement: 'result_bottom_banner', environment: adsConfig.environment })
            },
            onNoFill: () => {
              if (cancelled) return
              setVisible(false)
              logAdEvent('ad_load_failed', { placement: 'result_bottom_banner', reason: 'no_fill' })
            },
            onAdFailedToRender: (payload) => {
              if (cancelled) return
              setVisible(false)
              logAdEvent('ad_load_failed', {
                placement: 'result_bottom_banner',
                reason: payload.error.message,
              })
            },
          },
        })
        cleanupRef.current = result.destroy
      } catch (error) {
        setVisible(false)
        logAdEvent('ad_load_failed', {
          placement: 'result_bottom_banner',
          reason: error instanceof Error ? error.message : 'unknown',
        })
      }
    }

    void attach()

    return () => {
      cancelled = true
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [])

  if (!isBannerAdEnabled()) return null

  return (
    <aside className={visible ? 'result-banner-ad is-visible' : 'result-banner-ad'} aria-label="광고">
      <div ref={targetRef} className="result-banner-ad__slot" />
    </aside>
  )
}
