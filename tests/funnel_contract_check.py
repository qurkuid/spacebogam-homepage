#!/usr/bin/env python3
"""퍼널 이벤트 전송측(클라이언트) ↔ 수신측(intm) 계약 검사 — CMP-141

수신 스키마가 `.strict()` 라서 미지 키가 하나라도 섞이면 모든 이벤트가
HTTP 400 으로 거부되고, 클라이언트는 그것을 조용히 삼켰다(= 100% 유실).
이 검사는 그 조합을 배포 전에 잡는다.

사용:
  python3 tests/funnel_contract_check.py          # 정적 검사만 (기본, 외부 쓰기 없음)
  python3 tests/funnel_contract_check.py --live   # 운영 ingest 에 합성 이벤트 1건 POST 후 2xx 확인
                                                  # (원장에 utm_source=qa 로 표시되는 행이 생김)
"""
import json
import pathlib
import re
import subprocess
import sys
import uuid
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parent.parent
CLIENT = ROOT / "assets" / "funnel-tracking.js"
SCHEMA = pathlib.Path(__file__).resolve().parent / "funnel-event-schema.json"

KEY_RE = re.compile(r"^\s{6}([A-Za-z_][A-Za-z0-9_]*)\s*:")
ASSIGN_RE = re.compile(r"payload\.([A-Za-z_][A-Za-z0-9_]*)\s*=")
SEND_RE = re.compile(r"send\('([a-z_]+)'")


def payload_keys(source):
    """send() 안의 payload 객체 리터럴 키 + payload.X 대입 키를 모은다."""
    start = source.index("var payload = {")
    depth, end = 0, None
    for i in range(source.index("{", start), len(source)):
        if source[i] == "{":
            depth += 1
        elif source[i] == "}":
            depth -= 1
            if depth == 0:
                end = i
                break
    if end is None:
        raise SystemExit("payload 객체 리터럴의 끝을 찾지 못했습니다 — 검사기를 갱신하세요")
    literal = source[start:end]
    keys = [m.group(1) for line in literal.splitlines() for m in [KEY_RE.match(line)] if m]
    keys += ASSIGN_RE.findall(source)
    return keys


def build_probe(keys, schema):
    """클라이언트가 실제로 보내는 키 집합 그대로 합성 payload 를 만든다."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    sample = {
        "eventId": str(uuid.uuid4()),
        "clientId": str(uuid.uuid4()),
        "sessionId": str(uuid.uuid4()),
        "eventName": "page_view",
        "pagePath": "/",
        "pageTitle": "contract probe",
        "occurredAt": now,
        "utmSource": "qa",
        "utmMedium": "qa_test",
        "utmCampaign": "cmp141-contract",
        "utmContent": "",
        "utmTerm": "",
        "ctaLocation": "",
        "ctaText": "",
        "pageVariant": "home_a_default",
        "experimentId": "homepage_headline_v1",
        "experimentVariant": "A",
        "deviceType": "desktop",
        "scrollDepth": 50,
        "engagedSeconds": 10,
        "formId": "",
    }
    unknown = [k for k in keys if k not in sample]
    if unknown:  # 스키마에 없는 키도 그대로 실어서 서버가 거부하는지 확인한다
        for k in unknown:
            sample[k] = "probe"
    return {k: sample[k] for k in keys}, schema["endpoint"]


def live_probe(payload, endpoint):
    # urllib 대신 curl — macOS python 의 CA 번들이 시스템 신뢰 저장소를 못 읽는 환경이 있다.
    result = subprocess.run(
        ["curl", "-sS", "-m", "15", "-w", "\n%{http_code}", "-X", "POST", endpoint,
         "-H", "Origin: https://spacebogam.kr",
         "-H", "Content-Type: application/json",
         "--data-binary", "@-"],
        input=json.dumps(payload), capture_output=True, text=True,
    )
    if result.returncode != 0:
        return 0, (result.stderr or "curl failed").strip()
    body, _, code = result.stdout.rpartition("\n")
    return int(code or 0), body


def main():
    source = CLIENT.read_text(encoding="utf-8")
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    allowed = set(schema["required"]) | set(schema["optional"])

    keys = payload_keys(source)
    errs = []

    duplicates = sorted({k for k in keys if keys.count(k) > 1})
    if duplicates:
        errs.append(f"payload 중복 키: {duplicates}")

    unknown = sorted(set(keys) - allowed)
    if unknown:
        errs.append(f"수신 스키마(.strict())에 없는 키 → 전량 400: {unknown}")

    missing = sorted(set(schema["required"]) - set(keys))
    if missing:
        errs.append(f"필수 키 누락: {missing}")

    sent_events = sorted(set(SEND_RE.findall(source)))
    bad_events = [e for e in sent_events if e not in schema["event_names"]]
    if bad_events:
        errs.append(f"수신 enum 에 없는 eventName: {bad_events}")

    if ".catch(function(){})" in source:
        errs.append("전송 실패를 빈 catch 로 삼킴 — 재시도/관측 신호 필요")

    status = "PASS" if not errs else "FAIL"
    print(f"[{status}] funnel 계약  (payload 키 {len(set(keys))} · eventName {len(sent_events)})")
    for e in errs:
        print(f"       - {e}")

    if "--live" in sys.argv:
        payload, endpoint = build_probe(keys, schema)
        code, body = live_probe(payload, endpoint)
        ok = 200 <= code < 300
        print(f"[{'PASS' if ok else 'FAIL'}] 운영 ingest 왕복  HTTP {code} {body.strip()}")
        print(f"       sessionId={payload['sessionId']}")
        if not ok:
            errs.append(f"운영 ingest 거부 HTTP {code}")

    return 1 if errs else 0


if __name__ == "__main__":
    sys.exit(main())
