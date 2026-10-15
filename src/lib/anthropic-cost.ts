// Official standard/global list prices checked 2026-10-15. Never label this an invoice.
export const anthropicPricingSource =
  "https://platform.claude.com/docs/en/about-claude/pricing";
export function anthropicCost(model: string, raw: unknown) {
  if (model !== "claude-sonnet-5-5" || !raw || typeof raw !== "object")
    return null;
  const u = raw as Record<string, any>;
  const count = (n: unknown) =>
    typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
  if (!count(u.input_tokens) || !count(u.output_tokens)) return null;
  if (u.service_tier && u.service_tier !== "standard") return null;
  if (u.inference_geo && !["global", "us"].includes(u.inference_geo))
    return null;
  const reads = u.cache_read_input_tokens ?? 0,
    writes = u.cache_creation_input_tokens ?? 0;
  const hour = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const five = u.cache_creation?.ephemeral_5m_input_tokens ?? writes - hour;
  const searches = u.server_tool_use?.web_search_requests ?? 0;
  if (
    ![reads, writes, hour, five, searches].every(count) ||
    hour + five !== writes
  )
    return null;
  if (
    Object.entries(u.server_tool_use || {}).some(
      ([k, v]) =>
        !["web_search_requests", "web_fetch_requests"].includes(k) && v !== 0,
    )
  )
    return null;
  // output_tokens already includes thinking; do not add thinking_tokens again.
  const tokenUsd =
    ((u.input_tokens * 2 +
      u.output_tokens * 10 +
      reads * 0.1 +
      five * 2.5 +
      hour * 4) /
      1e6) *
    (u.inference_geo === "us" ? 1.1 : 1);
  return {
    amount: Math.round((tokenUsd + searches * 0.01) * 1e9) / 1e9,
    currency: "USD",
    basis: "usage-estimate",
    pricingDate: "2026-10-15",
    source: anthropicPricingSource,
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadTokens: reads,
    cacheWriteTokens: writes,
    searches,
  };
}
