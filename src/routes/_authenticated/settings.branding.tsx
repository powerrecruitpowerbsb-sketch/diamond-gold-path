import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Upload } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/brand/AppShell";
import { AuthButton } from "@/components/brand/AuthButton";
import { useOrgBranding } from "@/hooks/use-org-branding";
import { supabase } from "@/integrations/supabase/client";
import { saveOrgBranding } from "@/lib/org-branding.functions";

const BRANDING_BUCKET = "org-branding";

export const Route = createFileRoute("/_authenticated/settings/branding")({
  head: () => ({
    meta: [
      { title: "Organization branding — Power Recruit" },
      {
        name: "description",
        content: "Set your organization's logo and brand colors across Power Recruit.",
      },
      { property: "og:title", content: "Organization branding — Power Recruit" },
      {
        property: "og:description",
        content: "Upload a logo and choose brand colors for your travel organization.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BrandingSettings,
});

const DEFAULT_PRIMARY = "#1F3A5F";
const DEFAULT_ACCENT = "#D3A94E";

/** Relative luminance per WCAG, used for the white-text contrast warning. */
function contrastWithWhite(hex: string): number | null {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const channel = (value: number) => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = channel(parseInt(full.slice(0, 2), 16));
  const g = channel(parseInt(full.slice(2, 4), 16));
  const b = channel(parseInt(full.slice(4, 6), 16));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (luminance + 0.05);
}

function BrandingSettings() {
  const { branding, isPending, refetch } = useOrgBranding();
  const saveFn = useServerFn(saveOrgBranding);
  const queryClient = useQueryClient();

  const [primary, setPrimary] = useState(DEFAULT_PRIMARY);
  const [accent, setAccent] = useState(DEFAULT_ACCENT);
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!branding) return;
    setPrimary(branding.primary ?? DEFAULT_PRIMARY);
    setAccent(branding.accent ?? DEFAULT_ACCENT);
    setLogoPath(branding.logoPath ?? null);
    setLogoPreview(branding.logoUrl ?? null);
  }, [branding]);

  const ratio = useMemo(() => contrastWithWhite(primary), [primary]);
  const lowContrast = ratio !== null && ratio < 4.5;

  async function onLogo(file: File | null) {
    setUploadError(null);
    if (!file) return;
    const okType = /\.(png|svg)$/i.test(file.name) || ["image/png", "image/svg+xml"].includes(file.type);
    if (!okType) {
      setUploadError("Logos must be a PNG or SVG file.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setUploadError("That logo is over 2MB — please upload a smaller file.");
      return;
    }
    if (!branding?.organizationId) {
      setUploadError("No organization on this account.");
      return;
    }

    setUploading(true);
    try {
      const ext = /\.svg$/i.test(file.name) || file.type === "image/svg+xml" ? "svg" : "png";
      const path = `${branding.organizationId}/logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from(BRANDING_BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type || undefined });
      if (error) throw new Error(error.message);
      const { data: signed } = await supabase.storage
        .from(BRANDING_BUCKET)
        .createSignedUrl(path, 60 * 60);
      setLogoPath(path);
      setLogoPreview(signed?.signedUrl ?? null);
      toast.success("Logo uploaded — save to apply it");
    } catch (error) {
      setUploadError((error as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      await saveFn({ data: { primary, accent, logoPath } });
      await queryClient.invalidateQueries({ queryKey: ["org-branding"] });
      await refetch();
      toast.success("Branding saved");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell right={<AuthButton />}>
      <div className="max-w-3xl">
        <p className="font-mono text-xs tracking-wide text-steel uppercase">Organization settings</p>
        <h1 className="font-display text-3xl font-bold text-graphite">Branding</h1>
        <p className="mt-1 text-sm text-steel">
          Your logo and colors apply across the app for everyone in your organization. The Power
          Recruit staff console always keeps its own identity.
        </p>

        {isPending ? <p className="mt-6 text-sm text-steel">Loading branding…</p> : null}

        {!isPending && !branding?.organizationId ? (
          <p className="mt-6 rounded-xl border border-border bg-white p-4 text-sm text-steel">
            This account isn't attached to an organization, so there's no branding to set.
          </p>
        ) : null}

        {branding?.organizationId ? (
          <>
            {!branding.canEdit ? (
              <p className="mt-6 rounded-xl border border-seam-red/30 bg-seam-red-tint p-4 text-sm text-seam-red">
                Only organization admins can change branding.
              </p>
            ) : null}

            {/* Live preview of the app header */}
            <section className="mt-6">
              <h2 className="font-mono text-[11px] tracking-wide text-steel uppercase">Live preview</h2>
              <div
                className="mt-2 overflow-hidden rounded-xl border border-border shadow-[0_2px_14px_-10px_rgba(18,35,58,0.4)]"
                style={{ background: primary }}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  {logoPreview ? (
                    <img
                      src={logoPreview}
                      alt="Organization logo preview"
                      className="size-8 rounded-md bg-white/10 object-contain"
                    />
                  ) : (
                    <span
                      className="grid size-8 place-items-center rounded-md font-display text-[15px] font-bold text-navy-deep"
                      style={{ background: accent }}
                      aria-hidden
                    >
                      P
                    </span>
                  )}
                  <span className="font-display text-lg font-bold text-white">Power Recruit</span>
                  <span className="ml-auto rounded-lg px-3 py-1.5 text-sm font-semibold text-navy-deep" style={{ background: accent }}>
                    Search
                  </span>
                </div>
              </div>
              {lowContrast ? (
                <p className="mt-2 flex items-start gap-2 rounded-lg border border-org-accent/40 bg-org-accent/10 p-3 text-sm text-graphite">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  White header text is hard to read on this color (contrast{" "}
                  <span className="tabular-nums">{ratio?.toFixed(1)}</span>:1, below 4.5:1). You can
                  still save it — a darker shade will read better.
                </p>
              ) : null}
            </section>

            <section className="mt-6 grid gap-6 rounded-xl border border-border bg-white p-6 shadow-[0_2px_14px_-10px_rgba(18,35,58,0.4)] sm:grid-cols-2">
              <div>
                <h2 className="font-mono text-[11px] tracking-wide text-steel uppercase">
                  Primary brand color
                </h2>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(primary) ? primary : DEFAULT_PRIMARY}
                    onChange={(event) => setPrimary(event.target.value)}
                    aria-label="Primary brand color"
                    className="size-11 cursor-pointer rounded-lg border border-border bg-white"
                  />
                  <input
                    value={primary}
                    onChange={(event) => setPrimary(event.target.value)}
                    className="touch-target w-32 rounded-lg border border-border px-3 font-mono text-sm text-graphite outline-none focus:border-org-primary"
                  />
                </div>
              </div>

              <div>
                <h2 className="font-mono text-[11px] tracking-wide text-steel uppercase">
                  Accent color (optional)
                </h2>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(accent) ? accent : DEFAULT_ACCENT}
                    onChange={(event) => setAccent(event.target.value)}
                    aria-label="Accent brand color"
                    className="size-11 cursor-pointer rounded-lg border border-border bg-white"
                  />
                  <input
                    value={accent}
                    onChange={(event) => setAccent(event.target.value)}
                    className="touch-target w-32 rounded-lg border border-border px-3 font-mono text-sm text-graphite outline-none focus:border-org-primary"
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <h2 className="font-mono text-[11px] tracking-wide text-steel uppercase">Logo</h2>
                <p className="mt-1 text-sm text-steel">PNG or SVG, up to 2MB.</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-chalk px-4 py-3 text-sm font-semibold text-graphite hover:bg-white">
                    <Upload className="size-4" aria-hidden />
                    {uploading ? "Uploading…" : "Upload logo"}
                    <input
                      type="file"
                      accept=".png,.svg,image/png,image/svg+xml"
                      className="hidden"
                      disabled={uploading || !branding.canEdit}
                      onChange={(event) => void onLogo(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  {logoPath ? (
                    <button
                      type="button"
                      onClick={() => {
                        setLogoPath(null);
                        setLogoPreview(null);
                      }}
                      className="touch-target rounded-xl border border-border px-4 text-sm font-semibold text-steel hover:text-seam-red"
                    >
                      Remove logo
                    </button>
                  ) : null}
                </div>
                {uploadError ? (
                  <p className="mt-3 flex items-start gap-2 rounded-lg border border-seam-red/30 bg-seam-red-tint p-3 text-sm text-seam-red">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {uploadError}
                  </p>
                ) : null}
              </div>
            </section>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={saving || !branding.canEdit}
                onClick={() => void save()}
                className="touch-target inline-flex items-center rounded-xl bg-org-primary px-5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save branding"}
              </button>
              <button
                type="button"
                disabled={!branding.canEdit}
                onClick={() => {
                  setPrimary(DEFAULT_PRIMARY);
                  setAccent(DEFAULT_ACCENT);
                }}
                className="touch-target inline-flex items-center rounded-xl border border-border bg-white px-5 text-sm font-semibold text-graphite"
              >
                Reset to Power Recruit colors
              </button>
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
