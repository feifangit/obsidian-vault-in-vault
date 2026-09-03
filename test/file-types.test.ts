import { describe, expect, it } from "vitest";

import {
  classifyAgePath,
  extractEmbeddedImageLinks,
  isProtectedPlainPath,
  normalizeExtensionList
} from "../src/file-types";

describe("classifyAgePath", () => {
  it("handles nested Unicode Markdown paths", () => {
    expect(classifyAgePath("资料/旅行 🗺️.md.age")).toEqual({
      originalName: "旅行 🗺️.md",
      originalPath: "资料/旅行 🗺️.md",
      extension: "md",
      kind: "markdown"
    });
  });

  it("matches image extensions case-insensitively", () => {
    expect(classifyAgePath("assets/PHOTO.JPEG.age")).toMatchObject({
      extension: "jpeg",
      kind: "image",
      mimeType: "image/jpeg"
    });
  });

  it("marks unknown original extensions as unsupported", () => {
    expect(classifyAgePath("audio.wav.age")).toMatchObject({
      extension: "wav",
      kind: "unsupported"
    });
  });
});

describe("isProtectedPlainPath", () => {
  const extensions = ["md", "jpg", "png"];

  it("tracks Markdown and common images", () => {
    expect(isProtectedPlainPath("新笔记.md", extensions)).toBe(true);
    expect(isProtectedPlainPath("附件/照片.PNG", extensions)).toBe(true);
  });

  it("does not track age files, Obsidian metadata, or unsupported files", () => {
    expect(isProtectedPlainPath("新笔记.md.age", extensions)).toBe(false);
    expect(isProtectedPlainPath(".obsidian/plugins/readme.md", extensions)).toBe(false);
    expect(isProtectedPlainPath("录音.wav", extensions)).toBe(false);
  });

  it("excludes a customized vault configuration directory", () => {
    expect(isProtectedPlainPath(".config/plugins/example/readme.md", ["md"], ".config"))
      .toBe(false);
    expect(isProtectedPlainPath("notes/.config/readme.md", ["md"], ".config"))
      .toBe(true);
  });
});

describe("extension configuration", () => {
  it("normalizes dots, case, duplicates, and spacing", () => {
    expect(normalizeExtensionList(".MD, png  .PNG, .wav")).toEqual(["md", "png", "wav"]);
  });

  it("never accepts age as a protected plaintext extension", () => {
    expect(normalizeExtensionList(".md,.age")).toEqual(["md"]);
  });
});

describe("extractEmbeddedImageLinks", () => {
  it("extracts Unicode wiki embeds and Markdown image links", () => {
    expect(
      extractEmbeddedImageLinks(
        "![[附件/照片 一.png|宽度]]\n![map](assets/map%202.webp)\n![remote](https://x.test/a.png)"
      )
    ).toEqual(["附件/照片 一.png", "assets/map 2.webp"]);
  });
});
