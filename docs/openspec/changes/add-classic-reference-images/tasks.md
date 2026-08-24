# Tasks: add-classic-reference-images

## 1. 服务端：请求校验与图像链路升级

- [x] 1.1 扩展 `lib/validation/generate.ts`：新增可选 `referenceImages` 数组（≤3 项、单图 `data` ≤1,500,000 字符且过 base64 字符集正则、`generationId` 为可选 uuid、`refine` 全部 `data` 合计 ≤3,600,000 字符，缺省为空数组）；扩展 `tests/validation/generate.test.ts` 覆盖合法多图、4 张拒绝、单图超长拒绝、合计超限拒绝、非法字符拒绝、非法 uuid 拒绝、无该字段的旧请求解析通过（向后兼容）
- [x] 1.2 升级 `lib/openai/images.ts` 的 `editImageBase64`：入参改为 `images: string[]` + 可选 `size`（透传给 `/images/edits`），SDK `image` 参数传 `FileLike[]`，mock 分支行为保持；同步把 `lib/agent/tools.ts` 的调用点改为 `[sourceBase64]`（行为不变）；扩展 `tests/openai/images.test.ts` 验证 mock 下多图与 size 透传不报错、单图调用点回归通过
- [x] 1.3 `lib/prompts/builder.ts` 增加参考语义分支：携带参考图时生成"以所附图片为视觉参考、保持主体可识别特征、全新创作而非编辑"基调的提示词并拼入既有 subject/extra/风格修饰；扩展 `tests/prompts/builder.test.ts` 覆盖单图、多图、无参考图（输出与现状一致）三种输入

## 2. 服务端：路由分支与落库

- [x] 2.1 改造 `app/api/generate/route.ts`：`referenceImages` 非空时走 `editImageBase64({ images, size, prompt })`（size 取自用户所选比例映射），为空时保持 `generateImageBase64` 现状；错误映射与 provider 熔断两分支共用
- [x] 2.2 落库改造：`p_options_json` 写入前剥离全部 `data` 载荷、仅保留 `referenceImages: [{ generationId? }]` 元数据；`p_parent_generation_id` 取第一个携带 `generationId` 的参考图（无则 null）；扩展 `tests/api/generate-route.test.ts` 覆盖：有参考图走 edits 且落库 options_json 不含 base64、parent id 正确传入、纯本地上传不传 parent id、无参考图请求走原链路且响应结构不变、校验失败（超 3 张）返回 invalid_request 且不调用图像服务不扣积分

## 3. 前端：压缩管道与参考图槽位

- [x] 3.1 新建客户端压缩工具（如 `lib/media/compress-image.ts`）：输入 `File`/`Blob`，canvas 缩放至最长边 1024px、导出 JPEG（质量 ≈0.85）、返回剥离 data URL 前缀的 base64；尺寸计算抽为纯函数并加单元测试（横图/竖图/方图/小于 1024 不放大）
- [x] 3.2 改造 `components/generation-form.tsx`：主体描述之后新增「参考与补充」模块（参考图与补充说明合并为单一容器：模块标题「参考与补充」；实线描边圆角容器内上段为「参考图（最多 3 张）」+ 64px 缩略图 hover 删除 + 末尾虚线添加块（满 3 张隐藏并提示），下段为「补充说明」textarea），参考图为组件 state（`previewUrl/base64/generationId`），提交时把 `referenceImages` 合并进 JSON payload（文本字段仍走 FormData）；验证：`npm run build` 通过 + 本地 mock 下手动确认槽位增删与提交 payload（Network 面板）符合结构
- [x] 3.3 槽位前置校验：`accept` 限定 png/jpeg/webp、非图片类型选择即拒绝并提示、压缩后单图超 1,500,000 字符时拒绝该图并提示；与 3.2 一并手动验证

## 4. 前端：历史选图入口与预填

- [x] 4.1 `components/history-grid.tsx` 每条成功生成增加「用作参考图」链接，跳转 `/generate?mode=classic&ref=<generationId>`；验证构建通过 + 跳转 URL 正确
- [x] 4.2 `app/generate/page.tsx` 读取 `ref` 参数：服务端校验该记录属于当前用户且 `status = succeeded`，通过后把 `{ id, url }` 作为 `initialReference` 传入 `GenerationForm`；`GenerationForm` 收到后拉取 url -> 压缩 -> 入槽并携带 `generationId`，拉取失败时静默降级为空槽 + 行内轻提示；验证：本地 mock 下手动走通"历史 -> 用作参考图 -> 预填成功 -> 生成"，并构造他人/不存在的 ref id 确认静默忽略

## 5. 端到端与回归

- [x] 5.1 新增 `e2e/` 参考图用例（mock provider）：上传 1 张本地图完成生成出图、从历史预填参考图完成生成、添加至 3 张后添加块不可用；`npm run e2e` 相关用例通过
- [x] 5.2 全量回归：`npm run typecheck`、`npm test`、`npm run build`、`npm run e2e` 全部通过，确认无参考图的既有用例（经典表单、Agent 模式）零回归
