from __future__ import annotations

import hashlib
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional, Sequence

from supabase import Client, create_client

from law_sync.chunking import ChunkConfig, smart_chunk

from .providers import EmbeddingConfig, EmbeddingProvider, create_embedding_provider


log = logging.getLogger("rag_embeddings.worker")


@dataclass(frozen=True)
class WorkerConfig:
    job_batch_size: int = int(os.environ.get("JOB_BATCH_SIZE", "5"))
    embed_batch_size: int = int(os.environ.get("EMBED_BATCH_SIZE", "16"))
    chunk_max_chars: int = int(os.environ.get("RAG_CHUNK_MAX_CHARS", "7000"))
    chunk_min_chars: int = int(os.environ.get("RAG_CHUNK_MIN_CHARS", "800"))
    chunk_overlap_chars: int = int(os.environ.get("RAG_CHUNK_OVERLAP_CHARS", "800"))


class RagEmbeddingWorker:
    def __init__(
        self,
        supabase: Client,
        provider: EmbeddingProvider,
        worker_config: WorkerConfig,
        embedding_config: EmbeddingConfig,
    ) -> None:
        self.supabase = supabase
        self.provider = provider
        self.worker_config = worker_config
        self.embedding_config = embedding_config

    @classmethod
    def from_env(cls) -> "RagEmbeddingWorker":
        supabase_url = os.environ.get("SUPABASE_URL", "").strip()
        supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        if not supabase_url or not supabase_key:
            raise RuntimeError("Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY")

        worker_config = WorkerConfig()
        embedding_config = EmbeddingConfig()
        supabase = create_client(supabase_url, supabase_key)
        provider = create_embedding_provider(embedding_config)
        return cls(
            supabase=supabase,
            provider=provider,
            worker_config=worker_config,
            embedding_config=embedding_config,
        )

    def process_pending_jobs(
        self,
        limit: Optional[int] = None,
        source_type: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        claim_limit = limit or self.worker_config.job_batch_size
        claimed_jobs = self._claim_jobs(claim_limit, source_type=source_type)
        if not claimed_jobs:
            log.info("No hay jobs pendientes.")
            return []

        results: list[dict[str, Any]] = []
        for job in claimed_jobs:
            job_id = int(job["id"])
            try:
                result = self._process_job(job)
                self._update_job_status(job_id, "done", error_text=None)
                results.append(result)
            except Exception as exc:
                log.exception("Fallo procesando rag_reindex_job=%s", job_id)
                self._update_job_status(job_id, "error", error_text=str(exc))
                results.append(
                    {
                        "job_id": job_id,
                        "source_type": job.get("source_type"),
                        "status": "error",
                        "error": str(exc),
                    }
                )
        return results

    def _claim_jobs(self, limit: int, source_type: Optional[str]) -> list[dict[str, Any]]:
        response = (
            self.supabase.rpc(
                "claim_rag_reindex_jobs",
                {
                    "p_limit": max(limit, 1),
                    "p_source_type": source_type,
                },
            )
            .execute()
        )
        return response.data or []

    def _process_job(self, job: dict[str, Any]) -> dict[str, Any]:
        source = self._resolve_target_source(job)
        if not source:
            raise RuntimeError("No se encontro rag_source para el job.")

        source_id = int(source["id"])
        current_chunks = self._fetch_chunks(source_id=source_id, is_current=True)
        if not current_chunks and source.get("source_type") == "syllabus":
            current_chunks = self._ensure_syllabus_chunks(source, job)

        obsolete_chunks = self._fetch_chunks(source_id=source_id, is_current=False)
        if not current_chunks:
            raise RuntimeError(f"rag_source {source_id} no tiene chunks vigentes.")

        chunks_to_embed = [
            chunk
            for chunk in current_chunks
            if chunk.get("embedding") is None
            or not chunk.get("embedding_content_hash")
            or chunk.get("embedding_content_hash") != chunk.get("content_hash")
        ]
        unchanged_chunks = len(current_chunks) - len(chunks_to_embed)

        embedded_now = 0
        for batch in self._batched(chunks_to_embed, self.worker_config.embed_batch_size):
            try:
                vectors = self.provider.embed_documents([chunk["content"] for chunk in batch])
                for chunk, vector in zip(batch, vectors, strict=True):
                    self._update_chunk_embedding(int(chunk["id"]), vector, str(chunk["content_hash"]))
                    embedded_now += 1
            except Exception:
                for chunk in batch:
                    try:
                        vector = self.provider.embed_documents([chunk["content"]])[0]
                        self._update_chunk_embedding(int(chunk["id"]), vector, str(chunk["content_hash"]))
                        embedded_now += 1
                    except Exception as chunk_exc:
                        self._update_chunk_embedding_error(int(chunk["id"]), str(chunk_exc))
                        raise

        log.info(
            "Job %s | source=%s | current_chunks=%s | embedded_now=%s | unchanged=%s | obsolete=%s",
            job["id"],
            source_id,
            len(current_chunks),
            embedded_now,
            unchanged_chunks,
            len(obsolete_chunks),
        )

        return {
            "job_id": int(job["id"]),
            "rag_source_id": source_id,
            "source_type": source["source_type"],
            "status": "done",
            "embedded_now": embedded_now,
            "unchanged_chunks": unchanged_chunks,
            "obsolete_chunks": len(obsolete_chunks),
            "current_chunks": len(current_chunks),
        }

    def _resolve_target_source(self, job: dict[str, Any]) -> Optional[dict[str, Any]]:
        if job.get("rag_source_id") is not None:
            return self._maybe_single(
                self.supabase.table("rag_sources")
                .select("id,source_type,opposition_id,syllabus_id,law_boe_id,title,source_url,source_hash,is_current,metadata")
                .eq("id", job["rag_source_id"])
            )

        source_type = job.get("source_type")
        query = (
            self.supabase.table("rag_sources")
            .select("id,source_type,opposition_id,syllabus_id,law_boe_id,title,source_url,source_hash,is_current,metadata")
            .eq("source_type", source_type)
            .eq("is_current", True)
        )

        if source_type == "law" and job.get("law_boe_id"):
            query = query.eq("law_boe_id", job["law_boe_id"])
        elif source_type == "syllabus" and job.get("syllabus_id") is not None:
            query = query.eq("syllabus_id", job["syllabus_id"])
        elif source_type == "syllabus" and job.get("opposition_id") is not None:
            query = query.eq("opposition_id", job["opposition_id"]).order("updated_at", desc=True)
        else:
            return None

        source = self._maybe_single(query)
        if source or source_type != "syllabus":
            return source

        return self._ensure_syllabus_source(job)

    def _fetch_chunks(self, source_id: int, is_current: bool) -> list[dict[str, Any]]:
        response = (
            self.supabase.table("rag_chunks")
            .select(
                "id,rag_source_id,opposition_id,syllabus_id,source_type,chunk_index,title,content,content_hash,"
                "embedding,embedding_content_hash,is_current,metadata"
            )
            .eq("rag_source_id", source_id)
            .eq("is_current", is_current)
            .order("chunk_index")
            .execute()
        )
        return response.data or []

    def _maybe_single(self, query: Any) -> Optional[dict[str, Any]]:
        try:
            response = query.limit(1).execute()
            if response is None:
                return None

            data = getattr(response, "data", None)
            if not data:
                return None

            if isinstance(data, list):
                return data[0] if data else None

            if isinstance(data, dict):
                return data

            return None
        except Exception as exc:
            message = str(exc)
            if "406" in message or "0 rows" in message or "JSON could not be generated" in message:
                return None
            raise

    def _get_syllabus_row(self, job: dict[str, Any]) -> Optional[dict[str, Any]]:
        if job.get("syllabus_id") is not None:
            return self._maybe_single(
                self.supabase.table("opposition_syllabi")
                .select("id,opposition_id,boe_id,source_url,published_at,sha256,raw_text,is_current,updated_at")
                .eq("id", job["syllabus_id"])
            )

        if job.get("opposition_id") is None:
            return None

        return self._maybe_single(
            self.supabase.table("opposition_syllabi")
            .select("id,opposition_id,boe_id,source_url,published_at,sha256,raw_text,is_current,updated_at")
            .eq("opposition_id", job["opposition_id"])
            .eq("is_current", True)
            .order("updated_at", desc=True)
        )

    def _ensure_syllabus_source(self, job: dict[str, Any]) -> Optional[dict[str, Any]]:
        syllabus = self._get_syllabus_row(job)
        if not syllabus:
            return None

        source_hash = str(syllabus.get("sha256") or self._sha256_hex(str(syllabus.get("raw_text") or "")))
        source = self._maybe_single(
            self.supabase.table("rag_sources")
            .select("id,source_type,opposition_id,syllabus_id,law_boe_id,title,source_url,source_hash,is_current,metadata")
            .eq("source_type", "syllabus")
            .eq("syllabus_id", syllabus["id"])
            .eq("source_hash", source_hash)
        )

        if not source:
            self.supabase.table("rag_sources").insert(
                {
                    "source_type": "syllabus",
                    "opposition_id": syllabus["opposition_id"],
                    "syllabus_id": syllabus["id"],
                    "law_boe_id": None,
                    "title": self._build_syllabus_title(syllabus),
                    "source_url": syllabus["source_url"],
                    "source_hash": source_hash,
                    "is_current": False,
                    "metadata": {
                        "boe_id": syllabus["boe_id"],
                        "published_at": syllabus.get("published_at"),
                        "source_kind": "opposition_syllabus",
                    },
                }
            ).execute()
            source = self._maybe_single(
                self.supabase.table("rag_sources")
                .select("id,source_type,opposition_id,syllabus_id,law_boe_id,title,source_url,source_hash,is_current,metadata")
                .eq("source_type", "syllabus")
                .eq("syllabus_id", syllabus["id"])
                .eq("source_hash", source_hash)
            )
            if not source:
                raise RuntimeError(f"No se pudo crear rag_source para syllabus_id={syllabus['id']}")

        self._ensure_syllabus_chunks(source, {"syllabus_id": syllabus["id"], "opposition_id": syllabus["opposition_id"]})
        if syllabus.get("is_current"):
            self._set_current_syllabus_source(int(source["id"]), str(syllabus["opposition_id"]))
            source["is_current"] = True
        return source

    def _ensure_syllabus_chunks(self, source: dict[str, Any], job: dict[str, Any]) -> list[dict[str, Any]]:
        source_id = int(source["id"])
        current_chunks = self._fetch_chunks(source_id=source_id, is_current=True)
        if current_chunks:
            return current_chunks

        syllabus = self._get_syllabus_row(job)
        if not syllabus:
            return []

        raw_text = str(syllabus.get("raw_text") or "").strip()
        if not raw_text:
            return []

        chunk_texts = smart_chunk(
            raw_text,
            ChunkConfig(
                max_chars=self.worker_config.chunk_max_chars,
                min_chars=self.worker_config.chunk_min_chars,
                overlap_chars=self.worker_config.chunk_overlap_chars,
            ),
        )
        if not chunk_texts:
            chunk_texts = [raw_text]

        title = self._build_syllabus_title(syllabus)
        payload = [
            {
                "rag_source_id": source_id,
                "opposition_id": syllabus["opposition_id"],
                "syllabus_id": syllabus["id"],
                "source_type": "syllabus",
                "chunk_index": index,
                "title": title if len(chunk_texts) == 1 else f"{title} ({index + 1}/{len(chunk_texts)})",
                "content": content,
                "content_hash": self._sha256_hex(content),
                "metadata": {
                    "boe_id": syllabus["boe_id"],
                    "published_at": syllabus.get("published_at"),
                    "source_kind": "opposition_syllabus",
                    "chunk_total": len(chunk_texts),
                },
                "is_current": bool(syllabus.get("is_current")),
            }
            for index, content in enumerate(chunk_texts)
        ]
        self.supabase.table("rag_chunks").upsert(payload, on_conflict="rag_source_id,chunk_index").execute()
        return self._fetch_chunks(source_id=source_id, is_current=bool(syllabus.get("is_current")))

    def _set_current_syllabus_source(self, source_id: int, opposition_id: str) -> None:
        try:
            self.supabase.rpc("set_current_rag_source", {"p_rag_source_id": source_id}).execute()
            return
        except Exception:
            pass

        old_sources_response = (
            self.supabase.table("rag_sources")
            .select("id")
            .eq("source_type", "syllabus")
            .eq("opposition_id", opposition_id)
            .neq("id", source_id)
            .eq("is_current", True)
            .execute()
        )
        old_source_ids = [int(row["id"]) for row in (old_sources_response.data or [])]

        self.supabase.table("rag_sources").update({"is_current": False}).eq("source_type", "syllabus").eq(
            "opposition_id", opposition_id
        ).neq("id", source_id).execute()

        if old_source_ids:
            self.supabase.table("rag_chunks").update({"is_current": False}).in_("rag_source_id", old_source_ids).execute()

        self.supabase.table("rag_sources").update({"is_current": True}).eq("id", source_id).execute()
        self.supabase.table("rag_chunks").update({"is_current": True}).eq("rag_source_id", source_id).execute()

    def _update_chunk_embedding(self, chunk_id: int, embedding: Sequence[float], content_hash: str) -> None:
        now_iso = datetime.now(timezone.utc).isoformat()
        self.supabase.table("rag_chunks").update(
            {
                "embedding": list(embedding),
                "embedding_content_hash": content_hash,
                "embedding_provider": self.embedding_config.provider,
                "embedding_model": self.embedding_config.model,
                "embedding_updated_at": now_iso,
                "embedding_error": None,
            }
        ).eq("id", chunk_id).execute()

    def _update_chunk_embedding_error(self, chunk_id: int, error_text: str) -> None:
        self.supabase.table("rag_chunks").update(
            {
                "embedding_error": error_text[:2000],
            }
        ).eq("id", chunk_id).execute()

    def _update_job_status(self, job_id: int, status: str, error_text: Optional[str]) -> None:
        payload: dict[str, Any] = {
            "status": status,
            "error_text": error_text,
        }
        self.supabase.table("rag_reindex_jobs").update(payload).eq("id", job_id).execute()

    @staticmethod
    def _build_syllabus_title(syllabus: dict[str, Any]) -> str:
        raw_text = str(syllabus.get("raw_text") or "")
        for line in (line.strip() for line in raw_text.splitlines()):
            if not line or line.upper().startswith("ANEXO"):
                continue
            return line[:500]
        return f"Temario {syllabus.get('opposition_id')}"

    @staticmethod
    def _sha256_hex(value: str) -> str:
        return hashlib.sha256(value.encode("utf-8")).hexdigest()

    @staticmethod
    def _batched(items: Sequence[dict[str, Any]], batch_size: int) -> list[Sequence[dict[str, Any]]]:
        if batch_size <= 0:
            batch_size = 1
        return [items[index : index + batch_size] for index in range(0, len(items), batch_size)]
