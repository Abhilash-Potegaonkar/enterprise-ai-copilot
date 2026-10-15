import type { UserRole } from "@/types";
import {
  EmployeeDirectoryScopeError,
  type DirectoryUser,
  type EmployeeDirectoryEntry,
} from "./directory-core";

interface DirectorySessionUser {
  id?: string;
  email?: string | null;
  role?: string;
}

interface DirectorySession {
  user?: DirectorySessionUser;
}

interface EmployeeDirectoryRouteDependencies {
  getSession(): Promise<DirectorySession | null>;
  readDirectory(user: DirectoryUser): Promise<EmployeeDirectoryEntry[]>;
}

const userRoles = ["ADMIN", "HR", "MANAGER", "EMPLOYEE"] as const satisfies readonly UserRole[];

function isUserRole(role: string | undefined): role is UserRole {
  return userRoles.some((candidate) => candidate === role);
}

export function createEmployeeDirectoryGetHandler(
  dependencies: EmployeeDirectoryRouteDependencies,
) {
  return async function getEmployeeDirectory(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.searchParams.size > 0) {
      return Response.json(
        { error: "Query parameters are not supported." },
        { status: 400 },
      );
    }

    const session = await dependencies.getSession();
    const sessionUser = session?.user;

    if (
      !sessionUser?.id ||
      !sessionUser.email ||
      !isUserRole(sessionUser.role)
    ) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }

    try {
      const employees = await dependencies.readDirectory({
        id: sessionUser.id,
        role: sessionUser.role,
      });

      return Response.json({ employees });
    } catch (error) {
      if (error instanceof EmployeeDirectoryScopeError) {
        return Response.json({ error: "Access denied." }, { status: 403 });
      }

      throw error;
    }
  };
}
