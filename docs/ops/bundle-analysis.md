# Bundle 分析报告 (2026-06-07)

## 1. 背景与方法

本次审计在不引入新依赖 (无 `@next/bundle-analyzer`) 的前提下,
直接读 `npm run build` 产物 `.next-crm/static/chunks/` 下的原始 chunk
文件大小, 识别来源, 给出优化建议. 不修改 webpack 配置.

- 构建命令: `npm run build` (= `next build --webpack`)
- `next.config.ts` 中 `distDir: ".next-crm"`, 所以产物在 `.next-crm/`, 不是默认的 `.next/`
- 产物总大小 (含所有 page chunk): `.next-crm/static/chunks` = **3.4 MB**
- 路由 (app router) chunk: `.next-crm/static/chunks/app` = **1.4 MB**
  - 桌面端 `(dashboard)`: 1.2 MB
  - mobile 子树 `mobile`: 109 KB

## 2. 共享 chunk Top 8 (跨路由复用, 几乎每个页面都要加载)

| 排名 | 文件名 | 大小 (B) | 大小 (KB) | 实际承载内容 (首行特征确认) |
| ---- | ----- | -------- | --------- | --------------------------- |
| 1 | `2170a4aa-166af4fffa6270d8.js` | 318,953 | **311 KB** | **xlsx 库** (Uint8Array / Deno 嗅探, `cellStyles`, `sheetStubs` 关键字) |
| 2 | `2361.70c8f5097642d43e.js` | 268,359 | **262 KB** | **sip.js** (`Ack`, `Bye`, `Cancel`, `Invitation`, `Inviter`, `Messager`, `NameAddr`) |
| 3 | `3794-123fdf632563f469.js` | 221,957 | **217 KB** | **Next.js client router internals** (`isJavaScriptURLString` 等) |
| 4 | `4bd1b696-e356ca5ba0218e27.js` | 199,870 | **195 KB** | **react-dom** (`react.dev/errors/`, React internals) — `rootMainFiles` |
| 5 | `framework-711ef29bc66f648c.js` | 189,700 | **185 KB** | **React framework 运行时** (Next 默认 split) |
| 6 | `main-26d2b34dccc77195.js` | 134,815 | **132 KB** | **Next main bundle** (路由 hydration 入口) |
| 7 | `polyfills-42372ed130431b0a.js` | 112,594 | **110 KB** | **Next 默认 polyfill** (URL / Object.assign / 旧浏览器兜底) |
| 8 | `8924-2c450e5c3123825c.js` | 111,231 | **109 KB** | **Next server actions runtime** (`callServer`, `createServerReference`) |

Top 8 合计 = **1.49 MB**, 占总 chunk 体积 ~43%. 其中 `xlsx`、`sip.js` 是
业务库, 其它都是 Next/React 框架基础设施.

继续往下:

| 排名 | 文件名 | 大小 | 内容 |
| ---- | ----- | ---- | ---- |
| 9 | `6414-066f191f81674361.js` | 96 KB | Next client (`callServer` 第二份) |
| 10 | `7422-3edcba25359cfec2.js` | 58 KB | **lucide-react icons** (`chevron-up`, `target` 等多图标聚合) |
| 11 | `6266-af14b7f89242c7fb.js` | 44 KB | 业务: 通话效果常量 (`NOT_CONNECTED`, `INVALID_NUMBER` 等结果分类) |
| 12 | `4513-0096437a4ab55331.js` | 35 KB | **lucide-react icons** (`target`, `tags`, 第二批) |
| 13 | `7456-087ff63c9e1088a7.js` | 32 KB | **Capacitor / mobile call recorder bridge** (`LbnCallRecorder`, 平台嗅探) |

## 3. 单路由首屏 chunk Top 12

| 排名 | 路由 | 大小 (B) | 大小 (KB) |
| ---- | ---- | -------- | --------- |
| 1 | `/customers/[id]` (客户详情) | 102,074 | **100 KB** |
| 2 | `/mobile` (mobile 主壳) | 101,232 | **99 KB** |
| 3 | `/customers` (客户中心) | 96,117 | **94 KB** |
| 4 | `/orders/[id]` (成交主单详情) | 70,542 | **69 KB** |
| 5 | `/customers/public-pool` (公海) | 62,372 | **61 KB** |
| 6 | `/products` (商品域) | 62,190 | **61 KB** |
| 7 | `/recycle-bin` (回收站) | 52,831 | **52 KB** |
| 8 | `/leads` (线索) | 50,682 | **50 KB** |
| 9 | `/(dashboard)/layout` (主框架) | 44,028 | **43 KB** |
| 10 | `/fulfillment` (履约) | 41,564 | **41 KB** |
| 11 | `/live-sessions` (直播邀约) | 26,012 | **25 KB** |
| 12 | `/lead-imports` (线索导入) | 19,794 | **19 KB** |

