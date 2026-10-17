"use client";
import { useState } from "react";
import { Button, Field, EmptyState } from "./ui/workflow-ui";
import type { DatabaseView, RecordData } from "@/lib/types";

export default function DeletedCatalog({
  data,
  busy,
  onRestore,
}: {
  data: DatabaseView;
  busy: boolean;
  onRestore: (row: RecordData) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const rows = [...data.customers, ...data.products]
    .filter((r) => r.deletedAt)
    .filter((r) =>
      [
        r.name,
        r.kind === "products"
          ? data.customers.find((c) => c.id === r.customerId)?.name
          : "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    );
  return (
    <section className="section" aria-label="삭제된 고객·제품">
      <h2>삭제된 고객·제품</h2>
      <p className="hint">
        고객을 복원하면 함께 삭제된 제품도 돌아옵니다. 따로 삭제한 제품은 개별로
        복원해주세요.
      </p>
      <Field>
        삭제된 고객·제품 검색
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="고객명 또는 제품명"
        />
      </Field>
      {!rows.length && (
        <EmptyState
          title="삭제된 항목이 없습니다"
          description={
            query
              ? "다른 검색어로 찾아보세요."
              : "삭제한 고객과 제품이 여기에 표시됩니다."
          }
        />
      )}
      {rows.map((r) => {
        const parent =
          r.kind === "products"
            ? data.customers.find((c) => c.id === r.customerId)
            : null;
        const blocked =
          r.kind === "products" && (!parent || !!parent.deletedAt);
        return (
          <article className="catalog-deleted-item" key={r.id}>
            <div>
              <span className="hint">
                {r.kind === "customers" ? "고객" : "제품"}
                {parent ? ` · ${String(parent.name)}` : ""}
              </span>
              <h3>{String(r.name)}</h3>
              <p className="hint">
                삭제일{" "}
                {new Date(String(r.deletedAt)).toLocaleString("ko-KR", {
                  timeZone: "Asia/Seoul",
                })}
              </p>
              {blocked && (
                <p className="hint">
                  고객을 먼저 복원하면 제품을 복원할 수 있어요.
                </p>
              )}
            </div>
            <Button
              disabled={busy || blocked}
              onClick={() => void onRestore(r)}
            >
              {r.kind === "customers" ? "고객 복원" : "제품 복원"}
            </Button>
          </article>
        );
      })}
    </section>
  );
}
