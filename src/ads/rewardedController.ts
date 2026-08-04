import type { AdStatus } from './config'

type Transition =
  | { type: 'LOAD_REQUESTED' }
  | { type: 'LOAD_SUCCESS' }
  | { type: 'LOAD_FAILED' }
  | { type: 'SHOW_REQUESTED' }
  | { type: 'REWARD_EARNED' }
  | { type: 'CLOSED' }
  | { type: 'RESET' }

export function canLoadRewardedAd(status: AdStatus) {
  return status === 'IDLE' || status === 'FAILED' || status === 'CLOSED' || status === 'COMPLETED'
}

export function canShowRewardedAd(status: AdStatus) {
  return status === 'READY'
}

export function reduceRewardedStatus(status: AdStatus, transition: Transition): AdStatus {
  switch (transition.type) {
    case 'LOAD_REQUESTED':
      return canLoadRewardedAd(status) ? 'LOADING' : status
    case 'LOAD_SUCCESS':
      return status === 'LOADING' ? 'READY' : status
    case 'LOAD_FAILED':
      return status === 'LOADING' || status === 'SHOWING' ? 'FAILED' : status
    case 'SHOW_REQUESTED':
      return canShowRewardedAd(status) ? 'SHOWING' : status
    case 'REWARD_EARNED':
      return status === 'SHOWING' ? 'COMPLETED' : status
    case 'CLOSED':
      return status === 'SHOWING' ? 'CLOSED' : status
    case 'RESET':
      return 'IDLE'
  }
}
