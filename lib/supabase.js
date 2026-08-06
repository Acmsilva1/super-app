import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || (process.env.OFFLINE_DEV === 'true' ? 'http://localhost:3000' : '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || (process.env.OFFLINE_DEV === 'true' ? 'local-dev-key' : '');

const schema = process.env.SUPABASE_SCHEMA || (process.env.OFFLINE_DEV === 'true' ? 'superapp' : 'public');

if (!url || !key) {
  throw new Error('SUPABASE_URL e SUPABASE_ANON_KEY ou SUPABASE_SERVICE_ROLE_KEY devem estar definidos.');
}

export const supabase = createClient(url, key, {
  db: { schema },
});
