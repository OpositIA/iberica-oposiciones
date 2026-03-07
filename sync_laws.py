from __future__ import annotations

import argparse
import logging
import sys

from law_sync import LawRagSyncer


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("law_sync")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Importador BOE consolidado -> law_watchlist/law_sync_log/rag_sources/rag_chunks/rag_reindex_jobs",
    )
    parser.add_argument(
        "boe_ids",
        nargs="*",
        help="IDs BOE concretos. Sin argumentos, usa law_watchlist activa.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Fuerza resincronización aunque fecha_actualizacion no haya cambiado.",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()

    syncer = LawRagSyncer.from_env()
    targets = syncer.resolve_targets(args.boe_ids)
    if not targets:
        log.warning("No hay leyes a procesar. Revisa law_watchlist o pasa BOE IDs por CLI.")
        return 0

    log.info("Sincronización BOE consolidado | leyes=%d | force=%s", len(targets), args.force)
    results = syncer.sync_many(targets, force=args.force)

    errors = [result for result in results if result.get("status") == "error"]
    unchanged = [result for result in results if result.get("status") == "unchanged"]
    synced = [result for result in results if result.get("status") == "synced"]

    log.info(
        "Completado | synced=%d | unchanged=%d | errors=%d",
        len(synced),
        len(unchanged),
        len(errors),
    )

    for result in errors:
        log.error("%s | %s", result.get("boe_id"), result.get("error"))

    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
