import { actor } from "@/lib/auth";
import {
  mcpConsent,
  mcpConnections,
  isMcpAdmin,
  mcpResource,
} from "@/lib/mcp-oauth";
import Connection from "./connection";
import styles from "./connection.module.css";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "원케이션 · 대화 연결",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ request?: string }>;
}) {
  const { request } = await searchParams;
  const email = await actor();
  let consent: { clientName: string; scopes: string[] } | undefined,
    error = "";
  if (request) {
    try {
      consent = await mcpConsent(request);
    } catch {
      error =
        "연결 요청이 만료됐어요. ChatGPT 또는 Codex에서 다시 연결해주세요.";
    }
  }
  const admin = !!email && isMcpAdmin(email);
  const connections = admin ? await mcpConnections(email!) : [];
  return (
    <main className={styles.root}>
      <a className={styles.brand} href="/">
        원케이션
      </a>
      <h1>{request ? "대화에서 원케이션 연결" : "연결 관리"}</h1>
      <p className={styles.lead}>
        고객·제품을 확인하고 캠페인 초안을 준비해요.
      </p>
      <Connection
        email={admin ? email : null}
        request={request}
        consent={consent}
        error={error}
        connections={connections}
        endpoint={mcpResource()}
      />
    </main>
  );
}
