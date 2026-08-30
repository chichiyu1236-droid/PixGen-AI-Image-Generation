## Context

现有图像链路是同步单请求(`app/api/generate/route.ts`):校验 → 查余额 → 调 provider 拿 base64 → 上传 Storage → RPC 原子「记录 + 扣 1 积分」→ 返回。视频无法塞进该形状:方舟 Seedance 是异步任务接口(POST 创建任务秒回 id,GET 轮询状态),单条视频生成需 1~3 分钟,供应商返回的 video_url 有效期约 24 小时。计费侧,`profiles` 为双池模型(订阅池 `sub_credits` + 充值池 `credits`),`record_successful_generation`(0006)已实现「订阅池优先、过期先清零、扣费与记录同事务」的原子扣费,但硬编码 1 积分且发生在成功时——视频需要变价、且必须在提交时预扣,否则 pending 期间可无限并发超扣。约束:Vercel serverless 函数有执行时限;e2e 依赖 mock(真模型分钟级等待不可测);Agent Plan 订阅 key 仅限开发/内测,生产须按量计费。

## Goals / Non-Goals

**Goals:**

- 全参数矩阵(lite/pro × 5s/10s × 480/720/1080p × 6 比例 × 文生/图生)与完整任务体验(卡片流、轮询、退款、重试)
- 资金不变量:任何路径下「未出结果必退款」,预扣金额与退款金额逐池对齐
- mock provider 全链路可跑,保住本地开发与 Playwright e2e
- 与既有体系零冲突:双池扣费顺序、provider-health 模式、历史页、积分徽章全部复用既有语义

**Non-Goals:**

- 首尾帧、运镜模板、模板广场、续写/延播(方舟 API 未暴露或属运营型功能)
- Agent 工作台内生成视频(独立工作台优先,Agent 工具后续单独立项)
- Landing 页改版与视频营销文案(后续变更)
- 独立的「视频积分池」(沿用统一双池)

## Decisions

**D1 独立任务表 `video_generations`,不动 `generations`。** 字段差异大(状态机、provider 任务号、预扣快照、池间拆分),混表会污染既有图片查询与 RLS。列:`user_id, status(queued|running|succeeded|failed|expired), provider_task_id, model_tier, duration_s, resolution, ratio, mode(t2v|i2v), prompt, first_frame_source(jsonb), credits_charged, credits_sub_split(jsonb), video_url(内部持久地址), provider_video_url, error_reason, created/updated_at`。状态机:queued → running → succeeded / failed / expired。

**D2 提交原子预扣,新 RPC `submit_video_task`(service_role 调用)。** 单事务内:`for update` 锁 profile → 过期订阅池清零 → 查 pending 数 > 3 则拒绝 → 校验余额 ≥ 价目 → 插入任务行(pending)→ 按双池顺序扣减并记录 `credits_sub_split`(每池扣多少)→ 写 `credit_events`(type=`video_charge`)。退款走 `refund_video_task`:按 `credits_sub_split` 反向逐池回填 + `credit_events`(type=`video_refund`)。不用「成功后扣」——预扣是并发上限的唯一可靠执行点。扣费与扣费快照同事务,保证退款永远对得上账。

**D3 价目表为服务端常量(`lib/video/pricing.ts`),结构为 tier × duration × resolution 的映射。** 基准:lite 720p 5s = 10 积分;pro 约为 lite 的 5 倍成本 → 30 积分;时长线性、分辨率按 token 公式(宽×高×24fps×时长/1024)折算。数值是占位校准点:上线前按方舟控制台实价修改常量即可,不影响结构。UI 的消耗预览与提交计费都读同一份常量,杜绝双源。

