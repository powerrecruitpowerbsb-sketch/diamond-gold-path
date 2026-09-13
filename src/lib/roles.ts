/**
 * One place for the account hierarchy, so no screen invents its own idea of
 * who an "admin" is.
 *
 *   superadmin  Power Recruit staff — every organization, plus the console
 *   org_owner   the organization, including billing and logo/colors
 *   org_admin   the organization, minus billing and logo/colors
 *   org_staff   coach: roster and intelligence submissions
 *   player      own family portal
 *   parent      own family portal
 */
export type AppRole = "superadmin" | "org_owner" | "org_admin" | "org_staff" | "parent" | "player";

export const ROLE_LABEL: Record<AppRole, string> = {
  superadmin: "Power Recruit staff",
  org_owner: "Owner",
  org_admin: "Admin",
  org_staff: "Coach / Staff",
  parent: "Parent",
  player: "Player",
};

/** Owner or Admin — everything for the organization bar the owner-only bits. */
export function isAdminLevel(role: string | null | undefined): boolean {
  return role === "org_owner" || role === "org_admin";
}

/** Anyone who works inside an organization: owner, admin or coach/staff. */
export function isOrgManagerRole(role: string | null | undefined): boolean {
  return isAdminLevel(role) || role === "org_staff";
}

export function isOwnerRole(role: string | null | undefined): boolean {
  return role === "org_owner";
}

export function isFamilyRole(role: string | null | undefined): boolean {
  return role === "parent" || role === "player";
}

export function roleLabel(role: string | null | undefined): string {
  return ROLE_LABEL[(role ?? "") as AppRole] ?? "Member";
}
