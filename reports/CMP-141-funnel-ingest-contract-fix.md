# CMP-141 — 퍼널 이벤트 ingest 400 전량 거부 수정

작성일: 2026-07-28 (KST) · 커밋 `ba58517`

## 결론

전송측 payload 의 snake_case 별칭 2개(`experiment_id`, `experiment_variant`)를 제거해
`POST https://intm.kr/api/marketing/funnel-events` 400 전량 거부를 해소했다.
수정본은 라이브(`spacebogam.kr`)에서 서빙 중이며, 단일 세션 3이벤트가 모두 202 로
원장에 적재되는 것을 확인했다.

## 근본 원인 (재현·확정)

수신 스키마 `funnelEventInputSchema` 는 `z.object({...}).strict()` 다
(`qurkuid/intm` `src/lib/spacebogam-funnel/contracts.ts`, `9071f8a7`).
전송측이 camelCase 키와 **함께** snake_case 별칭을 보내면서 미지 키 검증에 걸려 전량 400.

운영 엔드포인트 A/B 프로브 (동일 세션·동일 값, 키 조합만 다름):

| payload | 응답 |
|---|---|
| snake_case 별칭 포함 (기존) | `400 {"error":"Invalid funnel event."}` |
| 별칭 제거 (수정본) | `202 {"data":{"accepted":true,"duplicate":false}}` |

### 유입 시점

`experiment_id`/`experiment_variant` 는 2026-07-27 커밋 `9b56dab`(재작성 후 `be026c3`)에서
payload 에 추가됐다. 원장 일별 방문 수가 그 시점에 붕괴한다.

| 날짜 | 방문 세션 |
|---|---|
| 2026-07-25 | 68 |
| 2026-07-26 | 88 |
| 2026-07-27 | **8** ← 회귀 유입 |
| 2026-07-28 | 5 (그중 4건이 본 검증 QA 세션) |

## 이슈 기술 중 정정 사항

1. **`eventId` 는 수신 스키마에 있다.** `z.string().uuid()` 필수 필드이며
   `storeFunnelEvent` 의 dedup 키다. 이슈 본문의 허용 키 목록에서 누락돼 있었다.
   → 클라이언트에서 빼면 안 되고, 그대로 유지하는 것이 dedup 설계상 맞다.
   미지 키는 3개가 아니라 **2개**였다.
2. **"한 건도 적재되지 않는다" 는 2026-07-27 이후 구간에 한정된다.**
   7/25~26 에는 156 세션이 정상 적재됐다. 유실은 전 기간이 아니라 회귀 이후 전량이다.
3. `site-tracking.js:454` 가 `funnel-tracking.js` 를 동적 주입한다는 이슈의 지적은 맞다.

## 변경 사항

| 파일 | 내용 |
|---|---|
| `assets/funnel-tracking.js` | snake_case 별칭 2개 제거. 빈 catch → 429/5xx 1회 재시도(동일 `eventId` 라 원장에서 dedup) + 실패 시 `console.warn` · `window.__spacebogamFunnelFailures` · gtag `funnel_ingest_error` |
| `tests/funnel_contract_check.py` | 전송 payload 키 ↔ 수신 스키마 계약 검사. `--live` 는 운영 엔드포인트 왕복까지 확인 |
| `tests/funnel-event-schema.json` | 수신 스키마 미러(출처·확인 커밋 명시). intm 스키마 변경 시 동반 갱신 대상 |
| `tests/harness.sh` | 계약 검사를 2/3 단계로 편입 |
| `tests/cmp98-funnel-tracking.test.js` | 어설션이 버그 키(`experiment_variant`)를 고정하고 있어 `experimentVariant` 로 정정 |
| `scripts/qa/cmp141-funnel-session.sh` | 단일 세션 3이벤트 왕복 QA 스크립트 |

## 검증 증거

```
$ python3 tests/funnel_contract_check.py --live
[PASS] funnel 계약  (payload 키 20 · eventName 6)
[PASS] 운영 ingest 왕복  HTTP 202 {"data":{"accepted":true,"duplicate":false}}

$ scripts/qa/cmp141-funnel-session.sh A
[CMP141] sessionId=fb846cb1-5644-4baa-900c-4f59b5e8799d variant=A
[CMP141] page_view          -> HTTP 202
[CMP141] engaged_session    -> HTTP 202
[CMP141] consultation_click -> HTTP 202

$ node tests/cmp98-funnel-tracking.test.js
pass 6 / fail 0
```

회귀 검사 음성 테스트: `experiment_id` 를 되살리고 빈 catch 를 되돌린 상태에서
계약 검사가 두 결함을 모두 FAIL 로 잡는 것을 확인했다(exit 1).

원장 read-back(`intm-internal-spacebogam-funnel`, 7일):
세션 스크립트 실행 전후로 `visits 168→169`, `engagedVisits 47→48`,
`consultationClicks 4→5`. 한 세션이 세 단계에 모두 반영됐다.

## 실브라우저 재현 (이슈의 재현 절차 그대로)

헤드리스 Chrome(puppeteer-core 전역 + playwright chromium 캐시)으로 신규 컨텍스트를 열어
`https://spacebogam.kr/?utm_source=qa&utm_medium=qa_test&utm_campaign=cmp141-browser2` 로드 →
12초 대기 → 하단 스크롤 → 상담 CTA 클릭. 네트워크 요청을 직접 캡처했다.

| 이벤트 | 응답 | sessionId | experimentId | 변형 | 미지 키 |
|---|---|---|---|---|---|
| `page_view` | **202** | `0256e776…` | `homepage_headline_v1` | B | 없음 |
| `engaged_session` | **202** | 동일 | 동일 | B | 없음 |
| `scroll_50` | **202** | 동일 | 동일 | B | 없음 |
| `consultation_click` | **202** | 동일 | 동일 | B | 없음 |

`window.__spacebogamFunnelFailures` = `[]` (실패 0건).
이슈 기대표의 4개 이벤트가 모두 기대값과 일치한다.

## 남은 불확실성

- 원장 행의 `experimentId`/`experimentVariant` **컬럼 값** 자체는 집계 MCP 가 노출하지 않아
  직접 조회하지 못했다. 확인된 범위는 (a) 브라우저가 해당 필드를 담아 전송했고
  (b) 서버가 202 로 수락했으며 (c) 세션이 원장 단계 집계에 반영됐다는 것이다.
  컬럼 단위 확인은 `DATABASE_URL` 을 가진 운영자가
  `scripts/qa/cmp137-consultation-submit-readback.sh <sessionId>` 패턴으로 수행할 수 있다.
- 자연 유입 회복 여부는 2026-07-28 일별 수치로 판정해야 한다(현재 수치에는 QA 세션이 섞여 있다).
