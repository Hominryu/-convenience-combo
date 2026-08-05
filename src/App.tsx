import { useEffect, useMemo, useRef, useState } from 'react'
import { ResultBannerAd } from './ads/ResultBannerAd'
import { isRewardedAdEnabled } from './ads/config'
import { useRewardedAd } from './ads/useRewardedAd'
import { requestAiCombo, type AiCombo, type AiComboItem } from './aiCombo'
import { buildCombosFromProducts, buildCrossRetailerBestFromProducts, formatWon, toComboItem, type ComboResult } from './combo'
import { products, purposes, retailers, type Product, type PromotionType, type Purpose, type RetailerCode } from './data'
import './index.css'

type Tab = 'home' | 'result' | 'promos'
type PromoFilter = 'all' | PromotionType
type SortType = 'discount' | 'price' | 'new'
type DataStatus = 'sample' | 'live' | 'loading'

type ApiProduct = {
  id: string
  retailer: RetailerCode
  retailerName?: string
  name: string
  price: number
  category: Product['category']
  tags: Purpose[]
  promotionType: Product['promotionType']
  purchaseQuantity: number
  rewardQuantity: number
  discountPrice?: number | null
  startDate?: string
  endDate?: string
  collectedAt?: string
}

const quickBudgets = [5000, 7000, 10000]

