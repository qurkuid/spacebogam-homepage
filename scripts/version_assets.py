#!/usr/bin/env python3
# CMP-255 — 공용 자산 캐시 버스팅 스탬퍼
#
# 왜: assets/site-tracking.js 는 GLOBAL_EXPERIMENT_VARIANT 같은 "즉시 반영" 레버를
# 담고 있는데, 참조 URL 이 고정이라 외부 캐시(특히 Meta 광고 인앱 브라우저)가
# 구버전을 계속 내려줬다(CMP-242: 약 13시간 동안 실험 B 배정 0건).
# 파일 내용 해시를 쿼리스트링(?v=)으로 붙여, 내용이 바뀌면 URL 도 바뀌게 한다.
#
# 사용:
#   python3 scripts/version_assets.py           # 스탬프 갱신 (커밋 전에 실행)
#   python3 scripts/version_assets.py --check   # 스탬프가 최신인지 검사만 (CI/하네스용)
#
# 정적 서버(python http.server)와 nginx 모두 쿼리스트링을 무시하고 같은 파일을
# 서빙하므로 배포 파이프라인 변경은 필요 없다.
import hashlib
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

# 모든 페이지가 공유하고, 내용이 바뀌면 즉시 반영돼야 하는 자산.
# funnel-tracking.js 는 HTML 이 아니라 site-tracking.js 가 동적 주입한다.
VERSIONED = [
    "assets/site-tracking.js",
    "assets/funnel-tracking.js",
    "assets/site-canonical.js",
    "assets/site.css",
    # CMP-252: 상담 폼은 Meta 인앱 브라우저 캐시에 남으면 오류·계측 수정이 배포돼도
    # 이전 자산이 계속 실행된다. 공용 추적 자산과 같은 내용 해시 계약을 적용한다.
    "assets/consultation-form.js",
]

HASH_LEN = 8
MAX_PASSES = 10


def short_hash(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:HASH_LEN]


def ref_pattern(name: str) -> re.Pattern:
    # /assets/site-tracking.js  또는  /assets/site-tracking.js?v=abcd1234
    # 뒤에 경로/확장자가 더 붙는 참조(.map 등)는 건드리지 않는다.
    return re.compile(r"(/" + re.escape(name) + r")(?:\?v=[0-9a-f]+)?(?![\w.\-])")


PATTERNS = [(name, ref_pattern(name)) for name in VERSIONED]


def stamp(text: str, hashes: dict) -> str:
    for name, pat in PATTERNS:
        text = pat.sub(r"\g<1>?v=" + hashes[name], text)
    return text


def targets():
    """스탬프를 적용할 파일: git 추적 HTML + 버전 대상 자산 자신(상호 참조).

    배포는 `git archive` 라 추적되는 파일만 공개된다. gitignore 된 로컬 전용
    HTML(data/blog/raw 등)까지 건드리면 불필요한 diff 만 생긴다.
    """
    # -z: 한글 파일명이 많아 quotepath 이스케이프를 피해야 한다.
    out = subprocess.run(["git", "-C", str(ROOT), "ls-files", "-z", "*.html"],
                         capture_output=True, text=True, check=True)
    for rel in out.stdout.split("\0"):
        if rel:
            yield ROOT / rel
    for name in VERSIONED:
        yield ROOT / name


def main() -> int:
    check_only = "--check" in sys.argv

    for name in VERSIONED:
        if not (ROOT / name).exists():
            print(f"[FAIL] 버전 대상 자산 없음: {name}")
            return 2

    pending = {}
    # 자산끼리 서로 참조하므로(site-tracking.js → funnel-tracking.js) 해시가
    # 안정될 때까지 반복한다. 순환 참조면 수렴하지 않고 에러로 끝난다.
    for _ in range(MAX_PASSES):
        hashes = {n: short_hash(ROOT / n) for n in VERSIONED}
        pending = {}
        asset_changed = False
        for path in targets():
            original = path.read_text(encoding="utf-8")
            stamped = stamp(original, hashes)
            if stamped == original:
                continue
            pending[path] = stamped
            if not check_only and path.name in {pathlib.Path(n).name for n in VERSIONED}:
                path.write_text(stamped, encoding="utf-8")
                asset_changed = True
        if not asset_changed:
            break
    else:
        print("[FAIL] 자산 참조가 수렴하지 않음 (순환 참조 의심)")
        return 2

    if check_only:
        if pending:
            rels = sorted(str(p.relative_to(ROOT)) for p in pending)
            print(f"[FAIL] 캐시 버스팅 스탬프 미갱신 {len(rels)}건 — "
                  f"`python3 scripts/version_assets.py` 실행 후 커밋하세요")
            for rel in rels[:5]:
                print(f"       - {rel}")
            if len(rels) > 5:
                print(f"       - … 외 {len(rels) - 5}건")
            return 1
        print(f"[PASS] 캐시 버스팅 스탬프 최신 "
              f"({', '.join(f'{pathlib.Path(n).name}={h}' for n, h in hashes.items())})")
        return 0

    for path, text in pending.items():
        path.write_text(text, encoding="utf-8")
    print(f"스탬프 갱신 {len(pending)}건 "
          f"({', '.join(f'{pathlib.Path(n).name}={h}' for n, h in hashes.items())})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
