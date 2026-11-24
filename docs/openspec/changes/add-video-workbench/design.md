## Context

现有图像链路为同步单请求（`app/api/generate/route.ts`）：校验 → 查余额 → 调 provider 拿 base64 → 上传 Storage → RPC 原子记录并扣 1 积分。视频无法沿用该模型：火山方舟 Seedance 是异步任务 API（`POST` 创建秒回 `id`，需 1~3 分钟出片，返回 `video_url` 仅 24 小时有效），单条成本 ¥1.16~¥9.94（约为图像的 10~40 倍）。

结合 2026-11-23 对火山方舟官方模型列表、定价文档、视频任务 API 文档（`82379/1330310`、`1544106`、`1520757`、`1521309`、`1521675`）的核实，以下上游事实直接约束本设计：
1. **模型代际现状**：`doubao-seedance-1-0-lite` 已下架，`doubao-seedance-1-0-pro-250528` 与 `doubao-seedance-1-0-pro-fast-251015` 已标注「即将下线」；当前正式在役模型为 **Seedance 2.0 系列**（`doubao-seedance-2-0-mini-260615`、`doubao-seedance-2-0-fast-260128`、`doubao-seedance-2-0-260128`）与 **Seedance 2.5 系列**（`2-5-flash`、`2-5`）。其中 `2.0 mini` / `2.0 fast` / `2.5 flash` 仅支持 `480p`、`720p`；`2.0` 支持 `480p/720p/1080p`（8bit MP4，浏览器通用兼容）；`2.5` 的 1080p 采用 10bit H.265/HEVC，存在浏览器播放兼容风险。
2. **公开刊例价（输入不含视频，16:9 5s）**：`2.0 mini` 480p = ¥1.16、720p = ¥2.48；`2.0` 720p = ¥4.97、1080p = ¥12.39；`2.5` 720p = ¥7.56、1080p = ¥18.71（10s 近似为 2×；仅成功计费，审核/生成失败不计费）。
3. **API 真实能力**：
   - `POST /api/v3/contents/generations/tasks` 原生支持**顶层结构化 JSON 字段**（`ratio`、`resolution`、`duration`、`watermark`、`generate_audio`、`callback_url`、`execution_expires_after`），无需把 `--ratio` 等拼接到 `text` 尾部；
   - `content` 中的 `image_url.url` 原生支持公网 URL 或 `data:image/<format>;base64,...`（单图 < 30MB，总请求体 < 64MB），并原生支持 `role: "first_frame"` / `"last_frame"`；
   - `execution_expires_after` 官方取值范围 `[3600, 259200]` 秒（最小 1 小时，默认 48 小时）；
   - `callback_url` 在状态变更（`queued`/`running`/`succeeded`/`failed`/`expired`）时推送 POST（失败 5 秒内最多重试 3 次）；
   - `DELETE /api/v3/contents/generations/tasks/{id}` 支持取消 `queued` 状态任务；
   - 默认并发配额（非 4K）：企业认证账号最大并发 **10**（RPM 600），个人账号最大并发 **3**（RPM 180）。

业务约束：不改动现有会员体系（标准月卡 ¥19.9/100 分 = ¥0.199/分；标准年卡 ¥199/1200 分 = ¥0.166/分；Pro 月卡 ¥49.9/300 分 = ¥0.166/分；**Pro 年卡 ¥499/3600 分 = ¥0.139/分**），不恢复积分包，视频工作台设为**会员专属**。

## Goals / Non-Goals

**Goals:**

- 以在役、浏览器原生兼容的 **Seedance 2.0 mini / 2.0** 构建 3 档清晰预设 × 2 时长（6 个 SKU），在不改动会员定价前提下守住全矩阵正向毛利（Pro 年卡口径 ~28.5%~30.5%，标准月卡口径 ~50%）且最高单条不超出标准月卡 100 积分上限。
- 资金与资产双重不变量：提交幂等防重扣、未出结果必退款（含跨订阅周期退款不蒸发）、已出结果有服务端回调+巡检兜底转存（用户关页 24h 内不丢失）。
- 与既有体系无缝对齐：复用双池扣费顺序、会员门控（fail-closed + 到期只读）、`provider-health` 熔断架构与「历史/画布图片 → 视频首帧」正向跳转。
- `VIDEO_PROVIDER=mock` 全链路可测，保障本地开发与 Playwright E2E 回归。

**Non-Goals:**

