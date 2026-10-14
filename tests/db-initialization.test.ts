import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("DB import does not write files; first transaction initializes the DB", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "onemarketing-lazy-db-"));
  const directory = path.join(root, "uninitialized");
  process.env.DATA_DIR = directory;
  const { db, create, get, once } = await import("../src/lib/db");
  try {
    assert.equal(existsSync(directory), false);
    const record = once("first-command", () =>
      create("customers", { name: "Lazy DB" }),
    );
    assert.equal(existsSync(path.join(directory, "marketing.sqlite")), true);
    assert.equal(get(record.id)?.name, "Lazy DB");
    assert.equal(
      once<typeof record>("first-command", () => {
        throw new Error("duplicate");
      }).id,
      record.id,
    );
    assert.throws(
      () =>
        db.transaction(() => {
          create("customers", { name: "rolled back" });
          throw new Error("rollback");
        })(),
      /rollback/,
    );
    assert.equal(
      (
        db.prepare("SELECT count(*) AS count FROM records").get() as {
          count: number;
        }
      ).count,
      1,
    );
  } finally {
    if (existsSync(directory)) db.close();
    rmSync(root, { recursive: true, force: true });
  }
});
