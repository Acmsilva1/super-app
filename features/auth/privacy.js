import { clearPrivateClientData } from './privateClientData.js';

const NOTICE = [
  'O Super App usa dados de conta para autenticação e dados que você registra para oferecer os módulos de finanças, compras, dieta, hidratação e saúde. Peso, medidas e composição corporal são dados pessoais sensíveis e devem ser inseridos apenas quando necessários.',
  'O aplicativo guarda uma chave pública WebAuthn e um identificador opaco para confirmar o aparelho. A digital e o Face ID são processados pelo sistema do celular; o Super App não recebe sua imagem biométrica.',
  'Dados são armazenados na infraestrutura da VPS e no Supabase. Alertas habilitados podem enviar os dados necessários ao canal escolhido. A exportação abaixo contém dados sensíveis: guarde o arquivo em local seguro.',
  'Você pode solicitar acesso, correção, informações de compartilhamento, oposição, revogação quando aplicável, exportação e exclusão ao administrador que disponibilizou seu acesso. A exclusão abaixo exige a senha atual e remove seus registros e acesso ao Super App. A identidade de login compartilhada com outros aplicativos permanece; solicite ao administrador a avaliação de exclusão dessa identidade.',
  'Retenção: os registros ficam enquanto a conta estiver em uso ou até você excluir os dados. O histórico clínico não tem expurgo automático por idade atualmente. Após exclusão, cópias antigas podem permanecer em backups conforme a rotação operacional; o prazo precisa ser confirmado pelo administrador. Não use este app para dados cuja retenção exija prazo garantido até essa configuração ser concluída.',
];
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}
export function openPrivacyCenter() {
  const dialog = element('dialog', '', 'privacy-dialog');
  const heading = element('h2', 'Privacidade e seus dados');
  dialog.setAttribute('aria-labelledby', 'privacy-title');
  heading.id = 'privacy-title';
  dialog.append(heading);
  for (const text of NOTICE) dialog.append(element('p', text));
  const status = element('p');
  status.setAttribute('role', 'status');
  const exportButton = element('button', 'Exportar meus dados (JSON)');
  const deleteButton = element('button', 'Excluir meus dados e acesso ao Super App');
  const close = element('button', 'Fechar');
  const passwordLabel = element('label', 'Senha atual (somente para excluir)');
  const password = element('input');
  password.type = 'password'; password.autocomplete = 'current-password';
  passwordLabel.append(password);
  const confirmationLabel = element('label', 'Digite EXCLUIR MINHA CONTA para confirmar a remoção dos dados e acesso ao Super App');
  const confirmation = element('input');
  confirmation.autocomplete = 'off'; confirmationLabel.append(confirmation);
  dialog.append(exportButton, passwordLabel, confirmationLabel, deleteButton, status, close);
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { password.value = ''; dialog.remove(); });
  exportButton.addEventListener('click', async () => {
    exportButton.disabled = true; status.textContent = 'Preparando a exportação…';
    try {
      const response = await fetch('/api/apps?route=privacy', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || 'Exportação indisponível.');
      const url = URL.createObjectURL(new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' }));
      const link = element('a'); link.href = url; link.download = 'superapp-meus-dados.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = 'Exportação preparada. Confira a lista de tabelas indisponíveis no arquivo.';
    } catch (error) { status.textContent = error.message; }
    finally { exportButton.disabled = false; }
  });
  deleteButton.addEventListener('click', async () => {
    if (confirmation.value !== 'EXCLUIR MINHA CONTA' || !password.value) { status.textContent = 'Preencha a senha atual e a confirmação de exclusão.'; return; }
    deleteButton.disabled = true;
    try {
      const response = await fetch('/api/apps?route=privacy', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: password.value, confirmation: confirmation.value }) });
      password.value = '';
      const body = await response.json();
      if (!response.ok) throw Error(body.error || 'Exclusão indisponível.');
      await clearPrivateClientData();
      localStorage.removeItem('superapp_biometric');
      // Request the existing logout path so Supabase SDK removes persisted session tokens.
      document.getElementById('authLogoutBtn')?.click();
      status.textContent = 'Dados e acesso ao Super App excluídos.';
    } catch (error) { password.value = ''; status.textContent = error.message; }
    finally { deleteButton.disabled = false; }
  });
  document.body.append(dialog);
  dialog.showModal();
  close.focus();
}
