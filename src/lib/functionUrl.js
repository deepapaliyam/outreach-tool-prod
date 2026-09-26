// Builds an absolute URL to a Supabase Edge Function. Used instead of a
// relative '/api/...' path so calls work the same way in local dev and
// in a production build — no dev-server-only proxy to keep in sync with
// hosting config. Every function already sends
// 'Access-Control-Allow-Origin: *', so calling it directly cross-origin
// from wherever the frontend is hosted works with no extra setup.
export function functionUrl(name) {
  const base = import.meta.env.VITE_SUPABASE_URL;
  return `${base}/functions/v1/${name}`;
}
