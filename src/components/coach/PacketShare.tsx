import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, ExternalLink, FileText } from "lucide-react";
import { toast } from "sonner";

import { getTeamPacketState, setTeamPacket } from "@/lib/team-packet.functions";

/** One-tap public roster sheet for college recruiters, per team. */
export function PacketShare({ teamId }: { teamId: string }) {
  const stateFn = useServerFn(getTeamPacketState);
  const setFn = useServerFn(setTeamPacket);
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["team-packet", teamId],
    queryFn: () => stateFn({ data: { teamId } }),
    retry: false,
  });
  if (!data) return null;
  const url =
    data.packet_enabled && data.packet_token && typeof window !== "undefined"
      ? `${window.location.origin}/team/${data.packet_token}`
      : null;

  async function update(enabled: boolean, newLink = false) {
    try {
      await setFn({ data: { teamId, enabled, newLink } });
      await queryClient.invalidateQueries({ queryKey: ["team-packet", teamId] });
      toast.success(enabled ? "Roster sheet is live" : "Roster sheet turned off");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <section className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
      <FileText className="size-5 text-org-primary" aria-hidden />
      <div className="min-w-48 flex-1">
        <h2 className="font-display text-base font-bold text-graphite">Packet</h2>
        <p className="text-xs text-steel">
          {url
            ? `${data.name} roster sheet is live for college coaches.`
            : `Share a printable ${data.name} roster sheet with college coaches.`}
        </p>
      </div>
      {url ? (
        <>
          <button
            type="button"
            onClick={async () => {
              if (navigator.share) {
                await navigator.share({ title: `${data.name} roster`, url }).catch(() => {});
              } else {
                await navigator.clipboard.writeText(url);
                toast.success("Link copied");
              }
            }}
            className="touch-target inline-flex items-center gap-2 rounded-xl bg-seam-red px-4 text-sm font-semibold text-white"
          >
            <Copy className="size-4" aria-hidden /> Share
          </button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="touch-target inline-flex items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-graphite"
          >
            <ExternalLink className="size-4" aria-hidden /> Open
          </a>
          <button
            type="button"
            onClick={() => void update(false)}
            className="touch-target px-2 text-xs font-semibold text-steel underline"
          >
            Turn off
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => void update(true, Boolean(data.packet_token))}
          className="touch-target inline-flex items-center gap-2 rounded-xl bg-org-primary px-4 text-sm font-semibold text-org-primary-foreground"
        >
          Create link
        </button>
      )}
    </section>
  );
}
