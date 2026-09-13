import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  createOrganization,
  inviteOrganizationOwner,
  listOrganizations,
  setOrganizationAccess,
  updateOrganization,
} from "@/lib/organizations.functions";
import { PageHeader } from "@/components/console/PageHeader";
import { RecordTable } from "@/components/console/RecordTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/admin/organizations")({
  component: Organizations,
});

const PLANS = [
  { value: "founding", label: "Founding (free)" },
  { value: "standard", label: "Standard" },
  { value: "enterprise", label: "Enterprise" },
];

function Organizations() {
  const listFn = useServerFn(listOrganizations);
  const createFn = useServerFn(createOrganization);
  const updateFn = useServerFn(updateOrganization);
  const accessFn = useServerFn(setOrganizationAccess);
  const inviteFn = useServerFn(inviteOrganizationOwner);
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({ queryKey: ["organizations"], queryFn: () => listFn() });
  const rows = data ?? [];

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    plan: "standard",
    seats: "5",
    billingEmail: "",
    annualFee: "",
    ownerEmail: "",
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["organizations"] });

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          name: form.name,
          plan: form.plan as "founding" | "standard" | "enterprise",
          seats: Number(form.seats || 0),
          billingEmail: form.billingEmail || null,
          annualFee: form.annualFee ? Number(form.annualFee) : null,
          ownerEmail: form.ownerEmail || null,
        },
      }),
    onSuccess: (result) => {
      toast.success(
        result.ownerInvited
          ? `${result.name} created and ${result.ownerInvited} invited as owner.`
          : `${result.name} created.`,
      );
      setShowForm(false);
      setForm({ name: "", plan: "standard", seats: "5", billingEmail: "", annualFee: "", ownerEmail: "" });
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const patch = useMutation({
    mutationFn: (input: { id: string; plan?: string; seats?: number }) =>
      updateFn({ data: input as any }),
    onSuccess: () => {
      toast.success("Saved.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const access = useMutation({
    mutationFn: (input: { id: string; suspended: boolean }) => accessFn({ data: input }),
    onSuccess: (result) => {
      toast.success(result.suspended ? "Access suspended." : "Access restored.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const invite = useMutation({
    mutationFn: (input: { id: string; email: string }) => inviteFn({ data: input }),
    onSuccess: (result) => {
      toast.success(`Owner invite sent to ${result.email}.`);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const seatsUsed = rows.reduce((sum, row) => sum + row.seatsUsed, 0);
  const seatsBought = rows.reduce((sum, row) => sum + row.seats, 0);

  return (
    <>
      <PageHeader
        title="Organizations"
        description="Every customer on the platform. Creating one here replaces the hand-written database insert."
        counts={[
          `${rows.length.toLocaleString("en-US")} organizations`,
          `${seatsUsed.toLocaleString("en-US")} of ${seatsBought.toLocaleString("en-US")} seats used`,
        ]}
        actions={
          <Button className="touch-target" onClick={() => setShowForm((open) => !open)}>
            {showForm ? "Cancel" : "New organization"}
          </Button>
        }
      />

      {showForm ? (
        <form
          className="mb-6 grid gap-4 rounded border border-border bg-card p-4 sm:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <div className="sm:col-span-2">
            <Label htmlFor="org-name">Organization name</Label>
            <Input
              id="org-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Power Baseball"
              required
            />
          </div>
          <div>
            <Label htmlFor="org-plan">Plan</Label>
            <select
              id="org-plan"
              value={form.plan}
              onChange={(event) => setForm({ ...form, plan: event.target.value })}
              className="h-9 w-full rounded border border-input bg-card px-2 text-sm"
            >
              {PLANS.map((plan) => (
                <option key={plan.value} value={plan.value}>
                  {plan.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="org-seats">Staff seats</Label>
            <Input
              id="org-seats"
              type="number"
              min={0}
              max={1000}
              value={form.seats}
              onChange={(event) => setForm({ ...form, seats: event.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="org-fee">Annual fee</Label>
            <Input
              id="org-fee"
              type="number"
              min={0}
              value={form.annualFee}
              onChange={(event) => setForm({ ...form, annualFee: event.target.value })}
              placeholder="0"
            />
          </div>
          <div>
            <Label htmlFor="org-billing">Billing contact</Label>
            <Input
              id="org-billing"
              type="email"
              value={form.billingEmail}
              onChange={(event) => setForm({ ...form, billingEmail: event.target.value })}
              placeholder="billing@club.com"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="org-owner">First owner's email (optional)</Label>
            <Input
              id="org-owner"
              type="email"
              value={form.ownerEmail}
              onChange={(event) => setForm({ ...form, ownerEmail: event.target.value })}
              placeholder="director@club.com"
            />
            <p className="mt-1 text-xs text-steel">
              They get an invite to set a password and land as the organization's owner.
            </p>
          </div>
          <div className="flex items-end">
            <Button type="submit" className="touch-target" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create organization"}
            </Button>
          </div>
        </form>
      ) : null}

      {isPending ? (
        <div className="h-40 animate-pulse rounded border border-border bg-card" />
      ) : (
        <RecordTable
          rows={rows}
          rowKey={(row) => row.id}
          empty="No organizations yet."
          caption="Organizations"
          columns={[
            { header: "Organization", cell: (row) => <span className="font-semibold">{row.name}</span> },
            {
              header: "Plan",
              cell: (row) => (
                <select
                  value={row.plan}
                  onChange={(event) => patch.mutate({ id: row.id, plan: event.target.value })}
                  className="h-7 rounded border border-input bg-card px-1 text-xs"
                  aria-label={`Plan for ${row.name}`}
                >
                  {PLANS.map((plan) => (
                    <option key={plan.value} value={plan.value}>
                      {plan.label}
                    </option>
                  ))}
                </select>
              ),
            },
            {
              header: "Seats",
              numeric: true,
              cell: (row) => (
                <span>
                  {row.seatsUsed.toLocaleString("en-US")} /{" "}
                  <input
                    type="number"
                    min={0}
                    max={1000}
                    defaultValue={row.seats}
                    aria-label={`Seats for ${row.name}`}
                    onBlur={(event) => {
                      const next = Number(event.target.value);
                      if (next !== row.seats) patch.mutate({ id: row.id, seats: next });
                    }}
                    className="tabular h-7 w-16 rounded border border-input bg-card px-1 text-right text-xs"
                  />
                </span>
              ),
            },
            { header: "Athletes", numeric: true, cell: (row) => row.athletes.toLocaleString("en-US") },
            { header: "Families", numeric: true, cell: (row) => row.familyCount.toLocaleString("en-US") },
            {
              header: "Saved schools",
              numeric: true,
              cell: (row) => row.savedSchools.toLocaleString("en-US"),
            },
            {
              header: "Status",
              cell: (row) => (
                <span
                  className={
                    row.billingStatus === "suspended"
                      ? "rounded-full bg-seam-red-tint px-2 py-0.5 text-xs font-semibold text-seam-red"
                      : "rounded-full bg-diamond-green-tint px-2 py-0.5 text-xs font-semibold text-diamond-green"
                  }
                >
                  {row.billingStatus ?? "—"}
                </span>
              ),
            },
            {
              header: "Actions",
              cell: (row) => (
                <span className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      access.mutate({ id: row.id, suspended: row.billingStatus !== "suspended" })
                    }
                  >
                    {row.billingStatus === "suspended" ? "Restore" : "Suspend"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const email = window.prompt(`Invite an owner to ${row.name}:`);
                      if (email) invite.mutate({ id: row.id, email });
                    }}
                  >
                    Invite owner
                  </Button>
                </span>
              ),
            },
          ]}
        />
      )}
      <p className="mt-3 text-sm text-steel">
        Viewing the app as one of an organization's roles comes next.
      </p>
    </>
  );
}
