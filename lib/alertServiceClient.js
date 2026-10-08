import { createClient } from '@supabase/supabase-js';
import { unsafeAuthEnvironment } from './authEnvironment.js';

export function getAlertServiceClient({ deadline = null } = {}) {
  if (unsafeAuthEnvironment()) throw new Error('auth_config_unsafe');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('alerts_database_config_missing');
  return createClient(url, key, {
    db: { schema: process.env.SUPABASE_SCHEMA || 'public' },
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init = {}) => {
      const remaining = deadline ? deadline - Date.now() : 10000;
      if (remaining <= 0) throw new Error('alerts_time_budget');
      const signal = AbortSignal.timeout(Math.min(10000,remaining));
      return fetch(input,{ ...init,signal:init.signal ? AbortSignal.any([init.signal,signal]) : signal });
    } },
  });
}
