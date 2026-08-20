import "server-only";

import { getBillingEnv } from "@/lib/billing/env";
import { lantuProvider } from "@/lib/billing/providers/lantu";
import { mockProvider } from "@/lib/billing/providers/mock";
import { xunhupayProvider } from "@/lib/billing/providers/xunhupay";
import type { BillingProvider } from "@/lib/billing/providers/types";

const providers: Record<string, BillingProvider> = {
  mock: mockProvider,
  lantu: lantuProvider,
  xunhupay: xunhupayProvider,
};

export function getBillingProvider(): BillingProvider {
  const env = getBillingEnv();
  const providerId = env.BILLING_PROVIDER;

  if (providerId === "mock" && process.env.NODE_ENV === "production" && !env.ALLOW_MOCK_IN_PRODUCTION) {
    throw new Error("mock_billing_provider_forbidden_in_production");
  }

  return providers[providerId] ?? mockProvider;
}

export function getWebhookUrl(providerId: string): string {
  return `${getBillingEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")}/api/webhooks/${providerId}`;
}
