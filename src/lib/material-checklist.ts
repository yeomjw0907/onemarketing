import type { RecordData } from "./types";

export const materialItems = [
  ["intake", "고객 작성 엑셀", true],
  ["photos", "제품·매장 원본 사진", true],
  ["facts", "제품 정보·소구점", true],
  ["price", "가격·혜택·적용 기간", false],
  ["required", "필수 문구·링크·키워드", true],
  ["forbidden", "금지 표현·주의사항", true],
  ["rights", "사진·자료 사용 권한", true],
] as const;
export type MaterialItem = {
  key: string;
  label: string;
  required: boolean;
  status: "missing" | "received" | "confirmed";
  note: string;
};
export function materialChecklist(
  project: RecordData,
  assets: RecordData[],
): MaterialItem[] {
  const saved = (project.materialChecklist || []) as MaterialItem[];
  const sources = assets.filter(
    (a) => a.projectId === project.id && a.category === "source",
  );
  return materialItems.map(([key, label, required]) => {
    const item = saved.find((i) => i.key === key);
    const received =
      key === "photos"
        ? sources.some((a) => String(a.mime).startsWith("image/"))
        : key === "intake"
          ? sources.some((a) => /\.(xlsx|csv)$/i.test(String(a.name)))
          : false;
    return {
      key,
      label,
      required: item?.required ?? required,
      status:
        item?.status === "confirmed"
          ? "confirmed"
          : received
            ? "received"
            : item?.status || "missing",
      note: item?.note || "",
    };
  });
}
export function materialRequest(project: RecordData, items: MaterialItem[]) {
  const missing = items.filter((i) => i.required && i.status !== "confirmed");
  if (!missing.length)
    return `${project.name} 제작 필수 자료 확인이 완료되었습니다. 변경 사항이 있으면 알려주세요.`;
  return `${project.name} 콘텐츠 제작 자료 확인 요청드립니다.\n${missing.map((i) => `• ${i.label}: ${i.status === "received" ? "접수 자료 내용 확인 필요" : "자료 전달 부탁드립니다"}${i.note ? ` (${i.note})` : ""}`).join("\n")}\n해당 없는 항목은 ‘해당 없음’으로 알려주세요. 원본 사진과 작성한 엑셀을 함께 전달해 주세요.`;
}
