# Mobile App Shell 拆分计划

更新时间: 2026-06-06
对应文件: `components/mobile/mobile-app-shell.tsx` (4240 行, 68 个 function)

## 1. 为什么要拆

`mobile-app-shell.tsx` 是当前仓库**最大的单文件**。它把移动端 webview 的:

- 工具函数(日期/电话/货币/存储)
- 数据建模(API 适配/合并)
- React 子组件(Header/IconBubble/MessageRow 等)
- 4 个 tab 主面板(Messages / Customers / Search / Dialpad / Apps / Me)
- Drawer (CustomerDetailDrawer / ConnectionSettingsDrawer)
- 主 Shell 组件 (MobileAppShell, 顶层导出)

**全部塞进一个文件**, 导致:

- 单文件 4240 行, IDE 编辑/搜索体验差
- 6+ 个 tab 的状态都在 MobileAppShell 内, 难以独立调试
- 任何小改动都要在巨型文件里定位
- 移动端 hex 颜色 (193 处) 想做主题化时找不到边界
- 阶段三/十二在 dashboard 端做的"按职责拆分"方法没办法套用

## 2. 当前函数清单(68 个)

按位置分组:

### 2.1 工具函数 (line 205-1037, 约 30 个)

**日期/时间**:
- `toDate` (205)
- `parseMobileApiDate` (214)
- `formatNullableRelativeDate` (219)
- `formatPhoneCallTime` (683)
- `getStartOfDay` (712)
- `isDateToday` (716)
- `isDateInPhoneTimeFilter` (724)

**电话/货币/格式化**:
- `normalizeDialValue` (224)
- `formatDialDisplayNumber` (228)
- `splitDialMatchedDisplay` (262)
- `normalizeSearchValue` (295)
- `formatMoney` (299)
- `isMaskedPhone` (311)
- `formatCurrencyAmount` (347)
- `formatCallDuration` (357)
- `formatMobileDetailCallLabel` (368)

**客户照片本地存储**:
- `getCustomerPhotoStorageKey` (315)
- `readStoredCustomerPhoto` (319)
- `readImageFileAsDataUrl` (331)

**API 数据建模**:
- `createMobileApiCustomerListItem` (423)
- `mergeMobileApiCustomerItems` (501)
- `getCustomerPrimaryProduct` (518)
- `getCustomerDialProductSignal` (527)
- `getCustomerAssignmentLabel` (552)
- `getRecentDialFromRecords` (561)
- `getPhoneLocationLabel` (750)
- `getContactAddressLabel` (754)
- `getCustomerDetailAddressLabel` (762)

**电话历史**:
- `getCallModeLabel` (636)
- `getPhoneResultLabel` (640)
- `getPhoneResultFilterKey` (658)
- `buildRecentPhoneHistoryEntry` (778)
- `buildPhoneHistoryEntries` (823)

**最近拨号本地状态**:
- `readRecentDialCustomer` (865)
- `writeRecentDialCustomer` (908)
- `createRecentDialCustomer` (919)

**导航工具**:
- `getNavigationIcon` (934)
- `getModuleFromNavigationItem` (958)
- `findDialCustomer` (991)
- `filterDialCustomers` (1006)
- `updateBrowserTabParam` (1028)

### 2.2 React 子组件 (line 1039-3611, 约 30 个)

**顶部/通用**:
- `MobileHeader` (1039)
- `IconBubble` (1063)
- `MessageRow` (1091)

**Messages tab**:
- `MessagesTab` (1122)

**Phone/Dial 相关**:
- `PhoneHistoryRow` (1298)
- `PhoneFallbackCallRow` (1348)
- `PhoneTodayPanel` (1391)
- `PhoneAvatar` (1468)
- `PhoneCircleCallButton` (1507)
- `PhonePageHeader` (1529)

**类型检查**:
- `isCustomerExecutionClassValue` (1549)
- `normalizeExecutionClasses` (1553)

**主要 Tab**:
- `CustomersTab` (1557, 约 220 行)
- `SearchTab` (1776, 约 90 行)
- `DialpadTab` (1868, 约 200 行)

**Apps tab + 子组件**:
- `AppTile` (2066)
- `AppSection` (2087)
- `OrderCustomerMiniRow` (2102)
- `AppsTab` (2138, 约 250 行)

**Connection / Me / Drawer**:
- `ConnectionSettingsDrawer` (2391, 约 120 行)
- `NativeRecorderCard` (2514, 约 110 行)
- `MeTab` (2627, 约 210 行)
- `CustomerDetailDrawer` (2840, 约 545 行) ← **最大子组件**

**核心导航 + Shell**:
- `MobileModulePanel` (3386)
- `BottomNav` (3560)
- `getInitialTab` (3612)
- `MobileAppShell` (3616, 顶层 export, 主组件)

## 3. 建议的目标目录结构

