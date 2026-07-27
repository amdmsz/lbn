import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ExcelJS from "exceljs";
import { canExportCustomers } from "../../lib/auth/access.ts";
import type { CustomerExportItem } from "../../lib/customers/export.ts";

process.env.DATABASE_URL ??= "mysql://root:password@127.0.0.1:3306/liquor_crm";

const customersExportNamespace = await import("../../lib/customers/export.ts");
const customersExportModule = (
  customersExportNamespace.default ??
  (customersExportNamespace as Record<string, unknown>)["module.exports"] ??
  customersExportNamespace
) as typeof import("../../lib/customers/export.ts");
const { buildCustomersExportXlsx } = customersExportModule;

function buildExportItem(): CustomerExportItem {
  return {
    id: "customer_export_1",
    name: "张三",
    phone: "13877070319",
    wechatId: "wx_zhangsan",
    remark: "仅内部跟进备注",
    status: "ACTIVE",
    grade: "E",
    callCount: 6,
    province: "河南省",
    city: "南阳市",
    district: "卧龙区",
    address: "测试路 1 号",
    ownerId: null,
    createdAt: new Date("2026-07-01T08:00:00.000Z"),
    owner: null,
    _count: { tradeOrders: 0 },
    ownershipEvents: [],
    leads: [],
    callRecords: [],
    wechatRecords: [],
    liveInvitations: [],
    tradeOrders: [],
    assignedAt: null,
    orderTotals: {
      finalAmount: 0,
      paidAmount: 0,
      remainingAmount: 0,
    },
  } as CustomerExportItem;
}

test("customer XLSX retains business fields and masks the middle phone digits", async () => {
  const buffer = await buildCustomersExportXlsx([buildExportItem()], {
    title: "已选客户导出",
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.getWorksheet("客户对账明细");
  assert.ok(worksheet);
  assert.equal(worksheet.getCell("A1").text, "已选客户导出");

  const headerValues = worksheet.getRow(4).values as Array<string | undefined>;
  const valueByHeader = new Map(
    headerValues.flatMap((header, columnIndex) =>
      header ? [[header, worksheet.getCell(5, columnIndex).text] as const] : [],
    ),
  );

  assert.equal(valueByHeader.get("电话"), "138****0319");
  assert.equal(valueByHeader.get("客户分类"), "E · 拒加");
  assert.equal(valueByHeader.get("客户状态"), "活跃");
  assert.equal(valueByHeader.get("微信号"), "wx_zhangsan");
  assert.equal(valueByHeader.get("累计拨打"), "6");
  assert.equal(valueByHeader.get("客户备注"), "仅内部跟进备注");

  for (const currentWorksheet of workbook.worksheets) {
    currentWorksheet.eachRow((row) => {
      for (const cell of row.values as Array<unknown>) {
        assert.doesNotMatch(String(cell ?? ""), /13877070319/);
      }
    });
  }
});

test("selected customer export keeps role, visibility and audit guards server-side", async () => {
  assert.equal(canExportCustomers("ADMIN"), true);
  assert.equal(canExportCustomers("SUPERVISOR"), true);
  assert.equal(canExportCustomers("SALES"), false);
  assert.equal(canExportCustomers("OPS"), false);
  assert.equal(canExportCustomers("SHIPPER"), false);

  const routeSource = await readFile(
    new URL("../../app/(dashboard)/customers/export/selected/route.ts", import.meta.url),
    "utf8",
  );
  const exportSource = await readFile(
    new URL("../../lib/customers/export.ts", import.meta.url),
    "utf8",
  );

  assert.match(routeSource, /canExportCustomers\(session\.user\.role\)/);
  assert.match(routeSource, /customer\.selected_export/);
  assert.match(routeSource, /phoneMasking: "middle_four"/);
  assert.match(exportSource, /listVisibleCustomerCenterCustomerIds/);
  assert.match(exportSource, /listFilteredCustomerCenterCustomerIds/);
  assert.match(exportSource, /MAX_BATCH_CUSTOMER_ACTION_SIZE/);
});
