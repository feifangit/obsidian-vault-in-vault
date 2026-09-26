import { describe, expect, it } from "vitest";

import { selectFolderAgePaths } from "../src/folder-decrypt";

describe("selectFolderAgePaths", () => {
  const paths = [
    "Private/note.md.age",
    "Private/照片.PNG.age",
    "Private/audio.wav.age",
    "Private/Public/shared.md.age",
    "Private/plain.md",
    "Private2/other.md.age",
    ".obsidian/plugins/example/readme.md.age"
  ];

  it("recursively selects protected age files within one folder", () => {
    expect(
      selectFolderAgePaths(paths, "Private", ["md", "png"], ".obsidian", [
        "Private/Public"
      ])
    ).toEqual({
      eligiblePaths: ["Private/note.md.age", "Private/照片.PNG.age"],
      skippedPaths: ["Private/audio.wav.age", "Private/Public/shared.md.age"]
    });
  });

  it("does not confuse folders that share a path prefix", () => {
    expect(
      selectFolderAgePaths(paths, "Private2", ["md"], ".obsidian")
    ).toEqual({
      eligiblePaths: ["Private2/other.md.age"],
      skippedPaths: []
    });
  });

  it("supports selecting the vault root while excluding vault metadata", () => {
    const selection = selectFolderAgePaths(paths, "/", ["md", "png"], ".obsidian", [
      "Private/Public"
    ]);
    expect(selection.eligiblePaths).toEqual([
      "Private/note.md.age",
      "Private/照片.PNG.age",
      "Private2/other.md.age"
    ]);
    expect(selection.skippedPaths).toEqual([
      ".obsidian/plugins/example/readme.md.age",
      "Private/audio.wav.age",
      "Private/Public/shared.md.age"
    ]);
  });
});
