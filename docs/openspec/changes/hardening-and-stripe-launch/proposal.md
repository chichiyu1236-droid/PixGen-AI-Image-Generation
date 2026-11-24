# Proposal: hardening-and-stripe-launch

## 1. 为什么要做与外部可见变化

PixGen 当前的产品主链路已跑通（经典生图、参考图、会员双池积分、Agent 对话工作台），但距离正式面向国内用户上线收款还卡在四件事：个人聚合通道不稳定且缺少正式收款页过审要件、首页与登录页把 Google 登录摆在首位导致国内无代理访客直接流失、用户查不到自己的订单和积分流水、以及后端与管理后台存在 4 处会在生产环境暴露的 P0 缺陷。

本次变更一次性完成上线前的收款切换、登录转化重构、账务合规补齐与后端止血。改动前后用户与管理员看到的具体变化如下：

1. **会员开通收款切换为 Stripe Checkout（保留旧通道可配）**
   - **改动前**：在 `/upgrade` 先选微信或支付宝，进入站内 `/pay/[orderId]` 扫聚合平台二维码，仅靠聚合回调和 30 秒后轮询对账。
   - **改动后**：当配置 `BILLING_PROVIDER=stripe` 时，保持现有人民币会员卡定价不变（标准月卡 ¥19.9 / 年卡 ¥199、Pro 月卡 ¥49.9 / 年卡 ¥499），点击「立即开通」直接跳转 Stripe 托管收银台（支持支付宝、微信支付、银行卡单次人民币付款，无自动扣款）。付款完成后：① Stripe 异步回调 `/api/webhooks/stripe` 验签入账；② 浏览器跳回 `/pay/[orderId]?stripe_session_id=...` 时立即主动向 Stripe 核实订单状态兜底入账，任何一条路径到达都只发一次权益。切回 `mock` / `lantu` / `xunhupay` 时原有站内扫码流程照常工作。
2. **国内友好的邮箱双模式登录与找回密码闭环**
   - **改动前**：营销首页顶部、首屏、价格卡、页尾主按钮全部直接拉起 Google OAuth；`/login` 把 Google 按钮放在最上方，不支持邮箱验证码登录，没有忘记密码入口，且 `/auth/callback` 换取会话失败时静默跳走不报错。
   - **改动后**：全站未登录主入口统一跳 `/login`（点击付费会员卡跳 `/login?next=/upgrade`，登录后自动回到升级页）。`/login` 主区域改为「邮箱 6 位验证码免密登录/注册 ⇄ 邮箱密码登录/注册」双模式切换，补齐「忘记密码 → 邮件链接 → `/auth/reset-password` 设置新密码」完整闭环；Google 登录降为底部次选按钮；授权码失效或回调报错时在登录页明确提示原因。
3. **用户账务透明与法务合规页（满足 Stripe 商户审核要求）**
   - **改动前**：用户只能看到侧边栏总积分徽章，查不到历史订单和扣费明细；收银台在买年卡时显示「购买 100 积分」容易引发误解，异常订单也没有客服联系方式；全站缺少服务条款与隐私政策页面。
   - **改动后**：工作台侧边栏新增「账单与明细」（`/billing`），展示双池余额与会员到期状态、历史订单（待支付订单可继续付款）及每笔积分增减流水；`/pay/[orderId]` 对年卡明确展示「共 12 期、每 30 天发放 X 积分、首期立即到账」，异常订单展示客服联系邮箱（读取 `NEXT_PUBLIC_SUPPORT_EMAIL`）与订单号；新增静态公开页 `/terms`（服务条款与退款规则）与 `/privacy`（隐私政策），在首页页脚、登录页、收银页挂载入口。
