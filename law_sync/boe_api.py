from __future__ import annotations

import logging
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import Optional

import requests

from .chunking import normalize_text


log = logging.getLogger("law_sync")


@dataclass(frozen=True)
class HttpConfig:
    timeout: int = 60
    retries: int = 6
    backoff_base: float = 2.0


@dataclass(frozen=True)
class LawMetadata:
    boe_id: str
    titulo_ley: str
    fecha_actualizacion: str | None
    fecha_iso: str | None
    url_norma: str
    eli: str | None


@dataclass(frozen=True)
class LawBlock:
    bloque_id: str
    bloque_titulo: str
    url: str


@dataclass(frozen=True)
class LawUnit:
    bloque_id: str
    bloque_titulo: str
    unit_id: str
    unit_type: str
    unit_title: str
    content: str
    fecha_vigencia: str | None
    fecha_publicacion: str | None


def localname(tag: str) -> str:
    return tag.split("}")[-1] if "}" in tag else tag


def text_of(elem: ET.Element) -> str:
    return " ".join("".join(elem.itertext()).split())


def boe_ts_to_iso(value: str | None) -> str | None:
    if not value:
        return None
    value = value.strip()
    if len(value) < 8 or not value[:8].isdigit():
        return None
    return f"{value[0:4]}-{value[4:6]}-{value[6:8]}"


def yyyymmdd_int(value: str | None) -> int:
    if not value:
        return 0
    value = value.strip()
    return int(value[:8]) if len(value) >= 8 and value[:8].isdigit() else 0


def map_unit_type(raw_type: str) -> str:
    value = (raw_type or "").lower()
    if "precepto" in value:
        return "articulo"
    if "preambulo" in value:
        return "preambulo"
    if "anexo" in value:
        return "anexo"
    if "adicional" in value:
        return "disposicion_adicional"
    if "transitoria" in value:
        return "disposicion_transitoria"
    if "derogatoria" in value:
        return "disposicion_derogatoria"
    if "final" in value:
        return "disposicion_final"
    return "estructura"


