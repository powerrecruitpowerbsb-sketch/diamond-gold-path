import { fetchWikiDirectory, WIKI_SLICES } from "../src/lib/wiki-directory.server";
for (const s of WIKI_SLICES) {
  try {
    const rows = await fetchWikiDirectory(s.key);
    const schools = new Set(rows.map((r) => r.name));
    const noState = rows.filter((r) => !r.state).map((r) => r.name);
    console.log(`${s.label}: ${schools.size} schools, ${rows.length} rows, missing state ${new Set(noState).size}`);
    console.log("  sample:", JSON.stringify(rows.slice(0, 2)));
    if (noState.length) console.log("  no-state sample:", [...new Set(noState)].slice(0, 5).join(" | "));
  } catch (e) { console.log(s.label, "FAILED", e instanceof Error ? e.message : e); }
}
