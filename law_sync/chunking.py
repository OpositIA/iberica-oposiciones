from __future__ import annotations

import re
from dataclasses import dataclass


_SPLIT_RE = re.compile(r"(\n\n+)|(\n)|(?<=\.)\s+|(?<=;)\s+|(?<=:)\s+")
_ENUM_RE = re.compile(r"^\s*(\d+\.|\d+\)|[a-zA-Z]\)|[IVXLC]+\.)\s+")


def normalize_text(value: str) -> str:
    value = (value or "").replace("\u00a0", " ")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


@dataclass(frozen=True)
class ChunkConfig:
    max_chars: int = 7000
    min_chars: int = 800
    overlap_chars: int = 800


def smart_chunk(
    text: str,
    config: ChunkConfig,
) -> list[str]:
    text = normalize_text(text)
    if not text:
        return []
    if len(text) <= config.max_chars:
        return [text]

    parts = [part for part in _SPLIT_RE.split(text) if part and part.strip()]
    chunks: list[str] = []
    buffer = ""

    def push_buffer(value: str) -> None:
        value = value.strip()
        if value:
            chunks.append(value)

    for part in parts:
        part = part.strip()
        if not part:
            continue

        if not buffer:
            buffer = part
            continue

        if len(buffer) + 1 + len(part) <= config.max_chars:
            if _ENUM_RE.match(part):
                buffer += "\n" + part
            else:
                buffer += " " + part
            continue

        if len(buffer) < config.min_chars and len(part) < config.max_chars:
            buffer += " " + part
            continue

        push_buffer(buffer)

        if config.overlap_chars > 0 and len(buffer) > config.overlap_chars:
            tail = buffer[-config.overlap_chars :]
            buffer = (tail + " " + part).strip()
        else:
            buffer = part

    push_buffer(buffer)

    merged: list[str] = []
    for chunk in chunks:
        if merged and len(chunk) < config.min_chars:
            merged[-1] = (merged[-1] + "\n" + chunk).strip()
        else:
            merged.append(chunk)

    return merged
