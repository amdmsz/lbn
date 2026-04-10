"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  buildRedirectTarget,
  getRedirectPathname,
  sanitizeRedirectTarget,
} from "@/lib/action-notice";
import { auth } from "@/lib/auth/session";
import {
  assignCustomerTag,
  assignLeadTag,
  removeCustomerTag,
  removeLeadTag,
  toggleCategory,
  toggleDictionaryItem,
  toggleDictionaryType,
  toggleTag,
  toggleTagCategory,
  toggleTagGroup,
  upsertCategory,
  upsertDictionaryItem,
  upsertDictionaryType,
  upsertTag,
  upsertTagCategory,
  upsertTagGroup,
} from "@/lib/master-data/mutations";

function getValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

async function getActor() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return {
    id: session.user.id,
    role: session.user.role,
  };
}

async function runWithRedirect(
  formData: FormData,
  fallbackPath: string,
  action: (actor: Awaited<ReturnType<typeof getActor>>) => Promise<void>,
) {
  const redirectTo = sanitizeRedirectTarget(getValue(formData, "redirectTo"), fallbackPath);
  const actor = await getActor();

  try {
    await action(actor);
  } catch (error) {
    const message = error instanceof Error ? error.message : "操作失败，请稍后重试。";
    redirect(buildRedirectTarget(redirectTo, "error", message));
  }

  revalidatePath(getRedirectPathname(redirectTo));
  redirect(buildRedirectTarget(redirectTo, "success", "保存成功"));
}

export async function upsertTagGroupAction(formData: FormData) {
  return runWithRedirect(formData, "/settings/tag-groups", async (actor) => {
    await upsertTagGroup(actor, {
      id: getValue(formData, "id"),
      code: getValue(formData, "code"),
      name: getValue(formData, "name"),
      description: getValue(formData, "description"),
      sortOrder: getValue(formData, "sortOrder"),
    });
  });
}

export async function toggleTagGroupAction(formData: FormData) {
  return runWithRedirect(formData, "/settings/tag-groups", async (actor) => {
    await toggleTagGroup(actor, getValue(formData, "id"));
  });
}

export async function upsertTagCategoryAction(formData: FormData) {
  return runWithRedirect(formData, "/settings/tag-categories", async (actor) => {
    await upsertTagCategory(actor, {
      id: getValue(formData, "id"),
      groupId: getValue(formData, "groupId"),
      code: getValue(formData, "code"),
      name: getValue(formData, "name"),
      description: getValue(formData, "description"),
      sortOrder: getValue(formData, "sortOrder"),
    });
  });
}

export async function toggleTagCategoryAction(formData: FormData) {
  return runWithRedirect(formData, "/settings/tag-categories", async (actor) => {
    await toggleTagCategory(actor, getValue(formData, "id"));
  });
}

export async function upsertTagAction(formData: FormData) {
  return runWithRedirect(formData, "/settings/tags", async (actor) => {
    await upsertTag(actor, {
      id: getValue(formData, "id"),
      groupId: getValue(formData, "groupId"),
      categoryId: getValue(formData, "categoryId"),
      code: getValue(formData, "code"),
      name: getValue(formData, "name"),
      color: getValue(formData, "color"),
      description: getValue(formData, "description"),
      sortOrder: getValue(formData, "sortOrder"),
    });
  });
}

export async function toggleTagAction(formData: FormData) {
  return runWithRedirect(formData, "/settings/tags", async (actor) => {
    await toggleTag(actor, getValue(formData, "id"));
  });
}

export async function upsertCategoryAction(formData: FormData) {
  return runWithRedirect(formData, "/settings/dictionaries", async (actor) => {
    await upsertCategory(actor, {
      id: getValue(formData, "id"),
      code: getValue(formData, "code"),
      name: getValue(formData, "name"),
      description: getValue(formData, "description"),
      sortOrder: getValue(formData, "sortOrder"),
    });
  });
}

export async function toggleCategoryAction(formData: FormData) {
  return runWithRedirect(formData, "/settings/dictionaries", async (actor) => {
    await toggleCategory(actor, getValue(formData, "id"));
  });
}

export async function upsertDictionaryTypeAction(formData: FormData) {
  return runWithRedirect(formData, "/settings/dictionaries", async (actor) => {
    await upsertDictionaryType(actor, {
      id: getValue(formData, "id"),
      categoryId: getValue(formData, "categoryId"),
      code: getValue(formData, "code"),
      name: getValue(formData, "name"),
      description: getValue(formData, "description"),
      sortOrder: getValue(formData, "sortOrder"),
    });
  });
}

export async function toggleDictionaryTypeAction(formData: FormData) {
  return runWithRedirect(formData, "/settings/dictionaries", async (actor) => {
    await toggleDictionaryType(actor, getValue(formData, "id"));
  });
}

export async function upsertDictionaryItemAction(formData: FormData) {
  return runWithRedirect(formData, "/settings/dictionaries", async (actor) => {
    await upsertDictionaryItem(actor, {
      id: getValue(formData, "id"),
      typeId: getValue(formData, "typeId"),
      code: getValue(formData, "code"),
      label: getValue(formData, "label"),
      value: getValue(formData, "value"),
      description: getValue(formData, "description"),
      sortOrder: getValue(formData, "sortOrder"),
    });
  });
}

export async function toggleDictionaryItemAction(formData: FormData) {
  return runWithRedirect(formData, "/settings/dictionaries", async (actor) => {
    await toggleDictionaryItem(actor, getValue(formData, "id"));
  });
}

export async function assignCustomerTagAction(formData: FormData) {
  return runWithRedirect(formData, "/customers", async (actor) => {
    await assignCustomerTag(actor, {
      customerId: getValue(formData, "customerId"),
      tagId: getValue(formData, "tagId"),
    });
  });
}

export async function removeCustomerTagAction(formData: FormData) {
  return runWithRedirect(formData, "/customers", async (actor) => {
    await removeCustomerTag(actor, {
      customerId: getValue(formData, "customerId"),
      tagId: getValue(formData, "tagId"),
    });
  });
}

export async function assignLeadTagAction(formData: FormData) {
  return runWithRedirect(formData, "/leads", async (actor) => {
    await assignLeadTag(actor, {
      leadId: getValue(formData, "leadId"),
      tagId: getValue(formData, "tagId"),
    });
  });
}

export async function removeLeadTagAction(formData: FormData) {
  return runWithRedirect(formData, "/leads", async (actor) => {
    await removeLeadTag(actor, {
      leadId: getValue(formData, "leadId"),
      tagId: getValue(formData, "tagId"),
    });
  });
}
