"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { buildRedirectTarget, sanitizeRedirectTarget } from "@/lib/action-notice";
import { getAccountActor } from "@/lib/account-management/access";
import {
  changeOwnPassword,
  createManagedUser,
  resetManagedUserPassword,
  toggleManagedUserStatus,
  updateManagedUser,
  updateManagedUserPermissions,
  upsertTeam,
} from "@/lib/account-management/mutations";
import { normalizeExtraPermissionCodes } from "@/lib/auth/permissions";
import { auth } from "@/lib/auth/session";

export type AccountActionState = {
  status: "idle" | "success" | "error";
  message: string;
  temporaryPassword: string | null;
};

function getValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function formatActionError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      const targets = Array.isArray(error.meta?.target)
        ? error.meta.target.join("、")
        : String(error.meta?.target ?? "");

      if (targets.includes("username")) {
        return "账号已存在，请更换后再试。";
      }

      if (targets.includes("phone")) {
        return "手机号已被其他账号占用。";
      }

      if (targets.includes("code")) {
        return "团队编码已存在，请更换后再试。";
      }

      if (targets.includes("name")) {
        return "名称已存在，请更换后再试。";
      }

      return "存在重复数据，请检查账号、手机号或团队编码。";
    }
  }

  return error instanceof Error ? error.message : "操作失败，请稍后重试。";
}

async function getActor() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return getAccountActor(session.user.id);
}

function revalidateAccountPaths(userId?: string) {
  revalidatePath("/settings");
  revalidatePath("/settings/users");
  revalidatePath("/settings/teams");

  if (userId) {
    revalidatePath(`/settings/users/${userId}`);
  }
}

export async function createManagedUserAction(
  _previousState: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  try {
    const actor = await getActor();
    const result = await createManagedUser(actor, {
      username: getValue(formData, "username"),
      name: getValue(formData, "name"),
      phone: getValue(formData, "phone"),
      roleCode: getValue(formData, "roleCode") as Parameters<
        typeof createManagedUser
      >[1]["roleCode"],
      teamId: getValue(formData, "teamId"),
      supervisorId: getValue(formData, "supervisorId"),
    });

    revalidateAccountPaths(result.id);

    return {
      status: "success",
      message: `账号已创建，临时密码已生成。请尽快安全转交给 ${result.user.name}。`,
      temporaryPassword: result.temporaryPassword,
    };
  } catch (error) {
    return {
      status: "error",
      message: formatActionError(error),
      temporaryPassword: null,
    };
  }
}

export async function updateManagedUserAction(
  _previousState: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  try {
    const actor = await getActor();
    const updated = await updateManagedUser(actor, {
      id: getValue(formData, "id"),
      username: getValue(formData, "username"),
      name: getValue(formData, "name"),
      phone: getValue(formData, "phone"),
      roleCode: getValue(formData, "roleCode") as Parameters<
        typeof updateManagedUser
      >[1]["roleCode"],
      teamId: getValue(formData, "teamId"),
      supervisorId: getValue(formData, "supervisorId"),
    });

    revalidateAccountPaths(updated.id);

    return {
      status: "success",
      message: "账号信息已更新。",
      temporaryPassword: null,
    };
  } catch (error) {
    return {
      status: "error",
      message: formatActionError(error),
      temporaryPassword: null,
    };
  }
}

export async function resetManagedUserPasswordAction(
  _previousState: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  try {
    const actor = await getActor();
    const result = await resetManagedUserPassword(actor, {
      userId: getValue(formData, "userId"),
    });

    revalidateAccountPaths(result.user.id);

    return {
      status: "success",
      message: `已重置 ${result.user.name} 的密码，并要求其下次登录先修改密码。`,
      temporaryPassword: result.temporaryPassword,
    };
  } catch (error) {
    return {
      status: "error",
      message: formatActionError(error),
      temporaryPassword: null,
    };
  }
}

export async function toggleManagedUserStatusAction(
  _previousState: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  try {
    const actor = await getActor();
    const result = await toggleManagedUserStatus(actor, {
      userId: getValue(formData, "userId"),
    });

    revalidateAccountPaths(result.id);

    return {
      status: "success",
      message:
        result.userStatus === "INACTIVE"
          ? "账号已禁用，历史业务数据会继续保留。"
          : "账号已重新启用。",
      temporaryPassword: null,
    };
  } catch (error) {
    return {
      status: "error",
      message: formatActionError(error),
      temporaryPassword: null,
    };
  }
}

export async function updateManagedUserPermissionsAction(
  _previousState: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  try {
    const actor = await getActor();
    const result = await updateManagedUserPermissions(actor, {
      userId: getValue(formData, "userId"),
      permissionCodes: normalizeExtraPermissionCodes(
        formData
          .getAll("permissionCodes")
          .filter((value): value is string => typeof value === "string"),
      ),
    });

    revalidateAccountPaths(result.userId);

    return {
      status: "success",
      message: "额外权限已更新。目标账号需要重新登录后生效。",
      temporaryPassword: null,
    };
  } catch (error) {
    return {
      status: "error",
      message: formatActionError(error),
      temporaryPassword: null,
    };
  }
}

export async function changeOwnPasswordAction(
  _previousState: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  try {
    const actor = await getActor();
    await changeOwnPassword(actor, {
      currentPassword: getValue(formData, "currentPassword"),
      nextPassword: getValue(formData, "nextPassword"),
      confirmPassword: getValue(formData, "confirmPassword"),
    });

    return {
      status: "success",
      message: "密码已更新，请使用新密码重新登录。",
      temporaryPassword: null,
    };
  } catch (error) {
    return {
      status: "error",
      message: formatActionError(error),
      temporaryPassword: null,
    };
  }
}

export async function upsertTeamAction(formData: FormData) {
  const redirectTo = sanitizeRedirectTarget(getValue(formData, "redirectTo"), "/settings/teams");

  try {
    const actor = await getActor();
    await upsertTeam(actor, {
      id: getValue(formData, "id"),
      code: getValue(formData, "code"),
      name: getValue(formData, "name"),
      description: getValue(formData, "description"),
      supervisorId: getValue(formData, "supervisorId"),
    });
  } catch (error) {
    redirect(buildRedirectTarget(redirectTo, "error", formatActionError(error)));
  }

  revalidatePath("/settings");
  revalidatePath("/settings/users");
  revalidatePath("/settings/teams");
  redirect(buildRedirectTarget(redirectTo, "success", "团队信息已保存。"));
}
