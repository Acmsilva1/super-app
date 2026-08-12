# Super App — Banco de Dados

Documentação das tabelas, views, migrations, RLS e ordem de execução no Supabase (PostgreSQL).

## Visão geral

- **Provedor:** Supabase PostgreSQL
- **Schema:** `public` (e `superapp` em scripts de seed)
- **Auth:** Supabase Auth (`auth.users`)
- **Isolamento:** RLS por `user_id` + roles admin via `is_app_admin()`
- **Pastas:** `migration/` (versionadas) e `sql/` (auxiliares, views, rollbacks)

## Tabelas de controle de acesso

| Tabela | Função |
|---|---|
| `app_user_roles` | Role por usuário (`owner`, `admin`, etc.) |
| `app_user_permissions` | Permissão por `(user_id, app_id, can_access)` |

Função auxiliar: `is_app_admin()` — usada em policies admin-only.

---

## Módulo Financeiro

| Tabela | Descrição |
|---|---|
| `tb_financas` | Receitas e gastos variados |
| `tb_despesas_fixas` | Contas fixas, parcelas, `serie_id`, `conta_fixa` |
| `tb_poupanca` | Depósitos e resgates |
| `tb_poupanca_metas` | Metas de poupança |
| `tb_compras` | Compras isoladas (não mistura com `tb_financas`) |
| `tb_financeiro_analises` | Análises persistidas |
| `tb_financeiro_features_mensais` | Features mensais para ML |
| `tb_financeiro_analise_runs` | Execuções de análise |
| `tb_financeiro_modelo_estado` | Estado do modelo treinado |

### Views financeiras (`sql/20260803_financeiro_views_e_indices.sql`)

| View | Propósito |
|---|---|
| `vw_financeiro_resumo_mensal` | Somatórios e saldo por usuário/mês |
| `vw_financeiro_categoria_mensal` | Gastos variados com ranking por categoria |
| `vw_financeiro_historico_anual` | 12 meses do ano com comprometimento |
| `vw_financeiro_poupanca_resumo` | Total acumulado, meta ativa, progresso |
| `vw_financeiro_compras_mensal` | Compras agregadas por usuário/mês |

Índices compostos `(user_id, data_lancamento/created_at)` em todas as tabelas do módulo.

---

## Módulo Lista de compras

| Tabela | Colunas principais |
|---|---|
| `tb_lista_compras` | `item`, `quantidade`, `unidade_medida`, `comprado`, `categoria`, `user_id` |

---

## Módulo Fluxograma

| Tabela | Colunas principais |
|---|---|
| `tb_fluxograma_projetos` | `nome`, `dados` (JSON), `user_id`, timestamps |

---

## Módulo Missões de treino

### Diagrama relacional

```text
tb_missoes_treino_perfis (1)
        |
        +--< tb_missoes_treino (N)  [perfil_id FK, ON DELETE CASCADE]
                 |
                 +--< tb_missoes_treino_itens (N)
                 |
                 +--< tb_missoes_treino_chamas (N)  [mission_id + mes_ref + dia]
```

### `tb_missoes_treino_perfis`

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `nome` | TEXT NOT NULL | Nome do perfil |
| `descricao` | TEXT | Opcional |
| `cor` | TEXT | default `#00e5ff` |
| `icone` | TEXT | default `fa-dumbbell` |
| `user_id` | UUID | Reservado para RLS futuro |
| `created_at`, `updated_at` | TIMESTAMPTZ | trigger `touch_updated_at` |

RLS: policy `tb_missoes_treino_perfis_admin_only` — somente `is_app_admin()`

### `tb_missoes_treino`

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `data_referencia` | DATE | Data da missão |
| `titulo` | TEXT | Ex.: "Treino de Segunda" |
| `origem` | TEXT | default `'app'` |
| `perfil_id` | BIGINT FK | Referência ao perfil |

Índices: `idx_missoes_treino_perfil_id`, `idx_missoes_treino_perfil_data`

### `tb_missoes_treino_itens`

| Coluna | Tipo |
|---|---|
| `missao_id` | FK CASCADE |
| `nome` | TEXT (`"Exercicio [3x12]"`) |
| `reps` | INT |
| `ordem` | INT |
| `concluida` | BOOLEAN |

### `tb_missoes_treino_chamas`

| Coluna | Tipo |
|---|---|
| `mission_id` | FK |
| `mes_ref` | TEXT (`"2026-08"`) |
| `dia` | INT 1–30 |
| `concluida` | BOOLEAN |

Unique: `(mission_id, mes_ref, dia)`

---

## Tabelas removidas / legado

