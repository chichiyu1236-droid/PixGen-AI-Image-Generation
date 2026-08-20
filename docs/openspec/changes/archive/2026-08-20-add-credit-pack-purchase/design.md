# Design: add-credit-pack-purchase

## Context

现有积分闭环已就绪:`profiles.credits` 余额 + `credit_events` 流水(type 约束为 `signup_bonus`/`generation_charge`),扣费走 `record_successful_generation` 事务型 RPC(security definer,service_role only),管理员经 `/admin/credits` 邮箱白名单手工补发,`/upgrade` 为占位页。部署在 Vercel(个人计划,cron 仅每日一次),数据库为 Supabase Postgres。运营者为个人身份,无法开通微信/支付宝官方商户号。

已知债务:`/admin/credits` 加积分是"读-改-写"三步,与生成扣费并发时有竞态;且手工充值错记为 `signup_bonus` 类型。

## Goals / Non-Goals

**Goals:**

- 用户可自助完成 积分包下单 → 扫码/拉起支付 → 积分到账 的完整闭环。
- 资金不变量"钱到必发货":展示态的过期不拦截真实资金流。
- 发货严格幂等,webhook 重复投递、并发回调、迟到回调均安全。
- 支付平台可替换(聚合 ↔ 官方直连),核心订单与发货逻辑零改动。
- 不依赖 cron、不依赖额外基础设施,Hobby 计划可运行。
- 全链路可在本地与 e2e 中用 mock provider 演练,不碰真实资金。

**Non-Goals:**

- 订阅制、自动退款、发票、多币种、支付渠道故障自动切换。
- 营业执照与官方直连的具体接入(仅预留适配位)。

## Decisions

### D1: 聚合支付 + provider 适配层

选择蓝兔/虎皮椒一类个人可注册的聚合平台,接入方式收敛为 `lib/billing/providers/*` 适配器,每个适配器实现统一接口:

```
createPayment(order, channel) -> { payUrl, providerTradeNo? }
queryOrder(order) -> { paid: boolean, providerTradeNo }
verifyCallback(rawBody) -> { valid, orderId, providerTradeNo, amountFen } | invalid
```

- 备选被否:官方直连(需执照 + ICP 备案 + 国内服务器,周期一个多月);Stripe/MoR(国内用户支付体验差);V免签自建(需常驻安卓设备,回调可靠性无保障)。
- 首发具体接蓝兔还是虎皮椒取决于注册过审结果(见 Open Questions),两者接口同构:MD5 参数排序签名、商户订单号透传、查询接口、纯文本 `success` 应答,第二个适配器成本极低。
- 风险纪律:平台余额及时提现;同时注册两家互为备份。

### D2: 订单先行,金额与积分数下单时快照

下单流程:先写 `orders`(pending,冻结 `credits`/`amount_fen`)→ 再调 `createPayment` → 回写平台单号。回调金额校验对象是**订单快照**,不是当前积分包配置——将来调价后旧订单的迟到回调不会炸。发货量同理以订单为准,回调里的数量字段一律不采信。

### D3: 幂等发货 = 数据库状态机 + 行锁 RPC

新增 `fulfill_order(p_order_id, p_provider_trade_no)` security definer RPC,模式对齐现有 `record_successful_generation`:

```sql
select ... from orders where id = p_order_id for update;      -- 行锁
update orders set status='paid', paid_at=now(), provider_trade_no=coalesce(...)
  where id = p_order_id and status in ('pending','expired');  -- 原子翻转
if 更新行数 = 0 -> 已发货,直接返回(幂等出口)
update profiles set credits = credits + <订单冻结数>;
insert into credit_events(type='purchase', amount=+N, reason 含订单号);
```

订单状态翻转、余额增加、流水写入在同一事务。并发回调由 `for update` 行锁串行化,恰有一方完成翻转。`expired → paid` 合法转移即"钱到必发货"的实现;`expired` 只是展示态。仅 service_role 可执行。

金额不符时不发货,订单置 `flagged` 供人工核查(不自动重试,防重放)。

### D4: 不依赖 cron 的对账:懒过期 + 读时主动查平台

- **懒过期**:任何读路径(status 接口、webhook、管理页)发现 `pending && now() > expires_at` 就地翻转 `expired`,无需定时器。
- **读时对账**:`GET /api/orders/[id]` 发现订单 `pending` 且创建超过 30 秒时,同步调用 `queryOrder` 主动查平台;平台侧已支付则直接走 `fulfill_order`。用户自己的轮询驱动对账,webhook 丢失几乎无感知。
- 备选被否:Vercel cron(Hobby 限每日一次,不可用);外部 cron 服务(引入新依赖,且读时对账已覆盖主要场景)。

