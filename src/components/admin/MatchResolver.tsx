import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  linkSharedRecord,
  listFederalCandidates,
  markNotInFederal,
  mergeDuplicateSchool,
  previewSchoolMerge,
  resolveFederalMatch,
} from "@/lib/pipeline.functions";

/**
 * Database and network errors are unreadable for a human, so only sentences we
 * wrote ourselves are shown; anything else becomes the plain-English fallback.
 */
function friendly(failure: unknown, fallback: string): string {
  const message = failure instanceof Error ? failure.message.trim() : "";
  const jargon =
    /constraint|relation |column |violates|duplicate key|PGRST|syntax error|permission denied|JWT|null value|invalid input|\bSQL\b|Forbidden/i;
  if (!message || message.length > 160 || jargon.test(message)) return fallback;
  return message;
}

export type MatchSchool = {
  id: string;
  name: string;
  state: string | null;
  city: string | null;
  federal_match_status: string;
};

export type MatchSuggestion = {
  unitid: number;
  name: string;
  city: string | null;
  state: string | null;
  mainCampus?: boolean | null;
  enrollment?: number | null;
  score?: number;
  confident?: boolean;
};

function place(city: string | null, state: string | null) {
  return [city, state].filter(Boolean).join(", ");
}

function closeness(score?: number) {
  if (typeof score !== "number") return null;
  if (score >= 0.9) return "Very close name match";
  if (score >= 0.75) return "Close name match";
  return "Similar name — check carefully";
}

/**
 * One school waiting on a federal-record decision. When suggestions are handed
 * in they show immediately, so the common case is a single click.
 */
