import "server-only";
import bcrypt from "bcryptjs";

const BCRYPT_COST_FACTOR = 12;
const MAX_BCRYPT_PASSWORD_BYTES = 72;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) {
    throw new Error("Passwords must contain at least 12 characters.");
  }

  if (Buffer.byteLength(password, "utf8") > MAX_BCRYPT_PASSWORD_BYTES) {
    throw new Error("Passwords cannot exceed 72 UTF-8 bytes.");
  }

  return bcrypt.hash(password, BCRYPT_COST_FACTOR);
}