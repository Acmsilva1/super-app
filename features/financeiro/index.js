export {
  TABLE_FINANCAS,
  TABLE_DESPESAS_FIXAS,
  TIPO_REGISTRO_DESPESA_FIXA,
  TIPO_REGISTRO_GASTO_VARIADO,
  TIPO_REGISTRO_META_POUPANCA,
  TIPO_REGISTRO_POUPANCA,
  TIPO_REGISTRO_RECEITA,
  TABLE_POUPANCA,
  TABLE_POUPANCA_METAS,
  TABLE_FINANCEIRO_ANALISES,
  TABLE_FINANCEIRO_FEATURES_MENSAIS,
  TABLE_FINANCEIRO_ANALISE_RUNS,
  TABLE_FINANCEIRO_MODELO_ESTADO,
  STATUS_PAGO,
  STATUS_PENDENTE,
  CATEGORIAS_GASTO_VARIADO,
  CATEGORIAS_RECEITA,
} from './model/financeiro.js';


export {
  buildReplicationSlotsFromStart,
  seriesDefinitionsFromYearRows,
  slotsNeededForMonth,
  rowMatchesReplicationSlot,
  buildInsertPayloadFromSlot,
  createdAtForMesAno,
} from './service/despesaFixaReplication.js';

export {
  inferTipoRegistro,
  parseMesAno,
  rangeMes,
  filtrarFinancasPorMes,
  classificarFinancas,
  calcularDashboard,
  calcularGraficos,
  montarTabelaFinanceiroRows,
  payloadInsertFinanceiro,
  payloadUpdateFinanceiro,
  getBrazilTodayIso,
} from './service/financeiroService.js';

export {
  buildFinanceiroAnalise,
  defaultFinanceiroPesos,
  normalizarFinanceiroPesos,
  extrairFinanceiroFeatures,
  construirFinanceiroFeedback,
  ajustarFinanceiroPesos,
  calcularFinanceiroRiscoScore,
} from './service/financeiroAnalistaService.js';
