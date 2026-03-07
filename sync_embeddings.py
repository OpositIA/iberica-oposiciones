from __future__ import annotations

import argparse
import json
import logging
from typing import Any

from rag_worker import RagEmbeddingWorker


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Worker de embeddings para rag_reindex_jobs")
    parser.add_argument("--limit", type=int, default=None, help="Núm. máximo de jobs a reclamar en esta ejecución.")
    parser.add_argument(
        "--source-type",
        choices=["law", "syllabus"],
        default=None,
        help="Filtra jobs por source_type.",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Nivel de logs.",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )

    worker = RagEmbeddingWorker.from_env()
    results: list[dict[str, Any]] = worker.process_pending_jobs(
        limit=args.limit,
        source_type=args.source_type,
    )
    print(json.dumps({"processed_jobs": len(results), "results": results}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
