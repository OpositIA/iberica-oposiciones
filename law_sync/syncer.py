from __future__ import annotations

import hashlib
import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

from supabase import Client, create_client

from .boe_api import BoeConsolidatedClient, HttpConfig, LawMetadata, LawUnit
from .chunking import ChunkConfig, smart_chunk
from .legacy_laws import LEGACY_LAW_LABELS


log = logging.getLogger("law_sync")

UPSERT_BATCH_SIZE = 100


@dataclass(frozen=True)
class SyncTarget:
    boe_id: str
    label: str


@dataclass(frozen=True)
class LawChunk:
    chunk_index: int
    title: str
    content: str
    content_hash: str
    metadata: dict[str, Any]


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class LawRagSyncer:
    def __init__(
        self,
        supabase: Client,
        boe_client: BoeConsolidatedClient,
        chunk_config: ChunkConfig,
    ) -> None:
        self.supabase = supabase
        self.boe_client = boe_client
        self.chunk_config = chunk_config

    @classmethod
    def from_env(cls) -> "LawRagSyncer":
        supabase_url = os.environ.get("SUPABASE_URL", "").strip()
        supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        if not supabase_url or not supabase_key:
            raise RuntimeError("Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY")

        supabase = create_client(supabase_url, supabase_key)
        boe_client = BoeConsolidatedClient(http_config=HttpConfig())
        chunk_config = ChunkConfig()
        return cls(supabase=supabase, boe_client=boe_client, chunk_config=chunk_config)

    def resolve_targets(self, boe_ids: list[str] | None = None) -> list[SyncTarget]:
        boe_ids = [value.strip() for value in (boe_ids or []) if value.strip()]
        if boe_ids:
            return self._resolve_explicit_targets(boe_ids)
        return self._resolve_watchlist_targets()

    def _resolve_watchlist_targets(self) -> list[SyncTarget]:
        response = (
            self.supabase.table("law_watchlist")
            .select("boe_id,label")
            .eq("is_active", True)
            .order("boe_id")
            .execute()
        )
        rows = response.data or []
        return [SyncTarget(boe_id=row["boe_id"], label=row["label"]) for row in rows]

    def _resolve_explicit_targets(self, boe_ids: list[str]) -> list[SyncTarget]:
        response = (
            self.supabase.table("law_watchlist")
            .select("boe_id,label")
            .in_("boe_id", boe_ids)
            .execute()
        )
        rows = response.data or []
        by_id = {row["boe_id"]: row["label"] for row in rows}

        targets: list[SyncTarget] = []
        for boe_id in boe_ids:
            label = by_id.get(boe_id) or LEGACY_LAW_LABELS.get(boe_id) or boe_id
            targets.append(SyncTarget(boe_id=boe_id, label=label))
        return targets

    def sync_many(self, targets: list[SyncTarget], force: bool = False) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        for target in targets:
            try:
                results.append(self.sync_one(target, force=force))
            except Exception as exc:
                log.exception("Fallo sincronizando %s", target.boe_id)
                results.append(
                    {
                        "boe_id": target.boe_id,
                        "label": target.label,
                        "status": "error",
                        "error": str(exc),
                    }
                )
        return results

    def sync_one(self, target: SyncTarget, force: bool = False) -> dict[str, Any]:
        log.info("Ley %s | %s", target.boe_id, target.label)
        metadata = self.boe_client.get_metadata(target.boe_id)
        sync_log = self._get_sync_log(target.boe_id)

        if (
            not force
            and sync_log
            and metadata.fecha_actualizacion
            and sync_log.get("fecha_actualizacion") == metadata.fecha_actualizacion
        ):
            log.info("Sin cambios en %s (%s). Se omite.", target.boe_id, metadata.fecha_iso or "?")
            return {
                "boe_id": target.boe_id,
                "label": target.label,
                "status": "unchanged",
                "fecha_actualizacion": metadata.fecha_actualizacion,
            }

        blocks = self.boe_client.get_index_blocks(target.boe_id)
        units: list[LawUnit] = []
        for block in blocks:
            try:
                units.extend(self.boe_client.get_block_units(block))
            except Exception as exc:
                log.warning("Bloque %s no procesado para %s: %s", block.bloque_id, target.boe_id, exc)

        if not units:
            raise RuntimeError(f"No se extrajo contenido útil para {target.boe_id}")

        chunks = self._build_chunks(target, metadata, units)
        source_hash = self._build_source_hash(target.boe_id, chunks)
        existing_source = self._get_source_by_hash(target.boe_id, source_hash)

        source_id: Optional[int] = None
        created_new_source = False

        try:
            if existing_source:
                source_id = int(existing_source["id"])
                self._update_existing_source(source_id, metadata, target, source_hash, len(chunks), len(units))
            else:
                source_id = self._insert_source(metadata, target, source_hash, len(chunks), len(units))
                created_new_source = True

            self._sync_chunks(source_id, chunks)
            self._set_current_source(target.boe_id, source_id)
            self._upsert_sync_log(metadata, len(chunks))
            self._ensure_reindex_job(target.boe_id, source_id, reason="law-updated")

            log.info(
                "Ley %s sincronizada | chunks=%d | source_hash=%s",
                target.boe_id,
                len(chunks),
                source_hash,
            )
            return {
                "boe_id": target.boe_id,
                "label": target.label,
                "status": "synced",
                "source_id": source_id,
                "source_hash": source_hash,
                "blocks_total": len(blocks),
                "units_total": len(units),
                "chunks_total": len(chunks),
                "created_new_source": created_new_source,
            }
        except Exception:
            if created_new_source and source_id is not None:
                self.supabase.table("rag_sources").delete().eq("id", source_id).execute()
            raise

    def _build_chunks(
        self,
        target: SyncTarget,
        metadata: LawMetadata,
        units: list[LawUnit],
    ) -> list[LawChunk]:
        chunks: list[LawChunk] = []
        chunk_index = 0

        for unit in units:
            unit_chunks = smart_chunk(unit.content, self.chunk_config)
            for ordinal, content in enumerate(unit_chunks, start=1):
                content_hash = sha256_hex(content)
                chunk_title = unit.unit_title if len(unit_chunks) == 1 else f"{unit.unit_title} ({ordinal}/{len(unit_chunks)})"
                chunk_metadata = {
                    "boe_id": metadata.boe_id,
                    "label": target.label,
                    "titulo_ley": metadata.titulo_ley,
                    "eli": metadata.eli,
                    "fecha_actualizacion": metadata.fecha_actualizacion,
                    "fecha_iso": metadata.fecha_iso,
                    "bloque_id": unit.bloque_id,
                    "bloque_titulo": unit.bloque_titulo,
                    "unit_id": unit.unit_id,
                    "unit_type": unit.unit_type,
                    "unit_title": unit.unit_title,
                    "chunk_ordinal": ordinal,
                    "unit_chunks_total": len(unit_chunks),
                    "fecha_vigencia": unit.fecha_vigencia,
                    "fecha_publicacion": unit.fecha_publicacion,
                    "source_kind": "supporting_law",
                }
                chunks.append(
                    LawChunk(
                        chunk_index=chunk_index,
                        title=chunk_title[:500],
                        content=content,
                        content_hash=content_hash,
                        metadata=chunk_metadata,
                    )
                )
                chunk_index += 1

        if not chunks:
            raise RuntimeError(f"No se generaron chunks para {metadata.boe_id}")
        return chunks

    @staticmethod
    def _build_source_hash(boe_id: str, chunks: list[LawChunk]) -> str:
        payload = [
            {
                "boe_id": boe_id,
                "chunk_index": chunk.chunk_index,
                "content_hash": chunk.content_hash,
                "title": chunk.title,
            }
            for chunk in chunks
        ]
        serialized = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return sha256_hex(serialized)

    def _get_sync_log(self, boe_id: str) -> Optional[dict[str, Any]]:
        response = (
            self.supabase.table("law_sync_log")
            .select("boe_id,fecha_actualizacion")
            .eq("boe_id", boe_id)
            .maybe_single()
            .execute()
        )
        return response.data or None

    def _get_source_by_hash(self, boe_id: str, source_hash: str) -> Optional[dict[str, Any]]:
        response = (
            self.supabase.table("rag_sources")
            .select("id,is_current")
            .eq("source_type", "law")
            .eq("law_boe_id", boe_id)
            .eq("source_hash", source_hash)
            .limit(1)
            .maybe_single()
            .execute()
        )
        return response.data or None

    def _insert_source(
        self,
        metadata: LawMetadata,
        target: SyncTarget,
        source_hash: str,
        chunks_total: int,
        units_total: int,
    ) -> int:
        response = (
            self.supabase.table("rag_sources")
            .insert(
                {
                    "source_type": "law",
                    "opposition_id": None,
                    "syllabus_id": None,
                    "law_boe_id": metadata.boe_id,
                    "title": metadata.titulo_ley,
                    "source_url": metadata.url_norma,
                    "source_hash": source_hash,
                    "is_current": False,
                    "metadata": {
                        "label": target.label,
                        "eli": metadata.eli,
                        "fecha_actualizacion": metadata.fecha_actualizacion,
                        "fecha_iso": metadata.fecha_iso,
                        "chunks_total": chunks_total,
                        "units_total": units_total,
                    },
                }
            )
            .select("id")
            .single()
            .execute()
        )
        return int(response.data["id"])

    def _update_existing_source(
        self,
        source_id: int,
        metadata: LawMetadata,
        target: SyncTarget,
        source_hash: str,
        chunks_total: int,
        units_total: int,
    ) -> None:
        self.supabase.table("rag_sources").update(
            {
                "title": metadata.titulo_ley,
                "source_url": metadata.url_norma,
                "source_hash": source_hash,
                "metadata": {
                    "label": target.label,
                    "eli": metadata.eli,
                    "fecha_actualizacion": metadata.fecha_actualizacion,
                    "fecha_iso": metadata.fecha_iso,
                    "chunks_total": chunks_total,
                    "units_total": units_total,
                },
            }
        ).eq("id", source_id).execute()

    def _sync_chunks(self, source_id: int, chunks: list[LawChunk]) -> None:
        existing_response = (
            self.supabase.table("rag_chunks")
            .select("id,chunk_index")
            .eq("rag_source_id", source_id)
            .execute()
        )
        existing_rows = existing_response.data or []
        existing_indexes = {int(row["chunk_index"]) for row in existing_rows}
        new_indexes = {chunk.chunk_index for chunk in chunks}

        for batch_start in range(0, len(chunks), UPSERT_BATCH_SIZE):
            batch = chunks[batch_start : batch_start + UPSERT_BATCH_SIZE]
            payload = [
                {
                    "rag_source_id": source_id,
                    "opposition_id": None,
                    "syllabus_id": None,
                    "source_type": "law",
                    "chunk_index": chunk.chunk_index,
                    "title": chunk.title,
                    "content": chunk.content,
                    "content_hash": chunk.content_hash,
                    "metadata": chunk.metadata,
                    "is_current": True,
                }
                for chunk in batch
            ]
            self.supabase.table("rag_chunks").upsert(
                payload,
                on_conflict="rag_source_id,chunk_index",
            ).execute()

        stale_indexes = sorted(existing_indexes - new_indexes)
        for batch_start in range(0, len(stale_indexes), UPSERT_BATCH_SIZE):
            batch = stale_indexes[batch_start : batch_start + UPSERT_BATCH_SIZE]
            self.supabase.table("rag_chunks").update({"is_current": False}).eq("rag_source_id", source_id).in_(
                "chunk_index", batch
            ).execute()

    def _set_current_source(self, boe_id: str, source_id: int) -> None:
        try:
            self.supabase.rpc("set_current_rag_source", {"p_rag_source_id": source_id}).execute()
            return
        except Exception:
            pass

        old_sources_response = (
            self.supabase.table("rag_sources")
            .select("id")
            .eq("source_type", "law")
            .eq("law_boe_id", boe_id)
            .neq("id", source_id)
            .eq("is_current", True)
            .execute()
        )
        old_source_ids = [int(row["id"]) for row in (old_sources_response.data or [])]

        self.supabase.table("rag_sources").update({"is_current": False}).eq("source_type", "law").eq(
            "law_boe_id", boe_id
        ).neq("id", source_id).execute()

        if old_source_ids:
            self.supabase.table("rag_chunks").update({"is_current": False}).in_("rag_source_id", old_source_ids).execute()

        self.supabase.table("rag_sources").update({"is_current": True}).eq("id", source_id).execute()
        self.supabase.table("rag_chunks").update({"is_current": True}).eq("rag_source_id", source_id).execute()

    def _upsert_sync_log(self, metadata: LawMetadata, chunks_total: int) -> None:
        self.supabase.table("law_sync_log").upsert(
            {
                "boe_id": metadata.boe_id,
                "titulo_ley": metadata.titulo_ley,
                "fecha_actualizacion": metadata.fecha_actualizacion,
                "fecha_iso": metadata.fecha_iso,
                "url_norma": metadata.url_norma,
                "eli": metadata.eli,
                "chunks_total": chunks_total,
                "last_sync_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="boe_id",
        ).execute()

    def _ensure_reindex_job(self, boe_id: str, source_id: int, reason: str) -> None:
        pending = (
            self.supabase.table("rag_reindex_jobs")
            .select("id,status")
            .eq("source_type", "law")
            .eq("law_boe_id", boe_id)
            .in_("status", ["pending", "processing"])
            .order("created_at", desc=True)
            .limit(1)
            .maybe_single()
            .execute()
        )

        if pending.data:
            self.supabase.table("rag_reindex_jobs").update(
                {
                    "rag_source_id": source_id,
                    "status": "pending",
                    "reason": reason,
                    "error_text": None,
                }
            ).eq("id", pending.data["id"]).execute()
            return

        self.supabase.table("rag_reindex_jobs").insert(
            {
                "source_type": "law",
                "opposition_id": None,
                "syllabus_id": None,
                "rag_source_id": source_id,
                "law_boe_id": boe_id,
                "status": "pending",
                "reason": reason,
                "error_text": None,
            }
        ).execute()
