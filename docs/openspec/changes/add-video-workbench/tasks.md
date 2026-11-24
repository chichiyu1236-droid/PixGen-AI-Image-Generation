## 1. 配置、目录与会员门控

- [ ] 1.1 扩展 `lib/env.ts`：新增 `VIDEO_PROVIDER`（`mock|seedance`）、`SEEDANCE_API_KEY`、`SEEDANCE_BASE_URL`（默认 `https://ark.cn-beijing.volces.com/api/v3`）、`SEEDANCE_MODEL_MINI`（默认 `doubao-seedance-2-0-mini-260615`）、`SEEDANCE_MODEL_STANDARD`（默认 `doubao-seedance-2-0-260128`）、`VIDEO_WEBHOOK_SECRET`、`CRON_SECRET`、`VIDEO_PENDING_TIMEOUT_MINUTES`（默认 30）、`VIDEO_MAX_GLOBAL_ACTIVE`（默认 8），mock 生产守卫复用 `ALLOW_MOCK_IN_PRODUCTION`；验证 `npm run typecheck` 通过且缺失必填项时报错
- [ ] 1.2 新建 `lib/video/catalog.ts`（前端安全的 3 预设 × 2 时长目录与比例/模式规则：`preview 480p = 12/24`、`standard 720p = 25/50`、`pro 720p = 50/100`，5 比例 + i2v `adaptive`）与 `lib/video/pricing-server.ts`（服务端成本基准与模型映射）；vitest 单测覆盖全 6 SKU 查价、非法组合/文生 `adaptive` 拒绝、以及 Pro 年卡口径（¥0.139/分）≥ 25% 毛利底线断言
- [ ] 1.3 新建 `lib/video/membership-gate.ts`（复用 `getCreditBalance`，非会员或读取异常 fail-closed 返回 `video_membership_required`）与 `lib/video/provider-health.ts`（仅 `401/403`/欠费/连续 `5xx` 触发 503 熔断，显式排除 `429` 限流）；vitest 单测覆盖会员门控 fail-closed 与 429 不熔断行为

## 2. 数据库迁移与资金 RPC

- [ ] 2.1 新增 `supabase/migrations/0007_video_workbench.sql`：`video_generations` 表（统一状态枚举 `queued|running|transferring|succeeded|failed|expired`、`idempotency_key` 唯一约束、`preset_id`/`model_id`/`generate_audio`/`frame_inputs`/`credits_charged`/`credits_sub_split`/`provider_task_id`/`provider_video_url`/`provider_usage_tokens`/`storage_path`/`poster_storage_path`/`transfer_attempts`/`transfer_started_at`/`error_code`/`error_reason`/`refunded_at`/`late_succeeded_at`）+ RLS（仅本人可读）+ 活跃任务部分索引；`credit_events` 类型扩展 `video_charge`/`video_refund`/`video_refund_redirected`；新建**私有** `generated-videos` storage bucket；验证迁移可在 Supabase 应用且 RLS 拒绝跨用户读取
- [ ] 2.2 在 `0007_video_workbench.sql` 实现三个 `service_role` 专用 RPC（revoke 自 client role）：
  - `submit_video_task`：幂等键重放 → 锁 profile → 过期订阅池清零 → **先清理该用户超时僵尸任务并退款** → 单用户上限（3）与全站并发闸门校验 → 双池原子预扣并写 `credits_sub_split` 与 `video_charge` → 插入 `queued` 任务
  - `refund_video_task`：基于 `refunded_at is null` 的幂等终态翻转 + 跨周期退款规则（原订阅池未过期回订阅池记 `video_refund`，已过期改退永久池记 `video_refund_redirected`）
  - `claim_video_transfer`：原子抢占 `transferring` 锁（含 2 分钟陈旧锁回收与 3 次上限）
  - 验证 SQL/集成测试覆盖：幂等重放、僵尸槽自动释放、单用户/全站 429、余额不足 402、双池顺序扣费、未过期原池退款、已过期订阅池改退永久池、重复退款幂等

## 3. Provider 层与首帧/转存管道

- [ ] 3.1 新建 `lib/video/provider.ts` 抽象（`createTask` / `getTask` / `cancelTask`）与解析逻辑（含 mock 生产守卫）；vitest 覆盖生产禁用 mock 守卫
- [ ] 3.2 实现 Seedance 客户端（`lib/video/providers/seedance.ts`）：`POST`/`GET`/`DELETE` `/api/v3/contents/generations/tasks`，所有规格参数走**顶层结构化 JSON 字段**（`ratio`/`resolution`/`duration`/`watermark: false`/`generate_audio`/`execution_expires_after: 3600`/`callback_url`，禁止拼接 `--` 到 `text`）；错误分类区分 `content_moderation` / `rate_limit(429)` / `auth_or_quota` / `provider_error`；vitest 单测（fetch mock）覆盖请求构造、提示词含 `--duration` 不注入、状态与错误映射、取消调用
- [ ] 3.3 实现 Mock provider（`lib/video/providers/mock.ts`）：支持正常生成内置极小有效 MP4 及受控失败路径（环境变量或仅 mock 模式生效的测试 header 触发 `fail`/`moderation`/`timeout`/`transfer-fail`）；vitest 覆盖全部路径
- [ ] 3.4 扩展 `lib/storage/videos.ts`（`ensureGeneratedVideosBucket` 私有桶校验、流式上传 MP4 含 100MB 大小上限、轻量封面上传、短期签名播放/下载 URL 生成）与 `lib/video/first-frame.ts`（历史来源归属校验 + 24h signed URL；本地上传校验 PNG/JPEG/WebP 与 8MB 限制，输出标准 `data:image/jpeg;base64,...` 与封面图）；vitest 覆盖归属拒绝、24h 签名与大小限制

