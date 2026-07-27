# CMP-96 재재검증 — CMP-141 수정 반영 후 운영 런타임·이벤트 품질 QA

검증일: 2026-07-28 (KST) · 대상: 운영 `https://spacebogam.kr` / `https://intm.kr/consultation/ggbg`
실행 스크립트: `scripts/qa/cmp96-runtime-recheck.mjs`, `scripts/qa/cmp96-consultation-formstart.mjs`
검증자: QA·버그 트리아지 엔지니어 (자식 보고를 신뢰하지 않고 운영 런타임에서 직접 관찰)

## 판정: **부분 PASS — 산출물 6/7 통과, 1건 FAIL(High)**

이전 하트비트의 High 결함(퍼널 이벤트 400 전량 거부)은 **해소 확인(PASS)**.
남은 FAIL은 **`consultation_submit` 실험 귀속**, 원인 위치는 `spacebogam-homepage` 가 아니라 INTM 상담 폼 앱이다.

| # | 산출물 | 판정 | 근거 |
|---|---|---|---|
| 1 | 신규 세션 100개 A/B 분배 40~60 | **PASS** | 2026-07-27 검증 유지 (A 48 / B 52 / 미할당 0) |
| 2 | 새로고침·상담 이동 고정성 | **PASS** | 이번 4세션 전부 `/` → `/consultation/` → `intm.kr/consultation/ggbg` 까지 변형 동일 |
| 3 | 1440×900 · 390×844 에서 H1 외 불변 | **PASS** | 두 뷰포트 × A/B 스크린샷 4장, 변형↔H1 1:1, CTA 구조 동일 |
| 4 | 4개 이벤트 실험 ID·변형 일치 | **부분 FAIL** | `page_view`·`engaged_session`·`consultation_click` PASS(202). `consultation_submit` 은 퍼널 ingest 로 **전송되지 않음** |
| 5 | `ready`, `isMonotonic=true`, UTM ≥80%, 경고 0 | **PASS** | `status=ready`, `isMonotonic=true`, `utmTaggedVisitRate=0.8629`, `warnings=[]`, 브라우저 콘솔 에러/경고 0 |
| 6 | 미리보기/커밋/배포 경로·단일 A 롤백 | **PASS** | `assets/site-tracking.js:16` `GLOBAL_EXPERIMENT_VARIANT` 레버 (2026-07-27 검증 유지) |
| 7 | (원 결함) 위조 `?success=` → `consultation_submit` | **PASS** | 2026-07-27 검증 유지 |

---

## 1. 이전 High 결함 해소 확인 — PASS

CMP-141 수정(전송 payload 의 snake_case 별칭 제거)이 운영에 반영되어, 이전에 **HTTP 400 으로 100% 거부**되던
퍼널 이벤트가 전부 **HTTP 202** 로 수락된다.

### 실행

```
node scripts/qa/cmp96-runtime-recheck.mjs
```

4개 독립 브라우저 컨텍스트(A/B × 1440×900/390×844), 각각 신규 `sessionStorage`/`localStorage`.
URL: `https://spacebogam.kr/?utm_source=qa_cmp96&utm_medium=runtime_recheck&utm_campaign=cmp96_20260728&utm_content=post_cmp141&experiment_force=<A|B>`

### 관찰 결과 (4세션 전부 동일 패턴)

| 이벤트 | HTTP | experimentId / experimentVariant | 응답 본문 |
|---|---|---|---|
| `page_view` (`/`) | **202** | `homepage_headline_v1` / 강제값 일치 | `{"data":{"accepted":true,"duplicate":false}}` |
| `scroll_50` | **202** | 일치 | `{"data":{"accepted":true,"duplicate":false}}` |
| `engaged_session` | **202** | 일치 | `{"data":{"accepted":true,"duplicate":false}}` |
| `consultation_click` | **202** | 일치 | 수락 |
| `page_view` (`/consultation/`) | **202** | 일치 | `{"data":{"accepted":true,"duplicate":false}}` |

