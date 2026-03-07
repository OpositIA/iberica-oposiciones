from __future__ import annotations

from pathlib import Path
from unittest.mock import patch
import unittest

from scripts import ingest_boe_syllabus as syllabus
from tests.fakes import InMemorySupabase


FIXTURE_PATH = Path("tests/fixtures/boe/BOE-A-2025-27056.xml")


class SyllabusIngestTests(unittest.TestCase):
    def test_ingest_is_idempotent_by_hash(self) -> None:
        fake_supabase = InMemorySupabase(
            {
                "opposition_syllabi": [],
                "opposition_topics": [],
                "opposition_subtopics": [],
            }
        )
        xml_bytes = FIXTURE_PATH.read_bytes()

        with patch.object(syllabus, "build_supabase_client", return_value=fake_supabase), patch.object(
            syllabus, "fetch_xml", return_value=xml_bytes
        ):
            first = syllabus.ingest_boe_syllabus("agente-hacienda", "BOE-A-2025-27056")
            second = syllabus.ingest_boe_syllabus("agente-hacienda", "BOE-A-2025-27056")

        self.assertEqual(first["status"], "inserted")
        self.assertEqual(second["status"], "already_exists")
        self.assertEqual(len(fake_supabase.tables["opposition_syllabi"]), 1)
        self.assertEqual(first["sha256"], second["sha256"])


if __name__ == "__main__":
    unittest.main()