## 4. 统一任务推进器与 API 路由

- [ ] 4.1 新建 `lib/video/reconcile.ts` 统一推进器：查询供应商状态 → 终态失败退款 → 成功时调 `claim_video_transfer` 抢锁并流式转存（单次抖动失败且 `transfer_attempts < 3` 回退 `running` 重试，耗尽才 `failed` 退款）→ 超时（30 分钟）先 best-effort `cancelTask` 再 `expired` 退款 → 迟到成功仅记 `late_succeeded_at`；vitest 覆盖并发抢锁防重、转存重试成功、重试耗尽退款、超时取消与迟到成功
- [ ] 4.2 实现 `POST /api/video` 与 `GET /api/video`（列表）：zod 全量校验（含 t2v 拒 `adaptive`、`Idempotency-Key` 校验）→ `requireVideoMembership`（403）→ `provider-health`（503）→ 首帧处理 → `submit_video_task` → 调 `provider.createTask`（失败立即退款，429 不熔断全局）→ 回写 `provider_task_id`；`GET /api/video` 返回本人任务与短期签名 `videoUrl`/`posterUrl`（允许过期会员只读）；vitest 覆盖 401/403/400/402/429/503/502、幂等重放与成功路径
- [ ] 4.3 实现 `GET /api/video/[id]` 与 `GET /api/video/[id]/download`：归属校验（越权返回 404），非终态调用 `reconcileVideoTask`（含 2s 节流），终态直接签发私有桶短期播放/下载 URL 不再打上游；vitest 覆盖权限隔离、状态流转与终态零上游调用
- [ ] 4.4 实现 `POST /api/webhooks/video/seedance`（HMAC 验签后反查上游确认，再调 `reconcileVideoTask`）与 `GET /api/cron/video-reconcile`（校验 `CRON_SECRET` 批量扫描滞留活跃任务）并在 `vercel.json` 配置定时任务；vitest 覆盖非法签名 401、合法回调推进与 cron 批量兜底

## 5. 前端工作台与跨页串联

- [ ] 5.1 新增 `/video` 服务端页面壳（登录守卫、读取会员态与双池余额、校验可选 `firstFrameId` 归属并静默忽略非法 ID）并在主导航增加「视频工作台」入口；同步更新 `/upgrade` 定价页（[pricing-plans.tsx](file:///D:/PixGen/components/pricing-plans.tsx)）免费栏与付费栏文案，明示「Agent 对话与视频工作台为会员专属」
- [ ] 5.2 实现创建区组件：文生/图生切换、3 档预设卡（`快速预览 480p` / `标准高清 720p` / `高画质 720p`）、5s/10s 时长、5 比例 + i2v `adaptive`、可选同步音效开关、实时消耗与双池拆分预览；非会员渲染锁标与升级引导；余额不足与并发上限提示；提交时生成并复用单次请求的 `Idempotency-Key`
- [ ] 5.3 实现本地首帧选择器（压缩至最长边 **1920px** JPEG ≤ 8MB，拒绝非 PNG/JPEG/WebP）与图像历史选图模态；在 `/history` 图片卡、`/generate` 经典结果区与 Agent 画布作品卡增加「生成视频」快捷跳转按钮（`/video?mode=i2v&firstFrameId=<id>`）
- [ ] 5.4 实现任务卡流组件与退避轮询 hook（3s → 5s → 10s、`visibilitychange` 暂停/恢复刷新、终态停止）：展示排队/生成/保存阶段与已等待时长、成功内联播放与下载、失败按原因分类展示（审核拒绝引导修改提示词，系统/超时失败提供「一键重试」），全部终态卡片提供「复用参数」回填创建区

## 6. 历史混排与端到端验证

- [ ] 6.1 扩展 `history-grid` 支持图片与视频混排：提供「全部 / 图片 / 视频」筛选；视频卡展示类型标识、`poster` 封面、规格标签与 `<video preload="none">` 按需播放和下载；保留图片卡「生成视频」入口
- [ ] 6.2 补充 Playwright E2E（`e2e/video.spec.ts`，mock provider）：覆盖非会员锁标与 403 拦截、会员文生/图生完整流转至播放、从历史/Agent 一键带首帧跳转、受控失败退款与重试、审核失败提示、3 并发上限拦截、历史混排筛选与会员到期后只读播放
- [ ] 6.3 全量回归校验：`npm run lint && npm run typecheck && npm test && npm run build && npm run e2e` 全绿；更新 `README.md` 补充视频工作台环境变量、Webhook/Cron 配置与企业按量计费账号说明
