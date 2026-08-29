/** Where each role lands after signing in. */
export function routeForRole(role: string | null | undefined): string {
  switch (role) {
    case "superadmin":
      return "/admin";
    default:
      // Org staff and families start in college search — the screen they use daily.
      return "/search";
  }
}
