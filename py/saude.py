"""
Serviço: Saúde Familiar (LGPD – dados sensíveis)
Fonte de verdade: Supabase tb_saude_familiar
Campos: id, created_at, membro_familia, tipo_registro, detalhes, data_evento, anexo_url
"""

from dataclasses import dataclass
from typing import List, Optional

TABLE_NAME = "tb_saude_familiar"

# Valores esperados para tipo_registro (ex.: Vacina, Exame, Consulta, Medicamento)
TIPOS_REGISTRO = ["Vacina", "Exame", "Consulta", "Medicamento"]


@dataclass
class RegistroSaude:
    """Registro alinhado à tb_saude_familiar."""
    membro_familia: str
    tipo_registro: str
    detalhes: str = ""
    data_evento: Optional[str] = None
    anexo_url: Optional[str] = None
    id: Optional[str] = None
    created_at: Optional[str] = None

    def to_insert(self) -> dict:
        return {
            "membro_familia": self.membro_familia or "",
            "tipo_registro": self.tipo_registro or "",
            "detalhes": self.detalhes or "",
            **({"data_evento": self.data_evento} if self.data_evento else {}),
            **({"anexo_url": self.anexo_url} if self.anexo_url else {}),
        }

    @classmethod
    def from_row(cls, row: dict) -> "RegistroSaude":
        return cls(
            id=row.get("id"),
            created_at=row.get("created_at"),
            membro_familia=row.get("membro_familia") or "",
            tipo_registro=row.get("tipo_registro") or "",
            detalhes=row.get("detalhes") or "",
            data_evento=row.get("data_evento"),
            anexo_url=row.get("anexo_url"),
        )


def payload_insert(
    membro_familia: str,
    tipo_registro: str,
    detalhes: str = "",
    data_evento: Optional[str] = None,
    anexo_url: Optional[str] = None,
) -> dict:
    """Monta dict para INSERT em tb_saude_familiar."""
    return {
        "membro_familia": (membro_familia or "").strip(),
        "tipo_registro": (tipo_registro or "").strip(),
        "detalhes": (detalhes or "").strip(),
        **({"data_evento": data_evento} if data_evento else {}),
        **({"anexo_url": anexo_url} if anexo_url else {}),
    }


def payload_update(
    membro_familia: Optional[str] = None,
    tipo_registro: Optional[str] = None,
    detalhes: Optional[str] = None,
    data_evento: Optional[str] = None,
    anexo_url: Optional[str] = None,
) -> dict:
    """Monta dict para UPDATE (apenas campos informados)."""
    out = {}
    if membro_familia is not None:
        out["membro_familia"] = membro_familia.strip()
    if tipo_registro is not None:
        out["tipo_registro"] = tipo_registro.strip()
    if detalhes is not None:
        out["detalhes"] = detalhes.strip()
    if data_evento is not None:
        out["data_evento"] = data_evento
    if anexo_url is not None:
        out["anexo_url"] = anexo_url
    return out


def filtrar_por_membro(rows: List[dict], membro_familia: str) -> List[dict]:
    """Filtra registros por membro_familia."""
    if not membro_familia:
        return rows
    m = membro_familia.strip().lower()
    return [r for r in rows if (r.get("membro_familia") or "").strip().lower() == m]


def filtrar_por_tipo(rows: List[dict], tipo_registro: str) -> List[dict]:
    """Filtra por tipo_registro (Vacina, Exame, Consulta, Medicamento)."""
    if not tipo_registro:
        return rows
    t = tipo_registro.strip().lower()
    return [r for r in rows if (r.get("tipo_registro") or "").strip().lower() == t]


def obter_ultimo_por_tipo(rows: List[dict], membro_familia: str, tipo_registro: str) -> Optional[dict]:
    """Retorna o último registro do membro para o tipo (ex.: última vacina)."""
    filtrados = filtrar_por_tipo(filtrar_por_membro(rows, membro_familia), tipo_registro)
    if not filtrados:
        return None
    # Ordenar por data_evento desc se existir
    com_data = [(r, r.get("data_evento") or r.get("created_at") or "") for r in filtrados]
    com_data.sort(key=lambda x: x[1], reverse=True)
    return com_data[0][0]


def renderizar_resumo(rows: List[dict], membro_familia: str) -> dict:
    """
    Monta resumo do membro: última vacina, última consulta, último medicamento.
    Usa tipo_registro para distinguir.
    """
    ultima_vacina = obter_ultimo_por_tipo(rows, membro_familia, "Vacina")
    ultima_consulta = obter_ultimo_por_tipo(rows, membro_familia, "Consulta")
    ultimo_medicamento = obter_ultimo_por_tipo(rows, membro_familia, "Medicamento")

    def _detalhes(r):
        return (r.get("detalhes") or "").strip() if r else ""

    def _data(r):
        return r.get("data_evento") or r.get("created_at") or "" if r else ""

    return {
        "ultima_vacina": {"detalhes": _detalhes(ultima_vacina), "data": _data(ultima_vacina)} if ultima_vacina else {"detalhes": "Nada registrado", "data": ""},
        "ultima_consulta": {"detalhes": _detalhes(ultima_consulta), "data": _data(ultima_consulta)} if ultima_consulta else {"detalhes": "Sem histórico", "data": ""},
        "medicamento_ativo": {"detalhes": _detalhes(ultimo_medicamento)} if ultimo_medicamento else {"detalhes": "Nenhum medicamento"},
    }


def parse_rows_supabase(rows: List[dict]) -> List[RegistroSaude]:
    """Converte linhas do Supabase em lista de RegistroSaude."""
    return [RegistroSaude.from_row(r) for r in rows]
