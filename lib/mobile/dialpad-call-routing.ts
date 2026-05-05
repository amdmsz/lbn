export type MobileCallMode = "local-phone";

export type MobileDialpadCallAction =
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

  if (!input.hasMatchedCustomer) {
    return {
      kind: "blocked",
      reason: "请选择客户或输入已匹配客户号码，录音上传需要客户关联。",
    };
  }

  return {
    kind: "local-phone",
  };
}
