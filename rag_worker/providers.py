from __future__ import annotations

import logging
import os
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Sequence

import google.generativeai as genai


log = logging.getLogger("rag_embeddings.providers")


@dataclass(frozen=True)
class EmbeddingConfig:
    provider: str = os.environ.get("EMBEDDING_PROVIDER", "gemini").strip().lower() or "gemini"
    model: str = os.environ.get("EMBEDDING_MODEL", "models/gemini-embedding-001").strip() or "models/gemini-embedding-001"
    dimension: int = int(os.environ.get("EMBEDDING_DIM", "1536"))
    retries: int = int(os.environ.get("EMBED_RETRIES", "6"))
    backoff_base: float = float(os.environ.get("EMBED_BACKOFF_BASE", "2.0"))


class EmbeddingProvider(ABC):
    @abstractmethod
    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        raise NotImplementedError


class GeminiEmbeddingProvider(EmbeddingProvider):
    def __init__(self, config: EmbeddingConfig) -> None:
        self.config = config
        api_key = os.environ.get("GOOGLE_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("Falta GOOGLE_API_KEY")
        genai.configure(api_key=api_key)

    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        embeddings: list[list[float]] = []
        for index, text in enumerate(texts, start=1):
            embeddings.append(self._embed_one(text, index=index, total=len(texts)))
        return embeddings

    def _embed_one(self, text: str, *, index: int, total: int) -> list[float]:
        last_error: Exception | None = None
        for attempt in range(self.config.retries):
            try:
                response = genai.embed_content(
                    model=self.config.model,
                    content=text,
                    task_type="retrieval_document",
                    output_dimensionality=self.config.dimension,
                )
                vector = response["embedding"]
                if not isinstance(vector, list) or not vector:
                    raise RuntimeError("Gemini devolvió un embedding vacío.")
                return vector
            except Exception as exc:
                last_error = exc
                wait_seconds = self.config.backoff_base ** attempt
                log.warning(
                    "Embedding Gemini fallido (%s/%s chunk %s/%s): %s. Reintento en %.1fs",
                    attempt + 1,
                    self.config.retries,
                    index,
                    total,
                    exc,
                    wait_seconds,
                )
                time.sleep(wait_seconds)
        raise RuntimeError(f"Gemini embed falló tras {self.config.retries} intentos: {last_error}")


def create_embedding_provider(config: EmbeddingConfig | None = None) -> EmbeddingProvider:
    config = config or EmbeddingConfig()

    if config.provider == "gemini":
        return GeminiEmbeddingProvider(config)

    raise RuntimeError(f"Proveedor de embeddings no soportado: {config.provider}")
