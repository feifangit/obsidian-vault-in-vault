import { describe, expect, it } from "vitest";

import { runAutoLockBatch } from "../src/auto-lock";

describe("runAutoLockBatch", () => {
  it("finishes preparation before protecting or closing any file", async () => {
    const events: string[] = [];

    await runAutoLockBatch({
      prepare: async () => {
        events.push("validate", "save", "validate-again");
        return ["one.md", "two.md"];
      },
      protect: async (file) => {
        events.push(`encrypt:${file}`);
      },
      afterProtected: (file) => events.push(`close:${file}`)
    });

    expect(events).toEqual([
      "validate",
      "save",
      "validate-again",
      "encrypt:one.md",
      "close:one.md",
      "encrypt:two.md",
      "close:two.md"
    ]);
  });

  it("does not protect or close anything when preparation fails", async () => {
    let protectedCount = 0;
    let closedCount = 0;

    await expect(runAutoLockBatch({
      prepare: async () => { throw new Error("save failed"); },
      protect: async () => { protectedCount++; },
      afterProtected: () => { closedCount++; }
    })).rejects.toThrow("save failed");
    expect(protectedCount).toBe(0);
    expect(closedCount).toBe(0);
  });

  it("keeps processing after a file fails and closes only protected files", async () => {
    const closed: string[] = [];
    const result = await runAutoLockBatch({
      prepare: async () => ["ok.md", "failed.md", "also-ok.md"],
      protect: async (file) => {
        if (file === "failed.md") throw new Error("ciphertext conflict");
      },
      afterProtected: (file) => closed.push(file)
    });

    expect(result.completed).toBe(2);
    expect(result.failures.map(({ file }) => file)).toEqual(["failed.md"]);
    expect(closed).toEqual(["ok.md", "also-ok.md"]);
  });
});
