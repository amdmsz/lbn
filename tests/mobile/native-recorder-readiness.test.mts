import assert from "node:assert/strict";
import test from "node:test";
import { summarizeNativeRecorderReadiness } from "../../lib/calls/native-mobile-call.ts";

test("native recorder readiness falls back outside Android shell", () => {
  const readiness = summarizeNativeRecorderReadiness({ nativeAvailable: false });

  assert.equal(readiness.status, "browser-fallback");
  assert.equal(readiness.nativeAvailable, false);
});

test("native recorder readiness reports supported device as ready", () => {
  const readiness = summarizeNativeRecorderReadiness({
    nativeAvailable: true,
    profile: {
      deviceModel: "Xiaomi 14",
      androidVersion: "15 (SDK 35)",
      appVersion: "0.1.1",
      recordingCapability: "SUPPORTED",
    },
  });

  assert.equal(readiness.status, "ready");
  assert.equal(readiness.detail, "Xiaomi 14 · 15 (SDK 35) · App 0.1.1");
});

test("native recorder readiness surfaces denied permissions as blocked", () => {
  const readiness = summarizeNativeRecorderReadiness({
    nativeAvailable: true,
    permissions: {
      callRecording: "denied",
    },
  });

  assert.equal(readiness.status, "blocked");
});

test("native recorder readiness requests setup for prompt permissions", () => {
  const readiness = summarizeNativeRecorderReadiness({
    nativeAvailable: true,
    permissions: {
      callRecording: "prompt-with-rationale",
    },
  });

  assert.equal(readiness.status, "needs-permission");
});
