# Design: add-membership-plans

## Context

现状是标量余额 `profiles.credits`（永久池雏形）+ 审计账本 `credit_events` + 一次性积分包订单体系（蓝兔/虎皮椒/mock 三 provider、签名验签、幂等 `fulfill_order`、无 cron 轮询对账，见 `lib/billing/`、`supabase/migrations/0003_billing.sql`）。支付通道为一次性收款聚合，无代扣资质，当前生产配置为 mock。扣费点集中在 `record_successful_generation` RPC，成功后原子扣 1 分。动机与范围见 proposal.md。

## Goals / Non-Goals

**Goals:**

- 双池积分模型落地：订阅池（有到期、周期发放、不滚存）+ 永久池（现状余额与积分包）。
- 会员期引擎完全惰性化：发放、清零、续费顺延全部在读路径/发货路径触发，零 cron、零队列。
- 续费/升级/降级统一为"叠加顺延"语义，无折算、无退款、无换档限制。
- 扣费点保持一处（现有 RPC），一图一分不变。

**Non-Goals:**

- 自动续费/代扣、退款、发票、按比例折算、多会员并存、滚存、邀请返利（见 proposal Non-goals）。
- 免费层改动、存量余额迁移（两者均为零改动）。
- 邮件/短信通知设施（到期提醒仅站内）。

## Decisions

### D1. 会员形态：手动续费的会员期票（形态二）

聚合通道（蓝兔/虎皮椒）无微信委托代扣/支付宝周期扣款资质，自动续费不可实现；mock 阶段更无从谈起。因此"订阅"落地为月卡/年卡：一次购买 = 一个会员期 + 立即发放首期，到期前用户再扫码买一张即顺延。产品文案统一用"月卡/年卡"，不承诺自动扣款，规避合规与客诉。未来若开通官方周期扣款，可在同一 `memberships` 模型上叠加，不需要推翻。

**备选**：接入 Stripe/Paddle 做真订阅——与 CN 收款场景不符，否决。

### D2. 双池存储：profiles 加两列，而非积分批次（lots）模型

- `profiles` 新增 `sub_credits integer not null default 0`、`sub_credits_expires_at timestamptz null`。
- 同一时刻至多只有一个"活跃发放窗口"（叠加顺延 = 旧窗口到期前并入新窗口），单过期字段足够表达。
- **备选**：credit lots（每笔发放一行、按过期时间 FIFO 消耗）——能精确表达"早期续费的旧期积分在旧到期日失效"，但需要逐行扣减与更多锁竞争。否决，理由：损失的是"提前续费者的旧期额度在旧到期日精确清零"这一边缘精确性，换取单行原子扣减的简单性。见 Trade-offs。

### D3. 会员状态独立表 `memberships`（unique user_id）

`plan_id text`（当前/最新档位，用于展示）、`paid_until timestamptz`、`next_grant_at timestamptz`、`pending_tranches jsonb`、时间戳。`pending_tranches` 是 FIFO 队列：每个元素是一期的发放额度（如年卡首期发放后为 `[100,100,…]` 共 11 项），队首即下一期。

> 实现修订：design 初稿用 `tranches_left` 计数 + 单一 `tranche_quota`。实现时发现该表示无法公平表达"年卡用户中途购买月卡"（剩余年卡期数会被月卡档位覆盖，降级场景用户受损），故改为 FIFO 额度队列：同档续费、升级、降级、混购统一为"队列追加"，跳期作废=队首出队，先购先发，无需任何档位比较逻辑。

不放进 profiles 的原因：发货、周期发放、读路径三处都要 `FOR UPDATE` 行锁这一行，独立表让锁语义清晰；未来叠加官方代扣时也有挂载点。会员是否有效由 `paid_until > now()` 推导，不存冗余 status 列。

### D4. 惰性周期引擎：一个 SECURITY DEFINER RPC

新增 `evaluate_membership(p_user_id)`（service_role only，沿用 0005 的运行时角色守卫模式），单事务先锁 profiles 行再锁 memberships 行（与发货路径同序，避免死锁）：

1. `sub_credits_expires_at <= now()` → 清零订阅池（写 `membership_expire` 流水，金额为清零余量的负值）。
2. 追赶发放时点：`next_grant_at` 以 30 天步进越过当前时刻的每一期，各从队首出队一项且不发放（作废最老的一期）。
3. 若 `next_grant_at <= now() < paid_until` 且队列非空：队首出队并发放（`sub_credits += 队首额度`，`sub_credits_expires_at = min(next_grant_at + 30 天, paid_until)`，`next_grant_at += 30 天`，写 `membership_grant` 流水）。
4. 返回双池有效余额与会员到期时间（jsonb）。

读路径（积分徽章、定价页、`/api/generate` 预检查、Agent `preflightPaidTool`）统一走该 RPC——预检查从"裸 select"升级为 RPC 调用，一次往返同时完成惰性引擎驱动与余额判断，幂等由行锁 + 单事务保证。

