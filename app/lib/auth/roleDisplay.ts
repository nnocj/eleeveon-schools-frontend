/** Display-only role names. Never use labels for permission checks or storage. */
export function displayRoleLabel(role: string | null | undefined): string {
  const value = String(role || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (value === "super_admin" || value === "owner" || value === "school_owner") return "Owner";
  if (value === "school_admin" || value === "admin") return "Multi-Branch Admin";
  if (value === "branch_admin") return "Branch Admin";
  if (value === "platform_team") return "Platform Team";
  if (value === "developer") return "Developer";
  if (value === "accountant") return "Accountant";
  if (value === "teacher") return "Teacher";
  if (value === "student") return "Student";
  if (value === "parent") return "Parent";
  return String(role || "Member").replace(/_/g, " ");
}
