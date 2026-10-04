import { createClient } from '@supabase/supabase-js';
import { PostgrestClient } from '@supabase/postgrest-js';
import { isFixedAuthMode } from './authMode.js';

function createFixedModeClient() {
  const url = process.env.POSTGREST_URL;
  const token = process.env.POSTGREST_TOKEN;
  if (!url || !token) {
    throw new Error('POSTGREST_URL e POSTGREST_TOKEN devem estar definidos com AUTH_MODE=fixed.');
  }
  return new PostgrestClient(url.replace(/\/+$/, ''), {
    schema: process.env.SUPABASE_SCHEMA || 'public',
    headers: { Authorization: `Bearer ${token}` },
  });
}

function createSupabaseClient() {
  const url = process.env.SUPABASE_URL || (process.env.OFFLINE_DEV === 'true' ? 'http://localhost:3000' : '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || (process.env.OFFLINE_DEV === 'true' ? 'local-dev-key' : '');
  const schema = process.env.SUPABASE_SCHEMA || (process.env.OFFLINE_DEV === 'true' ? 'superapp' : 'public');

  if (!url || !key) {
    throw new Error('SUPABASE_URL e SUPABASE_ANON_KEY ou SUPABASE_SERVICE_ROLE_KEY devem estar definidos.');
  }

  return createClient(url, key, {
    db: { schema },
  });
}

export const supabase = isFixedAuthMode() ? createFixedModeClient() : createSupabaseClient();
