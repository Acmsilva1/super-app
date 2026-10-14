import {expect,it,vi} from 'vitest';
const rpc=vi.hoisted(()=>vi.fn(async()=>({data:{rows:[]},error:null})));
vi.mock('../../lib/supabase.js',()=>({supabase:{rpc}}));
vi.mock('../../lib/auth.js',()=>({requireUser:async()=>({ok:true,user:{id:'00000000-0000-4000-8000-000000000001'},isAdmin:true})}));
import handler from '../../api/saude.js';
function response(){return {setHeader(){},status(code){this.code=code;return this;},end(text){this.data=JSON.parse(text);}};}
it('rota de treino compartilha a API existente e valida o perfil antes da RPC',async()=>{
 const created=response();await handler({method:'POST',query:{resource:'perfis'},body:{nome:'Teste treino',sexo:'masculino',data_nascimento:'1990-01-01',data_medicao:'2026-10-13',peso_kg:80,altura_cm:180}},created);
 expect(created.code).toBe(201);
 const res=response();await handler({method:'GET',query:{resource:'treinos',profile_id:created.data.row.id}},res);
 expect(res.code).toBe(200);expect(res.data.rows).toEqual([]);
 expect(rpc).toHaveBeenCalledWith('saude_manage_treinos',expect.objectContaining({p_profile:created.data.row.id,p_owner:'00000000-0000-4000-8000-000000000001',p_action:'list'}));
 rpc.mockClear();await handler({method:'GET',query:{resource:'treinos',profile_id:999999}},res);
 expect(res.code).toBe(404);expect(rpc).not.toHaveBeenCalled();
});
