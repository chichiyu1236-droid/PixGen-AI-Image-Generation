# Proposal: add-classic-reference-images

## Why

当前「经典生成」只接受文字描述。手里已有产品图、风格样图或氛围参考的用户，被迫把"能看"的东西翻译成"能说"的句子，既损失信息又抬高门槛。Agent 模式虽有改图能力，但只能编辑它自己生成的图，用户自备的图无法进入任何链路。参考图生图（"照着做"）是行业标配能力（即梦、可灵、4o 均支持），本产品当前的空白使最典型的电商/品牌场景（"照着我的产品出一张广告图"）无法完成。

## What Changes

- 经典生成表单在主体描述之后新增**「参考与补充」模块**（参考图槽位与补充说明合并的单一容器；参考图可选、最多 3 张）：本地上传 + 从历史记录选图两个来源，客户端 canvas 压缩（最长边 1024、JPEG）后随请求发送。
- 参考图**一次性使用、不落盘**：仅在当次请求生命周期内存在，不写入任何存储桶；生成成功后表单槽位保留预览（同 subject 预填逻辑），用户可移除。
- 携带参考图时，生成链路由纯文生图（`/images/generations`）切换为多图参考生图（`/images/edits`，gpt-image），提示词切换为参考语义模板（以参考图中的主体为准、保持其关键特征）；无参考图时现有链路**零变化**。
- 历史记录新增「用作参考图」入口：跳转 `/generate?mode=classic&ref=<generationId>`，服务端校验归属后预填槽位。
- **溯源标记**：来自历史的参考图会把源 generation ID 记入本次生成记录（仅 ID，不含图数据），复用现有 `p_parent_generation_id` 与 `p_options_json`。
- 积分规则不变：成功生成仍扣 1 积分；用户所选画面比例在参考图模式下同样生效（edits 透传 `size`）。
- **BREAKING**：无。`/api/generate` 对不含参考图的旧请求完全向后兼容；Agent 模式与 billing 不受影响。

## Capabilities

### New Capabilities
- `classic-reference-images`: 经典生成模式参考图能力的完整行为契约--槽位交互与多图上限、上传与历史选图两来源、一次性不留档的数据处理、参考语义生成链路的分支与降级、比例与积分一致性、历史溯源标记。

### Modified Capabilities

（无--`agent-workbench` 与 `billing` 的需求不变；纯文生图路径为现有行为，无契约级变更，经典生成此前未有独立 spec，本次以新能力路径建立。）

## Impact

- **数据库**：无迁移。溯源复用 `generations.parent_generation_id`（0004 已加列）与 `p_options_json` 元数据（需确保 base64 图数据**不**入库）。
- **服务端**：`lib/validation/generate.ts`（schema 增加 `referenceImages` 数组）、`app/api/generate/route.ts`（分支到 edits 链路 + 溯源入参）、`lib/openai/images.ts`（`editImageBase64` 升级为多图 + `size` 参数）、`lib/prompts/builder.ts`（参考语义提示词模板）。
- **前端**：`components/generation-form.tsx`（槽位 UI + 客户端压缩 + FormData 采集改造）、`components/history-grid.tsx`（用作参考图按钮）、`app/generate/page.tsx`（`ref` 参数读取、归属校验、预填）。
- **存储**：无新桶、无 mime 变更（参考图永不持久化；`generated-images` 桶现状不动）。
- **环境变量 / 依赖**：无新增。
- **体积红线**：请求体需守住平台函数上限（Vercel ≈4.5MB）--单图 base64 ≤1.5M 字符、3 张压缩后典型 ≈1MB 内；超限走客户端前置拦截 + zod 服务端校验。
