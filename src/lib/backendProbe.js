// When a call to one of our server functions gets no answer at all ("Could not reach the server"), there
// are two usual causes that need opposite fixes: the function was never deployed (Supabase is up and
// answers everything else), or the whole Supabase project is paused / unreachable. This asks Supabase's
// own sign-in service a harmless question to tell them apart, so an administrator is told the one fix
// that applies instead of both. Only the administrator screens use it.
export async function probeBackend({ timeoutMs = 8000 } = {}) {
  const base = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!base) return 'down';
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(`${base}/auth/v1/health`, { headers: { apikey: key || '' }, signal: ctl ? ctl.signal : undefined });
    // Any real answer below 500 means the project is awake (even a 401 proves it). A paused project
    // either gives no answer or an error page.
    return res.status < 500 ? 'awake' : 'down';
  } catch {
    return 'down';
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// The project reference is the first part of the app's Supabase address (https://<ref>.supabase.co).
export function projectRef() {
  try { return new URL(import.meta.env.VITE_SUPABASE_URL).hostname.split('.')[0]; } catch { return ''; }
}

// The full sentence an administrator should read when `fn` could not be reached.
export async function explainUnreachable(fn) {
  const state = await probeBackend();
  if (state === 'awake') {
    const ref = projectRef();
    return `Your Supabase project is running, but the "${fn}" function did not answer — it has not been deployed to this project yet. In your project folder run: npm run deploy:functions -- ${ref || 'YOUR-PROJECT-REF'} — wait for it to finish, then reload this page. Naming the project (${ref ? `this app uses ${ref}` : 'the first part of your Supabase address'}) makes sure it goes to the right one. Afterwards the Edge Functions page of that project must list "${fn}".`;
  }
  return 'Could not reach Supabase at all. Check your internet connection first. If you are online, the project is most likely paused (free projects pause after a week without activity): open supabase.com/dashboard, open the project and click "Restore project", wait a minute or two, then reload this page.';
}
