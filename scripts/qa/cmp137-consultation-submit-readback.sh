#!/usr/bin/env bash
# CMP-140 / CMP-137: consultation_submit 단건 read-back 실행기 (읽기 전용)
#
# 같은 쿼리를 2회 실행하고 [3] 지문 줄을 비교해 event_id 집합 불변(멱등)을 판정한다.
#
# 사용법:
#   DATABASE_URL='postgresql://...' scripts/qa/cmp137-consultation-submit-readback.sh <sessionId-uuid>
#
# DATABASE_URL 은 환경변수로만 받는다. 스크립트/커밋/코멘트에 자격증명을 남기지 않는다.

set -euo pipefail

SESSION_ID="${1:-}"
SQL_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/cmp137-consultation-submit-readback.sql"

if [[ -z "$SESSION_ID" ]]; then
  echo "[CMP137] ERROR: 사용법: $0 <sessionId-uuid>" >&2
  exit 2
fi

if ! [[ "$SESSION_ID" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
  echo "[CMP137] ERROR: sessionId 가 UUID 형식이 아닙니다: $SESSION_ID" >&2
  exit 2
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[CMP137] ERROR: DATABASE_URL 환경변수가 필요합니다." >&2
  exit 2
fi

run_once() {
  psql -X --no-psqlrc -v ON_ERROR_STOP=1 \
    -v sessionId="$SESSION_ID" \
    -f "$SQL_FILE" \
    "$DATABASE_URL"
}

echo "########## RUN 1 ##########"
RUN1="$(run_once)"
echo "$RUN1"

echo ""
echo "########## RUN 2 ##########"
RUN2="$(run_once)"
echo "$RUN2"

FP1="$(printf '%s\n' "$RUN1" | grep -o 'CMP137_FINGERPRINT|.*' || true)"
FP2="$(printf '%s\n' "$RUN2" | grep -o 'CMP137_FINGERPRINT|.*' || true)"

echo ""
echo "########## 멱등 판정 ##########"
echo "run1: ${FP1:-<none>}"
echo "run2: ${FP2:-<none>}"

if [[ -n "$FP1" && "$FP1" == "$FP2" ]]; then
  echo "IDEMPOTENT_OK: event_id 집합이 두 실행 사이에 불변입니다."
else
  echo "IDEMPOTENT_FAIL: 지문이 다르거나 비어 있습니다." >&2
  exit 1
fi
