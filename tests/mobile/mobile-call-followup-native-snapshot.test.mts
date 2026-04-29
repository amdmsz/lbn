import assert from "node:assert/strict";
import test from "node:test";
import {
  mergePendingMobileCallWithNativeSnapshot,
  type PendingMobileCallFollowUp,
} from "../../lib/calls/mobile-call-followup-contract.ts";

const basePendingCall = {
  id: "pending-1",
  customerId: "customer-1",
  customerName: "张三",
  phone: "13812341234",
  triggerSource: "detail",
  callRecordId: "call-1",
  deviceId: "device-1",
  durationSeconds: null,
  recordingStatus: "STARTED",
  uploadStatus: "PENDING",
  recordingId: null,
  nativeFailureMessage: null,
  createdAt: "2026-04-30T10:00:00.000Z",
  returnPath: "/mobile",
  backgroundedAt: null,
  promptedAt: null,
  snoozedAt: null,
} satisfies PendingMobileCallFollowUp;

test("native snapshot merge updates recording and upload fields", () => {
  const merged = mergePendingMobileCallWithNativeSnapshot(basePendingCall, {
    callRecordId: "call-1",
    durationSeconds: 86,
    recordingStatus: "UPLOADED",
    uploadStatus: "READY",
    recordingId: "recording-1",
    failureMessage: null,
  });

  assert.equal(merged.durationSeconds, 86);
  assert.equal(merged.recordingStatus, "UPLOADED");
  assert.equal(merged.uploadStatus, "READY");
  assert.equal(merged.recordingId, "recording-1");
});

test("native snapshot merge keeps pending call for unrelated call record", () => {
  const merged = mergePendingMobileCallWithNativeSnapshot(basePendingCall, {
    callRecordId: "call-2",
    recordingStatus: "FAILED",
    failureMessage: "权限被拒绝",
  });

  assert.deepEqual(merged, basePendingCall);
});

test("native snapshot merge captures failure message", () => {
  const merged = mergePendingMobileCallWithNativeSnapshot(basePendingCall, {
    callRecordId: "call-1",
    recordingStatus: "FAILED",
    uploadStatus: "FAILED",
    failureMessage: "录音文件为空",
  });

  assert.equal(merged.recordingStatus, "FAILED");
  assert.equal(merged.uploadStatus, "FAILED");
  assert.equal(merged.nativeFailureMessage, "录音文件为空");
});
