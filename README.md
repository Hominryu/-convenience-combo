# 편의점꿀조합

Apps in Toss WebView 미니앱입니다. CU, GS25, 이마트24 상품 데이터를 기준으로 예산 안에서 살 만한 편의점 조합을 추천합니다.

## 현재 지원 범위

- 지원 편의점: CU, GS25, 이마트24
- 제외: 세븐일레븐, 매장별 실시간 재고, 지도, 리뷰, 커뮤니티, 술/담배 추천
- 데이터: 일반상품 카탈로그와 행사상품 정보를 Supabase에 저장
- 추천: 프론트엔드 조합 알고리즘으로 결제금액, 받는 수량, 혜택금액, 남는 금액을 계산

## Supabase 초기 설정

Supabase SQL Editor에서 `supabase/schema.sql` 전체를 한 번 실행합니다. 이제 별도 migration 파일은 사용하지 않습니다.

필요한 GitHub Actions secrets/variables:

```bash
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

`SUPABASE_URL`은 GitHub Environment `Production`의 Variable 또는 Repository Secret에 넣을 수 있습니다. `SUPABASE_SERVICE_ROLE_KEY`는 반드시 Secret으로 넣습니다.

## 데이터 수집

행사상품 수집:

```bash
python crawler/run.py --retailer all --upload
python crawler/run.py --retailer cu --upload
python crawler/run.py --retailer gs25 --upload
python crawler/run.py --retailer emart24 --upload
```

일반상품 수집:

```bash
python crawler/run_general.py --store all --upload
python crawler/run_general.py --store CU --upload
python crawler/run_general.py --store GS25 --upload
python crawler/run_general.py --store EMART24 --upload
```

GitHub Actions에서는 `Promotion Crawler`, `General Product Crawler` 두 워크플로우를 수동 실행할 수 있습니다.

## 상품 조회 API

```bash
GET /api/products?retailer=cu&limit=120
GET /api/products?retailer=gs25&limit=120
GET /api/products?retailer=emart24&limit=120
GET /api/products?retailer=cu&promotionType=1%2B1
```

프론트 로컬 테스트에서 운영 API를 보려면 `.env.local`에 넣습니다.

```bash
VITE_COMBO_API_BASE_URL=https://convenience-combo.vercel.app
```

## 계산 방식

- 일반상품: 1개 결제 -> 1개 받음
- 1+1: 1개 결제 -> 2개 받음
- 2+1: 2개 결제 -> 3개 받음
- 3+1: 3개 결제 -> 4개 받음

조합 결과는 결제금액, 받는 수량, 혜택금액, 개당 실질가격, 예산에서 남는 금액을 분리해서 보여줍니다.

## 개발

```bash
npm run dev
npm run lint
npm run test
npm run build:vite
```
