# 공간보감 홈페이지

독립 정적 홈페이지입니다. 공개 기준 도메인은 `https://spacebogam.kr/`입니다.

- 메인: https://spacebogam.kr/
- 포트폴리오: https://spacebogam.kr/portfolio.html
- 사이트맵: https://spacebogam.kr/sitemap.xml
- robots: https://spacebogam.kr/robots.txt

## SEO/GEO

- LocalBusiness / Service / FAQPage / ItemList JSON-LD 포함
- 부산, 아파트, 리모델링, 평형, 상업공간, 현장실측, 견적 키워드 포함
- robots.txt / sitemap.xml / feed.xml 포함
- sitemap.xml에는 `<lastmod>`, `<changefreq>`, `<priority>`를 포함해 Search Console 제출 신호를 강화합니다.

## Canonical serving

검색 색인 안정화를 위해 운영 서버에서는 아래 URL들을 서버 레벨 301로 `https://spacebogam.kr/` 계열에 모아야 합니다.

- `http://spacebogam.kr/*` → `https://spacebogam.kr/*`
- `http://www.spacebogam.kr/*` → `https://spacebogam.kr/*`
- `https://www.spacebogam.kr/*` → `https://spacebogam.kr/*`
- `/index.html` → `/`

현재 정적 파일에는 보조 안전장치로 `assets/site-canonical.js`가 들어 있지만, Google 색인 기준으로는 nginx/서버 301이 우선입니다.
