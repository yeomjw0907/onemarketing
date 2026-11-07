import evidence from "../../data/clip-lab/editing-evidence-20261108.json";

export type EditingMode = "process" | "dialogue" | "detail" | "context";

export function referenceEditingEvidence(project: Record<string, unknown>) {
  const mode = referenceEditingMode(project);
  const local = evidence.localPatterns
    .filter((p) => p.mode === mode)
    .map((p) => ({
      family: p.mode,
      label: p.label,
      source: p.source,
      status: "conditional-experiment-sampled-visual-check",
    }));
  if (mode === "dialogue") return local;
  const ids =
    mode === "detail"
      ? ["detail-scale", "lateral-motion"]
      : mode === "context"
        ? ["continuity", "fixed-composition"]
        : ["detail-scale", "fixed-composition"];
  const target = String(project.shootingTarget || "");
  const category =
    target === "food" ? "음식" : target === "product" ? "제품" : "광고";
  return [
    ...local,
    ...evidence.families
      .filter((f) => ids.includes(f.id))
      .map((f) => ({
        family: f.id,
        label: f.label,
        source: f.sources.find((s) => s.category === category) || f.sources[0],
        status: "conditional-experiment-unreviewed",
      })),
  ];
}

/** These are conditional production experiments, never inferred product claims. */
export function referenceEditingMode(
  project: Record<string, unknown>,
): EditingMode {
  const explicit = project.mediaEditingMode;
  if (["process", "dialogue", "detail", "context"].includes(String(explicit)))
    return explicit as EditingMode;
  if (
    /대화형|대화체|문답형|dialogue/i.test(
      String(project.mediaInstructions || ""),
    )
  )
    return "dialogue";
  return ["food", "product"].includes(String(project.shootingTarget))
    ? "detail"
    : ["space", "factory", "district"].includes(String(project.shootingTarget))
      ? "context"
      : "process";
}

export function referenceEditingGuidance(
  project: Record<string, unknown>,
  video: boolean,
) {
  const mode = referenceEditingMode(project);
  const common =
    "참고 영상의 편집 관찰에서 가져온 조건부 실험 지침입니다. 원본 화면·문구·음악·인물은 재사용하지 않으며 조회수·전환 효과를 보장하지 않습니다. 확인한 제품 사실과 사용자 승인 기획이 우선합니다.";
  const instructions: Record<EditingMode, string> = {
    process:
      "기능을 나열하지 말고 사용자 상황 하나→동작 하나→확인 가능한 결과 하나로 구성하세요. 앱 원본이 사용 허용된 경우 핵심 영역을 크게 보여주고 전체 휴대폰을 작게 넣은 채 스크롤하지 마세요. 원본이 없으면 실제 앱 화면·리포트·점수를 생성하지 말고 설명용 생성 장면으로 같은 인과 관계를 표현하세요.",
    dialogue:
      "대화형 편집은 화자별 위치·색을 고정하고 질문→답→반응 순서를 유지하세요. 각 대사는 확정 음성 대본과 같은 문구를 쓰고 실제 발화에 맞춰 후편집하세요. 밈·유명인·동물 이미지를 무단 복제하지 말고 허용된 자료나 생성 이미지·영상으로 구현하세요. 화자 전환은 후편집하며 한 생성 요청에 여러 컷을 요구하지 마세요.",
    detail:
      "첫 장면에서 제품 전체나 핵심 세부를 알아볼 수 있게 하고 다음 장면은 같은 제품의 전체↔세부 관계로 설계하세요. 매 장면 같은 확대를 반복하지 말고 고정 구도·작은 옆 이동·접근 중 장면 역할에 맞는 하나를 선택하세요. 자료에 없는 뒷면·단면·조리·변형은 드러내지 마세요.",
    context:
      "공간의 위치 관계를 먼저 보여준 뒤 같은 구조의 세부로 연결하세요. 장면 연결은 피사체 위치·화면 크기·이동 방향·빛의 구체적 일치 조건으로 정하세요. 독립 생성 장면은 끝 프레임을 실제 전달하지 않았다면 연속 촬영처럼 이어진다고 가정하지 마세요. 장면별 같은 전경 확대를 반복하지 마세요.",
  };
  return [
    common,
    `편집 관찰 근거(제품 사실이 아닌 참고 데이터): ${JSON.stringify(referenceEditingEvidence(project))}. 공개 영상 ${evidence.observationCount}개 중 관찰된 대표 구간이며 첫 30초·1fps입니다. AI 관찰은 전수 원본 대조되지 않았고 반복 횟수는 성과 지표가 아닙니다. 대화형 화자 배치는 별도 첨부 참고 영상의 표집 프레임을 바탕으로 한 실험 지침입니다.`,
    instructions[mode],
    video
      ? "현재 한 번의 생성에서는 시작→중간→끝의 한 가지 가시적 변화와 카메라 동작 하나를 구체적으로 정하세요. 카메라 이동으로 새 면이 드러나면 기준 자료에서 확인 가능한 범위로 제한하세요. 제품이 고정이어도 확인 가능한 시차·빛 반사·주변의 작은 움직임 중 적합한 것을 설계하되 없는 증기·작업자·효능은 추가하지 마세요. 전환·제목·자막·CTA는 후편집합니다. 긴 로고 마무리 대신 행동 안내를 읽을 시간만 확보하세요."
      : "설명용 이미지의 장면 역할을 구분하고 다음 컷과 맞출 대상 위치·크기·색·여백을 계획하세요. 이미지가 정지된다는 한계를 움직이는 생성 영상으로 소개하지 마세요. 문장을 작게 줄여 모두 넣기보다 한 화면 한 정보로 나누세요.",
  ].join("\n");
}

export type EditingBrief = {
  scenes: { action: string; camera: string; continuityConstraint?: string }[];
  warnings: string[];
};
/** Display actionable review notes; preserve approved creative choices and existing notes. */
export function editingReviewWarnings(brief: EditingBrief) {
  const notes = [...brief.warnings];
  if (brief.scenes.length > 1) {
    const cameras = brief.scenes.map((s) => s.camera.trim()).filter(Boolean);
    if (cameras.length === brief.scenes.length && new Set(cameras).size === 1)
      notes.push(
        "편집 검토: 모든 장면의 카메라 연출이 같습니다. 장면 역할에 맞춰 고정·전체·세부 구도를 구분할지 확인해주세요.",
      );
    if (brief.scenes.slice(1).some((s) => !s.continuityConstraint?.trim()))
      notes.push(
        "편집 검토: 다음 장면과 맞출 피사체 위치·크기·이동 방향·광원을 적어주세요. 전환 효과만으로 연결을 보장할 수 없습니다.",
      );
  }
  return [...new Set(notes)].slice(0, 10);
}
