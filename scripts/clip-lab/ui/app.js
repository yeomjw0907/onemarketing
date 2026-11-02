const $ = (s) => document.querySelector(s);
let state,
  selected,
  dirty = false,
  detailRevision = "";
let visibleLimit = 60;
const labels = {
  succeeded: "분석 완료",
  sending: "분석 중",
  validating: "결과 검증 중",
  prepared: "분석 준비",
  rejected: "요청 거절",
  uncertain: "응답 확인 필요",
  failed: "처리 실패",
  invalid_result: "결과 검증 실패",
  pending: "미분석",
  skipped: "제출하지 않음",
};
const reviewLabels = {
  unreviewed: "원본 대조 대기",
  "source-checked": "원본 대조 완료",
  rejected: "검토 반려",
};
const el = (tag, value, cls) => {
  const n = document.createElement(tag);
  if (value !== undefined) n.textContent = value;
  if (cls) n.className = cls;
  return n;
};
function msg(s) {
  $("#message").textContent = s;
}
async function api(route, data) {
  const r = await fetch(
    route,
    data === undefined
      ? {}
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data),
        },
  );
  const b = await r.json();
  if (!r.ok) throw new Error(b.error || "요청 실패");
  return b;
}
function entries() {
  const byUrl = new Map(state.runs.map((r) => [r.sourceUrl, r]));
  return state.manifest.references.map((ref) => ({
    ref,
    run:
      byUrl.get(
        "https://www.youtube.com/watch?v=" +
          new URL(ref.url).pathname.split("/").pop(),
      ) || byUrl.get(ref.url),
  }));
}
function renderList() {
  const q = $("#query").value.toLowerCase(),
    cat = $("#category").value,
    views = Number($("#popularity").value),
    status = $("#status").value;
  $("#list").replaceChildren();
  const rows = entries().filter(
    ({ ref, run }) =>
      (!cat || ref.category === cat) &&
      (!views || ref.viewCount >= views) &&
      (!q ||
        [
          ref.title,
          ref.metadata?.title,
          run?.analysis?.summary,
          ...(run?.analysis?.segments || []).flatMap((s) => [
            s.action,
            s.camera,
            s.startState,
            s.endState,
            s.continuity,
            s.transition,
            s.reproduction,
          ]),
          ...(run?.analysis?.hypotheses || []).map((h) => h.statement),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q)) &&
      (!status ||
        (status === "pending"
          ? !run
          : status === "unreviewed" || status === "source-checked"
            ? run?.status === "succeeded" && run?.reviewStatus === status
            : status === "rejected"
              ? run?.status === "rejected" || run?.reviewStatus === "rejected"
              : run?.status === status)),
  );
  for (const { ref, run } of rows.slice(0, visibleLimit)) {
    const b = el(
      "button",
      undefined,
      "item" + (selected === ref.url ? " selected" : ""),
    );
    b.append(
      el("small", ref.category),
      el("strong", ref.metadata?.title || ref.title),
      el(
        "div",
        labels[run?.status || "pending"] +
          (run?.status === "succeeded"
            ? " · " + reviewLabels[run.reviewStatus]
            : ""),
        "status" + (run && run.status !== "succeeded" ? " warning" : ""),
      ),
    );
    b.onclick = () => {
      if (dirty && !confirm("작성 중인 검토 내용을 버리고 이동할까요?")) return;
      dirty = false;
      selected = ref.url;
      renderList();
      renderDetail(ref, run);
    };
    $("#list").append(b);
  }
  if (rows.length > visibleLimit) {
    const more = el(
      "button",
      `다음 ${Math.min(60, rows.length - visibleLimit)}개 보기 · 전체 ${rows.length}개`,
      "secondary",
    );
    more.onclick = () => {
      visibleLimit += 60;
      renderList();
    };
    $("#list").append(more);
  }
  if (!rows.length)
    $("#list").append(el("p", "조건에 맞는 영상이 없습니다.", "empty"));
}
function paragraph(parent, label, value) {
  const p = el("p");
  p.append(el("b", label + " "), document.createTextNode(value));
  parent.append(p);
}
function renderDetail(ref, r) {
  detailRevision = JSON.stringify([r?.id, r?.status, r?.reviewVersion]);
  const d = $("#detail");
  d.replaceChildren(
    el("p", ref.category + " · 수집 단계의 임시 분류", "eyebrow"),
    el("h2", ref.metadata?.title || ref.title),
  );
  if (ref.metadata?.title && ref.metadata.title !== ref.title)
    d.append(el("p", "수집 당시 제목: " + ref.title, "meta"));
  const a = el("a", "YouTube에서 원본 확인하기");
  a.href = ref.url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  d.append(a);
  if (Number.isFinite(ref.viewCount))
    d.append(
      el(
        "p",
        `수집 당시 표시 조회수 ${ref.viewCount.toLocaleString("ko-KR")}회 · 반올림 가능 · ${String(ref.metadata?.checkedAt || "").slice(0, 10)} 기준`,
        "meta",
      ),
    );
  if (!r) {
    d.append(el("p", "아직 분석하지 않은 영상입니다.", "empty"));
    return;
  }
  d.append(
    el(
      "p",
      (labels[r.status] || r.status) +
        " · " +
        new Date(r.startedAt).toLocaleString("ko-KR", {
          timeZone: "Asia/Seoul",
        }),
      "meta",
    ),
  );
  d.append(
    el(
      "p",
      r.estimatedCost
        ? "사용량 기준 추정 $" +
            r.estimatedCost.amount.toFixed(6) +
            " · 청구액 미확인"
        : "비용 미확인",
      "meta",
    ),
  );
  if (!r.analysis) {
    d.append(
      el(
        "p",
        "HTTP " +
          (r.httpStatus || "응답 없음") +
          " · " +
          (r.errorCode || "처리 중") +
          ". 같은 요청은 자동으로 다시 보내지 않습니다.",
        "notice",
      ),
    );
    return;
  }
  const data = r.analysis;
  d.append(
    el("p", data.summary),
    el(
      "p",
      "원본 대조 전 AI 관찰입니다. 장면 시간은 근사값이며 전체 길이는 별도 측정하지 않았습니다.",
      "notice",
    ),
  );
  if (r.languageCheck === "needs-translation")
    d.append(
      el(
        "p",
        "한국어 응답을 확인하지 못했습니다. 번역 검토가 필요합니다.",
        "notice",
      ),
    );
  d.append(el("h3", "시작 장면의 관심 유도"), el("p", data.hook));
  const frame = el("iframe");
  const videoId = new URL(r.sourceUrl).searchParams.get("v");
  frame.src = "https://www.youtube.com/embed/" + videoId;
  frame.title = "원본 영상 " + ref.title;
  frame.loading = "lazy";
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  frame.allowFullscreen = true;
  d.append(frame);
  d.append(el("h3", "장면별 관찰 · " + data.segments.length + "개"));
  const timeline = el("div", undefined, "timeline");
  data.segments.forEach((s, i) => {
    const row = el("div", undefined, "segment");
    const jump = el(
      "button",
      `${i + 1}. ${(s.startMs / 1000).toFixed(1)}–${(s.endMs / 1000).toFixed(1)}초 · ${s.role}`,
    );
    jump.onclick = () => {
      frame.src =
        "https://www.youtube.com/embed/" +
        videoId +
        "?start=" +
        Math.floor(s.startMs / 1000);
    };
    row.append(jump);
    for (const [key, label] of Object.entries({
      visual: "화면",
      action: "동작",
      camera: "카메라",
      startState: "시작 상태",
      endState: "종료 상태",
      audio: "소리",
      caption: "자막",
      transition: "전환",
      continuity: "연속성",
      reproduction: "재현 방법",
    }))
      if (s[key]) paragraph(row, label, s[key]);
    timeline.append(row);
  });
  d.append(timeline);
  d.append(el("h3", "다음 제작에서 시험할 가설"));
  data.hypotheses.forEach((h) => {
    const n = el("div", undefined, "hypothesis");
    paragraph(n, "가설", h.statement);
    paragraph(
      n,
      "근거 장면",
      h.evidenceSegmentIndexes.map((i) => i + 1).join(", "),
    );
    paragraph(n, "비교 실험", h.experiment);
    paragraph(n, "실패 위험", h.failureRisk);
    d.append(n);
  });
  d.append(el("h3", "관찰의 한계"));
  const ul = el("ul");
  data.limitations.forEach((x) => ul.append(el("li", x)));
  d.append(ul);
  const review = el("section", undefined, "review");
  review.append(el("h3", "원본과 대조한 결과 남기기"));
  const choice = el("select");
  choice.setAttribute("aria-label", "검토 상태");
  for (const [v, l] of Object.entries(reviewLabels)) {
    const o = el("option", l);
    o.value = v;
    choice.append(o);
  }
  choice.value = r.reviewStatus;
  const note = el("textarea");
  note.rows = 3;
  note.maxLength = 3000;
  note.value = r.reviewNote;
  note.placeholder = "확인한 구간, 잘못된 관찰, 보완할 내용을 기록하세요.";
  note.setAttribute("aria-label", "원본 대조 기록");
  note.oninput = () => (dirty = true);
  choice.onchange = () => (dirty = true);
  const save = el("button", "검토 기록 저장하기");
  save.onclick = async () => {
    save.disabled = true;
    try {
      await api("/api/review", {
        id: r.id,
        status: choice.value,
        note: note.value,
        version: r.reviewVersion,
      });
      dirty = false;
      await refresh(true);
      const fresh = state.runs.find((x) => x.id === r.id);
      renderDetail(ref, fresh);
      msg("검토 기록을 저장했습니다.");
    } catch (e) {
      msg(e.message);
    } finally {
      save.disabled = false;
    }
  };
  review.append(choice, note, save);
  d.append(review);
}
async function refresh(force = false) {
  try {
    state = await api("/api/state");
    const s = state.summary;
    const knowledge = $("#knowledge");
    knowledge.replaceChildren();
    if (state.knowledge) {
      knowledge.append(
        el("h2", "다음 제작에서 시험할 규칙"),
        el(
          "p",
          "관찰 문구를 분류한 후보입니다. 빈도가 높아도 조회수나 구매 효과가 입증된 것은 아닙니다.",
          "notice",
        ),
      );
      const cards = el("div", undefined, "knowledge-cards");
      for (const p of state.knowledge.patterns) {
        const card = el("div", undefined, "hypothesis");
        card.append(
          el("h3", p.label),
          el("p", p.matchingVideos + "개 영상에서 관련 표현 관찰"),
          el(
            "small",
            "검증 전 후보 · 근거 영상 " + p.evidenceIds.length + "개 연결",
          ),
        );
        const evidence = el("details");
        evidence.append(el("summary", "근거 영상 보기"));
        for (const id of p.evidenceIds) {
          const r = state.runs.find((r) => r.id === id);
          if (r) {
            const link = el("a", r.title || r.sourceUrl);
            link.href = r.sourceUrl;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            const line = el("p");
            line.append(link);
            evidence.append(line);
          }
        }
        card.append(evidence);
        cards.append(card);
      }
      knowledge.append(cards);
    }
    $("#metrics").replaceChildren();
    for (const [number, label] of [
      [
        `${s.succeeded} / ${state.manifest.references.length}`,
        state.knowledge
          ? "분석 완료 / 수집한 후보 영상"
          : "분석 완료 / 등록 영상",
      ],
      ...(s.providerReportedUsd
        ? [
            [
              "$" + s.providerReportedUsd.toFixed(4),
              "fal 공급사 보고액 · 청구서 미대조",
            ],
          ]
        : []),
      [s.segments, "장면별 관찰"],
      [s.unreviewed, "원본 대조 대기"],
      [
        s.knownUsageCount ? "$" + s.estimatedUsd.toFixed(4) : "미확인",
        state.knowledge
          ? "직접 API 유료 단가 환산 · 청구액 미확인"
          : "사용량 기준 추정 · 청구액 미확인",
      ],
    ]) {
      const m = el("div", undefined, "metric");
      m.append(el("strong", String(number)), el("span", label));
      $("#metrics").append(m);
    }
    $("#engine").textContent =
      (state.knowledge?.models?.join(" / ") || state.model) +
      " · 첫 30초 관찰 요청 · 입력 설정은 기록별 확인";
    $("#run").disabled = state.active || !state.canAnalyze;
    $("#retry").disabled =
      state.active ||
      !state.canAnalyze ||
      !state.runs.some(
        (r) =>
          r.status === "rejected" &&
          r.httpStatus === 503 &&
          (r.attemptNumber || 1) < 2,
      );
    $("#cancel").disabled = !state.active;
    $("#running").textContent = state.active
      ? "분석을 진행하고 있습니다."
      : state.canAnalyze
        ? "완료된 기록은 재사용합니다."
        : "결과 열람·검토 모드 · 분석 키 미설정";
    const existing = $("#category").value;
    $("#category").replaceChildren(
      new Option("전체 분야", ""),
      ...[...new Set(state.manifest.references.map((r) => r.category))].map(
        (c) => new Option(c, c),
      ),
    );
    $("#category").value = existing;
    renderList();
    if (!selected && entries().length) {
      const { ref, run } = entries()[0];
      selected = ref.url;
      renderList();
      renderDetail(ref, run);
    } else if (selected && !dirty) {
      const item = entries().find(({ ref }) => ref.url === selected);
      if (
        item &&
        detailRevision !==
          JSON.stringify([
            item.run?.id,
            item.run?.status,
            item.run?.reviewVersion,
          ])
      ) {
        renderDetail(item.ref, item.run);
      }
    }
  } catch (e) {
    msg(e.message);
  }
}
for (const id of ["query", "category", "status", "popularity"])
  $("#" + id).addEventListener("input", () => {
    visibleLimit = 60;
    renderList();
  });
