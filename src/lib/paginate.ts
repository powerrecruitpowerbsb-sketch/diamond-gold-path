/**
 * The data service returns at most 1,000 rows per request, so any list that can
 * exceed that (schools, programs) has to ask for the rest page by page.
 * Without this, alphabetical lists silently stop part-way through the alphabet.
 */
const PAGE_SIZE = 1000;

export async function fetchAllRows<T = any>(
  page: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
  hardCap = 20000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < hardCap; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}
