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

test("信息流名单表头 (姓名/电话/地址/产品/日期/金额) 全列自动映射", () => {
  const result = buildFixedLeadImportMapping([
    "姓名",
    "电话",
    "地址",
    "产品",
    "日期",
    "金额",
  ]);

  assert.deepEqual(result.missingHeaders, []);
  assert.equal(result.mapping.phone, "电话");
  assert.equal(result.mapping.name, "姓名");
  assert.equal(result.mapping.address, "地址");
  assert.equal(result.mapping.interestedProduct, "产品");
  assert.equal(result.mapping.interestedAt, "日期");
  assert.equal(result.mapping.interestedAmount, "金额");
});
