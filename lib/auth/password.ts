import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const TEMP_PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const TEMP_PASSWORD_CHARSET_LENGTH = TEMP_PASSWORD_CHARS.length;
const TEMP_PASSWORD_MAX_UNBIASED_VALUE =
  Math.floor(256 / TEMP_PASSWORD_CHARSET_LENGTH) * TEMP_PASSWORD_CHARSET_LENGTH;

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;

  return `scrypt$${salt}$${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, salt, key] = storedHash.split("$");

  if (algorithm !== "scrypt" || !salt || !key) {
    return false;
  }

  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  const storedKey = Buffer.from(key, "hex");

  if (storedKey.length !== derivedKey.length) {
    return false;
  }

  return timingSafeEqual(storedKey, derivedKey);
}

export function generateTemporaryPassword(length = 10) {
  let password = "";

  while (password.length < length) {
    const bytes = randomBytes(length - password.length);

    for (const byte of bytes) {
      if (byte >= TEMP_PASSWORD_MAX_UNBIASED_VALUE) {
        continue;
      }

      password += TEMP_PASSWORD_CHARS[byte % TEMP_PASSWORD_CHARSET_LENGTH];

      if (password.length === length) {
        break;
      }
    }
  }

  return password;
}
