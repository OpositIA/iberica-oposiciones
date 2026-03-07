import hashlib
import logging
import os
import re
import unicodedata
import xml.etree.ElementTree as ET
from datetime import date
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Tuple

import requests

if TYPE_CHECKING:
    from supabase import Client
else:
    Client = Any


LOG = logging.getLogger("boe_ingest")

ANNEX_I_RE = re.compile(r"^ANEXO\s+I(?!\.\d)\b", re.IGNORECASE)
ANNEX_II_RE = re.compile(r"^ANEXO\s+II(?!\.\d)\b", re.IGNORECASE)
ANNEX_I_BLOCK_ANCHOR_RE = re.compile(r"^ANEXO\s+I(?:\.\d+){2,}\b", re.IGNORECASE)
THEME_RE = re.compile(r"^Tema\s*(\d+)\.\s*(.+)$", re.IGNORECASE)
BLOCK_RE = re.compile(r"^(Materias?\b|Bloque\b|M[oó]dulo\b|Parte\b)", re.IGNORECASE)
CONTENT_LOCALNAMES = {
    "p",
    "titulo",
    "epigrafe",
    "texto",
    "apartado",
    "subapartado",
    "item",
    "li",
    "th",
    "td",
    "caption",
    "anexo",
}
PUBLISHED_AT_LOCALNAMES = {"fecha_publicacion", "fecha"}
ANNEX_SCAN_WINDOW = 250
ANNEX_MIN_THEME_MATCHES = 3
THEME_CONTENT_CLASSES = {"parrafo", "parrafo_2"}


def build_supabase_client() -> "Client":
    from supabase import create_client

    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


