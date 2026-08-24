# Design: add-classic-reference-images

## Context

经典生成现有链路：表单（`FormData` → JSON）→ `POST /api/generate` → zod 校验 → `buildImagePrompt` 纯文生图提示词 → `generateImageBase64`（`/images/generations`）→ 上传 `generated-images` 桶 → `record_successful_generation` RPC（扣 1 积分）。Agent 模式已存在 `editImageBase64`（`/images/edits`，单图）与"按 generationId 取源图"的编辑工具，RPC 已支持 `p_parent_generation_id` / `p_origin` / `p_edit_instruction`。动机见 proposal.md - Why。

本设计的关键前提（探索阶段已定）：语义为 B 类"照着做"（参考生图，非改图）；参考图一次性使用、不落盘；支持多图；历史选图与本地上传并存；溯源只记 ID。

## Goals / Non-Goals

**Goals:**

- 本地上传与历史选图汇入**同一条一次性客户端管道**，服务端只有一条参考图代码路径。
- 无参考图时既有链路零改动（向后兼容，同 payload 结构扩展可选字段）。
- 请求体守住平台函数体积上限（Vercel ≈4.5MB），客户端压缩为主、服务端校验兜底。
- 「参考与补充」模块 UI 与现有极简表单语言（圆角、黑/10 描边、`#f8faf7` 底）完全同构。

**Non-Goals:**

- 不做参考图的持久化、管理、清理（一次性语义，无桶、无迁移）。
- 不做逐图角色标注（"这张是主体、那张是风格"）--v1 所有参考图作为整体视觉参考，后续可作增强。
- 不做改图语义（局部修改/重绘）--那是 Agent 模式的既有场景，经典模式不抢。
- 不做拖拽/粘贴上传等交互增强（v1 只做文件选择，交互面最小）。

## Decisions

### D1：两来源、一条管道（客户端统一压缩，不走服务端取图）

本地上传与历史选图都在客户端完成取图与压缩：上传走 `File` → canvas 压缩；历史选图由客户端拉取公开 URL 的图片 → 同一压缩函数。压缩统一为**最长边 1024px、JPEG（质量 ≈0.85）**，产出 base64（剥离 data URL 前缀）。

- **为什么不用服务端按 generationId 取图**（Agent 工具的现成模式）：那需要第二条服务端代码路径（归属校验、下载、与上传图合并），而"不落盘 + 公开桶 URL"让客户端管道天然成立；服务端对参考图**只认 base64 数组**，来源无关。
- **代价与接受度**：历史图多一次客户端下载（公开 CDN URL，体积小）；换来服务端单路径。

### D2：传输形态--扩展现有 JSON 请求体，不做独立上传端点

```ts
// GenerateRequest 新增可选字段
referenceImages?: Array<{
  data: string;          // 纯 base64（无 data: 前缀），单图 ≤ 1,500,000 字符
  generationId?: string; // 历史来源时携带，用于溯源；本地上传不填
}>
```

zod 校验：数组 ≤ 3 项；单图长度上限；`refine` 全部 `data` 合计 ≤ 3,600,000 字符（≈3.4MB，整体守住 4.5MB 平台上限）；base64 字符集正则（快速拒绝脏数据）。

- **备选否决**：multipart 直传（`/api/generate` 现为 JSON 契约，改造面大且响应结构要动）；独立上传端点 + 存储路径（违背"不落盘"，多一轮往返与清理责任）。
- **体积预算**：压缩后单图典型 150–400KB → base64 ≈200–530KB，3 张典型 ≈1.6MB；服务端上限是兜底护栏而非目标值。客户端压缩结果若仍超单图上限（极端噪声图），前置拦截并提示。

### D3：生成链路分支--升级 `editImageBase64` 为多图 + `size`

`/api/generate` 内单点分支：`referenceImages.length > 0` → 参考链路，否则 → 现有 `generateImageBase64`，两分支共用 provider 健康探测、错误映射、上传与 RPC 落库。

`editImageBase64` 签名升级：`imageBase64: string` → `images: string[]`，新增可选 `size`（透传给 `/images/edits`，gpt-image 系列支持）。SDK 侧 `image` 参数传 `FileLike[]`。Agent 调用点同步改为 `[sourceBase64]`（行为不变，纯签名适配）。

- **比例生效**：参考链路传入 `aspectRatios[aspectRatio].size`，与文生图同一映射表。
- **错误语义**：edits 失败复用现有 `image_generation_failed` / `provider_unavailable` 判定（`getImageProviderErrorReason`），不新增错误码。
- **mock**：`editImageBase64` 已有 mock 分支，本地/CI 全链路可用。

