#!/usr/bin/env bash
# CMP-141: 퍼널 ingest 단일 세션 왕복 검사
#
# assets/funnel-tracking.js 가 실제로 만드는 payload 키 집합 그대로
# page_view → engaged_session → consultation_click 을 한 세션으로 전송하고
# 각 응답 코드를 출력한다. 원장 read-back 은 출력된 sessionId 로 이어서 수행한다.
#
# 사용법:
#   scripts/qa/cmp141-funnel-session.sh [variant]        # variant 기본값 A
#
# 원장에 utm_source=qa / utm_medium=qa_test / utm_campaign=cmp141 로 표시되는
# QA 행이 3건 생긴다. 개인정보·자유서술 필드는 보내지 않는다.

set -euo pipefail

ENDPOINT="https://intm.kr/api/marketing/funnel-events"
ORIGIN="https://spacebogam.kr"
EXPERIMENT_ID="homepage_headline_v1"
VARIANT="${1:-A}"

lower_uuid() { uuidgen | tr 'A-Z' 'a-z'; }

SESSION_ID="$(lower_uuid)"
CLIENT_ID="$(lower_uuid)"
PAGE_VARIANT="home_a_default"
[[ "$VARIANT" == "B" ]] && PAGE_VARIANT="home_b_visit_stage_standard"

echo "[CMP141] sessionId=$SESSION_ID clientId=$CLIENT_ID variant=$VARIANT"

send() {
  local event_name="$1" extra="$2" cta_location="$3" cta_text="$4"
  local body
  body="$(cat <<EOF
{"eventId":"$(lower_uuid)","clientId":"$CLIENT_ID","sessionId":"$SESSION_ID","eventName":"$event_name","pagePath":"/","pageTitle":"공간보감 | CMP-141 ingest check","occurredAt":"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)","utmSource":"qa","utmMedium":"qa_test","utmCampaign":"cmp141","utmContent":"","utmTerm":"","experimentId":"$EXPERIMENT_ID","experimentVariant":"$VARIANT","ctaLocation":"$cta_location","ctaText":"$cta_text","pageVariant":"$PAGE_VARIANT","deviceType":"desktop"$extra}
EOF
)"
  local out code
  out="$(printf '%s' "$body" | curl -sS -m 15 -w $'\n%{http_code}' -X POST "$ENDPOINT" \
    -H "Origin: $ORIGIN" -H 'Content-Type: application/json' --data-binary @-)"
  code="${out##*$'\n'}"
  echo "[CMP141] $event_name -> HTTP $code ${out%$'\n'*}"
  [[ "$code" =~ ^2 ]] || return 1
}

send page_view '' '' ''
send engaged_session ',"engagedSeconds":10' '' ''
send consultation_click '' 'hero' '무료 상담 신청'

echo "[CMP141] PASS — 3건 모두 2xx. read-back sessionId: $SESSION_ID"
