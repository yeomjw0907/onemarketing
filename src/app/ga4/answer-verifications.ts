import suppliedQuestions from "./data/source-questions.json";

type AnswerVerification = {
  answer: number;
  checkedAt: string;
  note: string;
  options?: string[];
};

// Compared with each record's original source URL on 2026-11-19. Numbers apply
// to the option set displayed here, not to an arbitrary reordered exam version.
const acquisition = suppliedQuestions.find((row) => row.id === 59)!;

export const answerVerifications: Partial<Record<number, AnswerVerification>> =
  {
    41: {
      answer: 3,
      checkedAt: "2026-11-19",
      note: "원문의 4번째 보기 Collection과 정답 문장의 the Collection이 같은 항목임을 확인했습니다.",
    },
    42: {
      answer: 3,
      checkedAt: "2026-11-19",
      note: "원문의 4번째 보기 Collection과 정답 문장의 the Collection이 같은 항목임을 확인했습니다.",
    },
    47: {
      answer: 3,
      checkedAt: "2026-11-19",
      note: "원문의 4번째 보기 Comparisons가 정답입니다. 정답 문장의 단수형 Comparison과 같은 구성요소입니다.",
    },
    59: {
      answer: 3,
      checkedAt: "2026-11-19",
      note: "원문에서 보기 4개의 순서와 굵게 표시된 4번 정답을 확인했습니다. 엑셀에 누락된 보기를 보완하고, 잘못된 위치에 추출된 기존 보기는 원문의 3번 위치로 복원했습니다. 원문 1번 보기의 ampaign 오탈자는 campaign으로 정리했습니다.",
      options: [
        "The Traffic Acquisition Report looks at the very first campaign/source/medium the user arrived at your site with, whereas the User Acquisition Report looks at the campaign/source/medium for the session.",
        "The Traffic Acquisition Report looks at the campaign/source/medium the user arrived at your site with using a data-driven attribution model, whereas the User Acquisition Report looks at the campaign/source/medium of the last touch.",
        acquisition.options[0],
        acquisition.correctAnswer,
      ],
    },
    99: {
      answer: 3,
      checkedAt: "2026-11-19",
      note: "4번 보기에 병기된 Default channel grouping과 Session primary channel group을 확인했습니다. 정답 문장은 같은 두 명칭의 순서만 다릅니다.",
    },
    158: {
      answer: 3,
      checkedAt: "2026-11-19",
      note: "원문은 구용어·신용어 보기 세트를 함께 제시합니다. 현재 표시된 구용어 세트에서는 4번 Conversion events입니다. 신용어 세트의 Key events는 2번이므로 보기 세트가 다르면 번호도 달라집니다.",
    },
  };