### D5: 自建收银台页面 `/pay/[orderId]`

不跳转聚合平台的收银台,自己渲染。设备分支:`payUrl` 桌面端用 `qrcode` 库客户端渲染二维码,移动端浏览器按钮直接跳转,微信内置浏览器(UA 含 MicroMessenger)显示引导横幅并默认支付宝通道。轮询 3 秒,`visibilitychange` 隐藏暂停、恢复立即查询。订单归属校验靠 RLS(非本人查不到,返回 404)。备选被否:跳平台收银台(品牌与状态轮控不可控,mock provider 也无法演练此页)。

### D6: 金额以分存储,配置单一来源

`amount_fen` 整数(990),前端展示用 `Intl.NumberFormat('zh-CN')` 格式化。积分包定义收敛于 `lib/billing/packs.ts`,服务端校验 packId,`/upgrade` 页也从该配置渲染(经服务端组件注入,不复制常量)。

### D7: 迁移 `0003_billing.sql` 全部为增量,兼容在线执行

```
orders 表: id uuid pk, user_id fk, pack_id text, credits int, amount_fen int,
           status text check in ('pending','paid','expired','failed','flagged')
           default 'pending', channel text, provider text, provider_trade_no text,
           pay_url text, raw_notify jsonb, notified_at timestamptz,
           expires_at timestamptz, created_at, paid_at
  - unique(provider, provider_trade_no)  可空唯一,幂等第二锚点
  - RLS: 本人 select;无 insert/update policy(全部经 service_role RPC)
credit_events: type 约束扩展 + 'purchase'、'admin_adjustment'
  (drop constraint + add constraint,在线安全)
函数: fulfill_order(...)、adjust_credits(p_user_id, p_amount, p_reason, p_type)
  均 security definer、revoke from public、grant to service_role
```

`adjust_credits` 为原子加/扣积分通用原语,同时修复 `/admin/credits` 的读改写竞态与类型错记(改走该 RPC,类型记 `admin_adjustment`),注册赠送与生成扣费路径不变。

### D8: webhook 路由公开,仅以签名守门

`POST /api/webhooks/[provider]` 不做用户认证(平台服务器无会话),安全边界是签名验证 + 金额核对;验签失败仅记日志、应答非 success。原始回调体存入 `orders.raw_notify` + `notified_at`,纠纷可溯源。处理成功应答纯文本 `success`(聚合平台只认这个,否则无限重推,重推由幂等性兜底)。

### D9: mock provider 为一等公民

`providers/mock.ts` 实现同一接口,`BILLING_PROVIDER=mock` 时启用(仅非生产):下单返回确定性 payUrl,e2e 通过受环境保护的测试端点/脚本以正确签名模拟"用户付款"回调,Playwright 可演练 下单→二维码→模拟支付→到账 全链路。这是适配层设计的第一收益,也让 CI 覆盖发货幂等。

## Risks / Trade-offs

- [聚合平台为二清,存在跑路/冻结风险] → 余额及时提现;两家平台注册互备;适配层切换成本低;`/admin/credits` 手工补发保留为最终兜底。
- [MD5 参数签名强度弱] → 金额必须与订单快照一致;发货前重要场景叠加平台查询接口交叉确认;`raw_notify` 留证。
- [webhook 丢失或延迟] → 读时主动对账(D4)+ 管理端单条查询/补发;两者均复用 `fulfill_order`,不会双发。
- [用户扫旧码在过期后付款] → "钱到必发货"不变量覆盖,迟到回调照常发货。
- [回调伪造重放] → 签名 + 金额核对 + 订单号归属;金额不符置 `flagged` 不自动重试。
- [调价引发旧回调金额不符] → 订单快照隔离(D2),误伤面为零。
- [订单表被刷] → 每用户 pending ≤ 3、同包 2 分钟复用、未登录 401。

## Migration Plan

1. 合并迁移 `0003_billing.sql`(纯增量,可先于代码上线;`adjust_credits` 上线后 `/admin/credits` 立即受益)。
2. 部署代码,`BILLING_PROVIDER=mock` 自测闭环。
3. 配置真实平台密钥,小额真实支付验证(¥0.01 或首单自购)。
4. 回滚策略:代码回滚即可,migration 向后兼容(旧代码不感知新表);`credit_events` 新 type 对旧代码无影响(旧代码只写入旧类型)。

## Open Questions

- 首发适配蓝兔还是虎皮椒:取决于两家注册过审结果。接口同构,不影响本设计与任务拆分,仅影响第一个真实适配器的落地任务。
- 二维码渲染库选型(`qrcode` vs `qrcode.react`):实现时按包体积与维护度定,不影响结构。
