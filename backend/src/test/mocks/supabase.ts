import { vi } from "vitest";

const CHAIN_METHODS = [
  "select",
  "insert",
  "update",
  "upsert",
  "eq",
  "in",
  "or",
  "not",
  "order",
  "range",
  "limit",
] as const;

export function createChain(result: { data: any; error: any; count?: number | null }) {
  const chain: any = {};
  for (const method of CHAIN_METHODS) {
    chain[method] = vi.fn(() => chain);
  }
  chain.single = vi.fn(() => Promise.resolve(result));
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.then = (onFulfilled: any, onRejected: any) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return chain;
}