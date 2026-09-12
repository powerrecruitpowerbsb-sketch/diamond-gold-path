/**
 * Was a player's previous school a junior college?
 *
 * The page rarely says. It names a school ("Chipola College"), and whether that
 * school is a two-year one is a fact we already hold: the federal directory
 * marks two-year institutions, and our own programs carry NJCAA, CCCAA and NWAC
 * membership. So the junior-college flag is decided against our own records
 * rather than against a keyword list, which would call every "Community
 * College" a JUCO and miss every one that isn't named that way.
 *
 * A school we cannot identify leaves the flag false: a plain transfer is the
 * honest answer, and a wrong JUCO flag is worse than a missing one.
 */

import { nameMatch, normalizeName } from "./school-name-match";

export type JucoLookup = (names: string[]) => Promise<Set<string>>;

/**
 * Load the names of two-year schools we hold, keyed by normalised name.
 * Only the names the roster actually mentions are looked up.
 */
export async function twoYearSchoolNames(supabase: any, names: string[]): Promise<Set<string>> {
  const wanted = names.map((name) => normalizeName(name)).filter(Boolean);
  if (!wanted.length) return new Set();

  const found = new Set<string>();

  // Federal directory: two-year institutions, by their own name and alias.
  const { data: federal } = await supabase
    .from("federal_directory")
    .select("name, alias")
    .eq("two_year", true)
    .limit(5000);
  // Junior-college governing bodies, whichever way a school is named locally.
  const { data: bodies } = await supabase
    .from("programs")
    .select("universities!inner(name)")
    .in("governing_body", ["NJCAA", "CCCAA", "NWAC"])
    .limit(5000);

  const pool: string[] = [];
  for (const row of federal ?? []) {
    if (row?.name) pool.push(String(row.name));
    for (const alias of String(row?.alias ?? "").split("|")) {
      if (alias.trim()) pool.push(alias.trim());
    }
  }
  for (const row of bodies ?? []) {
    const name = (row as any)?.universities?.name;
    if (name) pool.push(String(name));
  }

  for (const listed of names) {
    const hit = pool.some((candidate) => nameMatch(listed, candidate) !== null);
    if (hit) found.add(normalizeName(listed));
  }
  return found;
}

/**
 * Decide the junior-college flag for each player from the school the page named.
 * `jucoNames` holds the normalised names confirmed as two-year schools.
 */
export function markJucoTransfers<T extends { previous_school?: unknown; is_transfer?: unknown; is_juco_transfer?: unknown }>(
  players: T[],
  jucoNames: Set<string>,
): T[] {
  return players.map((player) => {
    const previous = normalizeName(String(player?.previous_school ?? ""));
    if (!previous) return player;
    return {
      ...player,
      is_transfer: true,
      is_juco_transfer: Boolean(player?.is_juco_transfer) || jucoNames.has(previous),
    };
  });
}
