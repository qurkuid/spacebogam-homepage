-- CMP-157: CMP-137 QA 테스트 리드 2건 지표 제외 표시 (CMP-139 승인 처리 방침 "안 1" 이행)
--
-- 목적: CMP-137 회귀 검증에서 생성된 [QA] 합성 세션 2건의 퍼널 이벤트를
--       집계에서만 제외한다. 행은 삭제하지 않고 그대로 보존한다.
--
-- 근거: 집계 쿼리 3곳이 모두 `is_active = true` 로 필터한다.
--       src/lib/spacebogam-funnel/repository.ts:97,134,149
--       동일 테이블에 선례가 있다 — 2026-07-25 codex_qa/verification/funnel_launch
--       QA 세션 8행이 이미 is_active = false 로 제외되어 있다.
--
-- 실행 전제: CEO 승인 필요. CMP-139 승인 범위는 "기존 데이터 수정" 을 명시적으로 불허하므로
--            이 스크립트는 CMP-157 에서 별도 승인이 떨어진 뒤에만 실행한다.
--
-- 실행:   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f cmp157-qa-lead-metric-exclusion.sql
-- 롤백:   같은 파일 하단의 ROLLBACK 절 참고 (체크포인트 테이블에서 원복)
--
-- 멱등성: 재실행해도 대상 집합과 최종 상태가 동일하다. 이미 제외된 행은 0건 갱신된다.

\set ON_ERROR_STOP on

BEGIN;

-- 대상 세션: CMP-137 이 남긴 consultation_submit 이벤트 2건이 속한 세션 전체.
-- 퍼널 상단 단계(page_view/engaged_session/consultation_click/lead_form_*)도 같은 QA 트래픽이므로
-- 세션 단위로 함께 제외해야 단계별 수치가 일관된다.
CREATE TEMP TABLE cmp157_target ON COMMIT DROP AS
SELECT e.id, e.is_active
FROM spacebogam_funnel_events e
WHERE e.session_id IN (
  SELECT session_id
  FROM spacebogam_funnel_events
  WHERE event_id IN (
    '61b4ef81-37c0-49cd-9802-e5d29c8f2b75',  -- 변형 A, consultation_submit, consult_req 327
    '8407f6ea-c9c8-4482-8c51-733d12135cee'   -- 변형 B, consultation_submit, consult_req 328
  )
);

-- 가드 1: 대상 집합 크기가 사전 조사값과 정확히 일치해야 한다 (세션 2개 x 8 이벤트).
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM cmp157_target;
  IF n <> 16 THEN
    RAISE EXCEPTION 'CMP-157 중단: 대상 행이 16건이 아니라 %건입니다. 사전 조사와 불일치하므로 실행하지 않습니다.', n;
  END IF;
END $$;

-- 가드 2: 대상 세션이 정확히 2개여야 한다.
DO $$
DECLARE n int;
BEGIN
  SELECT count(DISTINCT session_id) INTO n
  FROM spacebogam_funnel_events
  WHERE id IN (SELECT id FROM cmp157_target);
  IF n <> 2 THEN
    RAISE EXCEPTION 'CMP-157 중단: 대상 세션이 2개가 아니라 %개입니다.', n;
  END IF;
END $$;

-- 사전 체크포인트: 변경 전 is_active 값을 영구 보존한다 (롤백 근거).
CREATE TABLE IF NOT EXISTS cmp157_funnel_isactive_checkpoint (
  id uuid PRIMARY KEY,
  is_active_before boolean NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO cmp157_funnel_isactive_checkpoint (id, is_active_before)
SELECT id, is_active FROM cmp157_target
ON CONFLICT (id) DO NOTHING;  -- 재실행 시 최초 원본값을 덮어쓰지 않는다

-- 본 변경: 집계 제외. 행·컬럼·상담 레코드는 그대로 보존된다.
UPDATE spacebogam_funnel_events
SET is_active = false,
    updated_at = now()
WHERE id IN (SELECT id FROM cmp157_target)
  AND is_active = true;

-- 사후 read-back 1: 대상 16행이 전부 비활성인지.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM spacebogam_funnel_events
  WHERE id IN (SELECT id FROM cmp157_target) AND is_active = true;
  IF n <> 0 THEN
    RAISE EXCEPTION 'CMP-157 중단: 제외되지 않은 대상 행이 %건 남았습니다.', n;
  END IF;
END $$;

-- 사후 read-back 2: 행이 보존됐는지 (삭제 금지 조건).
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM spacebogam_funnel_events
  WHERE id IN (SELECT id FROM cmp157_target);
  IF n <> 16 THEN
    RAISE EXCEPTION 'CMP-157 중단: 대상 행이 소실됐습니다 (%건 남음). 롤백하십시오.', n;
  END IF;
END $$;

-- 사후 read-back 3: 완료 조건 — 7일 submittedLeads 가 0 이어야 한다.
DO $$
DECLARE n int;
BEGIN
  SELECT COUNT(DISTINCT session_id) INTO n
  FROM spacebogam_funnel_events
  WHERE occurred_at >= now() - INTERVAL '7 day'
    AND is_active = true
    AND event_name IN ('lead_submit_success', 'consultation_submit');
  IF n <> 0 THEN
    RAISE EXCEPTION 'CMP-157 중단: 7일 submittedLeads 가 0 이 아니라 %입니다.', n;
  END IF;
  RAISE NOTICE 'CMP-157 OK: 7일 submittedLeads = 0';
END $$;

COMMIT;

-- 변경 후 증거 출력 (7일 퍼널 단계 수치)
SELECT
  COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'page_view')::int AS visits,
  COUNT(DISTINCT session_id) FILTER (WHERE event_name IN ('engaged_session','scroll_50'))::int AS engaged_visits,
  COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'consultation_click')::int AS consultation_clicks,
  COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'lead_form_start')::int AS form_starts,
  COUNT(DISTINCT session_id) FILTER (WHERE event_name IN ('lead_submit_success','consultation_submit'))::int AS submitted_leads
FROM spacebogam_funnel_events
WHERE company_id = (
  SELECT company_id FROM spacebogam_funnel_events
  WHERE event_id = '61b4ef81-37c0-49cd-9802-e5d29c8f2b75'
)
  AND occurred_at >= now() - INTERVAL '7 day'
  AND is_active = true;


-- ============================================================================
-- ROLLBACK (필요 시 이 블록만 별도 실행)
-- ============================================================================
-- BEGIN;
--   UPDATE spacebogam_funnel_events e
--   SET is_active = c.is_active_before,
--       updated_at = now()
--   FROM cmp157_funnel_isactive_checkpoint c
--   WHERE e.id = c.id AND e.is_active IS DISTINCT FROM c.is_active_before;
--   -- 확인: 16행이 전부 원래 값(true)으로 돌아왔는지
--   SELECT count(*) FILTER (WHERE is_active) AS restored_active
--   FROM spacebogam_funnel_events
--   WHERE id IN (SELECT id FROM cmp157_funnel_isactive_checkpoint);
-- COMMIT;
