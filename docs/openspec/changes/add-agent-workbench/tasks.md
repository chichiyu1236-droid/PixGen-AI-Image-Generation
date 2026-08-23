## 1. 数据层

- [x] 1.1 编写 `supabase/migrations/0004_agent.sql`（agent_sessions / agent_messages 两表 + RLS + 索引；generations 增加 parent_generation_id / origin / edit_instruction 可空列；record_successful_generation 扩展可选参数且默认行为不变）并用本地 SQL 语法检查验证脚本可重复执行（注：本地无 PG/Docker，幂等写法保证可重复执行；语法在 1.2 应用事务中验证）
- [x] 1.2 将 0004 迁移应用到 Supabase 项目并验证：新表可查询、RLS 生效（anon 读他人会话为空）、经典 `record_successful_generation` 行为回归通过（`scripts/verify-rls.mjs` 扩展断言）

## 2. Agent 内核（lib/agent）

- [x] 2.1 `lib/agent/env.ts`：AGENT_PROVIDER / AGENT_LLM_* 环境变量 zod 校验 + 生产 mock 守卫，单测覆盖守卫分支
- [x] 2.2 `lib/agent/brain.ts` + `lib/agent/brains/mock.ts`：OpenAI 兼容 function-calling 客户端与模拟大脑（意图路由：模糊/生成/改图/变体），单测验证 mock 四条路径返回合法工具调用序列
- [x] 2.3 `lib/agent/tools.ts`：四个工具（build_prompt / generate_image / edit_image / list_canvas），入参 zod 校验，积分前置守卫，复用 builder/images/storage/health/record_successful_generation；`lib/openai/images.ts` 增加 editImageBase64（images.edit + gpt-image-1）。单测：mock 依赖下覆盖成功、余额不足、provider 不可用三类路径
- [x] 2.4 `lib/agent/loop.ts`：循环编排（≤5 轮、轨迹收集、非法参数自纠一次、最终 assistant 消息保底），单测以假大脑验证轨迹结构与轮次上限

## 3. API 路由

- [x] 3.1 `app/api/agent/sessions/route.ts`（POST 创建 / GET 列表）+ `app/api/agent/sessions/[id]/route.ts`（GET 轨迹与画布），路由单测覆盖 401、正常、越权 404
- [x] 3.2 `app/api/agent/sessions/[id]/messages/route.ts`（POST 消息 → 循环 → 返回增量），路由单测覆盖余额不足拦截、provider 不可用 503 语义、轨迹落库

## 4. 前端

- [x] 4.1 `app/generate/page.tsx` 双模式改造（ModeSwitch + ?mode=agent，经典模式零回归：现有生成 e2e 通过）
- [x] 4.2 `components/agent-workbench.tsx`（对话流 + 步骤 + 工具卡 + 输入区）与 `components/agent-canvas.tsx`（画布、版本链、选中态、变体/下载操作），视觉对齐 `docs/prototypes/agent-workbench.html`，typecheck + lint 通过
- [x] 4.3 会话恢复：进入工作台拉取历史轨迹并回放画布（含刷新恢复），组件级验证

## 5. 端到端与收尾

- [x] 5.1 `e2e/agent.spec.ts`：AGENT_PROVIDER=mock 下走「模糊→澄清→生成→改图→变体」全流程，断言画布版本链、credit_events 扣减与消息轨迹落库（复用 billing e2e 的建号/cookie 模式，含 base64url cookie）
- [x] 5.2 全量回归：`npm run typecheck && npm test && npm run e2e` 全绿；README 补充 AGENT_* 环境变量与双模式说明
