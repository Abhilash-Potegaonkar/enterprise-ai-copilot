import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { UserRole } from "@/types";
import { parseLoginFormData } from "@/lib/auth/login-input";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { getDashboardLoginRedirect } from "@/lib/auth/dashboard-protection";
import {
  createEmployeeDirectoryReader,
  EmployeeDirectoryScopeError,
  type DirectoryUser,
  type EmployeeDirectoryFilter,
  type EmployeeDirectoryRecord,
  type EmployeeDirectoryStore,
} from "@/lib/employees/directory-core";
import { createEmployeeDirectoryGetHandler } from "@/lib/employees/directory-route";
import {
  verifyCredentials,
  type CredentialRecord,
  type CredentialStore,
} from "@/lib/auth/verify-credentials";

const permissions: readonly Permission[] = [
  "employees:read:any",
  "attendance:read:any",
  "leave:read:any",
  "leave:review",
  "documents:manage:any",
  "employees:read:team",
  "attendance:read:team",
  "leave:read:team",
  "employees:read:self",
  "attendance:read:self",
  "leave:read:self",
  "documents:read:general",
];

const employeeRecord: EmployeeDirectoryRecord = {
  id: "employee-1",
  employeeCode: "E-001",
  firstName: "Taylor",
  lastName: "Employee",
  email: "taylor@example.local",
  hiredAt: new Date("2025-01-01T00:00:00.000Z"),
  department: { id: "department-1", name: "Operations" },
};

function createStore(
  linkedEmployee: { id: string; departmentId: string } | null,
  records: readonly EmployeeDirectoryRecord[],
  observedFilters: EmployeeDirectoryFilter[],
): EmployeeDirectoryStore {
  return {
    async findLinkedEmployee() {
      return linkedEmployee;
    },
    async listEmployees(filter) {
      observedFilters.push(filter);
      if (filter === null) {
        return [...records];
      }
      if ("id" in filter) {
        return records.filter((record) => record.id === filter.id);
      }
      return records.filter(
        (record) => record.department.id === filter.departmentId,
      );
    },
  };
}

function directoryUser(role: UserRole, id = "user-1"): DirectoryUser {
  return { id, role };
}

