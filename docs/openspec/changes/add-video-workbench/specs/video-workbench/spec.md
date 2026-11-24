## Purpose

定义视频生成工作台的完整行为契约：会员专属门控与到期只读、文生/图生视频的收敛画质预设与参数校验、图像历史与 Agent 画布一键转视频的双向首帧链路、幂等提交与双池原子预扣/跨周期退款、基于回调 + 服务端巡检 + 客户端退避轮询的异步生命周期与原子转存、私有存储签名播放、历史混排以及 mock provider 与健康守卫。

## ADDED Requirements

### Requirement: 视频工作台入口、会员门控与布局
系统 SHALL 提供独立视频工作台页面（`/video`）并在主导航增加入口。未登录访问 SHALL 引导至登录。视频任务提交 SHALL 为会员专属能力：非会员用户访问 `/video` SHALL 可见工作台概览与带会员专属锁标的创建区，点击锁标或尝试提交 SHALL 展示升级引导（含 `/upgrade` 入口），MUST NOT 创建任务或扣除积分。`POST /api/video` 服务端接口 SHALL 复用会员余额引擎校验当前用户会员状态，非会员或状态读取失败（fail-closed）MUST 被拒绝并返回 HTTP 403 与错误码 `video_membership_required`。有效期内产生的视频任务在会员到期后 SHALL 保留只读查看、播放与下载，MUST NOT 被删除。

#### Scenario: 会员登录后进入工作台
- **WHEN** 有效会员访问 `/video`
- **THEN** 页面展示可用的创建区（文生/图生模式与参数项）和按创建时间倒序排列的任务区

#### Scenario: 非会员看到带锁入口并被升级引导
- **WHEN** 未开通会员的已登录用户访问 `/video` 并尝试提交
- **THEN** 页面展示会员专属锁标与前往 `/upgrade` 的升级引导，不发起创建请求

#### Scenario: 服务端拒绝非会员提交
- **WHEN** 非会员绕过前端直接调用 `POST /api/video`
- **THEN** 系统返回 HTTP 403 与 `video_membership_required`，不创建任务、不扣积分、不调用供应商

#### Scenario: 会员到期后历史视频保持只读可用
- **WHEN** 会员期内的用户会员到期后访问 `/video` 或 `/history`
- **THEN** 既有视频任务与结果仍可正常查看、播放与下载；发起新的视频提交被 403 拦截并提示续费

### Requirement: 文生与图生参数矩阵与结构化传参
视频工作台 SHALL 提供 3 档画质预设与 2 档时长，共 6 个定价组合：
- `preview`（快速预览 · 480p，默认底层模型 Seedance 2.0 mini）
- `standard`（标准高清 · 720p，默认选中，默认底层模型 Seedance 2.0 mini）
- `pro`（高画质 · 720p，默认底层模型 Seedance 2.0）
- 时长：`5s`、`10s`
- 画面比例：`16:9`、`9:16`、`1:1`、`4:3`、`3:4`（图生视频额外支持并默认选中 `adaptive` 以跟随首帧原比例；文生视频 MUST 拒绝 `adaptive`）
- 提示词：文生视频必填（2~2000 字符），图生视频选填（上限 2000 字符）
- 可选同步音效开关（`generateAudio`，布尔值，默认 `false`）

服务端 SHALL 校验全部枚举与模式兼容性；非法值 MUST 被拒绝且不产生任务与扣费。调用方舟创建接口时，全部控制参数（`ratio`、`resolution`、`duration`、`watermark`、`generate_audio`）MUST 通过顶层结构化 JSON 字段传递，MUST NOT 拼接 `--` 命令行参数到提示词文本尾部，以防止用户输入提示词篡改计费规格。

#### Scenario: 合法文生提交
- **WHEN** 会员填写提示词并选择 `standard` / `5s` / `16:9` 后提交
- **THEN** 系统以结构化 JSON 字段创建视频任务，任务卡片进入 `queued` 状态

#### Scenario: 提示词含参数标志不影响计费与生成规格
- **WHEN** 用户在 `preview` / `5s` 档位的提示词中写入 `--duration 10 --resolution 1080p`
- **THEN** 服务端按结构化字段传递 `duration: 5` 与 `resolution: "480p"`，用户提示词作为纯文本传入，计费与输出规格不受篡改

#### Scenario: 文生传入 adaptive 或非法枚举被拒
- **WHEN** 文生请求携带 `ratio: "adaptive"` 或非法预设/时长
- **THEN** 系统返回 400 参数校验错误，不创建任务、不扣积分

