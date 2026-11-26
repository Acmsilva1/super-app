const NOTICE = [
  'O Super App usa seus dados de cadastro e as informações que você registra, como dados de saúde, alimentação, água, treinos e finanças. Peso, medidas e composição corporal são informações de saúde. Informe apenas o necessário.',
  'O acesso é feito com e-mail e senha. A sessão permanece ativa por até 3 horas; depois disso é preciso entrar de novo.',
  'Seus dados ficam nos sistemas que mantêm o Super App. Se você ativar avisos, as informações necessárias podem ser enviadas pelo canal escolhido. O arquivo exportado reúne dados pessoais; guarde-o com cuidado.',
  'Você pode perguntar se guardamos seus dados, pedir uma cópia, corrigir informações erradas e saber com quem elas são compartilhadas. Também pode pedir para interromper um uso, quando isso for possível. Para solicitar a exclusão, fale com o administrador que criou seu acesso. Esse pedido não apaga o mesmo login usado em outros aplicativos.',
  'Mantemos os dados enquanto sua conta estiver em uso ou até o administrador concluir um pedido de exclusão. Os registros de saúde não são apagados automaticamente pelo tempo. Cópias de segurança podem manter alguns dados por um período; o administrador pode informar o prazo.',
];
const TABLE_TITLES = {
  tb_fluxograma_projetos: 'Projetos e fluxogramas', app_user_profiles: 'Perfil da conta', app_user_roles: 'Acessos da conta', app_user_permissions: 'Permissões da conta',
  tb_financas: 'Registros financeiros', tb_despesas_fixas: 'Despesas fixas', tb_poupanca: 'Poupança', tb_poupanca_metas: 'Metas de poupança', tb_compras: 'Lista de compras',
  tb_financeiro_analises: 'Análises financeiras', tb_financeiro_features_mensais: 'Recursos financeiros mensais', tb_financeiro_analise_runs: 'Histórico de análises', tb_financeiro_modelo_estado: 'Planejamento financeiro', tb_financeiro_simulacoes: 'Simulações financeiras', tb_financeiro_alertas: 'Avisos financeiros', tb_financeiro_carne_pago: 'Carnês pagos',
  tb_saude_perfis: 'Perfil de saúde', tb_saude_perfil_medidas: 'Medidas corporais', tb_saude_dietas: 'Planos alimentares', tb_saude_agua_perfis: 'Perfil de hidratação', tb_saude_agua_metas: 'Metas de água', tb_saude_agua_logs: 'Histórico de hidratação', tb_saude_agua_checkins: 'Consumo de água', tb_saude_alertas_agenda: 'Agendamentos de avisos', tb_saude_alertas_envios: 'Avisos enviados', tb_saude_treinos: 'Treinos', tb_saude_treino_blocos: 'Etapas dos treinos', tb_saude_treino_exercicios: 'Exercícios',
  tb_telegram_compras: 'Compras registradas pelo Telegram',
};
const FIELD_TITLES = { id: 'Código do registro', user_id: 'Conta vinculada', owner_id: 'Conta vinculada', created_by: 'Responsável pelo registro', created_at: 'Criado em', updated_at: 'Atualizado em' };
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function fieldTitle(value) {
  return FIELD_TITLES[value] || value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toLocaleUpperCase('pt-BR'));
}
function readableValue(value) {
  if (value === null || value === undefined || value === '') return 'Não informado';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (Array.isArray(value)) return value.length ? value.map(readableValue).join('; ') : 'Nenhum';
  if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${fieldTitle(key)}: ${readableValue(item)}`).join(' · ') || 'Nenhum';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toLocaleString('pt-BR');
  }
  return String(value);
}
function reportGroup(table) {
  if (table.startsWith('tb_saude')) return 'Saúde e bem-estar';
  if (table.startsWith('tb_financeiro') || ['tb_financas', 'tb_despesas_fixas', 'tb_poupanca', 'tb_poupanca_metas'].includes(table)) return 'Finanças';
  if (table.includes('compras')) return 'Compras';
  if (table.includes('treino')) return 'Treinos';
  return 'Conta e outros dados';
}
function appendPrintStyles(doc) {
  const style = doc.createElement('style');
  style.textContent = `
    @page { margin: 16mm 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #202938; font: 10pt/1.45 Arial, sans-serif; }
    main { max-width: 820px; margin: 0 auto; }
    h1 { margin: 0 0 6px; font-size: 22pt; line-height: 1.2; }
    h2 { margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #d7dee8; color: #b42318; font-size: 14pt; }
    h3 { margin: 12px 0 5px; color: #344054; font-size: 11pt; }
    p { margin: 5px 0; }
    .meta, .help, .empty { color: #475467; }
    .warning { margin: 14px 0; padding: 10px 12px; border-left: 3px solid #c90000; background: #fff4f2; }
    .record { margin: 8px 0 12px; padding: 9px 11px; border: 1px solid #e2e7ef; border-radius: 6px; break-inside: avoid; }
    .record h3 { margin-top: 0; }
    dl { display: grid; grid-template-columns: minmax(110px, 30%) 1fr; gap: 4px 10px; margin: 0; }
    dt { color: #475467; font-weight: 700; overflow-wrap: anywhere; }
    dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    .print-actions { position: sticky; top: 0; display: flex; gap: 8px; padding: 12px 0; background: white; }
    .print-actions button { padding: 9px 14px; border: 1px solid #cbd5e1; border-radius: 7px; background: #c90000; color: white; font-weight: 700; }
    .print-actions button:last-child { background: white; color: #344054; }
    @media print { .print-actions { display: none; } h2 { break-after: avoid; } }
  `;
  doc.head.append(style);
}
function createPdfReport(reportWindow, payload) {
  const doc = reportWindow.document;
  doc.documentElement.lang = 'pt-BR';
  doc.title = 'Meus dados do Super App';
  const viewport = doc.createElement('meta');
  viewport.name = 'viewport'; viewport.content = 'width=device-width, initial-scale=1';
  doc.head.append(viewport);
  appendPrintStyles(doc);
  const main = doc.createElement('main');
  const toolbar = element('div', '', 'print-actions');
  const printButton = element('button', 'Salvar ou imprimir em PDF');
  printButton.type = 'button'; printButton.addEventListener('click', () => reportWindow.print());
  const closeButton = element('button', 'Fechar');
  closeButton.type = 'button'; closeButton.addEventListener('click', () => reportWindow.close());
  toolbar.append(printButton, closeButton);
  main.append(toolbar, element('h1', 'Meus dados do Super App'));
  const generatedAt = payload.generatedAt ? new Date(payload.generatedAt) : new Date();
  main.append(element('p', `Gerado em ${generatedAt.toLocaleString('pt-BR')}`, 'meta'));
  if (payload.account?.email) main.append(element('p', `Conta: ${payload.account.email}`, 'meta'));
  main.append(element('p', 'Este arquivo pode conter informações de saúde e finanças. Guarde-o em local protegido.', 'warning'));

  const records = payload.records && typeof payload.records === 'object' ? payload.records : {};
  const groups = new Map();
  for (const [table, rows] of Object.entries(records)) {
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const group = reportGroup(table);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push({ table, rows });
  }
  if (!groups.size) main.append(element('p', 'Não há registros para exibir nesta cópia.', 'empty'));
  for (const [group, tables] of groups) {
    main.append(element('h2', group));
    for (const { table, rows } of tables) {
      main.append(element('h3', TABLE_TITLES[table] || fieldTitle(table)));
      rows.forEach((row, index) => {
        const card = element('section', '', 'record');
        if (rows.length > 1) card.append(element('h3', `Registro ${index + 1}`));
        const list = doc.createElement('dl');
        for (const [key, value] of Object.entries(row || {})) {
          list.append(element('dt', fieldTitle(key)), element('dd', readableValue(value)));
        }
        card.append(list);
        main.append(card);
      });
    }
  }
  if (Array.isArray(payload.unavailable) && payload.unavailable.length) {
    main.append(element('p', `Alguns dados não puderam ser incluídos: ${payload.unavailable.map(table => TABLE_TITLES[table] || fieldTitle(table)).join(', ')}. Fale com o administrador se precisar deles.`, 'help'));
  }
  main.append(element('p', 'Esta cópia reúne os dados disponíveis da sua conta neste app. Senhas e dados de acesso não são incluídos.', 'help'));
  doc.body.replaceChildren(main);
}
export function openPrivacyCenter() {
  const dialog = element('dialog', '', 'privacy-dialog');
  dialog.setAttribute('aria-labelledby', 'privacy-title');
  const header = element('header', '', 'privacy-dialog__header');
  const titleGroup = element('div');
  titleGroup.append(element('p', 'LGPD', 'privacy-dialog__eyebrow'));
  const heading = element('h2', 'Privacidade e seus dados');
  heading.id = 'privacy-title';
  titleGroup.append(heading);
  const close = element('button', '×', 'privacy-dialog__close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Fechar janela de privacidade');
  header.append(titleGroup, close);
  dialog.append(header);
  dialog.append(element('p', 'Baixe uma cópia em PDF. Para pedir a exclusão dos seus dados, fale com o administrador que criou seu acesso.', 'privacy-dialog__intro'));

  const noticeCard = element('div', '', 'privacy-dialog__notice-card');
  noticeCard.tabIndex = 0;
  noticeCard.setAttribute('aria-label', 'Aviso de privacidade com rolagem interna');
  NOTICE.forEach((text, index) => {
    if (index === 3) noticeCard.append(element('h3', 'Seus direitos', 'privacy-dialog__section-title'));
    if (index === 4) noticeCard.append(element('h3', 'Retenção', 'privacy-dialog__section-title'));
    noticeCard.append(element('p', text));
  });
  noticeCard.append(element('h3', 'Contato', 'privacy-dialog__section-title'));
  noticeCard.append(element('p', 'Para exercer outros direitos ou pedir esclarecimentos, fale com o administrador que disponibilizou seu acesso.'));
  dialog.append(noticeCard);

  const actions = element('div', '', 'privacy-dialog__actions');
  const exportButton = element('button', 'Exportar meus dados em PDF', 'privacy-dialog__export');
  exportButton.type = 'button';
  actions.append(exportButton);
  const status = element('p', '', 'privacy-dialog__status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  dialog.append(actions, status);

  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => dialog.remove());
  exportButton.addEventListener('click', async () => {
    const reportWindow = window.open('', '_blank');
    if (!reportWindow) { status.textContent = 'O navegador bloqueou a janela do PDF. Permita a abertura e tente novamente.'; return; }
    exportButton.disabled = true; status.textContent = 'Preparando seu relatório…';
    try {
      const response = await fetch('/api/apps?route=privacy', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || 'Não foi possível preparar o relatório.');
      createPdfReport(reportWindow, body);
      status.textContent = 'Relatório pronto. Na janela aberta, escolha “Salvar ou imprimir em PDF”.';
      reportWindow.focus();
      setTimeout(() => { try { reportWindow.print(); } catch { /* botão manual permanece disponível */ } }, 350);
    } catch (error) {
      reportWindow.close();
      status.textContent = error.message;
    } finally { exportButton.disabled = false; }
  });
  document.body.append(dialog);
  dialog.showModal();
  close.focus();
}
