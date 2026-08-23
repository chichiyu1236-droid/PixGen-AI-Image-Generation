## Context

现有资产：`/generate` 经典表单（`components/generation-form.tsx`）、提示词工程（`lib/prompts/builder.ts` + `options.ts`）、生图与存储（`lib/openai/images.ts`、`lib/storage/images.ts`）、原子计费 RPC `record_successful_generation`（成功才扣分）、服务健康探测（`lib/openai/provider-health.ts`）、billing 的 mock provider 先例（`ALLOW_MOCK_IN_PRODUCTION` 守卫）。约束：图片中继 ydata 当前 403；大脑 LLM 需另接国内提供商；不新增 npm 依赖。

## Goals / Non-Goals

**Goals:**
- Agent 循环可全链路测试（模拟大脑 + 真实 Supabase），接真实 LLM/图像 key 时零代码改动
- 计费原子性复用既有 RPC 语义：成功产出才扣分，失败零扣减
- 经典模式行为与 API 完全不变

**Non-Goals:**
- 不做流式输出（SSE/WebSocket）——v1 单请求返回完整轨迹，前端本地动画回放
- 不做图像服务/大脑的多提供商自动路由
- 不做会话分享、跨会话画布

## Decisions

### D1 循环位置与传输：服务端单请求完整循环
用户消息 POST 后，服务端跑完「LLM ↔ 工具」整循环（上限 5 轮），一次性返回本轮全部消息轨迹（assistant 文本、步骤、工具调用、产出图片引用）。前端收到后按序动画回放。替代方案 SSE 流式：体验更实时，但 v1 复杂度高（连接管理、断线重放），且轮次耗时主要在生图本身——留作 v2 演进项，接口按「轨迹数组」设计便于平滑升级。

### D2 大脑客户端：复用 `openai` SDK + 独立环境变量
`lib/agent/brain.ts` 用已依赖的 `openai` SDK 指向 `AGENT_LLM_BASE_URL`（OpenAI 兼容，如智谱 `https://open.bigmodel.cn/api/paas/v4`），模型 `AGENT_LLM_MODEL`（默认 `glm-4.6`）。工具协议用标准 function calling；工具入参出参全部过 zod 校验，LLM 产出不合法参数时回传校验错误让 LLM 自纠一次。`AGENT_PROVIDER=mock` 时走模拟大脑（D8），生产守卫复用 `ALLOW_MOCK_IN_PRODUCTION` 模式。

### D3 工具集：四个工具，薄封装现有能力
- `build_prompt`（免费）：入参为结构化画面字段（imageType/aspectRatio/style/scene/whitespace/subject/extra），复用 `buildImagePrompt`，出参为专业提示词——LLM 负责把大白话翻译成这些字段
- `generate_image`（1 积分）：健康检查 → `generateImageBase64` → `uploadGeneratedImage` → `record_successful_generation`（扩展版，见 D4）
- `edit_image`（1 积分）：入参 `generationId + instruction`；从 Storage 取原图 bytes → `openai.images.edit`（gpt-image-1，prompt = 原提示词 + 编辑指令）→ 上传 → 落库（带 lineage）
- `list_canvas`（免费）：返回当前会话画布图（id、版本、提示词摘要），供 LLM 在用户说「改那张」时定位对象

积分守卫在工具执行前检查（余额 < 消耗时返回工具级错误给 LLM，由 LLM 转述购买引导）。

### D4 数据模型：新表 + `generations` 扩展列
- `agent_sessions(id, user_id, title, created_at, last_message_at)`，RLS 仅 owner 可读，写入走 service-role
- `agent_messages(id, session_id, role: user|assistant, content, trace jsonb, created_at)`——`trace` 存步骤/工具调用/积分消耗/图片引用的有序数组，前端直接按序回放
- `generations` 增加可空列 `agent_session_id`（会话画布恢复的依据）、`parent_generation_id`、`origin('classic'|'agent'|'agent_edit'|'agent_variant')`、`edit_instruction`；`record_successful_generation` 增加同名可选参数（默认值保持现行为，经典路由零改动）
- 索引：sessions(user_id, last_message_at desc)、messages(session_id, created_at)

### D5 API 面
- `POST /api/agent/sessions` 创建会话（返回 id）
- `GET /api/agent/sessions` 列表（id、title、时间）
- `GET /api/agent/sessions/[id]` 完整消息轨迹 + 画布作品
- `POST /api/agent/sessions/[id]/messages` 用户消息 → 跑循环 → 返回新增消息与画布增量

越权一律 404（对齐 pay 页先例）。

### D6 前端：同页双模式 + 轨迹回放
`app/generate/page.tsx` 服务端仍渲染经典表单；新增客户端 `ModeSwitch` + `AgentWorkbench`（对话流/步骤/工具卡/画布，视觉按 `docs/prototypes/agent-workbench.html` 与现有 token）。模式状态存 URL `?mode=agent`（可分享、可刷新）；两模式切换仅切显示，不卸载状态。画布数据 = 会话内 generations（含 lineage 的版本链），选中态纯前端（编辑对象随消息发送）。

### D7 图像编辑：`openai.images.edit` 直传
从 Storage 以 service-role 读取原 `storage_path` 的 bytes，multipart 传给 `/images/edits`（gpt-image-1）。不做局部 mask（v1 指令式编辑足够，即梦同类功能也以指令编辑为主）。失败归类进 provider-health，与生图共用熔断。

### D8 模拟大脑：脚本化意图路由
`lib/agent/brains/mock.ts` 按正则意图（改图/变体/模糊/明确生成）返回预设的工具调用序列与回复文本，积分、落库、画布全部走真实代码路径——与 billing mock 的「回调走真实 webhook 路由」同理，保证 e2e 测的是真链路。同理新增 `IMAGE_PROVIDER=mock`（`lib/openai/images.ts` 返回占位图，生产守卫同 billing），使 e2e 与本地联调不依赖付费图像 relay——这在 ydata 分组 403 未修复期间是唯一可行路径。

## Risks / Trade-offs

- [ydata 403，真实生图/改图当前不可用] → 全部逻辑经 mock 全链路验证；接 key 后无改动切换；健康检查前置拦截
- [LLM 工具调用质量随提供商波动] → zod 校验 + 一次自纠重试 + 系统提示词硬化；mock 大脑保证测试确定性
- [循环多轮 LLM 往返延迟（5-15s）] → v1 非流式 + 前端动画回放掩盖等待；接口按轨迹设计，v2 可平滑换 SSE
- [agent_messages.trace 体积膨胀] → trace 只存摘要（提示词全文存 generations，工具卡引用 id）
- [改图对原图保持力取决于 gpt-image-1 edits 能力] → 画布保留版本链，用户可回退；`edit_instruction` 落库可审计

## Migration Plan

1. `supabase/migrations/0004_agent.sql`（纯新增：两表 + generations 可空列 + RPC 扩展参数），Dashboard/Management API 应用，回滚 = drop 新表/新列
2. 环境变量上线（AGENT_* + 图像 key 修复），`AGENT_PROVIDER=mock` 先行部署验证 UI 全链路
3. 切 `AGENT_PROVIDER=real` 灰度自测（生成/改图/变体各一单）

## Open Questions

- 会话列表 UI 入口放哪（顶栏「历史」聚合 vs 工作台内侧栏）——实现时按现有导航习惯定，不阻塞
- 会话标题自动摘要——v1 用首条用户消息截断，后续可换 LLM 摘要
