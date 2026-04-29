import type { LogisticsTraceCheckpoint } from "@/lib/logistics/provider";

export type LogisticsAddressMatchStatus = "MATCH" | "MISMATCH" | "UNKNOWN";

export type LogisticsRegionTokens = {
  province: string | null;
  city: string | null;
  district: string | null;
};

export type LogisticsAddressMatchResult = {
  status: LogisticsAddressMatchStatus;
  reason: string;
  receiverRegion: LogisticsRegionTokens;
  traceRegion: LogisticsRegionTokens | null;
  evidence: string | null;
};

const DESTINATION_STATUS_CODES = new Set(["SIGN", "SIGNED", "DISPATCH", "DELIVERING"]);

const DESTINATION_KEYWORDS = [
  "签收",
  "派送",
  "派件",
  "投递",
  "送达",
  "代收",
  "驿站",
  "自提柜",
];

function normalizeAddressText(value?: string | null) {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/[\s,，.。;；:：、|/\\()[\]{}<>《》"'“”‘’-]/g, "")
    .trim();
}

function trimRegionSuffix(value?: string | null) {
  return normalizeAddressText(value)
    .replace(/特别行政区$/, "")
    .replace(/自治区$/, "")
    .replace(/自治州$/, "")
    .replace(/地区$/, "")
    .replace(/[省市区县旗盟]$/, "");
}

export function extractLogisticsRegionTokens(value?: string | null): LogisticsRegionTokens {
  const text = normalizeAddressText(value);
  if (!text) {
    return { province: null, city: null, district: null };
  }

  const province = text.match(/([\u4e00-\u9fa5]{2,}?(?:省|自治区|特别行政区))/)?.[1] ?? null;
  let remainder = province ? text.slice(text.indexOf(province) + province.length) : text;

  const municipality = remainder.match(/(北京|上海|天津|重庆)市?/)?.[1] ?? null;
  const city = municipality
    ? `${municipality}市`
    : remainder.match(/([\u4e00-\u9fa5]{2,}?(?:市|自治州|地区|盟))/)?.[1] ?? null;

  if (city) {
    remainder = remainder.slice(remainder.indexOf(city) + city.length);
  }

  const district = remainder.match(/([\u4e00-\u9fa5]{2,}?(?:区|县|旗|市))/)?.[1] ?? null;

  return { province, city, district };
}

function compareRegionTokens(
  receiverRegion: LogisticsRegionTokens,
  traceRegion: LogisticsRegionTokens,
) {
  const receiverCity = trimRegionSuffix(receiverRegion.city);
  const traceCity = trimRegionSuffix(traceRegion.city);

  if (receiverCity && traceCity) {
    return receiverCity === traceCity ? "MATCH" : "MISMATCH";
  }

  const receiverProvince = trimRegionSuffix(receiverRegion.province);
  const traceProvince = trimRegionSuffix(traceRegion.province);

  if (receiverProvince && traceProvince) {
    return receiverProvince === traceProvince ? "MATCH" : "MISMATCH";
  }

  return "UNKNOWN";
}

function buildTraceEvidence(checkpoint: LogisticsTraceCheckpoint) {
  return [checkpoint.areaName, checkpoint.description].filter(Boolean).join(" / ");
}

function isDestinationCheckpoint(checkpoint: LogisticsTraceCheckpoint) {
  const statusCode = checkpoint.statusCode?.trim().toUpperCase();
  if (statusCode && DESTINATION_STATUS_CODES.has(statusCode)) {
    return true;
  }

  const text = normalizeAddressText(`${checkpoint.areaName ?? ""}${checkpoint.description}`);
  return DESTINATION_KEYWORDS.some((keyword) => text.includes(keyword));
}

export function evaluateLogisticsAddressMatch(input: {
  receiverAddress?: string | null;
  latestEvent?: LogisticsTraceCheckpoint | null;
  checkpoints?: LogisticsTraceCheckpoint[];
}): LogisticsAddressMatchResult {
  const receiverRegion = extractLogisticsRegionTokens(input.receiverAddress);

  if (!receiverRegion.city && !receiverRegion.province) {
    return {
      status: "UNKNOWN",
      reason: "收货地址缺少可比对的省市信息。",
      receiverRegion,
      traceRegion: null,
      evidence: null,
    };
  }

  const checkpoints = [
    input.latestEvent,
    ...(input.checkpoints ?? []),
  ].filter((checkpoint): checkpoint is LogisticsTraceCheckpoint => Boolean(checkpoint));

  const destinationCheckpoints = checkpoints.filter(isDestinationCheckpoint);

  for (const checkpoint of destinationCheckpoints) {
    const evidence = buildTraceEvidence(checkpoint);
    const traceRegion = extractLogisticsRegionTokens(evidence);
    const comparison = compareRegionTokens(receiverRegion, traceRegion);

    if (comparison === "MISMATCH") {
      return {
        status: "MISMATCH",
        reason: "物流目的地节点与收货地址省市不一致。",
        receiverRegion,
        traceRegion,
        evidence,
      };
    }

    if (comparison === "MATCH") {
      return {
        status: "MATCH",
        reason: "物流目的地节点与收货地址省市一致。",
        receiverRegion,
        traceRegion,
        evidence,
      };
    }
  }

  return {
    status: "UNKNOWN",
    reason: "物流轨迹暂未出现可安全比对的派送或签收目的地节点。",
    receiverRegion,
    traceRegion: null,
    evidence: null,
  };
}
