import "server-only";

import { getBillingEnv, type BillingEnv } from "@/lib/billing/env";
import { lantuProvider } from "@/lib/billing/providers/lantu";
import { mockProvider } from "@/lib/billing/providers/mock";
import { stripeProvider } from "@/lib/billing/providers/stripe";
import { xunhupayProvider } from "@/lib/billing/providers/xunhupay";
import type { BillingProvider } from "@/lib/billing/providers/types";

const providers: Record<BillingEnv["BILLING_PROVIDER"], BillingProvider> = {
  mock: mockProvider,
  lantu: lantuProvider,
  xunhupay: xunhupayProvider,
  stripe: stripeProvider,
};

function assertMockAllowed(env: BillingEnv): void {
  if (process.env.NODE_ENV === "production" && !env.ALLOW_MOCK_IN_PRODUCTION) {
    throw new Error("mock_billing_provider_forbidden_in_production");
  }
}

export function getBillingProvider(): BillingProvider {
  const env = getBillingEnv();
  const providerId = env.BILLING_PROVIDER;

  if (providerId === "mock") {
    assertMockAllowed(env);
  }

  return providers[providerId];
}

export function getBillingProviderById(providerId: string): BillingProvider | undefined {
  if (providerId === "mock") {
    assertMockAllowed(getBillingEnv());
  }

  if (!Object.prototype.hasOwnProperty.call(providers, providerId)) {
    return undefined;
  }

  return providers[providerId as BillingEnv["BILLING_PROVIDER"]];
}

export function getWebhookUrl(providerId: string): string {
  return `${getBillingEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")}/api/webhooks/${providerId}`;
}
