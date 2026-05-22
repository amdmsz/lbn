import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readRepoFile(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("native recorder starts local-phone calls with speakerphone fallback", () => {
  const source = readRepoFile("lib/calls/native-mobile-call.ts");

  assert.match(source, /forceSpeakerphone:\s*shouldForceSpeakerphoneForNativeRecorder\(\)/);
});

test("android native recorder defaults speakerphone fallback on", () => {
  const source = readRepoFile(
    "apps/mobile/android/app/src/main/java/com/lbn/crm/LbnCallRecorderPlugin.java",
  );

  assert.match(source, /getBoolean\("forceSpeakerphone",\s*true\)/);
});

test("android media recorder prefers voice communication audio source", () => {
  const source = readRepoFile(
    "apps/mobile/android/app/src/main/java/com/lbn/crm/CallRecordingService.java",
  );
  const fallbackOrder = source.match(
    /int\[\]\s+audioSources\s*=\s*new int\[\]\s*\{(?<body>[\s\S]*?)\};/,
  );

  assert.ok(fallbackOrder?.groups?.body);
  assert.match(fallbackOrder.groups.body, /VOICE_COMMUNICATION[\s\S]*MIC[\s\S]*DEFAULT/);
  assert.doesNotMatch(fallbackOrder.groups.body, /VOICE_RECOGNITION/);
});

test("mobile dial flow preflights recorder permissions before starting the call", () => {
  const source = readRepoFile("components/mobile/mobile-app-shell.tsx");

  assert.match(source, /refreshNativeRecorderReadiness\(\)/);
  assert.match(source, /initializeNativeRecorderPermissions\(\)/);
  assert.match(source, /本机录音需要授权/);
});
