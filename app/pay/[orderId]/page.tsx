import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BrandMark } from "@/components/app-shell";
import { PayClient } from "@/components/pay-client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
type PayPageProps = {
  params: Promise<{ orderId: string }>;
};

export default async function PayPage({ params }: PayPageProps) {
  const { orderId } = await params;

  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // RLS confines this to the caller's own orders; anyone else's id is a 404.
  const { data: order } = (await supabase.from("orders").select("*").eq("id", orderId).maybeSingle()) as {
    data: OrderRow | null;
  };

  if (!order) {
    notFound();
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f6f3ea] text-[#171916]">
      <header className="border-b border-[#171916]/10 bg-[#f4f0e5]/85 px-5 py-3.5 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <BrandMark href="/" compact />
          <Link
            href="/upgrade"
            className="inline-flex items-center gap-1.5 rounded-full border border-[#171916]/12 bg-[#fbf9f3] px-3.5 py-1.5 text-xs font-medium text-[#484e45] transition hover:border-[#171916]/25 hover:text-[#171916]"
          >
            <ArrowLeft size={13} aria-hidden />
            返回会员方案
          </Link>
        </div>
      </header>

      <main className="grid flex-1 place-items-center px-5 py-10">
        <PayClient
          order={{
            id: order.id,
            status: order.status,
            payUrl: order.pay_url,
            channel: order.channel,
            amountFen: order.amount_fen,
            credits: order.credits,
            packId: order.pack_id,
            kind: order.kind,
            expiresAt: order.expires_at,
            createdAt: order.created_at,
          }}
        />
      </main>
    </div>
  );
}
