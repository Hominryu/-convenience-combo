# 편의점꿀조합

Apps in Toss용 React WebView 미니앱입니다.

## 첫 출시 범위

- 하단 탭 3개: 홈, 결과, 행사상품
- 로그인 전 사용: 행사상품 조회, 편의점 한 곳 꿀조합 추천
- 광고 확장 지점: 다른 조합 보기, 편의점별 비교, 다시 뽑기, 월간 TOP 상품
- 로그인 확장 지점: 찜, 이전 조합, 행사 알림
- 제외: 매장별 재고, 지도, 리뷰, 커뮤니티, 술, 담배, 복잡한 구독제

## 로컬에서 상품이 적게 보일 때

`VITE_COMBO_API_BASE_URL`이 없으면 앱은 샘플 상품만 보여줍니다.

실제 Supabase/Vercel 데이터를 보려면 `.env.local`에 아래 값을 넣고 dev 서버를 다시 켜세요.

```bash
VITE_COMBO_API_BASE_URL=https://convenience-combo.vercel.app
```

배포 환경에서는 Vercel 프로젝트의 Environment Variables에 같은 값을 넣어야 합니다.

## 데이터 수집

수집 API는 Vercel Functions에서 실행됩니다.

```bash
GET /api/sync-promotions
GET /api/sync-promotions?retailer=cu
GET /api/sync-promotions?retailer=gs25
GET /api/sync-promotions?retailer=seven
GET /api/sync-promotions?retailer=emart24
```

`SYNC_SECRET`을 설정했다면 아래처럼 호출합니다.

```bash
GET /api/sync-promotions?secret=YOUR_SYNC_SECRET
```

## 상품 조회

프론트는 편의점별로 나눠서 상품을 가져옵니다.

```bash
GET /api/products?retailer=cu&limit=120
GET /api/products?retailer=gs25&limit=120
GET /api/products?retailer=seven&limit=120
GET /api/products?retailer=emart24&limit=120
```

이렇게 해야 CU처럼 상품 수가 많은 편의점이 전체 목록을 독점해서 다른 편의점 상품이 안 보이는 문제를 줄일 수 있습니다.

## 계산 방식

- 일반: 1개 결제 -> 1개 획득
- 1+1: 1개 결제 -> 2개 획득
- 2+1: 2개 결제 -> 3개 획득
- 3+1: 3개 결제 -> 4개 획득

앱은 결제금액, 실제 받는 수량, 아낀 금액, 개당 가격, 남은 예산을 분리해서 보여줍니다.

## 개발

```bash
npm run dev
npm run lint
npm run build
```
