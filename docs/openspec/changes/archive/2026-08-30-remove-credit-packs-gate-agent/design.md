## Context

付费体系当前由 `lib/billing/plans.ts`（会员卡目录）与 `lib/billing/packs.ts`（积分包目录）双目录驱动，`app/api/checkout/route.ts` 按提交的商品类型分支下单。Agent 能力有三个服务端路由：`app/api/agent/sessions/route.ts`（创建会话）、`app/api/agent/sessions/[id]/route.ts`（读取会话）、`app/api/agent/sessions/[id]/messages/route.ts`（发消息）。会员状态已由 `getCreditBalance()`（`evaluate_membership` RPC）返回 `membershipActive` 字段，messages 路由已在扣费时调用它，但当前仅用于余额，未用于身份门控。双池账务模型（`evaluate_membership`、扣费顺序、流水）本次完全不动。

## Goals / Non-Goals

**Goals:**

- 积分包从目录、下单、定价页三条链路下架，订单商品类型仅接受会员卡
- Agent 模式服务端门控：非会员任何会话/消息写入请求被拒绝
- 免费层差异化呈现：锁标入口 + 升级引导 + 定价页免费栏文案
- 存量永久池余额与历史订单零迁移、零影响

**Non-Goals:**

- 不改双池扣费、发放、清零账务逻辑
- 不改收银台、支付回调、对账链路（与商品类型无关的部分）
- 不引入周期性免费额度机制（免费层维持一次性 5 张试用）
- 不删除历史积分包订单/流水数据

## Decisions

**1. 积分包下架采用"目录清空 + 下单拒绝"，不删 `lib/billing/packs.ts` 的类型定义。**
`creditPacks` 数组清空（或模块整体删除后 `upgrade/page.tsx` 与 `checkout/route.ts` 同步收口），checkout 对 `packId`/积分包商品类型返回商品不存在错误。历史订单已冻结快照，不依赖目录存在。备选是保留目录仅前端隐藏——被否决，因为服务端仍可下单，"下架"名不副实。

**2. Agent 门控放在 API 路由层，统一一个守卫函数，不放在工具层。**
在 sessions POST（创建会话）与 messages POST（发消息）入口、执行任何会话/工具工作之前调用守卫：读取 `getCreditBalance().membershipActive`，非会员返回 HTTP 403 + 错误码 `AGENT_MEMBERSHIP_REQUIRED`。messages 路由已调用 `getCreditBalance`，守卫复用该次调用结果，不新增 RPC。GET 会话/消息不做会员校验——这天然满足"到期后对话保留只读"。备选是放在 agent 工具执行层——被否决：会话创建本身也应拦截，且工具层校验会让 403 语义散落在多个工具里。注意：路由代码带方括号路径（`[id]`），文件定位时需转义。

**3. 前端锁标以 balance 数据驱动，不做单独的"权益"接口。**
`/generate` 页已具备获取用户余额的路径，`membershipActive === false` 时 Agent 入口卡片渲染锁标态；点击展示升级引导（弹出层含定价页链接，或直接引导至 `/upgrade`）。前端拦截仅为体验，服务端 403 是最终防线；前端收到 `AGENT_MEMBERSHIP_REQUIRED` 时也回退到锁标态（覆盖 balance 与会员状态短暂不一致的窗口）。

**4. 402 与各处"购买引导"文案统一指向会员卡。**
经典模式与 Agent 模式的余额不足拦截、订阅池/永久池耗尽提示，购买入口一律指向定价页（会员卡）。不保留任何指向积分包的引导路径。

**5. 定价页免费栏为静态差异化文案。**
免费栏固定表述「5 张试用积分 · 经典模式」+「Agent 对话为会员专属」，不做成可配置权益矩阵——当前只有经典/Agent 两个能力维度，配置化是过度设计。

## Risks / Trade-offs

- [免费用户失去 Agent 尝鲜渠道，体验落差] → 经典模式对照文案保留（「还没想好，聊聊看」入口可见），锁标点击即弹出升级引导，落差转化为付费触点
- [balance 读取失败时守卫行为] → 与现有余额读取失败的宽松策略保持一致需谨慎：守卫在读取失败时 MUST 拒绝（fail-closed），宁可误拦也不放行非会员；会员用户刷新后即恢复
- [`membershipActive` 与前端缓存短暂不一致] → 服务端 403 兜底，前端 403 回退锁标态，两个方向都不会产生错误扣费或越权生成
- [清空 `creditPacks` 导致引用它的测试/e2e 失败] → 任务中同步更新对应断言，改为断言"积分包不可下单"

## Migration Plan

1. 合并服务端门控与积分包下架（可同一次发布：目录清空 + checkout 拒绝 + Agent 守卫）
2. 发布前端：定价页收口、锁标入口、402 文案
3. 无数据库迁移、无数据回填；回滚即还原代码，历史数据全程未动

## Open Questions

（无）
