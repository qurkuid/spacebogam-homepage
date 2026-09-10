#!/usr/bin/env python3
"""CEO-facing entrypoint: rebuild portfolio case pages from data/cases/cases.json.

Usage: python3 scripts_build_case.py
"""
from __future__ import annotations

from scripts_case_builder import build_all


def main() -> None:
    result = build_all(write=True)
    published = result["published"]
    skipped = result["skipped"]
    print(f"발행됨: {len(published)}건")
    for case in published:
        print(f"  ✓ case-{case.slug}.html")
    if skipped:
        print(f"건너뜀: {len(skipped)}건 (발행 전 체크리스트 미통과)")
        for case, problems in skipped:
            print(f"  ✗ {case.slug}")
            for p in problems:
                print(f"      - {p}")
    if not published and not skipped:
        print("등록된 사례가 없습니다 (data/cases/cases.json 확인)")


if __name__ == "__main__":
    main()
