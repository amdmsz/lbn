import { z } from "zod";

/**
 * 共享密码强度策略（浏览器安全，纯逻辑，不依赖 Node API）。
 *
 * 仅对新设密码生效（首次登录改密 / 管理员重置 / bootstrap 创建）。
 * 不会反向校验老用户已有密码，避免一次升级导致全员被踢出。
 *
 * 注意：`scripts/bootstrap-admin.mjs` 因为是纯 .mjs，无法直接 import 该 TS 模块，
 * 那里复制了同一份策略常量与校验逻辑。改动这里时记得同步另一边。
 */
export const PASSWORD_POLICY = {
  minLength: 12,
  maxLength: 128,
  requiredClassCount: 3,
  /**
   * 友好错误文案，前端 / 后端 / 脚本均复用。
   */
  message: "密码至少 12 位，含大写字母、小写字母、数字和符号中至少 3 类。",
} as const;

const PASSWORD_CLASS_PATTERNS = [
  /[A-Z]/, // 大写
  /[a-z]/, // 小写
  /\d/, // 数字
  /[^A-Za-z0-9]/, // 符号 / 其它（包含空格、汉字、ASCII 标点等）
] as const;

/**
 * 统计密码命中的字符类数量。
 */
export function countPasswordClasses(password: string): number {
  let count = 0;
  for (const pattern of PASSWORD_CLASS_PATTERNS) {
    if (pattern.test(password)) {
      count += 1;
    }
  }
  return count;
}

/**
 * 判断给定密码是否满足共享强度策略。
 * 满足返回 null；不满足返回友好提示。
 */
export function validatePasswordStrength(password: string): string | null {
  if (typeof password !== "string") {
    return PASSWORD_POLICY.message;
  }

  if (password.length < PASSWORD_POLICY.minLength) {
    return PASSWORD_POLICY.message;
  }

  if (password.length > PASSWORD_POLICY.maxLength) {
    return "密码过长。";
  }

  if (countPasswordClasses(password) < PASSWORD_POLICY.requiredClassCount) {
    return PASSWORD_POLICY.message;
  }

  return null;
}

/**
 * zod schema：服务端校验 / 表单 schema 共用。
 *
 * 使用 `.superRefine` 复用 validatePasswordStrength 的判断，错误码统一。
 */
export const passwordPolicySchema = z
  .string()
  .max(PASSWORD_POLICY.maxLength, "密码过长。")
  .superRefine((value, ctx) => {
    const error = validatePasswordStrength(value);
    if (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error,
      });
    }
  });
