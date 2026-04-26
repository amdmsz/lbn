import assert from "node:assert/strict";
import test from "node:test";
import {
  isSystemSettingSecretSupported,
  parseSystemSettingValue,
} from "../../lib/system-settings/schema.ts";
import {
  compareSecretFingerprint,
  decryptSystemSettingSecret,
  encryptSystemSettingSecret,
  fingerprintSecret,
  maskSecret,
  maskSecretFingerprint,
} from "../../lib/system-settings/secrets.ts";

test("system setting schema 会给内网 ASR 配置补齐默认值", () => {
  const value = parseSystemSettingValue("call_ai.asr", "active", {
    provider: "LOCAL_HTTP_ASR",
  }) as {
    provider: string;
    endpoint: string | null;
    model: string;
    enableDiarization: boolean;
  };

  assert.equal(value.provider, "LOCAL_HTTP_ASR");
  assert.equal(value.endpoint, "http://127.0.0.1:8787/transcribe");
  assert.equal(value.model, "local-http-asr");
  assert.equal(value.enableDiarization, true);
  assert.equal(isSystemSettingSecretSupported("call_ai.asr", "active"), true);
});

test("LLM 配置不会接受 valueJson 里的明文 apiKey", () => {
  assert.throws(() => {
    parseSystemSettingValue("call_ai.llm", "active", {
      provider: "DEEPSEEK",
      apiKey: "sk-should-not-be-in-json",
    });
  });
});

test("system setting secret 会加密、解密、指纹和脱敏", () => {
  const originalKey = process.env.SYSTEM_SETTING_ENCRYPTION_KEY;

  try {
    delete process.env.SYSTEM_SETTING_ENCRYPTION_KEY;
    assert.throws(() => encryptSystemSettingSecret("sk-test"), /ENCRYPTION_KEY/);

    process.env.SYSTEM_SETTING_ENCRYPTION_KEY = "local-test-secret";
    const plaintext = "sk-local-secret-123456";
    const encrypted = encryptSystemSettingSecret(plaintext);
    const fingerprint = fingerprintSecret(plaintext);

    assert.notEqual(encrypted, plaintext);
    assert.equal(decryptSystemSettingSecret(encrypted), plaintext);
    assert.equal(compareSecretFingerprint(plaintext, fingerprint), true);
    assert.equal(maskSecret(plaintext), "sk-****3456");
    assert.match(maskSecretFingerprint(fingerprint) ?? "", /^[a-f0-9]{12}\.\.\.[a-f0-9]{6}$/);
  } finally {
    if (originalKey === undefined) {
      delete process.env.SYSTEM_SETTING_ENCRYPTION_KEY;
    } else {
      process.env.SYSTEM_SETTING_ENCRYPTION_KEY = originalKey;
    }
  }
});
