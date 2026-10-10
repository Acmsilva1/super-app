import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn()}));
vi.mock('../../lib/supabase.js',()=>({supabase:mocks}));
import {atualizarRegistroFinanceiro,criarRegistroFinanceiro} from '../../lib/financeiroShared.js';
beforeEach(()=>{vi.clearAllMocks();});
const context={userId:'00000000-0000-4000-8000-000000000001'};
const body={id:9,tipo_registro:'gasto_variado',original_tipo_registro:'despesa_fixa',descricao:'Teste',valor:15,metodo_pagamento:'debito_pix',categoria:'Outros',data_lancamento:'2026-10-07'};
describe('API usa RPCs atomicas sem fallback inseguro',()=>{
  it('realoca com origem e owner do contexto',async()=>{
    mocks.rpc.mockResolvedValue({data:[{id:10,descricao:'Teste'}],error:null});
    const result=await atualizarRegistroFinanceiro({body:{...body,user_id:'outro'}},context);
    expect(result.status).toBe(200);expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith('financeiro_realocar_registro',expect.objectContaining({p_source_id:'9',p_source_table:'tb_despesas_fixas',p_target_table:'tb_financas',p_user_id:context.userId}));
  });
  it.each([['P0002',404],['42501',403],['PGRST202',503],['22023',400],['OTHER',500]])('mapeia erro %s sem nova insercao',async(code,status)=>{
    mocks.rpc.mockResolvedValue({error:{code,message:'diagnostico interno'}});
    const result=await atualizarRegistroFinanceiro({body},context);expect(result.status).toBe(status);expect(mocks.from).not.toHaveBeenCalled();expect(result.data.error).not.toContain('diagnostico interno');
  });
  it('nova meta usa operacao unica',async()=>{
    mocks.rpc.mockResolvedValue({data:{id:1},error:null});
    const result=await criarRegistroFinanceiro({body:{tipo_registro:'meta_poupanca',nome_meta:'Meta',valor_meta:100}},context);
    expect(result.status).toBe(201);expect(mocks.rpc).toHaveBeenCalledWith('financeiro_criar_meta',expect.objectContaining({p_user_id:context.userId}));expect(mocks.from).not.toHaveBeenCalled();
  });
});
