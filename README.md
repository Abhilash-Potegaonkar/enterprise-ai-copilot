# AI Enterprise Operations Copilot

Enterprise operations workspace built with Next.js App Router, React, strict TypeScript, Tailwind CSS, shadcn/ui conventions, Prisma, and Auth.js credentials authentication.

## Local development

Requirements: Node.js, npm, and PostgreSQL.

```powershell
npm install
Copy-Item .env.example .env
# Set DATABASE_URL and AUTH_SECRET in .env. Generate a secret with:
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
npm run db:generate
npm run db:migrate -- --name init
npm run dev
```

Open http://localhost:3000. Set `AUTH_SECRET` to the generated value and configure `DATABASE_URL` for PostgreSQL before signing in. Existing databases need a Prisma migration for the new `HR` role.

Run checks with `npm run lint` and `npm run typecheck`.

## Structure

- `src/app`: root redirect, login, protected dashboard, unauthorized page, server actions, and API handlers.
- `src/components/auth`: credentials login form.
- `src/components/layout`: shared navigation and dashboard shell.
- `src/components/ui`: reusable UI primitives following shadcn conventions.
- `src/lib/auth`: typed session contracts, bcrypt password hashing, and server-side authorization guards.
- `src/lib/db`: Prisma client singleton.
- `src/types`: shared application types and Auth.js module augmentation.
- `auth.ts`: Auth.js credentials provider, JWT callbacks, and session configuration.
- `prisma`: PostgreSQL schema and migrations.

## Data model

- A `Department` has many `Employee` records and can scope `Document` records.
- An `Employee` belongs to a department, optionally links to one `User`, and owns attendance and leave records.
- `Attendance` is unique per employee and work date. `Leave` may also reference a reviewing user.
- A `User` owns conversations, may author messages, uploads documents, and may review leave requests.
- A `Conversation` contains ordered `Message` records. Documents store metadata and storage keys; file bytes remain outside PostgreSQL.

## Authentication and authorization

Auth.js uses an eight-hour JWT session cookie. Credentials are checked against `User.passwordHash` with bcrypt; the hash is selected only on the server and is never added to the Auth.js user or session. New credentials must be created with `hashPassword` from `src/lib/auth/passwords.ts`.

The dashboard layout redirects unauthenticated requests to `/login`. Use `requirePermission`, `requireEmployeeAccess`, and `requireDocumentAccess` in server pages, actions, and route handlers before reading or changing protected data. Managers are restricted to their linked employee's department; employees can access only their linked employee record and general documents. HR can manage organization-wide employee, attendance, leave, and document data; ADMIN bypasses permission checks.

Credential account provisioning is intentionally not exposed as public registration. Create users through a trusted administrative process and store only a bcrypt hash.