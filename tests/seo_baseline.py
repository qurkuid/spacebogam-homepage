#!/usr/bin/env python3
# 공간보감 사이트 전역 SEO 보존 회귀 — "기존 SEO 는 유지, 올리는 건 OK, 내리는 건 FAIL"
# 사용:
#   python3 tests/seo_baseline.py            # 검사 (baseline 대조, 하락만 FAIL)
#   python3 tests/seo_baseline.py --update   # 현재 상태를 baseline 으로 저장
#
# 검사 규칙 (페이지 단위):
#   - baseline 에 있던 페이지 파일이 사라지면 FAIL (URL 보존)
#   - canonical 이 변경/삭제되면 FAIL (추가는 OK)
#   - title / meta description / robots meta / og:title / og:image 가 "있다가 없어지면" FAIL
#   - JSON-LD 블록 수 감소 FAIL (증가 OK), JSON-LD 파싱 실패 FAIL
#   - JSON-LD @type 집합이 축소되면 FAIL (확장 OK)
#   - 트래킹 마커 (GTM/GA4/Pixel/site-tracking) 가 있다가 없어지면 FAIL
# 사이트 단위:
#   - sitemap.xml 의 <loc> 집합은 baseline 의 상위집합이어야 함 (URL 제거 FAIL)
#   - robots.txt / feed.xml / CNAME / .nojekyll / IndexNow 키 파일 존재 유지
import json, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASELINE = pathlib.Path(__file__).resolve().parent / "seo-baseline.json"

TRACKING = ["GTM-PW8GLP8S", "G-EJGXDD5C1T", "512750840350337", "site-tracking.js"]
SITE_FILES = ["robots.txt", "feed.xml", "CNAME", ".nojekyll", "214395339aba481e8c39a54d80578afd.txt"]

TITLE_RE = re.compile(r"<title>(.*?)</title>", re.S)
DESC_RE = re.compile(r'<meta name="description" content="([^"]*)"')
ROBOTS_RE = re.compile(r'<meta name="robots" content="([^"]*)"')
CANON_RE = re.compile(r'<link rel="canonical" href="([^"]+)"')
OGT_RE = re.compile(r'<meta property="og:title" content="([^"]*)"')
OGI_RE = re.compile(r'<meta property="og:image" content="([^"]*)"')
JSONLD_RE = re.compile(r'<script type="application/ld\+json">(.*?)</script>', re.S)
LOC_RE = re.compile(r"<loc>([^<]+)</loc>")


def pages():
    out = []
    for p in sorted(ROOT.glob("*.html")):
        out.append(p)
    for sub in sorted(ROOT.iterdir()):
        if sub.is_dir() and sub.name not in {".git", ".claude", "assets", "tests", "logs", "data", "node_modules"}:
            idx = sub / "index.html"
            if idx.exists():
                out.append(idx)
    for p in sorted((ROOT / "blog").glob("*.html")):
        out.append(p)
    return out


def jsonld_types(block):
    try:
        data = json.loads(block)
    except json.JSONDecodeError:
        return None
    t = data.get("@type") if isinstance(data, dict) else None
    if isinstance(t, list):
        return [str(x) for x in t]
    return [str(t)] if t else []


def analyze(path):
    html = path.read_text(encoding="utf-8")
    blocks = JSONLD_RE.findall(html)
    types, parse_errors = [], 0
    for b in blocks:
        ts = jsonld_types(b)
        if ts is None:
            parse_errors += 1
        else:
            types.extend(ts)
    return {
        "title": bool(TITLE_RE.search(html)),
        "description": bool(DESC_RE.search(html)),
        "robots_meta": bool(ROBOTS_RE.search(html)),
        "canonical": (CANON_RE.search(html) or [None, None])[1],
        "og_title": bool(OGT_RE.search(html)),
        "og_image": bool(OGI_RE.search(html)),
        "jsonld_count": len(blocks),
        "jsonld_types": sorted(set(types)),
        "jsonld_parse_errors": parse_errors,
        "tracking": sorted(k for k in TRACKING if k in html),
    }


def snapshot():
    site = {
        "sitemap_urls": sorted(set(LOC_RE.findall((ROOT / "sitemap.xml").read_text(encoding="utf-8")))),
        "site_files": sorted(f for f in SITE_FILES if (ROOT / f).exists()),
    }
    return {
        "site": site,
        "pages": {str(p.relative_to(ROOT)): analyze(p) for p in pages()},
    }


def main():
    if "--update" in sys.argv:
        BASELINE.write_text(json.dumps(snapshot(), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"SEO baseline 갱신 → {BASELINE.relative_to(ROOT)}")
        return 0

    if not BASELINE.exists():
        print("baseline 없음 — 먼저 --update 로 생성하세요")
        return 2
    base = json.loads(BASELINE.read_text(encoding="utf-8"))
    cur = snapshot()
    errs = []

    lost_urls = set(base["site"]["sitemap_urls"]) - set(cur["site"]["sitemap_urls"])
    if lost_urls:
        errs.append(f"sitemap URL 유실 {len(lost_urls)}건: {sorted(lost_urls)[:5]}")
    lost_files = set(base["site"]["site_files"]) - set(cur["site"]["site_files"])
    if lost_files:
        errs.append(f"사이트 파일 유실: {sorted(lost_files)}")

    for rel, b in base["pages"].items():
        c = cur["pages"].get(rel)
        if c is None:
            errs.append(f"{rel}: 페이지 삭제됨 (URL 보존 위반)")
            continue
        for flag in ("title", "description", "robots_meta", "og_title", "og_image"):
            if b[flag] and not c[flag]:
                errs.append(f"{rel}: {flag} 유실")
        if b["canonical"] and c["canonical"] != b["canonical"]:
            errs.append(f"{rel}: canonical 변경 {b['canonical']} → {c['canonical']}")
        if c["jsonld_count"] < b["jsonld_count"]:
            errs.append(f"{rel}: JSON-LD 블록 감소 {b['jsonld_count']} → {c['jsonld_count']}")
        lost_types = set(b["jsonld_types"]) - set(c["jsonld_types"])
        if lost_types:
            errs.append(f"{rel}: JSON-LD 타입 유실 {sorted(lost_types)}")
        if c["jsonld_parse_errors"]:
            errs.append(f"{rel}: JSON-LD 파싱 실패 {c['jsonld_parse_errors']}건")
        lost_track = set(b["tracking"]) - set(c["tracking"])
        if lost_track:
            errs.append(f"{rel}: 트래킹 마커 유실 {sorted(lost_track)}")

    # 신규 페이지도 파싱 오류는 잡는다 (하락은 아니지만 배포 전 결함)
    for rel, c in cur["pages"].items():
        if rel not in base["pages"] and c["jsonld_parse_errors"]:
            errs.append(f"{rel}: (신규) JSON-LD 파싱 실패 {c['jsonld_parse_errors']}건")

    n_new = len(set(cur["pages"]) - set(base["pages"]))
    if errs:
        print(f"[FAIL] SEO 보존 위반 {len(errs)}건 (페이지 {len(cur['pages'])}, 신규 {n_new})")
        for e in errs:
            print(f"  - {e}")
        return 1
    print(f"[PASS] SEO 보존 OK — 페이지 {len(cur['pages'])} (신규 {n_new}), sitemap {len(cur['site']['sitemap_urls'])} URL")
    return 0


if __name__ == "__main__":
    sys.exit(main())
