import { auth } from "../../../../auth";
import { readEmployeeDirectory } from "@/lib/employees/directory";
import { createEmployeeDirectoryGetHandler } from "@/lib/employees/directory-route";

const handleGet = createEmployeeDirectoryGetHandler({
  getSession: auth,
  readDirectory: readEmployeeDirectory,
});

export const GET = handleGet;