按区域汇总:

- `/customers` 三大客户系列 (列表 + 详情 + 公海) = ~255 KB
- `/orders` + `/fulfillment` + `/products` (交易 + 履约 + 商品) = ~173 KB
- `/mobile` 单页 = 99 KB
- `/recycle-bin` + `/leads` + `/lead-imports` (运营辅助) = ~123 KB

## 4. mobile-app-shell 拆分前后对比

(参考 commit `bba8f85 wave-1` 和 `8cc6218 mobile #5 F18 phase 1`)

拆分前: `components/mobile/mobile-app-shell.tsx` 单文件 4240 行.

拆分后当前状态:

```
3581 components/mobile/mobile-app-shell.tsx  (主壳, 缩短 659 行 = -15.5%)
 240 components/mobile/lib/customer-modeling.ts
 251 components/mobile/lib/phone-history.ts
 127 components/mobile/lib/format.ts
 118 components/mobile/lib/recent-dial.ts
  55 components/mobile/lib/photo-storage.ts
----
4372 行 (含拆出去的 5 个 helper)
```

构建产物层面: 当前 `/mobile/page-*.js = 99 KB`. 因为 mobile-app-shell
还是一个完整的 `"use client"` 组件 import 进 page, 拆 helper 到 `lib/`
**没有改变 page chunk 体积** (webpack 仍然把所有 helper 静态 import
打进 mobile chunk). 拆分的收益目前是 **可维护性** (按职能 colocate),
不是 bundle size.

要让 bundle 真正下降, 需要走 `next/dynamic` 切运行时 lazy chunk —
见 §5 优化建议.

## 5. 优化建议 (按 ROI 排序)

### S1. xlsx 不应进客户端 bundle (省 ~311 KB, 占总 9%)

证据: `2170a4aa-*.js` 是 xlsx, 但代码搜索表明 `xlsx` 只在 server-side
被引用:

- `lib/lead-imports/file-parser.ts` (worker)
- `lib/customers/export.ts` (server export)
- `app/(dashboard)/customers/export/route.ts` (server route)
- `app/(dashboard)/finance/reconciliation/export/route.ts` (server route)
- `components/lead-imports/lead-import-upload-form.tsx` (只是 `accept=".xlsx"` 字符串引用, **不是 import**)

理论上 xlsx 不应该出现在 client bundle. 它出现的可能原因:

1. 某个 `"use client"` 组件不直接 import xlsx, 但 import 了一个
   server-only 模块, 而那个模块顶层 import xlsx → webpack 不知道
   server-only 就一锅打包.
2. 一个 server action 文件 (顶层 import xlsx) 同时被 `"use client"`
   组件 import 了类型 / 常量, 触发同包.

**修复方向**:

- 给 xlsx 相关 server 文件加上 `import "server-only"` (Next.js 内置
  机制), webpack 看见就拒绝在 client 编译.
- 或检查 `lib/customers/export.ts` 是否有非 export 类型的常量被
  client 组件 import, 拆走到单独 `*.client.ts` / `*.shared.ts`.

预期产出: client bundle -311 KB, 是单项 ROI 最高的优化.

### S2. sip.js 应该 dynamic import (省 ~262 KB 对非 mobile 路由)

证据: `2361.*.js` 是 sip.js 全套 (~262 KB). sip.js 只在 mobile / 通话
SIP 软电话场景需要. 桌面端没有任何路由要 SIP, 不应该被 prefetch.

**修复方向**:

- 找到 import sip.js 的入口模块, 改用 `await import("sip.js")` 或
  `next/dynamic({ ssr: false })` 包一层.
- 必要时把 sip-related UI 包成 `<SipPanel />` 用 dynamic import, 仅在
  mobile 或拨号 UI 显式渲染时加载.

预期产出: 桌面端首屏 -262 KB. mobile 路由仍然加载, 但本来就需要.

