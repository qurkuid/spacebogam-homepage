# CMP-1344 AC#10 — 단일 이벤트 dictionary (2026-08-23 R1)

정본 이슈: CMP-1344. 이 문서는 코드베이스 grep + 정적 확인만으로 작성했다(운영 DB 미조회 항목은 §5 표시).
근거는 전부 파일:라인으로 인용한다. 추정·제안은 하지 않고 사실만 적는다.

## 1. 페이지별 로더 — 메인과 하위 페이지가 서로 다른 조합을 로드한다

| 페이지 | site-tracking.js | funnel-tracking.js | consultation-form.js | commercial-call*.js | preview-v8.js |
|---|---|---|---|---|---|
| `index.html` (메인) | ❌ | ✅ | – | – | ✅ |
| `portfolio.html` | ✅ | ✅ | – | – | ✅ |
| `blog.html` / `blog/*.html` | ✅ | ❌ | – | – | ✅(blog.html만) |
| `commercial/call/index.html` | ❌ | ✅ | – | ✅ | ❌ |
| `consultation/apply/index.html` | ✅ | ❌ | ✅ | – | – |
| `case-*.html` (대부분) | ✅ | ❌ | – | – | ✅ |
| `case-hwamyeong-kolong.html` (예외) | ✅ | ✅ | – | – | ✅ |

**핵심 이탈**: 메인(`index.html`)은 `site-tracking.js`를 안 쓰고, `/commercial/call/`은 `site-tracking.js`와 `preview-v8.js` 둘 다 안 쓴다. 세 계열(main/portfolio/commercial)이 서로 다른 로더 조합으로 운영 중이다.

## 2. 경쟁하는 두 이벤트 명명 체계

**(A) `data-v8-event` 선언형** — `assets/preview-v8.js:30-33`이 리스너, `FUNNEL_ALLOWED`(`preview-v8.js:14-28`)에 있는 이름만 서버 퍼널로 전달:
`home_hero_consult_cta_click, home_case_carousel_consult_click, home_portfolio_cta_click, home_story_consult_click, portfolio_project_open, portfolio_consult_click, blog_case_open, blog_consult_click, blog_filter_select, blog_naver_source_open, case_consult_click, case_related_story_open` — `index.html`/`portfolio.html`/`blog.html`/`case-*.html`에 분산.
`portfolio_related_story_open`은 allowlist엔 있지만 HTML 어디에도 없다(죽은 항목).

**(B) 직접 JS 호출형** — `site-tracking.js`/`funnel-tracking.js`가 gtag/dataLayer 또는 서버 퍼널로 직접 전송:
- `site-tracking.js:405-406,450-451,489-490` → `click_consultation`, `click_kakao_or_consult`, `click_call`, `phone_click`, `kakao_chat_click` (GA4/gtag 전용, 서버 스키마엔 없음)
- `funnel-tracking.js:496-523` → `consultation_click, phone_click, kakao_click, portfolio_click, page_view, engaged_session` (서버 퍼널 스키마 정본)

**(C) 서버 정본 스키마** — `tests/funnel-event-schema.json`(intm `contracts.ts::funnelEventInputSchema`, `.strict()`, commit `f4c473e8`)에 `page_view, engaged_session, scroll_50, portfolio_click, consultation_click, phone_click, kakao_click, lead_form_view, lead_form_start, lead_submit_success` 10개만 등록. (A)의 `home_*`/`case_*`/`blog_*`/`portfolio_project_open` 계열과 (B)의 `click_call`/`click_consultation`/`kakao_chat_click`은 이 스키마에 없다 — 보내면 400. 즉 GA4용과 서버 퍼널용이 **의도적으로 분리**돼 있다(`preview-v8.js:4-13`, `commercial-call-callback.js:21-22` 주석 확인).

## 3. 전화 CTA 계약 — 사이트별로 다르다

| 사이트 | 발화 이벤트 | dedup | 부착 속성 | 근거 |
|---|---|---|---|---|
| `site-tracking.js` 로드 페이지(대부분 typology/region/case/blog) | `click_call` **+** `phone_click` 둘 다, 클릭마다 매번(dedup 없음) | ❌ | `event_label`, `link_url`, `phone_target`, `cta_text`, `cta_location`(페이지 유형별 상이) | `site-tracking.js:437-454` |
| `funnel-tracking.js` 로드 페이지(index.html, commercial/call, g4-private) | `phone_click` 단일, **세션당 1회**(`spacebogam_funnel_phone_click_sent`) | ✅ | `ctaLocation`, `ctaText`, UTM/실험 자동부착 | `funnel-tracking.js:499-503` |
| `/commercial/call/` 전용 | 위 `phone_click`(funnel-tracking) + `fbq('trackCustom','phone_click')`(Meta Pixel, 별도 세션당 1회 dedup) + `data-v8-event="phone_click"` 마크업(**미발화 — preview-v8.js 미로드**) | 일부 | `vertical`, `cta_location`, `phone_target` | `commercial-call.js:16-19,270,278-321`; 죽은 마크업은 `PRODUCT.md:98-100`에 이미 기록됨 |

`/commercial/call/`의 `data-v8-event="phone_click"` 3곳(header/hero/sticky)은 리스너가 없어 **구조적으로 죽은 코드**다. 실집계는 funnel-tracking.js 경로가 정상 수행하므로 계측 자체는 살아있으나, 마크업 정리가 필요하다(별도 정리 이슈로 분리 — 이 정본의 tracking 판정에는 영향 없음).

## 4. 기존 부분 산출물 (통합 전)

- `tests/funnel-event-schema.json` — 서버 계약 10개 이벤트 정본
- `PRODUCT.md:96-104` — 측정 계약 + `/commercial/call/` 이중 로더 요건 기술
- `DESIGN.md:55-63` — 전화 CTA `data-cta-location` 3종 마크업 계약(이벤트명 아님)
- 단일 통합 dictionary 파일은 이 문서 이전엔 없었다.

## 5. 미확인 (운영 DB read-back 필요, 이 런에서 미수행)

- 위 이벤트명들이 실제 운영 트래픽에서 발화 빈도가 어느 정도인지(§2 각 이벤트의 최근 7/28일 count)는 `spacebogam-funnel` MCP의 `eventQuality.events`에서 일부 확인 가능하나 전량 대조는 다음 회차로 넘긴다.
