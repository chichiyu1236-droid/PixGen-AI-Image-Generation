# Proposal: add-credit-pack-purchase

## Why

当前积分只能靠注册赠送(5 积分)和管理员手工补发,`/upgrade` 是一个"即将开放"的占位页——产品没有收入闭环。需要接入真实支付,让用户可以自助购买积分包,摆脱对人工补发的依赖,并支付图片生成的推理成本。

## What Changes

- 接入聚合支付平台(蓝兔/虎皮椒一类,个人身份可注册),支持微信扫码与支付宝付款,通过 provider 适配层隔离,未来可平替为官方直连。
- 新增一次性积分包购买:首发单一包 `¥9.9 / 20 积分`,定价配置在服务端单一来源。
- 新增订单体系:`orders` 表记录下单/支付状态,`fulfill_order` 原子 RPC 保证"钱到必发货"且幂等(webhook 重复投递只发一次积分)。
- 新增收银台页面 `/pay/[orderId]`:桌面端展示二维码 + 倒计时,移动端拉起支付,轮询订单状态,支付成功后积分即时到账。
- 新增 webhook 接收端点:验证聚合平台签名(MD5 参数签名)、核对金额与订单快照一致后发货,应答纯文本 `success`。
- 订单状态查询接口对 pending 超时的订单主动向平台发起查询,不依赖 cron,webhook 丢失也能到账。
- `/upgrade` 从占位页改为定价购买页;支持微信/支付宝双通道选择;微信内置浏览器给出"用浏览器打开"引导。
- 新增管理端 `/admin/orders`:订单列表、状态筛选、单条查询平台、手工补发,作为客服与对账工具。
- `credit_events` 新增 `purchase` 类型;修复现有 `/admin/credits` 的读改写竞态,并修正其错记为 `signup_bonus` 的类型。
- 提供 `mock` provider 供本地开发与 e2e 测试完整演练 下单→回调→到账,不涉及真实资金。

**Non-goals**(本期不做):订阅制、自动退款、发票、多币种、支付渠道智能路由/故障切换、营业执照与官方直连(架构预留,不实现)。

## Capabilities

### New Capabilities

- `billing`: 积分包购买与订单履约——积分包定义与定价、下单、支付通道适配、签名验证与幂等发货、订单生命周期(pending/paid/expired)、收银台交互、对账与管理端支持。

### Modified Capabilities

(无——openspec/specs 目前为空,这是首个正式 spec。)

## Impact

- **新代码**:`lib/billing/`(packs、providers/*、签名验证)、`app/api/checkout`、`app/api/webhooks/[provider]`、`app/api/orders/[id]`、`app/pay/[orderId]`、`app/admin/orders`、`/upgrade` 改版。
- **数据库**:`supabase/migrations/0003_billing.sql`——`orders` 表及 RLS、`credit_events.type` 约束扩展、`fulfill_order` security definer RPC(service_role only)、`adjust_credits` 原子加/扣积分 RPC(替代 admin 路由的读改写)。
- **环境变量**:`BILLING_PROVIDER`(mock/lantu/xunhupay)、对应平台的 `APP_ID`/`APP_SECRET`、订单有效期等;密钥仅服务端。
- **依赖**:前端二维码渲染库(如 `qrcode`)。
- **既有行为微调**:`/admin/credits` 走原子 RPC 并正确记录事件类型;注册赠送与生成扣费逻辑不变。
- **风险与纪律**:聚合支付属个人开发者灰色通道,余额需及时提现;`/admin/credits` 手工补发保留为兜底通道。
