"""
Serviço: Bloco de Notas
Fonte de verdade: Supabase tb_notas
Campos: id, created_at, titulo, conteudo, tags[], usuario_id
"""

from dataclasses import dataclass
from typing import List, Optional

# Nome da tabela no Supabase (cada microserviço usa seu próprio contexto)
TABLE_NAME = "tb_notas"


@dataclass
class Nota:
    """Registro alinhado à tb_notas."""
    titulo: str
    conteudo: str = ""
    tags: Optional[List[str]] = None
    usuario_id: Optional[str] = None
    id: Optional[str] = None
    created_at: Optional[str] = None

    def to_insert(self) -> dict:
        """Payload para INSERT no Supabase (sem id/created_at)."""
        return {
            "titulo": self.titulo or "",
            "conteudo": self.conteudo or "",
            "tags": self.tags or [],
            **({"usuario_id": self.usuario_id} if self.usuario_id else {}),
        }

    @classmethod
    def from_row(cls, row: dict) -> "Nota":
        """Cria Nota a partir de uma linha do Supabase."""
        return cls(
            id=row.get("id"),
            created_at=row.get("created_at"),
            titulo=row.get("titulo") or "",
            conteudo=row.get("conteudo") or "",
            tags=row.get("tags") or [],
            usuario_id=row.get("usuario_id"),
        )


def validar_titulo(titulo: str) -> bool:
    """tb_notas: titulo NOT NULL."""
    return bool((titulo or "").strip())


def payload_insert(titulo: str, conteudo: str = "", tags: Optional[List[str]] = None, usuario_id: Optional[str] = None) -> dict:
    """Monta dict para supabase.table(TABLE_NAME).insert(payload)."""
    return {
        "titulo": (titulo or "").strip(),
        "conteudo": (conteudo or "").strip(),
        "tags": list(tags) if tags else [],
        **({"usuario_id": usuario_id} if usuario_id else {}),
    }


def payload_update(titulo: Optional[str] = None, conteudo: Optional[str] = None, tags: Optional[List[str]] = None) -> dict:
    """Monta dict para supabase.table(TABLE_NAME).update(payload).eq('id', id)."""
    out = {}
    if titulo is not None:
        out["titulo"] = titulo.strip()
    if conteudo is not None:
        out["conteudo"] = conteudo.strip()
    if tags is not None:
        out["tags"] = list(tags)
    return out


def filtrar_por_usuario(rows: List[dict], usuario_id: str) -> List[dict]:
    """Filtra notas por usuario_id (para RLS ou filtro em memória)."""
    if not usuario_id:
        return rows
    return [r for r in rows if str(r.get("usuario_id") or "") == str(usuario_id)]


def buscar_por_tags(rows: List[dict], tag: str) -> List[dict]:
    """Filtra notas que contenham a tag no array tags."""
    tag = (tag or "").strip().lower()
    if not tag:
        return rows
    return [r for r in rows if tag in [t.lower() for t in (r.get("tags") or [])]]


def parse_rows_supabase(rows: List[dict]) -> List[Nota]:
    """Converte lista de linhas do Supabase em lista de Nota."""
    return [Nota.from_row(r) for r in rows]
