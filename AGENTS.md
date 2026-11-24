# PixGen 仓库协作规范

Next.js App Router + Supabase + OpenAI Images API 图像生成与 Agent 工作台。环境变量清单见 [.env.example](.env.example)，本地初始化与部署说明见 [README.md](README.md)。

## 1. 核心目录与按任务规范路由

| 目录 | 职责 | 改动前按需阅读 |
| --- | --- | --- |
| `app/` | 页面路由（`/generate`、`/history`、`/pay`、`/upgrade`、`/admin`）与 `app/api/` 服务端接口 | 对应业务规格 |
| `components/` | 前端交互组件（`agent-workbench.tsx`、`generation-form.tsx`、`pricing-plans.tsx` 等） | `docs/openspec/specs/` 对应规格 |
| `lib/` | 核心业务与集成层：`agent/`、`billing/`、`openai/`、`supabase/`、`auth/`、`validation/`、`env.ts` | 见下方专题路由 |
| `supabase/migrations/` | Postgres 表结构、RLS 与积分/订单 RPC 增量迁移（只增不改已落地迁移） | 计费与会员规格 |
| `docs/openspec/` | 正式产品与技术规格（`specs/`）及进行中的变更提案（`changes/`） | 先读对应 `spec.md` |

专题路由：
- 改 Agent 工作台与工具循环：先读 [agent-workbench/spec.md](docs/openspec/specs/agent-workbench/spec.md)
- 改计费、订单与 Webhook：先读 [billing/spec.md](docs/openspec/specs/billing/spec.md)
- 改会员权益与门禁：先读 [membership/spec.md](docs/openspec/specs/membership/spec.md)
- 推进视频工作台提案：先读 [add-video-workbench/proposal.md](docs/openspec/changes/add-video-workbench/proposal.md)

## 2. 全局安全与发布红线

- **严禁未经明确确认执行 `git push`、改写已推送历史，或对生产/共享 Supabase 数据库执行迁移与写操作。**
- **严禁读取、打印或提交真实密钥文件**（`.env`、`.env.local` 等）；新增环境变量须同步在 `lib/**/env.ts` 与 `.env.example` 登记安全占位。
- **自动化测试外部依赖一律走 Mock**：生图、Agent LLM 与支付调用在单测中必须 Mock，本地联调使用 `IMAGE_PROVIDER=mock`、`AGENT_PROVIDER=mock`、`BILLING_PROVIDER=mock`，禁止触发真实付费 API。
- **高风险变更需独立审查**：修改计费、支付 Webhook、Agent 核心链路或数据库迁移（见下方高风险目录）时，必须经过独立代码审查与验证。
- **测试控频**：编码途中优先跑类型检查，每轮改完跑关联局部快测，整批收尾或合并前再统一跑门禁与按需 E2E，避免反复空跑全量与重测。

## 3. 常用开发与验证命令

以下均来自 `package.json` 真实脚本：

- `npm run dev`：启动本地 Next.js 开发服务器
- `npm run typecheck`：TypeScript 静态类型检查（`tsc --noEmit`）
- `npm run lint`：ESLint 零警告检查（`eslint . --max-warnings=0`）
- `npx vitest run <path>`：秒级局部单测（按文件或目录过滤）
- `npm test`：运行全量 Vitest 单元测试（`vitest run`）
- `npm run build`：生产构建检查（`next build`）
- `npm run e2e`：运行 Playwright 端到端重测（`playwright test`）

## 开发约定（oil-dev）

- 快测：`npx vitest run {target}`
- 重测：`npm run e2e`
- 门禁：`npm run typecheck`、`npm run lint`、`npm test`、`npm run build`
- 高风险：`lib/billing/**`、`supabase/migrations/**`、`lib/agent/**`、`app/api/webhooks/**`
- 禁改：`next-env.d.ts`
