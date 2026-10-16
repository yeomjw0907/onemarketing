import ExcelJS from "exceljs";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RecordData } from "./types";
const asset = (p: string) => path.join(process.cwd(), "assets", p);
const label = (channel: unknown) =>
  channel === "blog" ? "네이버 블로그" : "네이버 클립";
const won = (n: unknown) => Number(n).toLocaleString("ko-KR") + "원";
export async function quoteWorkbook(d: RecordData) {
  const w = new ExcelJS.Workbook();
  await w.xlsx.readFile(asset("templates/quote.xlsx"));
  const s = w.worksheets[0];
  s.getCell("C3").value = String(d.customerName);
  s.getCell("C4").value = String(d.name);
  s.getCell("C5").value = new Date(d.createdAt).toISOString().slice(0, 10);
  for (let r = 15; r <= 18; r++)
    for (let c = 1; c <= 6; c++) s.getCell(r, c).value = null;
  const prices = d.prices as {
    channel: string;
    quantity: number;
    unit: number;
    supply: number;
  }[];
  prices.forEach((p, i) => {
    const r = 15 + i;
    s.getCell(r, 1).value = i + 1;
    s.getCell(r, 2).value = label(p.channel);
    s.getCell(r, 3).value = p.supply;
    s.getCell(r, 4).value = Math.round(p.supply * 0.1);
    s.getCell(r, 5).value = p.supply + Math.round(p.supply * 0.1);
    s.getCell(r, 6).value = `${p.quantity}건 × ${won(p.unit)}`;
  });
  if (Number(d.discount) > 0) {
    s.getCell("B18").value = "할인";
    s.getCell("C18").value = -Number(d.discount);
    s.getCell("D18").value =
      Number(d.vat) -
      prices.reduce((n, p) => n + Math.round(p.supply * 0.1), 0);
    s.getCell("E18").value =
      Number(s.getCell("C18").value) + Number(s.getCell("D18").value);
  }
  for (const [col, value] of [
    ["C", d.supply],
    ["D", d.vat],
    ["E", d.total],
  ] as const)
    s.getCell(col + "19").value = {
      formula: `SUM(${col}15:${col}18)`,
      result: Number(value),
    };
  for (let r = 23; r <= 41; r++)
    for (let c = 1; c <= 4; c++) {
      const cell = s.getCell(r, c);
      if (!cell.isMerged || cell.address === cell.master.address)
        cell.value = null;
    }
  prices.forEach((p, i) => {
    const r = 23 + i;
    s.getCell(r, 1).value = "콘텐츠 제작·게시";
    s.getCell(r, 2).value = label(p.channel) + ` ${p.quantity}건`;
    s.getCell(r, 3).value = p.supply;
    s.getCell(r, 4).value =
      p.channel === "blog"
        ? "원고·이미지 제작 및 참여자 계정 게시"
        : "클립 제작 및 참여자 계정 게시";
  });
  s.getCell("B44").value =
    `공급가액 ${won(d.supply)} / VAT ${won(d.vat)} / 총 ${won(d.total)}`;
  s.getCell("B45").value = "결제 일정 별도 협의";
  s.getCell("B46").value =
    `준비 ${d.preparationStart}부터 / 게시 ${d.start} ~ ${d.end}`;
  s.getCell("B47").value =
    "확정된 가이드 기준으로 제작·내부 검수 후 게시. 범위 변경은 별도 협의";
  s.getCell("A48").value = "제공 범위";
  s.getCell("B48").value =
    "계약 채널별 콘텐츠 제작, 참여자 모집·배정, 게시 확인 및 링크 보고";
  s.getCell("B49").value = "게시물은 검수 승인일부터 90일 유지 관리";
  s.getCell("B50").value = "추가 플랫폼·수량·촬영 등은 별도 협의";
  s.getCell("B51").value =
    "계약에 명시되지 않은 광고 집행비·배송·방문 체험은 별도";
  s.getCell("B52").value =
    "고객이 제품·브랜드 정보, 사용 가능한 이미지, 필수·금지 표현 제공";
  s.getCell("A55").value =
    "• 주차별 게시 계획은 별도 프로젝트 설명서 참조. 자료·모집 지연 시 일정 협의";
  s.getCell("A56").value =
    "• 본 견적은 게시 수량 기준이며 조회수·검색 순위·매출을 보장하지 않습니다.";
  w.calcProperties.fullCalcOnLoad = true;
  return w;
}
async function document() {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(
    await readFile(asset("fonts/NanumGothic-Regular.ttf")),
    { subset: true },
  );
  return { doc, font };
}
function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const c of paragraph) {
      if (font.widthOfTextAtSize(line + c, size) > width && line) {
        lines.push(line);
        line = c;
      } else line += c;
    }
    lines.push(line);
  }
  return lines;
}
export async function quotePDF(d: RecordData) {
  const w = await quoteWorkbook(d),
    s = w.worksheets[0],
    { doc, font } = await document();
  const page = doc.addPage([595.28, 841.89]);
  const widths = Array.from(
      { length: 6 },
      (_, i) => (s.getColumn(i + 1).width || 10) * 7 + 5,
    ),
    heights = Array.from(
      { length: 56 },
      (_, i) => s.getRow(i + 1).height || 15,
    );
  const scale = Math.min(
    535 / widths.reduce((a, b) => a + b, 0),
    780 / heights.reduce((a, b) => a + b, 0),
  );
  const xs = [30],
    ys = [810];
  widths.forEach((v) => xs.push(xs.at(-1)! + v * scale));
  heights.forEach((v) => ys.push(ys.at(-1)! - v * scale));
  for (let r = 1; r <= 56; r++)
    for (let c = 1; c <= 6; c++) {
      const cell = s.getCell(r, c);
      if (cell.isMerged && cell.address !== cell.master.address) continue;
      let endRow = r,
        endCol = c;
      for (const merge of s.model.merges || []) {
        const parts = merge.split(":").map((v) => s.getCell(v));
        if (Number(parts[0].row) === r && Number(parts[0].col) === c) {
          endRow = Number(parts[1]?.row || r);
          endCol = Number(parts[1]?.col || c);
        }
      }
      const x = xs[c - 1],
        top = ys[r - 1],
        width = xs[endCol] - x,
        height = top - ys[endRow];
      const fill = cell.fill as ExcelJS.FillPattern;
      const argb = fill?.type === "pattern" ? fill.fgColor?.argb : undefined;
      if (argb && argb.length === 8) {
        const color = argb.slice(2);
        page.drawRectangle({
          x,
          y: top - height,
          width,
          height,
          color: rgb(
            parseInt(color.slice(0, 2), 16) / 255,
            parseInt(color.slice(2, 4), 16) / 255,
            parseInt(color.slice(4, 6), 16) / 255,
          ),
        });
      }
      if (cell.border && Object.keys(cell.border).length)
        page.drawRectangle({
          x,
          y: top - height,
          width,
          height,
          borderColor: rgb(0.65, 0.68, 0.7),
          borderWidth: 0.35,
        });
      let value = cell.value;
      if (value == null) continue;
      if (typeof value === "object" && "result" in value)
        value = value.result as ExcelJS.CellValue;
      const text =
        typeof value === "number"
          ? value.toLocaleString("ko-KR")
          : typeof value === "object"
            ? cell.text
            : String(value);
      let size = Math.min((cell.font?.size || 10) * scale, 15);
      let lines = wrap(text, font, size, width - 6);
      while (lines.length * (size + 1) > height - 3 && size > 4) {
        size -= 0.3;
        lines = wrap(text, font, size, width - 6);
      }
      const color = cell.font?.color?.argb;
      const ink = color?.endsWith("FFFFFF")
        ? rgb(1, 1, 1)
        : rgb(0.12, 0.15, 0.18);
      lines.forEach((line, i) => {
        const align = cell.alignment?.horizontal;
        const tx =
          align === "center"
            ? x + (width - font.widthOfTextAtSize(line, size)) / 2
            : align === "right"
              ? x + width - font.widthOfTextAtSize(line, size) - 3
              : x + 3;
        page.drawText(line, {
          x: tx,
          y: top - 3 - size - i * (size + 1),
          font,
          size,
          color: ink,
        });
      });
    }
  for (const image of s.getImages()) {
    const source = w.getImage(Number(image.imageId));
    if (!source?.buffer) continue;
    const raw = new Uint8Array(source.buffer as unknown as Uint8Array);
    const embedded =
      source.extension === "png"
        ? await doc.embedPng(raw)
        : await doc.embedJpg(raw);
    const range = image.range;
    const tl = range.tl;
    const col = Math.floor(tl.col),
      row = Math.floor(tl.row);
    const width = 48 * scale,
      height = 48 * scale;
    page.drawImage(embedded, {
      x: xs[col] + (tl.col - col) * widths[col] * scale,
      y: ys[row] - height,
      width,
      height,
    });
  }
  return doc.save();
}
export async function proposalPDF(d: RecordData) {
  const { doc, font } = await document();
  let page: PDFPage;
  let y = 0;
  const newPage = (title: string) => {
    page = doc.addPage([595.28, 841.89]);
    page.drawText("98.7°  |  ONECATION PROJECT BRIEF", {
      x: 40,
      y: 807,
      size: 8,
      font,
      color: rgb(0.35, 0.4, 0.45),
    });
    page.drawText(title, {
      x: 40,
      y: 755,
      size: 23,
      font,
      color: rgb(0.12, 0.17, 0.21),
    });
    page.drawLine({
      start: { x: 40, y: 735 },
      end: { x: 555, y: 735 },
      thickness: 2,
      color: rgb(0.85, 0.3, 0.13),
    });
    page.drawText(`${String(d.customerName)} · ${doc.getPageCount()}`, {
      x: 40,
      y: 27,
      size: 8,
      font,
    });
    y = 705;
  };
  const text = (value: string, size = 11) => {
    for (const line of wrap(value, font, size, 510)) {
      if (y < 65) newPage("프로젝트 설명 · 계속");
      page.drawText(line, {
        x: 42,
        y,
        size,
        font,
        color: rgb(0.15, 0.2, 0.24),
      });
      y -= size + 8;
    }
    y -= 8;
  };
  const table = (rows: string[][]) => {
    for (const row of rows) {
      const lines = row.map((c) => wrap(c, font, 10, 510 / row.length - 16));
      const height = Math.max(...lines.map((l) => l.length)) * 17 + 14;
      if (y - height < 60) newPage("프로젝트 설명 · 계속");
      page.drawRectangle({
        x: 40,
        y: y - height,
        width: 515,
        height,
        color: rgb(0.95, 0.96, 0.97),
        borderColor: rgb(0.85, 0.87, 0.89),
        borderWidth: 0.5,
      });
      lines.forEach((ls, i) =>
        ls.forEach((line, j) =>
          page.drawText(line, {
            x: 48 + i * (515 / row.length),
            y: y - 18 - j * 17,
            font,
            size: 10,
          }),
        ),
      );
      y -= height;
    }
    y -= 20;
  };
  newPage("프로젝트 운영 설명서");
  text(String(d.name), 18);
  table([
    ["고객", String(d.customerName)],
    ["홍보 대상", String(d.targetName)],
    ["게시 기간", `${d.start} ~ ${d.end}`],
    ["게시 수량", `블로그 ${d.blog}건 · 클립 ${d.clip}건`],
    ["공급가액", won(d.supply) + " (VAT 별도)"],
  ]);
  text(
    "고객 제공 정보를 바탕으로 콘텐츠를 제작하고 참여자 계정에 게시합니다. 채널별 계약 수량과 일정에 따라 운영합니다.",
  );
  newPage("제공 범위와 준비 자료");
  table([
    ["업무", "제공 내용"],
    ["콘텐츠", "블로그 원고·이미지 및 클립 제작, 내부 승인"],
    ["참여자", "모집·선정·자료 전달·게시 확인"],
    ["보고", "채널별 게시 수량 및 게시물 링크 제공"],
  ]);
  text("고객 준비 자료", 15);
  text(
    "제품·브랜드 설명, 사용 가능한 이미지, 필수 문구, 금지 표현, 연결 주소를 전달해주세요.",
  );
  text(
    "확정된 수량 외 추가 제작·광고 집행·현장 촬영·제품 배송·방문 체험은 별도 협의합니다.",
  );
  newPage("추진 일정과 주차별 게시 계획");
  table([
    ["단계", "예정 기간"],
    ["자료 수집·참여자 모집", `${d.preparationStart} ~ ${d.start}`],
    ["제작·내부 승인", "준비 기간 중 병행, 게시 전 완료"],
    ["게시 진행", `${d.start} ~ ${d.end}`],
  ]);
  table([
    ["주차·기간", "블로그", "클립"],
    ...(
      d.timeline as { start: string; end: string; blog: number; clip: number }[]
    ).map((w, i) => [
      `${i + 1}주 · ${w.start} ~ ${w.end}`,
      String(w.blog) + "건",
      String(w.clip) + "건",
    ]),
    ["합계", String(d.blog) + "건", String(d.clip) + "건"],
  ]);
  newPage("운영 기준과 결과 보고");
  text("게시와 확인", 15);
  text(
    "콘텐츠는 내부 승인 후 참여자에게 전달합니다. 제출 후 3일 뒤 검수하며, 수정이 필요한 경우 보완 후 다시 확인합니다.",
  );
  text("게시 유지", 15);
  text(
    "각 게시물은 검수 승인일부터 90일 유지 관리합니다. 마지막 게시일 이후에도 확인과 유지 관리가 이어집니다.",
  );
  text("일정 변경", 15);
  text(
    "자료 제공 지연, 참여자 모집 상황, 플랫폼 문제로 일정 조정이 필요하면 변경 내용을 안내하고 기록합니다.",
  );
  text("결과 보고", 15);
  text(
    "실제 게시 링크와 채널별 계획 대비 완료 수량을 제공합니다. 조회수·검색 순위·매출은 보장하지 않습니다.",
  );
  return doc.save();
}