function todayKey() {
  const date = new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function userKey() {
  return localStorage.getItem('combo_user_key') ?? 'anonymous'
}

function freeSearchKey() {
  return `combo_ai_free_${userKey()}_${todayKey()}`
}

function hasFreeAiSearch() {
  return localStorage.getItem(freeSearchKey()) !== 'used'
}

function markFreeAiSearchUsed() {
  localStorage.setItem(freeSearchKey(), 'used')
}

function budgetLabel(value: number) {
  if (value === 10000) return '1만원'
  return `${value / 1000}천원`
}

function retailerName(code: RetailerCode | string) {
  return retailers.find((retailer) => retailer.code === code)?.name ?? String(code).toUpperCase()
}

function retailerColor(code: RetailerCode | string) {
  return retailers.find((retailer) => retailer.code === code)?.color ?? '#18a058'
}

function purposeName(id: Purpose) {
  return purposes.find((purpose) => purpose.id === id)?.label ?? id
}

function promoLabel(type: PromotionType | string) {
  const normalized = String(type).toUpperCase()
  if (type === 'none' || normalized === 'NONE') return '일반'
  if (type === 'new' || normalized === 'NEW') return '신상품'
  if (type === 'sale' || normalized === 'SALE') return '할인'
  if (normalized === 'ONE_PLUS_ONE') return '1+1'
  if (normalized === 'TWO_PLUS_ONE') return '2+1'
  if (normalized === 'THREE_PLUS_ONE') return '3+1'
  return String(type)
}

function latestCollectedAt(items: Product[]) {
  return items
    .map((item) => item.collectedAt)
    .filter(Boolean)
    .sort()
    .at(-1)
}

function dataStatusText(status: DataStatus, sourceProducts: Product[]) {
  if (status === 'loading') return '상품 정보를 불러오는 중'
  const latest = latestCollectedAt(sourceProducts)
  if (status === 'live') return latest ? `최신 데이터 기준 · ${latest}` : '최신 데이터 기준'
  return latest ? `샘플 데이터 기준 · ${latest}` : '샘플 데이터 기준'
}

function ComboCard({ combo, label }: { combo: ComboResult; label?: string }) {
  return (
    <article className="combo-card" style={{ '--retailer-color': retailerColor(combo.retailer) } as React.CSSProperties}>
      <header>
        <div>
          <span className="retailer-badge">{retailerName(combo.retailer)}</span>
          <strong>{label ?? purposeName(combo.purpose)}</strong>
          <span>{formatWon(combo.budget)} 이하 조합</span>
        </div>
        <em>{formatWon(combo.leftover)} 남음</em>
      </header>

      <div className="summary-grid">
        <div><span>결제금액</span><strong>{formatWon(combo.paymentAmount)}</strong></div>
        <div><span>예산 사용률</span><strong>{Math.round((combo.paymentAmount / combo.budget) * 100)}%</strong></div>
        <div><span>받는 상품</span><strong>{combo.receivedQuantity}개</strong></div>
        <div><span>혜택금액</span><strong>{formatWon(combo.benefitAmount)}</strong></div>
      </div>

      <ul className="item-list">
        {combo.items.map((item) => (
          <li key={item.id}>
            <div>
              <strong>{item.name}</strong>
              <span>{item.paymentQuantity}개 결제 · {item.receivedQuantity}개 수령 · 개당 {formatWon(item.effectiveUnitPrice)}</span>
            </div>
            <em>{item.promotionType === 'none' ? formatWon(item.paymentAmount) : `${promoLabel(item.promotionType)} ${formatWon(item.paymentAmount)}`}</em>
          </li>
        ))}
      </ul>
    </article>
  )
}

function AiComboCard({ combo }: { combo: AiCombo }) {
  return (
    <article className="combo-card" style={{ '--retailer-color': retailerColor(combo.retailer) } as React.CSSProperties}>
      <header>
        <div>
          <span className="retailer-badge">{retailerName(combo.retailer)}</span>
          <strong>{combo.title}</strong>
          <span>{combo.reason}</span>
        </div>
        <em>{formatWon(combo.leftover)} 남음</em>
      </header>

      <div className="summary-grid">
        <div><span>최종 결제</span><strong>{formatWon(combo.paymentAmount)}</strong></div>
        <div><span>받는 수량</span><strong>{combo.receivedQuantity}개</strong></div>
        <div><span>혜택금액</span><strong>{formatWon(combo.benefitAmount)}</strong></div>
        <div><span>데이터</span><strong>{combo.lastSeenAt ? combo.lastSeenAt.slice(5, 16).replace('T', ' ') : '확인 중'}</strong></div>
      </div>

      <ul className="item-list">
        {combo.items.map((item: AiComboItem) => (
          <li key={item.id}>
            <div>
              <strong>{item.name}</strong>
              <span>{promoLabel(item.promotionType)} · {item.receivedQuantity}개 수령 · 개당 {formatWon(item.effectiveUnitPrice)}</span>
            </div>
            <em>{formatWon(item.paymentAmount)}</em>
          </li>
        ))}
      </ul>
    </article>
  )
}

function NoticeSlot({ label }: { label: string }) {
  return (
    <div className="notice-slot">
      <strong>{label}</strong>
      <span>매장별 재고와 행사 적용 여부가 다를 수 있어요. 구매 전 매장에서 한 번 더 확인해 주세요.</span>
    </div>
  )
}

function ProductCard({ product }: { product: Product }) {
  const item = toComboItem(product)

  return (
    <article className="product-card" style={{ '--retailer-color': retailerColor(product.retailer) } as React.CSSProperties}>
      <header>
        <div>
          <span className="retailer-badge">{retailerName(product.retailer)}</span>
          <strong>{product.name}</strong>
          <span>{product.brand}</span>
        </div>
        <span className="promo-chip">{promoLabel(product.promotionType)}</span>
      </header>
      <dl>
        <div><dt>판매가</dt><dd>{formatWon(product.price)}</dd></div>
        <div><dt>받는 상품</dt><dd>{item.receivedQuantity}개</dd></div>
        <div><dt>개당 가격</dt><dd>{formatWon(item.effectiveUnitPrice)}</dd></div>
        <div><dt>혜택금액</dt><dd>{formatWon(item.benefitAmount)}</dd></div>
      </dl>
      <footer>
        <span>{product.startDate} ~ {product.endDate}</span>
        <span>{product.collectedAt} 확인</span>
      </footer>
    </article>
  )
}

function App() {
  const [tab, setTab] = useState<Tab>('home')
  const [retailer, setRetailer] = useState<RetailerCode>('gs25')
  const [budget, setBudget] = useState(7000)
  const [customBudget, setCustomBudget] = useState('')
  const [purpose, setPurpose] = useState<Purpose>('meal')
  const [comparisonUnlocked, setComparisonUnlocked] = useState(false)
  const [filter, setFilter] = useState<PromoFilter>('all')
  const [promoRetailer, setPromoRetailer] = useState<RetailerCode | 'all'>('all')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [sort, setSort] = useState<SortType>('discount')
  const [liveProducts, setLiveProducts] = useState<Product[]>([])
  const [dataStatus, setDataStatus] = useState<DataStatus>('sample')
  const [aiCombos, setAiCombos] = useState<AiCombo[]>([])
  const [aiComboLoading, setAiComboLoading] = useState(false)
  const [aiComboError, setAiComboError] = useState('')
  const [lastAiRequestFailedAfterAd, setLastAiRequestFailedAfterAd] = useState(false)
  const promoSearchRef = useRef<HTMLElement | null>(null)
  const aiRequestIdRef = useRef(0)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 250)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (tab !== 'promos') {
      setShowScrollTop(false)
      return undefined
    }
    const updateVisibility = () => setShowScrollTop(window.scrollY > 560)
    updateVisibility()
    window.addEventListener('scroll', updateVisibility, { passive: true })
    return () => window.removeEventListener('scroll', updateVisibility)
  }, [tab])

  const productSource = useMemo(() => {
    if (liveProducts.length === 0) return products
    const liveRetailers = new Set(liveProducts.map((product) => product.retailer))
    const fallbackProducts = products.filter((product) => !liveRetailers.has(product.retailer))
    return [...liveProducts, ...fallbackProducts]
  }, [liveProducts])

  const fallbackCombos = useMemo(() => buildCombosFromProducts(productSource, retailer, budget, purpose, 8), [productSource, retailer, budget, purpose])
  const crossRetailer = useMemo(() => buildCrossRetailerBestFromProducts(productSource, budget, purpose), [productSource, budget, purpose])
  const featuredCombo = useMemo(() => buildCombosFromProducts(productSource, retailer, 5000, 'value', 1)[0], [productSource, retailer])
  const statusText = dataStatusText(dataStatus, productSource)
  const rewardedAdsEnabled = isRewardedAdEnabled()

  async function runAiCombo(nextBudget: number, options?: { consumeFree?: boolean; excludeProductIds?: string[]; afterAd?: boolean }) {
    const requestId = aiRequestIdRef.current + 1
    aiRequestIdRef.current = requestId
    setAiComboLoading(true)
    setAiComboError('')

    try {
      const nextCombos = await requestAiCombo({ retailer, budget: nextBudget, purpose, excludeProductIds: options?.excludeProductIds ?? [] })
      if (aiRequestIdRef.current !== requestId) return false
      setAiCombos(nextCombos)
      setLastAiRequestFailedAfterAd(false)
      if (options?.consumeFree) markFreeAiSearchUsed()
      return true
    } catch {
      if (aiRequestIdRef.current !== requestId) return false
      setAiComboError(options?.afterAd ? 'AI 조합을 불러오지 못했어요. 광고는 완료됐으니 다시 시도할 수 있어요.' : 'AI 조합을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')
      if (options?.afterAd) setLastAiRequestFailedAfterAd(true)
      return false
    } finally {
      if (aiRequestIdRef.current === requestId) setAiComboLoading(false)
    }
  }

  const rewardedAd = useRewardedAd({
    enabled: tab === 'result',
    onCompleted: async () => {
      if (aiComboLoading) return
      const excludeProductIds = aiCombos.flatMap((combo) => combo.items.map((item) => item.id))
      await runAiCombo(budget, { excludeProductIds, afterAd: true })
    },
  })

  useEffect(() => {
    let cancelled = false
    import('@apps-in-toss/web-framework')
      .then(({ User }) => {
        if (cancelled || !User.getAnonymousKey.isSupported()) return
        User.getAnonymousKey()
          .then((result) => localStorage.setItem('combo_user_key', result.hash))
          .catch(() => undefined)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let unsubscribeBack: (() => void) | undefined
    let unsubscribeHome: (() => void) | undefined
    let cancelled = false

    import('@apps-in-toss/web-framework')
      .then(({ closeView, graniteEvent }) => {
        if (cancelled) return
        unsubscribeBack = graniteEvent.addEventListener('backEvent', {
          onEvent: () => {
            if (tab === 'home') {
              closeView().catch(() => undefined)
              return
            }
            setTab('home')
          },
          onError: () => undefined,
        })
        unsubscribeHome = graniteEvent.addEventListener('homeEvent', {
          onEvent: () => setTab('home'),
          onError: () => undefined,
        })
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
      unsubscribeBack?.()
      unsubscribeHome?.()
    }
  }, [tab])

  useEffect(() => {
    const apiBaseUrl = import.meta.env.VITE_COMBO_API_BASE_URL?.replace(/\/$/, '')
    if (!apiBaseUrl) return

    let cancelled = false
    setDataStatus('loading')
    Promise.all(
      retailers.map((item) =>
        fetch(`${apiBaseUrl}/api/products?retailer=${item.code}&limit=1200`)
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`${item.code} products api failed`))))
          .then((data: { products?: ApiProduct[] }) => data.products ?? []),
      ),
    )
      .then((groups) => {
        if (cancelled) return
        const mapped = groups
          .flat()
          .filter((item) => item.retailer && item.name && item.price)
          .map((item): Product => ({
            id: item.id,
            retailer: item.retailer,
            brand: item.retailerName ?? retailerName(item.retailer),
            name: item.name,
            price: item.price,
            category: item.category,
            promotionType: item.promotionType,
            purchaseQuantity: item.purchaseQuantity,
            rewardQuantity: item.rewardQuantity,
            discountPrice: item.discountPrice ?? undefined,
            tags: item.tags,
            startDate: item.startDate ?? '2026-08-01',
            endDate: item.endDate ?? '2026-08-31',
            collectedAt: item.collectedAt ? item.collectedAt.slice(0, 16).replace('T', ' ') : '갱신 대기',
            isNew: item.promotionType === 'new',
          }))
        setLiveProducts(mapped)
        setDataStatus(mapped.length > 0 ? 'live' : 'sample')
      })
      .catch(() => setDataStatus('sample'))

    return () => {
      cancelled = true
    }
  }, [])

  const promoProducts = useMemo(() => {
    const normalizedQuery = debouncedQuery.trim().toLowerCase()
    return productSource
      .filter((product) => promoRetailer === 'all' || product.retailer === promoRetailer)
      .filter((product) => filter === 'all' || (filter === 'new' ? product.isNew : product.promotionType === filter))
      .filter((product) => !normalizedQuery || product.name.toLowerCase().includes(normalizedQuery) || product.brand.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => {
        const itemA = toComboItem(a)
        const itemB = toComboItem(b)
        if (sort === 'price') return itemA.effectiveUnitPrice - itemB.effectiveUnitPrice
        if (sort === 'new') return b.collectedAt.localeCompare(a.collectedAt)
        return itemB.benefitAmount - itemA.benefitAmount
      })
  }, [debouncedQuery, filter, promoRetailer, productSource, sort])

  function applyCustomBudget() {
    const nextBudget = Number(customBudget.replace(/[^0-9]/g, ''))
    if (nextBudget >= 1000) {
      setBudget(nextBudget)
      return nextBudget
    }
    return budget
  }

  function searchCombo() {
    const nextBudget = applyCustomBudget()
    setComparisonUnlocked(false)
    setAiCombos([])
    setAiComboError('')
    setLastAiRequestFailedAfterAd(false)
    setTab('result')

    if (!hasFreeAiSearch()) {
      setAiComboError(rewardedAdsEnabled ? '오늘 무료 AI 조합은 사용했어요. 광고를 보면 다른 조합을 받을 수 있어요.' : '오늘 무료 AI 조합은 사용했어요. 광고 준비가 끝나면 다시 추천을 받을 수 있어요.')
      return
    }

    void runAiCombo(nextBudget, { consumeFree: true })
  }

  async function handleRewardedAiCombo() {
    if (lastAiRequestFailedAfterAd) {
      const excludeProductIds = aiCombos.flatMap((combo) => combo.items.map((item) => item.id))
      await runAiCombo(budget, { excludeProductIds, afterAd: true })
      return
    }
    await rewardedAd.show()
  }

  useEffect(() => {
    if (tab !== 'result' || !rewardedAd.enabled || rewardedAd.status !== 'IDLE') return
    void rewardedAd.load()
  }, [rewardedAd, tab])

  return (
    <main className="app-shell">
      <section className="phone">
        {tab === 'home' ? (
          <div className="screen">
            <header className="hero">
              <span className="data-pill">{statusText}</span>
              <p>실제 판매 상품 기준</p>
              <h1>예산에 맞는 편의점 꿀조합을 찾아드릴게요</h1>
            </header>

            <section className="panel">
              <h2>어디에서 살까요?</h2>
              <div className="segmented four">
                {retailers.map((item) => (
                  <button key={item.code} type="button" className={retailer === item.code ? 'active' : ''} style={{ '--retailer-color': item.color } as React.CSSProperties} onClick={() => setRetailer(item.code)}>
                    {item.name}
                  </button>
                ))}
              </div>
            </section>

            <section className="panel">
              <h2>얼마까지 맞출까요?</h2>
              <div className="segmented budget">
                {quickBudgets.map((value) => (
                  <button key={value} type="button" className={budget === value ? 'active' : ''} onClick={() => setBudget(value)}>{budgetLabel(value)}</button>
                ))}
                <label>
                  <input value={customBudget} inputMode="numeric" placeholder="직접 입력" onChange={(event) => setCustomBudget(event.currentTarget.value)} onBlur={applyCustomBudget} />
                </label>
              </div>
            </section>

            <section className="panel">
              <h2>어떤 조합을 찾으세요?</h2>
              <div className="purpose-grid">
                {purposes.map((item) => (
                  <button key={item.id} type="button" className={purpose === item.id ? 'active' : ''} onClick={() => setPurpose(item.id)}>{item.label}</button>
                ))}
              </div>
              <button className="primary" type="button" onClick={searchCombo}>AI로 내 꿀조합 찾기</button>
            </section>

            <section className="content-feed">
              <div className="section-row"><h2>바로 볼 수 있는 조합</h2><span>{retailerName(retailer)}</span></div>
              {featuredCombo ? <ComboCard combo={featuredCombo} label="5천원으로 맞춘 조합" /> : <div className="empty">보여줄 조합을 준비하고 있어요.</div>}
              <NoticeSlot label="구매 전 한 번 더 확인해 주세요" />
              <div className="mini-list">
                <button type="button" onClick={() => { setFilter('1+1'); setTab('promos') }}>1+1 상품만 보기</button>
                <button type="button" onClick={() => { setSort('discount'); setTab('promos') }}>혜택금액 높은 상품 보기</button>
                <button type="button" onClick={() => { setFilter('new'); setTab('promos') }}>새로 확인된 상품 보기</button>
              </div>
            </section>
          </div>
        ) : null}

        {tab === 'result' ? (
          <div className="screen">
            <header className="sub-header">
              <div>
                <p>{retailerName(retailer)} · {purposeName(purpose)}</p>
                <h1>{formatWon(budget)} 이하로 골라볼게요</h1>
              </div>
            </header>

            {aiComboLoading && aiCombos.length === 0 ? <div className="empty">실제 판매 상품 중 새로운 조합을 AI가 찾아드려요.</div> : null}
            {aiCombos.length > 0 ? aiCombos.map((combo) => <AiComboCard key={`${combo.title}-${combo.items.map((item) => item.id).join('-')}`} combo={combo} />) : null}
            {!aiComboLoading && aiCombos.length === 0 && aiComboError ? <div className="empty">{aiComboError}</div> : null}
            {!aiComboLoading && aiCombos.length === 0 && !aiComboError && fallbackCombos[0] ? <ComboCard combo={fallbackCombos[0]} label="서버 대체 조합" /> : null}

            <div className="action-row">
              <button type="button" onClick={() => setTab('home')}>다시 고르기</button>
              <button type="button" onClick={() => setComparisonUnlocked(true)}>편의점별 비교</button>
            </div>

            <NoticeSlot label="결제 전 매장에서 확인해 주세요" />

            <section className="compare-box">
              <p>현재 선택한 편의점 기준으로 먼저 보여드렸어요.</p>
              <h2>다른 편의점 조합도 같이 비교해볼까요?</h2>
              <button type="button" onClick={() => setComparisonUnlocked(true)}>편의점별 비교하기</button>
            </section>

            <section className="reward-box">
              <div>
                <p>AI 재추천</p>
                <h2>실제 판매 상품 중 새로운 조합을 AI가 찾아드려요</h2>
              </div>
              <button type="button" disabled={aiComboLoading || (!lastAiRequestFailedAfterAd && !rewardedAd.canShow)} onClick={handleRewardedAiCombo}>
                {lastAiRequestFailedAfterAd ? 'AI 조합 다시 불러오기' : rewardedAd.status === 'READY' ? '광고 보고 다른 AI 조합 받기' : '광고를 준비하고 있어요'}
              </button>
              {!rewardedAdsEnabled ? <span className="reward-status">운영 광고 ID가 설정되면 다른 AI 조합을 받을 수 있어요.</span> : null}
              {rewardedAd.message ? <span className="reward-status">{rewardedAd.message}</span> : null}
              {aiComboLoading ? <span className="reward-status">AI가 조합을 고르고 있어요.</span> : null}
              {aiComboError ? <span className="reward-status error">{aiComboError}</span> : null}
            </section>

            {comparisonUnlocked ? (
              <section className="content-feed">
                <h2>편의점별 추천 조합</h2>
                {crossRetailer.map((combo) => <ComboCard key={combo.retailer} combo={combo} />)}
              </section>
            ) : null}

            <ResultBannerAd />
          </div>
        ) : null}

        {tab === 'promos' ? (
          <div className="screen">
            <header className="sub-header"><div><p>{statusText}</p><h1>상품을 모아봤어요</h1></div></header>
            <section ref={promoSearchRef} className="promo-search" aria-label="상품 검색과 필터">
              <div className="search-row">
                <label className="search-field"><span className="sr-only">상품 검색</span><input className="search" value={query} placeholder="상품명 검색" onChange={(event) => setQuery(event.currentTarget.value)} /></label>
                {query ? <button className="search-clear" type="button" onClick={() => setQuery('')} aria-label="검색어 초기화">초기화</button> : null}
              </div>
              <div className="filter-chips" aria-label="편의점 필터">
                <button type="button" className={promoRetailer === 'all' ? 'active' : ''} onClick={() => setPromoRetailer('all')}>전체</button>
                {retailers.map((item) => <button key={item.code} type="button" className={promoRetailer === item.code ? 'active' : ''} style={{ '--retailer-color': item.color } as React.CSSProperties} onClick={() => setPromoRetailer(item.code)}>{item.name}</button>)}
              </div>
              <div className="filter-chips" aria-label="행사 필터">
                {([['all', '전체'], ['none', '일반'], ['1+1', '1+1'], ['2+1', '2+1'], ['sale', '할인'], ['new', '신상품']] as Array<[PromoFilter, string]>).map(([value, label]) => (
                  <button key={value} type="button" className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>
                ))}
              </div>
              <div className="result-controls">
                <strong aria-live="polite">총 {promoProducts.length}개</strong>
                <select aria-label="정렬 방식" value={sort} onChange={(event) => setSort(event.currentTarget.value as SortType)}>
                  <option value="discount">혜택순</option>
                  <option value="price">낮은 가격순</option>
                  <option value="new">최근 확인순</option>
                </select>
              </div>
            </section>
            <section className="product-list">{promoProducts.map((product) => <ProductCard key={product.id} product={product} />)}</section>
            <p className="flow-notice">매장별 재고와 행사 적용 여부가 다를 수 있어요. 결제 전 매장에서 한 번 더 확인해 주세요.</p>
            <ResultBannerAd />
            {showScrollTop ? <button className="scroll-top" type="button" aria-label="상품 검색 영역으로 이동" onClick={() => promoSearchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>맨 위로</button> : null}
          </div>
        ) : null}

        <nav className="bottom-tabs" aria-label="하단 탭">
          <button type="button" className={tab === 'home' ? 'active' : ''} onClick={() => setTab('home')}>홈</button>
          <button type="button" className={tab === 'result' ? 'active' : ''} onClick={() => setTab('result')}>결과</button>
          <button type="button" className={tab === 'promos' ? 'active' : ''} onClick={() => setTab('promos')}>상품</button>
        </nav>
      </section>
    </main>
  )
}

export default App

