import BrandOrb from "@/components/brand-orb";
export default function LoadingReport() {
  return (
    <main className="customer-report">
      <span className="ui-eyebrow">원케이션 · 고객 보고</span>
      <p>
        <BrandOrb
          active
          size={64}
          state="connecting"
          label="캠페인 진행 상황을 불러오고 있어요."
        />
      </p>
    </main>
  );
}
