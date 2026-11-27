# billing Specification

## Purpose

定义会员卡购买与订单履约的完整行为契约：会员卡下单、Stripe Checkout 托管收银台与聚合/模拟支付适配、回调验签与幂等发货、订单生命周期与主动对账、用户账单与合规公开页、管理端运维，保证「钱到必发货」的资金不变量。

## Requirements

### Requirement: 创建购买订单
系统 SHALL 仅为已登录用户创建会员卡购买订单（`std-month` ¥19.9 / 每期 100 张、`std-year` ¥199 / 共 12 期每期 100 张、`pro-month` ¥49.9 / 每期 300 张、`pro-year` ¥499 / 共 12 期每期 300 张），商品价格与额度 MUST 仅由服务端目录 `lib/billing/plans.ts` 决定，忽略客户端提交的任何价格或积分数。积分包商品（`packId`）已下架，客户端提交 `packId` 时系统 SHALL 返回 `404 unknown_sku`。订单 SHALL 在创建时冻结商品快照（`kind: "plan"` 与 `plan_snapshot` 含 `planId`、`quotaPerTranche`、`tranches`、`periodDays`）。同一用户对同一商品在同一提供方与同一支付通道 2 分钟内已存在未过期且含支付链接的待支付订单时，系统 SHALL 复用该订单而非新建。同一用户同时存在的未过期待支付订单数 SHALL NOT 超过 3 个。订单编号（UUID）SHALL 在创建时生成并传递给支付平台作为商户订单号。

当 `BILLING_PROVIDER=stripe` 时：
- 下单通道 SHALL 统一归一化为 `"stripe"`，订单与 Stripe Checkout Session 有效期取 `Math.max(ORDER_TTL_MINUTES, 31)` 分钟（满足 Stripe 至少 30 分钟限制并保留 1 分钟时钟偏差余量）；
- `POST /v1/checkout/sessions` SHALL 附带 `Stripe-Version: 2026-09-30.endive` 与 `Idempotency-Key: checkout_${orderId}`，采用单次人民币付款（`mode=payment`、`locale=zh`、`currency=cny`），通过 `allowed_payment_method_types[i]` 传递 `STRIPE_PAYMENT_METHODS` 白名单（`card`、`alipay`、`wechat_pay` 的非空子集；含 `wechat_pay` 时附带 `payment_method_options[wechat_pay][client]=web`），并在已登录用户邮箱通过格式校验时透传 `customer_email` 预填支付回执邮箱；
- 系统 SHALL 将返回的 Stripe Session ID（`cs_...`）回写至 `provider_trade_no`，并在下单响应（含 2 分钟复用命中）返回 `redirectUrl`。

当 `BILLING_PROVIDER` 为非 Stripe 提供方（`mock`、`lantu`、`xunhupay`）时，订单有效期取 `ORDER_TTL_MINUTES`（默认 15 分钟），请求传入 `channel="stripe"` 时 SHALL 返回 `400 invalid_request`，省略时默认 `"wechat"`。

#### Scenario: 正常下单（Stripe 托管收银台）
- **WHEN** `BILLING_PROVIDER=stripe` 且已登录用户在定价页点击开通会员卡
- **THEN** 系统创建携带会员快照、渠道归一化为 `stripe`、有效期不少于 31 分钟的待支付订单，调用 Stripe Checkout 创建会话并记录 `provider_trade_no`，返回 `orderId` 与托管 `redirectUrl`

#### Scenario: 正常下单（传统聚合或模拟通道）
- **WHEN** `BILLING_PROVIDER` 为 `mock`、`lantu` 或 `xunhupay`，已登录用户在定价页选择会员卡与微信/支付宝通道并确认购买
- **THEN** 系统创建携带会员快照的待支付订单、保存通道支付链接并进入站内收银台页面 `/pay/[orderId]`

#### Scenario: 积分包商品不可下单
- **WHEN** 客户端提交携带 `packId` 的下单请求
- **THEN** 系统拒绝创建订单并返回 `404 unknown_sku`

#### Scenario: 短时间内重复下单复用现有订单
- **WHEN** 用户对同一会员卡在同一提供方与同一通道于 2 分钟内再次发起购买且原订单仍为未过期待支付
- **THEN** 系统返回原订单（Stripe 订单同时返回原 `redirectUrl`），不创建新订单

#### Scenario: 并发待支付订单数量限制
- **WHEN** 用户已存在 3 条未过期待支付订单并再次发起购买
- **THEN** 系统拒绝创建新订单并返回 `409 too_many_pending_orders`

#### Scenario: 未登录下单被拒绝
- **WHEN** 未登录用户调用 `POST /api/checkout`
- **THEN** 系统返回 `401 not_authenticated`，不创建订单

