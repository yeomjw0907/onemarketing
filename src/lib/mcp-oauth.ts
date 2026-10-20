import { randomBytes, randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { query, execute, transaction, audit } from "./db";
import { tokenHash } from "./auth";

export const mcpScopes = [
  "catalog:read",
  "catalog:write",
  "campaigns:draft",
] as const;
export const mcpOrigin = () =>
  new URL(process.env.APP_URL || "https://www.onemarketing.kr").origin;
export const mcpResource = () => mcpOrigin() + "/api/mcp";
export function ensureMcpEnabled() {
  if (process.env.MCP_ENABLED === "false")
    throw new Error("연결 기능이 꺼져 있어요.");
}
export class OAuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const invalid = () =>
  new OAuthError(
    "invalid_grant",
    "인증이 만료되었거나 유효하지 않아요. 다시 연결해주세요.",
  );
const opaque = () => randomBytes(32).toString("base64url");
type Data = Record<string, any>;
async function read(
  key: string,
  kind: string,
  locked = false,
): Promise<Data | null> {
  const [r] = await query<{ data: Data }>(
    `select data from mcp_oauth where key=$1 and kind=$2 and expires>$3${locked ? " for update" : ""}`,
    [key, kind, Date.now()],
  );
  return r?.data || null;
}
async function put(key: string, kind: string, data: Data, expires: number) {
  await execute(
    "insert into mcp_oauth (key,kind,data,expires) values ($1,$2,$3::jsonb,$4)",
    [key, kind, JSON.stringify(data), expires],
  );
}
export function isMcpAdmin(email: string) {
  const admins = JSON.parse(process.env.ADMIN_USERS_JSON || "[]") as {
    email: string;
  }[];
  return admins.some((a) => a.email.toLowerCase() === email.toLowerCase());
}
export async function mcpRateLimit(
  key: string,
  limit: number,
  windowMs = 60_000,
) {
  const window = Math.floor(Date.now() / windowMs);
  const [r] = await query<{ count: number }>(
    "insert into mcp_rate_limits (key,count,expires) values ($1,1,$2) on conflict (key) do update set count=mcp_rate_limits.count+1 returning count",
    [tokenHash(key + ":" + window), (window + 1) * windowMs],
  );
  if (r.count > limit)
    throw new OAuthError(
      "slow_down",
      "요청이 많아요. 잠시 후 다시 시도해주세요.",
      429,
    );
}
export function validRedirect(value: string) {
  try {
    const u = new URL(value);
    if (u.hash || u.username || u.password) return false;
    if (u.origin === "https://chatgpt.com")
      return (
        u.pathname.startsWith("/connector/") ||
        u.pathname === "/connector_platform_oauth_redirect"
      );
    return (
      u.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) &&
      u.pathname === "/callback"
    );
  } catch {
    return false;
  }
}
export async function registerMcpClient(input: unknown) {
  ensureMcpEnabled();
  const b = z
    .object({
      client_name: z.string().trim().min(1).max(100).default("ChatGPT / Codex"),
      redirect_uris: z
        .array(z.string().max(2048).refine(validRedirect))
        .min(1)
        .max(10),
      token_endpoint_auth_method: z.literal("none").default("none"),
      grant_types: z
        .array(z.enum(["authorization_code", "refresh_token"]))
        .default(["authorization_code", "refresh_token"]),
      response_types: z.array(z.literal("code")).default(["code"]),
    })
    .parse(input);
  const client_id = randomUUID();
  await put(client_id, "client", b, Date.now() + 365 * 86400000);
  return {
    client_id,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    ...b,
  };
}
function requestedScopes(value: string) {
  const scopes = [
    ...new Set((value || "catalog:read").split(" ").filter(Boolean)),
  ];
  if (scopes.some((s) => !(mcpScopes as readonly string[]).includes(s)))
    throw new OAuthError("invalid_scope", "허용되지 않은 권한입니다.");
  return scopes;
}
export async function beginMcpAuthorization(params: URLSearchParams) {
  ensureMcpEnabled();
  const client = await read(params.get("client_id") || "", "client");
  const redirect = params.get("redirect_uri") || "";
  if (!client || !client.redirect_uris.includes(redirect))
    throw new OAuthError("invalid_request", "등록된 연결 주소를 확인해주세요.");
  const challenge = params.get("code_challenge") || "";
  if (
    params.get("response_type") !== "code" ||
    params.get("code_challenge_method") !== "S256" ||
    !/^[A-Za-z0-9_-]{43}$/.test(challenge) ||
    params.get("resource") !== mcpResource()
  )
    throw new OAuthError(
      "invalid_request",
      "PKCE와 연결 대상 정보를 확인해주세요.",
    );
  const state = params.get("state") || "";
  if (state.length > 2048)
    throw new OAuthError("invalid_request", "요청이 너무 깁니다.");
  const id = opaque(),
    binding = opaque();
  await put(
    tokenHash(id),
    "consent",
    {
      clientId: params.get("client_id"),
      clientName: client.client_name,
      redirect,
      challenge,
      state,
      scopes: requestedScopes(params.get("scope") || ""),
      resource: mcpResource(),
      binding: tokenHash(binding),
    },
    Date.now() + 10 * 60000,
  );
  return { id, binding };
}
export async function mcpConsent(id: string) {
  const data = await read(tokenHash(id), "consent");
  if (!data) throw invalid();
  return {
    clientName: String(data.clientName),
    scopes: data.scopes as string[],
  };
}
export async function approveMcpAuthorization(
  id: string,
  binding: string,
  email: string,
  allow: boolean,
) {
  ensureMcpEnabled();
  if (!isMcpAdmin(email))
    throw new OAuthError("access_denied", "관리자만 연결할 수 있어요.", 403);
  return transaction(async () => {
    const key = tokenHash(id),
      d = await read(key, "consent", true);
    if (!d || d.binding !== tokenHash(binding)) throw invalid();
    await execute("delete from mcp_oauth where key=$1", [key]);
    const url = new URL(d.redirect);
    if (allow) {
      const code = opaque();
      await put(
        tokenHash(code),
        "code",
        { ...d, email },
        Date.now() + 5 * 60000,
      );
      url.searchParams.set("code", code);
    } else url.searchParams.set("error", "access_denied");
    if (d.state) url.searchParams.set("state", d.state);
    await audit(
      email,
      allow ? "mcp-consent" : "mcp-consent-denied",
      String(d.clientId),
      { scopes: d.scopes },
    );
    return url.toString();
  });
}
async function issueTokens(grantId: string, grant: Data) {
  const access = opaque(),
    refresh = opaque(),
    now = Date.now();
  await put(
    tokenHash(access),
    "access",
    { grantId, clientId: grant.clientId, resource: grant.resource },
    now + 3600000,
  );
  await put(
    tokenHash(refresh),
    "refresh",
    { grantId, clientId: grant.clientId, used: false },
    Math.min(now + 30 * 86400000, grant.expires),
  );
  return {
    access_token: access,
    refresh_token: refresh,
    token_type: "Bearer",
    expires_in: 3600,
    scope: grant.scopes.join(" "),
  };
}
export async function exchangeMcpToken(p: URLSearchParams) {
  ensureMcpEnabled();
  const clientId = p.get("client_id") || "";
  if (!(await read(clientId, "client")))
    throw new OAuthError("invalid_client", "등록된 클라이언트가 아닙니다.");
  if (p.has("resource") && p.get("resource") !== mcpResource()) throw invalid();
  const result = await transaction(async () => {
    if (p.get("grant_type") === "authorization_code") {
      const key = tokenHash(p.get("code") || ""),
        d = await read(key, "code", true);
      const verifier = p.get("code_verifier") || "";
      if (
        !d ||
        d.clientId !== clientId ||
        d.redirect !== p.get("redirect_uri") ||
        !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) ||
        createHash("sha256").update(verifier).digest("base64url") !==
          d.challenge ||
        !isMcpAdmin(d.email)
      )
        throw invalid();
      await execute("delete from mcp_oauth where key=$1", [key]);
      const grantId = randomUUID(),
        expires = Date.now() + 90 * 86400000;
      const grant = {
        email: d.email,
        clientId,
        resource: d.resource,
        scopes: d.scopes,
        expires,
      };
      await put(grantId, "grant", grant, expires);
      return issueTokens(grantId, grant);
    }
    if (p.get("grant_type") === "refresh_token") {
      const key = tokenHash(p.get("refresh_token") || ""),
        r = await read(key, "refresh", true);
      if (!r || r.clientId !== clientId) throw invalid();
      const g = await read(r.grantId, "grant", true);
      if (!g || g.revoked || !isMcpAdmin(g.email)) throw invalid();
      if (r.used) {
        await execute(
          "update mcp_oauth set data=jsonb_set(data,'{revoked}','true') where key=$1",
          [r.grantId],
        );
        return null;
      }
      if (p.has("scope") && p.get("scope") !== g.scopes.join(" "))
        throw new OAuthError(
          "invalid_scope",
          "다시 연결하여 권한을 변경해주세요.",
        );
      await execute(
        "update mcp_oauth set data=jsonb_set(data,'{used}','true') where key=$1",
        [key],
      );
      return issueTokens(r.grantId, g);
    }
    throw new OAuthError(
      "unsupported_grant_type",
      "지원하지 않는 인증 방식입니다.",
    );
  });
  if (!result) throw invalid();
  return result;
}
export type McpIdentity = {
  email: string;
  clientId: string;
  grantId: string;
  scopes: string[];
};
export async function mcpIdentity(token: string): Promise<McpIdentity | null> {
  ensureMcpEnabled();
  const a = await read(tokenHash(token), "access");
  if (!a || a.resource !== mcpResource()) return null;
  const g = await read(a.grantId, "grant");
  if (
    !g ||
    g.revoked ||
    g.resource !== mcpResource() ||
    !isMcpAdmin(g.email) ||
    !(await read(a.clientId, "client"))
  )
    return null;
  return {
    email: g.email,
    clientId: a.clientId,
    grantId: a.grantId,
    scopes: g.scopes,
  };
}
export async function revokeMcpToken(token: string, clientId: string) {
  const key = tokenHash(token),
    [r] = await query<{ data: Data }>(
      "select data from mcp_oauth where key=$1 and kind in ('access','refresh')",
      [key],
    );
  if (r?.data.clientId === clientId)
    await execute(
      "update mcp_oauth set data=jsonb_set(data,'{revoked}','true') where key=$1 and kind='grant'",
      [r.data.grantId],
    );
}
export async function revokeMcpGrant(grantId: string, email: string) {
  const d = await read(grantId, "grant");
  if (d?.email !== email) throw invalid();
  await execute(
    "update mcp_oauth set data=jsonb_set(data,'{revoked}','true') where key=$1",
    [grantId],
  );
  await audit(email, "mcp-disconnect", grantId);
}
export async function mcpConnections(email: string) {
  const rows = await query<{ key: string; data: Data }>(
    "select key,data from mcp_oauth where kind='grant' and data->>'email'=$1 and expires>$2 and coalesce(data->>'revoked','false')<>'true'",
    [email, Date.now()],
  );
  return Promise.all(
    rows.map(async (r) => ({
      id: r.key,
      name: (await read(r.data.clientId, "client"))?.client_name || "연결된 앱",
      scopes: r.data.scopes as string[],
    })),
  );
}
