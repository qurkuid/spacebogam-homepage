#!/usr/bin/env python3
# 공간보감 랜딩 정적 회귀 검사 — 트래킹/SEO/자산 무결성
# 사용:
#   python3 tests/landing_check.py            # 검사 (baseline 대조)
#   python3 tests/landing_check.py --update   # 현재 상태를 baseline 으로 저장
import json, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASELINE = pathlib.Path(__file__).resolve().parent / "landing-baseline.json"
PAGES = ["index.html", "ab/home-b/index.html"]

# 페이지와 무관하게 항상 있어야 하는 트래킹 마커
REQUIRED_MARKERS = [
    "G-EJGXDD5C1T",            # GA4
    "512750840350337",         # Meta Pixel
    "site-tracking.js",        # 공용 트래킹 (전화/카카오/상담 CTA 계측)
    "GTM-PW8GLP8S",            # Google Tag Manager (2026-07-06 도입)
]
FORBIDDEN = [
    "images.unsplash.com",  # 스톡 이미지 금지
    "/ />",                 # 2026-07-04 원인불명 일괄 변형 재발 감지 (픽셀 noscript 태그 오염)
]

CTA_RE = re.compile(r'data-cta-location="([^"]+)"')
BODY_RE = re.compile(r'<body class="([^"]*)"')
JSONLD_RE = re.compile(r'<script type="application/ld\+json">(.*?)</script>', re.S)
CANONICAL_RE = re.compile(r'<link rel="canonical" href="([^"]+)"')
ASSET_RE = re.compile(r'''(?:href|src)=["']([^"']+)["']|url\(['"]?(/assets/[^'")]+)['"]?\)''')

def analyze(rel):
    p = ROOT / rel
    html = p.read_text(encoding="utf-8")
    ctas = sorted(set(CTA_RE.findall(html)))
    body = (BODY_RE.search(html) or [None, ""])[1]
    jsonld_blocks = JSONLD_RE.findall(html)
    jsonld_ok, jsonld_err = 0, []
    for i, block in enumerate(jsonld_blocks):
        try:
            json.loads(block)
            jsonld_ok += 1
        except json.JSONDecodeError as e:
            jsonld_err.append(f"block#{i + 1}: {e}")
    canonical = (CANONICAL_RE.search(html) or [None, None])[1]

    missing_assets = []
    for m in ASSET_RE.finditer(html):
        ref = m.group(1) or m.group(2)
        if not ref or ref.startswith(("http", "mailto:", "tel:", "#", "data:")):
            continue
        ref_path = ref.split("?")[0].split("#")[0]
        if not ref_path or ref_path.endswith("/"):  # 디렉토리 링크 (/consultation/ 등)
            target = ROOT / ref_path.lstrip("/") / "index.html" if ref_path else None
            if target and not target.exists():
                missing_assets.append(ref)
            continue
        base = ROOT if ref_path.startswith("/") else p.parent
        if not (base / ref_path.lstrip("/")).exists():
            missing_assets.append(ref)

    return {
        "cta_locations": ctas,
        "body_class": body,
        "jsonld_count": len(jsonld_blocks),
        "jsonld_ok": jsonld_ok,
        "jsonld_errors": jsonld_err,
        "canonical": canonical,
        "missing_markers": [k for k in REQUIRED_MARKERS if k not in html],
        "forbidden_hits": [k for k in FORBIDDEN if k in html],
        "missing_assets": missing_assets,
    }

def main():
    update = "--update" in sys.argv
    if update:
        base = {rel: {k: v for k, v in analyze(rel).items()
                      if k in ("cta_locations", "body_class", "jsonld_count", "canonical")}
                for rel in PAGES}
        BASELINE.write_text(json.dumps(base, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"baseline 갱신 → {BASELINE.relative_to(ROOT)}")
        return 0

    if not BASELINE.exists():
        print("baseline 없음 — 먼저 --update 로 생성하세요"); return 2
    base = json.loads(BASELINE.read_text(encoding="utf-8"))
    failures = 0
    for rel in PAGES:
        cur, exp = analyze(rel), base.get(rel, {})
        errs = []
        if cur["missing_markers"]:
            errs.append(f"트래킹 마커 누락: {cur['missing_markers']}")
        if cur["forbidden_hits"]:
            errs.append(f"금지 리소스: {cur['forbidden_hits']}")
        if cur["jsonld_errors"]:
            errs.append(f"JSON-LD 파싱 실패: {cur['jsonld_errors']}")
        if cur["missing_assets"]:
            errs.append(f"깨진 로컬 참조 {len(cur['missing_assets'])}건: {cur['missing_assets'][:5]}")
        if exp:
            lost = set(exp["cta_locations"]) - set(cur["cta_locations"])
            added = set(cur["cta_locations"]) - set(exp["cta_locations"])
            if lost:
                errs.append(f"CTA 계측 유실: {sorted(lost)}")
            if added:
                errs.append(f"CTA 신규 (의도했으면 --update): {sorted(added)}")
            if cur["body_class"] != exp["body_class"]:
                errs.append(f"body class 변경: '{exp['body_class']}' → '{cur['body_class']}' (A/B 변형 감지 깨짐)")
            if cur["jsonld_count"] != exp["jsonld_count"]:
                errs.append(f"JSON-LD 블록 수 변화: {exp['jsonld_count']} → {cur['jsonld_count']}")
            if cur["canonical"] != exp["canonical"]:
                errs.append(f"canonical 변경: {exp['canonical']} → {cur['canonical']}")
        status = "PASS" if not errs else "FAIL"
        print(f"[{status}] {rel}  (CTA {len(cur['cta_locations'])} · JSON-LD {cur['jsonld_ok']}/{cur['jsonld_count']})")
        for e in errs:
            print(f"       - {e}")
        failures += bool(errs)
    return 1 if failures else 0

if __name__ == "__main__":
    sys.exit(main())
