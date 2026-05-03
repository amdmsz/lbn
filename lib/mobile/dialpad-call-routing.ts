export type MobileCallMode = "crm-outbound" | "local-phone";

export type MobileDialpadCallAction =
  | {
      kind: "crm-outbound";
    }
  | {
      kind: "local-phone";
    }
  | {
      kind: "blocked";
      reason: string;
    };

export function resolveMobileDialpadCallAction(input: {
  callMode: MobileCallMode;
  normalizedNumber: string;
  hasMatchedCustomer: boolean;
  canCreateCallRecord: boolean;
}): MobileDialpadCallAction {
  if (!input.normalizedNumber) {
    return {
      kind: "blocked",
      reason: "请先输入号码。",
    };
  }

  if (!input.canCreateCallRecord) {
    return {
      kind: "blocked",
      reason: "当前账号暂不支持通话。",
    };
  }

  if (input.callMode === "crm-outbound" && !input.hasMatchedCustomer) {
    return {
      kind: "blocked",
      reason: "外呼仅支持已匹配客户号码。",
    };
  }

  return {
    kind: input.callMode === "crm-outbound" ? "crm-outbound" : "local-phone",
  };
}
