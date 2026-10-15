export interface LoginCredentials {
  email: string;
  password: string;
}

export function parseLoginFormData(
  formData: FormData,
): LoginCredentials | null {
  const email = formData.get("email");
  const password = formData.get("password");

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    password.length === 0
  ) {
    return null;
  }

  return { email: email.trim(), password };
}
