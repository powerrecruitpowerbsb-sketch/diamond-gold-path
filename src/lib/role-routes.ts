/** Where each role lands after signing in. */
export function routeForRole(role: string | null | undefined): string {
  switch (role) {
    case "superadmin":
      return "/admin";
    case "player":
      return "/athlete";
    case "parent":
      return "/family";
    case "org_owner":
    case "org_admin":
    case "org_staff":
      return "/dashboard";
    default:
      return "/search";
  }
}
