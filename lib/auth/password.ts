import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import {
  PASSWORD_POLICY,
  countPasswordClasses,
} from "@/lib/auth/password-policy";

// 重新导出纯逻辑层，让现有 `from "@/lib/auth/password"` 的服务端引用零改动。
// 客户端组件应改为 `from "@/lib/auth/password-policy"`，避免把 node:crypto 拉进 bundle。
export {
  PASSWORD_POLICY,
  countPasswordClasses,
  passwordPolicySchema,
  validatePasswordStrength,
} from "@/lib/auth/password-policy";

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

function pickRandomChar() {
  // 拒绝采样，避免 256 % charset 偏置。
  while (true) {
    const byte = randomBytes(1)[0];
    if (byte < TEMP_PASSWORD_MAX_UNBIASED_VALUE) {
      return TEMP_PASSWORD_CHARS[byte % TEMP_PASSWORD_CHARSET_LENGTH];
    }
  }
}

/**
 * 生成临时密码。
 *
 * 默认 12 位，保证至少同时包含大写、小写、数字 3 类，
 * 已满足共享密码策略，避免管理员重置 / bootstrap 自动密码踩政策。
 */
export function generateTemporaryPassword(length = PASSWORD_POLICY.minLength) {
  const targetLength = Math.max(length, PASSWORD_POLICY.minLength);

  // 给最多几次重试空间。length=12 默认下，全部 3 类齐全的概率非常高，
  // 但为了 100% 满足策略，仍做一次校验，必要时重试。
  for (let attempt = 0; attempt < 8; attempt += 1) {
    let password = "";
    while (password.length < targetLength) {
      password += pickRandomChar();
    }

    if (countPasswordClasses(password) >= PASSWORD_POLICY.requiredClassCount) {
      return password;
    }
  }

  // 极小概率的兜底：拼接固定模板，确保命中 3 类，长度仍然达标。
  const fallback: string[] = [];
  while (fallback.length < targetLength - 3) {
    fallback.push(pickRandomChar());
  }
  fallback.push("A", "a", "3");
  return fallback.join("");
}
