import { afterEach, expect, it, vi } from 'vitest';
import { resolveFinanceWhatsAppProfile } from '../../lib/financeWhatsAppProfile.js';
afterEach(()=>vi.unstubAllEnvs());
function config(row) {
  const filters=[];
  const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},maybeSingle:async()=>({data:row,error:null})};
  return {ownerId:'owner',client:{from:()=>q},filters};
}
it('Financeiro usa perfil numerico somente quando pertence ao dono dos dados',async()=>{
  vi.stubEnv('WHATSAPP_FINANCE_PROFILE_ID','3');
  const valid=config({id:3,created_by:'owner'});
  expect(await resolveFinanceWhatsAppProfile(valid)).toBe('3');
  expect(valid.filters).toContainEqual(['created_by','owner']);
  await expect(resolveFinanceWhatsAppProfile(config({id:3,created_by:'outro'}))).rejects.toThrow('whatsapp_finance_profile_owner_mismatch');
});
it('nao escolhe perfil arbitrario se nao houver mapeamento',async()=>{
  vi.stubEnv('WHATSAPP_FINANCE_PROFILE_ID','');
  await expect(resolveFinanceWhatsAppProfile(config(null))).rejects.toThrow('whatsapp_finance_profile_required');
});
