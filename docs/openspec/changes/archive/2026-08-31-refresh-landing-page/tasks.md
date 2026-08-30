## 1. 删除创作流程区块

- [x] 1.1 在 `components/landing-page.tsx` 删除 `#flow` section、「创作」导航锚点、`FeatureFlow` 与 `FlowSign` 组件及随之无用的 import（如 `useState`），保留仍被引用的组件；跑 `npm run typecheck` 通过
- [x] 1.2 在 `app/globals.css` 删除仅被 FeatureFlow 使用的 `flow-node`/`flow-swap`/`flow-type`/`flow-shimmer`/`flow-shimmer-replay`/`flow-done`/`flow-done-replay` 类及 `flow-appear`/`flow-shimmer`/`flow-typing` keyframes，保留 `flow-caret`（智能体预览在用）；全仓 grep 确认被删类名无残留引用
- [x] 1.3 更新 `e2e/smoke.spec.ts`：删除 `#flow` 导航锚点断言与风格切换交互用例；跑该文件 e2e 通过

## 2. 创作记录数据点排版

- [x] 2.1 调整 `#records` 数据点列表：数值列相对内容区左缘右移并固定列宽，四行标题与说明纵向对齐；桌面端视口人工核对排版

## 3. 价格区块与导航入口

- [x] 3.1 在 `#records` 之后、CTA 之前新增 `id="pricing"` 区块：免费/标准/Pro 三张静态价格卡，价格、额度与年付省幅从 `lib/billing/plans.ts`（`membershipPlans`、`YEARLY_DISCOUNT_PERCENT`）经 `formatFenAsCny` 渲染，不硬编码数值；免费卡 CTA 按登录态指向登录/生成页，付费卡 CTA 已登录为 `Link` 去 `/upgrade`、未登录为 `next="/upgrade"` 的登录按钮；区块内不含下单/切换/渠道控件
- [x] 3.2 顶部导航「记录」与「历史」之间加入「价格」锚点（`href="#pricing"`）；页面渲染核对导航顺序为 功能/智能体/记录/价格/历史

## 4. 测试与整体验证

- [x] 4.1 在 `e2e/smoke.spec.ts` 新增断言：导航含「价格」锚点、页面存在 `#pricing` 区块及三档价格卡；跑该文件 e2e 通过
- [x] 4.2 全量验证：`npm run lint`、`npm run typecheck`、`npm run test`、`npm run e2e` 全部通过
