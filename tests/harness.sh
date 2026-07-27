#!/bin/sh
# 공간보감 랜딩 하네스 — 정적 검사 + 런타임 회귀 (3중 어설션) 원커맨드
# 사용: sh tests/harness.sh [포트]     (기본 4890)
#   라이브 대상: SPACEBOGAM_URL=https://spacebogam.kr sh tests/harness.sh
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGEHAND="$HOME/Documents/intm-stagehand"
PORT="${1:-4890}"

echo "── 1/3 정적 검사 (트래킹 마커·CTA baseline·JSON-LD·자산) ──"
python3 "$ROOT/tests/landing_check.py"

echo "── 2/3 퍼널 ingest 계약 (클라이언트 payload ↔ intm .strict() 스키마) ──"
python3 "$ROOT/tests/funnel_contract_check.py"

echo "── 3/3 런타임 회귀 (Stagehand) ──"
if [ -n "$SPACEBOGAM_URL" ]; then
  URL="$SPACEBOGAM_URL"; SERVER_PID=""
else
  ( cd "$ROOT" && python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 ) &
  SERVER_PID=$!
  trap '[ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null' EXIT
  sleep 1
  URL="http://127.0.0.1:$PORT"
fi
cd "$STAGEHAND" && SPACEBOGAM_URL="$URL" ./node_modules/.bin/tsx tests/spacebogam-landing.spec.ts
