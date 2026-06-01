# AI 图片生成网站 MVP 设计文档

日期：2026-06-02  
状态：已确认并已实现第一版 MVP

## 1. 产品目标

本项目要做一个可真实上线运营的 AI 图片生成网站。它不是让用户直接输入完整 prompt，而是让用户通过结构化选项描述图片需求：图片类型、比例、风格、场景、留白要求，再补充主体描述和额外要求。

系统会在服务端把这些信息组装成更专业、稳定的 GPT Image 提示词，然后调用 OpenAI Image API 生成图片。

第一版重点是跑通真实用户链路：

- 用户可以登录
- 新用户自动获得 5 个积分
- 用户可以生成图片
- 每成功生成 1 张图扣 1 个积分
- 图片会保存到历史记录
- 积分不足时提示升级
- 预留升级入口，但不接真实支付

## 2. 第一版范围

### 包含功能

- 首页
- Google 登录
- 生图页面
- 生成历史页面
- 积分系统
- 新用户赠送 5 积分
- 成功生成 1 张图扣 1 积分
- 积分不足提示
- 升级占位页
- Supabase Storage 保存生成图片
- 服务端组装最终提示词
- OpenAI Image API 生图
- 默认模型：`gpt-image2`
- 默认质量：`high`
- 每次生成 1 张图

### 不包含功能

- 真实支付
- 邮件登录或邮件通知
- 后台管理系统
- 复杂 SEO
- 图片编辑
- 上传参考图
- 多模型切换
- 公开作品社区
- 分享链接
- 收藏、删除、合集管理
- 每日赠送积分
- 邀请奖励
- 人工充值后台

## 3. 技术方案

第一版采用：

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Auth
- Supabase Postgres
- Supabase Storage
- OpenAI Node SDK
- Zod
- Vitest
- Playwright
- Vercel 部署

OpenAI API key 和 Supabase service role key 只在服务端使用，不能暴露给浏览器。

## 4. 页面设计

### 首页

首页负责解释产品价值：用户不需要自己写复杂 prompt，而是通过勾选结构化需求生成专业商业图片。

首页包含：

- 产品价值说明
- 示例图片区域
- “开始生成”入口
- “查看历史”入口

未登录用户点击开始生成时，引导 Google 登录。已登录用户直接进入生图页。

### 登录页

第一版只支持 Google OAuth 登录。

登录成功后：

- 如果是新用户，创建用户资料并赠送 5 积分
- 如果是老用户，保留原有积分
- 默认跳转到生图页

### 生图页

生图页是核心工作台。

用户需要填写或选择：

- 图片类型
- 图片比例
- 图片风格
- 图片场景
- 留白要求
- 主体描述
- 补充要求

页面展示：

- 当前积分
- 生成按钮
- loading 状态
- 生成结果预览
- 下载按钮
- 错误提示
- 积分不足提示

如果积分为 0，不调用 OpenAI，直接提示升级。

### 历史页

历史页展示当前登录用户自己的成功生成记录。

每条记录包含：

- 图片缩略图
- 创建时间
- 主体描述
- 补充要求
- 最终组装后的提示词
- 下载按钮

第一版不做删除、分享、收藏或公开展示。

### 升级页

升级页只是预留入口。

第一版不接支付、不做套餐、不做订阅、不做发票。页面只提示升级能力即将开放。

## 5. 数据模型

### `profiles`

保存用户资料和积分余额。

字段：

- `id`
- `email`
- `display_name`
- `avatar_url`
- `credits`
- `created_at`
- `updated_at`

新用户默认 `credits = 5`。

### `generations`

保存图片生成记录。

字段：

- `id`
- `user_id`
- `image_url`
- `storage_path`
- `final_prompt`
- `input_subject`
- `input_extra`
- `options_json`
- `aspect_ratio`
- `status`
- `error_message`
- `created_at`

成功记录的 `status = succeeded`。失败记录可用于排查，但失败不扣积分。

### `credit_events`

保存积分流水。

字段：

