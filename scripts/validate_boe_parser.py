from __future__ import annotations

import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.ingest_boe_syllabus import (
    count_theme_matches,
    extract_annex_i,
    fetch_xml,
    find_annex_i_bounds,
    parse_topics_and_subtopics,
    xml_to_lines,
)


DEFAULT_FIXTURE = Path("tests/fixtures/boe/BOE-A-2025-27056.xml")


def main() -> int:
    parser = argparse.ArgumentParser(description="Validacion manual del parser BOE ANEXO I")
    parser.add_argument("--fixture", default=str(DEFAULT_FIXTURE), help="Ruta a XML local.")
    parser.add_argument("--url-xml", default=None, help="Si se pasa, descarga XML oficial en vez de usar fixture local.")
    args = parser.parse_args()

    xml_bytes = fetch_xml(args.url_xml) if args.url_xml else Path(args.fixture).read_bytes()
    lines = xml_to_lines(xml_bytes)
    bounds = find_annex_i_bounds(lines)
    annex_text = extract_annex_i(lines, bounds=bounds)
    topics, subtopics = parse_topics_and_subtopics(annex_text)

    print(
        {
            "fixture": None if args.url_xml else args.fixture,
            "start_line_idx": bounds[0],
            "end_line_idx": bounds[1],
            "num_temas_detectados": bounds[2],
            "num_temas_en_anexo": count_theme_matches(annex_text.splitlines()),
            "topics_count": len(topics),
            "subtopics_count": len(subtopics),
            "first_lines": annex_text.splitlines()[:15],
        }
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
