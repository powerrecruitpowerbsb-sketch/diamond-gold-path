import { lazy, Suspense, useMemo, useState } from "react";
import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { List, Map as MapIcon, Search, X, ArrowUpRight } from "lucide-react";
import { AppShell } from "@/components/brand/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { SchoolSheet, type SheetEntry } from "@/components/list/SchoolSheet";
import { getCollegeMapPrograms } from "@/lib/college-map.functions";
import { filterMapPrograms, MAP_CATEGORIES, mapCategory, mapLocationSuggestions, type MapCategory, type CollegeMapFilters, type MapBounds } from "@/lib/college-map";
import { stateCode, stateName } from "@/lib/regions";
import { useSportMode } from "@/hooks/use-sport-mode";
import { cn } from "@/lib/utils";

const CollegeMapCanvas = lazy(() => import("@/components/map/CollegeMapCanvas"));
const mapQuery = queryOptions({ queryKey: ["college-map-programs"], queryFn: () => getCollegeMapPrograms(), staleTime: 300_000 });

export const Route = createFileRoute("/_authenticated/map")({
  loader: ({ context }) => context.queryClient.ensureQueryData(mapQuery),
  head: () => ({ meta: [
    { title: "College Map — Curve Recruit" },
    { name: "description", content: "Explore college baseball and softball programs by location, division, and conference on an interactive campus map." },
    { property: "og:title", content: "College Map — Curve Recruit" },
    { property: "og:description", content: "Discover college baseball and softball programs across the country." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  errorComponent: ({ reset }) => <AppShell><div role="alert" className="py-12"><h1 className="text-xl font-bold text-graphite">Couldn’t load colleges</h1><Button onClick={reset} className="mt-4">Try again</Button></div></AppShell>,
  pendingComponent: () => <AppShell><p className="py-12 text-steel">Loading colleges…</p></AppShell>,
  component: CollegeMapPage,
});

function FilterSelect({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (v: string) => void }) {
  return <Select value={value || "all"} onValueChange={(v) => onChange(v === "all" ? "" : v)}><SelectTrigger aria-label={label} className="w-full min-w-0 bg-background"><SelectValue placeholder={label} /></SelectTrigger><SelectContent><SelectItem value="all">All {label.toLowerCase()}</SelectItem>{values.map((v) => <SelectItem key={v} value={v}>{label === "States" ? stateName(v) : v}</SelectItem>)}</SelectContent></Select>;
}

function CollegeMapPage() {
  const { data: programs } = useSuspenseQuery(mapQuery);
  const { sport, setSport } = useSportMode();
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const [categories, setCategories] = useState<MapCategory[]>([]);
  const [city, setCity] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [conference, setConference] = useState("");
  const [view, setView] = useState<"map" | "list">("map");
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [inArea, setInArea] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [entry, setEntry] = useState<SheetEntry | null>(null);
  const filters: CollegeMapFilters = { q, sport, state, body: "", division: "", conference, categories, city };
  const matches = useMemo(() => filterMapPrograms(programs, filters), [programs, q, sport, state, categories, conference, city]);
  const visible = useMemo(() => filterMapPrograms(matches, filters, inArea ? bounds : null), [matches, inArea, bounds]);
  const sportPrograms = programs.filter((p) => p.sport === sport);
  const options = (key: "state" | "conference") => Array.from(new Set(sportPrograms.map((p) => key === "state" ? stateCode(p.state) : p.conference).filter((v): v is string => Boolean(v)))).sort();
  const suggestions = mapLocationSuggestions(sportPrograms, locationQuery);
  const fitKey = JSON.stringify([q, sport, state, categories, conference, city]);
  const selected = programs.find((p) => p.id === selectedId);
  const missing = matches.filter((p) => !p.coordinates).length;
  const openSchool = (id: string) => {
    const p = programs.find((p) => p.id === id);
    if (p) setEntry({ id: null, programId: p.id, school: p.school, sport: p.sport, notes: null, threadId: null });
  };

  return <AppShell>
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><p className="mb-1 text-xs font-semibold uppercase text-steel">College discovery</p><h1 className="font-display text-3xl font-bold text-graphite">College Map <span className="align-middle text-xs font-normal text-steel">Preview</span></h1></div>
      <div className="flex gap-1 rounded-md border border-border p-1" role="group" aria-label="College view">
        <Button size="sm" variant={view === "list" ? "secondary" : "ghost"} onClick={() => setView("list")} aria-pressed={view === "list"}><List className="size-4" />List</Button>
        <Button size="sm" variant={view === "map" ? "secondary" : "ghost"} onClick={() => setView("map")} aria-pressed={view === "map"}><MapIcon className="size-4" />Map</Button>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-2 border-y border-border py-3 lg:grid-cols-[2fr_1fr_1fr_2fr]">
      <div className="relative col-span-2 lg:col-span-1"><Search className="absolute left-3 top-3 size-4 text-steel" /><Input aria-label="Search colleges" placeholder="College, city, or state" value={locationQuery} onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} onChange={(e) => { setLocationQuery(e.target.value); setQ(e.target.value); setCity(""); }} onKeyDown={(e) => { if (e.key === "Escape") setSearchFocused(false); if (e.key === "Enter") { setQ(locationQuery); setSearchFocused(false); } }} className="bg-background pl-9" />
        {searchFocused && locationQuery.trim() ? <div className="absolute inset-x-0 top-full z-30 mt-1 rounded-md border border-border bg-background p-1 shadow-lg">
          {suggestions.map((place) => <Button key={place.label} variant="ghost" className="h-auto w-full justify-start whitespace-normal py-2 text-left" onMouseDown={(e) => e.preventDefault()} onClick={() => { setState(place.state); setCity(place.city); setQ(""); setLocationQuery(""); setConference(""); setSearchFocused(false); setSelectedId(null); }}><MapIcon className="size-4 shrink-0" />{place.label}</Button>)}
          <Button variant="ghost" className="h-auto w-full justify-start whitespace-normal py-2 text-left" onMouseDown={(e) => e.preventDefault()} onClick={() => { setQ(locationQuery); setSearchFocused(false); }}><Search className="size-4 shrink-0" />Schools named “{locationQuery}”</Button>
        </div> : null}
      </div>
      <Select value={sport} onValueChange={(v) => { setSport(v as "baseball" | "softball"); setConference(""); setSelectedId(null); }}><SelectTrigger aria-label="Sport" className="bg-background"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="baseball">Baseball</SelectItem><SelectItem value="softball">Softball</SelectItem></SelectContent></Select>
      <FilterSelect label="States" value={state} values={options("state")} onChange={(v) => { setState(v); setCity(""); setQ(""); setLocationQuery(""); setConference(""); setSelectedId(null); }} />
      <FilterSelect label="Conferences" value={conference} values={options("conference")} onChange={setConference} />
      <div className="col-span-2 flex flex-wrap gap-1.5 pt-1 lg:col-span-4" role="group" aria-label="Recruiting categories">
        <Button size="sm" variant={!categories.length ? "secondary" : "outline"} aria-pressed={!categories.length} onClick={() => { setCategories([]); setConference(""); }}>All</Button>
        {MAP_CATEGORIES.map((category) => <Button key={category} size="sm" variant={categories.includes(category) ? "secondary" : "outline"} aria-pressed={categories.includes(category)} onClick={() => { setCategories((current) => current.includes(category) ? current.filter((c) => c !== category) : [...current, category]); setConference(""); setSelectedId(null); }}>{category}</Button>)}
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
      <p aria-live="polite" className="text-graphite"><strong>{visible.length.toLocaleString()}</strong> programs{inArea ? " in this area" : ""}{city ? ` · ${city}` : ""}</p>
      <div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-steel"><Checkbox checked={inArea} onCheckedChange={(v) => setInArea(v === true)} />Search as I move the map</label>
      {(q || state || categories.length || conference || city) ? <Button variant="ghost" size="sm" onClick={() => { setQ(""); setLocationQuery(""); setState(""); setCity(""); setCategories([]); setConference(""); setSelectedId(null); }}><X className="size-4" />Clear</Button> : null}</div>
    </div>
    <div className={cn("grid min-w-0 overflow-hidden border-y border-border", view === "map" ? "lg:h-[min(72vh,850px)] lg:grid-cols-[340px_minmax(0,1fr)]" : "grid-cols-1")}>
      <div className={cn("min-w-0 overflow-y-auto bg-background", view === "map" ? "hidden lg:block" : "max-h-[72vh]")}>
        {!visible.length ? <div className="p-6 text-sm text-steel"><p>{matches.length ? "No colleges in this map area." : "No colleges match these filters."}</p>{matches.length ? <Button variant="link" className="px-0" onClick={() => setInArea(false)}>Show all matching colleges</Button> : null}</div> : null}
        {visible.map((p) => <div key={p.id} onMouseEnter={() => setHighlightedId(p.id)} onMouseLeave={() => setHighlightedId(null)} className={cn("border-b border-border p-4", p.id === selectedId && "bg-org-accent-tint")}>
          <Button variant="ghost" className="h-auto w-full justify-start whitespace-normal p-0 text-left text-graphite hover:bg-transparent" onClick={() => { setSelectedId(p.id); if (view === "list") openSchool(p.id); }}><span className="font-display text-base font-bold">{p.school}</span></Button>
          <p className="mt-1 text-xs text-steel">{[p.city, p.state].filter(Boolean).join(", ")}</p>
          <p className="mt-2 text-xs font-semibold text-org-primary">{[mapCategory(p) ?? [p.body, p.division].filter(Boolean).join(" "), p.conference].filter(Boolean).join(" · ")}</p>
          <div className="mt-2 flex items-center justify-between gap-2">{!p.coordinates ? <span className="text-xs text-steel">Campus location unavailable</span> : <span className="text-xs capitalize text-steel">{p.sport}</span>}<Button variant="ghost" size="sm" aria-label={`View ${p.school}`} onClick={() => openSchool(p.id)}><ArrowUpRight className="size-4" /></Button></div>
        </div>)}
      </div>
      <div className={cn("relative min-w-0", view === "map" ? "h-[58svh] min-h-80 lg:h-full" : "hidden")}>
        <ClientOnly fallback={<div className="h-full bg-muted" />}><Suspense fallback={<div className="h-full bg-muted" />}><CollegeMapCanvas programs={matches} selectedId={selectedId} highlightedId={highlightedId} fitKey={fitKey} onSelect={setSelectedId} onBounds={setBounds} /></Suspense></ClientOnly>
        {selected && matches.some((p) => p.id === selected.id) ? <div className="absolute bottom-9 left-3 right-3 z-10 flex items-center gap-3 rounded-md border border-border bg-background p-3 shadow-lg lg:left-4 lg:right-auto lg:w-80">
          <div className="min-w-0 flex-1"><p className="font-display text-sm font-bold text-graphite">{selected.school}</p><p className="text-xs text-steel">{[selected.city, selected.state, mapCategory(selected)].filter(Boolean).join(" · ")}</p><p className="mt-1 text-xs text-steel">{selected.conference}</p><Button size="sm" variant="link" className="h-8 p-0" onClick={() => openSchool(selected.id)}>View college <ArrowUpRight className="size-4" /></Button></div>
          <Button size="icon" variant="ghost" aria-label="Dismiss selected college" onClick={() => setSelectedId(null)}><X className="size-4" /></Button>
        </div> : null}
      </div>
    </div>
    <p className="mt-3 text-xs text-steel">Campus locations: NCES/IPEDS 2024.{missing ? ` ${missing.toLocaleString()} matching programs have no campus location and appear in List only.` : ""}</p>
    <SchoolSheet entry={entry} athleteId={null} onClose={() => setEntry(null)} />
  </AppShell>;
}