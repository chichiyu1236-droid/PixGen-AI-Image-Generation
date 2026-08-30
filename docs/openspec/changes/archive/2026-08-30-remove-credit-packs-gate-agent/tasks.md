## 1. 积分包下架（服务端）

- [x] 1.1 清空 `lib/billing/packs.ts` 的 `creditPacks` 目录（或移除该模块），确认 `getCreditPack` 对任何 packId 返回 undefined；运行现有单测确认无编译错误
- [x] 1.2 `app/api/checkout/route.ts` 移除积分包分支：提交 `packId` 或积分包商品类型时返回商品不存在错误，仅接受会员卡下单；新增测试覆盖「积分包商品不可下单」场景
- [x] 1.3 确认历史积分包订单查询、收银台展示与回调发货不受目录清空影响（快照冻结）：用一条既有测试或新增测试验证历史订单仍可读取

## 2. Agent 会员门控（服务端）

- [x] 2.1 实现统一守卫：读取 `getCreditBalance().membershipActive`，非会员返回 403 与错误码 `AGENT_MEMBERSHIP_REQUIRED`，余额读取失败时 fail-closed 拒绝；单测覆盖守卫本身
- [x] 2.2 在 `app/api/agent/sessions/route.ts`（POST）与 `app/api/agent/sessions/[id]/messages/route.ts`（POST）入口接入守卫，且在执行任何会话/工具工作之前；GET 会话与消息路由不做会员校验；新增集成测试覆盖「服务端拒绝非会员会话请求」与「会员到期后对话保留只读（GET 可用、POST 403）」
- [x] 2.3 messages 路由复用守卫的 `getCreditBalance` 调用结果做余额预检查，不重复发起 RPC；验证扣费行为回归测试通过

## 3. 前端呈现

- [x] 3.1 `/generate` 页 Agent 入口卡片：`membershipActive === false` 时渲染会员专属锁标态，点击弹出升级引导（含定价页入口），不进入 Agent 模式；收到 `AGENT_MEMBERSHIP_REQUIRED` 时回退锁标态；组件测试覆盖免费/会员两种渲染态
- [x] 3.2 会员到期后访问原 Agent 会话：历史消息与画布只读展示、新请求拦截提示续费；用组件或 e2e 测试验证
- [x] 3.3 定价页 `app/upgrade/page.tsx` 移除积分包加购区，免费栏文案改为「5 张试用积分 · 经典模式」并明示 Agent 会员专属；快照或组件测试更新
- [x] 3.4 全局收口购买引导：经典模式与 Agent 模式的余额不足（402）提示、拦截引导一律指向定价页（会员卡），grep 确认无残留积分包引导入口

## 4. 回归与验收

- [x] 4.1 会员用户 Agent 全流程不受影响：创建会话、对话生图、改图、变体、扣费正确（运行既有 Agent e2e/集成测试）
- [x] 4.2 免费用户经典模式不受影响：有试用积分可生成、用完 5 张后 402 引导购买会员卡（集成测试）
- [x] 4.3 运行全量测试套件与 lint，清理积分包相关的失效测试与 mock，确认构建通过