### Requirement: 收银台页面交互
收银台页面 `/pay/[orderId]` SHALL 仅允许订单本人访问：未登录重定向至 `/login?next=/pay/[orderId]`（保留可选 `stripe_session_id`），访问他人或不存在订单返回 404。待支付与成功态文案 SHALL 区分月卡与年卡：年卡（`tranches > 1`）明确展示「共 12 期、每 30 天发放 X 积分、首期支付成功后立即到账」，月卡展示单期积分数立即到账。

收银台 SHALL 按支付提供方与设备环境适配：
- Stripe 订单（`provider === "stripe"` 或 `channel === "stripe"`）SHALL 跳过本地二维码生成，在待支付态展示支持支付宝/微信支付/银行卡且不自动续费的说明及安全 HTTPS 外跳按钮「前往 Stripe 收银台完成支付」；带 `?canceled=1` 时展示取消付款提示；带合法 `?stripe_session_id=` 回跳时挂载立即触发对账（含临近过期刚翻转的订单）；
- 非 Stripe 订单桌面端渲染支付二维码并显示倒计时，移动端提供跳转支付链接按钮，微信内置浏览器中针对微信通道显示「在外部浏览器打开」引导。

页面 SHALL 在待支付且可见状态下每 3 秒轮询订单状态，不可见时暂停，恢复可见时立即查询一次。支付成功后停止轮询、展示到账积分数与返回 `/generate`、查看 `/billing` 入口。订单过期后提供重新下单（Stripe 订单外跳新 `redirectUrl`）与必要时的重新核验入口。订单处于 `failed` 或 `flagged` 异常态时 SHALL 展示订单号与客服联系邮箱（`NEXT_PUBLIC_SUPPORT_EMAIL`）以便人工核实补发。页面页脚 SHALL 挂载 `/billing`、`/terms`、`/privacy` 链接。

#### Scenario: Stripe 订单跳回即时对账与取消提示
- **WHEN** 用户从 Stripe 托管收银台付款后跳回 `/pay/[orderId]?stripe_session_id=cs_...`
- **THEN** 页面不渲染本地二维码，挂载即刻携带 `stripe_session_id` 请求订单状态接口完成核实并切换为支付成功态；若携带 `?canceled=1` 则展示已取消提示与重新前往付款按钮

#### Scenario: 年卡收银台展示 12 期分期说明
- **WHEN** 用户查看标准年卡或 Pro 年卡订单的收银台页面
- **THEN** 页面在待支付与支付成功态均明确说明共 12 期、每 30 天发放当期积分且首期支付成功后立即到账

#### Scenario: 传统通道桌面端、移动端与微信内适配
- **WHEN** 用户在不同设备访问非 Stripe 订单收银台
- **THEN** 桌面端渲染支付二维码与倒计时，移动端展示拉起支付链接按钮，微信内对微信通道展示外部浏览器打开引导

#### Scenario: 异常订单展示客服联系与单号
- **WHEN** 订单状态为 `failed` 或 `flagged`
- **THEN** 收银台展示订单异常提示、当前订单号与客服邮箱（配置 `NEXT_PUBLIC_SUPPORT_EMAIL` 时渲染 `mailto:` 链接），并提供重新下单入口

#### Scenario: 只能查看自己的订单
- **WHEN** 用户访问不属于自己的 `/pay/[orderId]` 或 `GET /api/orders/[id]`
- **THEN** 系统返回 404，不泄露该订单是否存在

### Requirement: 支付回调验签与幂等发货
系统 SHALL 接收支付平台的异步回调，MUST 验证回调签名真实性并核对回调金额（及币种）与订单冻结金额一致，任一不满足时 MUST NOT 发货。验证通过后系统 SHALL 通过原子幂等 RPC `fulfill_order` 将订单置为已支付并发放当期会员权益，同一订单无论回调到达多少次均只发货一次。对已过展示有效期（`expired`）但平台确认已支付的订单，系统 STILL SHALL 发货（钱到必发货）。