- 首期不做 1080p / 4K（`Seedance 2.0` 1080p 5s 成本 ¥12.39 需 ~125 积分，在不动现有 100 分标准月卡前提下会穿破整月配额；后续如新增高阶档再在 catalog 放开）。
- 首期不做首尾帧 UI、运镜模板、多图/视频参考、模板广场、视频续写/延播（但库表 `frame_inputs` 预留多帧结构，便于二期零迁移扩展）。
- 首期不做 Agent 工作台内直接调用视频工具（二期复用同一任务表与计费 RPC 接入）。
- 不改动现有 4 个会员卡 SKU 价格与额度，不恢复积分包，不改版落地页。

## Decisions

### D1：会员专属准入（与 Agent 对齐）
新建 `lib/video/membership-gate.ts`（与 `lib/agent/membership-gate.ts` 同构）：通过 `getCreditBalance()` 读取 `membershipActive`，非会员返回 `403` 与错误码 `video_membership_required`，余额读取异常时 fail-closed 拒绝。
- **只读保留**：`GET /api/video`、`GET /api/video/[id]`、`GET /api/video/[id]/download` 不做会员门控（仅做登录 + 归属校验），确保会员过期后仍可查看、播放与下载历史视频。
- **前端体验**：非会员可访问 `/video` 浏览参数与锁标说明，提交动作与锁标点击展示升级引导并指向 `/upgrade`；`/upgrade` 定价页同步将免费栏与付费栏文案更新为「Agent 对话与视频工作台为会员专属」。

### D2：收敛预设目录与防倒挂价目表（`lib/video/catalog.ts`）
放弃 72 种全排列组合，将用户选择收敛为 **3 档清晰画质预设 × 2 时长（`5s` / `10s`）= 6 个定价 SKU**，画面比例收敛为 `16:9`、`9:16`、`1:1`、`4:3`、`3:4`（i2v 默认 `adaptive`，t2v 不允许 `adaptive`）：

| `presetId` | UI 名称 | 底层默认模型（环境变量可覆盖） | 分辨率 | 5s 方舟成本 | 5s 积分 | 10s 方舟成本 | 10s 积分 | Pro 年卡毛利（¥0.139/分） | 标准月卡毛利（¥0.199/分） |
|---|---|---|---|---:|---:|---:|---:|---:|---:|
| `preview` | 快速预览 | `doubao-seedance-2-0-mini-260615` | `480p` | ¥1.16 | **12** | ¥2.32 | **24** | 30.5% | 51.4% |
| `standard` | 标准高清（默认） | `doubao-seedance-2-0-mini-260615` | `720p` | ¥2.48 | **25** | ¥4.96 | **50** | 28.6% | 50.2% |
| `pro` | 高画质 | `doubao-seedance-2-0-260128` | `720p` | ¥4.97 | **50** | ¥9.94 | **100** | 28.5% | 50.0% |

- **同步音效开关**：支持可选 `generateAudio: boolean`（默认 `false`），Seedance 2.0 按统一 token 计价不额外加费。
- **前端不泄露成本字段**：`lib/video/catalog.ts` 仅导出前端安全字段（`presetId`、展示文案、分辨率、支持时长/比例、积分价）；成本估算与单测毛利断言（`credits * 0.139 >= estimatedCostCny * 1.25`）留在服务端模块 `lib/video/pricing-server.ts` 或单测内。
- **模型可替换**：环境变量 `SEEDANCE_MODEL_MINI`（默认 `doubao-seedance-2-0-mini-260615`）、`SEEDANCE_MODEL_STANDARD`（默认 `doubao-seedance-2-0-260128`）支持热切换版本日期号；数据库每条任务持久化实际调用的 `model_id` 与上游返回的 `provider_usage_tokens`，便于事后财务毛利对账。

### D3：独立任务表 `video_generations` 与统一状态机
不修改 `generations` 表，新增 `video_generations` 表并开启 RLS（仅 `auth.uid() = user_id` 可读，写操作全部经 `service_role` RPC）。

**统一状态枚举**（所有文档、迁移、API、前端一致，不再混用 `pending`）：
- `queued`：已预扣提交，等待上游或正在排队
- `running`：上游生成中
- `transferring`：上游已成功，服务端原子抢占转存中
- `succeeded`：已转存至自有私有桶，可播放/下载
- `failed`：提交失败、上游失败或转存重试耗尽，已退款
- `expired`：超过超时阈值，已尝试取消并退款

