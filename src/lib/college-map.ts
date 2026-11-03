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
export type CollegeMapFilters = { q: string; sport: string; state: string; body: string; division: string; conference: string };

export function filterMapPrograms(programs: CollegeMapProgram[], filters: CollegeMapFilters, bounds: MapBounds | null = null) {
  const name = filters.q.trim().toLowerCase();
  return programs.filter((p) => {
    if (p.sport !== filters.sport || (name && !p.school.toLowerCase().includes(name))) return false;
    if (filters.state && p.state !== filters.state) return false;
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