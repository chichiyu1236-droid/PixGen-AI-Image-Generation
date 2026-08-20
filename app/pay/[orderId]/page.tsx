import { notFound, redirect } from "next/navigation";
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
  const { data: order } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle() as { data: OrderRow | null };

  if (!order) {
    notFound();
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--page-bg)] px-6 py-10 text-[var(--ink)]">
      <PayClient
        order={{
          id: order.id,
          status: order.status,
          payUrl: order.pay_url,
          channel: order.channel,
          amountFen: order.amount_fen,
          credits: order.credits,
          packId: order.pack_id,
          expiresAt: order.expires_at,
          createdAt: order.created_at,
        }}
      />
    </main>
  );
}