- 콘솔 error/warning: **4세션 모두 0건**, `pageerror` 0건.
- H1 매핑: A = `공간은 사는 사람을 닮아야 합니다.` / B = `부산 프리미엄 아파트, 우리 집에 맞는 완성도부터 잡습니다`
- `sessionStorage['spacebogam_homepage_headline_v1_variant']` 가 강제값과 일치.

### 서버측 적재 확인 (독립 경로)

INTM 퍼널 스냅샷(`rangeDays=7`)에 본 QA 세션이 실제로 적재되어 있다.

```
{ source: "qa_cmp96", medium: "runtime_recheck", campaign: "cmp96_20260728", visits: 4 }
quality: { status: "ready", isMonotonic: true, utmTaggedVisitRate: 0.8629,
           sampleSessions: 175, missingDataDays: [], warnings: [] }
```

→ 클라이언트 202 뿐 아니라 **서버 집계까지 도달**함을 확인. 산출물 5는 이로써 PASS.

---

## 2. 남은 FAIL — `consultation_submit` 실험 귀속 누락 (High)

### 요약

상담 폼은 `https://intm.kr/consultation/ggbg` (INTM 앱)에서 렌더링된다.
`spacebogam.kr` 은 이 링크에 `experiment_id` / `experiment_variant` / `sbClientId` / `sbSessionId` 를
런타임에 정확히 붙여 넘긴다. 그러나 **INTM 폼 페이지의 퍼널 전송기는 URL 의 실험 파라미터를 읽지 않는다.**

### 재현 절차

```
node scripts/qa/cmp96-consultation-formstart.mjs
```

홈(강제 A/B) → `/consultation/` → `intm.kr/consultation/ggbg` 이동 후 첫 입력 필드에 포커스·타이핑.
**폼 제출은 하지 않음**(운영 데이터 생성 금지 경계).

### 실제 결과

전달된 URL (force=A):

```
https://intm.kr/consultation/ggbg?utm_source=qa_cmp96&utm_medium=formstart
  &utm_campaign=cmp96_20260728_form&ref=spacebogam&page_variant=home_a_default
  &experiment_id=homepage_headline_v1&experiment_variant=A
  &sbClientId=1e8d6bd7-…&sbSessionId=e58027ca-…
```

같은 세션에서 전송된 이벤트:

| 도메인 | 이벤트 | HTTP | sessionId | experimentId | experimentVariant | pageVariant |
|---|---|---|---|---|---|---|
| spacebogam.kr | `page_view` (`/`) | 202 | `e58027ca…` | `homepage_headline_v1` | `A` | `home_a_default` |
| spacebogam.kr | `consultation_click` | 202 | `e58027ca…` | `homepage_headline_v1` | `A` | `home_a_default` |
| spacebogam.kr | `page_view` (`/consultation/`) | 202 | `e58027ca…` | `homepage_headline_v1` | `A` | `home_a_default` |
| **intm.kr** | `lead_form_view` | 202 | `e58027ca…` | **`""`** | **`""`** | **`""`** |
| **intm.kr** | `lead_form_start` | 202 | `e58027ca…` | **`""`** | **`""`** | **`""`** |

force=B 세션도 완전히 동일한 패턴(홈 3건 `B`, 폼 2건 `""`).

- `sessionId` / `clientId` 는 도메인 경계를 **정상 계승**한다 → 세션 조인으로 사후 귀속은 가능.
- `utmSource` 등 UTM 은 정상 계승된다.
- 실험 3개 필드만 공백으로 전송된다.

### 기대 결과

INTM 청크에 **의도된 계약이 명시**되어 있다 (`/_next/static/chunks/d8bb025e5d51e0cb.js`):

```js
Z.extend({
  eventName: z.literal("consultation_submit"),
  consultationRequestId: z.number().int().positive(),
  experimentId: z.literal("homepage_headline_v1"),
  experimentVariant: z.enum(["A","B"]),
}).strict()
```

