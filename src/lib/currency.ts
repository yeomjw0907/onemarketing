export type ExchangeRate = {
  base: "USD";
  quote: "KRW";
  rate: number;
  date: string;
  source: string;
  sourceUrl: string;
  checkedAt: string;
  stale: boolean;
};
export function toKrw(amount: number | null, rate: number | null) {
  if (amount === null || rate === null) return null;
  if (
    !Number.isFinite(amount) ||
    amount < 0 ||
    !Number.isFinite(rate) ||
    rate <= 0
  )
    throw new Error("환산 금액·환율을 확인하세요.");
  return Math.round(amount * rate);
}
