import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Flag, MessageSquare, Plus, Search, Send } from "lucide-react";
import { NewConversation } from "@/components/messages/NewConversation";
import { toast } from "sonner";

import { AppShell } from "@/components/brand/AppShell";
import { AuthButton } from "@/components/brand/AuthButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useMyAccount } from "@/hooks/use-my-account";
import {
  getThread,
  listMyThreads,
  markThreadRead,
  reportThread,
  sendMessage,
} from "@/lib/messaging.functions";
import { isAdminLevel, isOrgManagerRole, roleLabel } from "@/lib/roles";
import { cn } from "@/lib/utils";

type Search = { thread?: string | undefined };

export const Route = createFileRoute("/_authenticated/messages")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    thread: typeof s["thread"] === "string" ? (s["thread"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Messages — Curve Recruit" },
      { name: "description", content: "Conversations between families and club staff about college targets." },
      { property: "og:title", content: "Messages — Curve Recruit" },
      { property: "og:description", content: "Family and staff conversations, one per school." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MessagesPage,
});

function timeAgo(iso: string) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function MessagesPage() {
  const { thread: activeId } = Route.useSearch();
  const navigate = useNavigate({ from: "/messages" });
  const { account } = useMyAccount();
  const role = (account as any)?.primaryRole as string | undefined;
  const isManager = role === "superadmin" || isOrgManagerRole(role);
  const oversight = role === "superadmin" || isAdminLevel(role);

  const listFn = useServerFn(listMyThreads);
  const { data, isPending } = useQuery({
    queryKey: ["my-threads"],
    queryFn: () => listFn(),
    refetchInterval: 15_000,
  });
  const [q, setQ] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "unread" | "mine">("all");

  const threads = useMemo(() => {
    const all = data?.threads ?? [];
    const needle = q.trim().toLowerCase();
    return all.filter((t) => {
      if (filter === "unread" && !t.unread) return false;
      if (filter === "mine" && !t.participating) return false;
      if (!needle) return true;
      return t.athlete.toLowerCase().includes(needle) || t.school.toLowerCase().includes(needle);
    });
  }, [data, q, filter]);

  const open = (id?: string) => navigate({ search: id ? { thread: id } : {} });

  return (
    <AppShell right={<AuthButton />}>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.2em] text-steel uppercase">Inbox</p>
          <h1 className="font-display text-3xl font-bold text-org-primary">Messages</h1>
        </div>
        <div className="flex items-center gap-3">
          {oversight ? (
            <span className="hidden font-mono text-[10px] tracking-wide text-steel uppercase sm:inline">Org-wide view</span>
          ) : null}
          <Button size="sm" onClick={() => setComposeOpen(true)}>
            <Plus className="size-4" /> New
          </Button>
        </div>
        <NewConversation open={composeOpen} onOpenChange={setComposeOpen} onStarted={(id) => { qc.invalidateQueries({ queryKey: ["my-threads"] }); open(id); }} />
      </div>

      <div className="grid overflow-hidden rounded-xl border border-border bg-card shadow-sm md:h-[calc(100vh-15rem)] md:min-h-[520px] md:grid-cols-[340px_minmax(0,1fr)]">
        {/* Thread list */}
        <aside className={cn("flex min-h-0 flex-col border-border md:border-r", activeId && "hidden md:flex")}>
          <div className="space-y-2 border-b border-border p-3">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-steel" aria-hidden />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Player or school"
                className="pl-9"
                aria-label="Search conversations"
              />
            </div>
            <div className="flex gap-1">
              {(
                [
                  ["all", "All"],
                  ["unread", "Unread"],
                  ...(isManager ? [["mine", "Mine"]] : []),
                ] as [typeof filter, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={cn(
                    "rounded-md px-3 py-1.5 font-mono text-[11px] tracking-wide uppercase",
                    filter === key ? "bg-org-primary text-org-primary-foreground" : "text-steel hover:bg-muted",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isPending ? (
              <div className="space-y-2 p-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-md bg-muted" />
                ))}
              </div>
            ) : threads.length === 0 ? (
              <div className="p-8 text-center">
                <MessageSquare className="mx-auto size-6 text-steel" aria-hidden />
                <p className="mt-3 font-display text-lg font-bold text-org-primary">No conversations</p>
                <Button size="sm" className="mt-4" onClick={() => setComposeOpen(true)}>
                  <Plus className="size-4" /> New message
                </Button>
              </div>
            ) : (
              <ul>
                {threads.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => open(t.id)}
                      className={cn(
                        "relative flex w-full gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted/50",
                        activeId === t.id && "bg-muted",
                      )}
                    >
                      {activeId === t.id ? (
                        <span className="absolute inset-y-0 left-0 w-1 bg-org-accent" aria-hidden />
                      ) : null}
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-org-accent-tint font-display text-sm font-bold text-org-accent-strong">
                        {t.athlete
                          .split(" ")
                          .map((w) => w[0])
                          .slice(0, 2)
                          .join("")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={cn("truncate text-sm", t.unread ? "font-bold" : "font-semibold")}>
                            {t.athlete}
                          </span>
                          <span className="shrink-0 font-mono text-[10px] text-steel">{timeAgo(t.lastAt)}</span>
                        </span>
                        <span className="block truncate font-mono text-[10px] tracking-wide text-org-primary uppercase">
                          {t.school}
                        </span>
                        <span className="flex items-center justify-between gap-2">
                          <span className={cn("truncate text-xs", t.unread ? "text-foreground" : "text-steel")}>
                            {t.preview ? `${t.lastAuthor}: ${t.preview}` : "No messages yet"}
                          </span>
                          {t.unread ? (
                            <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-destructive px-1.5 font-mono text-[10px] font-bold text-destructive-foreground">
                              {t.unread}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Conversation */}
        <section className={cn("flex min-h-0 flex-col", !activeId && "hidden md:flex")}>
          {activeId ? (
            <Conversation key={activeId} threadId={activeId} onBack={() => open()} canReport />
          ) : (
            <div className="grid flex-1 place-items-center p-10 text-center">
              <div>
                <MessageSquare className="mx-auto size-8 text-steel" aria-hidden />
                <p className="mt-3 font-display text-xl font-bold text-org-primary">Pick a conversation</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function Conversation({ threadId, onBack, canReport }: { threadId: string; onBack: () => void; canReport: boolean }) {
  const qc = useQueryClient();
  const threadFn = useServerFn(getThread);
  const sendFn = useServerFn(sendMessage);
  const readFn = useServerFn(markThreadRead);
  const reportFn = useServerFn(reportThread);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const { data, isPending, error } = useQuery({
    queryKey: ["thread", threadId],
    queryFn: () => threadFn({ data: { threadId } }),
    refetchInterval: 8_000,
    retry: false,
  });

  const summary = qc
    .getQueryData<{ threads: { id: string; athlete: string; school: string }[] }>(["my-threads"])
    ?.threads.find((t) => t.id === threadId);

  const count = data?.messages.length ?? 0;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
    if (count) {
      readFn({ data: { threadId } }).then(() => qc.invalidateQueries({ queryKey: ["my-threads"] }));
    }
  }, [count, threadId]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useMutation({
    mutationFn: () => sendFn({ data: { threadId, body: draft } }),
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["thread", threadId] });
      qc.invalidateQueries({ queryKey: ["my-threads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const report = useMutation({
    mutationFn: (messageId: string | null) => reportFn({ data: { threadId, messageId, reason: "Reported from inbox" } }),
    onSuccess: () => toast.success("Reported"),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversations"
          className="touch-target grid place-items-center rounded-md text-steel hover:bg-muted md:hidden"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg leading-tight font-bold text-org-primary">
            {summary?.athlete ?? "Conversation"}
          </p>
          <p className="truncate font-mono text-[10px] tracking-wide text-steel uppercase">
            {summary?.school ?? ""}
            {data ? ` · ${data.participants.length} people` : ""}
          </p>
        </div>
      </header>

      {data ? (
        <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-2">
          {data.participants.map((p) => (
            <span key={p.id} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-steel">
              {p.name} · {roleLabel(p.role)}
            </span>
          ))}
        </div>
      ) : null}

      <div className="min-h-[50vh] flex-1 space-y-3 overflow-y-auto bg-muted/20 px-4 py-4 md:min-h-0">
        {isPending ? (
          <div className="h-24 animate-pulse rounded-md bg-muted" />
        ) : error ? (
          <p className="text-sm text-steel">{(error as Error).message}</p>
        ) : data!.messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-steel">No messages yet</p>
        ) : (
          data!.messages.map((m) => (
            <div key={m.id} className={cn("group flex flex-col", m.mine ? "items-end" : "items-start")}>
              <span className="mb-1 font-mono text-[10px] tracking-wide text-steel uppercase">
                {m.mine ? "You" : m.authorName} · {timeAgo(m.createdAt)}
              </span>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed whitespace-pre-wrap shadow-sm",
                  m.mine
                    ? "rounded-br-sm bg-org-primary text-org-primary-foreground"
                    : "rounded-bl-sm border border-border bg-card",
                )}
              >
                {m.body}
              </div>
              {!m.mine && canReport ? (
                <button
                  type="button"
                  onClick={() => report.mutate(m.id)}
                  className="mt-1 hidden items-center gap-1 text-[11px] text-steel hover:text-destructive group-hover:flex"
                >
                  <Flag className="size-3" /> Report
                </button>
              ) : null}
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      <form
        className="flex items-end gap-2 border-t border-border bg-card p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) send.mutate();
        }}
      >
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (draft.trim()) send.mutate();
            }
          }}
          rows={1}
          placeholder="Message"
          className="max-h-40 min-h-11 resize-none text-[15px]"
        />
        <Button type="submit" size="icon" className="size-11 shrink-0" disabled={!draft.trim() || send.isPending} aria-label="Send">
          <Send className="size-4" />
        </Button>
      </form>
    </>
  );
}
