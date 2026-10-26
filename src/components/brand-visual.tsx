import Image from "next/image";
import "./brand-visual.css";

const assets = {
  connection: "linked-rings-v1",
  flow: "about-ribbon-v1",
  products: "product-blocks-v1",
  recruit: "recruit-orbs-v1",
  content: "content-pages-v1",
  managed: "managed-check-v1",
  ai: "ai-connector-v1",
} as const;

export default function BrandVisual({
  kind,
  size = "point",
  priority = false,
  sizes,
}: {
  kind: keyof typeof assets;
  size?: "hero" | "point" | "inline";
  priority?: boolean;
  sizes?: string;
}) {
  return (
    <span className={"brand-visual brand-visual--" + size} aria-hidden="true">
      <Image
        src={"/images/brand/" + assets[kind] + ".webp"}
        alt=""
        width={960}
        height={960}
        sizes={
          sizes ||
          (size === "point"
            ? "(max-width: 700px) 64px, 88px"
            : "(max-width: 700px) 56px, 80px")
        }
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
      />
    </span>
  );
}
