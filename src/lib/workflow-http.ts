import {
  databaseUnavailable,
  databaseUnavailableResponse,
} from "./database-errors";
import { ZodError } from "zod";
import { WorkflowConflict } from "./workflow-store";
export const privateHeaders = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};
export class WorkflowError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function workflowBody(
  request: Request,
  limit = 64000,
): Promise<unknown> {
  const buffer = await workflowBuffer(request, limit);
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    throw new WorkflowError("요청 형식을 확인해주세요.");
  }
}
export async function workflowBuffer(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new WorkflowError("요청 내용을 확인해주세요.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new WorkflowError("입력 내용이 너무 깁니다.", 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export function workflowFailure(error: unknown) {
  if (databaseUnavailable(error)) return databaseUnavailableResponse();
  const status =
    error instanceof WorkflowError
      ? error.status
      : error instanceof WorkflowConflict
        ? 409
        : error instanceof ZodError
          ? 400
          : error instanceof Error &&
              /로그인이 필요|접속 링크|접속이 만료|다시 인증/.test(
                error.message,
              )
            ? 401
            : error instanceof Error &&
                error.message === "허용되지 않은 요청입니다."
              ? 403
              : 500;
  const message =
    error instanceof ZodError
      ? error.issues[0]?.message
      : status < 500 && error instanceof Error
        ? error.message
        : "처리하지 못했습니다. 잠시 후 다시 시도해주세요.";
  return Response.json({ error: message }, { status, headers: privateHeaders });
}