즉 `consultation_submit` 은 `experimentId='homepage_headline_v1'` + `experimentVariant∈{A,B}` 를
**필수**로 요구한다. 런타임은 이 값을 `""` 로 만들고 있으므로 계약을 만족할 수 없다.

### 추가 관찰 — 퍼널 ingest 로 가는 `consultation_submit` 자체를 찾지 못함

`intm.kr/consultation/ggbg` 가 로드하는 청크 중 `/api/marketing/funnel-events` 를 호출하는 것은
`d8bb025e5d51e0cb.js` **1개뿐**이며, 해당 전송기는 URL 쿼리에서 payload 를 조립하고
`formId:"consultation_ggbg"` 를 하드코딩한다. 관찰된 발신 이벤트는 `lead_form_view`, `lead_form_start` 2종.

제출 성공 경로에서 발견되는 `consultation_submit` 은 GA/GTM 트래커 호출이다:

```js
er("consultation_submit", { ...t, lead_type:"consultation",
   lead_id_hash: r.consultReqId ? `consult_${r.consultReqId}` : "" })
```

퍼널 스냅샷의 `submittedLeads` 가 7일간 `0` 인 것과 정합적이다(`formStarts`는 집계됨).

### 검증 공백 (정직하게 명시)

**실제 상담 폼을 제출하지 않았다.** 운영 상담 데이터 생성은 승인 없이 수행하지 않는 경계다.
따라서 "제출 순간 퍼널 ingest 로 `consultation_submit` 이 전송되는가"는 **직접 관찰하지 못했다.**
확인 범위는 (a) 동일 페이지·동일 전송기가 실험 필드를 `""` 로 보낸다는 런타임 관찰,
(b) 해당 페이지에서 퍼널 ingest 를 호출하는 코드 경로가 1개뿐이라는 정적 확인이다.

### 영향

- CMP-73 헤드라인 실험의 **최종 전환(상담 제출) 단계가 변형별로 귀속되지 않는다.**
- 실험의 1차 성공지표(방문→상담 제출)를 이벤트만으로는 A/B 비교할 수 없다.
- 완화 요인: `sessionId` 가 계승되므로 **세션 조인으로 사후 귀속은 복구 가능**하다(데이터 유실 아님).

### 완료 조건

1. `intm.kr/consultation/ggbg` 퍼널 전송기가 URL 의 `experiment_id` / `experiment_variant` / `page_variant`
   를 읽어 `experimentId` / `experimentVariant` / `pageVariant` 로 전송한다.
2. 상담 제출 성공 시(서버 확인 `consultReqId` 수신 후) 퍼널 ingest 로 `consultation_submit` 을
   위 계약(`experimentId` 리터럴 + `experimentVariant` enum + `consultationRequestId`)대로 전송한다.
3. A/B 각 1개 세션의 제출 왕복이 HTTP 202 이고, 홈의 `page_view` 와 동일한 `sessionId` · 동일 변형을 갖는다.
4. 퍼널 스냅샷의 `submittedLeads` 가 해당 제출을 반영한다.

### 수정 소유자

INTM 상담 폼 앱 — Founding Engineer (Growth Operations & Marketing Automation).

---

## 3. 안전 경계 준수

- 외부 게시·광고·예산·고객 메시지 변경 **없음**.
- 상담 폼 **제출하지 않음**(운영 리드 데이터 미생성).
- 모든 QA 트래픽은 `utm_source=qa_cmp96` 로 식별 가능하게 태깅(총 6세션).
- 읽기 전용 API/정적 자산 조회만 수행.

## 4. 산출물

- 스크린샷 4장: `cmp96-A-desktop-1440x900.png`, `cmp96-B-desktop-1440x900.png`,
  `cmp96-A-mobile-390x844.png`, `cmp96-B-mobile-390x844.png`
- 원시 관찰 로그: `cmp96-recheck-raw.json`, `cmp96-formstart-raw.json`
