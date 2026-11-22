// Supabase (PostgREST) answers any single request with at most 1000 rows — silently, with no warning —
// however many rows match. Anything that must see EVERY row has to ask page by page. This does that.
//
// `fetchPage(from, to)` must return the rows from position `from` to `to` (inclusive) in a stable order.
// Each next page starts after the rows actually received (not after the rows asked for), so it still works
// if the server's cap is lower than the page size, and it stops on the first empty page.
export async function fetchAllPages(fetchPage, { pageSize = 1000, maxRows = 500000 } = {}) {
  const out = [];
  while (out.length < maxRows) {
    const want = Math.min(pageSize, maxRows - out.length);
    const rows = await fetchPage(out.length, out.length + want - 1);
    if (!rows || rows.length === 0) break;
    out.push(...rows);
  }
  return out;
}

export function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
