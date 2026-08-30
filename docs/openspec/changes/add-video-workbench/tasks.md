## 1. 配置与环境

- [ ] 1.1 扩展 `lib/env.ts`:新增 `VIDEO_PROVIDER`、`SEEDANCE_API_KEY`、`SEEDANCE_BASE_URL`、`SEEDANCE_MODEL_LITE`、`SEEDANCE_MODEL_PRO`、`VIDEO_PENDING_TIMEOUT_MINUTES`(默认 30),mock 生产守卫复用 `ALLOW_MOCK_IN_PRODUCTION`;验证 `npm run typecheck` 通过且缺失必填项时 `getServerEnv` 报错
- [ ] 1.2 新建 `lib/video/pricing.ts`:tier × duration × resolution 价目表与 `getVideoCreditsCost()`(基准 lite 720p 5s = 10 积分,时长线性、分辨率按 token 公式折算);vitest 单测覆盖全矩阵取值、非法组合报错
- [ ] 1.3 新建 `lib/video/provider-health.ts`(与图像版同构:失败标记、重试窗口、503 附 retryAfterSeconds);vitest 单测覆盖健康/不健康状态翻转

## 2. 数据库迁移

- [ ] 2.1 新增 `supabase/migrations/0007_video_workbench.sql`:`video_generations` 表(状态机、provider_task_id、计费快照 credits_charged/credits_sub_split、首帧来源、内外视频地址、error_reason)+ RLS(仅本人可读)+ 索引(user_id, status);`credit_events` 类型扩展 `video_charge`/`video_refund`;`generated-videos` bucket;验证:迁移在本地 Supabase 应用成功,RLS 拒绝跨用户读取
- [ ] 2.2 新增 RPC `submit_video_task`(单事务:锁 profile、过期订阅池清零、pending>3 拒绝、双池预扣、写 credits_sub_split 快照与 video_charge 事件、插入任务行)与 `refund_video_task`(按快照逐池回填、写 video_refund 事件、置 failed/expired),均 revoke 自 client role;验证:supabase 测试或 SQL 冒烟覆盖「余额不足」「并发超限」「订阅池优先」「退款逐池回填」四种路径

## 3. Provider 层

- [ ] 3.1 新建 `lib/video/provider.ts` 抽象(`createTask`/`getTask`)与类型定义;`VIDEO_PROVIDER` 解析与 mock 生产守卫(同 `resolveImageProvider` 模式);验证 typecheck + 单测
- [ ] 3.2 实现 Seedance 客户端:POST/GET `/api/v3/contents/generations/tasks`,参数嵌入 text 尾部(--ratio/--duration/--resolution/--watermark),i2v 传首帧 signed URL,鉴权/配额错误接入 provider-health;vitest 单测(fetch mock)覆盖请求构造、参数拼接、状态映射与错误分类
- [ ] 3.3 实现 mock provider:立即成功返回预置小视频,`MOCK_VIDEO_FAILURE` 受控失败开关覆盖退款路径;单测覆盖成功/失败两路径

## 4. 存储与转存

- [ ] 4.1 扩展 `lib/storage/`:`ensureGeneratedVideosBucket` 与 `uploadGeneratedVideo`(mp4 上传、公共读取、路径规则与图像一致);单测覆盖路径构造与异常
- [ ] 4.2 首帧处理:`lib/video/first-frame.ts`——历史来源(服务端归属校验 + 生成 1 小时 signed URL)与上传来源(压缩至最长边 1024px JPEG);单测覆盖归属校验拒绝与压缩体积上限

## 5. API 路由

- [ ] 5.1 `POST /api/video`:zod 校验(t2v 必填提示词、i2v 必填首帧、枚举全检)→ provider 健康 503 → 调 `submit_video_task` 预扣 → provider `createTask` 失败即 `refund_video_task` 并返回 502;返回任务标识与剩余积分;vitest 覆盖 401/400/402/并发 429/503/502 与成功路径(mock)
- [ ] 5.2 `GET /api/video/[id]` 与 `GET /api/video`(列表):归属校验 404/403;pending 任务同步查询 provider 刷新状态;succeeded 时下载转存并写回持久地址(转存失败按 failed 退款);超过 30 分钟 pending 判 expired 并退款;终态任务不再打 provider;vitest 覆盖状态迁移、转存、过期退款与权限

## 6. 前端工作台

- [ ] 6.1 `/video` 页面壳(服务端组件,登录守卫与布局)+ 导航加入「视频工作台」入口;验证:登录后可访问,未登录跳转登录
- [ ] 6.2 创建区组件:文生/图生模式切换、提示词、档位/时长/分辨率/比例选择、消耗预览(读 `pricing.ts` 常量)、提交按钮(余额不足与并发上限提示);验证:提交前预览随参数联动,非法组合不可提交
- [ ] 6.3 任务卡流组件:轮询 hook(3s、visibilitychange 暂停/恢复立即刷新、终态停止),成功内联播放与下载、失败展示原因与「积分已退回」及一键重试(重新计费提交)、过期态展示;验证:mock provider 下全状态流转可见且终态后无轮询请求
- [ ] 6.4 首帧选择器:本地上传(PNG/JPEG/WebP,超限即拒)与图像历史选图模态;验证:他人/不存在图片不可选中

## 7. 历史混排

- [ ] 7.1 `history-grid` 支持 kind 混排:视频卡片带类型标识、内联播放、下载;「全部 / 图片 / 视频」筛选;验证:成功视频与图片混排展示且筛选生效

## 8. 端到端验证

- [ ] 8.1 Playwright e2e(mock provider):登录 → 文生视频提交 → 轮询至成功播放;失败开关路径:提交 → 失败 → 退款提示 → 重试成功;并发上限拒绝;历史混排可见;验证 `npm run e2e` 全绿
- [ ] 8.2 全量校验:`npm run lint && npm run test && npm run typecheck && npm run build` 全绿;README 补充视频工作台环境变量与 Agent Plan/按量计费说明
