import { ArrowLeft, Lock, Mail, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/app-shell";
import { buildSupportMailto, getSupportContactText, getSupportEmail } from "@/lib/billing/support";

export const metadata: Metadata = {
  title: "隐私政策 · PixGen",
  description: "PixGen 隐私政策：账号信息、提示词与参考图存储、支付隐私边界与用户数据删除权利说明。",
};

export default function PrivacyPage() {
  const supportEmail = getSupportEmail();
  const supportMailto = buildSupportMailto(supportEmail, { subject: "PixGen 隐私与数据权利咨询" });

  return (
    <div className="flex min-h-screen flex-col bg-[#f6f3ea] text-[#171916]">
      <header className="border-b border-[#171916]/10 bg-[#f4f0e5]/85 px-5 py-3.5 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <BrandMark href="/" compact />
          <div className="flex items-center gap-2.5">
            <Link
              href="/terms"
              className="rounded-full border border-[#171916]/12 bg-[#fbf9f3] px-3.5 py-1.5 text-xs font-medium text-[#484e45] transition hover:border-[#171916]/25 hover:text-[#171916]"
            >
              服务条款
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-full border border-[#171916]/12 bg-[#fbf9f3] px-3.5 py-1.5 text-xs font-medium text-[#484e45] transition hover:border-[#171916]/25 hover:text-[#171916]"
            >
              <ArrowLeft size={13} aria-hidden />
              返回首页
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10 sm:px-8">
        <article className="space-y-8 rounded-[2rem] border border-[#171916]/10 bg-[#fbf9f3]/94 p-7 shadow-[0_20px_54px_rgba(23,25,22,0.05)] sm:p-10">
          <header className="border-b border-[#171916]/10 pb-6">
            <p className="inline-flex items-center gap-1.5 font-display text-xs tracking-[0.22em] text-[#566c58] uppercase">
              <Lock size={13} aria-hidden />
              PRIVACY POLICY
            </p>
            <h1 className="mt-2 font-display text-3xl font-normal text-[#171916] sm:text-4xl">隐私政策</h1>
            <p className="mt-3 text-sm leading-6 text-[#484e45]">
              PixGen 重视并保护你的个人隐私。本政策说明我们在你访问网站、注册登录、创作图像及购买会员服务时如何收集、使用、存储与保护相关信息。
            </p>
          </header>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-normal text-[#171916]">1. 我们收集的信息范围</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-[#484e45]">
              <li>
                <strong className="font-medium text-[#171916]">账号与身份信息</strong>：你在注册、登录或找回密码时提供的电子邮箱地址、基础昵称与登录鉴权 Cookie，用于识别账户身份并保障登录会话安全。
              </li>
              <li>
                <strong className="font-medium text-[#171916]">创作内容与作品历史</strong>：你主动输入的提示词、创作参数、Agent 对话记录、上传的参考图片、生成的图像文件及作品反馈，用于完成图像生成并在「作品图库」中供你本人查看和下载。
              </li>
              <li>
                <strong className="font-medium text-[#171916]">订单与支付元数据</strong>：你购买会员时生成的站内订单号、套餐标识、人民币金额、支付渠道与订单状态、支付平台交易号及积分流水记录。
              </li>
              <li>
                <strong className="font-medium text-[#171916]">运行与安全日志</strong>：为防范异常请求、定位接口错误与保障服务稳定性所需的请求时间、错误码及基本设备浏览器信息。
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-normal text-[#171916]">2. 支付隐私与敏感金融信息边界</h2>
            <div className="rounded-2xl border border-[#566c58]/20 bg-[#e7eee5]/60 p-4 text-sm leading-7 text-[#384a3a]">
              <p className="flex items-center gap-2 font-medium text-[#171916]">
                <ShieldCheck size={16} className="text-[#566c58]" aria-hidden />
                不留存银行卡号与支付密码
              </p>
              <p className="mt-1">
                所有在线收款均跳转至 Stripe 托管收银台或合规持牌支付机构页面完成。PixGen 服务器<strong className="font-medium text-[#171916]">绝不收集、不经手也不存储</strong>你的银行卡号、有效期、CVV 安全码或支付宝/微信支付密码，仅保存支付平台返回的脱敏交易号与支付状态用于幂等发货与账务对账。
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-normal text-[#171916]">3. 信息的使用与第三方服务边界</h2>
            <p className="text-sm leading-7 text-[#484e45]">
              我们严格按照最小化原则使用你的数据，不会向任何第三方出售你的个人信息。为实现核心产品功能，必要信息将加密传输至以下基础设施与服务提供方：
            </p>
            <ul className="list-disc space-y-1.5 pl-5 text-sm leading-7 text-[#484e45]">
              <li>
                <strong className="font-medium text-[#171916]">数据库与对象存储（Supabase）</strong>：用于保存用户资料、作品图库、账单与积分流水，全部表均启用行级安全策略（RLS），确保用户仅可访问属于自己的记录。
              </li>
              <li>
                <strong className="font-medium text-[#171916]">人工智能模型推理服务</strong>：仅在发起生成或改图时发送你提交的提示词与参考图以产出结果。
              </li>
              <li>
                <strong className="font-medium text-[#171916]">支付服务商（Stripe 等）</strong>：仅传输订单编号、商品名称与人民币金额，用于完成收款及回调验签。
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-normal text-[#171916]">4. 数据保留期限与你的权利</h2>
            <p className="text-sm leading-7 text-[#484e45]">
              我们仅在为你提供服务及履行财务对账、法律法规要求所必需的期间内保留相关数据。你对自己的个人数据享有以下权利：
            </p>
            <ul className="list-disc space-y-1.5 pl-5 text-sm leading-7 text-[#484e45]">
              <li>随时在站内「作品图库」与「账单与明细」查阅你的历史生成记录、订单与积分流水；</li>
              <li>随时联系我们申请查询、更正或删除个人账号与作品数据（为满足交易审计和反欺诈要求，必要的历史订单账务记录将依法在脱敏后留存）；</li>
              <li>本服务面向具备完全民事行为能力的用户，不主动面向未成年人收集个人信息。</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-normal text-[#171916]">5. 联系我们</h2>
            <p className="text-sm leading-7 text-[#484e45]">
              如你对本隐私政策有任何疑问，或需要行使数据查询、更正及账号删除权利，请通过注册邮箱联系我们，我们将在核验身份后的 7 个工作日内回复处理。
            </p>
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#171916]/10 bg-[#f4f0e5]/85 px-4 py-3 text-sm text-[#484e45]">
              <Mail size={16} className="shrink-0 text-[#566c58]" aria-hidden />
              {supportEmail ? (
                <span>
                  隐私与客服联系邮箱：{" "}
                  <a
                    href={supportMailto}
                    className="font-medium text-[#384a3a] underline underline-offset-4 hover:text-[#171916]"
                  >
                    {supportEmail}
                  </a>
                </span>
              ) : (
                <span>{getSupportContactText()}</span>
              )}
            </div>
          </section>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#171916]/10 pt-6 text-xs text-[#6d7368]">
            <div className="flex flex-wrap items-center gap-4">
              <Link href="/terms" className="font-medium text-[#384a3a] underline-offset-4 hover:underline">
                阅读服务条款与退款规则
              </Link>
              <Link href="/upgrade" className="underline-offset-4 hover:text-[#171916] hover:underline">
                查看会员方案
              </Link>
              <Link href="/billing" className="underline-offset-4 hover:text-[#171916] hover:underline">
                账单与积分明细
              </Link>
            </div>
            <Link href="/" className="underline-offset-4 hover:text-[#171916] hover:underline">
              返回 PixGen 首页
            </Link>
          </footer>
        </article>
      </main>
    </div>
  );
}
