import { z } from "zod";
import { create, list, lock, transaction, update } from "./db";
import type { ExchangeRate } from "./currency";
const observation = z.object({
  base: z.literal("USD"),
  quote: z.literal("KRW"),
  rate: z.number().finite().positive().max(1000000),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (d) =>
        !Number.isNaN(Date.parse(d)) &&
        new Date(d).toISOString().slice(0, 10) === d,
    ),
});
const source = "ECB 일별 기준 환율 · Frankfurter";
const sourceUrl = "https://frankfurter.dev/";
const ttl = 6 * 60 * 60 * 1000;
export async function exchangeRate(refresh = false): Promise<ExchangeRate> {
  return transaction(async () => {
    await lock("exchange-rate:USD:KRW:ECB");
    const cached = (await list("exchange_rates")).find(
      (r) => r.pair === "USD/KRW" && r.provider === "ECB",
    );
    const parsed = observation.safeParse(cached);
    const result = (
      data: z.infer<typeof observation>,
      checkedAt: string,
      stale = false,
    ): ExchangeRate => ({ ...data, source, sourceUrl, checkedAt, stale });
    if (
      !refresh &&
      parsed.success &&
      Number.isFinite(Date.parse(String(cached!.checkedAt))) &&
      Date.now() - Date.parse(String(cached!.checkedAt)) < ttl
    )
      return result(parsed.data, String(cached!.checkedAt));
    try {
      const response = await fetch(
        "https://api.frankfurter.dev/v2/rate/USD/KRW?providers=ECB",
        { signal: AbortSignal.timeout(8000), cache: "no-store" },
      );
      if (!response.ok) throw new Error("환율 공급사 응답 오류");
      const data = observation.parse(await response.json());
      const checkedAt = new Date().toISOString();
      const patch = {
        ...data,
        pair: "USD/KRW",
        provider: "ECB",
        source,
        sourceUrl,
        checkedAt,
      };
      if (cached) await update(cached.id, patch);
      else await create("exchange_rates", patch);
      return result(data, checkedAt);
    } catch {
      if (parsed.success)
        return result(
          parsed.data,
          String(cached!.checkedAt || cached!.createdAt),
          true,
        );
      throw new Error(
        "환율을 조회하지 못했습니다. USD 금액을 유지하며 환율 재조회를 눌러주세요.",
      );
    }
  });
}
