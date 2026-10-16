# Cardápios base com rotação de legumes

Execute manualmente `sql/20261016_seed_cardapio_diario_andre_juliana.sql` no SQL Editor do banco do app, após as migrations atuais de Saúde e o cadastro da tabela nutricional. Cria duas dietas distintas, uma no perfil André e outra no perfil Juliana, preservando dietas anteriores.

O seed procura um único par de perfis André/Juliana da mesma conta. Se houver homônimos ou mais de uma conta compatível, bloqueia sem inserir dados. Preencha `v_andre_id` e `v_juliana_id` com os IDs reais nesse caso; `v_owner` é um filtro opcional de proprietário. Não cria perfis. Retorna os IDs das dietas e dos perfis.

## Legumes e quantidades

Substitui o item genérico por dois alimentos reais do catálogo, com **100 g de cada por refeição**, totalizando **200 g**. Essa quantidade está dentro da faixa de 150–200 g dos documentos e preserva os 200 g do jantar de André. Os alimentos e as quantidades são repetidos no almoço e no jantar do mesmo dia, para os dois perfis.

| Dia | Legume 1 | Legume 2 |
| --- | --- | --- |
| Segunda | Brócolis, 100 g | Abobrinha, 100 g |
| Terça | Couve-flor, 100 g | Chuchu, 100 g |
| Quarta | Brócolis, 100 g | Couve-flor, 100 g |
| Quinta | Abobrinha, 100 g | Chuchu, 100 g |
| Sexta | Brócolis, 100 g | Chuchu, 100 g |
| Sábado | Abobrinha, 100 g | Couve-flor, 100 g |
| Domingo | Brócolis, 100 g | Abobrinha, 100 g |

São seis duplas distintas, com repetição da primeira no domingo. Fonte de nomes e referências nutricionais: `tabela_nutricional_completa_protocolo_detox.xlsx`, aba `Tabela completa`, comparada com `features/saude/data/alimentosNutricionais.js` e a migration do catálogo. Cenoura não consta nesse Excel; a rotação usa somente as quatro opções da lista dos PDFs presentes nessa fonte, sem depender do seed adicional de Cenoura.

O seed consulta os IDs reais na `tb_saude_alimentos` do ambiente. Não deduz IDs pela ordem da planilha, não cria alimentos e não copia macros para a dieta. Se faltar um dos quatro cadastros ou houver ambiguidade, bloqueia a transação. O cálculo usa `alimento_id`, `quantidade_valor=100` e `quantidade_unidade='g'`.

## Nomes do catálogo e dietas já salvas

O seed usa **Ovo inteiro** no lugar de Ovos/Ovos inteiros e **Morango** no lugar de Morangos. Além dos legumes, resolve os IDs reais dos alimentos canônicos escolhidos, exigindo um cadastro único de cada. As quantidades originais são preservadas: ovos continuam em unidades, sem converter a exibição para gramas.

Na leitura de dietas já salvas, o serviço nutricional reconhece esses plurais e retorna o nome canônico do cadastro, sem exigir reaplicar o seed. O nome original armazenado só muda ao salvar a dieta pelo app; reaplicar o SQL continua preservando as edições existentes.

Por escolha expressa do usuário, os genéricos usam as referências disponíveis abaixo. A observação de cada item registra o nome original, a referência adotada e a preservação de quantidades/alternativas. Essa regra vale para o seed e para dietas existentes na leitura, com prioridade para ID explícito válido e nome exato do catálogo.

| Nome original | Referência nutricional adotada |
| --- | --- |
| Mamão; Mamão ou morangos | Mamão papaia |
| Frango grelhado; Carne bovina magra ou frango; Frango ou omelete | Peito de frango grelhado |
| Aveia | Aveia em flocos crua |
| Feijão | Feijão cozido |
| Batata inglesa, inclusive "Cozida ou assada" | Batata inglesa cozida |
| Café | Café sem açúcar |

Batata explicitamente assada sem alternativa cozida, frita ou em purê não recebe automaticamente a referência cozida. Arroz branco e Whey protein permanecem sem vínculo porque não há equivalente compatível no catálogo versionado. Saladas livres/mistas continuam sem alimento/porção inventados. Intervalos, fases e quantidades com alternativas continuam sem conversão numérica automática: escolher o nome de referência não escolhe uma quantidade. Esses itens ainda podem deixar os totais parciais e devem ser definidos no app.

## Formato e limites

Para o app e o bot escolherem a dupla pelo dia da semana, cada dieta passa a usar `semanal=true`, `duracao_dias=7`, `refeicoes=[]` e sete entradas em `semana`. O cardápio base continua igual nos demais alimentos. Os 21 dias permanecem descritos no título e nas observações. Juliana continua sem ceia.

As fases de arroz e batata de André nos dias 1–7, 8–14 e 15–21 continuam nas observações; não há avanço automático de fase. Horários, alternativas e faixas dos demais itens permanecem como antes. Esta revisão torna os legumes calculáveis: outros itens com faixa, alternativa, porção livre ou nome sem correspondência ainda podem deixar o total da refeição incompleto. O seed não inventa valores para preencher essas lacunas.

As novas dietas começam com `alerta_ativo=false`. Nenhuma agenda ou configuração existente é alterada e nenhuma mensagem é enviada. Para usar alertas, selecione/configure a dieta no app.

## Reaplicação e reversão

A execução é transacional e idempotente: repetir não duplica nem sobrescreve edições no app. Colisões de slug com outra origem bloqueiam. Se a versão diária anterior deste mesmo seed já tiver sido aplicada, a revisão bloqueia com aviso em vez de apresentar sucesso sem instalar a rotação; a substituição de registros já existentes precisa ser tratada separadamente.

Reversão opcional: `sql/rollback/20261016_seed_cardapio_diario_andre_juliana.sql`. Preencha os dois IDs de perfil retornados pelo seed. Remove somente dietas desta origem, bloqueando se tiverem sido editadas ou vinculadas a agendas.

Validação local: `npx vitest run tests/services/alimentos.service.test.js tests/database/saudeDailyMenuSeedSql.test.js tests/database/saudeWeeklyMenuSeedSql.test.js tests/database/saudeMissingFoodsSeed.test.js --pool threads`. Resultado: 26 testes aprovados. Testes do serviço e PostgreSQL em memória via PGlite verificam nomes canônicos, referências adotadas com observações, quantidades preservadas, isolamento de perfis, IDs reais do catálogo, pesos, combinações, seleção por data, contribuição nutricional dos legumes no formatador do bot, reaplicação, reversão e regressão semanal. Banco real, envio Telegram e validação visual autenticada: NÃO EXECUTADOS — esta revisão foi validada localmente.
