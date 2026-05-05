import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFixedLeadImportMapping,
  leadImportTemplateHeaders,
} from "../../lib/lead-imports/metadata.ts";

test("线索导入固定模板包含备注列", () => {
  assert.equal(leadImportTemplateHeaders.includes("备注"), true);
});

test("固定模板映射会识别备注列", () => {
  const result = buildFixedLeadImportMapping(["手机号", "姓名", "地址", "备注"]);

  assert.deepEqual(result.missingHeaders, []);
  assert.equal(result.mapping.remark, "备注");
});
