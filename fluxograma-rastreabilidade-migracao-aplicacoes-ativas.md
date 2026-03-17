# Fluxograma – Rastreabilidade da separação de pastas (Migração aplicações ativas)

Documento de rastreabilidade da estrutura de pastas do Super App, seguindo o padrão Command Center Maestro (flowchart TD, blocos INIT/RAIZ/CICLOS/LOOP).

---

## Diagrama Mermaid

```mermaid
%%{ init: {
  "theme": "base",
  "flowchart": { "curve": "basis" },
  "themeVariables": {
    "fontFamily": "Inter, Segoe UI, Arial",
    "fontSize": "13px"
  }
} }%%

flowchart TD

%% =====================================================
%% 1) TEMA (padrão institucional)
%% =====================================================
classDef mestre fill:#2c3e50,stroke:#2c3e50,color:#fff,stroke-width:4px;
classDef processo fill:#3498db,stroke:#2980b9,color:#fff,stroke-width:2px;
classDef decisao fill:#f39c12,stroke:#d35400,color:#fff,stroke-width:2px;
classDef db fill:#111827,stroke:#374151,color:#fff,stroke-width:1.5px;
classDef pasta fill:#ecf0f1,stroke:#bdc3c7,color:#2c3e50,stroke-dasharray:5 5;
classDef arquivo fill:#27ae60,stroke:#219150,color:#fff,stroke-width:2px;
classDef loop fill:#1f2937,stroke:#6b7280,color:#fff,stroke-dasharray:3 3;

linkStyle default stroke:#9ca3af,stroke-width:1.2px;

%% =====================================================
%% 2) INIT/TEMA + RAIZ
%% =====================================================
maestro(("Super App – raiz do repositório")):::mestre --> decide{"Qual aplicação / domínio?"}:::decisao

%% Recursos compartilhados (comuns a todos os ciclos)
dir_api["api"]:::pasta --> decide
dir_lib["lib"]:::pasta --> decide
dir_supabase["supabase"]:::pasta --> decide
dir_scripts["scripts"]:::pasta --> decide

%% =====================================================
%% 3) CICLOS – uma aplicação ativa por subgraph (rastreabilidade)
%% =====================================================

subgraph ciclo_despesas_fixas["Despesas fixas"]
  direction TB
  decide -- "despesas_fixas" --> dir_despesas["despesas_fixas"]:::pasta
  dir_despesas --> dir_despesas_model["model"]:::pasta
  dir_despesas --> dir_despesas_service["service"]:::pasta
  dir_despesas_service --> db_despesas[("tb_despesas_fixas")]:::db
end

subgraph ciclo_financas["Finanças"]
  direction TB
  decide -- "financas" --> dir_financas["financas"]:::pasta
  dir_financas --> dir_financas_model["model"]:::pasta
  dir_financas --> dir_financas_service["service"]:::pasta
  dir_financas_service --> db_financas[("tb_financas")]:::db
end

subgraph ciclo_lista_compras["Lista de compras"]
  direction TB
  decide -- "lista_compras" --> dir_lista["lista_compras"]:::pasta
  dir_lista --> dir_lista_model["model"]:::pasta
  dir_lista --> dir_lista_service["service"]:::pasta
  dir_lista_service --> db_lista[("tb_lista_compras")]:::db
end

subgraph ciclo_saude["Saúde"]
  direction TB
  decide -- "saude" --> dir_saude["saude"]:::pasta
  dir_saude --> dir_saude_model["model"]:::pasta
  dir_saude --> dir_saude_service["service"]:::pasta
  dir_saude_service --> db_saude[("tb_saude_familiar")]:::db
end

%% =====================================================
%% 4) LOOP – rastreabilidade / aguarda ciclo
%% =====================================================
dir_despesas -.-> aguarda["Aguarda ciclo"]:::loop
dir_financas -.-> aguarda
dir_lista -.-> aguarda
dir_saude -.-> aguarda
aguarda -.-> maestro
```

---

## Legenda

| Elemento        | Significado                                      |
|----------------|---------------------------------------------------|
| **Super App (raiz)** | Orquestrador / raiz do repositório (classe mestre). |
| **api, lib, supabase, scripts** | Pastas compartilhadas; entrada comum à decisão.   |
| **Decisão**    | Roteamento por aplicação/domínio (despesas_fixas, financas, lista_compras, saude). |
| **Subgraphs**  | Ciclos por aplicação ativa; cada um com pasta raiz → model, service → DB. |
| **Pastas**     | Diretórios (classe pasta).                        |
| **DB**         | Tabelas Supabase correspondentes (classe db).     |
| **Aguarda ciclo** | Retorno para rastreabilidade/loop (classe loop). |

---

## Mapeamento pastas → tabelas (rastreabilidade)

| Pasta aplicação   | model | service | Tabela Supabase    |
|-------------------|-------|---------|--------------------|
| despesas_fixas    | sim   | sim     | tb_despesas_fixas  |
| financas          | sim   | sim     | tb_financas        |
| lista_compras     | sim   | sim     | tb_lista_compras   |
| saude             | sim   | sim     | tb_saude_familiar  |

---

*Fluxograma gerado conforme padrão Command_Fluxograma (flowchart TD, INIT/RAIZ/CICLOS/LOOP, classes visuais).*
