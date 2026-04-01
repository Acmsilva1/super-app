/** Modelo alinhado a tb_tarefas_jobson. */
export const TABLE_NAME = 'tb_tarefas_jobson';

export const STATUS_TAREFA = ['pendente', 'concluida'];

export class TarefaJobson {
  constructor({
    descricao,
    data,
    slot_hora,
    status = 'pendente',
    notificado = false,
    id = null,
    created_at = null,
  }) {
    this.descricao = descricao ?? '';
    this.data = data ?? null;
    this.slot_hora = slot_hora ?? null;
    this.status = STATUS_TAREFA.includes(status) ? status : 'pendente';
    this.notificado = Boolean(notificado);
    this.id = id ?? null;
    this.created_at = created_at ?? null;
  }

  toInsert() {
    const payload = {
      descricao: (this.descricao || '').trim(),
      status: STATUS_TAREFA.includes(this.status) ? this.status : 'pendente',
      notificado: Boolean(this.notificado),
    };
    if (this.data) payload.data = this.data;
    if (this.slot_hora != null && String(this.slot_hora).trim()) {
      payload.slot_hora = String(this.slot_hora).trim().slice(0, 5);
    }
    return payload;
  }

  static fromRow(row) {
    return new TarefaJobson({
      id: row?.id,
      created_at: row?.created_at,
      descricao: row?.descricao || '',
      data: row?.data || null,
      slot_hora: row?.slot_hora || null,
      status: row?.status || 'pendente',
      notificado: Boolean(row?.notificado ?? false),
    });
  }
}
