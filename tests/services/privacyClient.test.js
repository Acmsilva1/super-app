import { it, expect, vi, afterEach } from 'vitest';
import { webcrypto } from 'node:crypto';
import { readBiometricPreference, markBiometricSessionVerified, isBiometricSessionVerified, clearBiometricSessionVerified } from '../../features/auth/biometric.js';
import { clearPrivateClientData } from '../../features/auth/privateClientData.js';
function storage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {get length(){return map.size;},key:i=>[...map.keys()][i],getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key)};
}
afterEach(() => vi.unstubAllGlobals());
it('migrates legacy biometric PII to an opaque credential and clears old cookie/marker', () => {
  const local=storage({superapp_biometric:JSON.stringify({credentialId:'opaque_credential_123',userId:'account',email:'person@example.test',userName:'Person',preferred:true}),superapp_biometric_verified_user:'account'});
  const doc={cookie:''}; vi.stubGlobal('localStorage',local); vi.stubGlobal('document',doc);
  expect(readBiometricPreference()).toEqual({credentialId:'opaque_credential_123'});
  expect(local.getItem('superapp_biometric')).not.toContain('person');
  expect(local.getItem('superapp_biometric_verified_user')).toBeNull();
  expect(doc.cookie).toContain('Max-Age=0');
});
it('binds the opaque session marker to one auth session and clears it', async () => {
  vi.stubGlobal('crypto',webcrypto); vi.stubGlobal('localStorage',storage()); vi.stubGlobal('sessionStorage',storage());
  const token=id=>'header.'+Buffer.from(JSON.stringify({session_id:id})).toString('base64url')+'.signature';
  await markBiometricSessionVerified(token('session-one'));
  expect(await isBiometricSessionVerified(token('session-one'))).toBe(true);
  expect(await isBiometricSessionVerified(token('session-two'))).toBe(false);
  expect(sessionStorage.getItem('superapp_biometric_verified_session')).not.toContain('session-one');
  clearBiometricSessionVerified(); expect(await isBiometricSessionVerified(token('session-one'))).toBe(false);
});
it('logout purges diet/health browser data and cached API responses while preserving the device credential', async () => {
  const local=storage({'superapp:home-diet-quick:last-diet-id':'1','superapp:saude:consumo-agua:v1':'sensitive','superapp_biometric':'opaque'});
  vi.stubGlobal('localStorage',local); vi.stubGlobal('sessionStorage',storage({'superapp_ui_state_v1':'sensitive'})); vi.stubGlobal('location',{origin:'https://app.test'});
  const remove=vi.fn(); vi.stubGlobal('caches',{keys:async()=>['shell'],open:async()=>({keys:async()=>[{url:'https://app.test/api/saude?resource=dietas'},{url:'https://app.test/icon.png'}],delete:remove})});
  await clearPrivateClientData();
  expect(local.length).toBe(1); expect(local.getItem('superapp_biometric')).toBe('opaque'); expect(sessionStorage.length).toBe(0); expect(remove).toHaveBeenCalledTimes(1);
});
