import { useMemo, useState } from 'react'
import { buildCombos, buildCrossRetailerBest, formatWon, toComboItem, type ComboResult } from './combo'
import { products, purposes, retailers, type Product, type PromotionType, type Purpose, type RetailerCode } from './data'
import './index.css'

type Tab = 'home' | 'result' | 'promos'
type PromoFilter = 'all' | PromotionType
type SortType = 'discount' | 'price' | 'new'

const quickBudgets = [5000, 7000, 10000]

function retailerName(code: RetailerCode) {
  return retailers.find((retailer) => retailer.code === code)?.name ?? code
}

function purposeName(id: Purpose) {
  return purposes.find((purpose) => purpose.id === id)?.label ?? id
}

function promoLabel(type: PromotionType) {
  return type === 'none' ? '일반' : type === 'new' ? '신상품' : type
}

function ComboCard({ combo, label }: { combo: ComboResult; label?: string }) {
  return (
    <article className="combo-card">
      <header>
        <div>
          <strong>{label ?? `${retailerName(combo.retailer)} · ${purposeName(combo.purpose)}`}</strong>
          <span>예산 {formatWon(combo.budget)} 이하</span>
        </div>
        <em>{formatWon(combo.leftover)} 남음</em>
      </header>

      <div className="summary-grid">
        <div>
          <span>결제금액</span>
          <strong>{formatWon(combo.paymentAmount)}</strong>
        </div>
        <div>
          <span>총 수량</span>
          <strong>{combo.receivedQuantity}개</strong>
        </div>
        <div>
          <span>혜택금액</span>
          <strong>{formatWon(combo.benefitAmount)}</strong>
        </div>
      </div>

      <ul className="item-list">
        {combo.items.map((item) => (
          <li key={item.id}>
            <div>
              <strong>{item.name}</strong>
              <span>
                {item.paymentQuantity}개 결제 · {item.receivedQuantity}개 획득 · 개당 {formatWon(item.effectiveUnitPrice)}
              </span>
            </div>
            <em>{item.promotionType === 'none' ? formatWon(item.paymentAmount) : `${item.promotionType} ${formatWon(item.paymentAmount)}`}</em>
          </li>
        ))}
      </ul>
    </article>
  )
}

function AdSlot({ label }: { label: string }) {
  return (
    <div className="ad-slot">
      <span>AD</span>
      <strong>{label}</strong>
    </div>
  )
}