**核心字段**：
`id, user_id, idempotency_key, status, provider, model_id, preset_id, mode(t2v|i2v), prompt, duration_s(5|10), resolution(480p|720p), ratio, generate_audio, frame_inputs(jsonb), credits_charged, credits_sub_split(jsonb), provider_task_id, provider_video_url, provider_url_expires_at, provider_usage_tokens, storage_path, poster_storage_path, transfer_attempts, transfer_started_at, error_code, error_reason, refunded_at, late_succeeded_at, created_at, updated_at`
- 唯一索引：`unique (user_id, idempotency_key)`（幂等防重扣）
- 活跃任务索引：`(user_id, status)`、partial index `where status in ('queued', 'running', 'transferring')`（加速并发计数与定时巡检）

### D4：幂等原子提交、僵尸槽清理、全站并发闸门与跨周期退款 RPC
所有资金 RPC 均 `revoke` 自 `public`/`anon`/`authenticated`，仅 `service_role` 可调用：
1. **`submit_video_task`**（单事务）：
   - 校验 `idempotency_key`：若 `(user_id, idempotency_key)` 已存在，直接返回该任务与当前余额（幂等重放，不重复扣费）。
   - `FOR UPDATE` 锁 `profiles` 行 → 惰性清零已过期的 `sub_credits`（写 `membership_expire` 事件）。
   - **僵尸槽位预清理**：将当前用户 `status in ('queued', 'running')` 且 `created_at < now() - make_interval(mins => p_timeout_minutes)` 的任务先原子翻转为 `expired` 并按跨周期退款规则回填积分，防止用户关页遗留任务永久占死 3 并发槽。
   - **单用户并发校验**：统计当前用户 `status in ('queued', 'running', 'transferring')` 数量，`>= p_user_concurrency_cap`（默认 3）则拒绝（`user_concurrency_limit` → HTTP 429）。
   - **全站并发闸门**：统计全表 `status in ('queued', 'running')` 数量，`>= p_global_concurrency_cap`（`VIDEO_MAX_GLOBAL_ACTIVE`，默认 8，适配企业 10 并发；个人账号配 2~3）则拒绝（`global_concurrency_limit` → HTTP 429）。
   - **余额校验与双池扣减**：总可用余额 `< p_credits_cost` 则拒绝（`insufficient_credits` → HTTP 402）；否则按「订阅池优先、永久池其后」扣除，写入精确快照 `credits_sub_split = { sub, permanent }`、`credit_events(type='video_charge')` 并插入 `video_generations(status='queued')`。
2. **`refund_video_task(p_task_id, p_target_status, p_error_code, p_error_reason)`**（幂等单事务）：
   - `FOR UPDATE` 锁任务行；若 `refunded_at is not null` 或 `status in ('succeeded', 'failed', 'expired')`，直接幂等返回，绝不双倍退款。
   - 置任务为 `p_target_status`（`failed` 或 `expired`）并写入 `refunded_at = now()`、`error_code`、`error_reason`。
   - `FOR UPDATE` 锁 `profiles` 行：
     - `permanent > 0`：无条件回填 `profiles.credits`；
     - `sub > 0`：若 `profiles.sub_credits_expires_at is not null and profiles.sub_credits_expires_at > now()`，回填至 `profiles.sub_credits` 并记 `video_refund`；若原订阅池**已过期**，自动改退至 `profiles.credits`（永久池）并记 `video_refund_redirected` 审计事件，确保积分不会在下次读路径被清零。
3. **`claim_video_transfer(p_task_id, p_provider_video_url, p_usage_tokens)`**：
   - 原子抢占：`where id = p_task_id and ((status in ('queued', 'running')) or (status = 'transferring' and transfer_started_at < now() - interval '2 minutes')) and transfer_attempts < 3`，更新为 `status = 'transferring'`, `transfer_attempts = transfer_attempts + 1`, `transfer_started_at = now()`, `provider_video_url = coalesce(...)`, `provider_usage_tokens = coalesce(...)`。抢占失败（已被其他请求或回调持有锁）返回空，调用方直接返回当前数据库快照，彻底杜绝并发重复下载上传。

