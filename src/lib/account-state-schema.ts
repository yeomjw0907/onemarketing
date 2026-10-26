import { z } from "zod";
import { campaignInput } from "./commerce-policy";
const draft = z
  .object({
    title: z.string().max(120),
    brand: z.string().max(120),
    product: z.string().max(300),
    guide: z.string().max(5000),
    kind: z.enum(["self_cash", "self_product", "package"]),
    channel: z.enum(["blog", "clip", "bundle"]),
    quantity: z.number().int().min(0).max(100),
    reward: z.number().int().min(0).max(1000000),
    benefit: z.string().max(500),
    managed: z.boolean(),
    deadline: z.string().max(10),
    submissionDeadline: z.string().max(10),
    category: campaignInput.shape.category,
    fulfillment: campaignInput.shape.fulfillment,
    region: z.string().max(100).optional(),
    imageUrl: z.string().max(2000).optional(),
    visibility: campaignInput.shape.visibility,
  })
  .strict();
export const builderStateSchema = z
  .object({
    draft: draft.nullable(),
    cart: z.array(campaignInput).max(10),
    step: z.number().int().min(0).max(3),
    editing: z.number().int().min(0).max(9).nullable(),
  })
  .strict()
  .refine(
    (v) => v.editing === null || v.editing < v.cart.length,
    "수정할 장바구니 항목이 변경됐어요.",
  );
export type BuilderState = z.infer<typeof builderStateSchema>;
export const emptyBuilder = (): BuilderState => ({
  draft: null,
  cart: [],
  step: 0,
  editing: null,
});
