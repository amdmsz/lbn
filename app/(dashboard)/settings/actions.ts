"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import {
  buildRedirectTarget,
  getRedirectPathname,
  rethrowRedirectError,
  sanitizeRedirectTarget,
} from "@/lib/action-notice";
import { auth } from "@/lib/auth/session";
import {
  requireSystemSettingDefinition,
  type SystemSettingNamespace,
} from "@/lib/system-settings/schema";
import { upsertSystemSetting } from "@/lib/system-settings/mutations";

function getValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getNullableValue(formData: FormData, key: string) {
  const value = getValue(formData, key);
  return value ? value : null;
}

function getCheckboxValue(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function getStringList(formData: FormData, key: string) {
  return getValue(formData, key)
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildRoleMapping(formData: FormData) {
  return {
    speaker_0: getValue(formData, "speaker0Role") || "SALES",
    speaker_1: getValue(formData, "speaker1Role") || "CUSTOMER",
  };
}

function buildSettingValue(namespace: SystemSettingNamespace, formData: FormData) {
  switch (namespace) {
    case "site.profile":
      return {
        systemName: getValue(formData, "systemName"),
        companyName: getNullableValue(formData, "companyName"),
        loginNotice: getNullableValue(formData, "loginNotice"),
        supportContact: getNullableValue(formData, "supportContact"),
        logoPath: getNullableValue(formData, "logoPath"),
        faviconPath: getNullableValue(formData, "faviconPath"),
        defaultTimezone: getValue(formData, "defaultTimezone"),
        dateTimeFormat: getValue(formData, "dateTimeFormat"),
      };
    case "security.auth":
      return {
        passwordMinLength: getValue(formData, "passwordMinLength"),
        requireMixedCase: getCheckboxValue(formData, "requireMixedCase"),
        requireNumber: getCheckboxValue(formData, "requireNumber"),
        requireSymbol: getCheckboxValue(formData, "requireSymbol"),
        forcePasswordChangeOnInvite: getCheckboxValue(
          formData,
          "forcePasswordChangeOnInvite",
        ),
        sessionMaxAgeHours: getValue(formData, "sessionMaxAgeHours"),
        idleTimeoutMinutes: getNullableValue(formData, "idleTimeoutMinutes"),
        loginRateLimitPerMinute: getValue(formData, "loginRateLimitPerMinute"),
      };
    case "recording.storage":
      return {
        provider: getValue(formData, "provider"),
        storageDir: getValue(formData, "storageDir"),
        uploadTmpDir: getValue(formData, "uploadTmpDir"),
        bucket: getNullableValue(formData, "bucket"),
        publicBaseUrl: getNullableValue(formData, "publicBaseUrl"),
        retentionDays: getValue(formData, "retentionDays"),
        playbackCacheEnabled: getCheckboxValue(formData, "playbackCacheEnabled"),
        playbackCacheDir: getNullableValue(formData, "playbackCacheDir"),
      };
    case "recording.upload":
      return {
        maxFileMb: getValue(formData, "maxFileMb"),
        chunkSizeMb: getValue(formData, "chunkSizeMb"),
        uploadExpiresMinutes: getValue(formData, "uploadExpiresMinutes"),
        allowedMimeTypes: getStringList(formData, "allowedMimeTypes"),
        requireSha256: getCheckboxValue(formData, "requireSha256"),
      };
    case "call_ai.asr":
      return {
        provider: getValue(formData, "provider"),
        endpoint: getNullableValue(formData, "endpoint"),
        model: getValue(formData, "model"),
        timeoutMs: getValue(formData, "timeoutMs"),
        maxFileMb: getValue(formData, "maxFileMb"),
        language: getNullableValue(formData, "language"),
        publicAudioBaseUrl: getNullableValue(formData, "publicAudioBaseUrl"),
        enableDiarization: getCheckboxValue(formData, "enableDiarization"),
      };
    case "call_ai.llm":
      return {
        provider: getValue(formData, "provider"),
        baseUrl: getNullableValue(formData, "baseUrl"),
        model: getValue(formData, "model"),
        temperature: getValue(formData, "temperature"),
        maxOutputTokens: getValue(formData, "maxOutputTokens"),
        timeoutMs: getValue(formData, "timeoutMs"),
        strictJsonOutput: getCheckboxValue(formData, "strictJsonOutput"),
      };
    case "call_ai.diarization":
      return {
        enabled: getCheckboxValue(formData, "enabled"),
        provider: getValue(formData, "provider"),
        roleMapping: buildRoleMapping(formData),
        fallbackRoleInference: getCheckboxValue(formData, "fallbackRoleInference"),
        unknownSpeakerLabel: getValue(formData, "unknownSpeakerLabel"),
        minSegmentTextLength: getValue(formData, "minSegmentTextLength"),
      };
    case "runtime.worker":
      return {
        leadImportWorkerRequired: getCheckboxValue(
          formData,
          "leadImportWorkerRequired",
        ),
        callAiWorkerEnabled: getCheckboxValue(formData, "callAiWorkerEnabled"),
        callAiWorkerConcurrency: getValue(formData, "callAiWorkerConcurrency"),
        callAiRetryLimit: getValue(formData, "callAiRetryLimit"),
        queueHealthCheckEnabled: getCheckboxValue(
          formData,
          "queueHealthCheckEnabled",
        ),
      };
    default:
      throw new Error("暂不支持该系统配置。");
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? "系统配置保存失败。";
  }

  return error instanceof Error ? error.message : "系统配置保存失败。";
}

export async function saveSystemSettingAction(formData: FormData) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const redirectTo = sanitizeRedirectTarget(
    getValue(formData, "redirectTo"),
    "/settings",
  );

  try {
    const namespace = getValue(formData, "namespace") as SystemSettingNamespace;
    const key = getValue(formData, "key") || "active";
    const definition = requireSystemSettingDefinition(namespace, key);
    const secretPlaintext = getValue(formData, "secretPlaintext");

    await upsertSystemSetting(session.user.id, {
      namespace,
      key,
      valueJson: buildSettingValue(namespace, formData),
      secretPlaintext: secretPlaintext || undefined,
      clearSecret: getCheckboxValue(formData, "clearSecret"),
      description: definition.description,
      changeReason: getNullableValue(formData, "changeReason"),
    });

    revalidatePath("/settings");
    revalidatePath(getRedirectPathname(redirectTo));
    redirect(buildRedirectTarget(redirectTo, "success", `${definition.title}已保存。`));
  } catch (error) {
    rethrowRedirectError(error);
    redirect(buildRedirectTarget(redirectTo, "error", getErrorMessage(error)));
  }
}
