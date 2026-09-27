import { useEffect, useState } from "react";
import { ArrowDown, Plus, Share, X } from "lucide-react";
import { useOrgBranding } from "@/hooks/use-org-branding";

import { Button } from "@/components/ui/button";

const KEY = "curve.install.snoozedUntil";
const FIRST_DELAY_MS = 4000;
const SNOOZE_DAYS = [3, 7, 14, 30];
const COUNT_KEY = "curve.install.dismissals";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** Home-screen nudge shown after sign-in; each "Later" waits longer before asking again. */
export function InstallPrompt() {
  const [open, setOpen] = useState(false);
  const [ios, setIos] = useState(false);
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [guide, setGuide] = useState(false);
  const { branding } = useOrgBranding();
  const b = branding as { logoUrl?: string | null; name?: string | null } | null | undefined;
  const logo = b?.logoUrl || "/favicon.png";

  useEffect(() => {
    if (window.self !== window.top || isStandalone()) return;
    const snoozed = Number(localStorage.getItem(KEY) ?? 0);
    if (Date.now() < snoozed) return;
    const ua = navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua);
    const mobile = isIos || /android/i.test(ua);
    setIos(isIos);
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    const t = mobile ? window.setTimeout(() => setOpen(true), FIRST_DELAY_MS) : undefined;
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      if (t) window.clearTimeout(t);
    };
  }, []);

  const later = () => {
    const n = Number(localStorage.getItem(COUNT_KEY) ?? 0);
    const days = SNOOZE_DAYS[Math.min(n, SNOOZE_DAYS.length - 1)] ?? 30;
    localStorage.setItem(COUNT_KEY, String(n + 1));
    localStorage.setItem(KEY, String(Date.now() + days * 86_400_000));
    setOpen(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") localStorage.setItem(KEY, String(Date.now() + 3650 * 86_400_000));
    else later();
    setOpen(false);
  };

  const openShare = async () => {
    setGuide(true);
    try {
      if (navigator.share) await navigator.share({ title: document.title, url: window.location.origin });
    } catch {
      /* user closed the sheet */
    }
  };

  if (!open || (!ios && !deferred)) return null;

  return (
    <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-50 mx-auto max-w-md">
      <div className="card-panel relative overflow-hidden rounded-2xl p-4 shadow-2xl">
        <span
          className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
          style={{ background: "linear-gradient(90deg, var(--org-primary), transparent 70%)" }}
          aria-hidden
        />
        <button onClick={later} aria-label="Dismiss" className="absolute top-3 right-3 text-steel">
          <X className="size-4" />
        </button>
        <div className="flex items-center gap-3 pr-6">
          <img src={logo} alt="" width={44} height={44} className="size-11 rounded-xl bg-card object-contain" onError={(e) => { e.currentTarget.src = "/favicon.png"; }} />
          <div>
            <p className="label-caps text-org-primary-strong">Home screen</p>
            <p className="font-display text-base font-bold text-graphite">Add {b?.name || "Curve Recruit"}</p>
          </div>
        </div>
        {ios ? (
          <ol className="mt-3 space-y-2 text-sm text-steel">
            <li className="flex items-center gap-2">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-org-primary font-mono text-[11px] font-bold text-org-primary-foreground">1</span>
              Tap <Share className="size-4 text-graphite" aria-label="Share" /> <span className="font-semibold text-graphite">Share</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-org-primary font-mono text-[11px] font-bold text-org-primary-foreground">2</span>
              Tap <Plus className="size-4 rounded-sm border border-graphite text-graphite" aria-hidden />
              <span className="font-semibold text-graphite">Add to Home Screen</span>
            </li>
          </ol>
        ) : null}
        <div className="mt-3 flex gap-2">
          <Button onClick={ios ? openShare : install} className="flex-1 bg-org-primary text-org-primary-foreground">
            {ios ? "Open Share menu" : "Add to Home Screen"}
          </Button>
          <Button variant="ghost" onClick={later}>
            Later
          </Button>
        </div>
      </div>
      {ios && guide ? (
        <div className="mt-2 flex flex-col items-center text-org-primary-strong" aria-hidden>
          <span className="font-mono text-[10px] tracking-wide uppercase">Or use Share below</span>
          <ArrowDown className="size-6 animate-bounce" />
        </div>
      ) : null}
    </div>
  );
}
