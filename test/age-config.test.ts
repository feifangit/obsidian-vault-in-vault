import { describe, expect, it } from "vitest";

import { normalizeExcludeList, parseAgeConfig } from "../src/age-config";

describe(".ageconfig", () => {
  it("normalizes extensions and Unicode relative exclusions", () => {
    expect(
      parseAgeConfig(JSON.stringify({
        extensions: ["MD", ".png", ".MD", "wav"],
        exclude: [" Public/ ", "资料\\共享", "Public"]
      }))
    ).toEqual({
      extensions: ["md", "png", "wav"],
      exclude: ["Public", "资料/共享"]
    });
  });

  it("allows an omitted exclusion list", () => {
    expect(parseAgeConfig('{"extensions":[".md"]}')).toEqual({
      extensions: ["md"],
      exclude: []
    });
  });

  it("uses default extensions when only exclusions are configured", () => {
    const policy = parseAgeConfig('{"exclude":["Public","资料/共享.md"]}');
    expect(policy.extensions).toEqual([
      "avif", "bmp", "gif", "jpeg", "jpg", "md", "png", "svg", "webp"
    ]);
    expect(policy.exclude).toEqual(["Public", "资料/共享.md"]);
  });

  it.each([
    '{"extensions":[]}',
    '{"extensions":["all"]}',
    '{"extensions":[".age"]}',
    '{"extensions":[".tar.gz"]}',
    '{"extensions":[".md"],"unknown":true}',
    '{"extensions":[".md"],"exclude":[""]}',
    '{"extensions":[".md"],"exclude":["../secret"]}',
    '{"extensions":[".md"],"exclude":["/absolute"]}',
    '{"extensions":[".md"],"exclude":["C:\\\\absolute"]}',
    '{"extensions":[".md"],"exclude":["notes/*.md"]}'
  ])("rejects unsafe policy %s", (contents) => {
    expect(() => parseAgeConfig(contents)).toThrow();
  });

  it("accepts an empty settings textarea", () => {
    expect(normalizeExcludeList("\n  \n")).toEqual([]);
  });
});
