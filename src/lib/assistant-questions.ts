import { z } from "zod";
import { list } from "./db";

const specSchema = z
  .object({
    kind: z.enum([
      "customer",
      "product",
      "channels",
      "quantities",
      "dates",
      "price",
      "choice",
    ]),
    title: z.string().trim().min(1).max(120),
    customerId: z.string().max(100).optional(),
    channel: z.enum(["blog", "clip"]).optional(),
    options: z
      .array(z.string().trim().min(1).max(100))
      .min(2)
      .max(6)
      .optional(),
  })
  .strict();
export type AssistantQuestion = {
  kind: z.infer<typeof specSchema>["kind"];
  title: string;
  customerId?: string;
  channel?: "blog" | "clip";
  options: { value: string; label: string }[];
};
export async function prepareAssistantQuestion(
  raw: string,
): Promise<AssistantQuestion | null> {
  if (raw === "{}") return null;
  const s = specSchema.parse(JSON.parse(raw));
  let options: AssistantQuestion["options"] = [];
  const customers = () =>
    list("customers").then((rows) => rows.filter((r) => !r.deletedAt));
  if (s.kind === "customer")
    options = (await customers()).map((r) => ({
      value: r.id,
      label: String(r.name || "이름 없음"),
    }));
  if (s.kind === "product") {
    if (
      !s.customerId ||
      !(await customers()).some((r) => r.id === s.customerId)
    )
      throw new Error("고객을 먼저 선택해주세요.");
    options = (await list("products"))
      .filter((r) => !r.deletedAt && r.customerId === s.customerId)
      .map((r) => ({ value: r.id, label: String(r.name || "이름 없음") }));
  }
  if (s.kind === "price") {
    if (!s.channel) throw new Error("콘텐츠 종류를 먼저 선택해주세요.");
    options = (await list("prices"))
      .filter(
        (r) => !r.deletedAt && r.channel === s.channel && Number(r.sale) > 0,
      )
      .map((r) => ({
        value: r.id,
        label: `${r.name} · 공급 단가 ${Number(r.sale).toLocaleString("ko-KR")}원`,
      }));
  }
  if (s.kind === "channels")
    options = [
      { value: "blog", label: "블로그" },
      { value: "clip", label: "클립" },
    ];
  if (s.kind === "choice") {
    if (!s.options) throw new Error("선택지가 없어요.");
    options = [...new Set(s.options)].map((v) => ({ value: v, label: v }));
  }
  return {
    kind: s.kind,
    title: s.title,
    ...(s.customerId ? { customerId: s.customerId } : {}),
    ...(s.channel ? { channel: s.channel } : {}),
    options,
  };
}
export async function assistantQuestionAnswer(
  q: AssistantQuestion,
  values: string[],
) {
  if (q.kind === "quantities") {
    if (values.length !== 2 || values.some((v) => !/^\d{1,3}$/.test(v)))
      throw new Error("블로그·클립 수량을 숫자로 입력해주세요.");
    const [blog, clip] = values.map(Number);
    if (blog + clip < 1 || blog + clip > 100)
      throw new Error("게시 수량 합계는 1~100개로 입력해주세요.");
    return `${q.title}\n블로그 ${blog}개, 클립 ${clip}개`;
  }
  if (q.kind === "dates") {
    if (
      values.length !== 2 ||
      values.some(
        (v) =>
          !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
          !Number.isFinite(Date.parse(v)) ||
          new Date(v).toISOString().slice(0, 10) !== v,
      ) ||
      values[0] > values[1]
    )
      throw new Error("시작일과 마감일을 순서에 맞게 선택해주세요.");
    return `${q.title}\n게시 시작일 ${values[0]}, 게시 마감일 ${values[1]}`;
  }
  if (
    !values.length ||
    new Set(values).size !== values.length ||
    (q.kind !== "channels" && values.length !== 1)
  )
    throw new Error("선택 항목을 확인해주세요.");
  const fresh = await prepareAssistantQuestion(
    JSON.stringify({
      kind: q.kind,
      title: q.title,
      ...(q.customerId ? { customerId: q.customerId } : {}),
      ...(q.channel ? { channel: q.channel } : {}),
      ...(q.kind === "choice"
        ? { options: q.options.map((o) => o.value) }
        : {}),
    }),
  );
  const labels = values.map((value) => {
    const old = q.options.find((o) => o.value === value),
      now = fresh?.options.find((o) => o.value === value);
    if (!old || !now || old.label !== now.label)
      throw new Error("선택지가 변경됐어요. 최신 정보로 다시 질문해주세요.");
    return ["customer", "product", "price"].includes(q.kind)
      ? `${now.label} (ID: ${value})`
      : now.label;
  });
  return `${q.title}\n선택: ${labels.join(", ")}`;
}
