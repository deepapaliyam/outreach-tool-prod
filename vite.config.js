import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// No dev-server proxy needed: every Supabase Function call goes to an
// absolute URL (see src/lib/functionUrl.js) built from
// VITE_SUPABASE_URL, so the exact same code path works in `npm run dev`
// and in a production build, on any host.
export default defineConfig({
  plugins: [react()],
});
