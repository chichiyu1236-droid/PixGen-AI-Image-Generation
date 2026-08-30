## Context

落地页集中在 `components/landing-page.tsx`（client component），区块为 hero / `#flow` / `#features` / `#agent` / `#records` / CTA，导航锚点含「创作 → #flow」。会员计划静态定义在 `lib/billing/plans.ts`（含 `YEARLY_DISCOUNT_PERCENT`），金额格式化在 `lib/billing/money.ts`（`formatFenAsCny`）。完整购买组件 `components/pricing-plans.tsx` 目前只挂在 `/upgrade`（登录墙后）。`globals.css` 中 `flow-*` 动画多数仅服务 FeatureFlow，但 `flow-caret` 被智能体聊天预览复用。`e2e/smoke.spec.ts` 有两条断言依赖 `#flow`。

## Goals / Non-Goals

**Goals:**

- 首页形成「展示价值 → 看到价格 → 去 /upgrade 成交」的转化链路
- 价格展示与计划定义单一数据源，调价零成本同步
- 删除死代码后不留无主 CSS / 组件 / 测试断言

**Non-Goals:**

- 不改 `/upgrade`、收银台、订单、积分等任何计费行为（见 membership / billing specs）
- 不做落地页内嵌下单、月付/年付切换、支付渠道选择
- 不改其他页面的导航与布局

## Decisions

- **静态价格卡，不复用 `PricingPlans`**：落地页只做价格曝光，成交留在 `/upgrade`。理由：匿名访客直接调 `/api/checkout` 会失败，复用完整组件需要为未登录态打补丁，且支付渠道选择器在营销页显得过重。替代方案（落地页内嵌完整购买、或价格卡直购+登录回流）被否，改动大且拉低营销页定位。
- **价格数据取自 `lib/billing/plans.ts`**：首页 import `membershipPlans`（纯静态数组，可在 client component 直接引用）并用 `formatFenAsCny` 渲染，满足调价自动同步；不在落地页硬编码 ¥19.9/¥49.9 等数值。年付提示复用 `YEARLY_DISCOUNT_PERCENT`。
- **未登录点击付费卡走 `GoogleLoginButton next="/upgrade"`**：落地页已有 `isAuthenticated`，未登录时付费卡 CTA 直接渲染带 `next="/upgrade"` 的登录按钮，登录后经 `/auth/callback` 精确回到 `/upgrade`。替代方案（改 `/upgrade` 的 `redirect("/login")` 传 next）影响面更大，不做。
- **CSS 清理边界**：删除仅被 FeatureFlow 使用的 `flow-node`/`flow-swap`/`flow-type`/`flow-shimmer*`/`flow-done*` 及对应 keyframes；保留 `flow-caret`（AgentChatPreview 在用）。以删除组件后全仓 grep 无引用为验收标准。
- **测试同步**：删除 smoke 中 `#flow` 锚点断言与风格切换用例，新增「价格」锚点与价格区块断言；membership/billing e2e 走 `/upgrade`，不受影响。

## Risks / Trade-offs

- [删除区块遗漏引用导致构建失败] → 删除后跑 `pnpm lint`、`typecheck`、`vitest`、`playwright e2e` 四件套全量验证
- [`flow-*` 类误删破坏智能体预览] → 仅删全仓无引用的类，保留 `flow-caret` 并以 grep 确认
- [价格卡价格与 `/upgrade` 不一致造成观感矛盾] → 同一数据源 + 年付省幅常量复用，两侧必然一致
- [落地点击「立即开通」的未登录用户登录后落错页] → `next="/upgrade"` 精确回流，e2e 覆盖

## Migration Plan

纯前端展示层变更，无数据迁移。单次部署生效；回滚即还原该次提交。

## Open Questions

无。
