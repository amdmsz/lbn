"use client";

import type { CallResultOption } from "@/lib/calls/metadata";
import {
  canUseNativeCallRecorder,
  startNativeRecordedSimCall,
} from "@/lib/calls/native-mobile-call";
import type {
  MobileCallTriggerSource,
  PendingMobileCallFollowUp,
} from "@/lib/calls/mobile-call-followup-contract";
export {
  mergePendingMobileCallWithNativeSnapshot,
  type MobileCallTriggerSource,
  type PendingMobileCallFollowUp,
} from "@/lib/calls/mobile-call-followup-contract";

export const MOBILE_CALL_FOLLOWUP_STORAGE_KEY =
  "lbncrm.mobile-call-followup.pending";

export const MOBILE_CALL_CONNECTED_RESULT_CODES = [
  "HUNG_UP",
  "CONNECTED_NO_TALK",
  "INTERESTED",
  "WECHAT_PENDING",
  "WECHAT_ADDED",
  "REFUSED_WECHAT",
  "NEED_CALLBACK",
  "REFUSED_TO_BUY",
  "BLACKLIST",
] as const;

export const MOBILE_CALL_NOT_CONNECTED_RESULT_CODES = [
  "NOT_CONNECTED",
  "INVALID_NUMBER",
] as const;

export type MobileCallConnectedState = "UNKNOWN" | "CONNECTED" | "NOT_CONNECTED";
export type MobileCallWechatState = "NONE" | "PENDING" | "ADDED" | "REFUSED";

const connectedResultCodeSet = new Set<string>(MOBILE_CALL_CONNECTED_RESULT_CODES);
const notConnectedResultCodeSet = new Set<string>(
  MOBILE_CALL_NOT_CONNECTED_RESULT_CODES,
);

const wechatResultCodeMap: Record<
  Exclude<MobileCallWechatState, "NONE">,
  string
> = {
  PENDING: "WECHAT_PENDING",
  ADDED: "WECHAT_ADDED",
  REFUSED: "REFUSED_WECHAT",
};

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isOptionalNumber(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}

function parsePendingMobileCallFollowUp(rawValue: string | null) {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<PendingMobileCallFollowUp>;

    if (
      !parsed ||
      !isNonEmptyString(parsed.id) ||
      !isNonEmptyString(parsed.customerId) ||
      !isNonEmptyString(parsed.customerName) ||
      !isNonEmptyString(parsed.phone) ||
      !isNonEmptyString(parsed.triggerSource) ||
      !isNonEmptyString(parsed.createdAt) ||
      !isNonEmptyString(parsed.returnPath) ||
      !isOptionalString(parsed.callRecordId ?? null) ||
      !isOptionalString(parsed.deviceId ?? null) ||
      !isOptionalNumber(parsed.durationSeconds ?? null) ||
      !isOptionalString(parsed.recordingStatus ?? null) ||
      !isOptionalString(parsed.uploadStatus ?? null) ||
      !isOptionalString(parsed.recordingId ?? null) ||
      !isOptionalString(parsed.nativeFailureMessage ?? null) ||
      !isOptionalString(parsed.backgroundedAt) ||
      !isOptionalString(parsed.promptedAt) ||
      !isOptionalString(parsed.snoozedAt)
    ) {
      return null;
    }

    if (
      parsed.triggerSource !== "card" &&
      parsed.triggerSource !== "detail" &&
      parsed.triggerSource !== "table"
    ) {
      return null;
    }

    return {
      id: parsed.id,
      customerId: parsed.customerId,
      customerName: parsed.customerName,
      phone: parsed.phone,
      triggerSource: parsed.triggerSource,
      callRecordId: parsed.callRecordId ?? null,
      deviceId: parsed.deviceId ?? null,
      durationSeconds: parsed.durationSeconds ?? null,
      recordingStatus: parsed.recordingStatus ?? null,
      uploadStatus: parsed.uploadStatus ?? null,
      recordingId: parsed.recordingId ?? null,
      nativeFailureMessage: parsed.nativeFailureMessage ?? null,
      createdAt: parsed.createdAt,
      returnPath: parsed.returnPath,
      backgroundedAt: parsed.backgroundedAt,
      promptedAt: parsed.promptedAt,
      snoozedAt: parsed.snoozedAt,
    } satisfies PendingMobileCallFollowUp;
  } catch {
    return null;
  }
}