### D5：Seedance 客户端——结构化 JSON 传参、安全隔离与上游超时对齐
- **杜绝提示词参数注入**：所有控制参数（`ratio`、`resolution`、`duration`、`watermark: false`、`generate_audio`、`execution_expires_after: 3600`、`callback_url`）全部通过 `POST /api/v3/contents/generations/tasks` 顶层 JSON 字段传递，严禁拼接 `--ratio` 等文本 flag 到 `prompt` 末尾。同时对用户 prompt 做长度校验（2~2000 字符）与规范化。
- **上游超时与取消**：提交时显式传 `execution_expires_after: 3600`（方舟允许的最小值 1 小时，替代默认 48 小时）；应用层 30 分钟判 `expired` 时，额外 best-effort 调用 `DELETE /api/v3/contents/generations/tasks/{provider_task_id}` 取消仍在 `queued` 的上游任务；若之后收到迟到回调，仅记录 `late_succeeded_at` 用于财务对账，不回写终态也不补扣。
- **Provider 健康与 429 隔离**：`lib/video/provider-health.ts` 仅在连续出现账号级/服务端故障（`401`/`403`/账户欠费/连续 `5xx`）时打开熔断窗口（返回 503 + `retryAfterSeconds`）；上游 `429` 限流错误**不触发全局熔断**，仅对当前请求退款并返回可重试的 `429`。
- **失败错误码分类**：区分 `content_moderation`（内容审核拒绝，前端引导修改提示词，不鼓励盲目原样重试）、`provider_error`、`transfer_failed`、`timeout`、`create_uncertain`。

### D6：双通道完成推进（Callback + Cron + 退避轮询）与转存重试
1. **主通道 — 方舟 Webhook 回调**：`POST /api/webhooks/video/seedance?taskId=<id>&sig=<hmac>`
   - 提交任务时若配置了公开 `NEXT_PUBLIC_SITE_URL`（非 localhost）与 `VIDEO_WEBHOOK_SECRET`，在创建请求中附带带 HMAC-SHA256 签名的 `callback_url`。
   - 收到回调后先校验签名，再**以服务端密钥反查 `GET /api/v3/contents/generations/tasks/{provider_task_id}` 核实真实状态**（不盲信回调体），再触发统一推进器 `reconcileVideoTask(taskId)`。
2. **兜底通道 — 定时巡检**：`GET /api/cron/video-reconcile`（校验 `Authorization: Bearer $CRON_SECRET`，`vercel.json` 配置每 5 分钟执行一次）
   - 批量扫描 `status in ('queued', 'running')` 且 `updated_at < now() - interval '60 seconds'` 或 `status = 'transferring'` 且 `transfer_started_at < now() - interval '2 minutes'` 的任务（单批上限 20 条），调用同一个 `reconcileVideoTask`。
   - 保证即使用户提交后立刻关闭浏览器、且某次回调丢失，依然在 5 分钟内完成转存或超时退款，彻底消除「24 小时后临时 URL 过期导致视频丢失 + 白付算力」。
3. **交互加速 — 客户端退避轮询**：
   - 前端列表/卡片轮询采用退避间隔（前 30s 每 3s、30s~2m 每 5s、2m 后每 10s），`visibilitychange` 不可见时暂停、恢复可见时立即刷新一次，终态停止；`GET /api/video/[id]` 在非终态且距上次查上游超过 2 秒时调用 `reconcileVideoTask`。
4. **流式转存与 3 次重试**：
   - 拿到 `claim_video_transfer` 锁后，流式下载 MP4（单文件大小硬上限 100MB、单次下载超时守卫）上传至私有 `generated-videos` bucket；
   - 若单次转存网络抖动失败且 `transfer_attempts < 3` 且距成功不足 24h：将任务状态回退至 `running`（保留 `provider_video_url`），等待下一次轮询/巡检重试，**避免因为一次网络波动把方舟已扣费的视频直接作废退款**；第 3 次仍失败才调用 `refund_video_task(failed, 'transfer_failed')`。

### D7：i2v 首帧链路与「图片 → 视频」正向闭环
- **本地上传**：支持 PNG / JPEG / WebP，客户端压缩至最长边 **≤ 1920px** 的 JPEG（体积上限 8MB），与 `classic-reference-images` 的 1024px 逻辑解耦；后端直接编码为 `data:image/jpeg;base64,...` 传入方舟 `content`（符合官方文档 `< 30MB` 约束，无需额外公网拉取与 URL 过期担忧），同时存一份轻量缩略图（最长边 640px）到私有桶 `posters/<userId>/<taskId>.jpg` 用作任务卡/历史卡封面。
- **历史选图**：服务端校验 `generation_id` 归属当前用户且状态为 `succeeded`，为源图生成 **24 小时** signed URL 传入方舟 `content`（取代 1 小时，避免排队超 1 小时 403），并复用源图作为封面与血缘引用，记录结构化 `frame_inputs = { firstFrame: { kind: 'history' | 'upload', generationId?, width, height } }`。
- **正向入口**：在 `/history` 图片卡片、`/generate` 经典结果区及 Agent 画布单图工具栏新增「生成视频」入口，跳转 `/video?mode=i2v&firstFrameId=<generation_id>`；服务端对 `firstFrameId` 做归属校验，非法/他人/不存在的 ID 静默忽略并保持空首帧。

