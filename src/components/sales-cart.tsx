"use client";
import {
  packageLabels,
  rewardDefaults,
  type SalesCart,
} from "@/lib/sales-cart";
import { money, type RecordData } from "@/lib/types";
export default function SalesCartBuilder({
  prices,
  value,
  blogId,
  clipId,
  onChange,
  onPrice,
}: {
  prices: RecordData[];
  value: SalesCart;
  blogId: string;
  clipId: string;
  onChange: (cart: SalesCart) => void;
  onPrice: (channel: "blog" | "clip", id: string) => void;
}) {
  const quantities = Object.fromEntries(value.map((r) => [r.type, r.quantity]));
  const set = (type: keyof typeof packageLabels, quantity: number) => {
    const rest = value.filter((r) => r.type !== type);
    onChange(
      quantity > 0
        ? [
            ...rest,
            {
              type,
              quantity,
              blogPriceId: type !== "clip" ? blogId : undefined,
              clipPriceId: type !== "blog" ? clipId : undefined,
            },
          ]
        : rest,
    );
  };
  const blogs = value.reduce(
      (n, r) => n + (r.type !== "clip" ? r.quantity : 0),
      0,
    ),
    clips = value.reduce((n, r) => n + (r.type !== "blog" ? r.quantity : 0), 0);
  return (
    <div className="full">
      <h3>슬롯 장바구니</h3>
      <p className="hint">
        원하는 메뉴를 반복해서 담거나 수량을 입력하세요. 체험단은 블로그 원고
        1개·이미지 3장, 클립은 10초 영상 1개입니다. 프로젝트 생성 후 콘텐츠 제작
        전후에 담당자를 배정할 수 있습니다.
      </p>
      <div className="split">
        {(["blog", "clip"] as const).map((channel) => (
          <label key={channel}>
            {channel === "blog" ? "체험단 판매 단가" : "클립 판매 단가"}
            <select
              value={channel === "blog" ? blogId : clipId}
              onChange={(e) => onPrice(channel, e.target.value)}
            >
              <option value="">단가 선택</option>
              {prices
                .filter(
                  (p) =>
                    p.channel === channel &&
                    (channel === "blog"
                      ? p.images === 3
                      : p.duration === 10 && p.mode === "generated"),
                )
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {String(p.name)} · {money(p.sale)}
                  </option>
                ))}
            </select>
          </label>
        ))}
      </div>
      {(Object.keys(packageLabels) as (keyof typeof packageLabels)[]).map(
        (type) => (
          <div className="amountline" key={type}>
            <span>
              <strong>{packageLabels[type]}</strong>
              <small style={{ display: "block" }}>
                기본 보수 {money(rewardDefaults[type])}
                {type === "bundle" ? " · 두 채널 업로드 확인 후 1회 지급" : ""}
              </small>
            </span>
            <div className="row">
              <button
                type="button"
                disabled={
                  (!blogId && type !== "clip") || (!clipId && type !== "blog")
                }
                onClick={() => set(type, (quantities[type] || 0) + 1)}
              >
                + 담기
              </button>
              <input
                aria-label={packageLabels[type] + " 수량"}
                style={{ width: 90 }}
                type="number"
                min={0}
                max={100}
                step={1}
                value={quantities[type] || 0}
                onChange={(e) => set(type, Number(e.target.value))}
              />
              <button
                type="button"
                disabled={!quantities[type]}
                onClick={() =>
                  set(type, Math.max(0, (quantities[type] || 0) - 1))
                }
              >
                −
              </button>
            </div>
          </div>
        ),
      )}
      <p className="notice">
        체험단 {blogs}건 · 이미지 {blogs * 3}장 · 클립 {clips}건 · 작업 슬롯{" "}
        {value.reduce((n, r) => n + r.quantity, 0)}개 · 기본 보수{" "}
        {money(
          value.reduce((n, r) => n + rewardDefaults[r.type] * r.quantity, 0),
        )}
      </p>
      <p className="hint">
        판매가는 선택한 기존 단가의 합계입니다. 묶음 보수는 7,000원이며, 단독
        2건을 각각 주문하면 3,000원씩입니다. AI 예상비용 미등록 상품은 시스템의
        잠정 예산값으로 계산합니다.
      </p>
    </div>
  );
}
