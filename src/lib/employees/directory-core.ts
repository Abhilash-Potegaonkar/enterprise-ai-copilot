import type { UserRole } from "@/types";

export interface DirectoryUser {
  id: string;
  role: UserRole;
}

export interface EmployeeDirectoryRecord {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  hiredAt: Date | null;
  department: {
    id: string;
    name: string;
  };
}

export interface EmployeeDirectoryEntry {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  hiredAt: string | null;
  department: {
    id: string;
    name: string;
  };
}

export type EmployeeDirectoryFilter =
  | { departmentId: string }
  | { id: string }
  | null;

export interface EmployeeDirectoryStore {
  findLinkedEmployee(
    userId: string,
  ): Promise<{ id: string; departmentId: string } | null>;
  listEmployees(
    filter: EmployeeDirectoryFilter,
  ): Promise<EmployeeDirectoryRecord[]>;
}

export class EmployeeDirectoryScopeError extends Error {
  constructor() {
    super("The current user does not have a linked employee record.");
    this.name = "EmployeeDirectoryScopeError";
  }
}

export function createEmployeeDirectoryReader(store: EmployeeDirectoryStore) {
  return async function readEmployeeDirectory(
    user: DirectoryUser,
  ): Promise<EmployeeDirectoryEntry[]> {
    let filter: EmployeeDirectoryFilter;

    if (user.role === "ADMIN" || user.role === "HR") {
      filter = null;
    } else {
      const linkedEmployee = await store.findLinkedEmployee(user.id);

      if (
        !linkedEmployee ||
        linkedEmployee.id.length === 0 ||
        linkedEmployee.departmentId.length === 0
      ) {
        throw new EmployeeDirectoryScopeError();
      }

      if (user.role === "MANAGER") {
        filter = { departmentId: linkedEmployee.departmentId };
      } else if (user.role === "EMPLOYEE") {
        filter = { id: linkedEmployee.id };
      } else {
        throw new EmployeeDirectoryScopeError();
      }
    }

    const records = await store.listEmployees(filter);
    return records.map(toEmployeeDirectoryEntry);
  };
}

function toEmployeeDirectoryEntry(
  record: EmployeeDirectoryRecord,
): EmployeeDirectoryEntry {
  if (
    !record.id ||
    !record.employeeCode ||
    !record.firstName ||
    !record.lastName ||
    !record.email ||
    !record.department.id ||
    !record.department.name ||
    (record.hiredAt !== null &&
      (!(record.hiredAt instanceof Date) ||
        !Number.isFinite(record.hiredAt.getTime())))
  ) {
    throw new Error("Invalid employee directory record.");
  }

  return {
    id: record.id,
    employeeCode: record.employeeCode,
    firstName: record.firstName,
    lastName: record.lastName,
    email: record.email,
    hiredAt: record.hiredAt?.toISOString() ?? null,
    department: {
      id: record.department.id,
      name: record.department.name,
    },
  };
}
