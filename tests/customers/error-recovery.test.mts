import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const { shouldHardReloadCustomerPageError } = await import(
  "../../lib/customers/error-recovery.ts"
);

test("发布后旧 Server Action 错误会触发完整刷新", () => {
  assert.equal(
    shouldHardReloadCustomerPageError(
      new Error(
        'Failed to find Server Action "old-action-id". This request might be from an older or newer deployment.',
      ),
    ),
    true,
  );
});

test("production 脱敏后的 Server Component 错误仍会触发一次完整刷新", () => {
  assert.equal(
    shouldHardReloadCustomerPageError(
      new Error(
        "An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details.",
      ),
    ),
    true,
  );
});

test("普通客户查询错误不会被误判为部署资源失配", () => {
  assert.equal(
    shouldHardReloadCustomerPageError(
      new Error("Unable to reach database server at 127.0.0.1:3306"),
    ),
    false,
  );
});

test("客户中心错误页的手动重试始终执行 hard reload", async () => {
  const source = await readFile(
    new URL("../../app/(dashboard)/customers/error.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /onClick=\{\(\) => window\.location\.reload\(\)\}/);
  assert.doesNotMatch(source, /\breset\(\)/);
});
