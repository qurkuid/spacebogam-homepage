# CMP-203 — `consultation_submit` experimentId/experimentVariant DB read-back 검증

- 검증일: 2026-07-28 (KST)
- 대상 코드: intm `main` — PR #12 병합 커밋 `11c69a1d` (2026-07-28 09:39:27 +0900)
- 방식: 운영 DB **읽기 전용** SELECT (`spacebogam_funnel_events`). UPDATE/DELETE 없음.
- 신규 제출: **실행하지 않음** (사유는 아래 "절차 변경" 참조)

## 결론

완료 기준 3개 모두 **충족**. 단, 검증 과정에서 별개의 결함 1건을 확인했고 후속 이슈로 분리했다.

## 완료 기준 판정

### 1. 이벤트 레코드에 `experimentId` / `experimentVariant` 존재 — PASS

`consultation_submit` 전체 3행 모두 두 전용 컬럼이 채워져 있다. 그중 3번째 행은 **PR #12 배포(09:39) 이후**인 14:09 생성분이라 배포 후 동작을 직접 증명한다.

| ev8 | sess8 | experiment_id | experiment_variant | page_variant | utm_source | utm_medium | utm_campaign | is_test | created_at |
|---|---|---|---|---|---|---|---|---|---|
| 61b4ef81 | d8086712 | homepage_headline_v1 | A | home_a_default | spacebogam.kr | homepage | spacebogam_site | f | 2026-07-28 00:58:39 |
| 8407f6ea | 90440f32 | homepage_headline_v1 | B | home_b_visit_stage_standard | spacebogam.kr | homepage | spacebogam_site | f | 2026-07-28 00:59:38 |
| 72742ded | da2b4ba9 | homepage_headline_v1 | A | home_a_default | qa_cmp173 | verification | cmp173_live_check | f | 2026-07-28 14:09:00 |

집계 확인 (`event_name`×`is_test` 별):

```
 consultation_submit | f |    3 | has_exp_id=3 | has_variant=3
```

구조적 보강: `selectSubmittedLeadEvent` (intm `src/lib/spacebogam-funnel/submission.ts:139-146`) 는
`experiment_id === 'homepage_headline_v1' && variant ∈ {A,B}` 일 때만 `consultation_submit` 로 승격하고
그 외는 `lead_submit_success` 로 남긴다. 즉 `consultation_submit` 행이 존재하는 것 자체가 실험 귀속 확인을
전제하며, PR #12 는 그 값이 **컬럼까지 실려 저장되도록** 페이로드에 추가한 변경이다. 위 14:09 행이 그 결과다.

### 2. UTM 필드 변경 없음 — PASS

3행 모두 `utm_source` / `utm_medium` / `utm_campaign` 이 실제 유입값을 유지하고 있고,
변형값(`A` / `B`)이나 실험 ID(`homepage_headline_v1`)로 덮어써진 흔적이 없다.
변형은 `experiment_variant` 와 `page_variant` 라는 **별도 컬럼**에만 실린다
(`home_a_default` / `home_b_visit_stage_standard`).

### 3. snake_case 필드로 인한 400 오류 없음 (CMP-141 회귀 없음) — PASS

- 정적: `origin/main:src/lib/spacebogam-funnel/contracts.ts:20-44` 의 `funnelEventInputSchema` 는
  `.strict()` 이며 키가 전부 camelCase 다. snake_case 별칭은 **추가되지 않았다**.
  `isTest` 는 `.optional().default(false)` 라 기존 페이로드 하위호환이 유지된다.
- 런타임: 배포(09:39) 이후 클라이언트 이벤트가 끊김 없이 적재되고 있다 —
  `lead_form_view` 최신 15:37:45, `page_view` 15:32:05, `consultation_click` 15:07:33.
  strict 스키마가 거부하고 있다면 이 행들이 존재할 수 없다.
- 배포 후 QA 세션 `da2b4ba9` 의 6개 이벤트가 전부 적재됨(아래 타임라인) — 400 없음.

## 절차 변경 — 신규 제출을 실행하지 않은 이유

이슈의 절차 1은 `cmp137-consultation-submit-flow.mjs` 로 테스트 제출 1건을 만들라고 했고,
"주의"는 **`is_test=true` 마커 필수**를 명시했다. 이 두 조건은 현재 코드에서 동시에 만족될 수 없다.

`buildVerifiedConsultationSubmitEvent` (`submission.ts:96-125`) 와
`buildSubmittedLeadEvent` (`submission.ts:56-83`) 는 `funnelEventInputSchema.safeParse(...)` 호출에
**`isTest` 를 전달하지 않는다.** 스키마 기본값이 `false` 이므로 서버가 만드는 제출 이벤트는
`marketing_attribution.is_test = 'true'` 여도 **항상 `is_test = false`** 로 저장된다.

배포 후 QA 세션 `da2b4ba9` 타임라인이 이를 그대로 보여준다:

| event_name | is_test | occurred_at |
|---|---|---|
| page_view | f | 14:08:56.518 |
| lead_form_view | **t** | 14:08:56.699 |
| lead_form_start | **t** | 14:08:57.780 |
| scroll_50 | f | 14:08:58.088 |
| **consultation_submit** | **f** | 14:09:00.326 |
| engaged_session | f | 14:09:06.522 |

같은 세션인데 클라이언트가 보낸 폼 이벤트는 마커가 붙고 서버가 만든 제출 이벤트는 붙지 않는다.
따라서 지금 제출을 1건 더 만들면 **퍼널 submit 단계에 제외 불가능한 QA 리드가 1건 추가**된다.
검증하려는 지표 자체를 오염시키므로 실행하지 않았다.

대신 배포 후 실제 행(`72742ded`, 14:09)으로 동일한 완료 기준을 전부 판정했다.
이 행은 CMP-173 검증 제출이라 `utm_source=qa_cmp173` 로 식별 가능하며,
`consult_req` 쪽 집계는 `marketing_attribution->>'is_test' = 'true'` 로 이미 제외 처리된다.
누락된 것은 **퍼널 이벤트 컬럼**뿐이다.

## 후속

- `is_test` 서버 제출 경로 전파 누락 → **CMP-204** 로 분리.
- 현재 `consultation_submit` 3행 중 2행(`61b4ef81`, `8407f6ea`)은 CMP-137/CMP-140 QA 합성 리드,
  1행(`72742ded`)은 CMP-173 검증 리드다. **3행 전부 QA 트래픽이며 실유입 제출은 아직 0건이다.**
  퍼널 submit 수치를 실적으로 읽으면 안 된다.

## 재현 명령 (읽기 전용)

```
DATABASE_URL=… psql -X --no-psqlrc -v ON_ERROR_STOP=1 "$DATABASE_URL" -c "
  SELECT left(event_id::text,8) ev8, left(session_id::text,8) sess8,
         experiment_id, experiment_variant, page_variant,
         utm_source, utm_medium, utm_campaign, is_test, created_at
  FROM spacebogam_funnel_events
  WHERE event_name='consultation_submit' ORDER BY created_at;"
```

세션 전 구간 변형 연속성은 `scripts/qa/cmp158-session-variant-resolution.sql` 에
`-v sessionId=<uuid>` 로 실행한다.
