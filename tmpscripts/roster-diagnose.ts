/**
 * Report-only diagnosis of the four named roster counts. Reads each page
 * directly, and again through the rendering service when the direct read holds
 * no player rows, then reports what the structural parser found.
 *
 * Run: bun tmpscripts/roster-diagnose.ts
 */
import { safeFetch } from "@/lib/safe-fetch.server";
import { parseRoster } from "@/lib/roster-extract";

const PAGES: Array<{ label: string; url: string; sport: string; reported: number }> = [
  { label: "USF baseball", url: "https://gousfbulls.com/sports/baseball/roster", sport: "baseball", reported: 217 },
  { label: "Wake Forest baseball", url: "https://godeacs.com/sports/baseball/roster", sport: "baseball", reported: 208 },
  { label: "Vanderbilt baseball", url: "https://vucommodores.com/sports/baseball/roster", sport: "baseball", reported: 81 },
  { label: "LSU baseball", url: "https://lsusports.net/sports/bsb/roster", sport: "baseball", reported: 10 },
];

for (const page of PAGES) {
  let read = await safeFetch(page.url);
  let text = read.ok ? (read.markdown ?? read.html ?? "") : "";
  let shape = parseRoster(text, page.sport);
  let method = read.fetch_method;

  if (read.ok && !shape.players.length) {
    const rendered = await safeFetch(page.url, { preferRendered: true });
    if (rendered.ok) {
      read = rendered;
      text = rendered.markdown ?? rendered.html ?? "";
      shape = parseRoster(text, page.sport);
      method = "rendered";
    }
  }

  console.log(
    JSON.stringify(
      {
        page: page.label,
        previously_reported: page.reported,
        read_ok: read.ok,
        method,
        players_now: shape.players.length,
        with_number: shape.counts.withNumber,
        with_position: shape.counts.withPosition,
        with_class: shape.counts.withClass,
        bare_names_dropped: shape.bareNames.length,
        furniture_dropped: shape.furniture.length,
        duplicate_names: shape.duplicateNames,
        seasons_seen: shape.seasons,
        other_sports_seen: shape.otherSports,
        flags: shape.flags,
        first_five: shape.players.slice(0, 5),
      },
      null,
      2,
    ),
  );
}
