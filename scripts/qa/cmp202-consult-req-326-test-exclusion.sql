-- CMP-202: consult_req id=326 을 테스트 유래로 표시해 영업 파이프라인 집계에서 제외한다.
--
-- 목적: `pipeline_outcome='active'` 4건 중 유일하게 `is_test` 표식이 없던 326 에
--       CMP-161(327/328) 과 **동일한 수단**으로 표시만 추가한다. 행·status·
--       pipeline_outcome·[QA] 표기는 일절 건드리지 않는다.
--
-- 판정 근거 (CMP-218 실측 + CMP-202 재확인, 4축 독립 일치):
--   name          = '[CMP-106 자동검증]00000000'   ([자동검증] 표식)
--   phone         = '010'                          (3자리, 전화번호가 아님)
--   building_name = 'CMP-106 테스트'
--   address       = 서울특별시 중구 세종대로 110  (서울시청 = 더미)
--   → CMP-106 자동검증이 운영 DB 에 남긴 합성 제출.
--   `marketing_attribution` 에 UTM 이 채워져 있으나 합성 제출도 UTM 을 채우므로 실유입 근거가 아니다.
--
-- 수단 근거: `src/lib/paperclip-intm-mcp/tools.ts` 의 consult_req 집계가
--            `marketing_attribution->>'is_test' = 'true'` 를 제외한다 (CMP-160 규약).
--            새 컬럼·문자열 필터를 만들지 않는다.
--
-- 실행 전제: **CEO 승인 선행 필수.** CMP-202 결정 카드가 수락된 뒤에만 실행한다.
--            승인 전까지 326 은 무변경이다.
--
-- 실행:   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/qa/cmp202-consult-req-326-test-exclusion.sql
-- 롤백:   파일 하단 ROLLBACK 블록 (체크포인트에서 원본 JSONB 복원 = 키 2개 제거)
--
-- 멱등성: 재실행해도 최종 상태가 동일하다. 이미 표시된 경우 0건 갱신된다.

\set ON_ERROR_STOP on

BEGIN;

-- 가드 1: 대상이 판정 근거 4축과 정확히 일치하는 그 행인지 확인한다.
--         하나라도 어긋나면 다른 행을 건드리는 것이므로 즉시 중단한다.
DO $$
DECLARE r record;
BEGIN
  SELECT name, phone, building_name, status, pipeline_outcome
    INTO r
  FROM consult_req WHERE id = 326;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CMP-202 중단: consult_req id=326 이 존재하지 않습니다.';
  END IF;
  IF r.name NOT LIKE '%자동검증%' THEN
    RAISE EXCEPTION 'CMP-202 중단: id=326 의 이름에 자동검증 표식이 없습니다 (판정 근거 불일치).';
  END IF;
  IF length(r.phone) <> 3 THEN
    RAISE EXCEPTION 'CMP-202 중단: id=326 의 전화번호가 3자리가 아닙니다 (%자리).', length(r.phone);
  END IF;
  IF r.building_name <> 'CMP-106 테스트' THEN
    RAISE EXCEPTION 'CMP-202 중단: id=326 의 building_name 이 예상과 다릅니다 (%).', r.building_name;
  END IF;
  IF r.pipeline_outcome <> 'active' THEN
    RAISE EXCEPTION 'CMP-202 중단: id=326 의 pipeline_outcome 이 active 가 아닙니다 (%). 상황이 바뀐 것이므로 재판정하십시오.', r.pipeline_outcome;
  END IF;
  RAISE NOTICE 'CMP-202 가드 통과: id=326 판정 근거 4축 일치';
END $$;

