import { connection } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/authorization";
import { readEmployeeDirectory } from "@/lib/employees/directory";

export const instant = false;

export default async function EmployeeDirectoryPage() {
  await connection();
  const user = await requireAuthenticatedUser();
  const employees = await readEmployeeDirectory({
    id: user.id,
    role: user.role,
  });

  return (
    <section className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase text-green">
          People
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-foreground">
          Employee directory
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Employee records available to your account.
        </p>
      </header>

      {employees.length === 0 ? (
        <p className="rounded-md border border-line bg-surface p-6 text-sm text-muted">
          No employee records are available.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-line bg-surface">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-line bg-secondary/50 text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium" scope="col">Employee</th>
                <th className="px-4 py-3 font-medium" scope="col">Email</th>
                <th className="px-4 py-3 font-medium" scope="col">Department</th>
                <th className="px-4 py-3 font-medium" scope="col">Employee code</th>
                <th className="px-4 py-3 font-medium" scope="col">Hired</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {employees.map((employee) => (
                <tr key={employee.id}>
                  <td className="px-4 py-3 font-medium text-foreground">
                    {employee.firstName} {employee.lastName}
                  </td>
                  <td className="px-4 py-3 text-muted">{employee.email}</td>
                  <td className="px-4 py-3 text-muted">
                    {employee.department.name}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {employee.employeeCode}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {employee.hiredAt
                      ? new Date(employee.hiredAt).toLocaleDateString()
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
