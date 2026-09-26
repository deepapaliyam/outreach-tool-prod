import { createClient } from '@supabase/supabase-js';

// These come from your .env file (see .env.example). Vite exposes only
// vars prefixed with VITE_ to the browser. The anon key is safe to ship
// to the browser BECAUSE Row Level Security restricts every query to the
// signed-in user — never put the service_role key here.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn('Supabase env vars missing — copy .env.example to .env and fill them in.');
}

export const supabase = createClient(url, anonKey);
