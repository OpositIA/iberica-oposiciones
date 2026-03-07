from __future__ import annotations

from pathlib import Path
import unittest

from scripts.ingest_boe_syllabus import (
    count_theme_matches,
    extract_annex_i,
    find_annex_i_bounds,
    parse_topics_and_subtopics,
    xml_to_lines,
)


FIXTURE_PATH = Path("tests/fixtures/boe/BOE-A-2025-27056.xml")


class BoeParserTests(unittest.TestCase):
    def test_extract_annex_i_real_boe_2025_27056(self) -> None:
        xml_bytes = FIXTURE_PATH.read_bytes()
        lines = xml_to_lines(xml_bytes)
        start_idx, end_idx, theme_count = find_annex_i_bounds(lines)
        annex_text = extract_annex_i(lines, bounds=(start_idx, end_idx, theme_count))

        self.assertGreaterEqual(theme_count, 10)
        self.assertGreaterEqual(count_theme_matches(annex_text.splitlines()), 10)
        self.assertFalse(annex_text.startswith("11."))
        self.assertIn("Tema 1.", annex_text)
        self.assertIn("Tema 2.", annex_text)

        topics, subtopics = parse_topics_and_subtopics(annex_text)
        self.assertGreaterEqual(len(topics), 2)
        self.assertGreaterEqual(len(subtopics), 10)

    def test_heuristic_avoids_false_annex_i_candidate(self) -> None:
        lines = [
            "Resolucion de convocatoria",
            "ANEXO I Solicitud de admision",
            "Modelo de instancia",
            "Firma del aspirante",
        ]
        lines.extend([f"Linea intermedia {idx}" for idx in range(300)])
        lines.extend(
            [
                "ANEXO I Programa",
                "Materias comunes",
                "Tema 1. Uno.",
                "Tema 2. Dos.",
                "Tema 3. Tres.",
                "ANEXO II Tribunal",
            ]
        )

        start_idx, end_idx, theme_count = find_annex_i_bounds(lines)
        self.assertEqual(start_idx, 304)
        self.assertEqual(end_idx, 309)
        self.assertEqual(theme_count, 3)

    def test_parse_continuation_lines_append_to_theme(self) -> None:
        annex_text = "\n".join(
            [
                "Materias comunes",
                "Tema 1. La potestad reglamentaria",
                "(concepto, limites y control)",
                "Tema 2. Procedimiento administrativo comun.",
            ]
        )
        _, subtopics = parse_topics_and_subtopics(annex_text)
        self.assertIn("concepto, limites y control", subtopics[0]["subtopic_title"])


if __name__ == "__main__":
    unittest.main()
