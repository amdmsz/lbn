import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "mariadb://test:test@127.0.0.1:3306/test";

const { CustomerGrade } = await import("@prisma/client");
const { parseCustomerCenterFilters } = await import(
  "../../lib/customers/queries.ts"
);

test("grades=E（拒加）可从客户中心 URL 正常解析", () => {
  const parsed = parseCustomerCenterFilters({ grades: "E" });

  assert.deepEqual(parsed.grades, [CustomerGrade.E]);
});

test("客户中心 URL 支持全部 CustomerGrade 枚举值", () => {
  const allGrades = Object.values(CustomerGrade);
  const parsed = parseCustomerCenterFilters({ grades: allGrades });

  assert.deepEqual(parsed.grades, allGrades);
});

test("单数 grade 兼容参数同样支持 E，非法值继续被忽略", () => {
  const parsed = parseCustomerCenterFilters({
    grade: ["E", "invalid-grade"],
  });

  assert.deepEqual(parsed.grades, [CustomerGrade.E]);
});
