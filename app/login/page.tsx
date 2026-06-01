import { GoogleLoginButton } from "@/components/auth-button";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-6">
      <section className="w-full max-w-sm rounded-lg border border-ink/10 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold">登录后开始生成</h1>
        <p className="mt-3 text-sm leading-6 text-ink/70">第一版仅支持 Google 登录。新用户会自动获得 5 个积分。</p>
        <div className="mt-6">
          <GoogleLoginButton />
        </div>
      </section>
    </main>
  );
}
