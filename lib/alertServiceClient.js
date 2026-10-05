import { createClient } from '@supabase/supabase-js';

export function getAlertServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('alerts_database_config_missing');
  return createClient(url, key, {
    db: { schema: process.env.SUPABASE_SCHEMA || 'public' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
