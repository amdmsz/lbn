import assert from "node:assert/strict";
import test from "node:test";

import csvModule from "../../lib/shipping/export-csv.ts";
import snapshotsModule from "../../lib/shipping/export-snapshots.ts";

const { buildShippingExportCsvContent } = csvModule;
const { buildShippingTaskProductExportSnapshots } = snapshotsModule;

test("shipping export freezes one CSV row per product with its own quantity", () => {
  const rows = buildShippingTaskProductExportSnapshots({
    codAmount: "1280.00",
    insuranceRequired: true,
    insuranceAmount: "5000.00",
    salesOrderRemark: "周五前发货",
    tradeOrderRemark: "周五前发货",
    shippingTaskRemark: null,
    items: [
      {
        id: "item_1",
        exportDisplayNameSnapshot: "五粮液组合",
        productNameSnapshot: "五粮液",
        skuNameSnapshot: "浓香500ML*6（2箱）+生肖纪念金条（1盒）",
        specSnapshot: "浓香500ML*6（2箱）+生肖纪念金条（1盒）",
        qty: 3,
        remark: "金条单独包装",
      },
      {
        id: "item_2",
        exportDisplayNameSnapshot: "国窖1935",
        productNameSnapshot: "国窖",
        skuNameSnapshot: "国窖1935（1瓶）",
        specSnapshot: "国窖1935（1瓶）",
        qty: 3,
        remark: null,
      },
    ],
  });

  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((row) => [row.productSummarySnapshot, row.pieceCountSnapshot]),
    [
      ["浓香500ML*6（2箱）+生肖纪念金条（1盒）", 3],
      ["国窖1935（1瓶）", 3],
    ],
  );
  assert.equal(rows[0]?.codAmountSnapshot, "1280.00");
  assert.equal(rows[1]?.codAmountSnapshot, "0");
  assert.equal(rows[0]?.insuranceRequiredSnapshot, true);
  assert.equal(rows[1]?.insuranceRequiredSnapshot, false);
  assert.equal(
    rows[0]?.remarkSnapshot,
    "商品备注：金条单独包装；订单备注：周五前发货",
  );
  assert.equal(rows[1]?.remarkSnapshot, "订单备注：周五前发货");
});

test("shipping CSV writes separate product rows and includes remarks", () => {
  const content = buildShippingExportCsvContent([
    {
      receiverName: "张三",
      receiverPhone: "13800000000",
      receiverAddress: "测试地址",
      productName: "浓香500ML*6（2箱）+生肖纪念金条（1盒）",
      qty: 3,
      codAmount: "1280.00",
      insuranceRequired: true,
      insuranceAmount: "5000.00",
      remark: "商品备注：金条单独包装；订单备注：周五前发货",
    },
    {
      receiverName: "张三",
      receiverPhone: "13800000000",
      receiverAddress: "测试地址",
      productName: "国窖1935（1瓶）",
      qty: 3,
      codAmount: "0",
      insuranceRequired: false,
      insuranceAmount: "0",
      remark: "订单备注：周五前发货",
    },
  ]);

  const lines = content.slice(1).split("\n");
  assert.equal(lines.length, 3);
  assert.equal(
    lines[0],
    "姓名,号码,地址,品名,件数,代收金额,是否保价,保价金额,备注",
  );
  assert.match(lines[1] ?? "", /浓香500ML\*6（2箱）\+生肖纪念金条（1盒）,3/);
  assert.match(lines[2] ?? "", /国窖1935（1瓶）,3,0,否,0,订单备注：周五前发货$/);
});
