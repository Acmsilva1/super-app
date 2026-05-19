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
  STATUS_PAGO,
  STATUS_PENDENTE,
  CATEGORIAS_GASTO_VARIADO,
  CATEGORIAS_RECEITA,
} from './model/financeiro.js';

export {
  parseMesAno,
  rangeMes,
  getBrazilTodayIso,
  sortCronologiaAsc,
  sortCronologiaDesc,
  filtrarFinancasPorMes,
  classificarFinancas,
  calcularDashboard,
  calcularGraficos,
  montarTabelaFinanceiroRows,
  payloadInsertFinanceiro,
  payloadUpdateFinanceiro,
  inferTipoRegistro,
} from './service/financeiroService.js';

export {
  assertOfxSize,
  buildOfxUid,
  parseOfxDate,
  inferTipoFromOfx,
  parseOfxToLancamentos,
  annotateLancamentosExistencia,
  resumoImportacaoOfx,
  shouldImportOfxAsGastoVariado,
  isDebitoOfx,
  isPixEnviadoOfx,
} from './service/ofxToFinancas.js';

export {
  OFX_BANK_LABELS,
  OFX_PROFILE_SANTANDER,
  OFX_PROFILE_GENERIC_BR,
  detectOfxBankProfile,
  getOfxLabelSet,
  memoMatchesAny,
  normalizeOfxText,
} from './service/ofxBankLabels.js';
