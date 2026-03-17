"""
Serviço: Finanças (Registro de Gastos)
Fonte de verdade: Supabase tb_financas.
Inserção via formulário no Super App (item, valor, categoria, tipo).
"""

from dataclasses import dataclass
from typing import List, Dict, Any, Optional
from datetime import date

TABLE_NAME = "tb_financas"

# Categorias para o select do formulário (chaves do mapa + Receitas)
MAPA_CATEGORIAS = {
    "Alimentação": [
        "mercado", "hortifruti", "restaurante", "ifood", "comida", "padaria", "lanche",
        "picolé", "biscoito", "bala", "doce", "sorvete", "café", "bebida", "açougue",
        "supermercado", "feira", "confeitaria", "marmita", "delivery", "vinho", "cerveja",
    ],
    "Habitação": [
        "luz", "água", "internet", "condomínio", "boleto", "reforma", "limpeza",
        "aluguel", "iptu", "gás", "móveis", "decoração", "manutenção", "reparos", "lavanderia",
    ],
    "Transporte": [
        "uber", "gasolina", "combustível", "estacionamento", "pedágio", "oficina",
        "99pop", "ônibus", "metrô", "ipva", "seguro auto", "troca de óleo", "pneu", "licenciamento",
    ],
    "Lazer": [
        "cinema", "viagem", "netflix", "bar", "spotify", "praia", "games", "show",
        "teatro", "hospedagem", "passagem aérea", "livro", "hbomax", "disney+", "estádio", "futebol",
    ],
    "Saúde": [
        "farmácia", "médico", "academia", "suplemento", "dentista", "exame",
        "consulta", "psicólogo", "hospital", "plano de saúde", "drogaria", "ótica",
    ],
    "Compras": [
        "shopee", "amazon", "shein", "mercado livre", "roupas", "eletrônicos",
        "eletrodoméstico", "presente", "magalu", "ali-express", "perfume", "cosmético", "tenis", "acessórios",
    ],
    "Contas": [
        "faculdade", "esporte", "serviços bancários", "pensão", "celular", "assinatura",
        "imposto", "cartão de crédito", "empréstimo", "tarifa", "seguro", "anuidade", "mei", "irpf",
    ],
    "Receitas": [
        "salário", "ticket", "vale", "vendas", "recebi", "pix recebido", "reembolso",
        "lucro de bolo", "rendimento", "dividendo", "bônus", "décimo terceiro", "extra", "freelance",
    ],
}

# Lista de categorias para o formulário (dropdown)
CATEGORIAS_FORM = list(MAPA_CATEGORIAS.keys())


@dataclass
class LancamentoFinanca:
    """Registro alinhado à tb_financas."""
    descricao: str
    valor: float
    tipo: str  # 'receita' | 'despesa'
    categoria: Optional[str] = None
    data_lancamento: Optional[str] = None
    metodo_pagamento: Optional[str] = None
    id: Optional[str] = None
    created_at: Optional[str] = None

    def to_insert(self) -> dict:
        return {
            "descricao": self.descricao or "",
            "valor": round(float(self.valor), 2),
            "tipo": self.tipo in ("receita", "despesa") and self.tipo or "despesa",
            **({"categoria": self.categoria} if self.categoria else {}),
            **({"data_lancamento": self.data_lancamento} if self.data_lancamento else {}),
            **({"metodo_pagamento": self.metodo_pagamento} if self.metodo_pagamento else {}),
        }

    @classmethod
    def from_row(cls, row: dict) -> "LancamentoFinanca":
        return cls(
            id=row.get("id"),
            created_at=row.get("created_at"),
            descricao=row.get("descricao") or "",
            valor=float(row.get("valor", 0)),
            tipo=(row.get("tipo") or "despesa").lower(),
            categoria=row.get("categoria"),
            data_lancamento=row.get("data_lancamento"),
            metodo_pagamento=row.get("metodo_pagamento"),
        )


def payload_insert(
    descricao: str,
    valor: float,
    tipo: str,
    categoria: Optional[str] = None,
    data_lancamento: Optional[str] = None,
    metodo_pagamento: Optional[str] = None,
) -> dict:
    """Monta dict para INSERT em tb_financas. tipo: 'receita' | 'despesa'."""
    return {
        "descricao": (descricao or "").strip(),
        "valor": round(float(valor), 2),
        "tipo": tipo if tipo in ("receita", "despesa") else "despesa",
        **({"categoria": categoria} if categoria else {}),
        **({"data_lancamento": data_lancamento} if data_lancamento else {}),
        **({"metodo_pagamento": metodo_pagamento} if metodo_pagamento else {}),
    }


