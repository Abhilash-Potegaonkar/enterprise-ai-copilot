import type { UserRole } from "@/types";

export interface CredentialRecord {
  id: string;
  name: string | null;
  email: string;
  passwordHash: string | null;
  role: UserRole;
}

export interface CredentialStore {
  findByEmail(email: string): Promise<CredentialRecord | null>;
  comparePassword(password: string, passwordHash: string): Promise<boolean>;
}

export interface AuthenticatedIdentity {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
}

export async function verifyCredentials(
  email: string,
  password: string,
  store: CredentialStore,
): Promise<AuthenticatedIdentity | null> {
  const user = await store.findByEmail(email.trim().toLowerCase());

  if (!user?.passwordHash) {
    return null;
  }

  const passwordMatches = await store.comparePassword(
    password,
    user.passwordHash,
  );

  if (!passwordMatches) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}