### S3. lucide-react 多 chunk 合并 + 按需引入 (省 ~30-50 KB)

证据: `7422-*.js` 58 KB + `4513-*.js` 35 KB, 都是 lucide-react 单
图标定义 (`chevron-up`, `target`, `tags`...). 当前是按使用频率自动分包.

`package.json` 中 `"lucide-react": "^1.7.0"` (注意是 v1, 不是当前 v0.x
主流版本; v1 是 fork/重命名后版本). v1 一般支持 ESM tree-shake.

**修复方向**:

- 确认所有 lucide 引入用 `import { ChevronUp } from "lucide-react"`
  (named import), 不要用 `import * as`. 现在已经基本是 named.
- 如果发现某个 page 引入了 30+ 图标, 评估是否能换文本 / SVG sprite.
- 不要轻易引入 `@lucide-react/icons` 子包路径, lucide v1 已自动 tree-shake.

预期产出: 边际优化, 约省 10-30 KB.

### S4. customer-detail-workbench 拆 dynamic tabs (省 30-40 KB 对客户列表)

证据: `/customers/[id]` 是单路由最大 chunk (100 KB). 该 page 内部
`customer-detail-workbench.tsx` 包含多 tab (Profile / Orders / Logs).
Logs / Orders tab 内含表格 + dialog, 用户不必每次都加载.

**修复方向**:

- 把 `renderOrdersTab` / `renderLogsTab` 等分别用 `next/dynamic` 包成
  懒加载组件, 仅在 tab 激活时下载.
- 默认 active tab (Profile) 仍 SSR, 其它 tab placeholder + spinner.

预期产出: 首屏 -30-40 KB, 但 tab 切换有~100-200ms 延迟. 适合 P3-P4
做, 不在本波.

### S5. mobile-app-shell 业务路由分包 (省 30-50 KB 对 /mobile)

证据: `/mobile = 99 KB`, mobile-app-shell 仍是单文件 3581 行,
内部 switch-case 渲染 10+ 不同业务页 (拨号 / 通讯录 / 我的 / 客户...).

**修复方向**:

- Phase 2 拆分计划 (见 `8cc6218` commit 的 plan 文档) — 每个业务子页
  改为 dynamic-imported `MobilePageXxx` 组件.
- 当前 phase 1 (helper 抽到 lib/) **已完成但不影响 bundle**.

预期产出: 首屏 -30-50 KB, 取决于哪些子页 lazy.

## 6. 不建议做的事

- ✗ **不要** 引入 `@next/bundle-analyzer` 仅为这一次审计. 用 `du`/`ls`
  + chunk 前几百字节嗅探已经够用. analyzer 自身也只是包装 webpack
  visualizer, 不会发现 §5 中没列出的隐藏问题.
- ✗ **不要** 改 webpack `splitChunks` 配置覆盖默认. Next 15+ 的默认
  split 已经够好, 手改容易破坏 hash 稳定性.
- ✗ **不要** 把 lucide icons 改成 inline SVG 字符串. 维护性差且
  rerender 命中率低.

## 7. 下一步建议优先级

1. **S1 (xlsx)** — 价值最大, 实现最小. 找出 client 误引 xlsx 的链路,
   加 `"server-only"` 标记. 预期 commit ≤ 5 个文件.
2. **S2 (sip.js)** — 第二价值, 桌面端用户受益. 需找 sip.js 真正
   import 入口, 用 `next/dynamic`. 预期 commit ≤ 3 个文件.
3. **S5 (mobile phase 2)** — 已有 plan 文档. 待之前的 phase 1 验证
   稳定后开 phase 2.
4. S3 / S4 — 边际收益, 不紧急.

## 附录: 重测 SOP

下次再跑这份分析:

```powershell
# 1. 干净 build
rm -rf .next-crm
npm run build

# 2. 看 root chunk top 10
Get-ChildItem .next-crm/static/chunks -File | Sort-Object Length -Descending | Select-Object -First 10 Name, Length

# 3. 看 app route top 15
Get-ChildItem .next-crm/static/chunks/app -Recurse -File | Sort-Object Length -Descending | Select-Object -First 15 Name, Length, FullName

# 4. (可选) 用 head 前 500 字节嗅探不认识的 chunk
Get-Content -TotalCount 1 .next-crm/static/chunks/<hash>.js | Select-Object -First 500
```
