import { useEffect, useRef, useState } from "react";
import { Maximize, Pause, Play, Volume2, VolumeX } from "lucide-react";

import { cn } from "@/lib/utils";

export type TheaterClip = {
  id: string;
  url: string | null;
  title?: string | null;
  category?: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  game: "Game",
  bp: "BP",
  bullpen: "Bullpen",
  fielding: "Fielding",
  catching: "Catching",
  other: "Other",
};
const catLabel = (k?: string | null) => (k && CATEGORY_LABELS[k]) || "Clip";

function fmt(s: number) {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/** Full highlight player: custom controls plus a thumbnail grid to switch clips. */
export function ClipTheater({
  clips,
  active: activeProp,
  onActiveChange,
  actions,
}: {
  clips: TheaterClip[];
  active?: number;
  onActiveChange?: (i: number) => void;
  actions?: (clip: TheaterClip) => React.ReactNode;
}) {
  const [innerActive, setInnerActive] = useState(0);
  const active = Math.min(activeProp ?? innerActive, Math.max(clips.length - 1, 0));
  const setActive = (i: number) => {
    setInnerActive(i);
    onActiveChange?.(i);
  };

  const wrap = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  const current = clips[active] ?? null;

  useEffect(() => {
    setPlaying(false);
    setTime(0);
    setDur(0);
  }, [current?.id]);

  useEffect(() => {
    if (vid.current) {
      vid.current.volume = volume;
      vid.current.muted = muted;
    }
  }, [volume, muted, current?.id]);

  if (!current?.url) return null;

  const toggle = () => {
    const v = vid.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  };

  const select = (i: number) => {
    setActive(i);
    // autoplay the picked clip once it loads
    requestAnimationFrame(() => {
      void vid.current?.play().catch(() => undefined);
    });
  };

  const fullscreen = () => {
    const el = wrap.current as any;
    const v = vid.current as any;
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (el?.requestFullscreen) void el.requestFullscreen();
    else if (v?.webkitEnterFullscreen) v.webkitEnterFullscreen(); // iOS Safari
  };

  return (
    <div>
      <div
        ref={wrap}
        className="group/player relative overflow-hidden rounded-xl border border-white/10 bg-black"
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "k") {
            e.preventDefault();
            toggle();
          }
        }}
        tabIndex={0}
      >
        <span className="absolute top-2 left-2 z-10 rounded-md bg-org-primary px-2 py-0.5 font-mono text-[10px] font-bold tracking-wide text-org-primary-foreground uppercase">
          {catLabel(current.category)}
        </span>
        <video
          ref={vid}
          key={current.id}
          src={`${current.url}#t=0.1`}
          playsInline
          preload="metadata"
          onClick={toggle}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
          className="aspect-video w-full cursor-pointer bg-black object-contain"
        />

        {!playing ? (
          <button
            onClick={toggle}
            aria-label="Play"
            className="absolute inset-0 grid place-items-center bg-black/25"
          >
            <span className="grid size-16 place-items-center rounded-full bg-org-primary text-org-primary-foreground shadow-[0_8px_30px_-6px_var(--org-primary)] transition-transform hover:scale-105">
              <Play className="ml-1 size-7 fill-current" />
            </span>
          </button>
        ) : null}

        {/* Control bar */}
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-3 pt-8 pb-2 transition-opacity",
            playing ? "opacity-0 group-hover/player:opacity-100 focus-within:opacity-100" : "opacity-100",
          )}
        >
          <input
            type="range"
            min={0}
            max={dur || 0}
            step={0.05}
            value={time}
            onChange={(e) => {
              const t = Number(e.target.value);
              if (vid.current) vid.current.currentTime = t;
              setTime(t);
            }}
            aria-label="Seek"
            className="h-1 w-full cursor-pointer accent-[var(--org-primary)]"
          />
          <div className="mt-1.5 flex items-center gap-2 text-white">
            <button
              onClick={toggle}
              aria-label={playing ? "Pause" : "Play"}
              className="grid size-9 place-items-center rounded-md hover:bg-white/10"
            >
              {playing ? <Pause className="size-5 fill-current" /> : <Play className="size-5 fill-current" />}
            </button>
            <button
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? "Unmute" : "Mute"}
              className="grid size-9 place-items-center rounded-md hover:bg-white/10"
            >
              {muted || volume === 0 ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVolume(v);
                setMuted(v === 0);
              }}
              aria-label="Volume"
              className="h-1 w-20 cursor-pointer accent-[var(--org-primary)] sm:w-24"
            />
            <span className="ml-1 font-mono text-[11px] tabular-nums text-white/80">
              {fmt(time)} / {fmt(dur)}
            </span>
            <button
              onClick={fullscreen}
              aria-label="Fullscreen"
              className="ml-auto grid size-9 place-items-center rounded-md hover:bg-white/10"
            >
              <Maximize className="size-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 px-1 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-graphite">{current.title || "Clip"}</p>
          <p className="meta text-steel">
            {catLabel(current.category)} · {active + 1} of {clips.length}
          </p>
        </div>
        {actions ? actions(current) : null}
      </div>

      {clips.length > 1 ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {clips.map((v, i) => (
            <button
              key={v.id}
              onClick={() => select(i)}
              className={cn(
                "group relative aspect-video overflow-hidden rounded-lg border bg-black transition-all",
                i === active
                  ? "border-org-primary ring-2 ring-org-primary/40"
                  : "border-white/10 hover:border-white/30",
              )}
              aria-label={`Play ${v.title || "clip"}`}
            >
              {v.url ? (
                <video
                  src={`${v.url}#t=0.5`}
                  muted
                  playsInline
                  preload="metadata"
                  className="pointer-events-none size-full object-cover"
                />
              ) : null}
              <span className="absolute top-1 left-1 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[9.5px] font-bold tracking-wide text-white uppercase">
                {catLabel(v.category)}
              </span>
              <span className="absolute inset-0 grid place-items-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
                <Play className="size-5 fill-white text-white" />
              </span>
              <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-1.5 pt-3 pb-1 text-left text-[10px] font-semibold text-white">
                {v.title || "Clip"}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
