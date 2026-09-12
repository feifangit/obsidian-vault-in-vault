import { afterEach, describe, expect, it } from "vitest";

import { getPluginLocale, resolveLocale, setLanguage, t } from "../src/i18n";

afterEach(() => setLanguage("en"));

describe("plugin localization", () => {
  it("uses English for unsupported and missing locale variants", () => {
    expect(resolveLocale("en")).toBe("en");
    expect(resolveLocale("fr")).toBe("en");
    expect(resolveLocale("")).toBe("en");
  });

  it("maps Simplified Chinese locale variants", () => {
    expect(resolveLocale("zh")).toBe("zh");
    expect(resolveLocale("zh-CN")).toBe("zh");
    expect(resolveLocale("zh-SG")).toBe("zh");
  });

  it("maps Traditional Chinese locale variants", () => {
    expect(resolveLocale("zh-TW")).toBe("zh-TW");
    expect(resolveLocale("zh-HK")).toBe("zh-TW");
    expect(resolveLocale("zh-MO")).toBe("zh-TW");
    expect(resolveLocale("zh-Hant")).toBe("zh-TW");
    expect(resolveLocale("zh-Hant-HK")).toBe("zh-TW");
  });

  it("maps Japanese and Korean locale variants", () => {
    expect(resolveLocale("ja")).toBe("ja");
    expect(resolveLocale("ja-JP")).toBe("ja");
    expect(resolveLocale("ko")).toBe("ko");
    expect(resolveLocale("ko-KR")).toBe("ko");
  });

  it("switches messages and interpolates variables", () => {
    setLanguage("zh-CN");
    expect(getPluginLocale()).toBe("zh");
    expect(t("password.title")).toBe("解锁 age 文件");
    expect(t("password.description", { path: "私人/日记.md.age" }))
      .toContain("私人/日记.md.age");

    setLanguage("zh-TW");
    expect(getPluginLocale()).toBe("zh-TW");
    expect(t("password.title")).toBe("解鎖 age 檔案");

    setLanguage("ja-JP");
    expect(getPluginLocale()).toBe("ja");
    expect(t("password.title")).toBe("age ファイルのロックを解除");

    setLanguage("ko-KR");
    expect(getPluginLocale()).toBe("ko");
    expect(t("password.title")).toBe("age 파일 잠금 해제");
  });
});
