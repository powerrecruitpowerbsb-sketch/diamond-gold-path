import { stateCode, stateName } from "./regions";

export const MAP_CATEGORIES = ["NCAA D1", "NCAA D2", "NCAA D3", "NAIA", "JUCO"] as const;
export type MapCategory = (typeof MAP_CATEGORIES)[number];

export type CollegeMapProgram = {
  id: string;
  school: string;
  city: string | null;
  state: string | null;
  sport: string;
  body: string | null;
  division: string | null;
  conference: string | null;
  coordinates: [number, number] | null;
};

export type MapBounds = [number, number, number, number];
export type CollegeMapFilters = { q: string; sport: string; state: string; body: string; division: string; conference: string; categories?: MapCategory[]; city?: string };

export function mapCategory(p: CollegeMapProgram): MapCategory | null {
  const body = p.body?.trim().toUpperCase();
  if (body === "NAIA") return "NAIA";
  if (["NJCAA", "CCCAA", "3C2A", "NWAC"].includes(body ?? "")) return "JUCO";
  if (body !== "NCAA") return null;
  const division = p.division?.trim().toUpperCase().replace(/^DIVISION\s*|^DIV\.?\s*|^D/, "");
  const number = ({ I: "1", II: "2", III: "3" } as Record<string, string>)[division ?? ""] ?? division;
  return number === "1" ? "NCAA D1" : number === "2" ? "NCAA D2" : number === "3" ? "NCAA D3" : null;
}

export function mapLocationSuggestions(programs: CollegeMapProgram[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const places = new Map<string, { label: string; state: string; city: string }>();
  for (const p of programs) {
    const code = stateCode(p.state);
    if (!code) continue;
    const name = stateName(code);
    if (name.toLowerCase().startsWith(q) || code.toLowerCase() === q) places.set(code, { label: name, state: code, city: "" });
    if (p.city?.toLowerCase().startsWith(q)) places.set(`${code}:${p.city}`, { label: `${p.city}, ${code}`, state: code, city: p.city });
  }
  return Array.from(places.values()).slice(0, 6);
}

export function filterMapPrograms(programs: CollegeMapProgram[], filters: CollegeMapFilters, bounds: MapBounds | null = null) {
  const name = filters.q.trim().toLowerCase();
  return programs.filter((p) => {
    if (p.sport !== filters.sport || (name && !p.school.toLowerCase().includes(name))) return false;
    if (filters.state && (stateCode(p.state) ?? p.state) !== (stateCode(filters.state) ?? filters.state)) return false;
    if (filters.city && p.city !== filters.city) return false;
    if (filters.categories?.length && !filters.categories.some((c) => c === mapCategory(p))) return false;
    if (filters.body && p.body !== filters.body) return false;
    if (filters.division && p.division !== filters.division) return false;
    if (filters.conference && p.conference !== filters.conference) return false;
    if (!bounds) return true;
    if (!p.coordinates) return false;
    const [lng, lat] = p.coordinates;
    const [west, south, east, north] = bounds;
    const longitudeMatches = east - west >= 360 || (west <= east ? lng >= west && lng <= east : lng >= west || lng <= east);
    return longitudeMatches && lat >= south && lat <= north;
  });
}