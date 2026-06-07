// F17 wave-2 cache-tag 改造 phase 1 part 1.
//
// 背景: discover 报告显示 revalidatePath 已成为全站 mutation 后的默认动作,
// 每次写入都会让命中率本来就低的大表 cache miss. Next.js 13+ 提供 revalidateTag
// 模式: 写端 revalidateTag(tag), 读端 unstable_cache(fn, key, { tags }).
//
// 这一波只暴露 tag 常量并迁移最热 5 类 mutation (customers: 创建/更新/删除/移交;
// orders: 创建/审核/撤单/退款). 其余 revalidatePath (dashboard / reports /
// fulfillment 等聚合页) 暂保留, 后续 phase 再切.
//
// 用法:
//   import { revalidateTag } from "next/cache";
//   import { CACHE_TAGS } from "@/lib/cache-tags";
//   revalidateTag(CACHE_TAGS.customerList);
//   revalidateTag(CACHE_TAGS.customer(customerId));
//
//   import { unstable_cache } from "next/cache";
//   const cached = unstable_cache(fn, [CACHE_TAGS.customerList], {
//     tags: [CACHE_TAGS.customerList],
//   });

export const CACHE_TAGS = {
  customer: (id: string) => `customer:${id}`,
  customerList: "customer:list",
  tradeOrder: (id: string) => `trade-order:${id}`,
  tradeOrderList: "trade-order:list",
  payment: (id: string) => `payment:${id}`,
  paymentList: "payment:list",
  refund: (id: string) => `refund:${id}`,
  refundList: "refund:list",
} as const;

export type CacheTagKey = keyof typeof CACHE_TAGS;