class BoeConsolidatedClient:
    def __init__(self, http_config: HttpConfig | None = None) -> None:
        self.http_config = http_config or HttpConfig()
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": "study-brilliance-law-sync/1.0",
            }
        )

    def _get(self, url: str, *, expect: str) -> requests.Response:
        last_error: Exception | None = None

        for attempt in range(self.http_config.retries):
            try:
                accept = {
                    "xml": "application/xml,text/xml,*/*",
                    "json": "application/json,*/*",
                    "text": "text/plain,*/*",
                }[expect]

                response = self.session.get(
                    url,
                    headers={"Accept": accept},
                    timeout=self.http_config.timeout,
                )

                if response.status_code == 404:
                    raise RuntimeError(f"404 Not Found: {url}")

                response.raise_for_status()
                return response
            except Exception as exc:
                last_error = exc if isinstance(exc, Exception) else RuntimeError(str(exc))
                if "404 Not Found" in str(last_error):
                    raise last_error

                wait_seconds = self.http_config.backoff_base ** attempt
                log.warning(
                    "HTTP %d/%d fallido para %s (%s). Reintentando en %.1fs",
                    attempt + 1,
                    self.http_config.retries,
                    url,
                    last_error,
                    wait_seconds,
                )
                time.sleep(wait_seconds)

        raise RuntimeError(f"GET falló tras {self.http_config.retries} intentos: {url} | {last_error}")

    def get_xml(self, url: str) -> ET.Element:
        response = self._get(url, expect="xml")
        return ET.fromstring(response.content)

    def get_metadata(self, boe_id: str) -> LawMetadata:
        url = f"https://www.boe.es/datosabiertos/api/legislacion-consolidada/id/{boe_id}/metadatos"
        root = self.get_xml(url)

        titulo = None
        fecha_actualizacion = None
        url_norma = None
        eli = None

        for element in root.iter():
            name = localname(element.tag).lower()
            if name == "titulo" and not titulo:
                titulo = text_of(element)
            elif name == "fecha_actualizacion" and not fecha_actualizacion:
                fecha_actualizacion = text_of(element)
            elif name == "url_html_consolidada" and not url_norma:
                url_norma = text_of(element)
            elif name == "eli" and not eli:
                eli = text_of(element)

        return LawMetadata(
            boe_id=boe_id,
            titulo_ley=titulo or boe_id,
            fecha_actualizacion=fecha_actualizacion,
            fecha_iso=boe_ts_to_iso(fecha_actualizacion),
            url_norma=url_norma or f"https://www.boe.es/buscar/act.php?id={boe_id}",
            eli=eli,
        )

    def get_index_blocks(self, boe_id: str) -> list[LawBlock]:
        url = f"https://www.boe.es/datosabiertos/api/legislacion-consolidada/id/{boe_id}/texto/indice"
        root = self.get_xml(url)

        blocks_by_id: dict[str, LawBlock] = {}
        for block in root.iter():
            if localname(block.tag).lower() != "bloque":
                continue

            block_id = ""
            block_title = ""
            block_url = ""

            for child in block:
                name = localname(child.tag).lower()
                if name == "id":
                    block_id = text_of(child)
                elif name == "titulo":
                    block_title = text_of(child)
                elif name == "url":
                    block_url = text_of(child)

            if not block_id:
                continue

            if not block_url:
                block_url = (
                    "https://www.boe.es/datosabiertos/api/legislacion-consolidada"
                    f"/id/{boe_id}/texto/bloque/{block_id}"
                )

            blocks_by_id[block_id] = LawBlock(
                bloque_id=block_id,
                bloque_titulo=block_title,
                url=block_url,
            )

        return list(blocks_by_id.values())

    def get_block_units(self, block: LawBlock) -> list[LawUnit]:
        root = self.get_xml(block.url)
        units: list[LawUnit] = []

        for block_elem in root.iter():
            if localname(block_elem.tag).lower() != "bloque":
                continue

            unit = self._extract_unit_from_block(block_elem, block)
            if unit is not None:
                units.append(unit)

        return units

    def _extract_unit_from_block(self, block_elem: ET.Element, root_block: LawBlock) -> Optional[LawUnit]:
        unit_id = block_elem.get("id", "") or root_block.bloque_id
        unit_type = map_unit_type(block_elem.get("tipo", "") or "")
        unit_title = (block_elem.get("titulo", "") or "").strip() or root_block.bloque_titulo or unit_id or "Unidad"

        version = self._pick_latest_version(block_elem)
        if version is None:
            return None

        paragraphs: list[str] = []
        for paragraph in version.iter():
            if localname(paragraph.tag).lower() != "p":
                continue
            text = text_of(paragraph)
            if text:
                paragraphs.append(text)

        if paragraphs:
            content = normalize_text("\n".join(paragraphs))
        else:
            content = normalize_text(text_of(version))

        if not content:
            return None

        return LawUnit(
            bloque_id=root_block.bloque_id,
            bloque_titulo=root_block.bloque_titulo,
            unit_id=unit_id,
            unit_type=unit_type,
            unit_title=unit_title[:250],
            content=content,
            fecha_vigencia=boe_ts_to_iso(version.get("fecha_vigencia")),
            fecha_publicacion=boe_ts_to_iso(version.get("fecha_publicacion")),
        )

    @staticmethod
    def _pick_latest_version(block_elem: ET.Element) -> Optional[ET.Element]:
        versions = [child for child in block_elem if localname(child.tag).lower() == "version"]
        if not versions:
            return None

        return max(
            versions,
            key=lambda version: (
                yyyymmdd_int(version.get("fecha_vigencia")),
                yyyymmdd_int(version.get("fecha_publicacion")),
            ),
        )
