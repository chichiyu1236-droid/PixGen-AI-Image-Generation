import { ArrowLeft, FileText, Mail, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/app-shell";
import { formatFenAsCny } from "@/lib/billing/money";
import { membershipPlans } from "@/lib/billing/plans";
import { buildSupportMailto, getSupportContactText, getSupportEmail } from "@/lib/billing/support";

export const metadata: Metadata = {
  title: "服务条款与退款规则 · PixGen",
  description: "PixGen 在线 AI 图像生成数字服务条款、人民币会员卡计费规则、退款与争议处理政策及合规约定。",
};

export default function TermsPage() {
  const supportEmail = getSupportEmail();
  const supportMailto = buildSupportMailto(supportEmail, { subject: "PixGen 服务条款与退款咨询" });

  return (
    <div className="flex min-h-screen flex-col bg-[#f6f3ea] text-[#171916]">
      <header className="border-b border-[#171916]/10 bg-[#f4f0e5]/85 px-5 py-3.5 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <BrandMark href="/" compact />
          <div className="flex items-center gap-2.5">
            <Link
              href="/privacy"
              className="rounded-full border border-[#171916]/12 bg-[#fbf9f3] px-3.5 py-1.5 text-xs font-medium text-[#484e45] transition hover:border-[#171916]/25 hover:text-[#171916]"
            >
              隐私政策
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
              <FileText size={13} aria-hidden />
              TERMS OF SERVICE
            </p>
            <h1 className="mt-2 font-display text-3xl font-normal text-[#171916] sm:text-4xl">服务条款与退款规则</h1>
            <p className="mt-3 text-sm leading-6 text-[#484e45]">
              欢迎使用 PixGen。使用本网站及购买会员或数字积分服务前，请仔细阅读以下条款。完成注册、登录或下单支付即表示你理解并同意本条款全部内容。
            </p>
          </header>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-normal text-[#171916]">1. 数字服务内容与交付方式</h2>
            <p className="text-sm leading-7 text-[#484e45]">
              PixGen 提供基于人工智能模型的在线图像生成、参考图编辑与 Agent 对话创作服务。本平台所售全部商品均为在线交付的数字会员权益与生图积分，不涉及实体商品或物流配送。
            </p>
            <ul className="list-disc space-y-1.5 pl-5 text-sm leading-7 text-[#484e45]">
              <li>每次成功生成 1 张图像消耗 1 积分；因上游异常或系统故障未能成功出图时，不扣减积分。</li>
              <li>新注册账号一次性获赠 5 张免费试用积分（永久有效、不刷新），仅限经典生成模式；Agent 对话工作台为有效会员专属能力。</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-normal text-[#171916]">2. 人民币定价、单次购买与有效期规则</h2>
            <p className="text-sm leading-7 text-[#484e45]">
              所有会员方案均以人民币（CNY）计价并采用<strong className="font-semibold text-[#171916]">单次手动付款模式</strong>，支持通过 Stripe 托管收银台或平台指定支付通道使用支付宝、微信支付、银行卡完成付款。
              <strong className="font-semibold text-[#171916]">不会开通任何形式的自动续费或周期免密代扣</strong>。
            </p>
            <div className="overflow-x-auto rounded-2xl border border-[#171916]/10 bg-[#f4f0e5]/65 p-4">
              <table className="w-full min-w-[460px] text-left text-xs tabular-nums sm:text-sm">
                <thead className="text-[#6d7368]">
                  <tr>
                    <th className="border-b border-[#171916]/10 pb-2 font-medium">会员方案</th>
                    <th className="border-b border-[#171916]/10 pb-2 font-medium">单次价格（人民币）</th>
                    <th className="border-b border-[#171916]/10 pb-2 font-medium">有效期与发放规则</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#171916]/6 text-[#484e45]">
                  {membershipPlans.map((plan) => (
                    <tr key={plan.id}>
                      <td className="py-2.5 pr-4 font-medium text-[#171916]">{plan.name}</td>
                      <td className="py-2.5 pr-4 font-semibold text-[#171916]">{formatFenAsCny(plan.amountFen)}</td>
                      <td className="py-2.5">
                        {plan.tranches > 1
                          ? `会员期 ${plan.periodDays} 天，共 ${plan.tranches} 期，每 30 天发放 ${plan.quotaPerTranche} 积分（首期支付成功即到账）`
                          : `会员期 ${plan.periodDays} 天，支付成功即发放 ${plan.quotaPerTranche} 积分`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="list-disc space-y-1.5 pl-5 text-sm leading-7 text-[#484e45]">
              <li>
                <strong className="font-medium text-[#171916]">周期额度不滚存</strong>：订阅池每期积分仅在当前 30 天周期及会员有效期内可用，期满自动清零；年卡未在对应发放周期访问领取的期数作废、不补发。
              </li>
              <li>
                <strong className="font-medium text-[#171916]">叠加顺延规则</strong>：会员有效期内再次购买同档或换档会员，首期积分立即到账，会员有效期自原到期时间顺延对应周期天数，不按比例折算或退差价。
              </li>
              <li>
                <strong className="font-medium text-[#171916]">双池扣费顺序</strong>：生图时优先消耗当期订阅池积分，订阅池耗尽后自动扣减永久池积分（永久池积分长期有效，不受会员过期影响）。
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-normal text-[#171916]">3. 数字商品退款与争议处理政策</h2>
            <p className="text-sm leading-7 text-[#484e45]">
              由于会员权益与生成积分属于支付完成后立即交付的在线数字服务，订单到账并开始消耗当期订阅积分后，原则上不支持无理由退款、部分退款或折现。但在以下明确情形下，我们将为你办理全额退款或人工补发：
            </p>
            <ul className="list-disc space-y-1.5 pl-5 text-sm leading-7 text-[#484e45]">
              <li>因网络抖动或支付通道重复提交导致的同一笔服务重复扣款；</li>
              <li>已完成支付且资金已划扣，但因系统故障导致订单未自动到账且无法完成人工补发；</li>
              <li>支付完成后 7 个自然日内，且该笔订单发放的订阅积分完全未被消耗、未使用会员专属功能。</li>
            </ul>
            <div className="rounded-2xl border border-[#566c58]/20 bg-[#e7eee5]/60 p-4 text-sm leading-7 text-[#384a3a]">
              <p className="flex items-center gap-2 font-medium text-[#171916]">
                <ShieldCheck size={16} className="text-[#566c58]" aria-hidden />
                退款与异常订单申诉流程
              </p>
              <p className="mt-1">
                请使用注册邮箱联系客服，提供<strong className="font-medium text-[#171916]">订单编号、下单时间及支付凭证截图</strong>。我们将在收到邮件后的{" "}
                <strong className="font-medium text-[#171916]">3 个工作日内</strong>完成核查与答复；审核通过后将通过原支付通道原路退回（支付宝、微信支付或银行卡实际到账时间以支付机构规则为准，通常为 1–7 个工作日），并同步收回对应未消耗权益。
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-normal text-[#171916]">4. 用户生成内容（UGC）合规责任与使用规范</h2>
            <p className="text-sm leading-7 text-[#484e45]">
              你应对自己在 PixGen 提交的文本提示词、上传的参考图片以及最终生成内容的使用方式承担完整法律责任，并承诺遵守中华人民共和国及所在地适用法律法规：
            </p>
            <ul className="list-disc space-y-1.5 pl-5 text-sm leading-7 text-[#484e45]">
              <li>禁止生成、上传或传播违法违规、暴力恐怖、色情低俗、仇恨歧视、虚假诈骗或侵害他人著作权、商标权、肖像权与隐私权的内容；</li>
              <li>禁止通过自动化脚本恶意抓取、绕过计费门禁、共享倒卖账号或干扰平台正常运行；</li>
              <li>若发现违规内容或滥用行为，平台有权视情节采取拦截生成、清理违规内容、暂停或终止账号服务等措施。</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-normal text-[#171916]">5. 服务变更、免责与联系方式</h2>
            <p className="text-sm leading-7 text-[#484e45]">
              AI 图像生成结果具有一定随机性，我们致力于保持服务稳定与可用，但不对生成画面完全符合特定主观预期作绝对保证。如因系统升级、上游模型维护或不可抗力导致短暂中断，我们将尽快恢复。本条款如有更新将在本页公示。
            </p>
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#171916]/10 bg-[#f4f0e5]/85 px-4 py-3 text-sm text-[#484e45]">
              <Mail size={16} className="shrink-0 text-[#566c58]" aria-hidden />
              {supportEmail ? (
                <span>
                  客服与争议处理邮箱：{" "}
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
              <Link href="/privacy" className="font-medium text-[#384a3a] underline-offset-4 hover:underline">
                阅读隐私政策
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
