## Why

产品目前只有静态图像生成，而用户已具备火山方舟 Seedance 的调用能力，视频生成是自然的延伸：已有图像历史可直接作为图生视频的首帧，复用率高；即梦、可灵、海螺等竞品已将「文生/图生视频工作台」验证为标准范式。本次按完整体验落地，不做阉割 MVP。

## What Changes

- 新增独立「视频工作台」页面（/video）：文生视频与图生视频双模式；模型档位 lite / pro，时长 5s / 10s，分辨率 480p / 720p / 1080p，多画面比例（16:9、9:16、4:3、3:4、1:1、21:9）
- 新增异步任务链路：提交任务（原子预扣积分）→ 客户端轮询任务状态 → 成功后把有时效（24h）的视频 URL 转存至 Supabase Storage → 失败或超时自动退款
- 新增视频变价计费：按「模型 × 时长 × 分辨率」的积分价目表（服务端常量，上线前按方舟控制台实价校准）；单用户并发 pending 任务上限
- 视频接入历史记录：与图片混排展示并支持类型筛选；历史图片可一键用作 i2v 首帧
- 新增 Provider 抽象：`VIDEO_PROVIDER=mock|seedance`（mock 供本地开发与 e2e，生产禁用守卫与图像 provider 一致）
- 新增数据库迁移：视频任务表（状态机 + provider 任务号）、变价扣费 RPC（复用既有双池扣费顺序）、credit_events 退款类型、generated-videos bucket

## Capabilities

### New Capabilities

- `video-workbench`：视频生成工作台的完整行为契约——创建参数与校验、任务生命周期（提交/轮询/成功/失败/过期）、变价积分计费与预扣退款、i2v 首帧来源（历史选图/本地上传）、历史混排、mock provider、并发限制

### Modified Capabilities

（无——生成扣费的既有需求分别属于 classic-reference-images / agent-workbench / membership，其行为不变；视频的计费语义全部落在 video-workbench 新规格内）

## Impact

- **数据库**：新迁移（0007）——`video_generations` 表、变价扣费与退款 RPC、credit_events 新事件类型、`generated-videos` storage bucket
- **后端**：`lib/video/`（Seedance 客户端、mock provider、价目表）、`app/api/video/`（提交与查询路由）、`lib/storage/`（视频上传）、`lib/env.ts`（新环境变量）
- **前端**：`app/video/page.tsx`、任务卡流组件、首帧选择器（复用图像历史）、`history-grid` 混排
- **测试**：vitest 单测（价目表、任务校验、退款语义）+ Playwright e2e（mock provider）
- **运维/成本**：Agent Plan 订阅仅适用于开发与内测，生产必须切换按量计费账号；视频单条成本约为图像 5~20 倍，价目表常量须在上线前按方舟控制台实价校准
