import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ExternalLink, FileText, GraduationCap, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/brand/AppShell";
import { AuthButton } from "@/components/brand/AuthButton";
import { AthleteProfilePanel } from "@/components/athlete/AthleteProfilePanel";
import { supabase } from "@/integrations/supabase/client";
import {
  getAthleteHub,
  getTranscript,
  setEligibilityId,
  setTranscript,
} from "@/lib/athlete-hub.functions";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile — Curve Recruit" },
      { name: "description", content: "Your player details, NCAA Eligibility Center ID and transcript." },
      { property: "og:title", content: "Profile — Curve Recruit" },
      { property: "og:description", content: "Player details, eligibility ID and transcript for a recruit." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const hubFn = useServerFn(getAthleteHub);
  const { data, isPending, error } = useQuery({
    queryKey: ["athlete-hub"],
    queryFn: () => hubFn({ data: {} }),
    staleTime: 30_000,
  });
  const athlete = (data as any)?.athlete as Record<string, any> | null | undefined;

  return (
    <AppShell right={<AuthButton />}>
      <div className="space-y-5 sm:space-y-6">
        <div>
          <Link to="/athlete" className="meta inline-flex items-center gap-1 text-steel hover:text-graphite">
            <ArrowLeft className="size-3.5" /> Hub
          </Link>
          <p className="meta mt-2 text-org-accent">Player</p>
          <h1 className="font-display mt-1 text-3xl font-bold tracking-tight text-graphite">Profile</h1>
        </div>
        {error ? (
          <p className="rounded-xl border border-seam-red/30 bg-seam-red-tint p-4 text-sm text-seam-red">
            {(error as Error).message}
          </p>
        ) : isPending ? (
          <div className="h-64 animate-pulse rounded-2xl bg-card" />
        ) : !athlete ? (
          <p className="text-sm text-steel">No player card linked.</p>
        ) : (
          <>
            <div className="grid gap-5 md:grid-cols-2 sm:gap-6">
              <EligibilityCard athleteId={String(athlete['id'])} current={athlete['eligibility_id'] ?? ""} />
              <TranscriptCard athleteId={String(athlete['id'])} />
            </div>
            <AthleteProfilePanel athleteId={String(athlete['id'])} />
          </>
        )}
      </div>
    </AppShell>
  );
}

function Card({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="card-panel relative overflow-hidden rounded-2xl p-5 sm:p-6">
      <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-org-primary via-org-primary/70 to-transparent" />
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-white/10 pb-3">
        <h2 className="font-display flex items-center gap-2 text-lg font-bold uppercase tracking-wide text-graphite">
          <span aria-hidden className="h-4 w-1 rounded-full bg-org-primary" />
          {title}
        </h2>
        <span className="font-mono text-[11px] uppercase tracking-wider text-steel">{eyebrow}</span>
      </div>
      {children}
    </section>
  );
}

function EligibilityCard({ athleteId, current }: { athleteId: string; current: string }) {
  const qc = useQueryClient();
  const saveFn = useServerFn(setEligibilityId);
  const [value, setValue] = useState(current);
  const save = useMutation({
    mutationFn: () => saveFn({ data: { athleteId, eligibilityId: value.trim() } }),
    onSuccess: () => {
      toast.success("Eligibility ID saved");
      qc.invalidateQueries({ queryKey: ["athlete-hub"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card eyebrow={current ? "On file" : "Missing"} title="Eligibility">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="flex gap-2"
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="NCAA or NAIA ID"
          className="tabular h-11 min-w-0 flex-1 rounded-lg border border-white/10 bg-transparent px-3 text-sm text-graphite placeholder:text-steel focus:border-org-primary focus:outline-none"
        />
        <button
          disabled={save.isPending || value.trim() === current}
          className="h-11 shrink-0 rounded-lg bg-org-primary px-4 text-sm font-semibold text-org-primary-foreground disabled:opacity-50"
        >
          {save.isPending ? "Saving…" : "Save"}
        </button>
      </form>
      <p className="mt-3 flex items-start gap-2 text-xs text-steel">
        <GraduationCap className="mt-0.5 size-3.5 shrink-0" />
        <span>
          <a
            href="https://web3.ncaa.org/ecwr3/"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-org-primary hover:underline"
          >
            Register at the NCAA Eligibility Center
          </a>
        </span>
      </p>
    </Card>
  );
}

function TranscriptCard({ athleteId }: { athleteId: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getTranscript);
  const setFn = useServerFn(setTranscript);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({
    queryKey: ["transcript", athleteId],
    queryFn: () => getFn({ data: { athleteId } }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["transcript", athleteId] });
    qc.invalidateQueries({ queryKey: ["athlete-hub"] });
  };

  const upload = async (file: File) => {
    if (!/pdf|image\//.test(file.type)) {
      toast.error("Upload a PDF or a photo of your transcript");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Transcripts need to be under 10 MB");
      return;
    }
    setBusy(true);
    try {
      const ext = (file.name.split(".").pop() || "pdf").toLowerCase();
      const path = `${athleteId}/transcripts/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("athlete-docs")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      await setFn({ data: { athleteId, path } });
      toast.success("Transcript uploaded");
      refresh();
    } catch (e) {
      toast.error((e as Error).message || "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async () => {
    if (!confirm("Remove your transcript?")) return;
    try {
      await setFn({ data: { athleteId, path: null } });
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Card eyebrow={data?.path ? "On file · Private" : "Private"} title="Transcript">
      {data?.path ? (
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <FileText className="size-5 shrink-0 text-org-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-graphite">Transcript</p>
            {data.uploadedAt ? (
              <p className="meta text-steel">Uploaded {new Date(data.uploadedAt).toLocaleDateString()}</p>
            ) : null}
          </div>
          {data.url ? (
            <a
              href={data.url}
              target="_blank"
              rel="noreferrer"
              className="touch-target grid place-items-center px-2 text-steel hover:text-graphite"
              aria-label="Open transcript"
            >
              <ExternalLink className="size-4" />
            </a>
          ) : null}
          <button onClick={remove} className="touch-target grid place-items-center px-2 text-steel hover:text-seam-red" aria-label="Remove transcript">
            <Trash2 className="size-4" />
          </button>
        </div>
      ) : (
        <p className="font-mono text-[11px] uppercase tracking-wider text-steel">PDF or photo · 10 MB max</p>
      )}
      <button
        onClick={() => input.current?.click()}
        disabled={busy}
        className="touch-target mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-org-primary/40 text-sm font-semibold text-org-primary hover:bg-org-primary/10 disabled:opacity-60"
      >
        <Upload className="size-4" />
        {busy ? "Uploading…" : data?.path ? "Replace transcript" : "Upload transcript"}
      </button>
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
        }}
      />
    </Card>
  );
}