- `id`
- `user_id`
- `generation_id`
- `type`
- `amount`
- `reason`
- `created_at`

积分事件包括：

- `signup_bonus`：新用户赠送 5 积分
- `generation_charge`：成功生成扣 1 积分

## 6. 权限与安全

数据库开启 Row Level Security。

用户只能读取自己的：

- `profiles`
- `generations`
- `credit_events`

浏览器端不能直接修改积分。扣积分、写生成记录、写积分流水都通过服务端受控逻辑完成。

生成图片保存到 Supabase Storage。第一版使用公开 bucket 加随机路径，方便历史页直接展示。后续如果更重视隐私，可以改成签名 URL。

## 7. 生成流程

前端调用：

```text
POST /api/generate
```

服务端流程：

1. 检查用户是否登录
2. 校验请求参数
3. 检查积分是否足够
4. 组装最终提示词
5. 调用 OpenAI Image API
6. 上传图片到 Supabase Storage
7. 写入生成记录
8. 扣 1 个积分
9. 写入积分流水
10. 返回生成结果

如果积分不足，流程会在调用 OpenAI 之前终止。

## 8. 提示词组装

用户提交结构化字段，但最终 prompt 由服务端统一生成。

模板示例：

```text
Create a high-quality [image_type] image in [style] style.
Main subject: [subject].
Scene and environment: [scene].
Composition: [aspect_ratio], [whitespace_requirement].
Additional requirements: [extra].
The image should be commercially usable, visually polished, coherent, and free of text unless explicitly requested.
```

界面可以使用中文选项，但服务端会把选项映射成稳定的英文描述。

例如：

```text
电商主图 -> premium ecommerce product hero image
高级极简 -> premium minimal commercial photography
顶部留白 -> leave clean negative space near the top
```

第一版不做后台 prompt 编辑器。

## 9. OpenAI 图片生成参数

默认参数：

- 模型：`gpt-image2`
- 质量：`high`
- 数量：`1`

模型名通过环境变量控制：

```text
OPENAI_IMAGE_MODEL=gpt-image2
```

如果某个 OpenAI 账号暂时不支持该模型，可以通过环境变量切换为账号可用的图片模型，而不需要改代码。

## 10. 错误处理

### 未登录

返回登录提示，不允许生成。

### 表单无效

返回参数错误，不调用 OpenAI。

### 积分不足

返回积分不足状态，不调用 OpenAI，前端展示升级提示。

### OpenAI 生成失败

不扣积分，前端提示可重试。

### 图片上传失败

不扣积分，前端提示可重试。

### 数据库写入失败

不把结果展示为成功，返回结构化错误，便于前端处理。

## 11. 部署配置

Vercel 环境变量：

```text
OPENAI_API_KEY=
OPENAI_IMAGE_MODEL=gpt-image2
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=
```

Supabase 配置：

- 开启 Google OAuth
- 配置本地回调 URL：`http://localhost:3000/auth/callback`
- 配置生产回调 URL：`https://YOUR_DOMAIN/auth/callback`
- 执行数据库 migration
- 创建 `generated-images` Storage bucket
- 第一版 bucket 设置为 public

## 12. 验收标准

第一版完成标准：

- 用户可以用 Google 登录
- 新用户自动获得 5 积分
- 用户可以通过结构化表单生成 1 张高质量图片
- 成功生成后扣 1 积分
- 图片保存到 Supabase Storage
- 历史页能看到自己的生成记录
- 积分不足时不调用 OpenAI，并显示升级提示
- OpenAI API key 不暴露到浏览器
- Supabase service role key 不暴露到浏览器
- 项目可以通过 Vercel 部署

## 13. 当前验证结果

当前代码已通过：

```bash
npm run typecheck
npm test
npm run build
npm run e2e
```

测试覆盖：

- prompt builder
- 请求参数校验
- auth callback 安全跳转
- 生成 API 未登录处理
- profile 读取失败处理
- 首页 smoke test
- 未登录访问生图页跳转登录页
