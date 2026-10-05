import request from 'supertest';
import {beforeAll,afterAll,describe,expect,it,vi} from 'vitest';
import {createDevApp} from '../../dev-server.js';
let app;
beforeAll(async()=>{
  vi.stubEnv('NODE_ENV','development');vi.stubEnv('OFFLINE_DEV','true');vi.stubEnv('LOCAL_DATA_MODE','mock');
  vi.stubEnv('SAUDE_ALERTS_ENABLED','false');vi.stubEnv('SUPABASE_URL','http://127.0.0.1:3000');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','');app=await createDevApp();
});
afterAll(()=>vi.unstubAllEnvs());
describe('All local application modules',()=>{
  it('serves the catalog and offline auth',async()=>{
    expect((await request(app).get('/api/apps')).body).toHaveLength(4);
    expect((await request(app).get('/api/auth-config')).body.offlineMode).toBe(true);
  });
  it('serves Financeiro and Lista de Compras without a database',async()=>{
    for(const endpoint of ['/api/financeiro','/api/lista-compras','/api/financeiro-analista'])expect((await request(app).get(endpoint)).status).toBe(200);
  });
  it('seeds a profile, diet and editable alert schedule',async()=>{
    const profiles=await request(app).get('/api/saude?resource=perfis');expect(profiles.status).toBe(200);
    const id=profiles.body.rows[0].id;
    const diet=await request(app).get(`/api/saude?resource=dietas&perfil_id=${id}`);expect(diet.body.rows.length).toBeGreaterThan(0);
    const saved=await request(app).post('/api/saude?resource=alertas-agenda').send({profile_id:id,agua_ativo:true,agua_intervalo_horas:2,dieta_ativa:true,dieta_id:diet.body.rows[0].id});
    expect(saved.status).toBe(200);expect(saved.body.row.agua_intervalo_horas).toBe(2);
  });
  it('allows local admin creation, permissions and blocking in memory',async()=>{
    const response=await request(app).post('/api/admin/usuarios').send({name:'Teste Mock',email:'mock@example.invalid'});
    expect(response.status).toBe(201);const id=response.body.user_id;
    expect((await request(app).patch('/api/admin/usuarios').send({user_id:id,app_id:'saude',can_access:true})).status).toBe(200);
    expect((await request(app).patch('/api/admin/usuarios').send({user_id:id,action:'status',blocked:true})).body.is_banned).toBe(true);
  });
  it('persists Fluxograma CRUD in memory',async()=>{
    const created=await request(app).post('/api/fluxograma').send({nome:'Teste',dados:{nodes:[],edges:[]}});
    expect(created.status).toBe(201);const id=created.body.id;
    expect((await request(app).patch('/api/fluxograma').send({id,nome:'Editado'})).body.nome).toBe('Editado');
    expect((await request(app).delete(`/api/fluxograma?id=${id}`)).status).toBe(200);
  });
  it('never triggers external notifications in mock mode',async()=>{
    for(const endpoint of ['/api/saude-alertas-cron','/api/telegram-alert'])expect((await request(app).get(endpoint)).status).toBe(503);
  });
  it('does not expose secrets or repository files through the backend',async()=>{
    for(const endpoint of ['/.env.local','/.env.telegram.local','/.git/config','/scripts/local-env.js'])expect((await request(app).get(endpoint)).status).toBe(404);
  });
});
