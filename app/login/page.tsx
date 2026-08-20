import { GoogleLoginButton } from "@/components/auth-button";
import { EmailLoginForm } from "@/components/email-login-form";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--page-bg)] px-6 text-[var(--ink)]">
      <section className="w-full max-w-md rounded-[2rem] border border-black/10 bg-white p-8 shadow-[0_24px_70px_rgba(0,0,0,0.06)]">
        <p className="font-display text-2xl tracking-[0.12em] text-black/40">LOGIN</p>
        <h1 className="mt-4 text-4xl font-light leading-tight text-black">登录后开始生成</h1>
        <p className="mt-4 text-sm leading-7 text-black/58">使用 Google 登录即可开始。新用户会自动获得 5 个积分，后续可联系管理员补发测试积分。</p>
        <div className="mt-8">
          <GoogleLoginButton className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-black/90" />
        </div>
        <div className="mt-6 border-t border-black/10 pt-6">
          <p className="mb-4 text-center text-sm text-black/50">或使用邮箱密码登录</p>
          <EmailLoginForm />
        </div>
      </section>
    </main>
  );
}
