import "server-only";
import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import { prisma } from "@/lib/db/prisma";
import type { UserRole } from "@/types";
import type { SessionUser } from "./types";

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

export async function requireAuthenticatedUser(): Promise<SessionUser> {
  const session = await auth();
  const user = session?.user;

  if (!user?.id || !user.email || !user.role) {
    redirect("/login");
  }

  return {
    id: user.id,
    name: user.name ?? null,
    email: user.email,
    role: user.role,
  };
}

export async function requirePermission(
  permission: Permission,
): Promise<SessionUser> {
  const user = await requireAuthenticatedUser();

  if (!hasPermission(user.role, permission)) {
    redirect("/unauthorized");
  }

  return user;
}

export async function requireEmployeeAccess(
  employeeId: string,
): Promise<SessionUser> {
  const user = await requireAuthenticatedUser();

  if (user.role === "ADMIN" || user.role === "HR") {
    return user;
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { departmentId: true, userId: true },
  });

  if (!employee) {
    redirect("/unauthorized");
  }

  if (user.role === "EMPLOYEE" && employee.userId === user.id) {
    return user;
  }

  if (user.role === "MANAGER") {
    const manager = await prisma.employee.findUnique({
      where: { userId: user.id },
      select: { departmentId: true },
    });

    if (manager?.departmentId === employee.departmentId) {
      return user;
    }
  }

  redirect("/unauthorized");
}

export async function requireDocumentAccess(
  documentId: string,
): Promise<SessionUser> {
  const user = await requireAuthenticatedUser();

  if (user.role === "ADMIN" || user.role === "HR") {
    return user;
  }

  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { departmentId: true },
  });

  if (!document) {
    redirect("/unauthorized");
  }

  if (user.role === "EMPLOYEE" && document.departmentId === null) {
    return user;
  }

  if (user.role === "MANAGER") {
    if (document.departmentId === null) {
      return user;
    }

    const manager = await prisma.employee.findUnique({
      where: { userId: user.id },
      select: { departmentId: true },
    });

    if (manager?.departmentId === document.departmentId) {
      return user;
    }
  }

  redirect("/unauthorized");
}