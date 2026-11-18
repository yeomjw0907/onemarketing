"""Read a supplied workbook into the GA4 question bank; never edit the workbook."""
import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path

import openpyxl


def extract(source: Path, destination: Path):
    workbook = openpyxl.load_workbook(source, read_only=True, data_only=True)
    sheet = next(sheet for sheet in workbook if sheet.cell(1, 4).value == "질문 (Question)")
    records, guides = [], []
    for row in sheet.iter_rows(min_row=2, values_only=True):
        if not row[0]:
            continue
        record = {
            "id": int(row[0]),
            "question": str(row[3] or "").strip(),
            "options": [str(value or "").strip() for value in row[4:8]],
            "correctAnswer": str(row[8] or "").strip(),
            "status": str(row[9] or "").strip(),
            "note": str(row[10] or "").strip(),
            "url": str(row[11] or "").strip(),
        }
        if "비문항" in record["status"]:
            guides.append(record["id"])
            continue
        if not record["question"] or not record["correctAnswer"] or not record["url"].startswith("https://"):
            raise ValueError(f"Missing required data at source ID {record['id']}")
        records.append(record)
    if len({record["id"] for record in records}) != len(records):
        raise ValueError("Duplicate source IDs")
    summary = {
        "filename": source.name,
        "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "sheet": sheet.title,
        "questionCount": len(records),
        "excludedGuideIds": guides,
        "statusCounts": dict(Counter(record["status"] for record in records)),
        "incompleteOptions": [record["id"] for record in records if not all(record["options"])],
        "urlDerivedTitleCount": sum("URL 제목 추출" in record["question"] for record in records),
    }
    destination.mkdir(parents=True, exist_ok=True)
    for name, data in [("source-questions.json", records), ("import-summary.json", summary)]:
        (destination / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    workbook.close()
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "src/app/ga4/data")
    args = parser.parse_args()
    extract(args.source, args.output)