### Requirement: 图生视频首帧与正向一键跳转
图生视频模式 SHALL 要求且仅接受 1 张首帧图，来源为「从图像历史选择」或「本地上传」；未提供首帧的图生提交 MUST 被拒绝。
- **本地上传**：SHALL 支持 PNG、JPEG、WebP，客户端发送前压缩为最长边不超过 **1920px** 的 JPEG（单文件上限 8MB）；不支持的格式或超限文件 MUST 在选择时被拒绝。提交时以标准 Base64 Data URL 传入供应商，并保存轻量封面图用于任务卡展示。
- **历史选图与正向入口**：历史选图 SHALL 经服务端归属校验，仅当前用户本人状态为 `succeeded` 的图像生成可选用，传给供应商时签发有效期为 **24 小时** 的 URL。`/history` 图像卡片、`/generate` 经典生图结果区及 Agent 画布作品卡片 SHALL 提供「生成视频」快捷入口，点击后跳转 `/video?mode=i2v&firstFrameId=<generation_id>` 并预填首帧；若 `firstFrameId` 不存在、非本人或非成功状态，页面 SHALL 静默忽略预填并呈现空首帧槽位，MUST NOT 报错中断页面。

#### Scenario: 从 Agent 画布或历史记录一键转视频
- **WHEN** 会员在历史记录或 Agent 画布点击自己某张成功图片的「生成视频」
- **THEN** 跳转到 `/video?mode=i2v&firstFrameId=<id>`，自动切到图生模式、预填该图片为首帧并默认选中 `adaptive` 比例

#### Scenario: 构造他人图片 ID 预填被静默忽略
- **WHEN** 用户携带他人或不存在的 `firstFrameId` 访问 `/video`
- **THEN** 首帧槽位保持为空，页面正常加载无报错

#### Scenario: 本地上传高分辨率首帧不压损至 1024px
- **WHEN** 用户选择一张 3840×2160 的 PNG 本地图片作为首帧
- **THEN** 系统将其压缩至最长边 1920px 的 JPEG（≤ 8MB）纳入槽位，保留 720p/高清首帧细节

#### Scenario: 上传不支持的格式被拒
- **WHEN** 用户选择 GIF 或 PDF 文件作为首帧
- **THEN** 系统在选择时即拒绝并提示仅支持 PNG / JPEG / WebP

### Requirement: 变价计费、毛利底线与双池拆分预览
视频积分价格 SHALL 由服务端目录单一来源按 `(presetId, duration)` 确定，客户端提交的任何价格或积分数 MUST 被忽略。当前定价为：
- `preview`（480p）：5s = 12 积分，10s = 24 积分
- `standard`（720p）：5s = 25 积分，10s = 50 积分
- `pro`（720p）：5s = 50 积分，10s = 100 积分
- 开启 `generateAudio` 不额外加收积分。

工作台创建区 SHALL 在提交前实时展示「本次将消耗 X 积分」及基于当前余额的**双池预计拆分**（优先消耗订阅池、不足部分消耗永久池）。

#### Scenario: 切换档位与时长实时更新消耗与拆分
- **WHEN** 订阅池剩余 30 分、永久池剩余 50 分的会员将档位从 `standard/5s`（25 分）切至 `pro/5s`（50 分）
- **THEN** 提交前预览立即更新为「消耗 50 积分（订阅池 30 + 永久池 20）」

#### Scenario: 服务端定价不可篡改
- **WHEN** 提交请求附带伪造的 `credits` 或 `price` 字段
- **THEN** 系统按服务端目录扣费，忽略客户端数值

### Requirement: 幂等提交、僵尸槽清理、双重并发控制与原子预扣
`POST /api/video` SHALL 支持并校验 `Idempotency-Key`（唯一键 `(user_id, idempotency_key)`）：重复提交同一键 SHALL 直接返回已创建的任务与最新余额，MUST NOT 重复预扣或重复调用供应商。

任务提交 SHALL 在单个原子数据库事务内完成：
1. 幂等检查；
2. 锁 profile 并惰性清零已过期订阅池（记 `membership_expire` 事件）；
3. **先清理当前用户超期僵尸任务**：将当前用户超过超时阈值（默认 30 分钟）仍处于 `queued`/`running` 的任务自动置为 `expired` 并完成退款，释放并发槽位；
4. 检查单用户处于 `queued`/`running`/`transferring` 的任务数 SHALL NOT 超过 3，且全站处于 `queued`/`running` 的任务数 SHALL NOT 超过可配置全局上限（默认 8），任一超限返回 HTTP 429 且不扣积分；
5. 余额不足返回 HTTP 402；余额充足则按「订阅池优先、永久池其后」预扣积分，同事务写入 `credits_sub_split` 快照、`video_charge` 积分事件并插入 `queued` 任务记录。

