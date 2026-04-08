"use client";

import { useEffect, useState } from "react";
import {
  clearPendingMobileCallFollowUp,
  markPendingMobileCallBackgrounded,
  markPendingMobileCallPrompted,
  readPendingMobileCallFollowUp,
  shouldEnableMobileCallFollowUp,
  snoozePendingMobileCallFollowUp,
  type PendingMobileCallFollowUp,
} from "@/lib/calls/mobile-call-followup";

export type MobileCallFollowUpScope =
  | {
      kind: "list";
      customerIds: string[];
    }
  | {
      kind: "detail";
      customerId: string;
    };

function shouldPromptOnResume(pendingCall: PendingMobileCallFollowUp) {
  const createdAt = new Date(pendingCall.createdAt).getTime();
  const ageMs = Number.isNaN(createdAt) ? 0 : Date.now() - createdAt;

  return Boolean(pendingCall.backgroundedAt) || ageMs >= 1200;
}

export function useMobileCallFollowUp(scope: MobileCallFollowUpScope) {
  const [pendingCall, setPendingCall] = useState<PendingMobileCallFollowUp | null>(
    null,
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const detailCustomerId = scope.kind === "detail" ? scope.customerId : null;
  const listCustomerIdsKey =
    scope.kind === "list" ? scope.customerIds.join(",") : "";

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const currentListCustomerIds = listCustomerIdsKey
      ? listCustomerIdsKey.split(",").filter(Boolean)
      : [];

    function matchesCurrentScope(pendingCall: PendingMobileCallFollowUp) {
      if (pendingCall.returnPath !== window.location.pathname) {
        return false;
      }

      if (scope.kind === "detail") {
        return Boolean(detailCustomerId) && pendingCall.customerId === detailCustomerId;
      }

      return currentListCustomerIds.includes(pendingCall.customerId);
    }

    function syncPendingCall() {
      if (!shouldEnableMobileCallFollowUp()) {
        setPendingCall(null);
        setSheetOpen(false);
        return;
      }

      const storedPendingCall = readPendingMobileCallFollowUp();

      if (!storedPendingCall || !matchesCurrentScope(storedPendingCall)) {
        setPendingCall(null);
        setSheetOpen(false);
        return;
      }

      setPendingCall(storedPendingCall);

      if (
        storedPendingCall.promptedAt ||
        storedPendingCall.snoozedAt ||
        !shouldPromptOnResume(storedPendingCall)
      ) {
        return;
      }

      const promptedPendingCall = markPendingMobileCallPrompted();
      setPendingCall(promptedPendingCall ?? storedPendingCall);
      setSheetOpen(true);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        const storedPendingCall = readPendingMobileCallFollowUp();

        if (storedPendingCall && matchesCurrentScope(storedPendingCall)) {
          setPendingCall(markPendingMobileCallBackgrounded() ?? storedPendingCall);
        }

        return;
      }

      syncPendingCall();
    }

    function handlePageRestore() {
      syncPendingCall();
    }

    syncPendingCall();

    window.addEventListener("focus", handlePageRestore);
    window.addEventListener("pageshow", handlePageRestore);
    window.addEventListener("storage", handlePageRestore);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handlePageRestore);
      window.removeEventListener("pageshow", handlePageRestore);
      window.removeEventListener("storage", handlePageRestore);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [scope.kind, detailCustomerId, listCustomerIdsKey]);

  function openSheet() {
    if (!pendingCall) {
      return;
    }

    setSheetOpen(true);
  }

  function dismissPendingCall() {
    clearPendingMobileCallFollowUp();
    setPendingCall(null);
    setSheetOpen(false);
  }

  function snoozePendingCall() {
    const nextPendingCall = snoozePendingMobileCallFollowUp();

    setPendingCall(nextPendingCall);
    setSheetOpen(false);
  }

  function completePendingCall() {
    clearPendingMobileCallFollowUp();
    setPendingCall(null);
    setSheetOpen(false);
  }

  const showManualResumeEntry =
    Boolean(pendingCall) &&
    !sheetOpen &&
    Boolean(pendingCall?.promptedAt || pendingCall?.snoozedAt);

  return {
    pendingCall,
    sheetOpen,
    showManualResumeEntry,
    openSheet,
    dismissPendingCall,
    snoozePendingCall,
    completePendingCall,
  };
}
