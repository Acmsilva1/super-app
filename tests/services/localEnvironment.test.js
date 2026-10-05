import { describe,expect,it } from 'vitest';
import { configureDevelopmentEnv } from '../../scripts/local-env.js';
describe('Local mock isolation',()=>{
  it('defaults to mocks and removes production database credentials',()=>{
    const env={SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'private',AUTH_MODE:'fixed',POSTGREST_TOKEN:'private'};
    configureDevelopmentEnv('missing-directory',{env});
    expect(env.OFFLINE_DEV).toBe('true');expect(env.LOCAL_DATA_MODE).toBe('mock');
    expect(env.SUPABASE_URL).toBe('http://127.0.0.1:3000');expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    expect(env.POSTGREST_TOKEN).toBeUndefined();expect(env.SAUDE_ALERTS_ENABLED).toBe('false');
  });
  it('refuses a Vercel or production environment',()=>{
    for(const env of [{VERCEL:'1'},{NODE_ENV:'production'}])expect(()=>configureDevelopmentEnv('missing-directory',{env})).toThrow();
  });
  it('real mode must be explicitly selected',()=>{
    const env={SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'private'};
    configureDevelopmentEnv('missing-directory',{real:true,env});
    expect(env.OFFLINE_DEV).toBe('false');expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe('private');
  });
});