预扣后调用供应商创建任务明确失败时，系统 SHALL 立即调用退款 RPC 全额退款并将任务置为 `failed`。

#### Scenario: 重复提交同一 Idempotency-Key 不重扣
- **WHEN** 客户端因网络抖动用相同的 `Idempotency-Key` 连续发送两次 `POST /api/video`
- **THEN** 系统仅扣费一次并创建一条任务，第二次请求返回同一任务标识

#### Scenario: 僵尸超时任务不永久锁死 3 并发槽
- **WHEN** 用户已有 3 个创建时间超过 30 分钟且未轮询的 `queued` 任务，随后再次提交新任务
- **THEN** 事务内先将 3 个超时任务自动置为 `expired` 并退款，随后新任务正常通过并发校验并提交成功

#### Scenario: 达到单用户并发上限或全站并发闸门
- **WHEN** 用户当前已有 3 个活跃未超期视频任务（或全站活跃任务已达全局上限）并再次提交
- **THEN** 系统返回 HTTP 429 并提示稍后再试，不扣积分、不调用供应商

#### Scenario: 余额不足返回 402
- **WHEN** 会员有效总余额小于所选预设积分并提交
- **THEN** 系统返回 HTTP 402 并引导前往 `/upgrade`，不创建任务

### Requirement: 统一异步状态机、双通道推进与超时取消
视频任务 SHALL 使用统一状态机：`queued → running → transferring → succeeded / failed / expired`。用户 SHALL 仅能查看、轮询与下载自己的任务。

系统 SHALL 通过三条路径协同推进非终态任务（共用幂等推进逻辑）：
1. **方舟回调（主通道）**：提供 `POST /api/webhooks/video/seedance`，验签通过后反查方舟任务详情确认真实状态再推进；
2. **服务端定时巡检（兜底通道）**：提供受 `CRON_SECRET` 保护的 `GET /api/cron/video-reconcile`，定期扫描滞留的活跃任务并完成转存或超时清算，确保用户提交后关闭页面不会在 24 小时后丢失视频或遗漏退款；
3. **客户端退避轮询（交互加速）**：工作台对活跃任务按退避间隔（3s → 5s → 10s）轮询；页面不可见时暂停，恢复可见时立即刷新一次；终态任务停止轮询且不再请求供应商。

向供应商提交任务时 SHALL 设置 `execution_expires_after = 3600`（方舟允许的最小超时）。任务创建超过应用层超时阈值（默认 30 分钟）仍未成功时，系统 SHALL best-effort 调用供应商取消接口（`DELETE`），随后将任务标记为 `expired` 并自动退款；若之后收到迟到成功回调，SHALL 仅记录审计标记，MUST NOT 覆盖已退款终态或二次扣费。

#### Scenario: 用户关页后由回调或巡检完成转存
- **WHEN** 会员提交任务后立即关闭浏览器标签页，2 分钟后供应商生成完成
- **THEN** 服务端通过回调或定时巡检自动下载转存视频并将任务置为 `succeeded`，用户次日回到 `/history` 可直接播放

#### Scenario: 轮询不可见暂停与终态停止
- **WHEN** 页面切到后台或任务进入 `succeeded`/`failed`/`expired`
- **THEN** 客户端暂停或停止轮询请求，终态查询不再调用供应商接口

#### Scenario: 超过 30 分钟自动尝试取消并退款
- **WHEN** 某任务在 `queued`/`running` 停留超过 30 分钟
- **THEN** 系统尝试取消上游任务、置状态为 `expired`、全额退款，卡片展示过期与已退款说明

### Requirement: 原子转存锁、重试与私有存储签名播放
供应商返回的 `video_url` 为 24 小时临时地址。任务在供应商侧成功后，服务端 MUST 先通过数据库条件更新原子抢占 `transferring` 锁，防止多标签轮询与回调并发重复下载上传。

系统 SHALL 流式下载 MP4（体积上限 100MB）并转存至**私有**对象存储桶 `generated-videos`，同时记录 `provider_usage_tokens` 与持久 `storage_path`。若单次转存因网络波动失败且尝试次数未达上限（3 次），系统 SHALL 回退状态为 `running` 并保留临时地址待下一次推进重试，MUST NOT 因单次抖动立刻作废已计费视频；重试耗尽后才标记 `failed`（错误码 `transfer_failed`）并全额退款。

视频播放与下载 SHALL 通过服务端归属校验后签发的短期签名 URL 提供，MUST NOT 暴露永久免鉴权公共视频地址。

