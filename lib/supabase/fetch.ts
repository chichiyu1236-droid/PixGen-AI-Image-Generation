import "server-only";

import { Agent, fetch as undiciFetch } from "undici";

const supabaseDispatcher = new Agent({
  connect: { timeout: 30_000 },
  headersTimeout: 60_000,
  bodyTimeout: 60_000,
});

export const supabaseServerFetch = ((input: RequestInfo | URL, init?: RequestInit) =>
  undiciFetch(input as Parameters<typeof undiciFetch>[0], {
    ...init,
    dispatcher: supabaseDispatcher,
  } as Parameters<typeof undiciFetch>[1])) as unknown as typeof fetch;
