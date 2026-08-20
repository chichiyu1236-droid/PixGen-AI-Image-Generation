# Tasks: add-credit-pack-purchase

## 1. 数据库迁移

- [x] 1.1 编写 `supabase/migrations/0003_billing.sql`:`orders` 表(快照字段、状态约束、`unique(provider, provider_trade_no)`、`expires_at`、`raw_notify`)及本人-select RLS 策略
- [x] 1.2 扩展 `credit_events.type` 约束:新增 `purchase`、`admin_adjustment`(drop + add constraint,在线安全)
- [x] 1.3 实现 `fulfill_order(p_order_id, p_provider_trade_no)` security definer RPC:行锁 + `pending|expired → paid` 原子翻转 + 加积分 + `purchase` 流水,单事务;revoke public / grant service_role
- [x] 1.4 实现 `adjust_credits(p_user_id, p_amount, p_reason, p_type)` 原子调账 RPC,同权限模型
- [x] 1.5 将新表/策略纳入 `scripts/` 下的 RLS 自动验证脚本并跑通

## 2. 计费基础模块 lib/billing

- [x] 2.1 `lib/billing/packs.ts`:积分包配置单一来源(首发 ¥9.9/20 积分)+ packId 校验函数
- [x] 2.2 定义 provider 统一接口类型(`createPayment` / `queryOrder` / `verifyCallback`)与按 `BILLING_PROVIDER` env 的选择器
- [x] 2.3 实现 `providers/mock.ts`:确定性 payUrl、可编程的"模拟支付"触发(仅非生产环境守卫)
- [x] 2.4 实现首个真实聚合平台适配器(蓝兔或虎皮椒,按注册过审结果):下单、查询、MD5 参数签名验证,密钥走 env
- [x] 2.5 金额单位约定:全链路 `amount_fen` 整数,展示层统一 `zh-CN` 货币格式化工具

## 3. API 路由

- [x] 3.1 `POST /api/checkout`:登录校验 → 服务端定价快照 → 同包 2 分钟复用 pending 订单 → pending ≤ 3 限制 → 写 orders → 调 `createPayment` 回写 payUrl
- [x] 3.2 `GET /api/orders/[id]`:本人可见;读时懒过期;pending 超 30 秒时同步 `queryOrder` 对账,平台已付则走 `fulfill_order`
- [x] 3.3 `POST /api/webhooks/[provider]`:验签 → 金额对订单快照核对 → `fulfill_order` → 存 `raw_notify`/`notified_at` → 纯文本 `success` 应答;金额不符置 `flagged`
- [x] 3.4 重构 `/api/admin/credits` 走 `adjust_credits`,消除读改写竞态并修正事件类型

## 4. 购买前端

- [x] 4.1 `/upgrade` 改版:从 packs 配置渲染定价卡片、微信/支付宝通道选择、微信内置浏览器 UA 检测与"浏览器打开"引导
- [x] 4.2 新建 `/pay/[orderId]` 收银台:桌面二维码(引入二维码渲染库)+ 倒计时;移动端支付跳转按钮;非本人订单 404
- [x] 4.3 轮询逻辑:可见时 3 秒轮询、`visibilitychange` 暂停/恢复即查;paid 展示到账数、刷新积分徽章、返回生成入口;expired 提供重新下单(新订单)
- [x] 4.4 金额展示与订单状态的 UI 细节:状态动效、pending/paid/expired/failed/flagged 的用户可读文案

## 5. 管理端

- [x] 5.1 `GET /api/admin/orders` 订单列表接口(状态筛选、分页)+ 管理员白名单校验
- [x] 5.2 单条运维动作:触发平台查询、对已支付未发货订单手工补发(复用 `fulfill_order`,幂等)
- [x] 5.3 `/admin/orders` 页面:列表、筛选、操作按钮与结果反馈

## 6. 测试与验证

- [x] 6.1 单元测试:签名验证(合法/伪造/篡改)、金额核对、packs 校验、checkout 复用与限流规则
- [x] 6.2 数据库测试:`fulfill_order` 幂等(重复/并发调用只发一次)、`expired → paid` 迟到回调、`adjust_credits` 原子性
- [x] 6.3 e2e(Playwright + mock provider):下单 → 收银台二维码 → 模拟支付回调 → 到账 → 生成页可用新积分
- [x] 6.4 全量验证跑绿:`npm run typecheck`、`npm test`、`npm run lint`、`npm run build`、`npm run e2e`
- [x] 6.5 README 补充:新增 env 变量(`BILLING_PROVIDER` 及平台密钥)、部署检查单、平台余额提现与手工补发兜底说明

## 7. 上线切换(真实资金)

- [ ] 7.1 注册蓝兔与虎皮椒,按过审结果确定首发适配器并配置生产密钥
- [ ] 7.2 生产小额真实支付验证(自购首单),确认回调、发货、对账、管理端四条路径
- [ ] 7.3 将 `/upgrade` 从占位文案切换为真实购买入口,观察首日订单与 webhook 日志
