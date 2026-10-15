import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  createEmployeeDirectoryReader,
  type EmployeeDirectoryFilter,
} from "./directory-core";

const directorySelect = {
  id: true,
  employeeCode: true,
  firstName: true,
  lastName: true,
  email: true,
  hiredAt: true,
  department: {
    select: {
      id: true,
      name: true,
    },
  },
} as const;

const readEmployeeDirectory = createEmployeeDirectoryReader({
  async findLinkedEmployee(userId) {
    return prisma.employee.findUnique({
      where: { userId },
      select: { id: true, departmentId: true },
    });
  },
  async listEmployees(filter: EmployeeDirectoryFilter) {
    const where = filter ?? {};

    return prisma.employee.findMany({
      where,
      select: directorySelect,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
  },
});

export { readEmployeeDirectory };