| Tabela | Status |
|---|---|
| `tb_notes` | Removida (`migration/20260418_remove_notes_module.sql`) |
| `tb_calendario` | Referenciada em RLS; módulo removido do frontend |
| `tb_saldo_conta_corrente` | Drop (`migration/20260601_drop_tb_saldo_conta_corrente.sql`) |

---

## RLS e permissões

Migration principal: `migration/20260718_enable_rls_user_permissions.sql`

Comportamento:
- Tabelas financeiras: RLS por `user_id = auth.uid()`
- Módulos admin-only (fluxograma, treino): policy `is_app_admin()`
- Lista de compras: RLS por usuário
- Rollback: `sql/20260718_rollback_rls_user_permissions.sql`

Tabelas cobertas pelo RLS (trecho relevante):
- Financeiro: `tb_financas`, `tb_despesas_fixas`, `tb_poupanca`, `tb_poupanca_metas`, `tb_compras`, `tb_financeiro_*`
- Produtividade: `tb_lista_compras`, `tb_fluxograma_projetos`
- Treino: `tb_missoes_treino`, `tb_missoes_treino_itens`, `tb_missoes_treino_chamas`, `tb_missoes_treino_perfis`

---

## Migrations (`migration/`)

Ordem cronológica:

| Arquivo | Assunto |
|---|---|
| `20260418_remove_notes_module.sql` | Remove módulo notes |
| `20260422_create_tb_poupanca.sql` | Poupança |
| `20260422_create_tb_poupanca_metas.sql` | Metas poupança |
| `20260505_remove_saude_familiar.sql` | Remove saúde familiar |
| `20260510_tb_despesas_fixas_parcelas.sql` | Parcelas despesas fixas |
| `20260519_tb_despesas_fixas_conta_fixa.sql` | Flag conta fixa |
| `20260521_add_compras_variadas_columns.sql` | Colunas compras variadas |
| `20260531_create_tb_saldo_conta_corrente.sql` | Saldo CC (depois dropado) |
| `20260531_create_tb_saldo_conta_corrente_movimentos.sql` | Movimentos CC |
| `20260601_drop_tb_saldo_conta_corrente.sql` | Drop saldo CC |
| `20260710_create_tb_compras.sql` | Tabela compras |
| `20260718_enable_rls_user_permissions.sql` | RLS + permissões |
| `20260812_add_missoes_treino_perfis.sql` | Perfis de treino + FK |

### Ordem recomendada para treino (se base ainda não existir)

1. Migrations base de treino no Supabase (20260407/20260408 — podem existir só remotamente)
2. `migration/20260718_enable_rls_user_permissions.sql`
3. `migration/20260812_add_missoes_treino_perfis.sql`

### Rollback parcial de perfis de treino

```sql
alter table public.tb_missoes_treino drop column if exists perfil_id;
drop table if exists public.tb_missoes_treino_perfis cascade;
```

---

## Scripts auxiliares (`sql/`)

| Arquivo | Propósito |
|---|---|
| `20260418_remove_notes_module.sql` | Remove notes |
| `20260422_create_tb_poupanca.sql` | Poupança |
| `20260422_create_tb_poupanca_metas.sql` | Metas |
| `20260510_tb_despesas_fixas_parcelas.sql` | Parcelas |
| `20260519_tb_despesas_fixas_conta_fixa.sql` | Conta fixa |
| `20260521_add_compras_variadas_columns.sql` | Compras variadas |
| `20260531_create_tb_saldo_conta_corrente_movimentos.sql` | Movimentos |
| `20260616_create_tb_financeiro_analise_runs.sql` | Runs análise |
| `20260616_create_tb_financeiro_modelo_estado.sql` | Modelo ML |
| `20260616_create_vw_financeiro_ultimos_5_meses.sql` | View 5 meses |
| `20260710_create_tb_compras.sql` | Compras |
| `20260718_enable_rls_user_permissions.sql` | RLS |
| `20260802_add_serie_id_to_tb_despesas_fixas.sql` | série_id |
| `20260803_financeiro_views_e_indices.sql` | Views + índices |

Seed de desenvolvimento: `scripts/seed-financeiro.sql`

---

## Variáveis de ambiente (Supabase)

| Variável | Uso |
|---|---|
| `SUPABASE_URL` | Conexão |
| `SUPABASE_ANON_KEY` | Cliente + RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypass RLS (cron/admin) |

Política: `.env` nunca commitado; definir na Vercel e localmente.

## Checkpoints

| Data | Assunto |
|---|---|
| 2026-07-18 | RLS + `app_user_roles` + `app_user_permissions` |
| 2026-08-03 | Views financeiras + 9 índices compostos |
| 2026-08-12 | `tb_missoes_treino_perfis` + FK `perfil_id` (pendente execução manual em prod) |
