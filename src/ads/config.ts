export const AD_STATUSES = ['IDLE', 'LOADING', 'READY', 'SHOWING', 'COMPLETED', 'CLOSED', 'FAILED'] as const

export type AdStatus = (typeof AD_STATUSES)[number]
export type AdEnvironment = 'local' | 'sandbox' | 'production'

type ImportMetaEnvLike = ImportMetaEnv & {
  ADS_ENABLED?: string
  AIT_BANNER_AD_GROUP_ID?: string
  AIT_REWARDED_AD_GROUP_ID?: string
  AIT_AD_ENV?: string
}

const env = import.meta.env as ImportMetaEnvLike
const TEST_BANNER_AD_GROUP_ID = 'ait-ad-test-banner-id'
const TEST_REWARDED_AD_GROUP_ID = 'ait-ad-test-rewarded-id'

function readFlag(value: string | undefined) {
  return value === 'true' || value === '1'
}

function readValue(...values: Array<string | undefined>) {
  return values.find((value) => value != null && value.trim() !== '')?.trim() ?? ''
}

function readAdEnvironment(): AdEnvironment {
  const value = readValue(env.VITE_AIT_AD_ENV, env.AIT_AD_ENV)
  if (value === 'sandbox' || value === 'production') return value
  return 'local'
}

function looksLikeAppsInTossRuntime() {
  if (typeof window === 'undefined') return false
  const userAgent = navigator.userAgent.toLowerCase()
  const bridgeWindow = window as Window & {
    ReactNativeWebView?: unknown
    webkit?: { messageHandlers?: Record<string, unknown> }
  }
  return userAgent.includes('toss') || bridgeWindow.ReactNativeWebView != null || bridgeWindow.webkit?.messageHandlers != null
}

function validateGroupId(id: string, environment: AdEnvironment) {
  if (!id) return ''
  const isTestId = id.startsWith('ait-ad-test-')
  if (environment === 'production' && isTestId) return ''
  if (environment === 'sandbox' && !isTestId) return ''
  return id
}

const adEnvironment = readAdEnvironment()
const rawBannerAdGroupId = adEnvironment === 'sandbox'
  ? TEST_BANNER_AD_GROUP_ID
  : readValue(env.VITE_AIT_BANNER_AD_GROUP_ID, env.AIT_BANNER_AD_GROUP_ID)
const rawRewardedAdGroupId = adEnvironment === 'sandbox'
  ? TEST_REWARDED_AD_GROUP_ID
  : readValue(env.VITE_AIT_REWARDED_AD_GROUP_ID, env.AIT_REWARDED_AD_GROUP_ID)

export const adsConfig = {
  enabled: readFlag(readValue(env.VITE_ADS_ENABLED, env.ADS_ENABLED)),
  environment: adEnvironment,
  bannerAdGroupId: validateGroupId(rawBannerAdGroupId, adEnvironment),
  rewardedAdGroupId: validateGroupId(rawRewardedAdGroupId, adEnvironment),
  isAppsInTossRuntime: looksLikeAppsInTossRuntime(),
}

export function isBannerAdEnabled() {
  return adsConfig.enabled && adsConfig.isAppsInTossRuntime && adsConfig.bannerAdGroupId.length > 0
}

export function isRewardedAdEnabled() {
  return adsConfig.enabled && adsConfig.isAppsInTossRuntime && adsConfig.rewardedAdGroupId.length > 0
}
