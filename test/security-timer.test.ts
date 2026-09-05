import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ActivityTargetRegistry,
  getSecurityModeIcon,
  normalizeSecurityTimerSettings,
  SessionSecurityClock
} from "../src/security-timer";

describe("SessionSecurityClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T12:00:00Z"));
  });

  afterEach(() => vi.useRealTimers());

  it("reports red without a cached password and green when one is cached", () => {
    const clock = new SessionSecurityClock();
    const settings = { passwordCacheTimeoutMinutes: 0 as const, idleAutoLockMinutes: 0 as const };

    expect(clock.snapshot(false, settings).indicator).toBe("locked");
    clock.setPasswordCached();
    expect(clock.snapshot(true, settings).indicator).toBe("ready");
    clock.clearPassword();
    expect(clock.snapshot(false, settings).indicator).toBe("locked");
  });

  it("turns yellow in the final minute and clears at the hard password deadline", () => {
    const clock = new SessionSecurityClock();
    const settings = { passwordCacheTimeoutMinutes: 5 as const, idleAutoLockMinutes: 0 as const };
    clock.setPasswordCached();

    vi.advanceTimersByTime(4 * 60_000);
    expect(clock.snapshot(true, settings)).toMatchObject({
      indicator: "warning",
      action: "none",
      remainingMs: 60_000
    });
    vi.advanceTimersByTime(60_000);
    expect(clock.snapshot(true, settings).action).toBe("clear-password");
  });

  it("does not extend the hard password deadline when activity is recorded", () => {
    const clock = new SessionSecurityClock();
    const settings = { passwordCacheTimeoutMinutes: 5 as const, idleAutoLockMinutes: 0 as const };
    clock.setPasswordCached();

    vi.advanceTimersByTime(4 * 60_000);
    clock.recordActivity();
    vi.advanceTimersByTime(60_000);
    expect(clock.snapshot(true, settings).action).toBe("clear-password");
  });

  it("extends the idle deadline when Vault activity is recorded", () => {
    const clock = new SessionSecurityClock();
    const settings = { passwordCacheTimeoutMinutes: 0 as const, idleAutoLockMinutes: 5 as const };
    clock.setPasswordCached();

    vi.advanceTimersByTime(4 * 60_000);
    clock.recordActivity();
    vi.advanceTimersByTime(2 * 60_000);
    expect(clock.snapshot(true, settings).action).toBe("none");
    vi.advanceTimersByTime(3 * 60_000);
    expect(clock.snapshot(true, settings).action).toBe("auto-lock");
  });

  it("does not infer activity from file timestamps", () => {
    const clock = new SessionSecurityClock();
    const settings = { passwordCacheTimeoutMinutes: 0 as const, idleAutoLockMinutes: 5 as const };
    clock.setPasswordCached();
    const unrelatedFileMtime = Date.now() + 10 * 60_000;

    vi.advanceTimersByTime(5 * 60_000);
    expect(unrelatedFileMtime).toBeGreaterThan(Date.now());
    expect(clock.snapshot(true, settings).action).toBe("auto-lock");
  });
});

describe("normalizeSecurityTimerSettings", () => {
  it("defaults unknown values to off", () => {
    expect(normalizeSecurityTimerSettings("soon", 3)).toEqual({
      passwordCacheTimeoutMinutes: 0,
      idleAutoLockMinutes: 0
    });
  });

  it("keeps the two modes mutually exclusive and gives idle lock priority", () => {
    expect(normalizeSecurityTimerSettings(15, 30)).toEqual({
      passwordCacheTimeoutMinutes: 0,
      idleAutoLockMinutes: 30
    });
  });
});

describe("ActivityTargetRegistry", () => {
  it("registers the main and popout documents once each", () => {
    const registry = new ActivityTargetRegistry<object>();
    const mainDocument = {};
    const popoutDocument = {};

    expect(registry.add(mainDocument)).toBe(true);
    expect(registry.add(popoutDocument)).toBe(true);
    expect(registry.add(mainDocument)).toBe(false);
    expect(registry.add(popoutDocument)).toBe(false);
  });
});

describe("security mode icons", () => {
  it("maps off, password-clear, and idle-lock to distinct icon combinations", () => {
    expect(getSecurityModeIcon("off")).toMatchObject({
      baseIcon: "lock-keyhole",
      badgeIcon: null
    });
    expect(getSecurityModeIcon("password-clear")).toMatchObject({
      baseIcon: "key-round",
      badgeIcon: "clock-3"
    });
    expect(getSecurityModeIcon("idle-lock")).toMatchObject({
      baseIcon: "lock-keyhole",
      badgeIcon: "refresh-cw"
    });
  });

  it("keeps the mode icon stable across red, green, and yellow states", () => {
    const clock = new SessionSecurityClock(0);
    const settings = { passwordCacheTimeoutMinutes: 5 as const, idleAutoLockMinutes: 0 as const };
    const locked = clock.snapshot(false, settings, 0);
    clock.setPasswordCached(0);
    const ready = clock.snapshot(true, settings, 60_000);
    const warning = clock.snapshot(true, settings, 4 * 60_000);

    expect([locked.indicator, ready.indicator, warning.indicator]).toEqual([
      "locked",
      "ready",
      "warning"
    ]);
    expect([locked, ready, warning].map(({ mode }) => getSecurityModeIcon(mode)))
      .toEqual([
        getSecurityModeIcon("password-clear"),
        getSecurityModeIcon("password-clear"),
        getSecurityModeIcon("password-clear")
      ]);
  });

  it("follows the mutually exclusive timer mode", () => {
    const clock = new SessionSecurityClock(0);
    const passwordClear = normalizeSecurityTimerSettings(15, 0);
    const idleLock = normalizeSecurityTimerSettings(15, 30);

    expect(getSecurityModeIcon(clock.snapshot(false, passwordClear, 0).mode).badgeIcon)
      .toBe("clock-3");
    expect(getSecurityModeIcon(clock.snapshot(false, idleLock, 0).mode).badgeIcon)
      .toBe("refresh-cw");
  });
});
