from __future__ import annotations

import unittest

from law_sync.chunking import ChunkConfig
from law_sync.syncer import LawRagSyncer
from rag_worker.providers import EmbeddingConfig
from rag_worker.worker import RagEmbeddingWorker, WorkerConfig
from tests.fakes import InMemorySupabase


class FakeEmbeddingProvider:
    def __init__(self) -> None:
        self.calls = 0

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        self.calls += len(texts)
        return [[0.1, 0.2, 0.3] for _ in texts]


class RagWorkerTests(unittest.TestCase):
    def test_set_current_source_changes_is_current_flags(self) -> None:
        fake_supabase = InMemorySupabase(
            {
                "rag_sources": [
                    {"id": 1, "source_type": "law", "law_boe_id": "BOE-A-1", "is_current": True},
                    {"id": 2, "source_type": "law", "law_boe_id": "BOE-A-1", "is_current": False},
                ],
                "rag_chunks": [
                    {"id": 10, "rag_source_id": 1, "is_current": True},
                    {"id": 11, "rag_source_id": 2, "is_current": False},
                ],
            }
        )
        fake_supabase.rpc_handlers["set_current_rag_source"] = lambda _params: (_ for _ in ()).throw(
            RuntimeError("rpc unavailable")
        )
        syncer = LawRagSyncer(fake_supabase, boe_client=None, chunk_config=ChunkConfig())

        syncer._set_current_source("BOE-A-1", 2)

        sources = {row["id"]: row for row in fake_supabase.tables["rag_sources"]}
        chunks = {row["id"]: row for row in fake_supabase.tables["rag_chunks"]}
        self.assertFalse(sources[1]["is_current"])
        self.assertTrue(sources[2]["is_current"])
        self.assertFalse(chunks[10]["is_current"])
        self.assertTrue(chunks[11]["is_current"])

    def test_worker_does_not_regenerate_embeddings_when_hash_unchanged(self) -> None:
        content_hash = "a" * 64
        fake_supabase = InMemorySupabase(
            {
                "rag_reindex_jobs": [
                    {
                        "id": 1,
                        "source_type": "law",
                        "opposition_id": None,
                        "syllabus_id": None,
                        "rag_source_id": 10,
                        "law_boe_id": "BOE-A-1",
                        "status": "pending",
                        "reason": "law-updated",
                        "error_text": None,
                        "created_at": "2026-03-06T00:00:00Z",
                    }
                ],
                "rag_sources": [
                    {
                        "id": 10,
                        "source_type": "law",
                        "opposition_id": None,
                        "syllabus_id": None,
                        "law_boe_id": "BOE-A-1",
                        "title": "Ley de prueba",
                        "source_url": "https://example.test/law",
                        "is_current": True,
                        "metadata": {},
                    }
                ],
                "rag_chunks": [
                    {
                        "id": 100,
                        "rag_source_id": 10,
                        "opposition_id": None,
                        "syllabus_id": None,
                        "source_type": "law",
                        "chunk_index": 0,
                        "title": "Articulo 1",
                        "content": "Contenido de prueba",
                        "content_hash": content_hash,
                        "embedding": [0.1, 0.2, 0.3],
                        "embedding_content_hash": content_hash,
                        "is_current": True,
                        "metadata": {},
                    }
                ],
            }
        )
        provider = FakeEmbeddingProvider()
        worker = RagEmbeddingWorker(
            supabase=fake_supabase,
            provider=provider,
            worker_config=WorkerConfig(job_batch_size=1, embed_batch_size=4),
            embedding_config=EmbeddingConfig(
                provider="gemini",
                model="models/gemini-embedding-001",
                dimension=1536,
                retries=1,
                backoff_base=1.0,
            ),
        )

        results = worker.process_pending_jobs(limit=1, source_type="law")

        self.assertEqual(provider.calls, 0)
        self.assertEqual(results[0]["status"], "done")
        self.assertEqual(fake_supabase.tables["rag_reindex_jobs"][0]["status"], "done")


if __name__ == "__main__":
    unittest.main()
