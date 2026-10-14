import {isLocalWaterStorageMode} from '../saude/service/consumoAguaLocalService.js';
import {readTrainings,saveTrainings} from './localStore.js';
export const isLocalTrainingStorageMode=()=>isLocalWaterStorageMode();
export function createTrainingRepository(profile){
 if(isLocalTrainingStorageMode())return {
  load:async()=>readTrainings(profile),
  async save(row){const rows=readTrainings(profile);saveTrainings(profile,rows.some(item=>item.id===row.id)?rows.map(item=>item.id===row.id?row:item):[...rows,row]);return row;},
  async remove(row){saveTrainings(profile,readTrainings(profile).filter(item=>item.id!==row.id));},
 };
 async function request(method,row){
  const response=await fetch(`/api/saude?resource=treinos&profile_id=${encodeURIComponent(profile.id)}`,{
   method,cache:'no-store',headers:{'Content-Type':'application/json'},
   ...(row?{body:JSON.stringify(row)}:{}),
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'Não foi possível salvar os treinos.');
  return data;
 }
 return {
  load:async()=>(await request('GET')).rows,
  save:async(row,previous)=>(await request(previous?'PATCH':'POST',{...row,updated_at:previous?.updated_at||null})).row,
  remove:row=>request('DELETE',{id:row.id,updated_at:row.updated_at}),
 };
}
