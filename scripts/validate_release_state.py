from __future__ import annotations

import json
import os
import sys

from supabase import create_client


def get_client():
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        raise RuntimeError("Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, key)


def count_duplicates(rows: list[dict], key_fn):
    counts = {}
    for row in rows:
        key = key_fn(row)
        counts[key] = counts.get(key, 0) + 1
    return {key: value for key, value in counts.items() if value > 1}


def main() -> int:
    supabase = get_client()

    syllabi = (
        supabase.table("opposition_syllabi")
        .select("id,opposition_id,is_current")
        .eq("is_current", True)
        .execute()
        .data
        or []
    )
    rag_sources = (
        supabase.table("rag_sources")
        .select("id,source_type,syllabus_id,law_boe_id,is_current")
        .eq("is_current", True)
        .execute()
        .data
        or []
    )
    rag_chunks = (
        supabase.table("rag_chunks")
        .select("id,rag_source_id,is_current")
        .eq("is_current", True)
        .execute()
        .data
        or []
    )
    jobs = (
        supabase.table("rag_reindex_jobs")
        .select("id,source_type,status,opposition_id,syllabus_id,law_boe_id")
        .in_("status", ["pending", "processing", "error"])
        .execute()
        .data
        or []
    )
    retrieval_sample = (
        supabase.table("rag_retrieval_chunks")
        .select("chunk_id,rag_source_id,source_type,opposition_id,syllabus_id,source_url")
        .limit(5)
        .execute()
        .data
        or []
    )

    current_syllabi_dupes = count_duplicates(syllabi, lambda row: row["opposition_id"])
    current_law_source_dupes = count_duplicates(
        [row for row in rag_sources if row["source_type"] == "law"],
        lambda row: row["law_boe_id"],
    )
    current_syllabus_source_dupes = count_duplicates(
        [row for row in rag_sources if row["source_type"] == "syllabus"],
        lambda row: row["syllabus_id"],
    )
    current_source_ids = {row["id"] for row in rag_sources}
    orphan_current_chunks = [row for row in rag_chunks if row["rag_source_id"] not in current_source_ids]

    report = {
        "current_syllabi_count": len(syllabi),
        "current_rag_sources_count": len(rag_sources),
        "current_rag_chunks_count": len(rag_chunks),
        "jobs_open_count": len(jobs),
        "current_syllabi_duplicates": current_syllabi_dupes,
        "current_law_source_duplicates": current_law_source_dupes,
        "current_syllabus_source_duplicates": current_syllabus_source_dupes,
        "orphan_current_chunks": orphan_current_chunks,
        "retrieval_sample": retrieval_sample,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))

    if current_syllabi_dupes or current_law_source_dupes or current_syllabus_source_dupes or orphan_current_chunks:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