4. **4 类后端与管理端 P0 缺陷止血**
   - **生产环境 Mock 支付守卫修复**：修复 `lib/billing/env.ts` 用 `z.coerce.boolean()` 导致环境变量写 `"false"` 反而被当成 `true` 的漏洞，与图像和 Agent 环境变量守卫保持一致。
   - **生图与 Agent 超时及参考图格式修复**：为 `/api/generate` 与 `/api/agent/sessions/[id]/messages` 显式声明 Serverless 函数 `maxDuration`，防止生图或对话中途被平台超时强杀；修复参考图前端压缩产出 JPEG 但后端按 PNG MIME 上传给生图接口导致严格上游拒收的问题。
   - **管理后台订单页联表修复**：新增 `0007_orders_profiles_fk.sql` 补齐 `orders.user_id -> public.profiles(id)` 外键，修复 `/admin/orders` PostgREST 联表查用户邮箱失败且页面吞掉错误误显示「暂无订单」的问题（视频工作台规格中的迁移号顺延为 `0008`）。
   - **Agent 真实模型协议与扣费一致性修复**：补齐 `RealBrain` 回传工具结果前缺失的 `assistant.tool_calls` 标准消息并按序执行多工具调用；单轮内每成功出图立即扣减内存 `ctx.totalCredits` 防止超额调起上游生图；数据库扣费失败时删除已上传的 Storage 孤儿图片；`edit_image` 继承原图真实画幅比例而非固定改成 `1:1`。

## 2. 现成基建复用与本期不做边界

### 直接复用的现成基建
- **会员目录与人民币计价**：直接复用 `lib/billing/plans.ts`（四档 SKU）与 `lib/billing/money.ts`（分与人民币格式化），服务端单一价格源不变。
- **幂等发货与惰性双池引擎**：直接复用 `supabase/migrations/0006_membership.sql` 的 `fulfill_order`（单次购买叠加顺延、首期即发、年卡 11 期入队）和 `evaluate_membership`（读路径惰性发放与过期清零），零定时任务。
- **数据表与行级权限（RLS）**：`/billing` 直接读取已有本人只读 RLS 策略的 `orders`、`credit_events`、`memberships` 表，无需新建账单表或新写后端列表 API。
- **工作台壳层与视觉规范**：`/billing` 复用 `components/app-shell.tsx`、`components/membership-notice.tsx`；登录页、重置密码页、条款与隐私页沿用现有暖宣纸画廊视觉令牌（`#f6f3ea` / `#fbf9f3` / `#171916` / `#384a3a`）。
- **零新增第三方运行时依赖**：Stripe Checkout 会话创建、查询与 `Stripe-Signature` HMAC-SHA256 验签使用 Node 原生 `node:crypto` 与 `fetch` 实现（与现有 `lantu.ts`、`xunhupay.ts` 同构），不改动 `package.json` 与 `package-lock.json`。

### 本期不做（Non-Goals）
- **不做 Stripe Subscription 自动续费扣款**：支付宝与微信支付在人民币（CNY）下仅原生支持 `mode: "payment"` 单次支付，本期保持手动续费、到期顺延会员期模型，不引入 `stripe_customer_id` 或周期代扣。
- **不做自助在线退款按钮与发票开具系统**：退款规则在 `/terms` 明示，实际退款通过联系客服邮箱在 Stripe 控制台与 `/admin/credits` 人工核实处理。
- **不删除旧支付通道与历史积分包兼容分支**：`lantu`、`xunhupay`、`mock` 代码与测试完整保留，通过 `BILLING_PROVIDER` 切换；历史 `pack` 类型订单流水在 `/billing` 正常兼容展示。
- **不做手机号短信（SMS）验证码登录与微信扫码登录**：本期聚焦零额外通道资质成本的邮箱密码 + 邮箱 6 位验证码登录闭环。
- **不在本子项目中实现视频工作台（`/video`）**：`docs/openspec/changes/add-video-workbench/` 保持独立子项目推进，仅在本规格中明确其数据库迁移编号由 `0007` 顺延至 `0008_video_workbench.sql`。

## 3. 分层验收标准

- **各并行工作区（B1 / B2 / B3）局部快测**：每个工作区完成后仅运行 `npm run typecheck && npm run lint` 及与本工作区直接关联的 `npx vitest run <目标测试文件>`（秒级反馈，不空跑全量 E2E 或重型构建）。
- **B4 合并门禁（唯一重测点）**：将 B1、B2、B3 按序合入集成分支后，统一执行 `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`，确认类型、单测、生产打包及 Playwright 桌面/移动双端用例通过。
