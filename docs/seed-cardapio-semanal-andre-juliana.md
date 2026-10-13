# Seed do cardápio semanal de André e Juliana

Execute inteiro `sql/20261011_seed_cardapio_semanal_andre_juliana.sql` no SQL Editor do Supabase, como responsável pelo banco. O seed não foi executado em produção. Não é uma alteração de schema: utiliza `tb_saude_perfis` e `tb_saude_dietas` existentes, incluindo as migrations de meta calórica, modo semanal e `alerta_ativo`.

O seed cria duas dietas independentes, uma por perfil, cada uma com sete dias de segunda a domingo, cinco refeições preenchidas por dia e 95 itens, sem óleo. Os 21 itens de óleo da versão original foram excluídos por solicitação do usuário. A ceia fica vazia para respeitar os seis tipos de refeição do app. As quantidades de ovos estão em unidades e os demais alimentos em gramas, com os campos estruturados que o editor já utiliza. A estrutura principal é `semanal=true`, `semana=[{titulo,refeicoes}]`, `refeicoes=[]` e `duracao_dias=7`.

## Perfis e repetição

Por padrão, procura um único par André (masculino) e Juliana (feminino) com o mesmo `created_by`. A imagem informa os nomes, mas não os IDs. Idade e IMC não são identificadores estáveis e não são usados para adivinhar IDs. Se houver mais de um par ou nomes diferentes, bloqueia antes de inserir qualquer dieta.

Para conferir os IDs, execute:

```sql
select id,nome,sexo,created_by
from public.tb_saude_perfis
where lower(trim(nome)) in ('andré','andre','juliana')
order by created_by,nome,id;
```

Preencha `v_andre_id` e `v_juliana_id` no início do bloco `DO` quando necessário. `v_owner` permite filtrar a conta. Os IDs continuam sendo validados pelos nomes, sexos e proprietário comum. O seed não cria nem modifica perfis.

Dietas de outras origens permanecem intactas. Cada nova dieta recebe um slug específico do perfil e um marcador em `source_file`. Repetir o seed não duplica: nas dietas da versão anterior deste mesmo seed, remove apenas os itens com nome `Óleo`/`oleo` e os campos auxiliares de estimativas antigas. Preserva outros alimentos, quantidades, dias, refeições, títulos e edições. Acrescenta às observações uma nota sobre a adaptação sem óleo. Não remove tipos específicos de óleo adicionados posteriormente, como `Óleo de coco`. Uma colisão com um slug de outra origem bloqueia a transação. A execução retorna os IDs das dietas e dos perfis para conferência.

## Fidelidade ao PDF

Fonte: `cardapio_7_dias_1600_kcal (1).pdf`, três páginas, conferidas por extração e visualização. Transcrição das quantidades e refeições, sem ajustar por idade, sexo ou IMC. Ambos os perfis recebem o mesmo cardápio solicitado.

A meta indicada é 1.600 kcal, mas os totais do próprio PDF são 1.406, 1.533, 1.436, 1.449, 1.490, 1.459 e 1.429 kcal. Esses números incluem o óleo removido e foram preservados somente nas observações como referência histórica, junto das orientações e cuidados originais. Os campos `calorias_pdf` não ficam no JSON adaptado. A nota de revisão esclarece que os números do PDF não representam o cardápio sem óleo. O app calcula os valores dos itens vinculados, sem redistribuir estimativas antigas entre alimentos.

`calorias` e `alimento_id` de cada item ficam nulos; o seed não inventa macros, não cria entradas nutricionais e não escolhe automaticamente alimentos parecidos no catálogo. O app pode calcular os nutrientes usando suas regras atuais de correspondência com o catálogo, e seus resultados podem diferir das estimativas do PDF. Alimentos sem correspondência ficam com nutrição pendente. As estimativas originais permanecem nas observações, inclusive depois de salvar a dieta no editor.

O serviço compartilhado resolve `Ovos` como `Ovo inteiro` e `Batata inglesa` como `Batata inglesa cozida` quando a observação confirma o cozimento. Isso também vale para dietas já importadas. O seed revisado já utiliza esses nomes canônicos, obtidos com a mesma lógica da API. ID explícito e nome exato têm prioridade; aliases ambíguos não selecionam um registro arbitrário. O Excel fornecido não contém `Cenoura`, e `Abóbora` sem variedade não identifica necessariamente `Abóbora cabotiá cozida`: esses vínculos continuam pendentes até uma referência específica ser definida no catálogo.

`alerta_ativo=true` segue o padrão atual do cadastro de dieta. Nenhuma agenda é criada ou alterada pelo seed; os agendadores existentes podem passar a reconhecer as novas dietas. Nenhuma mensagem Telegram foi enviada nesta tarefa.

## Reversão e validação

`sql/rollback/20261011_seed_cardapio_semanal_andre_juliana.sql` remove somente os registros deste seed para os dois `perfil_id` que você preencher. Bloqueia se as dietas tiverem sido editadas ou vinculadas a agendas. Não remove perfis, alimentos ou outras dietas.

Testes locais usam PostgreSQL via PGlite, o contrato de tabela das migrations e o seletor semanal real do app. Verificam conteúdo, isolamento por proprietário, ambiguidade, repetição, colisões de slug e reversão. Validação no Supabase real: **não executada**, pois a aplicação do seed será feita pelo responsável do banco.


## Recriar as dietas com as observações atuais

Execute `sql/20261011_recriar_cardapio_semanal_andre_juliana.sql` no SQL Editor do Supabase. Esse script é diferente do seed original: apaga e recria somente os registros com os slugs e a origem deste seed, dos perfis André e Juliana da mesma conta. Os IDs existentes e o estado individual de alerta são preservados. As outras dietas e o catálogo de alimentos não são alterados. As edições nas duas dietas são substituídas pelo cardápio atual, sem óleo e com observações curtas.

Antes de apagar, guarda as dietas e as agendas que apontavam para elas em `tb_saude_dietas_seed_backup`. Essa tabela tem RLS e não concede acesso aos clientes anon/authenticated. A execução deve ocorrer pelo responsável pelo banco, no SQL Editor. Se houver perfis homônimos, informe os dois IDs no início do script. O processamento é transacional; um erro impede a substituição parcial.

Os vínculos das agendas são recolocados depois da recriação. Os horários e os interruptores gerais são mantidos; triggers de atualização podem renovar o timestamp da configuração de dieta. O resultado inclui o `run_id` do backup. Para restaurar os registros anteriores, use `sql/rollback/20261011_recriar_cardapio_semanal_andre_juliana.sql`, preenchendo esse identificador. A restauração bloqueia dietas editadas após a execução. A tabela de backup é preservada.

Após executar, feche e abra Saúde novamente para atualizar os dados da tela. Não é preciso publicar o frontend para ver as observações novas gravadas no banco. O script não envia Telegram.
