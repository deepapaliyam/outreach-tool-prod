// Runs `worker(item, index)` over `items` one at a time and stops early
// when carrying on cannot help:
//   - a FATAL error (expired key, no credit, ...) stops immediately;
//   - `maxConsecutiveFailures` failures in a row also stop it (covers
//     "server unreachable", where every call would fail the same way).
// Work already completed is kept — the worker saves each result itself.
export async function runSequentially(items, worker, { maxConsecutiveFailures = 3, onProgress = () => {} } = {}) {
  const total = items.length;
  let done = 0, succeeded = 0, failed = 0, consecutive = 0;
  let lastError = '', stopReason = '', operator = false;

  for (let i = 0; i < total; i++) {
    try {
      await worker(items[i], i);
      succeeded++;
      consecutive = 0;
    } catch (e) {
      failed++;
      consecutive++;
      lastError = (e && e.message) || String(e);
      if (e && e.fatal) { stopReason = lastError; operator = !!e.operator; }
      else if (consecutive >= maxConsecutiveFailures) {
        stopReason = `${consecutive} in a row failed, so it stopped. Last error: ${lastError}`;
      }
    }
    done = i + 1;
    onProgress({ done, total });
    if (stopReason) break;
  }
  return { total, done, succeeded, failed, lastError, stopped: !!stopReason, stopReason, operator };
}

// The one-line message shown under the Generate button ('' = all fine).
export function describeBatchResult(r, noun = 'drafts') {
  if (r.stopped) {
    const saved = r.succeeded
      ? ` ${r.succeeded} ${r.succeeded === 1 ? noun.replace(/s$/, '') : noun} saved before it stopped.`
      : ` Nothing was saved.`;
    return `Stopped after ${r.done} of ${r.total}. ${r.stopReason}${saved}`;
  }
  if (r.failed > 0) return `${r.failed} of ${r.total} ${noun} failed. Last error: ${r.lastError}`;
  return '';
}
