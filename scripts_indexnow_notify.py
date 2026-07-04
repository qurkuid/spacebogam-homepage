#!/usr/bin/env python3
# IndexNow 자동 제출 — git 커밋 범위의 변경 HTML 을 URL 로 매핑해 검색엔진에 알림
# 사용: python3 scripts_indexnow_notify.py [PREV] [CUR] [--dry-run]
#   기본 PREV=ORIG_HEAD CUR=HEAD (맥미니 post-merge 훅이 git pull 직후 호출)
import json
import subprocess
import sys
import urllib.parse
import urllib.request

HOST = "spacebogam.kr"
KEY = "214395339aba481e8c39a54d80578afd"
ENDPOINT = "https://api.indexnow.org/indexnow"
SKIP = {"404.html", "blog-admin.html", "naver-geo-audit.html", "search-registration.html"}
MAX_URLS = 500

def changed_files(prev, cur):
    out = subprocess.run(["git", "diff", "--name-only", prev, cur],
                         capture_output=True, text=True, check=True).stdout
    return [l.strip() for l in out.splitlines() if l.strip()]

def to_url(path):
    if not (path.endswith(".html") or path == "sitemap.xml"):
        return None
    if path.split("/")[-1] in SKIP or path.startswith(("tests/", "assets/")):
        return None
    if path == "index.html":
        rel = "/"
    elif path.endswith("/index.html"):
        rel = "/" + path[: -len("index.html")]
    else:
        rel = "/" + path
    return "https://" + HOST + urllib.parse.quote(rel)

def main():
    args = [a for a in sys.argv[1:] if a != "--dry-run"]
    dry = "--dry-run" in sys.argv
    prev, cur = (args + ["ORIG_HEAD", "HEAD"])[:2]
    try:
        files = changed_files(prev, cur)
    except subprocess.CalledProcessError as e:
        print(f"indexnow: git diff 실패 ({prev}..{cur}): {e}")
        return 0  # 훅에서 배포 자체를 막지 않음
    urls = sorted({u for u in (to_url(f) for f in files) if u})[:MAX_URLS]
    if not urls:
        print(f"indexnow: 제출할 URL 없음 ({prev}..{cur})")
        return 0
    payload = {"host": HOST, "key": KEY,
               "keyLocation": f"https://{HOST}/{KEY}.txt", "urlList": urls}
    print(f"indexnow: {len(urls)}건 제출 ({prev}..{cur})")
    for u in urls:
        print("  " + u)
    if dry:
        print("indexnow: --dry-run, 전송 생략")
        return 0
    req = urllib.request.Request(
        ENDPOINT, data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            print(f"indexnow: HTTP {r.status}")
    except urllib.error.HTTPError as e:
        print(f"indexnow: HTTP {e.code} — {e.read().decode()[:200]}")
    except Exception as e:
        print(f"indexnow: 전송 실패 — {e}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
