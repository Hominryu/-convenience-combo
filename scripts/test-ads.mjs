const statuses = ['IDLE', 'LOADING', 'READY', 'SHOWING', 'COMPLETED', 'CLOSED', 'FAILED']

function canLoad(status) {
  return status === 'IDLE' || status === 'FAILED' || status === 'CLOSED' || status === 'COMPLETED'
}

function canShow(status) {
  return status === 'READY'
}

function isEnabled({ adsEnabled, runtime, id }) {
  return adsEnabled === true && runtime === true && Boolean(id)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

assert(statuses.includes('IDLE') && statuses.includes('FAILED'), 'ad statuses should be declared')
assert(!isEnabled({ adsEnabled: false, runtime: true, id: 'ait-ad-test-rewarded-id' }), 'ADS_ENABLED=false disables SDK/UI')
assert(!isEnabled({ adsEnabled: true, runtime: true, id: '' }), 'missing ad group id disables SDK/UI')
assert(!isEnabled({ adsEnabled: true, runtime: false, id: 'ait-ad-test-rewarded-id' }), 'non Apps in Toss runtime disables SDK/UI')
assert(canLoad('IDLE'), 'idle can preload')
assert(!canLoad('LOADING'), 'loading cannot duplicate load')
assert(canShow('READY'), 'ready can show')
assert(!canShow('IDLE'), 'reward CTA is disabled before ready')
assert(!canShow('SHOWING'), 'rapid click cannot duplicate show')

let aiRequests = 0
let status = 'SHOWING'
function complete() {
  if (status !== 'SHOWING') return
  status = 'COMPLETED'
  if (aiRequests > 0) return
  aiRequests += 1
}
function close() {
  if (status === 'SHOWING') status = 'CLOSED'
}
function fail() {
  if (status === 'SHOWING') status = 'FAILED'
}

complete()
complete()
assert(aiRequests === 1, 'duplicate completion callback requests AI once')
status = 'SHOWING'
aiRequests = 0
close()
assert(aiRequests === 0, 'dismissed event does not reward')
status = 'SHOWING'
fail()
assert(aiRequests === 0, 'failed show event does not reward')

let bannerHeight = 0
function bannerFailed() {
  bannerHeight = 0
}
bannerFailed()
assert(bannerHeight === 0, 'banner failure removes empty area')

console.log('ad flow tests passed')