$("#run").onclick = async () => {
  if (
    !confirm(
      "등록된 미분석 영상을 각각 앞 30초씩 분석합니다. API 비용이 발생할 수 있습니다. 실행할까요?",
    )
  )
    return;
  try {
    await api("/api/batch", {});
    await refresh();
    msg("분석을 시작했습니다.");
  } catch (e) {
    msg(e.message);
  }
};
$("#retry").onclick = async () => {
  if (
    !confirm(
      "HTTP 503으로 거절된 요청만 한 번 다시 분석합니다. 기존 이력을 보존하며 추가 API 비용이 발생할 수 있습니다. 실행할까요?",
    )
  )
    return;
  try {
    await api("/api/retry503", {});
    await refresh();
    msg("503 요청을 한 번씩 다시 확인합니다.");
  } catch (e) {
    msg(e.message);
  }
};
$("#cancel").onclick = async () => {
  try {
    const r = await api("/api/cancel", {});
    msg(r.message);
  } catch (e) {
    msg(e.message);
  }
};
$("#register").onclick = async () => {
  try {
    const references = $("#urls")
      .value.split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((url) => ({ url }));
    await api("/api/references", { references });
    $("#urls").value = "";
    await refresh();
    msg("영상을 등록했습니다.");
  } catch (e) {
    msg(e.message);
  }
};
$("#export").onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: "application/json",
  });
  const u = URL.createObjectURL(blob);
  const a = el("a");
  a.href = u;
  a.download = "clip-lab-results.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 5000);
};
await refresh();
setInterval(() => refresh(), 5000);
