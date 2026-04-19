Refatoração: Subabas + FAB + Popup em Finanças e Despesas
Resumo
Implementar o mesmo padrão de navegação em financas e notas (Despesas Fixas):

Subabas no topo: Resumo (default ao abrir) e Dados.
Aba Resumo: visão direta com cards + gráficos.
Aba Dados: tabela única com todos os lançamentos do mês selecionado.
Botão flutuante + no canto inferior direito da janela do módulo, abrindo formulário em popup modal central.
Layout responsivo mobile preservando visual moderno atual.
Mudanças de implementação
Estrutura de UI por módulo
Criar um shell reutilizável de módulo financeiro com:
cabeçalho de período (mês/ano),
barra de subabas (Resumo, Dados),
área de conteúdo por aba,
FAB fixado ao container da janela do app.
Estado de aba ativo em memória da janela (el.dataset.activeTab), com default sempre Resumo ao abrir/recarregar módulo.
Aplicar em:
renderFinancasContent(el, data)
renderDespesasFixasContent(el, data)
Aba Resumo
Finanças:
manter cards atuais (Receitas, Despesas, Líquido),
manter gráficos (donut + barras) com configuração já modernizada.
Despesas:
cards já existentes (Receitas Finanças, Total mês, Margem),
adicionar gráficos de resumo (ex.: distribuição Pago/Pendente e ranking por valor) usando Chart.js/ECharts já carregados.
Sem tabela/listagem longa nessa aba; foco em leitura rápida.
Aba Dados com tabela única
Finanças:
substituir colunas separadas por uma tabela única de lançamentos (descrição, tipo, categoria, valor, data, ações).
manter filtro de categoria e incluir filtro por tipo no topo da tabela.
Despesas:
substituir listas Pagos/Pendentes por tabela única (descrição, status, valor, ações).
manter ações de editar, alternar status e excluir por linha.
Desktop: tabela padrão.
Mobile: tabela com rolagem horizontal + cabeçalho sticky (sem mudar para cards, conforme decisão).
FAB + e popup de formulário
FAB visível nas duas abas do módulo.
Clique no + abre modal central (desktop e mobile) com formulário de criação.
Reaproveitar estilos de .app-modal-overlay / .app-modal e criar variação para formulário financeiro.
Edição de item via botão da linha também abre o mesmo popup em modo edição.
Ao salvar:
chama endpoints existentes (/api/financas, /api/despesas-fixas) sem alterar contrato,
fecha popup,
atualiza dados e preserva aba ativa atual.
CSS/UX mobile
Novas classes para:
subabas (pill/segment control),
FAB financeiro (posição fixa ao conteúdo da janela, safe-area),
tabela responsiva (overflow-x, largura mínima por coluna),
modal de formulário com largura adaptativa e boa usabilidade touch.
Garantir que em telas pequenas:
subabas não quebrem layout,
FAB não sobreponha conteúdos críticos,
popup tenha altura máxima com scroll interno.
APIs / interfaces
Backend: sem mudanças de endpoints ou payload.
Frontend (novas interfaces internas):
estado de aba por módulo (activeTab: 'summary' | 'data'),
helpers para renderização segmentada (shell, resumo, tabela, popup),
handlers de abrir/fechar popup e salvar/editar reutilizáveis.
IDs/data-actions novos serão adicionados para tabs, FAB e modal, mantendo os data-action atuais de salvar/excluir onde possível.
Testes e cenários
Abertura de módulos
Abrir Finanças e Despesas: sempre iniciar na aba Resumo.
Trocar mês/ano: dados atualizam sem quebrar aba ativa.
Abas
Alternar Resumo ↔ Dados sem perder consistência de totais.
Gráficos renderizam somente em Resumo.
Tabelas
Finanças: filtros de categoria/tipo funcionam na tabela única.
Despesas: status, edição e exclusão funcionam na tabela única.
FAB e popup
FAB abre modal central em desktop e mobile.
Criar lançamento novo e editar existente funcionam nos dois módulos.
Salvar reflete imediatamente em cards/gráficos/tabela.
Regressão visual/mobile
Sem overflow quebrado em 360px/390px/430px.
FAB respeita área segura inferior.
Sem sobreposição indevida de modal e header da janela.
Assunções adotadas
O padrão de subabas será igual para os dois módulos (Resumo e Dados).
A aba Dados será tabela única (não listas separadas).
O popup do + será modal central também no mobile.
Não haverá alteração de banco/contratos de API nesta refatoração; apenas reorganização de UI/UX.