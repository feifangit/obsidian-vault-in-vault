import { describe, expect, it } from "vitest";

import { findClosedFilePaths } from "../src/tab-close-tracker";

describe("findClosedFilePaths", () => {
  it("reports a Unicode file when its last leaf closes", () => {
    const leaf = {};
    expect(findClosedFilePaths(new Map([[leaf, "资料/你好 🔐.md"]]), new Map())).toEqual([
      "资料/你好 🔐.md"
    ]);
  });

  it("does not report navigation within the same leaf", () => {
    const leaf = {};
    expect(
      findClosedFilePaths(
        new Map([[leaf, "before.md"]]),
        new Map([[leaf, "after.md"]])
      )
    ).toEqual([]);
  });

  it("waits until the final duplicate leaf closes", () => {
    const left = {};
    const right = {};
    const previous = new Map([
      [left, "same.md"],
      [right, "same.md"]
    ]);

    expect(findClosedFilePaths(previous, new Map([[right, "same.md"]]))).toEqual([]);
    expect(findClosedFilePaths(previous, new Map())).toEqual(["same.md"]);
  });

  it("deduplicates paths when several matching leaves close together", () => {
    const previous = new Map<object, string>([
      [{}, "same.md"],
      [{}, "same.md"]
    ]);
    expect(findClosedFilePaths(previous, new Map())).toEqual(["same.md"]);
  });
});
