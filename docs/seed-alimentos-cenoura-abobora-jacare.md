# Seed: cenoura e abóbora

Execute `sql/20261011_seed_alimentos_cenoura_abobora_jacare.sql` no SQL Editor do Supabase do projeto. O script apenas acrescenta os dois alimentos ao catálogo compartilhado; não altera dietas ou agendas. Não foi executado em produção.

| Referência por 100 g crus | kcal | Proteína (g) | Carboidrato (g) | Gordura (g) |
| --- | ---: | ---: | ---: | ---: |
| Cenoura | 34 | 1,3 | 7,7 | 0,2 |
| Abóbora genérica | 26 | 1,0 | 6,5 | 0,1 |

Fontes consultadas em 11/10/2026:

- [TACO/NEPA-UNICAMP, 4ª edição, alimento 110, página impressa 32 (página 35 do PDF)](https://nepa.unicamp.br/wp-content/uploads/sites/27/2023/10/taco_4_edicao_ampliada_e_revisada.pdf).
- [TABNUT/EPM-UNIFESP, alimento 11422, abóbora crua](https://tabnut.dis.epm.br/alimento/11422/abobora-cru).

A pedido do usuário, são valores padrão dos alimentos crus. A referência de abóbora é genérica, não uma análise específica da variedade jacaré. Esse limite aparece em `observacoes` e `fonte_nutricional`. Aplicados aos pesos após cozimento informados no cardápio, os totais são aproximados; o script não estima rendimento de cocção.

Os nomes `Cenoura` e `Abóbora` coincidem com os itens já gravados no cardápio semanal. Não é necessário importar novamente as dietas nem alterar a API para associar esses dois itens. A abóbora cabotiá já cadastrada é preservada.

Pode reaplicar o script sem duplicar os registros deste seed. Se já existir um cadastro diferente com um desses nomes, a transação é interrompida para revisão, sem sobrescrever os valores existentes. A seleção final mostra os IDs e as referências incluídas. O SQL pode causar uma breve espera no cadastro de alimentos durante sua execução.

Validação: dois testes em PostgreSQL em memória (PGlite), cobrindo idempotência, sequência de ordenação, preservação do catálogo, conflito atômico, cálculos das 35 refeições preenchidas do cardápio e mensagem nutricional do jantar de domingo. Sem acesso ao Supabase e sem envio real ao Telegram.
