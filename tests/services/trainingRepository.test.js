import {afterEach,expect,it,vi} from 'vitest';
import {createTrainingRepository} from '../../features/treino/repository.js';
import {trainingDraft} from '../../features/treino/localStore.js';
afterEach(()=>vi.unstubAllGlobals());
it('produção lê e grava pela API de Saúde, inclusive quando executada em localhost real',async()=>{
 vi.stubGlobal('__superAppRuntimeMode','remote');vi.stubGlobal('location',{hostname:'localhost'});
 const storage={getItem:vi.fn(),setItem:vi.fn()};vi.stubGlobal('localStorage',storage);
 const row={id:'00000000-0000-4000-8000-000000000010',...trainingDraft('Meu treino','abc'),updated_at:'2026-10-13T20:00:00Z'};
 const fetch=vi.fn(async(_url,options)=>({ok:true,json:async()=>options.method==='GET'?{rows:[row]}:{row}}));vi.stubGlobal('fetch',fetch);
 const repo=createTrainingRepository({id:7});expect(await repo.load()).toEqual([row]);
 await repo.save(row);await repo.save({...row,nome:'Editado'},row);await repo.remove(row);
 expect(fetch.mock.calls.map(([,options])=>options.method)).toEqual(['GET','POST','PATCH','DELETE']);
 expect(fetch.mock.calls.every(([url])=>url==='/api/saude?resource=treinos&profile_id=7')).toBe(true);
 expect(JSON.parse(fetch.mock.calls[2][1].body).updated_at).toBe(row.updated_at);
 expect(storage.setItem).not.toHaveBeenCalled();expect(storage.getItem).not.toHaveBeenCalled();
});
it('migration ausente ou conflito não faz fallback para armazenamento local',async()=>{
 vi.stubGlobal('__superAppRuntimeMode','remote');
 vi.stubGlobal('fetch',async()=>({ok:false,json:async()=>({error:'Aplique as migrations de treinos.'})}));
 const storage={getItem:vi.fn(),setItem:vi.fn()};vi.stubGlobal('localStorage',storage);
 await expect(createTrainingRepository({id:1}).load()).rejects.toThrow('migrations');
 expect(storage.getItem).not.toHaveBeenCalled();expect(storage.setItem).not.toHaveBeenCalled();
});
