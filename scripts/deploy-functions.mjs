// Deploys all eight server functions to ONE named Supabase project.
//
// Why this exists: `npx supabase functions deploy` sends the code to whichever project the folder was
// last "linked" to — silently. If that is not the project your live app uses, the app keeps running old
// code (or no code) while the deploy looks successful. This script never relies on the link: it works out
// the project from your app's own address and passes it to every command.
//
//   npm run deploy:functions                       reads VITE_SUPABASE_URL from your .env file
//   npm run deploy:functions -- abcdefghijklmnopqrst        or give the project reference (or its URL)
//   npm run deploy:functions -- --dry-run          show what would happen, change nothing
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const FUNCTIONS = [
  'draft', 'refine-selection', 'enrich-lead', 'send-email', 'gmail-store-token', 'fetch-references', 'admin',
  'health-check',
];
// health-check must be callable by the uptime monitor without a login; every other function needs one.
export const NO_VERIFY_JWT = new Set(['health-check']);

// A project reference is the 20 letters/digits in https://<ref>.supabase.co (or .../dashboard/project/<ref>).
export function parseRef(text) {
  const t = String(text || '').trim();
  if (/^[a-z0-9]{20}$/.test(t)) return t;
  const host = t.match(/([a-z0-9]{20})\.supabase\.(?:co|com|in)\b/i);
  if (host) return host[1].toLowerCase();
  const dash = t.match(/\/project\/([a-z0-9]{20})\b/i);
  if (dash) return dash[1].toLowerCase();
  return '';
}

function envFileValue(text, key) {
  const m = String(text || '').match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
}

// Where the project comes from, in order: what you typed, SUPABASE_PROJECT_REF, then your .env files.
export function resolveRef({ args = [], env = {}, readEnvFile = () => '' }) {
  const typed = args.find(a => !a.startsWith('--'));
  if (typed) {
    const ref = parseRef(typed);
    return ref ? { ref, source: 'what you typed' } : { error: `"${typed}" does not look like a Supabase project reference (20 letters and digits, the first part of https://XXXX.supabase.co).` };
  }
  if (env.SUPABASE_PROJECT_REF) {
    const ref = parseRef(env.SUPABASE_PROJECT_REF);
    if (ref) return { ref, source: 'SUPABASE_PROJECT_REF' };
  }
  for (const f of ['.env.local', '.env']) {
    const ref = parseRef(envFileValue(readEnvFile(f), 'VITE_SUPABASE_URL'));
    if (ref) return { ref, source: f };
  }
  return { error: 'Could not tell which Supabase project to use. Run it again with your project reference, for example:\n\n  npm run deploy:functions -- abcdefghijklmnopqrst\n\nThe reference is the first part of your app\'s Supabase address (https://XXXX.supabase.co). Find it in Vercel → your project → Settings → Environment Variables → VITE_SUPABASE_URL, or in the address bar of the Supabase dashboard (…/dashboard/project/XXXX).' };
}

export function buildCommands(ref, functions = FUNCTIONS) {
  return functions.map(name => ['supabase', 'functions', 'deploy', name, '--project-ref', ref, ...(NO_VERIFY_JWT.has(name) ? ['--no-verify-jwt'] : [])]);
}

export function main({ argv = process.argv.slice(2), env = process.env, cwd = process.cwd(), run = spawnSync, log = console.log } = {}) {
  const dryRun = argv.includes('--dry-run');
  const readEnvFile = (f) => { const p = resolve(cwd, f); return existsSync(p) ? readFileSync(p, 'utf8') : ''; };
  const found = resolveRef({ args: argv, env, readEnvFile });
  if (found.error) { log('\n' + found.error + '\n'); return 1; }
  const { ref, source } = found;

  // Say it out loud if the folder had been linked to a different project: that is the usual way a deploy lands in the wrong place.
  const linked = (readEnvFile('supabase/.temp/project-ref') || '').trim();
  log(`\nDeploying ${FUNCTIONS.length} functions to the Supabase project  ${ref}  (${ref}.supabase.co, taken from ${source}).`);
  if (linked && linked !== ref) log(`Note: this folder was linked to a different project (${linked}). That link is ignored — everything goes to ${ref}.`);
  log(`Check afterwards: https://supabase.com/dashboard/project/${ref}/functions\n`);

  const win = process.platform === 'win32';
  for (const cmd of buildCommands(ref)) {
    log(`> npx ${cmd.join(' ')}`);
    if (dryRun) continue;
    const r = run('npx', cmd, { stdio: 'inherit', shell: win, cwd });
    if (r.status !== 0) {
      log(`\nStopped: "${cmd[3]}" did not deploy (exit ${r.status}). Nothing after it was deployed. If it asks you to log in, run  npx supabase login  and try again.\n`);
      return r.status || 1;
    }
  }
  log(dryRun ? '\nDry run only — nothing was deployed.\n' : `\nDone. Open the link above: all ${FUNCTIONS.length} functions should show today's date.\n`);
  return 0;
}

// Run only when started from the command line (not when the tests import it).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
