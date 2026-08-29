# Tasks: add-membership-plans

## 1. 数据库迁移（0006_membership.sql）

- [x] 1.1 建 `memberships` 表（unique user_id、plan_id、paid_until、next_grant_at、tranches_left）+ RLS（select-own、写走 service role）；`profiles` 加 `sub_credits`（default 0，CHECK ≥0）与 `sub_credits_expires_at`；`orders` 加 `kind`（default 'pack'）与 `plan_id`。验证：本地应用迁移后表/列/约束存在，旧数据零变化
- [x] 1.2 `credit_events.type` 约束扩容 `membership_grant`、`membership_expire`。验证：写入新类型成功、非法类型被拒
- [x] 1.3 新增 `evaluate_membership` SECURITY DEFINER RPC（service_role only，沿用 0005 角色守卫）：过期清零、跳期作废、按期发放、末期与 paid_until 对齐，返回双池有效余额与会员到期时间。验证：service_role 调用结果正确，anon/authenticated 角色被拒
- [x] 1.4 扩展 `fulfill_order`：kind=pack 走原逻辑；kind=plan 在同事务 upsert memberships 并按叠加顺延语义发货（无会员起算、有会员顺延、立即发一期、tranches_left/next_grant_at/plan_id 更新、写 membership_grant 流水）。验证：pack 旧路径回归不变；plan 幂等（重复发货只发放一次）；首购/续费/换档/过期重购四场景正确
- [x] 1.5 `record_successful_generation` 双池消耗：过期订阅池视为 0（行内清零），先订阅池后永久池，CHECK 与流水 reason 标注消耗池。验证：RPC 集成测试覆盖 sub 优先、sub 耗尽扣永久、两池为 0 时 raise insufficient_credits

## 2. SKU 目录与下单接口

- [x] 2.1 新增 `lib/billing/plans.ts`：std-month/std-year/pro-month/pro-year 四 SKU（价格、每期额度、期数、周期时长）+ `getMembershipPlan()`，与 packs.ts 同构。验证：单元测试断言目录数值与快照字段
- [x] 2.2 `/api/checkout` 接受会员卡下单：创建 kind=plan 订单并冻结会员快照，沿用 2 分钟同商品同通道复用、3 单待支付上限、15 分钟 TTL。验证：扩展 checkout-route 测试——plan 下单快照正确、复用、上限、未登录 401、客户端篡改数值被忽略
- [x] 2.3 确认 webhook 与对账路径零改动可履约 plan 订单（金额核对、幂等、迟到回调仍发货均继承）。验证：mock 回调 plan 订单 → 会员开通且流水正确

## 3. 读路径与余额

- [x] 3.1 余额预检查切换为 `evaluate_membership`（`/api/generate` 与 Agent `preflightPaidTool`），以两池有效余额之和判断，402 `insufficient_credits` 行为不变。验证：generate-route 与 agent tools 测试全绿
- [x] 3.2 生成成功响应的 `remainingCredits` 携带双池拆分。验证：路由测试断言 sub/permanent 字段

## 4. 界面

- [x] 4.1 `/upgrade` 改版定价页：免费/标准/Pro 三栏、月/年切换（年付标省 17%）、积分包加购区、双通道入口与微信内引导沿用。验证：e2e 断言三栏价格、切换展示与加购区可下单
- [x] 4.2 积分徽章双池展示（订阅池含到期日、永久池）与会员过期态。验证：组件/e2e 断言两池数值与过期文案
- [x] 4.3 到期提醒条：距到期不足 3 天展示续费入口。验证：组件测试覆盖阈值内/外两种状态

## 5. 测试与验收

- [x] 5.1 周期引擎专项测试：年卡 12 期节奏、90 天未访问跳期作废不补发、并发读不重复发放、订阅池到期清零不影响永久池。验证：RPC 集成测试通过
- [x] 5.2 e2e（mock 通道）全链路：买月卡 → 生成扣订阅池 → 订阅池耗尽扣永久池 → 有效期内续费顺延 → 过期后订阅池清零且永久池可用。验证：新增/扩展 e2e 用例通过
- [x] 5.3 存量兼容回归：现有 billing e2e（积分包下单→收银台→回调→到账）与 admin 用例全绿，老用户余额表现为永久池。验证：全量测试套件通过
- [x] 5.4 `openspec validate --change add-membership-plans` 通过。验证：CLI 无 error
