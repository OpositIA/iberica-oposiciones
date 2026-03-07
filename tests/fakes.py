from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Any, Callable


@dataclass
class FakeResponse:
    data: Any


class FakeRpcCall:
    def __init__(self, supabase: "InMemorySupabase", name: str, params: dict[str, Any]) -> None:
        self.supabase = supabase
        self.name = name
        self.params = params

    def execute(self) -> FakeResponse:
        handler = self.supabase.rpc_handlers.get(self.name)
        if handler is not None:
            return FakeResponse(handler(self.params))

        if self.name == "claim_rag_reindex_jobs":
            limit = max(int(self.params.get("p_limit") or 1), 1)
            source_type = self.params.get("p_source_type")
            candidates = [
                row
                for row in self.supabase.tables.get("rag_reindex_jobs", [])
                if row.get("status") == "pending"
                and (source_type is None or row.get("source_type") == source_type)
            ]
            candidates.sort(key=lambda row: (row.get("created_at") or "", row.get("id") or 0))
            claimed = []
            for row in candidates[:limit]:
                row["status"] = "processing"
                row["error_text"] = None
                claimed.append(copy.deepcopy(row))
            return FakeResponse(claimed)

        raise RuntimeError(f"RPC no implementada en fake: {self.name}")


class InMemoryQuery:
    def __init__(self, supabase: "InMemorySupabase", table_name: str) -> None:
        self.supabase = supabase
        self.table_name = table_name
        self.action = "select"
        self.filters: list[tuple[str, str, Any]] = []
        self._limit: int | None = None
        self._order_by: str | None = None
        self._order_desc = False
        self._payload: Any = None
        self._return_single = False
        self._return_maybe_single = False
        self._on_conflict: list[str] | None = None

    def select(self, _fields: str) -> "InMemoryQuery":
        self.action = "select"
        return self

    def eq(self, key: str, value: Any) -> "InMemoryQuery":
        self.filters.append(("eq", key, value))
        return self

    def neq(self, key: str, value: Any) -> "InMemoryQuery":
        self.filters.append(("neq", key, value))
        return self

    def in_(self, key: str, values: list[Any]) -> "InMemoryQuery":
        self.filters.append(("in", key, values))
        return self

    def is_(self, key: str, value: Any) -> "InMemoryQuery":
        self.filters.append(("is", key, value))
        return self

    def limit(self, value: int) -> "InMemoryQuery":
        self._limit = value
        return self

    def order(self, key: str, desc: bool = False) -> "InMemoryQuery":
        self._order_by = key
        self._order_desc = desc
        return self

    def maybe_single(self) -> "InMemoryQuery":
        self._return_maybe_single = True
        return self

    def single(self) -> "InMemoryQuery":
        self._return_single = True
        return self

    def insert(self, payload: Any, on_conflict: str | None = None) -> "InMemoryQuery":
        self.action = "insert"
        self._payload = payload
        if on_conflict:
            self._on_conflict = [value.strip() for value in on_conflict.split(",")]
        return self

    def update(self, payload: dict[str, Any]) -> "InMemoryQuery":
        self.action = "update"
        self._payload = payload
        return self

    def delete(self) -> "InMemoryQuery":
        self.action = "delete"
        return self

    def upsert(self, payload: list[dict[str, Any]], on_conflict: str) -> "InMemoryQuery":
        self.action = "upsert"
        self._payload = payload
        self._on_conflict = [value.strip() for value in on_conflict.split(",")]
        return self

    def execute(self) -> FakeResponse:
        if self.action == "select":
            rows = [copy.deepcopy(row) for row in self._filtered_rows()]
            if self._order_by is not None:
                rows.sort(key=lambda row: row.get(self._order_by), reverse=self._order_desc)
            if self._limit is not None:
                rows = rows[: self._limit]
            if self._return_single:
                return FakeResponse(rows[0])
            if self._return_maybe_single:
                return FakeResponse(rows[0] if rows else None)
            return FakeResponse(rows)

        if self.action == "insert":
            payload_rows = self._payload if isinstance(self._payload, list) else [self._payload]
            inserted = []
            for row in payload_rows:
                new_row = copy.deepcopy(row)
                if "id" not in new_row:
                    new_row["id"] = self.supabase.next_id(self.table_name)
                self.supabase.tables.setdefault(self.table_name, []).append(new_row)
                inserted.append(copy.deepcopy(new_row))
            if self._return_single:
                return FakeResponse(inserted[0])
            return FakeResponse(inserted)

        if self.action == "upsert":
            table = self.supabase.tables.setdefault(self.table_name, [])
            inserted = []
            for row in self._payload:
                matched = None
                for existing in table:
                    if all(existing.get(key) == row.get(key) for key in self._on_conflict or []):
                        matched = existing
                        break
                if matched is not None:
                    matched.update(copy.deepcopy(row))
                    inserted.append(copy.deepcopy(matched))
                else:
                    new_row = copy.deepcopy(row)
                    if "id" not in new_row:
                        new_row["id"] = self.supabase.next_id(self.table_name)
                    table.append(new_row)
                    inserted.append(copy.deepcopy(new_row))
            return FakeResponse(inserted)

        if self.action == "update":
            updated = []
            for row in self._filtered_rows():
                row.update(copy.deepcopy(self._payload))
                updated.append(copy.deepcopy(row))
            return FakeResponse(updated)

        if self.action == "delete":
            table = self.supabase.tables.get(self.table_name, [])
            to_delete = {id(row) for row in self._filtered_rows()}
            kept = [row for row in table if id(row) not in to_delete]
            deleted = [copy.deepcopy(row) for row in table if id(row) in to_delete]
            self.supabase.tables[self.table_name] = kept
            return FakeResponse(deleted)

        raise RuntimeError(f"Accion fake no soportada: {self.action}")

    def _filtered_rows(self) -> list[dict[str, Any]]:
        rows = self.supabase.tables.get(self.table_name, [])
        return [row for row in rows if self._matches(row)]

    def _matches(self, row: dict[str, Any]) -> bool:
        for op, key, value in self.filters:
            row_value = row.get(key)
            if op == "eq" and row_value != value:
                return False
            if op == "neq" and row_value == value:
                return False
            if op == "in" and row_value not in value:
                return False
            if op == "is":
                if value == "null" and row_value is not None:
                    return False
                if value != "null" and row_value is not value:
                    return False
        return True


class InMemorySupabase:
    def __init__(self, tables: dict[str, list[dict[str, Any]]] | None = None) -> None:
        self.tables = copy.deepcopy(tables or {})
        self.rpc_handlers: dict[str, Callable[[dict[str, Any]], Any]] = {}
        self._next_ids: dict[str, int] = {}

    def table(self, table_name: str) -> InMemoryQuery:
        self.tables.setdefault(table_name, [])
        return InMemoryQuery(self, table_name)

    def rpc(self, name: str, params: dict[str, Any]) -> FakeRpcCall:
        return FakeRpcCall(self, name, params)

    def next_id(self, table_name: str) -> int:
        if table_name not in self._next_ids:
            existing_ids = [int(row["id"]) for row in self.tables.get(table_name, []) if row.get("id") is not None]
            self._next_ids[table_name] = max(existing_ids, default=0) + 1
        next_value = self._next_ids[table_name]
        self._next_ids[table_name] += 1
        return next_value
