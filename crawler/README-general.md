# 일반상품 수집

`run_general.py`는 행사 크롤러와 별도 프로세스로 CU, GS25, 이마트24의 공개 상품 목록만 수집한다.
각 adapter는 브라우저 요청 간격(기본 0.6초), 30초 timeout, 최대 2회 재시도와 지수 backoff를 사용한다.
접근 차단이나 빈 응답은 우회하지 않고 실패로 기록하며, 이때 기존 상품을 비활성화하지 않는다.

```bash
python crawler/run_general.py --store all                  # 검증/리포트만
python crawler/run_general.py --store CU --upload          # Supabase 동기화
PYTHONPATH=crawler python -m unittest discover -s crawler/tests -v
```

현재 공개 목록 범위는 다음과 같다.

| 점포 | 출처 | 범위 |
|---|---|---|
| CU | `cu.bgfretail.com/product/product.do` | 공개 상품 목록에 렌더링되는 상품 |
| GS25 | `gs25.gsretail.com/.../youus-freshfood` | 공개 fresh-food/상품 목록에 렌더링되는 상품 |
| 이마트24 | `emart24.co.kr/goods/normal` | 공개 일반상품 목록에 렌더링되는 상품 |

사이트 개편, 지역/로그인 제한, 로봇 차단으로 확인할 수 없는 상품은 저장하지 않는다. 실행별 실제 수집 건수와
오류는 `crawler/output/general-latest.json` 및 Actions artifact에 남는다. GitHub Actions에서는
**General Product Crawler → Run workflow**로 점포를 선택할 수 있으며 화/금 18:17 UTC에도 실행된다.
