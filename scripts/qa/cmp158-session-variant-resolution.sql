-- CMP-158: lead_form_view / lead_form_start 의 experiment_variant 결손에 대한 소급 처리 방침 구현
--
-- 방침: **소급 보정(UPDATE) 하지 않고, 분석 시점에 세션 단위로 변형을 해석한다.**
--   근거 (2026-07-28 운영 DB 실측):
--     lead_form_view  26행 전부 변형 결손, 그중 15행은 같은 세션의 다른 이벤트로 해석 가능
--     lead_form_start 23행 전부 변형 결손, 그중 15행은 같은 세션의 다른 이벤트로 해석 가능
--   - 세션 단위 해석은 결정적이고 운영 DB 쓰기가 없어 되돌릴 필요 자체가 없다.
--   - 해석 불가 세션(폼 URL 로 직접 진입 등)은 값을 지어내지 않고 변형 분석에서 자연히 빠진다.
--   - 근본 수정(intm PR #12, CMP-144 커밋 7a91b7bc)이 배포되면 신규 행은 컬럼에 직접 실린다.
--     그 뒤에도 이 SQL 은 그대로 맞는 값을 낸다 — 이미 값이 있는 행은 자기 값을 쓴다.
--
-- 읽기 전용. UPDATE / DELETE 없음.
-- 실행: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f cmp158-session-variant-resolution.sql

\set ON_ERROR_STOP on

-- 세션별로 "끊기지 않는" 변형/실험 ID 를 해석한다.
-- 한 세션에 서로 다른 변형이 섞이면(정상 흐름에서는 발생하지 않아야 함) 해석을 포기해
-- 잘못된 귀속이 조용히 지표에 섞이는 것을 막는다.
CREATE OR REPLACE TEMP VIEW cmp158_session_variant AS
SELECT
  session_id,
  CASE WHEN count(DISTINCT nullif(experiment_variant, '')) = 1
       THEN max(nullif(experiment_variant, '')) END AS resolved_variant,
  CASE WHEN count(DISTINCT nullif(experiment_id, '')) = 1
       THEN max(nullif(experiment_id, '')) END AS resolved_experiment_id,
  count(DISTINCT nullif(experiment_variant, '')) AS distinct_variant_count
FROM spacebogam_funnel_events
WHERE is_active
GROUP BY session_id;

-- 이벤트 행에 해석된 변형을 덧붙인 분석용 뷰. 지표 쿼리는 이 뷰만 쓴다.
CREATE OR REPLACE TEMP VIEW cmp158_events_resolved AS
SELECT
  e.*,
  coalesce(nullif(e.experiment_variant, ''), v.resolved_variant) AS variant_resolved,
  coalesce(nullif(e.experiment_id, ''), v.resolved_experiment_id) AS experiment_id_resolved,
  (nullif(e.experiment_variant, '') IS NULL AND v.resolved_variant IS NOT NULL) AS variant_was_inferred
FROM spacebogam_funnel_events e
LEFT JOIN cmp158_session_variant v ON v.session_id = e.session_id
WHERE e.is_active;

\echo '== 1. 결손/해석 현황 (이벤트별) =='
SELECT
  event_name,
  count(*)                                                    AS rows_total,
  count(*) FILTER (WHERE nullif(experiment_variant,'') IS NULL) AS variant_missing_raw,
  count(*) FILTER (WHERE variant_was_inferred)                 AS variant_recovered,
  count(*) FILTER (WHERE variant_resolved IS NULL)             AS variant_still_unknown
FROM cmp158_events_resolved
GROUP BY event_name
ORDER BY event_name;

\echo '== 2. 변형이 섞인 세션 (0 이어야 정상) =='
SELECT count(*) AS ambiguous_sessions
FROM cmp158_session_variant
WHERE distinct_variant_count > 1;

\echo '== 3. CMP-158 이 풀어주는 것: 변형별 폼 단계 퍼널 =='
-- 변형이 해석되지 않는 세션은 분모/분자 어디에도 넣지 않는다(추정 아님, 제외).
SELECT
  variant_resolved AS variant,
  count(DISTINCT session_id) FILTER (WHERE event_name = 'consultation_click')                 AS cta_click_sessions,
  count(DISTINCT session_id) FILTER (WHERE event_name = 'lead_form_view')                     AS form_view_sessions,
  count(DISTINCT session_id) FILTER (WHERE event_name = 'lead_form_start')                    AS form_start_sessions,
  count(DISTINCT session_id) FILTER (WHERE event_name IN ('lead_submit_success','consultation_submit')) AS submit_sessions
FROM cmp158_events_resolved
WHERE variant_resolved IS NOT NULL
GROUP BY variant_resolved
ORDER BY variant_resolved;

\echo '== 4. 세션 전 구간 변형 연속성 점검 (CMP-158 완료 조건 검증용) =='
-- 사용법: -v sessionId=<uuid> 로 3홉 QA 세션을 지정해 실행한다.
-- 지정하지 않으면 이 블록은 건너뛴다.
\if :{?sessionId}
SELECT
  event_name,
  page_path,
  experiment_variant       AS variant_raw,
  variant_resolved,
  variant_was_inferred
FROM cmp158_events_resolved
WHERE session_id = :'sessionId'
ORDER BY occurred_at;
\endif
