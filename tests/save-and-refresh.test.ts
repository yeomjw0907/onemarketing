import { test } from "node:test";
import assert from "node:assert/strict";
import { saveAndRefresh } from "../src/lib/save-and-refresh";

test("a committed write remains committed when refreshing fails and is never replayed", async () => {
  let writes = 0,
    reads = 0;
  const result = await saveAndRefresh(
    async () => {
      writes++;
      return { id: "saved" };
    },
    async () => {
      reads++;
      throw new Error("read offline");
    },
  );
  assert.deepEqual(result, { value: { id: "saved" }, refreshed: false });
  assert.equal(writes, 1);
  assert.equal(reads, 1);
});
test("a failed write propagates its error without refreshing or reporting success", async () => {
  let reads = 0;
  const rejected = new Error("not authorized");
  await assert.rejects(
    saveAndRefresh(
      async () => {
        throw rejected;
      },
      async () => {
        reads++;
      },
    ),
    (error) => error === rejected,
  );
  assert.equal(reads, 0);
});
test("successful save returns its value after the latest data is loaded", async () => {
  const events: string[] = [];
  const result = await saveAndRefresh(
    async () => {
      events.push("save");
      return 42;
    },
    async () => {
      events.push("refresh");
    },
  );
  assert.deepEqual(events, ["save", "refresh"]);
  assert.deepEqual(result, { value: 42, refreshed: true });
});
