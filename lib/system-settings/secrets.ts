import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const ENCRYPTION_PREFIX = "v1";
const KEY_BYTES = 32;
const IV_BYTES = 12;

function readEncryptionKeyMaterial() {
  return process.env.SYSTEM_SETTING_ENCRYPTION_KEY?.trim() ?? "";
}

function decodeEncryptionKey(raw: string) {
  if (!raw) {
    return null;
  }

  const base64 = Buffer.from(raw, "base64");

  if (base64.length === KEY_BYTES && base64.toString("base64").replace(/=+$/, "") === raw.replace(/=+$/, "")) {
    return base64;
  }

  if (/^[a-f0-9]{64}$/i.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  return createHash("sha256").update(raw).digest();
}

function getEncryptionKey() {
  return decodeEncryptionKey(readEncryptionKeyMaterial());
}

export function hasSystemSettingEncryptionKey() {
  return Boolean(getEncryptionKey());
}

export function normalizeSecretInput(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function fingerprintSecret(value: string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function compareSecretFingerprint(value: string, fingerprint: string | null | undefined) {
  if (!fingerprint) {
    return false;
  }

  const actual = Buffer.from(fingerprintSecret(value));
  const expected = Buffer.from(fingerprint);

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function maskSecret(value: string | null | undefined) {
  if (!value) {
    return "未配置";
  }

  const trimmed = value.trim();

  if (trimmed.length <= 8) {
    return "********";
  }

  return `${trimmed.slice(0, 3)}****${trimmed.slice(-4)}`;
}

export function maskSecretFingerprint(fingerprint: string | null | undefined) {
  if (!fingerprint) {
    return null;
  }

  const normalized = fingerprint.replace(/^sha256:/, "");

  if (normalized.length <= 18) {
    return normalized;
  }

  return `${normalized.slice(0, 12)}...${normalized.slice(-6)}`;
}

export function encryptSystemSettingSecret(plaintext: string) {
  const key = getEncryptionKey();

  if (!key) {
    throw new Error("SYSTEM_SETTING_ENCRYPTION_KEY is required to save system setting secrets.");
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    ENCRYPTION_PREFIX,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptSystemSettingSecret(payload: string) {
  const key = getEncryptionKey();

  if (!key) {
    throw new Error("SYSTEM_SETTING_ENCRYPTION_KEY is required to read system setting secrets.");
  }

  const [version, ivBase64, tagBase64, ciphertextBase64] = payload.split(":");

  if (
    version !== ENCRYPTION_PREFIX ||
    !ivBase64 ||
    !tagBase64 ||
    !ciphertextBase64
  ) {
    throw new Error("Invalid system setting secret payload.");
  }

  const decipher = createDecipheriv(
    ENCRYPTION_ALGORITHM,
    key,
    Buffer.from(ivBase64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagBase64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextBase64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