-- 사전 체크포인트: 변경 전 marketing_attribution 원본을 영구 보존한다 (롤백 근거).
CREATE TABLE IF NOT EXISTS cmp202_consult_req_attr_checkpoint (
  id integer PRIMARY KEY,
  marketing_attribution_before jsonb,
  captured_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO cmp202_consult_req_attr_checkpoint (id, marketing_attribution_before)
SELECT id, marketing_attribution FROM consult_req WHERE id = 326
ON CONFLICT (id) DO NOTHING;  -- 재실행 시 최초 원본값을 덮어쓰지 않는다

-- 본 변경: 표시 2키 추가만. 기존 키 29개는 `||` 병합으로 그대로 남는다.
UPDATE consult_req
SET marketing_attribution = COALESCE(marketing_attribution, '{}'::jsonb)
      || jsonb_build_object('is_test', true, 'is_test_source', 'CMP-202'),
    updated_at = now()
WHERE id = 326
  AND COALESCE(marketing_attribution->>'is_test', '') <> 'true';

-- 사후 read-back 1: 표식이 붙었는가.
DO $$
DECLARE v text;
BEGIN
  SELECT marketing_attribution->>'is_test' INTO v FROM consult_req WHERE id = 326;
  IF v IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'CMP-202 중단: id=326 의 is_test 가 true 가 아닙니다 (%).', v;
  END IF;
END $$;

-- 사후 read-back 2: 기존 귀속 키가 소실되지 않았는가 (원본 키 전부 보존 + 2키 추가).
DO $$
DECLARE missing int;
BEGIN
  SELECT count(*) INTO missing
  FROM cmp202_consult_req_attr_checkpoint c,
       LATERAL jsonb_object_keys(COALESCE(c.marketing_attribution_before,'{}'::jsonb)) k
  WHERE c.id = 326
    AND NOT (SELECT marketing_attribution ? k FROM consult_req WHERE id = 326);
  IF missing <> 0 THEN
    RAISE EXCEPTION 'CMP-202 중단: 원본 귀속 키 %개가 소실됐습니다. 롤백하십시오.', missing;
  END IF;
END $$;

-- 사후 read-back 3: 행·상태 원형 보존 (삭제·상태 변경 금지 조건).
DO $$
DECLARE r record;
BEGIN
  SELECT status, pipeline_outcome INTO r FROM consult_req WHERE id = 326;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CMP-202 중단: id=326 행이 소실됐습니다. 롤백하십시오.';
  END IF;
  IF r.status <> 'DELETED' OR r.pipeline_outcome <> 'active' THEN
    RAISE EXCEPTION 'CMP-202 중단: id=326 의 status/pipeline_outcome 이 변경됐습니다 (%/%).', r.status, r.pipeline_outcome;
  END IF;
END $$;

-- 사후 read-back 4: 완료 조건 — 공간보감 스코프 active 중 테스트 제외 잔여가 0 이어야 한다.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM consult_req
  WHERE company_id = (SELECT company_id FROM consult_req WHERE id = 326)
    AND pipeline_outcome = 'active'
    AND COALESCE(marketing_attribution->>'is_test','') <> 'true';
  IF n <> 0 THEN
    RAISE EXCEPTION 'CMP-202 중단: active 중 테스트 미표시 건이 %건 남았습니다. 재판정이 필요합니다.', n;
  END IF;
  RAISE NOTICE 'CMP-202 OK: active_excluding_test = 0';
END $$;

COMMIT;

-- 변경 후 증거 출력 (CMP-202 원문 표와 같은 3지표)
SELECT
  count(*) FILTER (WHERE pipeline_outcome = 'active')::int AS active_raw,
  count(*) FILTER (WHERE pipeline_outcome = 'active'
                     AND COALESCE(marketing_attribution->>'is_test','') <> 'true')::int AS active_excluding_test,
  count(*) FILTER (WHERE pipeline_outcome = 'active'
                     AND COALESCE(marketing_attribution->>'is_test','') <> 'true'
                     AND status <> 'DELETED')::int AS active_excluding_test_and_deleted
FROM consult_req
WHERE company_id = (SELECT company_id FROM consult_req WHERE id = 326);


-- ============================================================================
-- ROLLBACK (필요 시 이 블록만 별도 실행)
-- ============================================================================
-- BEGIN;
--   UPDATE consult_req r
--   SET marketing_attribution = c.marketing_attribution_before,
--       updated_at = now()
--   FROM cmp202_consult_req_attr_checkpoint c
--   WHERE r.id = c.id AND r.marketing_attribution IS DISTINCT FROM c.marketing_attribution_before;
--   -- 확인: is_test 키가 사라졌는지
--   SELECT id, marketing_attribution ? 'is_test' AS still_marked
--   FROM consult_req WHERE id IN (SELECT id FROM cmp202_consult_req_attr_checkpoint);
-- COMMIT;
