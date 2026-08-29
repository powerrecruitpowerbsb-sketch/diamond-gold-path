/** Where each role lands after signing in. */
export function routeForRole(role: string | null | undefined): string {
  switch (role) {
    case "superadmin":
      return "/admin";
    case "org_admin":
    case "org_staff":
      return "/dashboard";
    default:
      return "/family";
  }
}