function ProductCard({ product }: { product: Product }) {
  const item = toComboItem(product)

  return (
    <article className="product-card">
      <header>
        <div>
          <strong>{product.name}</strong>
          <span>{retailerName(product.retailer)} · {product.brand}</span>
        </div>
        <button type="button" aria-label={`${product.name} 찜하기`}>찜</button>
      </header>
      <dl>
        <div>
          <dt>판매가</dt>
          <dd>{formatWon(product.price)}</dd>
        </div>
        <div>
          <dt>행사</dt>
          <dd>{promoLabel(product.promotionType)}</dd>
        </div>
        <div>
          <dt>획득 수량</dt>
          <dd>{item.receivedQuantity}개</dd>
        </div>
        <div>
          <dt>실질가</dt>
          <dd>{formatWon(item.effectiveUnitPrice)}</dd>
        </div>
      </dl>
      <footer>
        <span>{product.startDate} ~ {product.endDate}</span>
        <span>갱신 {product.collectedAt}</span>
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
  const [rewardUnlocked, setRewardUnlocked] = useState(false)
  const [filter, setFilter] = useState<PromoFilter>('all')
  const [promoRetailer, setPromoRetailer] = useState<RetailerCode | 'all'>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortType>('discount')

  const combos = useMemo(() => buildCombos(retailer, budget, purpose, 8), [retailer, budget, purpose])
  const selectedCombo = combos[0]
  const crossRetailer = useMemo(() => buildCrossRetailerBest(budget, purpose), [budget, purpose])

  const promoProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return products
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
  }, [filter, promoRetailer, query, sort])

  function applyCustomBudget() {
    const nextBudget = Number(customBudget.replace(/[^0-9]/g, ''))
    if (nextBudget >= 1000) setBudget(nextBudget)
  }

  function searchCombo() {
    setRewardUnlocked(false)
    setTab('result')
  }

  return (
    <main className="app-shell">
      <section className="phone">
        {tab === 'home' ? (
          <div className="screen">
            <header className="hero">
              <p>로그인 없이 바로 쓰는</p>
              <h1>편의점 꿀조합을 찾아보세요</h1>
            </header>

            <section className="panel">
              <h2>편의점</h2>
              <div className="segmented four">
                {retailers.map((item) => (
                  <button key={item.code} type="button" className={retailer === item.code ? 'active' : ''} onClick={() => setRetailer(item.code)}>
                    {item.name}
                  </button>
                ))}
              </div>
            </section>

            <section className="panel">
              <h2>예산</h2>
              <div className="segmented budget">
                {quickBudgets.map((value) => (
                  <button key={value} type="button" className={budget === value ? 'active' : ''} onClick={() => setBudget(value)}>
                    {value / 1000}천원
                  </button>
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
                  <button key={item.id} type="button" className={purpose === item.id ? 'active' : ''} onClick={() => setPurpose(item.id)}>
                    {item.label}
                  </button>
                ))}
              </div>
              <button className="primary" type="button" onClick={searchCombo}>꿀조합 찾기</button>
            </section>

            <section className="content-feed">
              <h2>바로 보는 꿀정보</h2>
              <ComboCard combo={buildCombos('cu', 5000, 'value', 1)[0]} label="오늘의 5천원 조합" />
              <AdSlot label="오늘의 꿀조합 아래 배너" />
              <div className="mini-list">
                <button type="button" onClick={() => { setFilter('1+1'); setTab('promos') }}>이번 달 1+1 베스트</button>
                <button type="button" onClick={() => { setSort('discount'); setTab('promos') }}>편의점별 할인율 높은 상품</button>
                <button type="button" onClick={() => { setFilter('new'); setTab('promos') }}>새로 시작한 행사</button>
              </div>
            </section>
          </div>
        ) : null}

        {tab === 'result' ? (
          <div className="screen">
            <header className="sub-header">
              <div>
                <p>{retailerName(retailer)} · {purposeName(purpose)}</p>
                <h1>예산 {formatWon(budget)} 이하</h1>
              </div>
              <button type="button" onClick={() => setTab('home')}>수정</button>
            </header>

            {selectedCombo ? <ComboCard combo={selectedCombo} /> : <div className="empty">조건에 맞는 조합이 없습니다.</div>}

            <div className="action-row">
              <button type="button">이 조합 저장하기</button>
              <button type="button" onClick={() => setRewardUnlocked(true)}>다른 조합 보기</button>
            </div>

            <AdSlot label="조합 결과 상품 목록 아래 배너" />

            <section className="compare-box">
              <p>현재 {retailerName(retailer)} 조합은 무료로 확인했어요.</p>
              <h2>CU·GS25·세븐일레븐·이마트24까지 한 번에 비교할까요?</h2>
              <button type="button" onClick={() => setRewardUnlocked(true)}>광고 보고 4사 비교하기</button>
            </section>

            {rewardUnlocked ? (
              <section className="content-feed">
                <h2>4사 비교 결과</h2>
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
                <p>4사 행사상품</p>
                <h1>행사상품</h1>
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
                  <button key={item.code} type="button" className={promoRetailer === item.code ? 'active' : ''} onClick={() => setPromoRetailer(item.code)}>
                    {item.name}
                  </button>
                ))}
              </div>
              <input className="search" value={query} placeholder="상품명을 입력하세요" onChange={(event) => setQuery(event.currentTarget.value)} />
              <select value={sort} onChange={(event) => setSort(event.currentTarget.value as SortType)}>
                <option value="discount">할인율 높은 순</option>
                <option value="price">가격 낮은 순</option>
                <option value="new">최신 행사 순</option>
              </select>
            </section>

            <section className="product-list">
              {promoProducts.map((product, index) => (
                <div key={product.id}>
                  {index === 8 ? <AdSlot label="행사상품 목록 중간 배너" /> : null}
                  <ProductCard product={product} />
                </div>
              ))}
            </section>

            <p className="fixed-notice">매장별 재고와 행사 적용 여부가 다를 수 있어요. 구매 전 매장에서 확인해 주세요.</p>
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
