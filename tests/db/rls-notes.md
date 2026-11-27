# RLS 与核心资金 RPC 校验说明

仓库通过 [scripts/verify-rls.mjs](../../scripts/verify-rls.mjs)（`npm run verify:rls`）在独立测试库上自动验证行级安全策略（RLS）与核心资金 RPC。脚本读取 `.env.local` 中的测试库凭据，创建两个临时测试用户运行全部检查并在 `finally` 中级联清理。**严禁未经 Owner 明确确认对生产或共享 Supabase 实例执行。**

## `npm run verify:rls` 自动执行的 18 项检查

1. **Profiles 隔离与防篡改（`0001_initial.sql`）**
   - 用户 A 可读取自身 `profiles` 行；
   - 用户 A 不可读取用户 B 的 `profiles` 行；
   - 匿名客户端不可读取任何 `profiles` 行；
   - 用户 A 在浏览器客户端无法 `update` 或 `insert` 修改 `profiles.credits`。
2. **Generations 与 Credit Events 隔离及生图扣费（`0001_initial.sql`、`0005_rpc_role_guards.sql`）**
   - `record_successful_generation` 原子扣减 1 积分并写入 1 条 `generation_charge` 流水；
   - 用户 A 仅可见自己的 `generations` 记录，无法读取用户 B 的作品；
   - 用户 A 可读取自身 `credit_events`（含注册赠送 `signup_bonus`）；
   - 用户 A 不可读取用户 B 的 `credit_events`；
   - 余额为 0 时 `record_successful_generation` 抛出 `insufficient_credits`。
3. **Orders 隔离与计费 RPC 守卫（`0003_billing.sql`、`0005_rpc_role_guards.sql`）**
   - 用户 A 仅可见自己的 `orders` 记录；
   - 匿名客户端不可读取任何 `orders`；
   - 用户 A 不可直接 `insert` `orders`；
   - `fulfill_order` 连续两次调用仅发一次积分（幂等）；
   - `fulfill_order` 支持对 `expired` 订单迟到回调正常发货（钱到必发货）；
   - `adjust_credits` 原子增减积分、写入 `admin_adjustment` 并拒绝透支；
   - 匿名/普通登录客户端均无权直接调用 `fulfill_order` 与 `adjust_credits`。
4. **Agent 会话/消息隔离与血缘 RPC（`0004_agent.sql`、`0005_rpc_role_guards.sql`）**
   - `agent_sessions` 与 `agent_messages` 严格按归属隔离，匿名不可读且普通用户不可直写；
   - `record_successful_generation` 正确记录 `agent_session_id`、`parent_generation_id`、`origin` 与 `edit_instruction`。

## `0006`–`0007` 迁移补充核查项（`memberships` 与 `orders` 外键/渠道约束）

以下行为已在迁移与 E2E/单测中覆盖，新增迁移演进时需同步核对：

- `0006_membership.sql`：`memberships` 表仅允许本人 `select`，禁止客户端写；`evaluate_membership`、`fulfill_order`（会员卡分支）、`record_successful_generation`（订阅池优先、永久池兜底）均仅限 `service_role` 调用。
- `0007_orders_profiles_fk.sql`：`orders_user_id_profiles_fkey` 外键生效（保障 `/admin/orders` 关联 `profiles(email)` 查询）、`orders_channel_check` 允许 `('wechat', 'alipay', 'stripe')`。
