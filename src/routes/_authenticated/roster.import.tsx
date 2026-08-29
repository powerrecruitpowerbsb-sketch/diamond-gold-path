import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowLeft, Upload } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/brand/AppShell";
import { AuthButton } from "@/components/brand/AuthButton";
import { importAthletes, matchAthletes } from "@/lib/athletes.functions";

export const Route = createFileRoute("/_authenticated/roster/import")({
  head: () => ({
    meta: [
      { title: "Import athletes from CSV — Power Recruit" },
      {
        name: "description",
        content: "Bulk import your organization's athletes from a CSV file with column mapping and preview.",
      },
      { property: "og:title", content: "Import athletes from CSV — Power Recruit" },
      {
        property: "og:description",
        content: "Map columns, preview rows, then import athletes into Power Recruit.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ImportAthletes,
});

type Field = "name" | "gradYear" | "primaryPosition" | "bats" | "throws" | "parentEmail";

const FIELDS: { key: Field; label: string; required: boolean; hints: string[] }[] = [
  { key: "name", label: "Name", required: true, hints: ["name", "athlete", "player", "full name"] },
  { key: "gradYear", label: "Graduation year", required: false, hints: ["grad", "class", "year"] },
  { key: "primaryPosition", label: "Primary position", required: false, hints: ["position", "pos"] },
  { key: "bats", label: "Bats", required: false, hints: ["bats", "b"] },
  { key: "throws", label: "Throws", required: false, hints: ["throws", "t"] },
  {
    key: "parentEmail",
    label: "Parent email",
    required: false,
    hints: ["parent email", "parent", "guardian", "email"],
  },
];

/** Minimal RFC4180-ish CSV parser: handles quoted fields, commas and CRLF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i += 1;
        } else quoted = false;
      } else value += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (char !== "\r") value += char;
  }
  if (value !== "" || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

type PreviewRow = {
  index: number;
  name: string;
  gradYear: number | null;
  primaryPosition: string | null;
  bats: string | null;
  throws: string | null;
  errors: string[];
  matchId: string | null;
  action: "create" | "update" | "skip";
};

const FIELD_CLASS =
  "touch-target rounded-lg border border-border bg-white px-3 text-sm text-graphite outline-none focus:border-org-primary";

function ImportAthletes() {
  const matchFn = useServerFn(matchAthletes);
  const importFn = useServerFn(importAthletes);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [fileError, setFileError] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<Field, string>>({
    name: "",
    gradYear: "",
    primaryPosition: "",
    bats: "",
    throws: "",
  });
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [importing, setImporting] = useState(false);

  async function onFile(file: File | null) {
    setPreview(null);
    setFileError(null);
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) {
      setFileError("That file isn't a .csv — export your roster as CSV and try again.");
      return;
    }
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length < 2) {
      setFileError("This CSV has no data rows — it needs a header row plus at least one athlete.");
      return;
    }
    const head = (parsed[0] ?? []).map((h) => h.trim());
    setHeaders(head);
    setRawRows(parsed.slice(1));

    // Guess the mapping from the header names so the common case is one click.
    const guess = { ...mapping };
    for (const field of FIELDS) {
      const found = head.find((h) => field.hints.some((hint) => h.toLowerCase().trim() === hint))
        ?? head.find((h) => field.hints.some((hint) => h.toLowerCase().includes(hint)));
      guess[field.key] = found ?? "";
    }
    setMapping(guess);
  }

  const canPreview = Boolean(mapping.name);

  async function buildPreview() {
    const columnIndex = (field: Field) => headers.indexOf(mapping[field]);
    const nameIdx = columnIndex("name");
    if (nameIdx < 0) {
      setFileError("Map a column to Name before previewing.");
      return;
    }

    const rows: PreviewRow[] = rawRows.map((cells, i) => {
      const cell = (field: Field) => {
        const idx = columnIndex(field);
        return idx >= 0 ? (cells[idx] ?? "").trim() : "";
      };
      const errors: string[] = [];
      const name = cell("name");
      if (!name) errors.push("missing name");

      const rawYear = cell("gradYear");
      let gradYear: number | null = null;
      if (rawYear) {
        const digits = rawYear.match(/\d{4}/)?.[0] ?? rawYear;
        const parsed = Number(digits);
        if (!Number.isInteger(parsed) || parsed < 1900 || parsed > 2100) {
          errors.push(`unreadable grad year "${rawYear}"`);
        } else gradYear = parsed;
      }

      const bats = cell("bats").toUpperCase().slice(0, 1);
      if (bats && !["R", "L", "S"].includes(bats)) errors.push(`bats "${cell("bats")}" must be R, L or S`);
      const throws = cell("throws").toUpperCase().slice(0, 1);
      if (throws && !["R", "L"].includes(throws)) errors.push(`throws "${cell("throws")}" must be R or L`);

      return {
        index: i + 2,
        name,
        gradYear,
        primaryPosition: cell("primaryPosition") || null,
        bats: bats || null,
        throws: throws || null,
        errors,
        matchId: null,
        action: errors.length ? "skip" : "create",
      };
    });

    try {
      const { matches } = await matchFn({
        data: { rows: rows.map((r) => ({ name: r.name, gradYear: r.gradYear })) },
      });
      rows.forEach((row, i) => {
        const matchId = matches[i] ?? null;
        row.matchId = matchId;
        if (matchId && !row.errors.length) row.action = "update";
      });
    } catch (error) {
      toast.error(`Couldn't check for duplicates: ${(error as Error).message}`);
    }

    setFileError(null);
    setPreview(rows);
  }

  const counts = useMemo(() => {
    const rows = preview ?? [];
    return {
      create: rows.filter((r) => r.action === "create").length,
      update: rows.filter((r) => r.action === "update").length,
      skip: rows.filter((r) => r.action === "skip").length,
      bad: rows.filter((r) => r.errors.length).length,
      dupes: rows.filter((r) => r.matchId).length,
    };
  }, [preview]);

  async function commit() {
    if (!preview) return;
    setImporting(true);
    try {
      const result = await importFn({
        data: {
          rows: preview
            .filter((row) => row.action !== "skip")
            .map((row) => ({
              name: row.name,
              gradYear: row.gradYear,
              primaryPosition: row.primaryPosition,
              bats: row.bats,
              throws: row.throws,
              action: row.action,
              matchId: row.matchId,
            })),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["org-athletes"] });
      if (result.failures.length) {
        toast.error(`${result.failures.length} row(s) failed: ${result.failures[0]?.message}`);
      } else {
        toast.success(`Imported ${result.created} new, updated ${result.updated}`);
        navigate({ to: "/roster" });
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <AppShell right={<AuthButton />}>
      <Link to="/roster" className="inline-flex items-center gap-2 text-sm font-medium text-steel hover:text-org-primary">
        <ArrowLeft className="size-4" aria-hidden /> Roster
      </Link>

      <div className="mt-4 max-w-5xl">
        <h1 className="font-display text-3xl font-bold text-graphite">Import athletes from CSV</h1>
        <p className="mt-1 text-sm text-steel">
          Upload, map your columns, review the preview, then import. Nothing is saved until you confirm.
        </p>

        <section className="mt-6 rounded-xl border border-border bg-white p-6 shadow-[0_2px_14px_-10px_rgba(18,35,58,0.4)]">
          <h2 className="font-display text-lg font-bold text-graphite">1 · Upload</h2>
          <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-border bg-chalk px-4 py-3 text-sm font-semibold text-graphite hover:bg-white">
            <Upload className="size-4" aria-hidden />
            Choose CSV file
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => void onFile(event.target.files?.[0] ?? null)}
            />
          </label>
          {headers.length ? (
            <p className="mt-2 font-mono text-xs text-steel">
              {rawRows.length} data row(s) · columns: {headers.join(", ")}
            </p>
          ) : null}
          {fileError ? (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-seam-red/30 bg-seam-red-tint p-3 text-sm text-seam-red">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {fileError}
            </p>
          ) : null}
        </section>

        {headers.length ? (
          <section className="mt-6 rounded-xl border border-border bg-white p-6 shadow-[0_2px_14px_-10px_rgba(18,35,58,0.4)]">
            <h2 className="font-display text-lg font-bold text-graphite">2 · Map columns</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FIELDS.map((field) => (
                <label key={field.key} className="text-sm">
                  <span className="font-mono text-[11px] tracking-wide text-steel uppercase">
                    {field.label}
                    {field.required ? " *" : ""}
                  </span>
                  <select
                    value={mapping[field.key]}
                    onChange={(event) =>
                      setMapping((prev) => ({ ...prev, [field.key]: event.target.value }))
                    }
                    className={`mt-1 w-full ${FIELD_CLASS}`}
                  >
                    <option value="">— not mapped —</option>
                    {headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {!canPreview ? (
              <p className="mt-3 text-sm text-seam-red">
                Name is required — pick which CSV column holds the athlete's name.
              </p>
            ) : null}
            <button
              type="button"
              disabled={!canPreview}
              onClick={() => void buildPreview()}
              className="touch-target mt-4 inline-flex items-center rounded-xl bg-org-primary px-5 text-sm font-semibold text-white disabled:opacity-60"
            >
              Preview rows
            </button>
          </section>
        ) : null}

        {preview ? (
          <section className="mt-6 rounded-xl border border-border bg-white p-6 shadow-[0_2px_14px_-10px_rgba(18,35,58,0.4)]">
            <h2 className="font-display text-lg font-bold text-graphite">3 · Review and import</h2>
            <p className="mt-1 font-mono text-xs text-steel">
              {counts.create} to create · {counts.update} to update · {counts.skip} skipped ·{" "}
              {counts.dupes} possible duplicate(s) · {counts.bad} row(s) with problems
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm tabular-nums">
                <thead className="bg-chalk font-mono text-[11px] tracking-wide text-steel uppercase">
                  <tr>
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Grad</th>
                    <th className="px-3 py-2">Pos</th>
                    <th className="px-3 py-2">B/T</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr
                      key={row.index}
                      className={`border-t border-border/70 ${row.errors.length ? "bg-seam-red-tint" : ""}`}
                    >
                      <td className="px-3 py-2 font-mono text-xs text-steel">{row.index}</td>
                      <td className="px-3 py-2 font-semibold text-graphite">{row.name || "—"}</td>
                      <td className="px-3 py-2">{row.gradYear ?? "—"}</td>
                      <td className="px-3 py-2">{row.primaryPosition ?? "—"}</td>
                      <td className="px-3 py-2">
                        {row.bats ?? "—"}/{row.throws ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {row.errors.length ? (
                          <span className="text-seam-red">{row.errors.join("; ")}</span>
                        ) : row.matchId ? (
                          <span className="text-steel">Already on roster</span>
                        ) : (
                          <span className="text-diamond-green">New athlete</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={row.action}
                          onChange={(event) =>
                            setPreview((prev) =>
                              (prev ?? []).map((r, idx) =>
                                idx === i
                                  ? { ...r, action: event.target.value as PreviewRow["action"] }
                                  : r,
                              ),
                            )
                          }
                          className={FIELD_CLASS}
                        >
                          <option value="create">Create new</option>
                          <option value="update" disabled={!row.matchId}>
                            Update existing
                          </option>
                          <option value="skip">Skip</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              disabled={importing || counts.create + counts.update === 0}
              onClick={() => void commit()}
              className="touch-target mt-5 inline-flex items-center rounded-xl bg-seam-red px-5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {importing ? "Importing…" : `Import ${counts.create + counts.update} athlete(s)`}
            </button>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