export function MatchResolver({
  school,
  suggestions,
  hasFacts,
  onResolved,
}: {
  school: MatchSchool;
  suggestions?: MatchSuggestion[];
  hasFacts?: boolean;
  onResolved: (message: string) => Promise<void>;
}) {
  const candidatesFn = useServerFn(listFederalCandidates);
  const resolveFn = useServerFn(resolveFederalMatch);
  const notInFederalFn = useServerFn(markNotInFederal);
  const previewMergeFn = useServerFn(previewSchoolMerge);
  const mergeFn = useServerFn(mergeDuplicateSchool);
  const linkSharedFn = useServerFn(linkSharedRecord);

  const preloaded = suggestions ?? [];
  const best = preloaded[0] ?? null;
  const others = preloaded.slice(1);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<MatchSuggestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [settled, setSettled] = useState<string | null>(null);
  // Set when the record a person picked already belongs to another school.
  const [conflict, setConflict] = useState<
    | {
        unitid: number;
        recordName: string;
        ownerId: string;
        ownerName: string;
        moves: { programs: number; rosterPlayers: number; shortlists: number; notes: number } | null;
      }
    | null
  >(null);

  async function load(searchTerm: string) {
    setBusy(true);
    try {
      const rows = (await candidatesFn({
        data: { universityId: school.id, query: searchTerm },
      })) as MatchSuggestion[];
      setCandidates(rows);
    } catch (failure) {
      toast.error(friendly(failure, "Could not load suggestions"));
    } finally {
      setBusy(false);
    }
  }

  async function pick(unitid: number, name: string) {
    setBusy(true);
    try {
      const outcome = (await resolveFn({ data: { universityId: school.id, unitid } })) as any;
      if (outcome?.conflict) {
        let moves = null;
        try {
          moves = (await previewMergeFn({
            data: { duplicateId: school.id, keeperId: outcome.conflict.ownerId },
          })) as any;
        } catch {
          moves = null;
        }
        setConflict({
          unitid,
          recordName: name,
          ownerId: String(outcome.conflict.ownerId),
          ownerName: String(outcome.conflict.ownerName),
          moves,
        });
        setOpen(false);
        return;
      }
      toast.success(`${school.name} matched to ${name}`);
      setSettled(`Matched to ${name}`);
      await onResolved(
        `${school.name} → ${name}: ${outcome.fieldsApplied} field(s) filled, ${outcome.fieldsQueued} queued`,
      );
      setOpen(false);
    } catch (failure) {
      toast.error(friendly(failure, "Could not save the match"));
    } finally {
      setBusy(false);
    }
  }

  /** Same school held twice: fold this entry into the one with the record. */
  async function onCombine() {
    if (!conflict) return;
    setBusy(true);
    try {
      await mergeFn({ data: { duplicateId: school.id, keeperId: conflict.ownerId } });
      toast.success(`Combined into ${conflict.ownerName}`);
      setSettled(`Combined into ${conflict.ownerName}`);
      setConflict(null);
      await onResolved(`${school.name} combined into ${conflict.ownerName}`);
    } catch (failure) {
      toast.error(friendly(failure, "Couldn't combine these two schools"));
    } finally {
      setBusy(false);
    }
  }

  /** A different campus of the same institution: copy the facts across. */
  async function onShareRecord() {
    if (!conflict) return;
    setBusy(true);
    try {
      const outcome = (await linkSharedFn({
        data: { universityId: school.id, unitid: conflict.unitid },
      })) as any;
      toast.success(`${school.name} now shares ${conflict.ownerName}'s details`);
      setSettled(`Shares a national record with ${conflict.ownerName}`);
      setConflict(null);
      await onResolved(
        `${school.name} shares ${conflict.ownerName}'s national record: ${outcome?.fieldsApplied ?? 0} field(s) filled`,
      );
    } catch (failure) {
      toast.error(friendly(failure, "Couldn't copy those details across"));
    } finally {
      setBusy(false);
    }
  }

  async function markMissing() {
    setBusy(true);
    try {
      await notInFederalFn({ data: { universityId: school.id } });
      toast.success(`${school.name} parked — you can undo this from the parked list`);
      setSettled("Parked — not in the national data");
      await onResolved(`${school.name}: parked as not in the federal data`);
    } catch (failure) {
      toast.error(friendly(failure, "Couldn't park this school — please try again"));
    } finally {
      setBusy(false);
    }
  }

  if (settled) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <p className="text-sm font-semibold text-graphite">{school.name}</p>
        <p className="meta">{settled}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <p className="text-sm font-semibold text-graphite">{school.name}</p>
          <p className="meta">
            {place(school.city, school.state) || "Location unknown"} ·{" "}
            {school.federal_match_status === "unmatched"
              ? "nothing found automatically"
              : "several possible records"}
          </p>
          <p className="meta mt-1">
            {hasFacts ? "Already has some cost and academic details" : "No cost or academic details yet"}
          </p>
        </div>

        {best ? (
          <div className="rounded-md bg-muted/40 p-3">
            <p className="text-sm font-semibold text-graphite">{best.name}</p>
            <p className="meta">
              {place(best.city, best.state) || "Location unknown"}
              {best.enrollment ? ` · ${best.enrollment.toLocaleString()} undergrads` : ""}
              {best.mainCampus ? " · main campus" : ""}
            </p>
            <p className="meta mt-1">{best.confident ? "Strong match" : closeness(best.score) ?? "Possible match"}</p>
            <button
              type="button"
              onClick={() => void pick(best.unitid, best.name)}
              disabled={busy}
              className="touch-target mt-2 rounded-md bg-diamond-green px-3 text-xs font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Saving…" : "Yes, that's it"}
            </button>
          </div>
        ) : (
          <div className="rounded-md bg-muted/30 p-3">
            <p className="meta">No likely record in the national list. Search by name or park it.</p>
          </div>
        )}
      </div>

      {conflict ? (
        <div className="mt-3 rounded-md border border-seam-red/30 bg-seam-red/5 p-3">
          <p className="text-sm font-semibold text-graphite">
            {conflict.ownerName} already uses the “{conflict.recordName}” national record.
          </p>
          <p className="meta mt-1">
            Either this school is in our list twice, or it's a separate campus of the same institution — the
            national list keeps one record per institution.
          </p>
          {conflict.moves ? (
            <p className="meta mt-1">
              Combining would move {conflict.moves.programs} team(s), {conflict.moves.rosterPlayers} roster
              player(s), {conflict.moves.shortlists} shortlist entry(ies) and {conflict.moves.notes} note(s).
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onCombine()}
              disabled={busy}
              className="touch-target rounded-md bg-seam-red px-3 text-xs font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Working…" : "Same school — combine them"}
            </button>
            <button
              type="button"
              onClick={() => void onShareRecord()}
              disabled={busy}
              className="touch-target rounded-md border border-border px-3 text-xs font-semibold text-steel disabled:opacity-60"
            >
              Different campus — copy the details
            </button>
            <button
              type="button"
              onClick={() => setConflict(null)}
              disabled={busy}
              className="touch-target rounded-md px-3 text-xs font-semibold text-steel disabled:opacity-60"
            >
              Pick a different record
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen((value) => !value);
            if (!candidates && !others.length) void load("");
          }}
          className="touch-target rounded-lg border border-border px-3 text-sm font-semibold text-steel"
        >
          {open ? "Close" : others.length ? "Show other options" : "Search by name"}
        </button>
        <button
          type="button"
          onClick={() => void markMissing()}
          disabled={busy}
          className="touch-target rounded-lg border border-border px-3 text-sm font-semibold text-steel disabled:opacity-60"
        >
          Not in the federal data
        </button>
      </div>

      {open ? (
        <div className="mt-3 grid gap-2">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search national records by name"
              className="h-10 flex-1 rounded-md border border-input bg-background px-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void load(query)}
              disabled={busy}
              className="touch-target rounded-lg border border-border px-3 text-sm font-semibold text-steel disabled:opacity-60"
            >
              Search
            </button>
          </div>
          {busy ? <p className="meta">Looking…</p> : null}
          <ul className="grid gap-1.5">
            {(candidates ?? others).map((candidate) => (
              <li
                key={candidate.unitid}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2"
              >
                <span className="text-sm text-graphite">
                  {candidate.name}
                  <span className="meta ml-2">
                    {place(candidate.city, candidate.state)}
                    {candidate.enrollment ? ` · ${candidate.enrollment.toLocaleString()} undergrads` : ""}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void pick(candidate.unitid, candidate.name)}
                  disabled={busy}
                  className="touch-target rounded-md bg-diamond-green px-3 text-xs font-semibold text-white disabled:opacity-60"
                >
                  This one
                </button>
              </li>
            ))}
          </ul>
          {candidates && !candidates.length ? (
            <p className="meta">No records matched. Try a shorter name.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
