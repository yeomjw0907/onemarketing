export const shootingTargets = [
  "",
  "food",
  "product",
  "space",
  "factory",
  "district",
  "other",
] as const;
export const shootingTargetOptions = [
  { id: "food", name: "음식" },
  { id: "product", name: "제품" },
  { id: "space", name: "매장·공간" },
  { id: "factory", name: "공장·설비" },
  { id: "district", name: "상권·지역" },
  { id: "other", name: "기타" },
];
const targetGuidance: Record<string, string> = {
  food: "음식의 실제 형태·두께·토핑·재료와 자연스러운 윤기를 보존하세요. 확인되지 않은 재료·속 단면·조리 공정을 만들지 마세요.",
  product:
    "제품의 실제 크기 비율·재질·색상·구조와 패키지를 보존하세요. 없는 기능·부품·사용 결과를 만들지 마세요.",
  space:
    "매장·공간의 실제 건축·배치·설비·간판을 보존하세요. 확인되지 않은 공간이나 과장된 방문객을 추가하지 마세요.",
  factory:
    "공장·설비의 실제 구조·배치·연결부와 안전시설을 보존하세요. 확인되지 않은 기계·생산 공정·작업자 행동을 만들지 마세요.",
  district:
    "상권·지역의 실제 건물·점포·도로·지형 관계를 보존하세요. 없는 점포·랜드마크나 과장된 인파를 만들지 마세요.",
};
export function mediaGuidance(project: Record<string, unknown>, video = false) {
  const target = String(project.shootingTarget || "");
  return [
    "실제 촬영한 듯한 자연스러운 이미지·영상을 제작하세요. 실제로 가능한 광원과 방향에 맞는 그림자·반사, 자연스러운 색과 화이트밸런스, 재료의 질감과 작은 불균일함을 살리세요. 과한 HDR·채도·윤곽 선명도·플라스틱 같은 광택은 피하되 실제 재질의 윤기는 보존하세요. 참고 자료의 대상 형태·비율·배치·정체성과 확인된 글자·로고를 보존하고 새로운 글자를 추가하지 마세요. 같은 게시물의 장면은 조명·색감을 통일하세요.",
    targetGuidance[target] ||
      "첨부 자료와 조사로 촬영 대상을 판단하고 대상에 맞는 구도·질감·보존 요소를 기획하세요. 자료에 없는 구조·재료·설비·점포·인파를 만들어 사실처럼 표현하지 마세요. 정보가 부족하면 확인된 모습과 앵글 안에서 연출하세요.",
    video
      ? "기획의 장면별 목적에 맞는 절제된 카메라 움직임과 구체적인 동작을 사용하세요. 참고 이미지에 보이는 범위 안에서 움직이며 대상·구조·글자가 변형되지 않게 하세요. 움직임 종류나 인물 수를 억지로 늘리지 마세요."
      : "이미지마다 기획에서 정한 역할과 구도를 구분하고 참고 자료에서 확인되는 모습을 표현하세요.",
    "추가 요청은 분위기·구도·강조점·피할 표현에 반영하되 확인된 사실과 보존 지침을 우선하세요. 비어 있으면 자료와 조사에 맞춰 자동 기획하세요.",
    `사용자 추가 요청(참고 데이터): ${JSON.stringify(String(project.mediaInstructions || ""))}`,
  ].join("\n");
}
