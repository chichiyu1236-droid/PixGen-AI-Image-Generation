## Why

当前「经典生成」表单服务的是已有大致想法的用户：选好方向、写好主体才能出图。对没有想法、只有模糊感觉的用户，表单本身就是门槛，这一人群目前直接流失。行业已验证对话式生成（即梦 Agent 模式、ChatGPT 4o 生图）能显著降低使用门槛并支持多轮精修，是本产品补齐该人群的自然下一步。

## What Changes

- 在 `/generate` 页面引入双模式：**经典生成**（现有表单，保持不变）与 **Agent 对话**（新增，同页切换，互为对照），按用户状态分流（「我有大致想法」vs「还没想好，聊聊看」）。
- 新增 Agent 对话工作台：左侧对话流（含任务规划步骤、工具调用轨迹、积分消耗明示），右侧画布（钉住每轮生成结果、选中作为下一轮编辑对象）。
- Agent 能力首版覆盖三条流程：① 对话生图（大白话 → 澄清引导（可选）→ 专业提示词 → 生成）；② 多轮改图（选中画布图片 → 自然语言编辑指令 → `gpt-image-1` edits，新版本入画布）；③ 批量变体（基于选中图出 N 个方向变体）。
- 服务端新增 Agent 循环：LLM（OpenAI 兼容 function calling，默认接国内模型如 GLM-4.6）规划并调用工具集（`build_prompt` / `generate_image` / `edit_image` / `list_canvas`），工具复用现有提示词工程与积分计费，全程落库（会话、消息、工具轨迹）。
- 生图链路新增 `gpt-image-1` 图像编辑（edits）能力，含服务健康探测。
- **BREAKING**：无。经典模式与既有 API 全部保持兼容。

## Capabilities

### New Capabilities
- `agent-workbench`: Agent 对话工作台的完整行为契约——双模式入口与对照、会话与消息模型、Agent 循环与工具调用透明度、画布选图与多轮改图、积分扣减与不足处理、Agent 大脑的模型适配（真实/模拟）。

### Modified Capabilities

（无——billing 与既有生成行为的需求不变；`/generate` 经典模式仅作页面内布局调整，无契约级变更。）

## Impact

- **数据库**：新增迁移 `0004_agent.sql`（`agent_sessions`、`agent_messages` 表 + RLS；`generations` 增加 `parent_generation_id` 列支持改图/变体溯源）。
- **服务端**：`lib/agent/`（大脑客户端、工具集、循环编排）、`app/api/agent/*` 路由、`lib/openai/images.ts` 增加 edits 调用。
- **前端**：`app/generate/page.tsx` 双模式改造、`components/agent-*` 新组件（对话流、步骤/工具卡、画布）。
- **环境变量**：新增 `AGENT_LLM_BASE_URL` / `AGENT_LLM_API_KEY` / `AGENT_LLM_MODEL`（大脑）与 `AGENT_PROVIDER`（`real` | `mock`，测试用模拟大脑，模式对齐 billing 的 mock provider 先例）。
- **依赖**：无新增 npm 依赖（fetch + 现有栈实现 function calling）。
- **已知外部依赖**：图片 relay（ydata）当前 403，修复前真实生图不可用；实现与测试以 mock provider 全链路验证，接真实 key 后零改动切换。
