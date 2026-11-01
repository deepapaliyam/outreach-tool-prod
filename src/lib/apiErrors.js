// One place that turns "a function call went wrong" into an Error the UI
// can reason about. The Edge Functions reply with { error, code, fatal }:
//   error - a plain-language sentence safe to show to the user
//   code  - a short machine-readable reason (anthropic_key_invalid, ...)
//   fatal - true for SETUP problems (expired key, no credit, Gmail needs
//           reconnecting). Repeating the call cannot fix those, so batch
//           runners stop instead of failing once per lead.
//   user_error - only on problems that belong to the OPERATOR (the AI key,
//           the search key, credit). A neutral sentence for ordinary users:
//           they cannot fix an expired key, and the real detail is for the
//           administrator, who sees it in the Admin tab.
//
// Who is looking decides which sentence is shown, so the app tells this
// module once, after sign-in, whether the viewer is an administrator.

let viewerIsAdmin = false;
export function setViewerIsAdmin(value) { viewerIsAdmin = !!value; }
export function isViewerAdmin() { return viewerIsAdmin; }

export function functionError(res, data, fallback) {
  const hasMessage = data && typeof data.error === 'string' && data.error;
  const adminMessage = hasMessage ? data.error : `${fallback} (${res.status})`;
  const neutral = data && typeof data.user_error === 'string' && data.user_error ? data.user_error : '';
  let message = !viewerIsAdmin && neutral ? neutral : adminMessage;
  // Our functions send string codes; the Supabase gateway's own errors use a numeric `code`, which is not ours.
  let code = data && typeof data.code === 'string' ? data.code : undefined;
  let fatal = !!(data && data.fatal);

  // Supabase's gateway (not our code) answers 401 when the login has lapsed.
  if (res.status === 401 && !code) {
    message = 'Your sign-in has expired. Sign out and sign in again, then retry.';
    code = 'session_expired';
    fatal = true;
  }

  const err = new Error(message);
  err.status = res.status;
  err.code = code;
  err.fatal = fatal;
  err.adminMessage = adminMessage;     // always the full text; only administrators ever see it
  err.operator = !!neutral;            // true = a server/API-key problem, not something the user can fix
  return err;
}

// fetch() itself rejects (a TypeError, "Failed to fetch") when the server
// cannot be reached at all — offline, or a free Supabase project that has
// paused itself after a week without activity.
export function networkError(e) {
  if (e && (e.name === 'TypeError' || e.network)) {
    const err = new Error(viewerIsAdmin
      ? 'Could not reach the server. Check your internet connection. If it keeps happening, your Supabase project may be paused — open the Supabase dashboard and click "Resume project".'
      : 'Could not reach the server. Check your internet connection and try again. If it keeps happening, please tell your administrator.');
    err.code = 'network';
    err.network = true;
    err.status = 0;
    err.fatal = false;
    return err;
  }
  return e;
}

// fetch + the two conversions above, so each caller stays short.
export async function callFunction(url, { token, body, fallback }) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw networkError(e);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw functionError(res, data, fallback);
  return data;
}
