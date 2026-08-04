import { useEffect, useMemo, useState } from 'react'
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

function budgetLabel(value: number) {
  if (value === 10000) return '1만원'
  return `${value / 1000}천원`
}

function retailerName(code: RetailerCode) {
  return retailers.find((retailer) => retailer.code === code)?.name ?? code
}

function purposeName(id: Purpose) {
  return purposes.find((purpose) => purpose.id === id)?.label ?? id
}

function promoLabel(type: PromotionType) {
  if (type === 'none') return '일반'
  if (type === 'new') return '신상품'
  if (type === 'sale') return '할인'
  return type
}

function latestCollectedAt(items: Product[]) {
  return items
    .map((item) => item.collectedAt)
    .filter(Boolean)
    .sort()
    .at(-1)
}

function dataStatusText(status: DataStatus, sourceProducts: Product[]) {
  if (status === 'loading') return '행사 불러오는 중'
  const latest = latestCollectedAt(sourceProducts)
  if (status === 'live') return latest ? `최신 행사 기준 · ${latest}` : '최신 행사 기준'
  return latest ? `기본 상품 기준 · ${latest}` : '기본 상품 기준'
}

function ComboCard({ combo, label }: { combo: ComboResult; label?: string }) {
  const retailer = retailers.find((item) => item.code === combo.retailer)

  return (
    <article className="combo-card" style={{ '--retailer-color': retailer?.color ?? '#18a058' } as React.CSSProperties}>
      <header>
        <div>
          <span className="retailer-badge">{retailerName(combo.retailer)}</span>
          <strong>{label ?? purposeName(combo.purpose)}</strong>
          <span>{formatWon(combo.budget)} 안에서 골랐어요</span>
        </div>
        <em>{formatWon(combo.leftover)} 남음</em>
      </header>

      <div className="summary-grid">
        <div>
          <span>결제금액</span>
          <strong>{formatWon(combo.paymentAmount)}</strong>
        </div>
        <div>
          <span>받는 상품</span>
          <strong>{combo.receivedQuantity}개</strong>
        </div>
        <div>
          <span>아낀 금액</span>
          <strong>{formatWon(combo.benefitAmount)}</strong>
        </div>
      </div>

      <ul className="item-list">
        {combo.items.map((item) => (
          <li key={item.id}>
            <div>
              <strong>{item.name}</strong>
              <span>
                {item.paymentQuantity}개 결제 · {item.receivedQuantity}개 받음 · 개당 {formatWon(item.effectiveUnitPrice)}
              </span>
            </div>
            <em>{item.promotionType === 'none' ? formatWon(item.paymentAmount) : `${promoLabel(item.promotionType)} ${formatWon(item.paymentAmount)}`}</em>
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
      <span>행사 정보는 매장 상황에 따라 달라질 수 있어요.</span>
    </div>
  )
}

function ProductCard({ product }: { product: Product }) {
  const item = toComboItem(product)
  const retailer = retailers.find((entry) => entry.code === product.retailer)

  return (
    <article className="product-card" style={{ '--retailer-color': retailer?.color ?? '#18a058' } as React.CSSProperties}>
      <header>
        <div>
          <span className="retailer-badge">{retailerName(product.retailer)}</span>
          <strong>{product.name}</strong>
          <span>{product.brand}</span>
        </div>
        <span className="promo-chip">{promoLabel(product.promotionType)}</span>
      </header>
      <dl>
        <div>
          <dt>판매가</dt>
          <dd>{formatWon(product.price)}</dd>
        </div>
        <div>
          <dt>받는 상품</dt>
          <dd>{item.receivedQuantity}개</dd>
        </div>
        <div>
          <dt>개당 가격</dt>
          <dd>{formatWon(item.effectiveUnitPrice)}</dd>
        </div>
        <div>
          <dt>아낀 금액</dt>
          <dd>{formatWon(item.benefitAmount)}</dd>
        </div>
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
  const [sort, setSort] = useState<SortType>('discount')
  const [liveProducts, setLiveProducts] = useState<Product[]>([])
  const [dataStatus, setDataStatus] = useState<DataStatus>('sample')

  const productSource = useMemo(() => {
    if (liveProducts.length === 0) return products
    const liveRetailers = new Set(liveProducts.map((product) => product.retailer))
    const fallbackProducts = products.filter((product) => !liveRetailers.has(product.retailer))
    return [...liveProducts, ...fallbackProducts]
  }, [liveProducts])

  const combos = useMemo(() => buildCombosFromProducts(productSource, retailer, budget, purpose, 8), [productSource, retailer, budget, purpose])
  const selectedCombo = combos[0]
  const crossRetailer = useMemo(() => buildCrossRetailerBestFromProducts(productSource, budget, purpose), [productSource, budget, purpose])
  const featuredCombo = useMemo(() => buildCombosFromProducts(productSource, retailer, 5000, 'value', 1)[0], [productSource, retailer])
  const statusText = dataStatusText(dataStatus, productSource)

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
        fetch(`${apiBaseUrl}/api/products?retailer=${item.code}&limit=120`)
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
    const normalizedQuery = query.trim().toLowerCase()
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
  }, [filter, promoRetailer, productSource, query, sort])

  function applyCustomBudget() {
    const nextBudget = Number(customBudget.replace(/[^0-9]/g, ''))
    if (nextBudget >= 1000) {
      setBudget(nextBudget)
      return nextBudget
    }
    return budget
  }

  function searchCombo() {
    applyCustomBudget()
    setComparisonUnlocked(false)
    setTab('result')
  }

  return (
    <main className="app-shell">
      <section className="phone">
        {tab === 'home' ? (
          <div className="screen">
            <header className="hero">
              <span className="data-pill">{statusText}</span>
              <p>오늘 행사상품 기준</p>
              <h1>예산에 맞는 조합을 찾아드릴게요</h1>
            </header>

            <section className="panel">
              <h2>어디에서 살까요?</h2>
              <div className="segmented four">
                {retailers.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    className={retailer === item.code ? 'active' : ''}
                    style={{ '--retailer-color': item.color } as React.CSSProperties}
                    onClick={() => setRetailer(item.code)}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            </section>

            <section className="panel">
              <h2>얼마까지 쓸까요?</h2>
              <div className="segmented budget">
                {quickBudgets.map((value) => (
                  <button key={value} type="button" className={budget === value ? 'active' : ''} onClick={() => setBudget(value)}>
                    {budgetLabel(value)}
                  </button>
                ))}
                <label>
                  <input value={customBudget} inputMode="numeric" placeholder="직접 입력" onChange={(event) => setCustomBudget(event.currentTarget.value)} onBlur={applyCustomBudget} />
                </label>
              </div>
            </section>

            <section className="panel">
              <h2>어떤 조합이 좋을까요?</h2>
              <div className="purpose-grid">
                {purposes.map((item) => (
                  <button key={item.id} type="button" className={purpose === item.id ? 'active' : ''} onClick={() => setPurpose(item.id)}>
                    {item.label}
                  </button>
                ))}
              </div>
              <button className="primary" type="button" onClick={searchCombo}>내 예산에 맞춰보기</button>
            </section>

            <section className="content-feed">
              <div className="section-row">
                <h2>바로 볼 수 있는 조합</h2>
                <span>{retailerName(retailer)}</span>
              </div>
              {featuredCombo ? <ComboCard combo={featuredCombo} label="5천원으로 맞춘 조합" /> : <div className="empty">지금 보여줄 조합을 준비하고 있어요.</div>}
              <NoticeSlot label="구매 전 한 번 더 확인해 주세요" />
              <div className="mini-list">
                <button type="button" onClick={() => { setFilter('1+1'); setTab('promos') }}>1+1 상품만 보기</button>
                <button type="button" onClick={() => { setSort('discount'); setTab('promos') }}>아낀 금액이 큰 상품 보기</button>
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
                <h1>{formatWon(budget)} 안에서 골랐어요</h1>
              </div>
            </header>

            {selectedCombo ? <ComboCard combo={selectedCombo} /> : <div className="empty">지금 조건에 맞는 조합을 찾지 못했어요.</div>}

            <div className="action-row">
              <button type="button" onClick={() => setTab('home')}>다시 고르기</button>
              <button type="button" onClick={() => setComparisonUnlocked(true)}>편의점별 비교</button>
            </div>

            <NoticeSlot label="결제 전 매장에서 행사 적용 여부를 확인해 주세요" />

            <section className="compare-box">
              <p>현재 선택한 편의점 기준으로 먼저 보여드렸어요.</p>
              <h2>다른 편의점 조합도 같이 비교해볼까요?</h2>
              <button type="button" onClick={() => setComparisonUnlocked(true)}>편의점별 비교하기</button>
            </section>

            {comparisonUnlocked ? (
              <section className="content-feed">
                <h2>편의점별 추천 조합</h2>
                {crossRetailer.map((combo) => (
                  <ComboCard key={combo.retailer} combo={combo} />
                ))}
              </section>
            ) : null}
          </div>
        ) : null}

        {tab === 'promos' ? (
          <div className="screen">
            <header className="sub-header">
              <div>
                <p>{statusText}</p>
                <h1>행사상품을 모아봤어요</h1>
              </div>
            </header>

            <section className="panel sticky-tools">
              <div className="segmented five">
                {[
                  ['all', '전체'],
                  ['1+1', '1+1'],
                  ['2+1', '2+1'],
                  ['sale', '할인'],
                  ['new', '신상품'],
                ].map(([value, label]) => (
                  <button key={value} type="button" className={filter === value ? 'active' : ''} onClick={() => setFilter(value as PromoFilter)}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="segmented four">
                <button type="button" className={promoRetailer === 'all' ? 'active' : ''} onClick={() => setPromoRetailer('all')}>전체</button>
                {retailers.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    className={promoRetailer === item.code ? 'active' : ''}
                    style={{ '--retailer-color': item.color } as React.CSSProperties}
                    onClick={() => setPromoRetailer(item.code)}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
              <input className="search" value={query} placeholder="찾는 상품이 있나요?" onChange={(event) => setQuery(event.currentTarget.value)} />
              <select value={sort} onChange={(event) => setSort(event.currentTarget.value as SortType)}>
                <option value="discount">아낀 금액 큰 순</option>
                <option value="price">개당 가격 낮은 순</option>
                <option value="new">최근 확인 순</option>
              </select>
            </section>

            <section className="product-list">
              {promoProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </section>

            <p className="fixed-notice">매장별 재고와 행사 적용 여부가 다를 수 있어요. 결제 전 매장에서 한 번 더 확인해 주세요. 본 서비스는 각 편의점의 공식 제휴 서비스가 아닙니다.</p>
          </div>
        ) : null}

        <nav className="bottom-tabs" aria-label="하단 탭">
          <button type="button" className={tab === 'home' ? 'active' : ''} onClick={() => setTab('home')}>홈</button>
          <button type="button" className={tab === 'result' ? 'active' : ''} onClick={() => setTab('result')}>결과</button>
          <button type="button" className={tab === 'promos' ? 'active' : ''} onClick={() => setTab('promos')}>행사상품</button>
        </nav>
      </section>
    </main>
  )
}

export default App
