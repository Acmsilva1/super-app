export {
  TABLE_NAME,
  STATUS_PAGO,
  STATUS_PENDENTE,
  DespesaFixa,
} from './model/despesaFixa.js';
export {
  payloadInsert,
  payloadUpdate,
  calcularSoma,
  calcularSomasPorStatus,
  parseRowsSupabase,
} from './service/despesasFixasService.js';
