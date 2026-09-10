-- CMP-140 / CMP-137: consultation_submit 단건 read-back (읽기 전용)
--
-- 사용법:
--   psql -X --no-psqlrc -v ON_ERROR_STOP=1 \
--        -v sessionId='00000000-0000-0000-0000-000000000000' \
--        -f scripts/qa/cmp137-consultation-submit-readback.sql "$DATABASE_URL"
--
-- 실제 스키마 이름은 `funnel_events` 가 아니라 `spacebogam_funnel_events` 이며,
-- experiment_id / experiment_variant 는 JSON 이 아니라 전용 컬럼이다.
-- (migrations/20260727_cmp98_verified_consultation_submit.sql)
--
-- 이 스크립트는 SELECT 만 수행한다. 연락처, 상담 본문, consultation_request_id 원값,
-- 자격증명은 출력하지 않는다. consultation_request_id 는 존재 여부(boolean)만 노출한다.

\set ON_ERROR_STOP on
\pset pager off

\if :{?sessionId}
\else
\echo '[CMP137] ERROR: -v sessionId=<uuid> 가 필요합니다.'
\q
\endif

\echo ''
\echo '=== [1] consultation_submit 행 수 (session_id 기준) ==='
SELECT
  :'sessionId'                       AS session_id,
  COUNT(*)                           AS consultation_submit_rows,
  COUNT(*) FILTER (WHERE is_active)  AS active_rows,
  COUNT(DISTINCT event_id)           AS distinct_event_ids
FROM spacebogam_funnel_events
WHERE event_name = 'consultation_submit'
  AND session_id = :'sessionId'::uuid;

\echo ''
\echo '=== [2] 행별 상세 (event_id / experiment_id / experiment_variant / created_at) ==='
SELECT
  event_id,
  experiment_id,
  experiment_variant,
  is_active,
  (consultation_request_id IS NOT NULL) AS has_consultation_request_id,
  occurred_at,
  created_at
FROM spacebogam_funnel_events
WHERE event_name = 'consultation_submit'
  AND session_id = :'sessionId'::uuid
ORDER BY created_at, event_id;

\echo ''
\echo '=== [3] 멱등 판정용 지문 (동일 세션의 event_id 집합 해시) ==='
-- 같은 세션 ID로 이 스크립트를 두 번 실행해 아래 한 줄이 글자 그대로 동일하면
-- event_id 집합이 불변임이 증명된다.
SELECT
  'CMP137_FINGERPRINT|' || :'sessionId' || '|'
    || COUNT(*)::text || '|'
    || md5(COALESCE(string_agg(event_id::text, ',' ORDER BY event_id), '')) AS fingerprint
FROM (
  SELECT DISTINCT event_id
  FROM spacebogam_funnel_events
  WHERE event_name = 'consultation_submit'
    AND session_id = :'sessionId'::uuid
) AS event_id_set;