describe("role permissions", () => {
  it("allows ADMIN to bypass each declared permission", () => {
    for (const permission of permissions) {
      assert.equal(hasPermission("ADMIN", permission), true);
    }
  });

  describe("dashboard protection", () => {
    it("redirects unauthenticated dashboard requests to login", () => {
      const requestUrl = new URL("http://localhost/dashboard/employees");
      const redirect = getDashboardLoginRedirect(false, requestUrl);

      assert.equal(redirect?.pathname, "/login");
    });

    it("allows authenticated dashboard requests through", () => {
      const requestUrl = new URL("http://localhost/dashboard");

      assert.equal(getDashboardLoginRedirect(true, requestUrl), null);
    });
  });

  it("limits HR, MANAGER, and EMPLOYEE to their assigned permission sets", () => {
    const expected: Record<UserRole, readonly Permission[]> = {
      ADMIN: permissions,
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

    for (const role of ["ADMIN", "HR", "MANAGER", "EMPLOYEE"] as const) {
      for (const permission of permissions) {
        assert.equal(
          hasPermission(role, permission),
          expected[role].includes(permission),
          `${role} permission ${permission}`,
        );
      }
    }
  });
});

describe("credential and login input validation", () => {
  it("rejects malformed form values before calling authentication", () => {
    assert.equal(
      parseLoginFormData(new FormData()),
      null,
    );

    const invalidEmail = new FormData();
    invalidEmail.set("email", "not-an-email");
    invalidEmail.set("password", "a-long-password");
    assert.equal(parseLoginFormData(invalidEmail), null);

    const emptyPassword = new FormData();
    emptyPassword.set("email", "user@example.local");
    emptyPassword.set("password", "");
    assert.equal(parseLoginFormData(emptyPassword), null);
  });

  it("rejects invalid credentials and never returns a password hash", async () => {
    const user: CredentialRecord = {
      id: "user-1",
      name: "Taylor",
      email: "user@example.local",
      passwordHash: "stored-hash",
      role: "EMPLOYEE",
    };
    const lookedUpEmails: string[] = [];
    const store: CredentialStore = {
      async findByEmail(email) {
        lookedUpEmails.push(email);
        return user;
      },
      async comparePassword(password, passwordHash) {
        return password === "correct-password" && passwordHash === "stored-hash";
      },
    };

    const invalid = await verifyCredentials(
      " User@Example.Local ",
      "wrong-password",
      store,
    );
    assert.equal(invalid, null);
    assert.deepEqual(lookedUpEmails, ["user@example.local"]);

    const valid = await verifyCredentials(
      " User@Example.Local ",
      "correct-password",
      store,
    );
    assert.deepEqual(valid, {
      id: "user-1",
      name: "Taylor",
      email: "user@example.local",
      role: "EMPLOYEE",
    });
    assert.equal(
      Object.hasOwn(valid, "passwordHash"),
      false,
    );
  });

  it("rejects accounts without a password hash without comparing passwords", async () => {
    const user: CredentialRecord = {
      id: "user-2",
      name: null,
      email: "sso@example.local",
      passwordHash: null,
      role: "EMPLOYEE",
    };
    let compared = false;
    const store: CredentialStore = {
      async findByEmail() {
        return user;
      },
      async comparePassword() {
        compared = true;
        return true;
      },
    };

    assert.equal(
      await verifyCredentials("sso@example.local", "password", store),
      null,
    );
    assert.equal(compared, false);
  });
});

describe("employee directory scope", () => {
  it("allows ADMIN and HR to read organization-wide records", async () => {
    for (const role of ["ADMIN", "HR"] as const) {
      const filters: EmployeeDirectoryFilter[] = [];
      const read = createEmployeeDirectoryReader(
        createStore(null, [employeeRecord], filters),
      );
      const results = await read(directoryUser(role));

      assert.equal(results.length, 1);
      assert.deepEqual(filters, [null]);
    }
  });

  it("limits MANAGER queries to the linked employee's department", async () => {
    const otherDepartmentEmployee: EmployeeDirectoryRecord = {
      ...employeeRecord,
      id: "employee-other",
      department: { id: "department-2", name: "Finance" },
    };
    const filters: EmployeeDirectoryFilter[] = [];
    const read = createEmployeeDirectoryReader(
      createStore(
        { id: "manager-employee", departmentId: "department-1" },
        [employeeRecord, otherDepartmentEmployee],
        filters,
      ),
    );

    const results = await read(directoryUser("MANAGER"));

    assert.deepEqual(filters, [{ departmentId: "department-1" }]);
    assert.deepEqual(results.map((record) => record.id), ["employee-1"]);
  });

  it("limits EMPLOYEE queries to their own linked employee record", async () => {
    const otherEmployee: EmployeeDirectoryRecord = {
      ...employeeRecord,
      id: "employee-other",
    };
    const filters: EmployeeDirectoryFilter[] = [];
    const read = createEmployeeDirectoryReader(
      createStore(
        { id: "employee-1", departmentId: "department-1" },
        [employeeRecord, otherEmployee],
        filters,
      ),
    );

    const results = await read(directoryUser("EMPLOYEE"));

    assert.deepEqual(filters, [{ id: "employee-1" }]);
    assert.deepEqual(results.map((record) => record.id), ["employee-1"]);
  });

  it("denies MANAGER and EMPLOYEE users with no linked employee", async () => {
    for (const role of ["MANAGER", "EMPLOYEE"] as const) {
      const filters: EmployeeDirectoryFilter[] = [];
      const read = createEmployeeDirectoryReader(
        createStore(null, [employeeRecord], filters),
      );

      await assert.rejects(
        read(directoryUser(role)),
        EmployeeDirectoryScopeError,
      );
      assert.deepEqual(filters, []);
    }
  });

  it("denies managers whose linked employee has no department", async () => {
    const read = createEmployeeDirectoryReader(
      createStore({ id: "manager-employee", departmentId: "" }, [employeeRecord], []),
    );

    await assert.rejects(
      read(directoryUser("MANAGER")),
      EmployeeDirectoryScopeError,
    );
  });

  it("does not serialize fields outside the safe directory DTO", async () => {
    const privateRecord = {
      ...employeeRecord,
      user: { passwordHash: "must-not-escape" },
      internalNote: "must-not-escape",
    };
    const read = createEmployeeDirectoryReader(
      createStore(null, [privateRecord], []),
    );

    const [result] = await read(directoryUser("HR"));

    assert.deepEqual(Object.keys(result).sort(), [
      "department",
      "email",
      "employeeCode",
      "firstName",
      "hiredAt",
      "id",
      "lastName",
    ]);
    assert.equal(JSON.stringify(result).includes("must-not-escape"), false);
  });
});

describe("employee directory API authentication", () => {
  it("returns 401 for unauthenticated requests", async () => {
    const handler = createEmployeeDirectoryGetHandler({
      async getSession() {
        return null;
      },
      async readDirectory() {
        assert.fail("Directory must not be queried without a session.");
      },
    });

    const response = await handler(new Request("http://localhost/api/employees"));
    assert.equal(response.status, 401);
  });

  it("rejects malformed sessions and unsupported query parameters", async () => {
    const handler = createEmployeeDirectoryGetHandler({
      async getSession() {
        return { user: { id: "", email: "user@example.local", role: "HR" } };
      },
      async readDirectory() {
        assert.fail("Directory must not be queried for an invalid session.");
      },
    });
    const malformedSessionResponse = await handler(
      new Request("http://localhost/api/employees"),
    );
    assert.equal(malformedSessionResponse.status, 401);

    const queryResponse = await handler(
      new Request("http://localhost/api/employees?departmentId=department-2"),
    );
    assert.equal(queryResponse.status, 400);
  });

  it("returns 403 when a scoped user has no linked employee record", async () => {
    const handler = createEmployeeDirectoryGetHandler({
      async getSession() {
        return {
          user: {
            id: "manager-user",
            email: "manager@example.local",
            role: "MANAGER",
          },
        };
      },
      async readDirectory() {
        throw new EmployeeDirectoryScopeError();
      },
    });

    const response = await handler(new Request("http://localhost/api/employees"));
    assert.equal(response.status, 403);
  });

  it("returns only the validated directory DTO for an authenticated user", async () => {
    const handler = createEmployeeDirectoryGetHandler({
      async getSession() {
        return {
          user: {
            id: "hr-user",
            email: "hr@example.local",
            role: "HR",
          },
        };
      },
      async readDirectory() {
        return [
          {
            id: "employee-1",
            employeeCode: "E-001",
            firstName: "Taylor",
            lastName: "Employee",
            email: "taylor@example.local",
            hiredAt: "2025-01-01T00:00:00.000Z",
            department: { id: "department-1", name: "Operations" },
          },
        ];
      },
    });

    const response = await handler(new Request("http://localhost/api/employees"));
    assert.equal(response.status, 200);
    assert.equal(
      await response.text(),
      JSON.stringify({
        employees: [
          {
            id: "employee-1",
            employeeCode: "E-001",
            firstName: "Taylor",
            lastName: "Employee",
            email: "taylor@example.local",
            hiredAt: "2025-01-01T00:00:00.000Z",
            department: { id: "department-1", name: "Operations" },
          },
        ],
      }),
    );
  });
});