function generatePendingMobileCallId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getCurrentPathname() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.location.pathname;
}

export function shouldEnableMobileCallFollowUp() {
  if (typeof window === "undefined") {
    return false;
  }

  const narrowViewport =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 959px)").matches
      : false;
  const userAgent = window.navigator.userAgent || "";
  const mobileAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    userAgent,
  );
  const hasTouch = window.navigator.maxTouchPoints > 0;

  return narrowViewport || (mobileAgent && hasTouch);
}

export function readPendingMobileCallFollowUp() {
  if (!canUseLocalStorage()) {
    return null;
  }

  return parsePendingMobileCallFollowUp(
    window.localStorage.getItem(MOBILE_CALL_FOLLOWUP_STORAGE_KEY),
  );
}

export function writePendingMobileCallFollowUp(
  pendingCall: PendingMobileCallFollowUp,
) {
  if (!canUseLocalStorage()) {
    return;
  }

  window.localStorage.setItem(
    MOBILE_CALL_FOLLOWUP_STORAGE_KEY,
    JSON.stringify(pendingCall),
  );
}

export function clearPendingMobileCallFollowUp() {
  if (!canUseLocalStorage()) {
    return;
  }

  window.localStorage.removeItem(MOBILE_CALL_FOLLOWUP_STORAGE_KEY);
}

export function markPendingMobileCallBackgrounded() {
  const pendingCall = readPendingMobileCallFollowUp();

  if (!pendingCall || pendingCall.backgroundedAt) {
    return pendingCall;
  }

  const nextPendingCall = {
    ...pendingCall,
    backgroundedAt: new Date().toISOString(),
  } satisfies PendingMobileCallFollowUp;

  writePendingMobileCallFollowUp(nextPendingCall);
  return nextPendingCall;
}

export function markPendingMobileCallPrompted() {
  const pendingCall = readPendingMobileCallFollowUp();

  if (!pendingCall || pendingCall.promptedAt) {
    return pendingCall;
  }

  const nextPendingCall = {
    ...pendingCall,
    promptedAt: new Date().toISOString(),
    snoozedAt: null,
  } satisfies PendingMobileCallFollowUp;

  writePendingMobileCallFollowUp(nextPendingCall);
  return nextPendingCall;
}

export function snoozePendingMobileCallFollowUp() {
  const pendingCall = readPendingMobileCallFollowUp();

  if (!pendingCall) {
    return null;
  }

  const nextPendingCall = {
    ...pendingCall,
    snoozedAt: new Date().toISOString(),
  } satisfies PendingMobileCallFollowUp;

  writePendingMobileCallFollowUp(nextPendingCall);
  return nextPendingCall;
}

