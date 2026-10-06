import { useRef, useState } from "react";
import { Plus, Send, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { findHeader, parseCsv } from "@/lib/csv";

export type InviteRow = { firstName: string; lastName: string; email: string; role: string };

type Props = {
  roles: { value: string; label: string; hint?: string }[];
  busy: boolean;
  onSend: (rows: InviteRow[]) => Promise<boolean>;
};

const FIELD =
  "touch-target w-full rounded-lg border border-border bg-card px-3 text-sm text-graphite outline-none focus:border-org-primary";
const LABEL = "font-mono text-[11px] tracking-wide text-steel uppercase";

/** Matches a spreadsheet's role cell to one of the allowed roles. */
function matchRole(cell: string, roles: Props["roles"], fallback: string) {
  const v = cell.trim().toLowerCase();
  if (!v) return fallback;
  const hit = roles.find(
    (r) => r.value.toLowerCase() === v || r.label.toLowerCase() === v || r.label.toLowerCase().includes(v) || (v.includes("admin") && r.value === "org_admin") || ((v.includes("coach") || v.includes("staff")) && r.value === "org_staff"),
  );
  return hit?.value ?? fallback;
}

export function InviteRows({ roles, busy, onSend }: Props) {
  const defaultRole = roles[0]?.value ?? "parent";
  const blank = (): InviteRow => ({ firstName: "", lastName: "", email: "", role: defaultRole });
  const [mode, setMode] = useState<"rows" | "bulk">("rows");
  const [rows, setRows] = useState<InviteRow[]>([blank()]);
  const [bulk, setBulk] = useState<InviteRow[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const update = (i: number, key: keyof InviteRow, value: string) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));

  async function submitRows(event: React.FormEvent) {
    event.preventDefault();
    const filled = rows.filter((r) => r.email.trim());
    if (!filled.length) { toast.error("Add at least one email"); return; }
    if (await onSend(filled)) setRows([blank()]);
  }

  async function readFile(file: File) {
    const table = parseCsv(await file.text());
    const [headers, ...body] = table;
    if (!headers || !body.length) { toast.error("That file has no rows"); return; }
    const col = (hints: string[]) => headers.indexOf(findHeader(headers, hints));
    const first = col(["first name", "first", "given"]);
    const last = col(["last name", "last", "surname", "family"]);
    const full = col(["full name", "name"]);
    const email = col(["email", "e-mail"]);
    const role = col(["role", "type", "title"]);
    if (email === -1) { toast.error("Couldn't find an Email column"); return; }
    const parsed = body
      .map((cells) => {
        let f = first >= 0 ? cells[first] ?? "" : "";
        let l = last >= 0 ? cells[last] ?? "" : "";
        if (!f && !l && full >= 0) {
          const parts = (cells[full] ?? "").trim().split(/\s+/);
          f = parts.shift() ?? "";
          l = parts.join(" ");
        }
        return {
          firstName: f.trim(),
          lastName: l.trim(),
          email: (cells[email] ?? "").trim(),
          role: matchRole(role >= 0 ? cells[role] ?? "" : "", roles, defaultRole),
        };
      })
      .filter((r) => r.email);
    setBulk(parsed);
  }

  return (
    <div className="mt-4">
      <div className="inline-flex rounded-lg border border-border p-0.5 text-xs font-semibold">
        {(["rows", "bulk"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-md px-3 py-1.5 ${mode === m ? "bg-org-primary text-org-primary-foreground" : "text-steel"}`}
          >
            {m === "rows" ? "Add people" : "Bulk add"}
          </button>
        ))}
      </div>

      {mode === "rows" ? (
        <form onSubmit={submitRows} className="mt-4 space-y-3">
          {rows.map((row, i) => (
            <div key={i} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_1fr_1.4fr_auto_auto]">
              <label className="text-sm">
                {i === 0 ? <span className={LABEL}>First name</span> : null}
                <input value={row.firstName} onChange={(e) => update(i, "firstName", e.target.value)} placeholder="Jordan" autoComplete="off" className={`mt-1 ${FIELD}`} />
              </label>
              <label className="text-sm">
                {i === 0 ? <span className={LABEL}>Last name</span> : null}
                <input value={row.lastName} onChange={(e) => update(i, "lastName", e.target.value)} placeholder="Smith" autoComplete="off" className={`mt-1 ${FIELD}`} />
              </label>
              <label className="col-span-2 text-sm sm:col-span-1">
                {i === 0 ? <span className={LABEL}>Email</span> : null}
                <input type="email" required={i === 0} value={row.email} onChange={(e) => update(i, "email", e.target.value)} placeholder="jordan@example.com" className={`mt-1 ${FIELD}`} />
              </label>
              <label className="text-sm">
                {i === 0 ? <span className={LABEL}>Role</span> : null}
                <select value={row.role} onChange={(e) => update(i, "role", e.target.value)} className={`mt-1 font-semibold ${FIELD}`}>
                  {roles.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                aria-label="Remove row"
                disabled={rows.length === 1}
                onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                className="touch-target inline-flex items-center justify-center rounded-lg text-steel hover:text-seam-red disabled:invisible"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setRows((prev) => [...prev, { ...blank(), role: prev[prev.length - 1]?.role ?? defaultRole }])} className="touch-target inline-flex items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold text-graphite hover:border-org-primary">
              <Plus className="size-4" aria-hidden /> Add another
            </button>
            <button type="submit" disabled={busy} className="touch-target ml-auto inline-flex items-center gap-2 rounded bg-seam-red px-4 text-sm font-semibold text-white disabled:opacity-60">
              <Send className="size-4" aria-hidden />
              {busy ? "Sending…" : rows.filter((r) => r.email.trim()).length > 1 ? `Send ${rows.filter((r) => r.email.trim()).length} invites` : "Send invite"}
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-4">
          <p className="text-sm text-steel">
            Upload a spreadsheet saved as CSV with columns: First name, Last name, Email, Role.
          </p>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); e.target.value = ""; }} />
          <button type="button" onClick={() => fileRef.current?.click()} className="touch-target mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold text-graphite hover:border-org-primary">
            <Upload className="size-4" aria-hidden /> Choose file
          </button>
          {bulk.length ? (
            <>
              <ul className="mt-4 max-h-72 divide-y divide-border/70 overflow-y-auto rounded-lg border border-border">
                {bulk.map((r, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                    <span className="font-semibold text-graphite">{`${r.firstName} ${r.lastName}`.trim() || "—"}</span>
                    <span className="font-mono text-xs text-steel">{r.email}</span>
                    <select value={r.role} onChange={(e) => setBulk((prev) => prev.map((x, idx) => (idx === i ? { ...x, role: e.target.value } : x)))} className="ml-auto rounded-md border border-border bg-card px-2 py-1 text-xs font-semibold text-graphite">
                      {roles.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <button type="button" aria-label="Remove" onClick={() => setBulk((prev) => prev.filter((_, idx) => idx !== i))} className="text-steel hover:text-seam-red"><X className="size-4" /></button>
                  </li>
                ))}
              </ul>
              <button type="button" disabled={busy} onClick={async () => { if (await onSend(bulk)) setBulk([]); }} className="touch-target mt-3 inline-flex items-center gap-2 rounded bg-seam-red px-4 text-sm font-semibold text-white disabled:opacity-60">
                <Send className="size-4" aria-hidden /> {busy ? "Sending…" : `Send ${bulk.length} invites`}
              </button>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
