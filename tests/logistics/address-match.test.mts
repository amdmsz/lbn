import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateLogisticsAddressMatch,
  extractLogisticsRegionTokens,
} from "../../lib/logistics/address-match.ts";

test("extractLogisticsRegionTokens extracts province, city and district", () => {
  assert.deepEqual(extractLogisticsRegionTokens("广东省深圳市南山区科技园"), {
    province: "广东省",
    city: "深圳市",
    district: "南山区",
  });

  assert.deepEqual(extractLogisticsRegionTokens("上海市浦东新区世纪大道"), {
    province: null,
    city: "上海市",
    district: "浦东新区",
  });
});

test("evaluateLogisticsAddressMatch flags high-confidence delivery city mismatch", () => {
  const result = evaluateLogisticsAddressMatch({
    receiverAddress: "北京市朝阳区建国路 88 号",
    latestEvent: {
      id: "latest",
      areaName: "上海市浦东新区",
      description: "快件已由本人签收",
      occurredAt: "2026-04-29T10:00:00.000Z",
      statusCode: "SIGN",
      subStatusCode: null,
    },
    checkpoints: [],
  });

  assert.equal(result.status, "MISMATCH");
});

test("evaluateLogisticsAddressMatch does not flag non-destination transit nodes", () => {
  const result = evaluateLogisticsAddressMatch({
    receiverAddress: "北京市朝阳区建国路 88 号",
    latestEvent: {
      id: "latest",
      areaName: "上海市浦东新区转运中心",
      description: "快件已到达转运中心",
      occurredAt: "2026-04-29T10:00:00.000Z",
      statusCode: "TRANSPORT",
      subStatusCode: null,
    },
    checkpoints: [],
  });

  assert.equal(result.status, "UNKNOWN");
});

test("evaluateLogisticsAddressMatch confirms matching delivery city", () => {
  const result = evaluateLogisticsAddressMatch({
    receiverAddress: "广东省深圳市南山区科技园",
    latestEvent: {
      id: "latest",
      areaName: "深圳市南山区",
      description: "快件正在派送",
      occurredAt: "2026-04-29T10:00:00.000Z",
      statusCode: "DISPATCH",
      subStatusCode: null,
    },
    checkpoints: [],
  });

  assert.equal(result.status, "MATCH");
});
