const KEY = process.env.COLLEGE_SCORECARD_API_KEY!;
const FIELDS = "id,school.name,school.alias,school.city,school.state,school.main_campus,latest.student.size";
async function page(p: number) {
  const url = `https://api.data.gov/ed/collegescorecard/v1/schools?api_key=${KEY}&fields=${FIELDS}&per_page=100&page=${p}&school.operating=1`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return await r.json() as any;
}
const first = await page(0);
const total = first.metadata.total;
const pages = Math.ceil(total / 100);
let rows: any[] = [...first.results];
for (let s = 1; s < pages; s += 8) {
  const idx = [];
  for (let i = s; i < Math.min(s + 8, pages); i++) idx.push(i);
  const res = await Promise.all(idx.map(page));
  for (const r of res) rows.push(...r.results);
}
const now = new Date().toISOString();
const mapped = rows.map((r) => ({
  unitid: r["id"], name: r["school.name"], alias: r["school.alias"] ?? null,
  city: r["school.city"] ?? null, state: r["school.state"] ?? null,
  main_campus: r["school.main_campus"] ?? null, enrollment: r["latest.student.size"] ?? null,
  updated_at: now,
})).filter((r) => r.unitid && r.name);
let stored = 0;
for (let i = 0; i < mapped.length; i += 500) {
  const chunk = mapped.slice(i, i + 500);
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/federal_directory?on_conflict=unitid`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(chunk),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  stored += chunk.length;
}
console.log("stored", stored, "of total", total);
