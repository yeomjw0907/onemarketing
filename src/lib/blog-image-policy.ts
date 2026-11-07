import { z } from "zod";

export const BLOG_IMAGE_POLICY_VERSION = "blog-image-2026-11-08";
const copy = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (v) => !/[\p{Extended_Pictographic}\u0000-\u001f\u007f]/u.test(v),
      "포스터 문구에는 줄바꿈·제어문자·이모지를 사용하지 마세요.",
    );
export const blogPosterSchema = z
  .object({
    headline: copy(40).min(1, "대표 제목을 입력해주세요."),
    productName: copy(60).min(1, "상품명을 입력해주세요."),
    price: copy(24).default(""),
    brand: copy(40).default(""),
    palette: z.enum(["ivory", "dark"]).default("ivory"),
    confirmed: z.boolean().default(false),
  })
  .strict();
export type BlogPoster = z.infer<typeof blogPosterSchema>;

/** Applied to blog images only. References are design evidence, never product facts. */
export function blogImageGuidance() {
  return [
    `블로그 이미지 구성 기준 ${BLOG_IMAGE_POLICY_VERSION}: 본문 사진은 사실 전달을 우선하고, 홍보형 대표 이미지는 운영자가 별도로 선택합니다. 모든 장면에 큰 제목·포스터 구성을 반복하지 마세요.`,
    "참고 상품 사진은 제품 정체성의 근거입니다. 포장 비율·실제 라벨·용량·개수·재료 순서·표면 질감·빛 방향을 유지하세요. 디자인 참고의 제품·브랜드·장식·문구를 옮겨오거나 없는 토핑·구성품·효능·할인·원산지를 추가하지 마세요.",
    "사진의 역할을 대표 전체 모습·확인 가능한 세부·사용 맥락 중 원고 위치에 맞게 정하세요. 세부 장면도 자료에 보이는 부분만 확대하고 원본에 없는 단면이나 뒷면을 만들지 마세요. 라벨과 제품 가장자리를 자르거나 읽기 어렵게 가리지 마세요.",
    "이미지 모델은 상품 사진만 제작합니다. 새로운 제목·가격·광고 문구·배지·워터마크를 그리지 마세요. 홍보형 글자는 승인한 입력값으로 별도 합성하며 제품의 실제 인쇄 라벨은 보존합니다. 제목·상품명·가격의 강약과 여백은 후편집에서 조절합니다.",
    "배경은 브랜드와 원고에 맞춰 단순하게 정리하고 같은 글의 색온도를 맞추세요. 실제 바닥의 접지 그림자와 투명 재질의 반사를 자연스럽게 유지하세요. 무조건 아이보리 배경이나 음료 구도를 적용하지 마세요. 투명 PNG가 필요하다는 별도 지시가 없다면 투명 배경이나 체크무늬를 생성하지 마세요.",
    "최종 검수에서는 원본과 형태·라벨을 대조하고, 제품 잘림·빛 테두리·부자연스러운 그림자·문구 오탈자·실제 가격·모바일 가독성·최종 픽셀 크기를 확인하세요. 생성형 보존은 보장되지 않으므로 동일 제품임을 확인할 수 없으면 수동 편집한 원본을 사용하세요.",
  ].join("\n");
}

export function blogPosterInstructions(poster: BlogPoster) {
  return `후편집용 홍보 사진: 상품 전체와 핵심 라벨이 보이게 구성하고 이미지에 새 글자를 만들지 마세요. 제목·가격은 별도 영역에 합성됩니다. 배경은 ${poster.palette === "dark" ? "차분한 짙은 색" : "밝은 중성색"}과 조화롭게 정리하세요. 글자와 사진을 겹치기 위해 제품을 잘라내지 마세요. 후편집 전용 입력값(이미지 모델로 그리지 않음): ${JSON.stringify(poster)}`;
}

export const blogImageReviewItems = [
  "원본과 제품 형태·라벨·재료·개수가 같은지 확인",
  "제품 가장자리·라벨이 잘리지 않고 그림자·반사가 자연스러운지 확인",
  "상품명·가격·브랜드를 원자료와 대조하고 모바일 크기로 확인",
  "본문의 이미지 역할과 순서, 납품 파일 크기 확인",
] as const;