```
components/mobile/
├── shell/
│   ├── mobile-app-shell.tsx           主壳 (3616+, 约 600 行)
│   ├── bottom-nav.tsx                 BottomNav + getInitialTab + getModuleFromNavigationItem
│   ├── mobile-header.tsx              MobileHeader
│   └── mobile-module-panel.tsx        MobileModulePanel
├── tabs/
│   ├── messages-tab.tsx               MessagesTab + MessageRow + IconBubble
│   ├── customers-tab.tsx              CustomersTab + 类型检查 helper
│   ├── search-tab.tsx                 SearchTab
│   ├── dialpad-tab.tsx                DialpadTab + 所有 Phone* 子组件
│   ├── apps-tab.tsx                   AppsTab + AppTile + AppSection + OrderCustomerMiniRow
│   └── me-tab.tsx                     MeTab + NativeRecorderCard
├── drawers/
│   ├── customer-detail-drawer.tsx     CustomerDetailDrawer (545 行核心)
│   └── connection-settings-drawer.tsx ConnectionSettingsDrawer
├── mobile-order-composer.tsx          (已存在, 不动)
└── lib/
    ├── format.ts                      日期/电话/货币 格式化函数 (~17 个)
    ├── customer-modeling.ts           API 数据建模/合并 (~10 个)
    ├── phone-history.ts               PhoneHistoryEntry 构建/状态判断
    ├── photo-storage.ts               客户照片本地存储 + 文件读取
    └── recent-dial.ts                 最近拨号本地状态
```

预期效果:
- `mobile-app-shell.tsx` 4240 → 600 行 (-85%)
- 6 个 tab 各自成文件, 单独 git blame 容易
- helper 按职责分类, 测试好写
- 后续主题化 / 视觉收紧针对 tab 文件做, 不动 shell

## 4. 推荐拆分顺序(风险升序)

### 阶段 1: 抽 helper 函数 (低风险)

完成下列 5 个 `lib/*.ts` 文件:

1. `lib/format.ts`: 17 个纯格式化函数 (toDate/normalizeDialValue/formatMoney 等)
2. `lib/customer-modeling.ts`: 10 个 API 适配函数 (createMobileApiCustomerListItem 等)
3. `lib/phone-history.ts`: 6 个电话历史相关函数 (buildPhoneHistoryEntries 等)
4. `lib/photo-storage.ts`: 3 个本地存储函数
5. `lib/recent-dial.ts`: 3 个最近拨号函数

主文件改动:
- 删除函数定义
- 改为 import
- 预期 -1000 行

验证: lint + build + 移动端 smoke (登录 / 拨号 / 客户列表)

### 阶段 2: 抽 Drawer (中风险)

1. `drawers/customer-detail-drawer.tsx`: 545 行的 CustomerDetailDrawer
   - 内部用了大量 helper, 抽前应先确认 helper 已经 export
2. `drawers/connection-settings-drawer.tsx`: ConnectionSettingsDrawer

主文件预期再 -700 行

验证: 客户详情 drawer 能打开 / 关闭 / 录音 / 加客户照片

### 阶段 3: 抽 Tab 主面板 (中风险)

按使用频率从低到高拆:
- me-tab (含 NativeRecorderCard)
- apps-tab (含 AppTile/AppSection/OrderCustomerMiniRow)
- search-tab
- messages-tab (含 MessageRow/IconBubble)
- dialpad-tab (含所有 Phone* 子组件)
- customers-tab

每抽一个跑一次 build, 风险逐个验证.

### 阶段 4: 抽 Shell 子件 (低风险, 最后做)

- shell/mobile-header.tsx
- shell/bottom-nav.tsx
- shell/mobile-module-panel.tsx

mobile-app-shell.tsx 最终保留:
- MobileAppShell 主组件 (顶层 state / effect / 路由协调)
- 顶层 import
- 各 tab 调用

## 5. 共享 state 接口设计

MobileAppShell 内有大量 useState/useReducer 横跨多个 tab. 拆 tab 时要把这些 state 通过 props 显式传递, 或者:

**推荐方案**: 用 React Context 管理"全 shell 共享"的 state:
- `MobileAppStateContext`: 当前 tab、客户列表、拨号 buffer 等
- `MobileAppActionsContext`: setTab、refreshCustomers、startCall 等

Provider 在 MobileAppShell 顶层包裹, 各 tab 用 useContext 取. 避免每个 tab 都接 30+ props.

## 6. 验收标准

每个阶段拆完都要:

- [ ] prisma validate (不动 schema 也跑一次确认环境)
- [ ] lint (0 warning)
- [ ] build 通过
- [ ] 移动端登录 (`http://192.168.11.101:3000/mobile/login`)
- [ ] 拨号 + 接听冒烟
- [ ] 客户详情 drawer 打开/关闭
- [ ] 客户照片上传/读取
- [ ] 录音相关功能 (NativeRecorderCard)
- [ ] 上面任一失败立即 git revert 该阶段提交

## 7. 不建议立刻做的部分

- **mobile 端 hex 颜色 (193 处) 主题化**: 移动端是独立 iOS 风格设计, 故意跟 dashboard 不同, 不该强行 tokenize. 留到产品决定移动端要不要支持 dark mode 时再做.

## 8. 备注

- 移动端 webview 上线后是用户日常工具, 任何 regression 都会立刻被销售反馈. 拆分必须**每阶段独立 commit + 独立 deploy + 独立验证**, 不能合并多个阶段一次推上去.
- 拆分过程中如果发现某个 helper 实际只在一个 tab 用, 就放进那个 tab 文件而不是 lib/, 避免假抽象.