# --- BI ---


def _data_para_mes_br(row: dict) -> Optional[str]:
    """Extrai MM/AAAA de data_lancamento (DATE) ou created_at."""
    d = row.get("data_lancamento") or row.get("created_at")
    if not d:
        return None
    if isinstance(d, str):
        if "T" in d:
            d = d.split("T")[0]
        partes = d.split("-")
        if len(partes) >= 2:
            return f"{partes[1]}/{partes[0]}" if len(partes[0]) == 4 else f"{partes[1]}/{partes[2]}"
        partes = d.split("/")
        if len(partes) >= 2:
            return f"{partes[1]}/{partes[2]}" if len(partes[2]) == 4 else d
    return None


def _data_para_dia(row: dict) -> Optional[str]:
    """Extrai dia (DD) para tendência por dia."""
    d = row.get("data_lancamento") or row.get("created_at")
    if not d:
        return None
    if isinstance(d, str):
        if "-" in d:
            return d.split("-")[2][:2]
        if "/" in d:
            return d.split("/")[0]
    return None


def categorizar_bi(categoria_original: str) -> str:
    """Mapeia categoria para macro-categoria do MAPA_CATEGORIAS."""
    cat_lower = (categoria_original or "Geral").lower()
    for macro, subs in MAPA_CATEGORIAS.items():
        if any(s in cat_lower for s in subs):
            return macro
    return categoria_original or "Geral"


def processar_bi(
    rows: List[dict],
    filtro_mes: Optional[str] = None,
    mes_atual: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Processa dados de tb_financas para BI: maiores gastos e tendência acumulada.
    """
    if not mes_atual and filtro_mes == "mes_atual":
        now = date.today()
        mes_atual = f"{now.month:02d}/{now.year}"

    filtrados = []
    for r in rows:
        if (r.get("tipo") or "").lower() != "despesa":
            continue
        mes_item = _data_para_mes_br(r)
        if filtro_mes == "mes_atual" and mes_atual:
            if mes_item == mes_atual:
                filtrados.append(r)
        elif filtro_mes and mes_item == filtro_mes:
            filtrados.append(r)

    cat_agrupada = {}
    dia_map = {}
    for r in filtrados:
        v = float(r.get("valor", 0))
        cat_original = r.get("categoria") or "Geral"
        cat_final = categorizar_bi(cat_original)
        cat_agrupada[cat_final] = cat_agrupada.get(cat_final, 0) + v
        dia = _data_para_dia(r)
        if dia:
            dia_map[dia] = dia_map.get(dia, 0) + v

    entradas_ordenadas = sorted(cat_agrupada.items(), key=lambda x: -x[1])
    top5_labels = [x[0] for x in entradas_ordenadas[:5]]
    top5_valores = [x[1] for x in entradas_ordenadas[:5]]
    outros = sum(v for _, v in entradas_ordenadas[5:])
    if outros > 0:
        top5_labels.append("Outros")
        top5_valores.append(outros)

    dias = sorted(dia_map.keys(), key=lambda d: int(d))
    acc = 0
    tendencia_acumulada = []
    for d in dias:
        acc += dia_map[d]
        tendencia_acumulada.append(round(acc, 2))

    return {
        "maiores_gastos": list(zip(top5_labels, top5_valores)),
        "tabela_gastos": entradas_ordenadas,
        "dias": dias,
        "tendencia_acumulada": tendencia_acumulada,
    }


def renderizar_extrato_totais(rows: List[dict]) -> Dict[str, float]:
    """Soma receitas e despesas. Retorna receitas, despesas, liquido."""
    total_entrada = 0.0
    total_saida = 0.0
    for r in rows:
        v = float(r.get("valor", 0))
        t = (r.get("tipo") or "despesa").lower().strip()
        if t == "receita":
            total_entrada += v
        else:
            total_saida += v
    return {
        "receitas": round(total_entrada, 2),
        "despesas": round(total_saida, 2),
        "liquido": round(total_entrada - total_saida, 2),
    }


def parse_rows_supabase(rows: List[dict]) -> List[LancamentoFinanca]:
    """Converte linhas do Supabase em lista de LancamentoFinanca."""
    return [LancamentoFinanca.from_row(r) for r in rows]
