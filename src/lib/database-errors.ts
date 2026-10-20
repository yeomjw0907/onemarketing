// Connection failures must not be interpreted as an expired login/device token.
export function databaseUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message, cause } = error as {
    code?: string;
    message?: string;
    cause?: unknown;
  };
  return (
    [
      "53300",
      "57P01",
      "57P02",
      "57P03",
      "ECONNRESET",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "EPIPE",
    ].includes(code || "") ||
    /^08/.test(code || "") ||
    /EMAXCONNSESSION|max clients reached|too many clients|timeout exceeded when trying to connect|connection terminated|connection timeout/i.test(
      message || "",
    ) ||
    Boolean(cause && cause !== error && databaseUnavailable(cause))
  );
}
export function databaseUnavailableResponse() {
  return Response.json(
    { error: "서버 연결이 잠시 지연되고 있어요. 잠시 후 다시 시도해주세요." },
    {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "5" },
    },
  );
}