- **Stripe 回调（`POST /api/webhooks/stripe`）**：未配置 `STRIPE_WEBHOOK_SECRET` 时返回 `503`；MUST 先通过 `request.text()` 读取原始请求体并用 `Stripe-Signature`（`t=<unix>,v1=<hex>`，300 秒时间戳容差、恒定时间 HMAC-SHA256 比较）验签，失败返回 `400`；仅对 `checkout.session.completed` 与 `checkout.session.async_payment_succeeded` 且 `payment_status === "paid"` 执行履约；严格校验 `session.id` 格式（`/^cs_[A-Za-z0-9_]+$/`）、`metadata.order_id === client_reference_id`、与本地 `provider_trade_no` 一致性、`amount_total === order.amount_fen` 且 `currency === "cny"`，异常不符时标记未付订单为 `flagged` 并保留原 `provider_trade_no`，不发货；成功或幂等重复时记录 `raw_notify` / `notified_at` 并返回 `200 { received: true }`，瞬时数据库错误返回 `500` 触发 Stripe 重试。
- **聚合/模拟回调（`POST /api/webhooks/[provider]`）**：路径 `provider` 须匹配当前激活提供方（否则返回 `404`）；合并查询参数与表单/JSON 请求体参数并经 `provider.verifyCallback` 验签；金额不符将未付订单标记 `flagged` 并返回成功应答止重试；合法回调调用 `fulfill_order` 并以纯文本 `success` 应答，瞬时履约失败返回 `500`。

#### Scenario: Stripe 合法回调发货与重复幂等
- **WHEN** Stripe 发送签名有效、订单与会话绑定一致且金额与 `cny` 币种匹配的 `checkout.session.completed` 或 `checkout.session.async_payment_succeeded` 回调
- **THEN** 系统调用 `fulfill_order` 发货一次、记录 `raw_notify` 与 `notified_at` 并返回 `200 { received: true }`；重复投递不再重复发放权益

#### Scenario: Stripe 签名无效或密钥未配置
- **WHEN** `STRIPE_WEBHOOK_SECRET` 未配置，或请求缺少/伪造/过期 `Stripe-Signature`
- **THEN** 未配置时返回 `503`，验签失败时返回 `400`，不改动订单与用户余额

#### Scenario: Stripe 会话绑定或金额币种异常标记 flagged
- **WHEN** Stripe 回调中 `metadata.order_id` 与 `client_reference_id` 不一致（且唯一命中本地未付订单）、`session.id` 与已存 `provider_trade_no` 冲突、或 `amount_total` / `currency` 不符
- **THEN** 系统不发货，将非已付订单标记为 `flagged` 并记录 `raw_notify`，返回 `200` 避免无限重试

#### Scenario: 聚合/模拟通道合法回调与金额不符处理
- **WHEN** 聚合或模拟支付发送回调至 `/api/webhooks/[provider]`
- **THEN** 验签通过且金额一致时原子发货并应答纯文本 `success`；验签失败不改库；金额不符标记 `flagged` 且不发货；过期订单收到合法付款回调仍可从 `expired` 翻转为 `paid` 并发货

### Requirement: 订单状态查询与主动对账
系统 SHALL 为订单本人提供 `GET /api/orders/[id]` 状态查询（RLS 限制仅本人可读，他人返回 `404`）。读路径发现待支付订单已过 `expires_at` 时 SHALL 惰性翻转为 `expired`。待支付订单创建超过 30 秒且距上次检查超过 10 秒时，系统 SHALL 经 `getBillingProviderById(order.provider)` 主动向原支付提供方查单（遵循生产禁用 `mock` 守卫），平台确认已支付时触发 `fulfill_order` 补发货。

对 Stripe 订单携带 `?stripe_session_id=` 的跳回查询：
- 系统 SHALL 严格校验 `stripe_session_id` 符合 `/^cs_[A-Za-z0-9_]+$/` 且与订单已绑定的 `provider_trade_no` 一致（若已存 `provider_trade_no` 不一致则忽略外部参数）；
- 校验通过时跳过 30 秒等待阈值、应用 3 秒轻节流立即查单，并对 `pending` 与刚翻转的 `expired` 订单均执行一次主动对账；
- `stripeProvider.queryOrder` 请求 `GET /v1/checkout/sessions/{id}` 时附带 `Stripe-Version: 2026-09-30.endive`，仅当 `metadata.order_id`、`client_reference_id`、`payment_status === "paid"`、`amount_total`、`currency === "cny"` 全部匹配时才认定已支付。

#### Scenario: Stripe 跳回即查与临近过期兜底
- **WHEN** 用户付款后带合法且匹配 `provider_trade_no` 的 `?stripe_session_id=` 返回，即使订单创建不足 30 秒或刚惰性翻转为 `expired`
- **THEN** 系统立即查询 Stripe Session 并在确认已付且订单与金额匹配后执行 `fulfill_order` 补发货

#### Scenario: 回调丢失时轮询主动查单补发货
- **WHEN** 用户已付款但异步回调未送达，订单超过 30 秒后轮询状态接口
- **THEN** 系统按订单所属提供方查询平台确认已支付并完成发货，页面切换为支付成功

