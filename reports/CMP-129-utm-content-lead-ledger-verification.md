# CMP-129 — IG `content_id`/UTM의 리드 원장 도달 검증

- 작성: 2026-07-27 (KST)
- 대상 규칙: CMP-128 §1~§2 인스타그램 `content_id`/UTM 규칙
- 재현 하네스: `scripts/qa/cmp129-utm-content-relay.js` (jsdom, 네트워크 fetch 전부 스텁 → 운영 계측/리드 데이터 미오염)

## 0. 결론

**`utm_content` 는 리드 원장까지 도달한다 — 예.**

경로: 랜딩 URL → `assets/funnel-tracking.js` 30일 attribution 저장 → 상담 링크 쿼리 →
INTM 상담 폼(`intm.kr/consultation/ggbg`) `marketingAttribution` → `consult_req.utm_content` 컬럼.

CMP-14 §1.1이 "확인되지 않은 연결"로 남겨둔 구간 중 **UTM/`utm_content` 전달 부분은 이번에 확인됐다.**
영구 `lead_id` 및 하단 단계(방문/실측→견적→계약) 연결은 여전히 미확인이며 이 이슈 범위 밖이다.

## 1. 랜딩 → 상담 링크 (5 케이스)

`node scripts/qa/cmp129-utm-content-relay.js`

| 케이스 | 랜딩 URL | 상담 링크 `utm_content` | `page_view` 이벤트 | `consultation_click` 이벤트 |
|---|---|---|---|---|
| A1. UTM 있음 · 홈 | `/?utm_source=instagram&…&utm_content=ig-202608-basement-r1` | `ig-202608-basement-r1` (링크 5/5) | `ig-202608-basement-r1` | `ig-202608-basement-r1` |
| A2. UTM 있음 · 상담 페이지(쿼리 유지) | `/consultation/?…&utm_content=…` | `ig-202608-basement-r1` (링크 5/5) | 동일 | 동일 |
| A3. UTM 있음 · 상담 페이지(쿼리 유실) | `/consultation/` + 저장된 attribution | `ig-202608-basement-r1` | 동일 | 동일 |
| B1. UTM 없음 · 홈 | `/` | `` (없음) | `` | `` |
| B2. UTM 없음 · 상담 페이지 | `/consultation/` | `` (없음) | `` | `` |

A2 최종 상담 신청서 링크(실측값):

```
https://intm.kr/consultation/ggbg?utm_source=instagram&utm_medium=social
  &utm_campaign=ig_202608_basement&ref=spacebogam_consultation
  &utm_content=ig-202608-basement-r1
  &sbClientId=…&sbSessionId=…&experiment_id=homepage_headline_v1&experiment_variant=A
  &page_variant=home_a_default
```

B2(UTM 없음)에는 `utm_content` 가 아예 붙지 않는다 — 값이 없을 때 빈 값을 만들어내지 않는다는 대조 확인.

## 2. 상담 폼 제출 → 리드 원장

### 2.1 클라이언트 (INTM 상담 폼)

`intm.kr/consultation/ggbg` 의 배포된 클라이언트 번들(`/_next/static/chunks/d8bb025e5d51e0cb.js`)을 정적 확인:

- attribution 키 목록에 `utm_content` 포함:
  `["utm_source","utm_medium","utm_campaign","utm_content","utm_term","gclid","gbraid","wbraid","fbclid","msclkid","n_keyword","n_query","n_campaign_type","n_ad_group","n_keyword_id","source_page","landing_page","referrer","sbClientId","sbSessionId","experiment_id","experiment_variant"]`
- 제출 핸들러가 `marketingAttribution` 을 함께 전송:
  `let t = et(); await q({answers, questions, filePath, companyId, companySlug, marketingAttribution: t})`
  (`et()` = 현재 URL 쿼리에서 위 키를 읽어 `form_path`/`submitted_at`/`device_type` 와 함께 객체 구성)
- 퍼널 이벤트에도 `utmContent: t.get("utm_content") ?? ""` 로 포함.

### 2.2 서버 (리드 원장 저장값)

INTM 읽기 전용 도구 `consultation-completeness` (2026-07-27 조회):

| 기간 | 소스 테이블 | 건수 | `utm_content` 채워짐 | `form_path` 채워짐 |
|---|---|---|---|---|
| 2026-06-01 ~ 07-27 | `consult_req` | 17 | 1 (5.88%) | 3 (17.65%) |
| 2026-07-01 ~ 07-27 | `consult_req` | 7 | 1 (14.29%) | 3 (42.86%) |

해석: `consult_req` 에 `utm_content` **컬럼이 존재하고 실제로 값이 저장된 레코드가 있다**.
`form_path` 3건 = 신규 계측 폼을 거친 제출 3건, 그중 UTM 을 달고 들어온 1건에서
`utm_source/medium/campaign/utm_content` 4종이 동시에 채워졌다 — 위 B 케이스(UTM 없음 → 미기록)와 일치하는 패턴.

주의: 도구가 값 자체는 반환하지 않으므로(집계 전용), "컬럼에 값이 저장된다"까지가 확인 범위다.
특정 `ig-202608-*` 값의 원문 일치 확인은 IG 캠페인 실제 송출 후 CMP-128 주간 대시보드에서 검증한다.

## 3. 발견된 결함 1건 + 수정

**증상(수정 전 A3):** 상담 페이지에 쿼리 없이 도착하면(북마크·새로고침·JS 미실행 경유),
저장된 attribution 에서 `utm_content` 는 복원되지만 `utm_source/medium/campaign` 은
페이지에 하드코딩된 자기참조 값(`spacebogam.kr` / `consultation_page` / `spacebogam_site`)이 그대로 남았다.
→ 리드 원장에 "`utm_content` 는 인스타 크리에이티브인데 소스는 자사 홈페이지"인 모순 행이 생긴다.

원인: `decorateConsultationLink()` 가 `!url.searchParams.has(key)` 일 때만 값을 채워
하드코딩된 자리표시자를 덮어쓰지 못했다.

**수정:** `assets/funnel-tracking.js` — `utm_source` 가 자기참조 값(`spacebogam.kr`)이고
저장된 유입 attribution 이 있으면 UTM 5종을 저장값으로 덮어쓴다. 실제 광고는 `utm_source=spacebogam.kr`
를 쓰지 않으므로 오탐 위험이 없다.

수정 후 A3 결과:

```
https://intm.kr/consultation/ggbg?utm_source=instagram&utm_medium=social
  &utm_campaign=ig_202608_basement&ref=spacebogam_consultation
  &utm_content=ig-202608-basement-r1&…
```

A2·B1·B2 회귀 없음(위 표와 동일).

## 4. 남은 위험 / 다음 담당

- 영구 `lead_id` 발급 및 `sbClientId`/`sbSessionId` ↔ 리드 매핑 규칙은 여전히 미확인 (CMP-14 §1.1) — INTM 서버 소유, Founding Engineer 확인 필요.
- 리드 원장 `utm_content` **값 원문** 대조는 IG 실제 송출 후 CMP-128 주간 대시보드 1회차에서 수행.
- 전화·카카오 리드에는 UTM 이 붙지 않는다(링크 자체가 `tel:` / `pf.kakao.com`) — content_id 귀속 불가 구간으로 대시보드에 별도 표기 필요.
