import { describe, expect, it } from "vitest";

import { shouldAutoOpenEncryptedFile } from "../src/auto-open";

describe("shouldAutoOpenEncryptedFile", () => {
  it("only skips confirmation when the setting is enabled and a password is cached", () => {
    expect(shouldAutoOpenEncryptedFile(false, false)).toBe(false);
    expect(shouldAutoOpenEncryptedFile(false, true)).toBe(false);
    expect(shouldAutoOpenEncryptedFile(true, false)).toBe(false);
    expect(shouldAutoOpenEncryptedFile(true, true)).toBe(true);
  });
});
