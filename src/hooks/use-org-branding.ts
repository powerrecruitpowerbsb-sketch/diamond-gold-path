import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { useMyAccount } from "@/hooks/use-my-account";
import { getMyBranding } from "@/lib/org-branding.functions";

export type OrgBranding = {
  organizationId: string | null;
  name: string | null;
  logoUrl: string | null;
  logoPath: string | null;
  primary: string | null;
  accent: string | null;
  canEdit: boolean;
};

/**
 * Branding for the signed-in user's organization. Gated on the session (like
 * useMyAccount) so pre-session renders never call the protected fn, and always
 * null for staff outside an organization — the console keeps the fixed Power
 * Recruit identity.
 */
export function useOrgBranding() {
  const brandingFn = useServerFn(getMyBranding);
  const { account, signedIn } = useMyAccount();
  // Staff have no organization of their own, but they do have one while they
  // are inside a customer organization.
  const actingOrgId = account?.actingOrg?.id ?? null;
  const hasOrg = Boolean(actingOrgId) || (Boolean(account?.profile?.organization_id) && !account?.isSuperadmin);

  const query = useQuery({
    queryKey: ["org-branding", actingOrgId ?? account?.profile?.organization_id ?? null],
    queryFn: () => brandingFn(),
    enabled: signedIn && hasOrg,
    retry: false,
    staleTime: 60_000,
  });

  return {
    branding: (query.data ?? null) as OrgBranding | null,
    isPending: query.isPending && signedIn && hasOrg,
    refetch: query.refetch,
  };
}
