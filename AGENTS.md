# PixGen 仓库协作规范

Next.js App Router + Supabase + OpenAI Images API 图像生成与 Agent 工作台。全部环境变量清单以 [.env.example](.env.example) 为唯一权威单源，本地初始化、登录与 Stripe 部署步骤见 [README.md](README.md)。

## 1. 核心目录与按任务规范路由

| 目录 | 职责 | 改动前按需阅读 |
| --- | --- | --- |
| `app/` | 页面路由（`/`、`/login`、`/auth/reset-password`、`/generate`、`/history`、`/upgrade`、`/pay`、`/billing`、`/terms`、`/privacy`、`/admin`）与 `app/api/` 服务端接口 | 对应业务规格 |
| `components/` | 前端交互组件（`agent-workbench.tsx`、`generation-form.tsx`、`pricing-plans.tsx`、`pay-client.tsx`、`login-form.tsx`、`resilient-image.tsx` 等） | `docs/openspec/specs/` 对应规格 |
| `lib/` | 核心业务与集成层：`admin/`、`agent/`、`auth/`、`billing/`、`media/`、`openai/`、`prompts/`、`storage/`、`supabase/`、`validation/`、`env.ts` | 见下方专题路由 |
| `supabase/migrations/` | Postgres 表结构、RLS 与积分/订单 RPC 增量迁移（只增不改已落地迁移 `0001`–`0007`，新迁移顺延自 `0008`） | 计费与会员规格 |
| `docs/openspec/` | 正式产品与技术规格（`specs/`）及进行中的变更提案（`changes/`），历史文档位于 `docs/archive/` | 先读对应 `spec.md` |

专题路由：
- 改 Agent 工作台、工具循环与容错预览：先读 [agent-workbench/spec.md](docs/openspec/specs/agent-workbench/spec.md)
- 改计费、Stripe Checkout、Webhook、账单与合规页：先读 [billing/spec.md](docs/openspec/specs/billing/spec.md)
- 改会员权益、双池扣费与门禁：先读 [membership/spec.md](docs/openspec/specs/membership/spec.md)
- 改营销首页与登录引流入口：先读 [landing-page/spec.md](docs/openspec/specs/landing-page/spec.md)
- 推进视频工作台提案：先读 [add-video-workbench/proposal.md](docs/openspec/changes/add-video-workbench/proposal.md)

## 2. 全局安全与发布红线

- **严禁未经明确确认执行 `git push`、改写已推送历史，或对生产/共享 Supabase 数据库执行迁移与写操作。**
- **严禁读取、打印或提交真实密钥文件**（`.env`、`.env.local` 等）；新增环境变量须同步在 `lib/**/env.ts` 与 [.env.example](.env.example) 登记安全占位。
- **自动化测试外部依赖一律走 Mock**：生图、Agent LLM 与支付调用在单测与 E2E 中必须走 Mock（`IMAGE_PROVIDER=mock`、`AGENT_PROVIDER=mock`、`BILLING_PROVIDER=mock`），禁止触发真实付费 API；`playwright.config.ts` 与 `scripts/start-dev-for-playwright.mjs` 强制锁定三项 provider 为 `mock`。
- **高风险变更需独立审查**：修改鉴权、计费/下单/对账、支付 Webhook、Agent 核心链路、生图外链安全下载、管理端接口或数据库迁移（见下方高风险路径）时，必须经过独立代码审查与验证。
- **测试分层与控频**：
  - 编码途中优先跑静态检查（`npm run typecheck`、`npm run lint`）；
  - 每轮修改完成后仅跑关联的局部 Vitest 快测（`npx vitest run <path>`）；
  - 整批改动收尾或合入主干前，统一执行一次全量门禁（`typecheck` + `lint` + `npm test` + `npm run build`），需要端到端核验时先跑无库烟雾测试 `npm run e2e:smoke`，确认环境具备独立测试库后再按需执行 `npm run e2e` 或 `npm run verify:rls`。

## 3. 常用开发与验证命令

以下均来自 `package.json` 真实脚本：

- `npm run dev`：启动本地 Next.js 开发服务器
- `npm run typecheck`：TypeScript 静态类型检查（`tsc --noEmit`）
- `npm run lint`：ESLint 零警告检查（`eslint . --max-warnings=0`）
- `npx vitest run <path>`：秒级局部单测（默认 `node` 环境，仅 `tests/components/**` 与 `tests/pages/**` 启用 `jsdom`）
- `npm test`：运行全量 Vitest 单元测试（`vitest run`）
- `npm run build`：生产构建检查（`next build`）
- `npm run e2e:smoke`：无真实 Supabase 依赖的 Playwright 烟雾测试（首页、登录页、合规页与鉴权重定向）
- `npm run e2e`：运行全量 Playwright 端到端重测（依赖真实测试库用例在无实库凭据时自动跳过）
- `npm run verify:rls`：在独立测试库上执行 RLS 与核心资金 RPC 校验（`scripts/verify-rls.mjs`，说明见 [rls-notes.md](tests/db/rls-notes.md)）

## 开发约定（oil-dev）

- 快测：`npx vitest run {target}`
- 重测：`npm run e2e`、`npm run e2e:smoke`、`npm run verify:rls`
- 门禁：`npm run typecheck`、`npm run lint`、`npm test`、`npm run build`
- 高风险：`lib/billing/**`、`supabase/migrations/**`、`lib/agent/**`、`app/api/webhooks/**`、`lib/auth/**`、`app/auth/**`、`app/api/checkout/**`、`app/api/orders/**`、`lib/openai/images.ts`、`lib/admin/**`、`app/api/admin/**`
- 禁改：`next-env.d.ts`
