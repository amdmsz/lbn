/**
 * F08 phase 2: 客户列表 cursor 分页编解码
 *
 * `lib/customers/queries.ts` 的 `getCustomerCenterData` 主路径仍走
 * `CUSTOMER_CENTER_LIST_HARD_CAP = 1500` 全表加载 + 内存过滤 (依赖
 * 整套 stateMap / queueCounts 派生数据). 本模块提供 cursor 分页编解
 * 码, 用于新增的 `listCustomersCursor`; UI 迁移 (PaginationButtons)
 * 留作单独 PR, 上线后再切流.
 *
 * cursor 排序键固定为 `[updatedAt desc, id desc]`, 与
 * `cust_owner_updated_id_idx` 复合索引一致, 不在调用方暴露排序参数,
 * 避免与全表路径产生分歧.
 */
export type CustomerListCursor = {
  /** 上一页最后一条 customer.updatedAt 的 ISO 字符串. */
  updatedAt: string;
  /** 上一页最后一条 customer.id, 用于 updatedAt 相等时的 tie-breaker. */
  id: string;
};

const CURSOR_SEARCH_PARAM = "cursor" as const;

/**
 * cursor 携带的字段是 server 派生 + 自描述, 用 base64url JSON 即可,
 * 不需要签名 (即便伪造也只是跳过分页条目, 不绕权限).
 */
export function encodeCursor(cursor: CustomerListCursor): string {
  const payload = JSON.stringify({
    u: cursor.updatedAt,
    i: cursor.id,
  });
  return Buffer.from(payload, "utf8").toString("base64url");
}

export function decodeCursor(value: string | null | undefined): CustomerListCursor | null {
  if (!value) {
    return null;
  }

  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as { u?: unknown; i?: unknown };
    if (typeof parsed?.u !== "string" || typeof parsed?.i !== "string") {
      return null;
    }
    // 校验 updatedAt 是合法 ISO 时间, 防止下游 prisma 拿到 invalid Date
    const ts = Date.parse(parsed.u);
    if (Number.isNaN(ts)) {
      return null;
    }
    return { updatedAt: parsed.u, id: parsed.i };
  } catch {
    return null;
  }
}

/**
 * 从 Next.js Route searchParams 取 cursor (兼容 string | string[] | undefined).
 */
export function readCursorFromSearchParams(
  searchParams: Record<string, string | string[] | undefined> | URLSearchParams | undefined,
): CustomerListCursor | null {
  if (!searchParams) {
    return null;
  }

  let raw: string | undefined;
  if (searchParams instanceof URLSearchParams) {
    raw = searchParams.get(CURSOR_SEARCH_PARAM) ?? undefined;
  } else {
    const value = searchParams[CURSOR_SEARCH_PARAM];
    raw = Array.isArray(value) ? value[0] : value;
  }
  return decodeCursor(raw);
}

/**
 * 把 cursor 拼到现有 URL: 复用 pathname + 已有 query, 仅替换 `cursor=`.
 * 传入 `null` 表示回到第一页, 会移除 cursor 参数.
 */
export function buildCursorHref(
  basePath: string,
  baseSearchParams: URLSearchParams | Record<string, string | string[] | undefined> | undefined,
  nextCursor: CustomerListCursor | null,
): string {
  const params = new URLSearchParams();

  if (baseSearchParams instanceof URLSearchParams) {
    baseSearchParams.forEach((value, key) => {
      if (key === CURSOR_SEARCH_PARAM) return;
      params.append(key, value);
    });
  } else if (baseSearchParams) {
    for (const [key, value] of Object.entries(baseSearchParams)) {
      if (key === CURSOR_SEARCH_PARAM) continue;
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        value.forEach((item) => params.append(key, item));
      } else {
        params.append(key, value);
      }
    }
  }

  if (nextCursor) {
    params.set(CURSOR_SEARCH_PARAM, encodeCursor(nextCursor));
  }

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export const CUSTOMER_LIST_CURSOR_PARAM = CURSOR_SEARCH_PARAM;
