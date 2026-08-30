## Why

会员计费后端已完成（会员卡、双池积分、收银台），但营销首页没有任何价格展示，付费能力对访客不可见；同时首页「创作流程」交互区块效果不及预期、记录区块数字排版偏挤，需要一并整理。借此把首页从纯功能介绍升级为带定价转化的落地页。

## What Changes

- 删除首页「创作流程」区块（`#flow`：大标题 + FeatureFlow 三步交互演示），并移除仅被该区块使用的组件、CSS 动画与 e2e 断言；导航「创作」锚点一并移除。
- 「创作记录」区块的四个数据点（7 个 / 1 积分 / 5 个 / 3 个）整体右移，数字列固定宽度，标签垂直对齐。
- 新增「价格」区块（`#pricing`）：免费、标准、Pro 三张静态价格卡，数据读取 `lib/billing/plans.ts` 单一数据源；年付提示「省 17%」；免费卡 CTA 按登录态指向注册/生成页，付费卡 CTA 指向 `/upgrade`（未登录先经登录并回流 `/upgrade`）。
- 顶部导航新增「价格」锚点链接，指向 `#pricing`。
- 购买交互（月付/年付切换、支付渠道、下单）保持只在 `/upgrade` 页，不进入落地页。

## Capabilities

### New Capabilities

- `landing-page`: 营销首页的区块结构与导航锚点（无创作流程区块）、创作记录数据点排版、定价展示与购买入口路由。

### Modified Capabilities

（无 —— `membership` / `billing` 的购买行为不变，本次只在落地页新增展示与入口。）

## Impact

- `components/landing-page.tsx`：删 `#flow` 区块、`FeatureFlow`/`FlowSign`，新增 `#pricing` 区块与导航「价格」链接，调整 `#records` 数据点布局。
- `app/globals.css`：清理仅被 FeatureFlow 使用的 `flow-*` 动画类；保留智能体预览仍在用的 `flow-caret`。
- `e2e/smoke.spec.ts`：删除 `#flow` 导航锚点断言与风格切换交互测试，新增「价格」锚点与价格区块存在性断言。
- 复用 `lib/billing/plans.ts` 与 `lib/billing/money.ts`（只读，无改动）。
- 不涉及 API、数据库、支付链路变更。
