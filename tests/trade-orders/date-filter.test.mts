import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import dateFiltersModule from "../../lib/trade-orders/date-filters.ts";

const {
  formatTradeOrderDateTimeRangeLabel,
  normalizeTradeOrderDateTimeInput,
  parseTradeOrderDateTimeInput,
} = dateFiltersModule;

function readRepoFile(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("trade-order date helper accepts datetime-local values and rejects invalid input", () => {
  assert.ok(parseTradeOrderDateTimeInput("2026-05-15T09:25"));
  assert.equal(parseTradeOrderDateTimeInput(""), null);
  assert.equal(parseTradeOrderDateTimeInput("not-a-date"), null);
  assert.equal(normalizeTradeOrderDateTimeInput("2026-05-15T09:25"), "2026-05-15T09:25");
  assert.equal(normalizeTradeOrderDateTimeInput("2026-05-15T09:25:31"), "2026-05-15T09:25");
  assert.equal(normalizeTradeOrderDateTimeInput("not-a-date"), "");
});

test("trade-order date range label formats the active filter summary", () => {
  const formatDateTime = (date: Date) => {
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(
      date.getDate(),
    )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  assert.equal(
    formatTradeOrderDateTimeRangeLabel("", "", formatDateTime),
    "全部下单时间",
  );
  assert.equal(
    formatTradeOrderDateTimeRangeLabel("2026-05-15T09:25", "", formatDateTime),
    "自 2026/05/15 09:25",
  );
  assert.equal(
    formatTradeOrderDateTimeRangeLabel(
      "2026-05-15T09:25",
      "2026-05-15T10:30",
      formatDateTime,
    ),
    "2026/05/15 09:25 - 2026/05/15 10:30",
  );
});

test("trade-orders page wires date filters through schema, query and url builder", () => {
  const querySource = readRepoFile("lib/trade-orders/queries.ts");
  const uiSource = readRepoFile("components/trade-orders/trade-orders-section.tsx");
  const navigationSource = readRepoFile("lib/fulfillment/navigation.ts");

  assert.match(querySource, /createdFrom:\s*z\.string\(\)\.trim\(\)\.default\(""\)\.transform\(normalizeTradeOrderDateTimeInput\)/);
  assert.match(querySource, /createdTo:\s*z\.string\(\)\.trim\(\)\.default\(""\)\.transform\(normalizeTradeOrderDateTimeInput\)/);
  assert.match(querySource, /createdAt\.gte\s*=\s*createdFrom;/);
  assert.match(querySource, /createdToEnd\.setSeconds\(59,\s*999\);/);
  assert.match(querySource, /createdAt\.lte\s*=\s*createdToEnd;/);

  assert.match(uiSource, /\["createdFrom",\s*next\.createdFrom\]/);
  assert.match(uiSource, /\["createdTo",\s*next\.createdTo\]/);
  assert.match(uiSource, /name="createdFrom"/);
  assert.match(uiSource, /name="createdTo"/);

  assert.match(navigationSource, /createdFrom\?: string;/);
  assert.match(navigationSource, /createdTo\?: string;/);
});