export function startMobileCallFollowUpDial(input: {
  customerId: string;
  customerName: string;
  phone: string;
  triggerSource: MobileCallTriggerSource;
}) {
  if (typeof window === "undefined") {
    return;
  }

  const phone = input.phone.trim();

  if (!phone) {
    return;
  }

  const basePendingCall = {
    id: generatePendingMobileCallId(),
    customerId: input.customerId,
    customerName: input.customerName.trim() || input.phone,
    phone,
    triggerSource: input.triggerSource,
    callRecordId: null,
    deviceId: null,
    durationSeconds: null,
    recordingStatus: null,
    uploadStatus: null,
    recordingId: null,
    nativeFailureMessage: null,
    createdAt: new Date().toISOString(),
    returnPath: getCurrentPathname(),
    backgroundedAt: null,
    promptedAt: null,
    snoozedAt: null,
  } satisfies PendingMobileCallFollowUp;

  if (!canUseNativeCallRecorder()) {
    if (shouldEnableMobileCallFollowUp()) {
      writePendingMobileCallFollowUp(basePendingCall);
    }

    window.location.href = `tel:${phone}`;
    return;
  }

  void (async () => {
    const nativeCall = await startNativeRecordedSimCall({
      customerId: input.customerId,
      customerName: input.customerName,
      phone,
    });

    if (shouldEnableMobileCallFollowUp()) {
      writePendingMobileCallFollowUp({
        ...basePendingCall,
        phone: nativeCall.phone ?? phone,
        callRecordId: nativeCall.callRecordId ?? null,
        deviceId: nativeCall.deviceId ?? null,
        recordingStatus: nativeCall.nativeStarted ? "STARTED" : "FAILED",
        uploadStatus: nativeCall.nativeStarted ? "PENDING" : null,
        nativeFailureMessage: nativeCall.errorMessage ?? null,
      });
    }

    if (!nativeCall.nativeStarted) {
      window.location.href = `tel:${phone}`;
    }
  })();
}

export function inferConnectedStateFromResultCode(
  resultCode: string,
): MobileCallConnectedState {
  if (connectedResultCodeSet.has(resultCode)) {
    return "CONNECTED";
  }

  if (notConnectedResultCodeSet.has(resultCode)) {
    return "NOT_CONNECTED";
  }

  return "UNKNOWN";
}

export function inferWechatStateFromResultCode(
  resultCode: string,
): MobileCallWechatState {
  switch (resultCode) {
    case "WECHAT_PENDING":
      return "PENDING";
    case "WECHAT_ADDED":
      return "ADDED";
    case "REFUSED_WECHAT":
      return "REFUSED";
    default:
      return "NONE";
  }
}

export function filterMobileCallResultOptions(
  resultOptions: CallResultOption[],
  connectedState: MobileCallConnectedState,
  wechatState: MobileCallWechatState,
) {
  let filteredOptions = resultOptions;

  if (connectedState === "CONNECTED") {
    filteredOptions = filteredOptions.filter(
      (option) => !notConnectedResultCodeSet.has(option.value),
    );
  }

  if (connectedState === "NOT_CONNECTED") {
    filteredOptions = filteredOptions.filter((option) =>
      notConnectedResultCodeSet.has(option.value),
    );
  }

  if (wechatState !== "NONE") {
    const wechatResultCode = wechatResultCodeMap[wechatState];
    const matchedWechatOption = filteredOptions.find(
      (option) => option.value === wechatResultCode,
    );

    if (matchedWechatOption) {
      return [matchedWechatOption];
    }
  }

  return filteredOptions;
}

export function getSuggestedMobileCallResultCode(
  resultOptions: CallResultOption[],
  connectedState: MobileCallConnectedState,
  wechatState: MobileCallWechatState,
  currentResultCode?: string,
) {
  const filteredOptions = filterMobileCallResultOptions(
    resultOptions,
    connectedState,
    wechatState,
  );

  if (
    currentResultCode &&
    filteredOptions.some((option) => option.value === currentResultCode)
  ) {
    return currentResultCode;
  }

  if (wechatState !== "NONE") {
    const wechatResultCode = wechatResultCodeMap[wechatState];
    if (filteredOptions.some((option) => option.value === wechatResultCode)) {
      return wechatResultCode;
    }
  }

  if (connectedState === "NOT_CONNECTED") {
    return (
      filteredOptions.find((option) => option.value === "NOT_CONNECTED")?.value ??
      filteredOptions.find((option) => option.value === "INVALID_NUMBER")?.value ??
      null
    );
  }

  if (connectedState === "CONNECTED") {
    for (const preferredCode of MOBILE_CALL_CONNECTED_RESULT_CODES) {
      const matchedOption = filteredOptions.find(
        (option) => option.value === preferredCode,
      );

      if (matchedOption) {
        return matchedOption.value;
      }
    }
  }

  return filteredOptions[0]?.value ?? null;
}
