import type { UserRole } from "@/types";

export type Permission =
  | "employees:read:any"
  | "attendance:read:any"
  | "leave:read:any"
  | "leave:review"
  | "documents:manage:any"
  | "employees:read:team"
  | "attendance:read:team"
  | "leave:read:team"
  | "employees:read:self"
  | "attendance:read:self"
  | "leave:read:self"
  | "documents:read:general";

const rolePermissions: Record<UserRole, readonly Permission[]> = {
  ADMIN: [],
  HR: [
    "employees:read:any",
    "attendance:read:any",
    "leave:read:any",
    "leave:review",
    "documents:manage:any",
  ],
  MANAGER: [
    "employees:read:team",
    "attendance:read:team",
    "leave:read:team",
  ],
  EMPLOYEE: [
    "employees:read:self",
    "attendance:read:self",
    "leave:read:self",
    "documents:read:general",
  ],
};

export function hasPermission(
  role: UserRole,
  permission: Permission,
): boolean {
  return role === "ADMIN" || rolePermissions[role].includes(permission);
}