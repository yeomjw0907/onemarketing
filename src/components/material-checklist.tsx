"use client";
import { useState } from "react";
import { materialChecklist, materialRequest } from "@/lib/material-checklist";
import type { RecordData } from "@/lib/types";

export default function MaterialChecklist({
  project,
  assets,
  onSave,
}: {
  project: RecordData;
  assets: RecordData[];
  onSave: (items: unknown[]) => Promise<unknown>;
}) {
  const [items, setItems] = useState(() => materialChecklist(project, assets));
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const request = materialRequest(project, items);
  return (
    <section className="section material-checklist">
      <div className="section-title">
        <h2>자료 체크리스트</h2>
        <span>
          {items.filter((i) => i.required && i.status === "confirmed").length}/
          {items.filter((i) => i.required).length} 필수 확인
        </span>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage("");
          try {
            await onSave(items);
            setMessage("체크리스트를 저장했습니다.");
          } catch (e) {
            setMessage(e instanceof Error ? e.message : "저장 실패");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>자료</th>
                <th>필수</th>
                <th>상태</th>
                <th>확인 메모</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.key}>
                  <td>{item.label}</td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`${item.label} 필수`}
                      checked={item.required}
                      disabled={Boolean(project.settled)}
                      onChange={(e) =>
                        setItems(
                          items.map((i, n) =>
                            n === index
                              ? { ...i, required: e.target.checked }
                              : i,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <select
                      aria-label={`${item.label} 상태`}
                      value={item.status}
                      disabled={Boolean(project.settled)}
                      onChange={(e) =>
                        setItems(
                          items.map((i, n) =>
                            n === index
                              ? {
                                  ...i,
                                  status: e.target.value as typeof i.status,
                                }
                              : i,
                          ),
                        )
                      }
                    >
                      <option value="missing">미접수</option>
                      <option value="received">접수</option>
                      <option value="confirmed">확인 완료</option>
                    </select>
                  </td>
                  <td>
                    <input
                      aria-label={`${item.label} 메모`}
                      maxLength={1000}
                      value={item.note}
                      disabled={Boolean(project.settled)}
                      onChange={(e) =>
                        setItems(
                          items.map((i, n) =>
                            n === index ? { ...i, note: e.target.value } : i,
                          ),
                        )
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row">
          <button
            className="primary"
            disabled={busy || Boolean(project.settled)}
          >
            체크리스트 저장
          </button>
          <a href="/api/templates/customer-intake">고객 작성 엑셀 다운로드</a>
        </div>
      </form>
      <details>
        <summary>고객에게 보낼 자료 요청문</summary>
        <textarea
          aria-label="고객 자료 요청문"
          value={request}
          readOnly
          rows={9}
        />
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(request);
              setMessage("요청문을 복사했습니다.");
            } catch {
              setMessage("요청문을 선택해 직접 복사해 주세요.");
            }
          }}
        >
          요청문 복사
        </button>
      </details>
      <p className="hint">
        파일 등록 시 사진·엑셀은 접수로 표시됩니다. 내용을 검토한 뒤 확인 완료로
        저장하세요. 해당 없는 항목은 필수를 해제하고 메모를 남기세요.
      </p>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
