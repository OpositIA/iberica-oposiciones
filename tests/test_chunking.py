from __future__ import annotations

import unittest

from law_sync.chunking import ChunkConfig, smart_chunk


class ChunkingTests(unittest.TestCase):
    def test_smart_chunk_splits_large_text_with_overlap(self) -> None:
        text = ("Articulo 1. Texto de prueba para chunking. " * 80).strip()
        chunks = smart_chunk(
            text,
            ChunkConfig(
                max_chars=400,
                min_chars=120,
                overlap_chars=60,
            ),
        )

        self.assertGreater(len(chunks), 1)
        self.assertLessEqual(max(len(chunk) for chunk in chunks), 460)
        self.assertTrue(any(chunks[index][-40:] in chunks[index + 1] for index in range(len(chunks) - 1)))


if __name__ == "__main__":
    unittest.main()
