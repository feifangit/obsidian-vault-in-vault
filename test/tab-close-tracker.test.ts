import { describe, expect, it } from "vitest";

import {
  findClosedFilePaths,
  findLastProtectedClosedPath
} from "../src/tab-close-tracker";

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

describe("findLastProtectedClosedPath", () => {
  const isProtected = (path: string): boolean => path.endsWith(".md");

  it("waits while another protected plaintext file remains open", () => {
    const first = {};
    const second = {};
    expect(
      findLastProtectedClosedPath(
        new Map([[first, "one.md"], [second, "two.md"]]),
        new Map([[second, "two.md"]]),
        isProtected
      )
    ).toBeNull();
  });

  it("returns the final protected plaintext path", () => {
    const protectedLeaf = {};
    const unprotectedLeaf = {};
    expect(
      findLastProtectedClosedPath(
        new Map([
          [protectedLeaf, "秘密.md"],
          [unprotectedLeaf, "manual.pdf"]
        ]),
        new Map([[unprotectedLeaf, "manual.pdf"]]),
        isProtected
      )
    ).toBe("秘密.md");
  });

  it("ignores closure of an unprotected file", () => {
    const leaf = {};
    expect(
      findLastProtectedClosedPath(
        new Map([[leaf, "manual.pdf"]]),
        new Map(),
        isProtected
      )
    ).toBeNull();
  });

  it("does not treat navigation as closure", () => {
    const leaf = {};
    expect(
      findLastProtectedClosedPath(
        new Map([[leaf, "one.md"]]),
        new Map([[leaf, "two.md"]]),
        isProtected
      )
    ).toBeNull();
  });
});
