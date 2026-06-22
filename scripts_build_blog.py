#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path
from scripts_import_blog import BlogPost, write_outputs

ROOT = Path(__file__).resolve().parent
POSTS = ROOT / "data" / "blog" / "posts.json"

items = json.loads(POSTS.read_text(encoding="utf-8"))
posts = [BlogPost(**item) for item in items]
write_outputs(posts)
print(f"rebuilt {len(posts)} blog posts")