**年卡对齐**：`sub_credits_expires_at = min(next_grant_at + 30 天, paid_until)` 使最后一期天然与 `paid_until` 对齐，不会溢出会员期。

### D5. 叠加顺延的实现：发货分支内一个原子动作

`fulfill_order` RPC 扩展：`orders` 增加 `kind text not null default 'pack' check (kind in ('pack','plan'))` 与 `plan_snapshot jsonb`（冻结 `{planId, quotaPerTranche, tranches, periodDays}`，目录变更不影响在途订单；`pack_id` 列兼作两类 SKU 的 id，复用/上限查询零改动；`credits` 列存每期额度，收银台与 webhook 日志文案零改动）。kind=pack 走原逻辑（永久池）；kind=plan 在同一事务内 upsert memberships 行（`FOR UPDATE`）：

- 无有效会员（`paid_until <= now()` 或无行）：`paid_until = now() + 周期时长`，队列重置为空，`next_grant_at = now() + 30 天`。
- 有效会员：`paid_until += 周期时长`（时间永远顺延，不浪费剩余天数），队列**追加** `(期数 - 1) × 每期额度`（保留已购档位的未发期数），`next_grant_at` 保持原节奏。
- 无论哪种：立即发放一期（`sub_credits += 每期额度`，`sub_credits_expires_at = max(旧值, min(now() + 30 天, 新 paid_until))`），写 `membership_grant` 流水。
- `credit_events.type` 约束扩容 `membership_grant`、`membership_expire`。

升级与降级天然同路径（只是队列追加的额度不同），无需任何分支或禁止逻辑。幂等性继承现状：`fulfill_order` 已按订单状态翻转保证只执行一次。

### D6. 扣费 RPC 的双池消耗顺序

`record_successful_generation`（0004 版本）内：计算有效订阅池（过期视为 0，顺带行内清零），`sub_credits > 0` 则 `sub_credits -= 1`，否则 `credits -= 1`；CHECK 约束同步加 `sub_credits >= 0`。流水仍为 `generation_charge` -1，`reason` 标注消耗池（sub/permanent）以便对账。预检查与真扣之间不存在两池不一致的窗口：真扣在 RPC 内二次判断池顺序，与预检查结果无关，语义仍为"成功后扣 1 分"。

### D7. SKU 目录放代码：`lib/billing/plans.ts`

与 `packs.ts` 同构（服务端单一来源，客户端数值不可信）：

| id | 价格(fen) | 每期额度 | 期数 | 周期时长 |
|---|---|---|---|---|
| `std-month` | 1990 | 100 | 1 | 30d |
| `std-year` | 19900 | 100 | 12 | 365d |
| `pro-month` | 4990 | 300 | 1 | 30d |
| `pro-year` | 49900 | 300 | 12 | 365d |

数字随时可调（mock 阶段零负担）；`fulfill_order` 使用订单内冻结的 `plan_snapshot` 发放，目录变更不影响在途订单。

### D8. UI：/upgrade 改版 + 徽章双池 + 提醒条

- `/upgrade`：免费/标准/Pro 三栏，月/年切换（年付标"省 17%"），积分包挪入加购区；沿用现有收银台与微信内引导。
- 积分徽章：订阅池（含到期日）+ 永久池两行；会员过期显示"已过期"。
- 到期提醒：`paid_until - now() < 3 天` 时展示续费条，链接定价页。数据由 evaluate_membership 一并返回，无额外请求。

## Risks / Trade-offs

- [并发读触发重复发放] → evaluate_membership 全程单事务 + memberships 行 FOR UPDATE；e2e 并发用例覆盖。
- [早期续费使旧期额度"延寿"到新窗口到期（D2 取舍）] → 单方向让利、上限一期额度（100/300 张 ≈ ¥4.2/¥12.6 成本），可接受；文档化不修补。
- [错过期作废引发客诉] → 定价页与发放流水明确"每期 30 天、过期作废"；提醒条降低遗忘概率。
- [时钟一致性] → 引擎统一用数据库 `now()`，禁止应用层时间参与判断，避免 DB/应用时钟漂移。
- [在途 pack 订单兼容] → `kind` 默认 'pack'，旧订单行为零变化；上线顺序为"先迁移后发代码"，迁移向后兼容可回滚（新列/新表均可 drop）。

## Migration Plan

1. 单个迁移（`0006_membership.sql`）：建 `memberships` + RLS、profiles 两列与 CHECK、orders 加 `kind`/`plan_id`、`fulfill_order`/`record_successful_generation` 替换、新增 `evaluate_membership`、`credit_events.type` 扩容。全部 ADD/替换，无数据回填。
2. 部署迁移 → 部署应用代码（旧代码对新列无感知，新代码依赖迁移，顺序不可颠倒）。
3. 回滚：还原代码即可；迁移仅在新写路径使用新对象，不影响存量读路径。

## Open Questions

（无——定价、语义、边界均已在探索阶段敲定。）
