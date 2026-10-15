import { loadEnvConfig } from "@next/env";
import { PrismaClient, UserRole } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password-hash-core";

loadEnvConfig(process.cwd());

interface DemoAccount {
  email: string;
  name: string;
  role: UserRole;
  passwordEnvironmentKey: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  departmentName: string;
}

const prisma = new PrismaClient();

const demoAccounts: readonly DemoAccount[] = [
  {
    email: "admin@northstar.local",
    name: "Avery Admin",
    role: UserRole.ADMIN,
    passwordEnvironmentKey: "DEMO_ADMIN_PASSWORD",
    employeeCode: "DEMO-ADMIN",
    firstName: "Avery",
    lastName: "Admin",
    departmentName: "Operations",
  },
  {
    email: "hr@northstar.local",
    name: "Harper Human Resources",
    role: UserRole.HR,
    passwordEnvironmentKey: "DEMO_HR_PASSWORD",
    employeeCode: "DEMO-HR",
    firstName: "Harper",
    lastName: "Human Resources",
    departmentName: "People",
  },
  {
    email: "manager@northstar.local",
    name: "Morgan Manager",
    role: UserRole.MANAGER,
    passwordEnvironmentKey: "DEMO_MANAGER_PASSWORD",
    employeeCode: "DEMO-MANAGER",
    firstName: "Morgan",
    lastName: "Manager",
    departmentName: "Operations",
  },
  {
    email: "employee@northstar.local",
    name: "Elliot Employee",
    role: UserRole.EMPLOYEE,
    passwordEnvironmentKey: "DEMO_EMPLOYEE_PASSWORD",
    employeeCode: "DEMO-EMPLOYEE",
    firstName: "Elliot",
    lastName: "Employee",
    departmentName: "Operations",
  },
];

function getDemoPassword(environmentKey: string): string {
  const password = process.env[environmentKey];

  if (!password || password.length < 12) {
    throw new Error(`${environmentKey} must be set to at least 12 characters.`);
  }

  return password;
}

async function seed(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The development seed cannot run in production.");
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be configured.");
  }

  const databaseHost = new URL(databaseUrl).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(databaseHost)) {
    throw new Error("The development seed only runs against a local database.");
  }

  const departments = new Map<string, string>();

  for (const departmentName of new Set(
    demoAccounts.map((account) => account.departmentName),
  )) {
    const department = await prisma.department.upsert({
      where: { name: departmentName },
      create: { name: departmentName },
      update: {},
      select: { id: true },
    });

    departments.set(departmentName, department.id);
  }

  const users = new Map<UserRole, { id: string; email: string }>();

  for (const account of demoAccounts) {
    const departmentId = departments.get(account.departmentName);

    if (!departmentId) {
      throw new Error(`Missing seed department: ${account.departmentName}`);
    }

    const passwordHash = await hashPassword(
      getDemoPassword(account.passwordEnvironmentKey),
    );
    const user = await prisma.user.upsert({
      where: { email: account.email },
      create: {
        email: account.email,
        name: account.name,
        role: account.role,
        passwordHash,
      },
      update: {
        name: account.name,
        role: account.role,
        passwordHash,
      },
      select: { id: true, email: true },
    });

    await prisma.employee.upsert({
      where: { employeeCode: account.employeeCode },
      create: {
        employeeCode: account.employeeCode,
        firstName: account.firstName,
        lastName: account.lastName,
        email: account.email,
        departmentId,
        userId: user.id,
      },
      update: {
        firstName: account.firstName,
        lastName: account.lastName,
        email: account.email,
        departmentId,
        userId: user.id,
      },
    });

    users.set(account.role, user);
  }

  const employee = await prisma.employee.findUniqueOrThrow({
    where: { employeeCode: "DEMO-EMPLOYEE" },
    select: { id: true },
  });
  const manager = await prisma.employee.findUniqueOrThrow({
    where: { employeeCode: "DEMO-MANAGER" },
    select: { id: true },
  });
  const employeeUser = users.get(UserRole.EMPLOYEE);
  const hrUser = users.get(UserRole.HR);

  if (!employeeUser || !hrUser) {
    throw new Error("Required demo users were not created.");
  }

  await prisma.attendance.upsert({
    where: {
      employeeId_workDate: {
        employeeId: employee.id,
        workDate: new Date("2026-10-12T00:00:00.000Z"),
      },
    },
    create: {
      employeeId: employee.id,
      workDate: new Date("2026-10-12T00:00:00.000Z"),
      checkIn: new Date("2026-10-12T09:00:00.000Z"),
      status: "PRESENT",
    },
    update: {
      checkIn: new Date("2026-10-12T09:00:00.000Z"),
      status: "PRESENT",
    },
  });

  await prisma.attendance.upsert({
    where: {
      employeeId_workDate: {
        employeeId: manager.id,
        workDate: new Date("2026-10-12T00:00:00.000Z"),
      },
    },
    create: {
      employeeId: manager.id,
      workDate: new Date("2026-10-12T00:00:00.000Z"),
      checkIn: new Date("2026-10-12T08:45:00.000Z"),
      status: "PRESENT",
    },
    update: {
      checkIn: new Date("2026-10-12T08:45:00.000Z"),
      status: "PRESENT",
    },
  });

  await prisma.leave.upsert({
    where: { id: "demo-leave-employee-pending" },
    create: {
      id: "demo-leave-employee-pending",
      employeeId: employee.id,
      startDate: new Date("2026-10-19T00:00:00.000Z"),
      endDate: new Date("2026-10-20T00:00:00.000Z"),
      reason: "Personal leave",
      status: "PENDING",
    },
    update: {
      employeeId: employee.id,
      startDate: new Date("2026-10-19T00:00:00.000Z"),
      endDate: new Date("2026-10-20T00:00:00.000Z"),
      reason: "Personal leave",
      status: "PENDING",
      reviewedById: null,
      reviewedAt: null,
    },
  });

  await prisma.leave.upsert({
    where: { id: "demo-leave-manager-approved" },
    create: {
      id: "demo-leave-manager-approved",
      employeeId: manager.id,
      reviewedById: hrUser.id,
      startDate: new Date("2026-11-02T00:00:00.000Z"),
      endDate: new Date("2026-11-03T00:00:00.000Z"),
      reason: "Personal leave",
      status: "APPROVED",
      reviewedAt: new Date("2026-10-12T12:00:00.000Z"),
    },
    update: {
      employeeId: manager.id,
      reviewedById: hrUser.id,
      startDate: new Date("2026-11-02T00:00:00.000Z"),
      endDate: new Date("2026-11-03T00:00:00.000Z"),
      reason: "Personal leave",
      status: "APPROVED",
      reviewedAt: new Date("2026-10-12T12:00:00.000Z"),
    },
  });

  console.info("Development demo users seeded:");
  for (const account of demoAccounts) {
    console.info(`${account.email} (${account.role})`);
  }
}

seed()
  .catch(() => {
    console.error(
      "Development seed failed. Check local PostgreSQL and DEMO_*_PASSWORD values.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });