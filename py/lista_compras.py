"""
Serviço: Lista de Compras
Fonte de verdade: Supabase tb_lista_compras
Campos: id, created_at, item, quantidade, unidade_medida, comprado, prioridade
"""

from dataclasses import dataclass
from typing import List, Optional

TABLE_NAME = "tb_lista_compras"

# Prioridade: 1 Baixa, 2 Média, 3 Alta
PRIORIDADE_BAIXA = 1
PRIORIDADE_MEDIA = 2
PRIORIDADE_ALTA = 3


@dataclass
class ItemLista:
    """Registro alinhado à tb_lista_compras."""
    item: str
    quantidade: int = 1
    unidade_medida: Optional[str] = None
    comprado: bool = False
    prioridade: int = PRIORIDADE_BAIXA
    id: Optional[str] = None
    created_at: Optional[str] = None

    def to_insert(self) -> dict:
        return {
            "item": self.item or "",
            "quantidade": max(1, self.quantidade),
            **({"unidade_medida": self.unidade_medida} if self.unidade_medida else {}),
            "comprado": bool(self.comprado),
            "prioridade": max(1, min(3, self.prioridade)),
        }

    @classmethod
    def from_row(cls, row: dict) -> "ItemLista":
        return cls(
            id=row.get("id"),
            created_at=row.get("created_at"),
            item=row.get("item") or "",
            quantidade=row.get("quantidade", 1) or 1,
            unidade_medida=row.get("unidade_medida"),
            comprado=bool(row.get("comprado", False)),
            prioridade=row.get("prioridade", PRIORIDADE_BAIXA) or PRIORIDADE_BAIXA,
        )


def payload_insert(
    item: str,
    quantidade: int = 1,
    unidade_medida: Optional[str] = None,
    comprado: bool = False,
    prioridade: int = PRIORIDADE_BAIXA,
) -> dict:
    """Monta dict para INSERT em tb_lista_compras."""
    return {
        "item": (item or "").strip(),
        "quantidade": max(1, int(quantidade)),
        **({"unidade_medida": (unidade_medida or "").strip() or None} if unidade_medida else {}),
        "comprado": bool(comprado),
        "prioridade": max(1, min(3, int(prioridade))),
    }


def payload_update(
    item: Optional[str] = None,
    quantidade: Optional[int] = None,
    unidade_medida: Optional[str] = None,
    comprado: Optional[bool] = None,
    prioridade: Optional[int] = None,
) -> dict:
    """Monta dict para UPDATE (apenas campos informados)."""
    out = {}
    if item is not None:
        out["item"] = item.strip()
    if quantidade is not None:
        out["quantidade"] = max(1, int(quantidade))
    if unidade_medida is not None:
        out["unidade_medida"] = unidade_medida.strip() or None
    if comprado is not None:
        out["comprado"] = bool(comprado)
    if prioridade is not None:
        out["prioridade"] = max(1, min(3, int(prioridade)))
    return out


def toggle_comprado(rows: List[dict], id_item: str) -> Optional[dict]:
    """
    Retorna payload para atualizar comprado para o oposto.
    Uso: supabase.table(TABLE_NAME).update(payload).eq('id', id_item).execute()
    """
    item = next((r for r in rows if str(r.get("id")) == str(id_item)), None)
    if not item:
        return None
    return {"comprado": not bool(item.get("comprado", False))}


def reset_checks_payload() -> dict:
    """Payload para desmarcar todos: comprado = False. (Filtro por usuário fica no RLS/query.)"""
    return {"comprado": False}


def contar_comprados(rows: List[dict]) -> int:
    """Conta itens com comprado=True."""
    return sum(1 for r in rows if r.get("comprado"))


def contar_pendentes(rows: List[dict]) -> int:
    """Conta itens com comprado=False."""
    return sum(1 for r in rows if not r.get("comprado"))


def ordenar_por_prioridade(rows: List[dict], prioridade_primeiro: bool = True) -> List[dict]:
    """Ordena por prioridade (3 > 2 > 1). prioridade_primeiro=True: alta primeiro."""
    return sorted(rows, key=lambda r: (r.get("prioridade") or 1), reverse=prioridade_primeiro)


def parse_rows_supabase(rows: List[dict]) -> List[ItemLista]:
    """Converte linhas do Supabase em lista de ItemLista."""
    return [ItemLista.from_row(r) for r in rows]
