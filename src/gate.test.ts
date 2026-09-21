import { test } from "node:test";
import assert from "node:assert/strict";

// Throwaway: proves CI blocks a merge. Delete with this branch.
test("deliberately failing test", () => {
  assert.equal(1, 2);
});
