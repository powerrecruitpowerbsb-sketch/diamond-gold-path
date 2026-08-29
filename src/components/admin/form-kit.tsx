import { useState, type ReactNode } from "react";
import { ChevronDown, Link2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  SOURCE_TYPES,
  titleCase,
  type FieldDef,
  type SectionDef,
  type SourceEntry,
} from "@/lib/admin-schemas";

export type Values = Record<string, any>;
export type Sources = Record<string, Partial<SourceEntry>>;

export function SectionCard({
  title,
  blurb,
  children,
  aside,
}: {
  title: string;
  blurb?: string | undefined;
  children: ReactNode;
  aside?: ReactNode | undefined;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-[0_2px_14px_-8px_rgba(18,35,58,0.35)] sm:p-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-graphite">{title}</h2>
          {blurb ? <p className="mt-1 text-sm text-steel">{blurb}</p> : null}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

function SourceControl({
  field,
  value,
  onChange,
}: {
  field: string;
  value: Partial<SourceEntry> | undefined;
  onChange: (next: Partial<SourceEntry>) => void;
}) {
  const filled = Boolean(value?.source_url || value?.last_verified_at);
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "meta inline-flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-muted",
          filled && "text-diamond-green",
        )}
        aria-expanded={open}
      >
        <Link2 className="size-3" aria-hidden />
        {filled ? "Sourced" : "Add source"}
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open ? (
        <div className="mt-2 grid gap-2 rounded-md border border-border bg-muted/40 p-2.5 sm:grid-cols-[1fr_auto_auto]">
          <Input
            placeholder="https://source-url"
            aria-label={`Source URL for ${field}`}
            value={value?.source_url ?? ""}
            onChange={(event) => onChange({ ...value, source_url: event.target.value })}
            className="h-9 text-xs"
          />
          <select
            aria-label={`Source type for ${field}`}
            value={value?.source_type ?? "official"}
            onChange={(event) => onChange({ ...value, source_type: event.target.value as any })}
            className="h-9 rounded-md border border-input bg-background px-2 text-xs"
          >
            {SOURCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {titleCase(type)}
              </option>
            ))}
          </select>
          <Input
            type="date"
            aria-label={`Last verified date for ${field}`}
            value={(value?.last_verified_at ?? "").slice(0, 10)}
            onChange={(event) => onChange({ ...value, last_verified_at: event.target.value })}
            className="h-9 text-xs"
          />
        </div>
      ) : null}
    </div>
  );
}

export function FieldControl({
  field,
  value,
  onChange,
  source,
  onSourceChange,
}: {
  field: FieldDef;
  value: any;
  onChange: (next: any) => void;
  source?: Partial<SourceEntry> | undefined;
  onSourceChange?: ((next: Partial<SourceEntry>) => void) | undefined;
}) {
  const id = `field-${field.name}`;

  return (
    <div className={cn(field.kind === "textarea" && "sm:col-span-2")}>
      <Label htmlFor={id} className="text-xs font-semibold tracking-wide text-steel uppercase">
        {field.label}
      </Label>

      <div className="mt-1.5">
        {field.kind === "boolean" ? (
          <div className="flex h-10 items-center gap-2.5">
            <Switch id={id} checked={Boolean(value)} onCheckedChange={onChange} />
            <span className="text-sm text-graphite">{value ? "Yes" : "No"}</span>
          </div>
        ) : field.kind === "select" ? (
          <select
            id={id}
            value={value ?? ""}
            onChange={(event) => onChange(event.target.value || null)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">—</option>
            {(field.options ?? []).map((option) => (
              <option key={option} value={option}>
                {titleCase(option)}
              </option>
            ))}
          </select>
        ) : field.kind === "textarea" ? (
          <Textarea
            id={id}
            value={value ?? ""}
            onChange={(event) => onChange(event.target.value)}
            rows={3}
          />
        ) : (
          <Input
            id={id}
            type={field.kind === "text" || field.kind === "url" ? "text" : "number"}
            inputMode={field.kind === "text" || field.kind === "url" ? undefined : "decimal"}
            step={field.step}
            value={value ?? ""}
            onChange={(event) => onChange(event.target.value)}
            className={cn(field.kind !== "text" && field.kind !== "url" && "tabular")}
            placeholder={field.hint}
          />
        )}
      </div>

      {field.sourced && onSourceChange ? (
        <SourceControl field={field.label} value={source} onChange={onSourceChange} />
      ) : null}
    </div>
  );
}

export function SectionedFields({
  sections,
  values,
  setValues,
  sources,
  setSources,
}: {
  sections: SectionDef[];
  values: Values;
  setValues: (next: Values) => void;
  sources?: Sources | undefined;
  setSources?: ((next: Sources) => void) | undefined;
}) {
  return (
    <div className="grid gap-5">
      {sections.map((section) => (
        <SectionCard key={section.title} title={section.title} blurb={section.blurb}>
          <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
            {section.fields.map((field) => (
              <FieldControl
                key={field.name}
                field={field}
                value={values[field.name]}
                onChange={(next) => setValues({ ...values, [field.name]: next })}
                source={sources?.[field.name]}
                onSourceChange={
                  setSources && sources
                    ? (next) => setSources({ ...sources, [field.name]: next })
                    : undefined
                }
              />
            ))}
          </div>
        </SectionCard>
      ))}
    </div>
  );
}

/** Coerce form strings into DB-ready values. */
export function normalizeValues(sections: SectionDef[], values: Values): Values {
  const out: Values = {};
  for (const section of sections) {
    for (const field of section.fields) {
      const raw = values[field.name];
      if (field.kind === "boolean") {
        out[field.name] = Boolean(raw);
      } else if (field.kind === "number" || field.kind === "money" || field.kind === "percent") {
        out[field.name] = raw === "" || raw == null ? null : Number(raw);
      } else {
        out[field.name] = raw === "" || raw == null ? null : raw;
      }
    }
  }
  return out;
}

export function normalizeSources(sources: Sources): Sources {
  const out: Sources = {};
  for (const [field, entry] of Object.entries(sources ?? {})) {
    if (entry?.source_url || entry?.last_verified_at) out[field] = entry;
  }
  return out;
}
