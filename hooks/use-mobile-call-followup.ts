"use client";

import { useEffect, useState } from "react";
import {
  clearPendingMobileCallFollowUp,
  markPendingMobileCallBackgrounded,
  markPendingMobileCallPrompted,
  mergePendingMobileCallWithNativeSnapshot,
  readPendingMobileCallFollowUp,
  shouldEnableMobileCallFollowUp,
  snoozePendingMobileCallFollowUp,
  writePendingMobileCallFollowUp,
  type PendingMobileCallFollowUp,
} from "@/lib/calls/mobile-call-followup";
import {
  readNativeCallSessionSnapshot,
  retryNativePendingUploads,
  subscribeNativeCallSessionUpdates,
  type NativeCallSessionSnapshot,
} from "@/lib/calls/native-mobile-call";

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
      syncNativeSnapshot(storedPendingCall);

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

    function applyNativeSnapshot(snapshot: NativeCallSessionSnapshot) {
      const latestPendingCall = readPendingMobileCallFollowUp();

      if (
        !latestPendingCall ||
        !latestPendingCall.callRecordId ||
        latestPendingCall.callRecordId !== snapshot.callRecordId ||
        !matchesCurrentScope(latestPendingCall)
      ) {
        return null;
      }

      const nextPendingCall = mergePendingMobileCallWithNativeSnapshot(
        latestPendingCall,
        snapshot,
      );

      writePendingMobileCallFollowUp(nextPendingCall);
      setPendingCall(nextPendingCall);

      return nextPendingCall;
    }

    function syncNativeSnapshot(storedPendingCall: PendingMobileCallFollowUp) {
      if (!storedPendingCall.callRecordId) {
        return;
      }

      void readNativeCallSessionSnapshot(storedPendingCall.callRecordId).then(
        (snapshot) => {
          if (!snapshot || snapshot.callRecordId !== storedPendingCall.callRecordId) {
            return;
          }

          const syncedPendingCall = applyNativeSnapshot(snapshot);

          if (!syncedPendingCall || syncedPendingCall.id !== storedPendingCall.id) {
            return;
          }
        },
      );
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
      void retryNativePendingUploads();
      syncPendingCall();
    }

    function handleOnline() {
      void retryNativePendingUploads();
      syncPendingCall();
    }

    void retryNativePendingUploads();
    syncPendingCall();
    const unsubscribeNativeSessionUpdates =
      subscribeNativeCallSessionUpdates(applyNativeSnapshot);

    window.addEventListener("focus", handlePageRestore);
    window.addEventListener("pageshow", handlePageRestore);
    window.addEventListener("online", handleOnline);
    window.addEventListener("storage", handlePageRestore);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      unsubscribeNativeSessionUpdates();
      window.removeEventListener("focus", handlePageRestore);
      window.removeEventListener("pageshow", handlePageRestore);
      window.removeEventListener("online", handleOnline);
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
