# Diagrama Informativo - Rastreabilidade de Pastas (Migracao aplicacoes ativas)

Este documento apresenta apenas a estrutura de pastas e o que existe em cada dominio, sem fluxo de processo.

---

## Diagrama Mermaid (estrutura)

```mermaid
%%{ init: {
  "theme": "base",
  "flowchart": { "curve": "linear" },
  "themeVariables": {
    "fontFamily": "Segoe UI, Arial",
    "fontSize": "13px"
  }
} }%%

flowchart TD

classDef raiz fill:#1f2937,stroke:#111827,color:#ffffff,stroke-width:3px;
classDef compartilhada fill:#e5e7eb,stroke:#9ca3af,color:#111827,stroke-width:1.5px;
classDef dominio fill:#dbeafe,stroke:#2563eb,color:#1e3a8a,stroke-width:2px;
classDef pastaInterna fill:#f3f4f6,stroke:#9ca3af,color:#111827,stroke-width:1px;
classDef tabela fill:#dcfce7,stroke:#16a34a,color:#14532d,stroke-width:1.5px;

raiz["super-app (raiz do repositorio)"]:::raiz

raiz --> api["api (recursos compartilhados)"]:::compartilhada
raiz --> lib["lib (bibliotecas/utilitarios)"]:::compartilhada
raiz --> sql["sql.sql (estado do banco)"]:::compartilhada

raiz --> modulos["modulos"]:::compartilhada
modulos --> despesas["despesas_fixas"]:::dominio
modulos --> financas["financas"]:::dominio
modulos --> lista["lista_compras"]:::dominio
modulos --> saude["saude"]:::dominio

despesas --> despesasModel["model"]:::pastaInterna
despesas --> despesasService["service"]:::pastaInterna
despesas --> tbDespesas["tb_despesas_fixas"]:::tabela

financas --> financasModel["model"]:::pastaInterna
financas --> financasService["service"]:::pastaInterna
financas --> tbFinancas["tb_financas"]:::tabela

lista --> listaModel["model"]:::pastaInterna
lista --> listaService["service"]:::pastaInterna
lista --> tbLista["tb_lista_compras"]:::tabela

saude --> saudeModel["model"]:::pastaInterna
saude --> saudeService["service"]:::pastaInterna
saude --> tbSaude["tb_saude_familiar"]:::tabela
```

---

## Legenda

| Elemento | Significado |
|---|---|
| `super-app` | Pasta raiz do repositorio. |
| `api`, `lib`, `modulos`, `sql.sql` | Estrutura e arquivo único de DDL (alterações de banco atualizam sql.sql). |
| `modulos/despesas_fixas`, `modulos/financas`, `modulos/lista_compras`, `modulos/saude` | Aplicativos (dominios) dentro de `modulos`. |
| `model` | Estruturas/modelos de dados do dominio. |
| `service` | Regras de servico e acesso por dominio. |
| `tb_*` | Tabela Supabase relacionada ao dominio. |

---

## Mapeamento dominio -> conteudo

| Dominio (em `modulos/`) | Subpastas | Tabela Supabase |
|---|---|---|
| `despesas_fixas` | `model`, `service` | `tb_despesas_fixas` |
| `financas` | `model`, `service` | `tb_financas` |
| `lista_compras` | `model`, `service` | `tb_lista_compras` |
| `saude` | `model`, `service` | `tb_saude_familiar` |

---

Diagrama ajustado para visao informativa de estrutura, sem etapas de processo.