### D8：私有视频存储与历史混排带宽保护
- `generated-videos` bucket 设为**私有（`public: false`）**，避免付费视频外链盗刷与 Supabase 流出流量失控。
- `GET /api/video`、`GET /api/video/[id]` 与 `/history` 服务端在校验登录与归属后，为 `succeeded` 任务签发 1 小时有效的 `signedUrl`（及 `posterUrl`）；下载走 `GET /api/video/[id]/download`（校验归属后重定向或签发带 `Content-Disposition: attachment` 的下载 URL）。
- `history-grid` 混排展示视频卡片时使用 `poster` 封面图 + `<video preload="none">`，仅在用户点击播放时拉取视频流，避免多条 MP4 同时预加载。

### D9：前端工作台交互打磨
- 提交前展示清晰的扣费拆分预览（如「本次消耗 25 积分：优先扣订阅池 25，剩余 75」）。
- 生成中卡片区分展示「排队中 / 生成中 / 保存中」、已等待时长与「通常需 1~3 分钟，可离开页面稍后在历史查看」。
- 所有终态卡片（成功 / 失败 / 过期）均提供「复用参数」回填创建区；失败（非审核拒单）与过期卡片额外提供「一键重试」（生成全新 `Idempotency-Key` 重新预扣提交），审核失败卡片明确引导「修改提示词或首帧后再试」。

### D10：Mock Provider 与环境配置
- `VIDEO_PROVIDER=mock|seedance`（生产环境未设 `ALLOW_MOCK_IN_PRODUCTION=true` 时禁用 `mock`）。
- Mock provider 完整模拟 `queued → running → succeeded/failed/expired` 路径，支持按环境变量（`MOCK_VIDEO_FAILURE`）或测试请求头（`x-mock-video-behavior: fail | moderation | timeout | transfer-fail`，仅在 `VIDEO_PROVIDER=mock` 生效）触发不同失败路径，方便单套 E2E 覆盖全部场景。

## Risks / Trade-offs

- **[方舟调价或模型版本更替]** → 所有价格与模型 ID 收敛在 `lib/video/catalog.ts` + 环境变量，配合单测毛利底线断言（Pro 年卡口径 ≥ 25%）和库表 `provider_usage_tokens` 真实回写，可及时发现偏差并热调映射。
- **[个人方舟账号并发上限仅 3]** → 通过 `VIDEO_MAX_GLOBAL_ACTIVE` 环境变量控制全站并发闸门，且 `429` 不熔断全局；上线生产前须完成企业实名认证（并发提升至 10）并切按量计费账号。
- **[Vercel Serverless 函数时限对大视频转存的压力]** → 首版分辨率收敛至 480p/720p（5s/10s 典型体积 3~18MB），流式转存 + 100MB 硬上限 + 3 次重试足以稳定运行在 Serverless 预算内。
- **[Vercel Hobby 计划 Cron 频率限制]** → 主通道依赖方舟原生 `callback_url` 实时推进，客户端退避轮询覆盖在页场景，Cron 仅作离线漏网兜底（即使降频至每日或每小时一次，只要在 24h 临时 URL 过期前扫到即可保底资产不丢；Pro 计划配每 5 分钟）。
- **[跨周期退款改退永久池被恶意套利]** → 仅限系统/上游失败或超时触发，且单用户并发上限 3 + 仅会员可用，风险极低；审计事件单独记为 `video_refund_redirected` 便于风控核查。

## Migration Plan

1. 迁移 `0007_video_workbench.sql` 纯增量向后兼容（新表、新 RPC、私有 bucket、`credit_events` 新类型），先在 Supabase 执行迁移再部署应用。
2. 环境变量补齐 `VIDEO_PROVIDER`、`SEEDANCE_API_KEY`、`SEEDANCE_BASE_URL`、`SEEDANCE_MODEL_MINI`、`SEEDANCE_MODEL_STANDARD`、`VIDEO_WEBHOOK_SECRET`、`CRON_SECRET`、`VIDEO_PENDING_TIMEOUT_MINUTES`（默认 30）、`VIDEO_MAX_GLOBAL_ACTIVE`（默认 8）。
3. 先用 `VIDEO_PROVIDER=mock` 跑通全量 vitest + Playwright E2E，再在预发环境用真实按量 key 实测 1 条 `preview` 和 1 条 `standard` 任务核对 `callback_url`、转存、播放与 `usage.completion_tokens` 账单后放量。
4. 回滚只需回滚应用代码与 cron 配置；未终结任务可通过管理端或补跑 `refund_video_task` 退款留痕。
