import { tarefaModel } from '../model/tarefaModel.js';
import { enviarTelegram } from '../../service/telegramService.js'; // Assumindo que você tem um serviço global de Telegram

export const tarefaService = {
  async processarAlertasAgendados() {
    // Pega a hora exata de Brasília
    const agora = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
    const dataHoje = agora.toISOString().split('T')[0];
    const horaFormatada = agora.getHours().toString().padStart(2, '0') + ":00";

    console.log(`[Tarefas] Verificando slots para ${dataHoje} às ${horaFormatada}`);

    const tarefas = await tarefaModel.buscarTarefasPorHora(dataHoje, horaFormatada);

    if (tarefas.length === 0) return { mensagem: "Nenhuma tarefa para este slot." };

    for (const tarefa of tarefas) {
      const texto = `🚀 **ALERTA DE TAREFA**\n\n📝: ${tarefa.descricao}\n⏰: ${tarefa.slot_hora}`;
      
      await enviarTelegram(process.env.CHAT_ID_FILHO, texto);
      await tarefaModel.marcarComoNotificada(tarefa.id);
    }

    return { processadas: tarefas.length };
  }
};