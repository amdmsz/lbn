export type MobileCallTriggerSource = "card" | "detail" | "table";

export type PendingMobileCallFollowUp = {
  id: string;
  correlationId: string;
  customerId: string;
  customerName: string;
  phone: string;
  triggerSource: MobileCallTriggerSource;
  callRecordId: string | null;
  deviceId: string | null;
  durationSeconds: number | null;
  recordingStatus: string | null;
  uploadStatus: string | null;
  recordingId: string | null;
  nativeFailureMessage: string | null;
  createdAt: string;
  returnPath: string;
  backgroundedAt: string | null;
  promptedAt: string | null;
  snoozedAt: string | null;
};

export type NativeCallSessionSnapshotLike = {
  callRecordId?: string;
  recordingStatus?: string;
  uploadStatus?: string;
  recordingId?: string | null;
  failureMessage?: string | null;
  durationSeconds?: number;
};

export function mergePendingMobileCallWithNativeSnapshot(
  pendingCall: PendingMobileCallFollowUp,
  snapshot: NativeCallSessionSnapshotLike,
) {
  if (
    !pendingCall.callRecordId ||
    !snapshot.callRecordId ||
    pendingCall.callRecordId !== snapshot.callRecordId
  ) {
    return pendingCall;
  }

  return {
    ...pendingCall,
    durationSeconds:
      typeof snapshot.durationSeconds === "number"
        ? snapshot.durationSeconds
        : pendingCall.durationSeconds,
    recordingStatus: snapshot.recordingStatus ?? pendingCall.recordingStatus,
    uploadStatus: snapshot.uploadStatus ?? pendingCall.uploadStatus,
    recordingId: snapshot.recordingId ?? pendingCall.recordingId,
    nativeFailureMessage:
      snapshot.failureMessage ?? pendingCall.nativeFailureMessage,
  } satisfies PendingMobileCallFollowUp;
}
