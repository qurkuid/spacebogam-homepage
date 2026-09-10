"""Pure-stdlib image spec checks for portfolio case photos.

No third-party deps (Pillow etc.) on purpose: this runs on a machine
where we should not add new installed packages without approval.
Reads just enough of JPEG/PNG/WebP headers to get width/height.
"""
from __future__ import annotations

import struct
from dataclasses import dataclass
from pathlib import Path

MAX_THUMBNAIL_BYTES = 500 * 1024
MAX_DETAIL_BYTES = 1_200 * 1024
MIN_THUMBNAIL_WIDTH = 800
MIN_DETAIL_WIDTH = 1200
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".webp"}


@dataclass
class ImageInfo:
    path: Path
    width: int | None
    height: int | None
    size_bytes: int
    format: str


def _read_png_size(data: bytes) -> tuple[int, int] | None:
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    width, height = struct.unpack(">II", data[16:24])
    return width, height


def _read_jpeg_size(data: bytes) -> tuple[int, int] | None:
    if data[:2] != b"\xff\xd8":
        return None
    i = 2
    n = len(data)
    while i < n:
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in (0xD8, 0xD9):
            i += 2
            continue
        if 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        seg_len = struct.unpack(">H", data[i + 2 : i + 4])[0]
        if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
            height, width = struct.unpack(">HH", data[i + 5 : i + 9])
            return width, height
        i += 2 + seg_len
    return None


def _read_webp_size(data: bytes) -> tuple[int, int] | None:
    if data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        return None
    chunk = data[12:16]
    if chunk == b"VP8 ":
        width, height = struct.unpack("<HH", data[26:30])
        return width & 0x3FFF, height & 0x3FFF
    if chunk == b"VP8L":
        b0, b1, b2, b3 = data[21:25]
        width = 1 + (((b1 & 0x3F) << 8) | b0)
        height = 1 + (((b3 & 0x0F) << 10) | (b2 << 2) | (b1 >> 6))
        return width, height
    if chunk == b"VP8X":
        width = 1 + (data[24] | (data[25] << 8) | (data[26] << 16))
        height = 1 + (data[27] | (data[28] << 8) | (data[29] << 16))
        return width, height
    return None


def read_image_info(path: Path) -> ImageInfo:
    data = path.read_bytes()
    size_bytes = len(data)
    ext = path.suffix.lower()
    dims = None
    fmt = ext.lstrip(".")
    if ext == ".png":
        dims = _read_png_size(data)
        fmt = "png"
    elif ext in (".jpg", ".jpeg"):
        dims = _read_jpeg_size(data)
        fmt = "jpeg"
    elif ext == ".webp":
        dims = _read_webp_size(data)
        fmt = "webp"
    width, height = dims if dims else (None, None)
    return ImageInfo(path=path, width=width, height=height, size_bytes=size_bytes, format=fmt)


def check_image(path: Path, role: str) -> list[str]:
    """role: 'thumbnail' or 'detail'. Returns a list of spec violations (empty = OK)."""
    problems: list[str] = []
    ext = path.suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        problems.append(f"허용되지 않는 형식({ext}) — JPEG 또는 WebP만 가능")
        return problems
    if not path.exists():
        problems.append("파일을 찾을 수 없음")
        return problems
    if not (path.stem.replace("-", "").isascii() and path.stem.islower() or path.stem.replace("-", "").isdigit()):
        if any(c for c in path.stem if not (c.isascii() and (c.islower() or c.isdigit() or c == "-"))):
            problems.append("파일명은 영문 소문자·숫자·하이픈만 사용해야 함 (한글/공백/특수문자 금지)")
    info = read_image_info(path)
    max_bytes = MAX_THUMBNAIL_BYTES if role == "thumbnail" else MAX_DETAIL_BYTES
    if info.size_bytes > max_bytes:
        problems.append(
            f"파일 용량 초과: {info.size_bytes // 1024}KB > {max_bytes // 1024}KB 기준"
        )
    if info.width is not None:
        min_width = MIN_THUMBNAIL_WIDTH if role == "thumbnail" else MIN_DETAIL_WIDTH
        if info.width < min_width:
            problems.append(f"가로 해상도 부족: {info.width}px < 최소 {min_width}px")
    else:
        problems.append("이미지 크기를 읽을 수 없음 (파일 손상 가능성)")
    return problems