#### Scenario: 非法或他人 stripe_session_id 防串单
- **WHEN** 请求携带格式非法或与订单 `provider_trade_no` 不符的 `stripe_session_id`
- **THEN** 系统忽略该外部参数，绝不将其拼接为未校验路径，亦不以他人会话冒领发货

### Requirement: 用户账单明细与合规公开页
系统 SHALL 提供用户侧 `/billing` 账单与积分明细页，以及无需登录即可公开访问的 `/terms`（服务条款与退款规则）与 `/privacy`（隐私政策）合规页，并在应用主导航、定价页、登录页与收银台提供对应入口。

- **`/billing`**：未登录重定向 `/login?next=/billing`；登录后先在服务端调用 `getCreditBalance`（触发 `evaluate_membership` 完成订阅池到期清零与年卡周期发放），再经用户态 RLS 读取当前会员状态、年卡待发期数与下次发放日、订阅池/永久池余额、最近 50 条历史订单（待支付超时惰性展示「已过期」，未过期提供「继续支付」，异常态提供详情链接）与最近 100 条积分变动流水，并提供设置/修改密码与客服联系入口。
- **`/terms`**：公开公示数字服务交付性质、全部 4 个会员卡人民币单次定价与不自动续费声明、周期额度不滚存与叠加顺延规则、7 日未消耗及故障/重复扣款退款与争议处理流程、UGC 合规责任及客服邮箱。
- **`/privacy`**：公开公示账号/创作/订单/日志收集范围、不收集不存储银行卡号与支付密码的边界、向 Supabase（RLS）、AI 模型推理方及支付服务商（Stripe 等，含订单编号、商品名称、人民币金额与用于预填支付回执和风控校验的已登录用户账号邮箱）的数据传输边界，以及用户查询/更正/删除权利与客服邮箱。

#### Scenario: 已登录用户查看账单与积分流水
- **WHEN** 已登录用户访问 `/billing`
- **THEN** 页面先完成会员惰性结算，再展示会员状态、双池余额、最近历史订单（含 Stripe 在线支付标签与惰性过期状态）及 6 类中文积分流水记录

#### Scenario: 访客免登录访问条款与隐私页
- **WHEN** 未登录访客直接访问 `/terms` 或 `/privacy`
- **THEN** 两页均正常返回 200 并展示完整定价/退款规则或隐私与 Stripe 数据传输说明，且彼此互链

### Requirement: 积分入账与审计
发货 SHALL 以原子方式完成：订单状态翻转、权益发放、写入积分流水三者同时成立或同时不成立，且对同一订单 SHALL 幂等。会员卡订单发货按冻结快照开通或顺延会员、发放当期订阅池积分（年卡剩余 11 期入队 `pending_tranches`）并写入 `membership_grant` 流水。历史积分包订单及其 `purchase` 流水 SHALL 永久保留可查，MUST NOT 因积分包下架被删除或修改。

#### Scenario: 会员卡订单发货开通会员
- **WHEN** 会员卡订单发货成功
- **THEN** 用户会员按叠加顺延语义开通或顺延，当期积分到账，并写入关联该订单的 `membership_grant` 流水

#### Scenario: 并发发货仅生效一次
- **WHEN** 异步回调与跳回对账同时触发同一订单的 `fulfill_order`
- **THEN** 恰有一次调用完成状态翻转与权益发放，其余调用幂等返回不重复加分

### Requirement: 管理端订单运维
系统 SHALL 仅向 `ADMIN_EMAILS` 白名单管理员提供 `/admin/orders` 列表与筛选、`GET /api/admin/orders`、`POST /api/admin/orders/[id]/query`（平台状态查单，透传 `provider_trade_no`）与 `POST /api/admin/orders/[id]/fulfill`（手工补发，支持对 `flagged` 订单先清除异常标记再履约）能力，以及 `/admin/credits` 原子人工调账（`adjust_credits`，记为 `admin_adjustment`）。非管理员或未登录调用管理端接口 SHALL 返回 `403 forbidden`。`/admin/orders` 页面查询数据库出错时 SHALL 渲染明确错误提示而非静默展示空列表，并展示 `Stripe` 渠道标签；管理端操作按钮出错时 SHALL 将错误码映射为中文提示。

#### Scenario: 管理员查询平台或手工补发订单
- **WHEN** 管理员在 `/admin/orders` 对未支付或 `flagged` 订单点击「查询平台」或「手工补发」
- **THEN** 系统按接口结果更新状态或幂等补发，并向界面展示中文结果或错误反馈

#### Scenario: 非管理员访问管理端接口被拒绝
- **WHEN** 未登录或非白名单邮箱用户调用管理端订单或调账接口
- **THEN** 系统返回 `403 forbidden`，不读取或修改订单与用户积分
