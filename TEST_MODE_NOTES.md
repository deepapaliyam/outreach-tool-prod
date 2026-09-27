# Test mode — safety net for Send via Gmail

## 1. Run the new SQL
`supabase/test_mode_schema.sql` — adds `test_mode` (defaults **true** —
safe by default on every account, including ones that already exist)
and `test_email` to `sender_profiles`.

## 2. Replace these files
- `src/App.jsx` (full replace)
- `src/styles.js` (full replace)
- `src/lib/sending.js` (full replace)

## What it does
- A banner at the top of the Drafts tab always shows current state —
  green "Test mode ON" or red "Test mode OFF" — impossible to miss
  regardless of which lead is selected.
- **While ON** (the default): "Send via Gmail" sends the real email
  through your real connected Gmail, but to **your own address**
  (or a custom one you set under "Test-mode email") instead of the
  lead's real contact — with the subject prefixed
  `[TEST — would send to <real address>]` so it's unmistakable in your
  inbox. The lead's outcome is **not** touched — it stays unsent, ready
  for a real send later.
- **Turning it off** requires an explicit confirmation dialog stating
  plainly that real emails will go to leads' real addresses from that
  point on.
- The setting is saved per-account (not per-browser), so it's
  consistent across devices/sessions until you deliberately change it.

## Recommended first real test
1. Confirm the banner shows "Test mode ON."
2. Connect Gmail if you haven't on this environment yet.
3. Click **Send via Gmail** on any drafted lead.
4. Check your own inbox for the `[TEST — would send to ...]` email —
   confirms the whole pipeline (Gmail OAuth, the edge function, the
   draft content) end to end with zero risk to any real business.
5. Only after that works, and only when you're actually ready to run
   real outreach, turn test mode off.