**D4 Provider 抽象 `lib/video/provider.ts`,`VIDEO_PROVIDER=mock|seedance`。** 接口仅两个动作:`createTask(input) → { providerTaskId }` 与 `getTask(providerTaskId) → { status, videoUrl?, usageTokens? }`。Seedance 实现:POST/GET `https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks`(Bearer `SEEDANCE_API_KEY`,base URL 可覆盖 `SEEDANCE_BASE_URL` 以便切按量/国际端点),参数按官方格式嵌入 text 尾部(`--ratio 16:9 --duration 5 --resolution 720p --watermark false`),模型号(`doubao-seedance-1-0-lite/pro-t2v/i2v` 及日期版本)放常量便于升级。Mock 实现:立即成功返回预置小视频 URL,带受控失败开关(如 `MOCK_VIDEO_FAILURE=1` 时任务失败),覆盖退款路径的 e2e。生产守卫复用 `ALLOW_MOCK_IN_PRODUCTION` 模式。

**D5 i2v 首帧通过临时签名 URL 传给方舟。** 用户首帧在私有 bucket,方舟需公网拉取:提交时为转存后的首帧副本生成 1 小时 signed URL 放入 `image_url`。任务提交即刻被拉取,1h 足够;拉取失败即任务 failed 走退款。

**D6 轮询与转存在查询端点内完成。** `GET /api/video/[id]`:任务 pending 时同步向方舟查询并刷新本地状态;succeeded 时立即下载 mp4(720p/10s 量级 ≤ 20MB)上传 `generated-videos` bucket(公共,与图像 bucket 一致,便于 `<video>` 播放),把持久地址写回任务,失败按 failed 退款。不做 webhook / cron:方舟无回调机制,惰性判定(expired 的 30 分钟阈值也在轮询路径判定)已覆盖需求,避免引入 Vercel cron 依赖。

**D7 复用 provider-health 模式。** `lib/video/provider-health.ts` 与图像版同构:鉴权/配额类错误标记不健康 + 重试窗口,窗口内提交直接 503(不预扣)。

**D8 前端独立页 + 复用件。** `/video` 页(服务端组件壳 + 客户端工作台);任务卡流组件内置轮询 hook(3s 间隔、`visibilitychange` 暂停/立即刷新、终态停止);首帧选择器复用历史数据源与 classic 参考图选择交互;`history-grid` 增加 kind 维度混排与筛选。导航在主 layout 增加「视频工作台」入口。

**D9 并发与安全。** 所有路由登录 + 归属校验(同 `app/api/generations/[id]` 模式);RPC 均 revoke 自 client role、仅 service_role;并发上限 3 在 RPC 内以 pending 计数执行,不依赖前端。

## Risks / Trade-offs

- [方舟按 token 计费,价目常量与实价偏差导致亏或过贵] → 上线前用控制台实价校准常量;管理端可对账(credit_events 逐笔可审计)
- [首帧 signed URL 失效或方舟拉取失败] → 1h 有效期远超提交窗口;失败路径退款兜底
- [转存大视频超出函数时限] → 单视频 ≤ 20MB 在函数预算内;失败自动退款,用户重试无损失
- [客户端轮询请求放大] → 3s 间隔 + 不可见暂停 + 终态停止;查询端点在 pending 时才打方舟
- [扣费/退款双池拆分不一致造成池间漂移] → 拆分快照 `credits_sub_split` 与扣费同事务写入,退款只按快照回填
- [Agent Plan 订阅跑生产违反服务条款且额度不足] → 文档明示:开发用订阅,生产切按量 key;base URL/密钥均可配置
- [方舟接口或模型版本号变更] → 协议交互收敛在单个 seedance 客户端文件 + mock 对照,mock e2e 保证回归

## Migration Plan

迁移 0007 纯新增(新表、新 RPC、新 bucket、credit_events 类型扩展),向后兼容;先执行迁移再部署应用。回滚:回滚代码即可,新表与 bucket 无害遗留;未终结任务由 expired 语义退款(若代码已回滚,通过管理端手动调整积分,credit_events 留痕)。部署后用 mock provider 走通 e2e,再切 `VIDEO_PROVIDER=seedance` 内测。

## Open Questions

- lite / pro 的方舟控制台实价(lite 单价需二次核实)→ 只影响价目常量数值,不改结构
- 具体模型版本日期号(如 `-250528`)以开通页面为准 → 常量即可
- 方舟账号的并发任务配额 → 若低于产品上限 3,收紧常量