### D4：参考语义提示词模板

`buildImagePrompt` 增加参考分支：声明"所附图片为视觉参考，以其中的主体/质感为基准进行**全新创作**（非编辑、非裁剪参考图）"，要求保持参考主体可识别特征（外形、颜色、材质、文字标识）的一致性；再拼入用户 subject/extra 与既有 style/scene/whitespace 修饰。单图与多图措辞统一为"参考所附图片"，不区分角色（见 Non-Goals）。

- **为什么强调"全新创作"**：edits 接口天然偏"改图"，不显式约束时模型容易把任务理解成局部修改，与 B 语义的用户预期相悖。

### D5：溯源与落库--零迁移复用现有 RPC

落库前从 `referenceImages` 剥离全部 `data` 载荷：`p_options_json` 追加 `referenceImages: [{ generationId? }, ...]`（仅元数据）；`p_parent_generation_id` 取**第一个携带 generationId 的参考图**（多历史来源时其余仅存元数据）。`p_origin` 保持 `classic` 不变（不引入新枚举值，避免下游约束风险）。

- **备选否决**：新增多父关联表/列--v1 收益不明确，`p_parent_generation_id` + 元数据数组已满足"历史页能画关系链"的需要。

### D6：历史预填走服务端归属校验 + 客户端拉图

`history-grid` 增加「用作参考图」链接 → `/generate?mode=classic&ref=<generationId>`。`/generate` 页（服务端）查询该 id 且 `user_id` 匹配且 `status = succeeded` 的记录，通过后把 `{ id, url }` 作为 `initialReference` 传入 `GenerationForm`；客户端拉取 url → 压缩 → 入槽并携带 `generationId`。校验失败（不存在/非本人/非成功）**静默忽略**，呈现空槽位。

- **为什么服务端校验**：客户端无凭据判断归属；复用页面既有的服务端查询模式（该页已查 generations 表），不新增 API 端点。
- **拉图失败降级**：槽位为空 + 行内轻提示，不阻断生成。

### D7：表单交互改造--参考图是 React 状态，不进 FormData

现有提交流程 `new FormData(form)` → `Object.fromEntries` 保留用于文本字段；`referenceImages`（含 base64、generationId）由组件 state 在提交时**合并进 payload** 再 `JSON.stringify`。槽位数据结构：`{ localId, previewUrl, base64, generationId? }[]`，预览用 object URL，提交前不阻塞 UI。

### D8：槽位 UI（「参考与补充」模块）

参考图与补充说明合并为单一模块，置于主体描述之后（必填核心字段在前、可选材料收尾）：模块标题「参考与补充」，容器为实线描边圆角（`rounded-[1.25rem]`、`border-black/10`、`#f8faf7` 底、`p-4`）。容器内两段：上段「参考图（最多 3 张）」小标签 + 64px 缩略图行（圆角、`object-cover`、hover 显删除角标）+ 末尾虚线添加块（未满 3 张时显示，满 3 张隐藏并出文案提示）；下段「补充说明」小标签 + 白底 textarea。全部沿用现有间距（`gap-4`）与字体层级，无新色彩。

## Risks / Trade-offs

- [真实中转/模型不支持多图 edits 或限流] → 失败统一走既有 provider 健康熔断与错误映射；开发/测试以 `IMAGE_PROVIDER=mock` 全链路验证（现状同 Agent 变更时的外部依赖备注）。
- [客户端压缩在低端机上的耗时] → 1024px JPEG 压缩通常 <300ms/张；槽位内联轻量 pending 态，不阻塞其他字段填写。
- [历史图拉取失败（网络/桶策略）] → D6 降级路径：空槽 + 提示，用户仍可本地上传。
- [JPEG 丢弃透明通道] → 参考图仅作视觉输入，产物由模型新生成，透明度无保真需求；接受。
- [恶意超大/脏 base64 直打接口] → D2 服务端上限 + 字符集正则 + 平台 413 三层护栏；校验失败在生图调用与扣积分**之前**返回。

## Migration Plan

纯增量、无 DB 迁移、无环境变量变更。部署即生效；回滚 = revert 代码（无数据残留：参考图本就不落盘，元数据字段为新增 JSON 键，旧代码读取无感）。

## Open Questions

（无--压缩目标值与提示词具体措辞可在实现/联调时微调，不影响契约与任务结构。）
