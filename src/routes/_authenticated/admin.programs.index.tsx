import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PlusCircle, Search } from "lucide-react";

import { listPrograms } from "@/lib/admin.functions";
import { SPORTS, GOVERNING_BODIES, titleCase } from "@/lib/admin-schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SourceLine } from "@/components/brand/DataSignals";

export const Route = createFileRoute("/_authenticated/admin/programs/")({
  component: ProgramsList,
});

function ProgramsList() {
  const fetchPrograms = useServerFn(listPrograms);
  const { data, isPending } = useQuery({
    queryKey: ["admin-programs"],
    queryFn: () => fetchPrograms(),
  });

  const [search, setSearch] = useState("");
  const [sport, setSport] = useState("");
  const [body, setBody] = useState("");

  const rows = ((data ?? []) as any[]).filter((p) => {
    const name = p.universities?.name ?? "";
    if (search && !`${name} ${p.conference ?? ""}`.toLowerCase().includes(search.toLowerCase()))
      return false;
    if (sport && p.sport !== sport) return false;
    if (body && p.governing_body !== body) return false;
    return true;
  });

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-graphite">Programs</h1>
          <p className="mt-1 text-sm text-steel">{rows.length} programs</p>
        </div>
        <Button asChild className="touch-target bg-seam-red text-white hover:bg-seam-red/90">
          <Link to="/admin/programs/new">
            <PlusCircle className="size-4" aria-hidden />
            Add program
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-[0_2px_14px_-8px_rgba(18,35,58,0.35)] sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-steel" aria-hidden />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search school or conference"
            aria-label="Search school or conference"
            className="pl-9"
          />
        </div>
        <select
          aria-label="Sport"
          value={sport}
          onChange={(event) => setSport(event.target.value)}
          className="h-10 rounded-md border border-input bg-background px-2.5 text-sm"
        >
          <option value="">Sport: any</option>
          {SPORTS.map((s) => (
            <option key={s} value={s}>
              {titleCase(s)}
            </option>
          ))}
        </select>
        <select
          aria-label="Governing body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className="h-10 rounded-md border border-input bg-background px-2.5 text-sm"
        >
          <option value="">Body: any</option>
          {GOVERNING_BODIES.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>

      {isPending ? (
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-[0_2px_14px_-8px_rgba(18,35,58,0.35)]">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {["School", "Sport", "Level", "Conference", "Head coach", "Source", ""].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-[10px] font-semibold tracking-wide text-steel uppercase"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 font-semibold text-graphite">
                    <Link
                      to="/admin/universities/$id"
                      params={{ id: p.university_id }}
                      className="hover:text-org-primary hover:underline"
                    >
                      {p.universities?.name ?? "—"}
                    </Link>
                    <span className="meta ml-2">{p.universities?.state ?? ""}</span>
                  </td>
                  <td className="px-4 py-3 text-graphite">{titleCase(p.sport)}</td>
                  <td className="px-4 py-3 tabular text-graphite">
                    {[p.governing_body, p.division].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-graphite">{p.conference ?? "—"}</td>
                  <td className="px-4 py-3 text-graphite">{p.head_coach_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <SourceLine lastVerifiedAt={p.last_verified_at} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to="/admin/programs/$id/edit"
                      params={{ id: p.id }}
                      className="text-xs font-semibold text-org-primary hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