def normalize_line(text: str) -> str:
    text = text.replace("\xa0", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def strip_accents(text: str) -> str:
    return "".join(
        char
        for char in unicodedata.normalize("NFKD", text)
        if not unicodedata.combining(char)
    )


def slugify(text: str, max_len: int = 120) -> str:
    value = strip_accents(text).lower()
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    if not value:
        value = "item"
    return value[:max_len].strip("-") or "item"


def unique_slug(base: str, used: set[str]) -> str:
    if base not in used:
        used.add(base)
        return base

    idx = 2
    while f"{base}-{idx}" in used:
        idx += 1

    value = f"{base}-{idx}"
    used.add(value)
    return value


def localname(tag: Any) -> str:
    if not isinstance(tag, str):
        return ""
    return tag.split("}")[-1].lower()


def fetch_xml(url_xml: str) -> bytes:
    response = requests.get(
        url_xml,
        timeout=45,
        headers={"Accept": "application/xml,text/xml,*/*"},
    )
    response.raise_for_status()
    return response.content


def xml_to_lines(xml_bytes: bytes) -> List[Dict[str, Optional[str]]]:
    root = ET.fromstring(xml_bytes)
    chunks: List[Dict[str, Optional[str]]] = []

    def element_class_name(element: ET.Element) -> Optional[str]:
        class_name = element.attrib.get("class")
        if class_name and class_name.strip():
            return class_name.strip()
        return None

    def visit(element: ET.Element) -> None:
        name = localname(element.tag)
        if name in CONTENT_LOCALNAMES:
            has_content_children = any(localname(child.tag) in CONTENT_LOCALNAMES for child in list(element))
            if has_content_children:
                for child in list(element):
                    visit(child)
                return

            text = normalize_line(
                " ".join(piece.strip() for piece in element.itertext() if piece and piece.strip())
            )
            if text:
                chunks.append(
                    {
                        "text": text,
                        "class_name": element_class_name(element),
                    }
                )
            return

        for child in list(element):
            visit(child)

    visit(root)

    if chunks and any(ANNEX_I_RE.match(line["text"]) for line in chunks):
        return chunks

    fallback_lines = [
        {
            "text": normalize_line(piece),
            "class_name": None,
        }
        for piece in root.itertext()
        if piece and normalize_line(piece)
    ]
    if fallback_lines:
        return fallback_lines

    if not chunks:
        fallback_lines = [
            {
                "text": normalize_line(piece),
                "class_name": None,
            }
            for piece in root.itertext()
            if piece and normalize_line(piece)
        ]
        return fallback_lines

    return chunks


def extract_published_at_from_xml(xml_bytes: bytes) -> Optional[date]:
    root = ET.fromstring(xml_bytes)

    for element in root.iter():
        if localname(element.tag) not in PUBLISHED_AT_LOCALNAMES:
            continue

        raw = normalize_line("".join(element.itertext()))
        if re.fullmatch(r"\d{8}", raw):
            return date(int(raw[0:4]), int(raw[4:6]), int(raw[6:8]))
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
            return date.fromisoformat(raw)

    return None


def count_theme_matches(lines: List[Dict[str, Optional[str]]]) -> int:
    return sum(1 for line in lines if THEME_RE.match(line["text"]))


def find_annex_i_bounds(lines: List[Dict[str, Optional[str]]]) -> Tuple[int, int, int]:
    annex_i_candidates = [idx for idx, line in enumerate(lines) if ANNEX_I_RE.match(line["text"])]
    if not annex_i_candidates:
        raise ValueError("No se encontró ninguna cabecera compatible con ANEXO I.")

    candidate_data: List[Tuple[int, int, int]] = []
    candidates_before_annex_ii: List[Tuple[int, int, int]] = []

    for candidate in annex_i_candidates:
        end_idx = next(
            (idx for idx in range(candidate + 1, len(lines)) if ANNEX_II_RE.match(lines[idx]["text"])),
            None,
        )
        if end_idx is None:
            continue

        window_lines = lines[candidate + 1 : candidate + 1 + ANNEX_SCAN_WINDOW]
        theme_count = count_theme_matches(window_lines)
        row = (candidate, end_idx, theme_count)
        candidate_data.append(row)
        candidates_before_annex_ii.append(row)

    if not candidate_data:
        raise ValueError("No se encontró ninguna cabecera compatible con ANEXO II tras ANEXO I.")

    valid_candidates = [row for row in candidate_data if row[2] >= ANNEX_MIN_THEME_MATCHES]
    if valid_candidates:
        selected_start, end_idx, selected_theme_count = max(valid_candidates, key=lambda row: (row[2], -row[0]))
        return selected_start, end_idx, selected_theme_count

    if candidates_before_annex_ii:
        selected_start, end_idx, selected_theme_count = candidates_before_annex_ii[-1]
        return selected_start, end_idx, selected_theme_count

    selected_start, end_idx, selected_theme_count = max(candidate_data, key=lambda row: (row[2], -row[0]))
    return selected_start, end_idx, selected_theme_count


def extract_annex_i(
    lines: List[Dict[str, Optional[str]]],
    bounds: Optional[Tuple[int, int, int]] = None,
) -> str:
    start_idx, end_idx, theme_count = bounds or find_annex_i_bounds(lines)
    LOG.info(
        "ANEXO I detectado: start_line_idx=%s end_line_idx=%s num_temas_detectados=%s",
        start_idx,
        end_idx,
        theme_count,
    )

    chunk = [normalize_line(line["text"]) for line in lines[start_idx:end_idx]]
    chunk = [line for line in chunk if line]
    if not chunk:
        raise ValueError("ANEXO I vacío.")
    return "\n".join(chunk).strip()


def should_skip_heading(line: Dict[str, Optional[str]]) -> bool:
    lowered = line["text"].lower()
    if lowered.startswith("programa para el ingreso"):
        return True
    if ANNEX_I_RE.match(line["text"]) or ANNEX_II_RE.match(line["text"]):
        return True
    return False


def looks_like_theme_continuation(line: Dict[str, Optional[str]], last_theme: Optional[Dict[str, Any]]) -> bool:
    if not last_theme:
        return False

    if line.get("class_name") and line["class_name"] not in THEME_CONTENT_CLASSES:
        return False

    stripped = line["text"].lstrip(" -\t")
    if not stripped:
        return False

    first = stripped[0]
    if first.islower():
        return True
    if first in "([{":
        return True
    if len(stripped) >= 80:
        return True

    return False


def parse_topics_and_subtopics(lines: List[Dict[str, Optional[str]]]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    normalized_lines = [
        {
            "text": normalize_line(line["text"]),
            "class_name": line.get("class_name"),
        }
        for line in lines
    ]
    normalized_lines = [line for line in normalized_lines if line["text"] and not should_skip_heading(line)]

    topics: List[Dict[str, Any]] = []
    subtopics: List[Dict[str, Any]] = []

    topic_code_used: set[str] = set()
    subtopic_code_used: set[str] = set()

    current_topic_code: Optional[str] = None
    current_block_title: Optional[str] = None
    last_theme: Optional[Dict[str, Any]] = None
    is_awaiting_anchored_block_title = False
    subtopic_order_by_topic: Dict[str, int] = {}

    def create_topic(raw_title: str) -> str:
        block_number = len(topics) + 1
        topic_title = f"Bloque {block_number}"
        code = unique_slug(f"bloque-{block_number}", topic_code_used)
        topics.append(
            {
                "topic_title": topic_title,
                "topic_code": code,
                "order_index": len(topics) + 1,
            }
        )
        subtopic_order_by_topic[code] = 0
        nonlocal current_block_title
        current_block_title = raw_title
        return code

    for line in normalized_lines:
        if line.get("class_name") == "centro_cursiva":
            last_theme = None
            continue

        if ANNEX_I_BLOCK_ANCHOR_RE.match(line["text"]):
            is_awaiting_anchored_block_title = True
            last_theme = None
            continue

        if line.get("class_name") == "centro_redonda":
            current_topic_code = create_topic(line["text"])
            is_awaiting_anchored_block_title = False
            last_theme = None
            continue

        if is_awaiting_anchored_block_title and not THEME_RE.match(line["text"]):
            current_topic_code = create_topic(line["text"])
            is_awaiting_anchored_block_title = False
            last_theme = None
            continue

        theme_match = THEME_RE.match(line["text"])
        if theme_match:
            is_awaiting_anchored_block_title = False
            if current_topic_code is None:
                current_topic_code = create_topic("General")

            topic_number = int(theme_match.group(1))
            theme_name = theme_match.group(2).strip().rstrip(".")
            subtopic_title = f"Tema {topic_number}. {theme_name}"

            subtopic_order_by_topic[current_topic_code] += 1
            order_index = subtopic_order_by_topic[current_topic_code]

            raw_code = f"tema-{topic_number}-{slugify(theme_name, 80)}"
            subtopic_code = unique_slug(slugify(raw_code, 140), subtopic_code_used)

            last_theme = {
                "parent_topic_code": current_topic_code,
                "subtopic_code": subtopic_code,
                "topic_number": topic_number,
                "subtopic_title": subtopic_title,
                "section_title": current_block_title,
                "order_index": order_index,
            }
            subtopics.append(last_theme)
            continue

        if BLOCK_RE.match(line["text"]):
            current_topic_code = create_topic(line["text"])
            is_awaiting_anchored_block_title = False
            last_theme = None
            continue

        if looks_like_theme_continuation(line, last_theme):
            assert last_theme is not None
            last_theme["subtopic_title"] = normalize_line(f"{last_theme['subtopic_title']} {line['text']}")
            continue

    if not topics:
        raise ValueError("No se detectaron bloques (topics).")
    if not subtopics:
        raise ValueError("No se detectaron temas (subtopics).")

    return topics, subtopics


def is_unique_violation(exc: Exception) -> bool:
    message = str(exc).lower()
    return "23505" in message or "duplicate key value" in message


def select_existing_syllabus_id(
    supabase: "Client", opposition_id: Any, sha256_hex: str
) -> Optional[int]:
    response = (
        supabase.table("opposition_syllabi")
        .select("id")
        .eq("opposition_id", opposition_id)
        .eq("sha256", sha256_hex)
        .limit(1)
        .execute()
    )
    if response.data:
        return int(response.data[0]["id"])
    return None


def build_legacy_raw_text(
    topic_rows: List[Dict[str, Any]],
    subtopic_rows: List[Dict[str, Any]],
) -> str:
    lines: List[str] = ["LEGACY BACKFILL"]
    subtopics_by_topic_id: Dict[int, List[Dict[str, Any]]] = {}

    for row in subtopic_rows:
        subtopics_by_topic_id.setdefault(int(row["opposition_topic_id"]), []).append(row)

    for topic in sorted(topic_rows, key=lambda row: (row.get("order_index") or 0, row["id"])):
        topic_label = topic.get("topic_title") or topic["topic_code"]
        lines.append(f"BLOQUE {topic.get('order_index') or 0}: {topic_label}")

        topic_subtopics = sorted(
            subtopics_by_topic_id.get(int(topic["id"]), []),
            key=lambda row: (row.get("order_index") or 0, row["id"]),
        )
        for subtopic in topic_subtopics:
            title = subtopic.get("subtopic_title") or subtopic["subtopic_code"]
            section = subtopic.get("section_title")
            if section:
                lines.append(f"  SECCION: {section}")
            if subtopic.get("topic_number") is not None:
                lines.append(f"  TEMA {subtopic['topic_number']}: {title}")
            else:
                lines.append(f"  ITEM {subtopic.get('order_index') or 0}: {title}")

    return "\n".join(lines)


def backfill_legacy_syllabus(
    opposition_id,
    boe_id: Optional[str] = None,
    source_url: Optional[str] = None,
):
    supabase = build_supabase_client()
    legacy_opposition_id = str(opposition_id)
    legacy_boe_id = boe_id or f"legacy-{opposition_id}"
    legacy_source_url = source_url or f"legacy://opposition/{opposition_id}"

    topic_response = (
        supabase.table("opposition_topics")
        .select("id, opposition_id, topic_code, topic_title, order_index, syllabus_id")
        .eq("opposition_id", legacy_opposition_id)
        .is_("syllabus_id", "null")
        .order("order_index")
        .execute()
    )
    topic_rows = topic_response.data or []
    if not topic_rows:
        LOG.info("No hay topics legacy sin syllabus para opposition_id=%s", opposition_id)
        return {"status": "no_legacy_topics", "opposition_id": opposition_id}

    topic_ids = [int(row["id"]) for row in topic_rows]
    subtopic_response = (
        supabase.table("opposition_subtopics")
        .select(
            "id, opposition_topic_id, subtopic_code, topic_number, subtopic_title, section_title, order_index, syllabus_id"
        )
        .in_("opposition_topic_id", topic_ids)
        .is_("syllabus_id", "null")
        .order("order_index")
        .execute()
    )
    subtopic_rows = subtopic_response.data or []

    raw_text = build_legacy_raw_text(topic_rows, subtopic_rows)
    sha256_hex = hashlib.sha256(raw_text.encode("utf-8")).hexdigest()

    existing_id = select_existing_syllabus_id(supabase, opposition_id, sha256_hex)
    if existing_id:
        LOG.info(
            "Backfill ya existente: opposition_id=%s syllabus_id=%s sha256=%s",
            opposition_id,
            existing_id,
            sha256_hex,
        )
        return {
            "status": "already_exists",
            "syllabus_id": existing_id,
            "sha256": sha256_hex,
        }

    syllabus_insert = (
        supabase.table("opposition_syllabi")
        .insert(
            {
                "opposition_id": opposition_id,
                "boe_id": legacy_boe_id,
                "source_url": legacy_source_url,
                "published_at": None,
                "sha256": sha256_hex,
                "raw_text": raw_text,
            }
        )
        .execute()
    )
    syllabus_id = int(syllabus_insert.data[0]["id"])

    supabase.table("opposition_topics").update({"syllabus_id": syllabus_id}).eq("opposition_id", legacy_opposition_id).is_(
        "syllabus_id", "null"
    ).execute()

    if topic_ids:
        supabase.table("opposition_subtopics").update({"syllabus_id": syllabus_id}).in_(
            "opposition_topic_id", topic_ids
        ).is_("syllabus_id", "null").execute()

    LOG.info(
        "Backfill legacy completado: opposition_id=%s syllabus_id=%s topics=%s subtopics=%s",
        opposition_id,
        syllabus_id,
        len(topic_rows),
        len(subtopic_rows),
    )
    return {
        "status": "backfilled",
        "syllabus_id": syllabus_id,
        "sha256": sha256_hex,
        "topics_count": len(topic_rows),
        "subtopics_count": len(subtopic_rows),
    }


def ingest_boe_syllabus(opposition_id, boe_id, url_xml=None):
    if url_xml is None:
        url_xml = f"https://www.boe.es/diario_boe/xml.php?id={boe_id}"

    supabase = build_supabase_client()

    LOG.info("Descargando XML BOE: boe_id=%s url_xml=%s", boe_id, url_xml)
    xml_bytes = fetch_xml(url_xml)
    lines = xml_to_lines(xml_bytes)
    published_at = extract_published_at_from_xml(xml_bytes)

    start_idx, end_idx, theme_count = find_annex_i_bounds(lines)
    LOG.info(
        "Ventana ANEXO I validada: start_line_idx=%s end_line_idx=%s num_temas_detectados=%s",
        start_idx,
        end_idx,
        theme_count,
    )

    annex_i_lines = lines[start_idx:end_idx]
    annex_i_text = extract_annex_i(lines, bounds=(start_idx, end_idx, theme_count))
    sha256_hex = hashlib.sha256(annex_i_text.encode("utf-8")).hexdigest()

    existing_id = select_existing_syllabus_id(supabase, opposition_id, sha256_hex)
    if existing_id:
        LOG.info(
            "Temario ya existe: opposition_id=%s syllabus_id=%s sha256=%s",
            opposition_id,
            existing_id,
            sha256_hex,
        )
        return {
            "status": "already_exists",
            "syllabus_id": existing_id,
            "sha256": sha256_hex,
        }

    topics, subtopics = parse_topics_and_subtopics(annex_i_lines)
    LOG.info(
        "Parseo completado: topics=%s subtopics=%s published_at=%s",
        len(topics),
        len(subtopics),
        published_at.isoformat() if published_at else None,
    )

    syllabus_id: Optional[int] = None
    try:
        syllabus_insert = (
            supabase.table("opposition_syllabi")
            .insert(
                {
                    "opposition_id": opposition_id,
                    "boe_id": boe_id,
                    "source_url": url_xml,
                    "published_at": published_at.isoformat() if published_at else None,
                    "sha256": sha256_hex,
                    "raw_text": annex_i_text,
                }
            )
            .execute()
        )
        syllabus_id = int(syllabus_insert.data[0]["id"])

        topic_rows = [
            {
                "syllabus_id": syllabus_id,
                "opposition_id": opposition_id,
                "topic_code": topic["topic_code"],
                "topic_title": topic["topic_title"],
                "order_index": topic["order_index"],
            }
            for topic in topics
        ]
        topic_insert = supabase.table("opposition_topics").insert(topic_rows).execute()
        topic_id_by_code = {row["topic_code"]: int(row["id"]) for row in (topic_insert.data or [])}
        if len(topic_id_by_code) != len(topic_rows):
            raise RuntimeError("No se pudieron mapear todos los topics insertados.")

        subtopic_rows = [
            {
                "syllabus_id": syllabus_id,
                "opposition_topic_id": topic_id_by_code[subtopic["parent_topic_code"]],
                "subtopic_code": subtopic["subtopic_code"],
                "topic_number": subtopic["topic_number"],
                "subtopic_title": subtopic["subtopic_title"],
                "section_title": subtopic["section_title"],
                "order_index": subtopic["order_index"],
            }
            for subtopic in subtopics
        ]
        supabase.table("opposition_subtopics").insert(subtopic_rows).execute()

        LOG.info(
            "Ingesta completada: syllabus_id=%s topics=%s subtopics=%s",
            syllabus_id,
            len(topic_rows),
            len(subtopic_rows),
        )
        return {
            "status": "inserted",
            "syllabus_id": syllabus_id,
            "sha256": sha256_hex,
            "topics_count": len(topic_rows),
            "subtopics_count": len(subtopic_rows),
            "start_line_idx": start_idx,
            "end_line_idx": end_idx,
            "num_temas_detectados": theme_count,
        }
    except Exception as exc:
        if is_unique_violation(exc):
            existing_id = select_existing_syllabus_id(supabase, opposition_id, sha256_hex)
            if existing_id:
                LOG.info(
                    "Versión creada en paralelo: opposition_id=%s syllabus_id=%s",
                    opposition_id,
                    existing_id,
                )
                return {
                    "status": "already_exists",
                    "syllabus_id": existing_id,
                    "sha256": sha256_hex,
                }

        LOG.exception("Error en la ingesta del BOE.")
        if syllabus_id is not None:
            try:
                supabase.table("opposition_syllabi").delete().eq("id", syllabus_id).execute()
                LOG.info("Rollback compensatorio aplicado: syllabus_id=%s", syllabus_id)
            except Exception:
                LOG.exception("Falló el rollback compensatorio: syllabus_id=%s", syllabus_id)
        raise


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")

    result = ingest_boe_syllabus(
        # Debe ser el id text real existente en public.oppositions.
        opposition_id="agente-hacienda",
        boe_id="BOE-A-2025-27056",
    )
    print(result)

    # Debug manual opcional:
    # xml_bytes = fetch_xml("https://www.boe.es/diario_boe/xml.php?id=BOE-A-2025-27056")
    # lines = xml_to_lines(xml_bytes)
    # bounds = find_annex_i_bounds(lines)
    # annex_i_text = extract_annex_i(lines, bounds=bounds)
    # print("\n".join(annex_i_text.splitlines()[:15]))
