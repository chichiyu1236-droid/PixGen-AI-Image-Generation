## Why

产品目前仅有静态图像生成（经典模式 + 会员专属 Agent 对话工作台），而团队已具备火山方舟 Seedance 的调用能力。用户站内积累的经典生图与 Agent 画布作品天然适合直接作为图生视频首帧，能把「生成/打磨图像 → 一键生成视频」串成完整闭环。

基于 2026-11-23 对火山方舟现役模型与国内外竞品（即梦、可灵、海螺、Vidu、Runway、Lovart）的调研，本次提案在落地前完成以下关键纠偏：
1. 方舟 `Seedance 1.0 lite` 已下架、`1.0 pro / pro fast` 已标注「即将下线」，现役主力为 **Seedance 2.0 / 2.5**；需按实价重算档位与毛利，在不改动现有会员卡体系（¥19.9/100 分、¥49.9/300 分）的前提下杜绝成本倒挂与单条穿破月卡。
2. 视频单条成本为图像的 10~40 倍，与免费用户一次性 5 积分断层明显，因此与 Agent 工作台保持一致，设为**会员专属**。
3. 方舟 API 原生支持结构化 JSON 参数、`callback_url` 回调、Base64/URL 首帧与 `execution_expires_after`，不应仅靠客户端轮询同步转存，必须补齐服务端兜底推进、转存竞态锁、提交幂等与跨周期退款规则。

## What Changes

- **独立「视频工作台」与会员门控（`/video`）**：
  - 与 Agent 工作台对齐，**仅有效期内会员可提交任务**；非会员可访问 `/video` 查看介绍与带锁标入口并引导至 `/upgrade`，服务端接口 fail-closed 拒绝（403 `video_membership_required`）；会员到期后既有视频任务与结果保留只读播放与下载。
  - 文生视频（t2v）与图生视频（i2v）双模式；按现役 **Seedance 2.0** 能力收敛为 **3 档清晰画质预设 × 2 时长（5s / 10s）= 6 个定价 SKU**：`preview`（480p · Seedance 2.0 mini，12/24 分）、`standard`（720p · Seedance 2.0 mini，默认，25/50 分）、`pro`（720p · Seedance 2.0，50/100 分）；支持可选同步音效（`generate_audio`，默认关闭、不额外加分）；画面比例收敛为 `16:9`、`9:16`、`1:1`、`4:3`、`3:4`（i2v 默认 `adaptive` 跟随首帧）。
- **打通「图片 → 视频」正向闭环与高清首帧**：
  - 在 `/history` 图像卡片、`/generate` 经典结果区及 Agent 画布作品卡片增加「生成视频」一键跳转入口（`/video?mode=i2v&firstFrameId=<id>`），同时在 `/video` 保留历史选图模态与本地上传。
  - i2v 本地首帧与经典参考图 1024px 压缩解耦，放宽至最长边 **1920px JPEG**，直传 Base64 给方舟；历史首帧经归属校验后签发 **24 小时** signed URL（不再用 1 小时）。
- **可靠异步任务链路与资金不变量**：
  - 统一状态机：`queued → running → transferring → succeeded / failed / expired`，彻底消除 `pending` 混用。
  - **提交幂等与双重并发控制**：请求携带 `Idempotency-Key`；`submit_video_task` RPC 在单事务内先清理当前用户超期僵尸任务、再校验单用户并发上限（3）与全站并发闸门，随后按双池顺序原子预扣并写入 `credits_sub_split` 快照。
  - **双通道完成推进 + 原子转存锁**：优先接入方舟 `callback_url` 回调端点（签名校验后反查方舟确认）+ 轻量服务端定时巡检（`/api/cron/video-reconcile`）兜底 + 客户端退避轮询加速；转存 MP4 前原子抢占 `transferring` 锁，失败重试最多 3 次而非立刻作废已扣费视频。
  - **严格退款与超时语义**：上游设置 `execution_expires_after = 3600`（方舟最小值）；应用层 30 分钟超时后尝试调用方舟 `DELETE` 取消并退款；若退款时原订阅池已过期，自动将订阅池份额改退至永久池并留痕，防止退回即清零。
- **私有视频存储、历史混排与 Provider 抽象**：
  - `generated-videos` 采用**私有 bucket**，通过服务端归属校验后的短期签名 URL 播放与下载，防止外链盗刷；`history-grid` 图片与视频混排并支持「全部 / 图片 / 视频」筛选，视频卡默认使用 `poster` + `preload="none"`。
  - 保留 `VIDEO_PROVIDER=mock|seedance` 与生产禁用守卫；`provider-health` 将上游 `429` 限流与 `401/403`/欠费故障隔离，避免高峰限流误熔断全站。

## Capabilities

### New Capabilities

- `video-workbench`：视频生成工作台的完整行为契约——会员门控与到期只读、3 档预设 × 2 时长参数矩阵与结构化传参、正向/反向 i2v 首帧链路、幂等提交与双池原子预扣/跨周期退款、回调 + 巡检 + 轮询的异步状态机与转存锁、私有存储签名播放、历史混排与 mock/熔断守卫。

### Modified Capabilities

- `membership`：不改动现有 4 个会员卡 SKU 价格、额度与双池扣费顺序；仅将定价页与免费层能力边界的会员专属表述由「Agent 对话」同步扩展为「Agent 对话与视频工作台」。

## Impact

- **数据库**：新迁移 `supabase/migrations/0007_video_workbench.sql`——`video_generations` 表（含 `idempotency_key`、`preset_id`、`model_id`、`frame_inputs`、`poster_url`、`provider_usage_tokens`、`transfer_attempts`、`refunded_at`、`late_succeeded_at`）、`submit_video_task` / `refund_video_task` / `claim_video_transfer` RPC、`credit_events` 新增 `video_charge` / `video_refund` / `video_refund_redirected`、私有 `generated-videos` bucket。
- **后端**：`lib/video/`（目录与定价常量 `catalog.ts`、会员门控、Seedance 客户端、mock provider、健康守卫、首帧与转存逻辑）、`app/api/video/`（提交/列表/详情/下载）、`app/api/webhooks/video/seedance/`、`app/api/cron/video-reconcile/`、`lib/storage/videos.ts`、`lib/env.ts`、`vercel.json`（cron）。
- **前端**：`app/video/page.tsx`、导航入口、创建区与预设选择器、任务卡流与退避轮询 hook、首帧选择器、`history-grid` 混排与 `/generate`、Agent 画布、历史卡上的「生成视频」快捷入口、定价页 `/upgrade` 权益文案同步。
- **测试**：vitest 单测（目录与毛利底线断言、参数校验、会员门控、Seedance 结构化请求与错误分类、转存重试与跨周期退款）+ Playwright e2e（mock provider 全链路）。
- **运维/成本**：Agent Plan 订阅仅限开发/内测，生产必须使用按量计费账号（建议企业实名认证以获得 10 并发配额，个人账号默认 3 并发需相应下调 `VIDEO_MAX_GLOBAL_ACTIVE`）；所有 6 个 SKU 在最低单积分口径（Pro 年卡 ¥0.139/分）下保持约 28.5%~30.5% 毛利，标准月卡口径保持约 50% 毛利。
