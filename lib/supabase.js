import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error('SUPABASE_URL e SUPABASE_ANON_KEY devem estar definidos (Vercel Secrets).');
}

export const supabase = createClient(url, key);