#### Scenario: 并发轮询不重复转存
- **WHEN** 两个并发请求在同一时刻查询到同一任务在供应商侧 `succeeded`
- **THEN** 仅有一个请求成功抢占 `transferring` 锁并执行下载上传，另一个请求直接返回当前状态，不产生重复上传或重复退款

#### Scenario: 转存单次抖动重试成功
- **WHEN** 首次转存下载超时失败，第二次重试成功
- **THEN** 任务最终进入 `succeeded` 并生成持久视频，不发生误退款

#### Scenario: 24 小时后经签名地址播放与下载
- **WHEN** 任务成功超过 24 小时后用户从历史记录点击播放或下载
- **THEN** 服务端校验归属后签发私有桶短期播放/下载链接，用户正常播放与下载

### Requirement: 跨周期退款安全、错误分类与参数复用/重试
`failed` / `expired` 任务的退款 RPC MUST 保持幂等（每个任务最多退款一次），并按预扣时的 `credits_sub_split` 快照回填：
- 永久池扣减份额无条件回填至永久池；
- 订阅池扣减份额：若退款时刻订阅池尚未过期，回填至订阅池并记 `video_refund`；若原订阅池**已过期**，自动改退至永久池并记 `video_refund_redirected` 审计事件，MUST NOT 退回已过期池导致下次读路径清零。

失败任务 SHALL 区分错误原因类别：内容审核拒绝（`content_moderation`）提示用户修改提示词或首帧，不提供盲目原样一键重试；系统/供应商/超时失败提供「一键重试」（以全新 `Idempotency-Key` 按当前价目重新提交，原记录保留）。全部终态卡片（含成功卡片）SHALL 提供「复用参数」按钮，一键回填创建区便于微调再生成。

#### Scenario: 订阅池未过期时原池回填
- **WHEN** 任务预扣订阅池 15 分、永久池 10 分，随后在订阅池有效期内失败
- **THEN** 订阅池加回 15 分、永久池加回 10 分，并写入 `video_refund` 事件

#### Scenario: 订阅池跨周期过期后改退永久池
- **WHEN** 用户在订阅池到期前 10 分钟预扣订阅池 25 分，25 分钟后任务失败
- **THEN** 25 分改退至永久池，写入 `video_refund_redirected` 事件，用户下次读取余额时这 25 分不会被清零

#### Scenario: 审核拒绝与成功卡片交互
- **WHEN** 任务因内容审核失败或正常生成成功
- **THEN** 审核失败卡片提示修改内容并提供「复用参数」；成功卡片提供播放、下载与「复用参数」

### Requirement: 历史混排、筛选与按需加载
`/history` 历史记录 SHALL 将图片与成功视频按时间统一混排展示，并提供「全部 / 图片 / 视频」类型筛选。视频卡片 SHALL 带类型标识、封面图（`poster`）、时长与规格标签，默认采用 `preload="none"` 仅在用户点击播放时加载视频流，并支持下载。历史中成功的图片卡片 SHALL 提供「生成视频」快捷入口（见首帧要求）。

#### Scenario: 视频混排与类型筛选
- **WHEN** 用户生成视频成功后访问 `/history` 并切换「视频」筛选
- **THEN** 默认视图混排展示图片与视频，切换「视频」后仅展示视频卡片，且首屏不自动下载全部 MP4 视频流

### Requirement: Mock Provider、生产守卫与 429 限流隔离
系统 SHALL 支持 `VIDEO_PROVIDER=mock`，无需外部密钥即可跑通提交、回调/轮询、转存、成功、审核失败、系统失败、转存失败与超时退款全链路。生产环境未显式设置 `ALLOW_MOCK_IN_PRODUCTION=true` 时 MUST 禁止 `mock`。

供应商健康检查（`provider-health`）SHALL 在连续出现账号级或服务级故障（`401`/`403`/欠费/连续 `5xx`）时进入不健康窗口并返回 HTTP 503（不预扣积分）。供应商返回 `429` 并发或频控限流错误时 MUST NOT 触发全局不健康熔断，仅按当前任务失败退款并返回可重试提示。

#### Scenario: mock 覆盖成功与受控失败退款
- **WHEN** 本地环境设置 `VIDEO_PROVIDER=mock`
- **THEN** 正常提交可轮询至成功播放；触发受控失败开关或测试请求头时任务进入对应失败态并准确退回积分

#### Scenario: 生产环境禁用 mock
- **WHEN** 生产环境未允许 mock 且配置 `VIDEO_PROVIDER=mock`
- **THEN** 系统拒绝使用 mock 并返回服务不可用

#### Scenario: 429 限流不熔断全站
- **WHEN** 供应商对单次提交返回 HTTP 429
- **THEN** 该次任务退款并返回可重试错误，其他用户后续提交不被 503 全局熔断拦截
