# 편의점 행사 수집기

4사 행사상품 수집은 앱/Vercel Functions와 분리해서 운영합니다.

```bash
cd crawler
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m playwright install chromium
python run.py --retailer all --upload
```

필수 환경변수:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
```

수집만 테스트:

```bash
python run.py --retailer gs25 --dry-run
```
