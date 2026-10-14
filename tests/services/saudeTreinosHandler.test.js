import {expect,it,vi} from 'vitest';
import {saudeTreinosHandler,validateTrainingPayload} from '../../lib/saudeTreinosHandler.js';
import {trainingDraft} from '../../features/treino/localStore.js';
function response(){return {setHeader(){},status(code){this.code=code;return this;},end(text){this.data=JSON.parse(text);}};}
const auth={user:{id:'admin'},isAdmin:true},id='00000000-0000-4000-8000-000000000010';
it('admin grava no proprietário do perfil e não aceita created_by do cliente',async()=>{
 const rpc=vi.fn(async()=>({data:{row:{}},error:null})),resolveOwner=vi.fn(async()=>({userId:'owner'})),res=response();
 await saudeTreinosHandler({method:'POST',query:{profile_id:'1'},body:{id,...trainingDraft('Treino','abc'),created_by:'adulterado'}},res,{auth,resolveOwner,client:{rpc}});
 expect(res.code).toBe(200);expect(resolveOwner).toHaveBeenCalledWith('admin',1,true);
 expect(rpc).toHaveBeenCalledWith('saude_manage_treinos',expect.objectContaining({p_owner:'owner',p_profile:1,p_action:'save'}));
 expect(rpc.mock.calls[0][1].p_workout).not.toHaveProperty('created_by');
});
it('perfil não autorizado não consulta nem grava treinos',async()=>{
 const rpc=vi.fn(),res=response();await saudeTreinosHandler({method:'GET',query:{profile_id:1}},res,{auth,resolveOwner:async()=>({notFound:true}),client:{rpc}});
 expect(res.code).toBe(404);expect(rpc).not.toHaveBeenCalled();
});
it('migration ausente informa como habilitar o módulo e edição exige versão',async()=>{
 const res=response(),rpc=vi.fn(async()=>({error:{code:'PGRST202'}}));
 const deps={auth,resolveOwner:async()=>({userId:'owner'}),client:{rpc}};
 await saudeTreinosHandler({method:'GET',query:{profile_id:1}},res,deps);
 expect(res.code).toBe(503);expect(res.data.error).toContain('migrations');
 rpc.mockClear();await saudeTreinosHandler({method:'PATCH',query:{profile_id:1},body:{id,...trainingDraft('Treino','abc')}},res,deps);
 expect(res.code).toBe(400);expect(rpc).not.toHaveBeenCalled();
});
it('dias fixos e estrutura das divisões são validados na API',()=>{
 const row={id,...trainingDraft('Treino','semanal')};row.grupos[0].nome='Outro dia';
 expect(()=>validateTrainingPayload(row)).toThrow('Nome da divisão inválido');
 expect(()=>validateTrainingPayload({id,...trainingDraft('Treino','abc'),grupos:[]})).toThrow('divisões');
});
