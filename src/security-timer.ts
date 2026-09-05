export const SECURITY_TIMEOUT_OPTIONS = [0, 5, 15, 30, 60, 120, 240] as const;

export type SecurityTimeoutMinutes = (typeof SECURITY_TIMEOUT_OPTIONS)[number];
export type SecurityTimerMode = "off" | "password-clear" | "idle-lock";
export type SecurityIndicatorState = "locked" | "ready" | "warning";
export type SecurityTimerAction = "none" | "clear-password" | "auto-lock";

export interface SecurityTimerSettings {
  passwordCacheTimeoutMinutes: SecurityTimeoutMinutes;
  idleAutoLockMinutes: SecurityTimeoutMinutes;
}

export interface SecurityTimerSnapshot {
  mode: SecurityTimerMode;
  indicator: SecurityIndicatorState;
  action: SecurityTimerAction;
  remainingMs: number | null;
}

export interface SecurityModeIcon {
  baseIcon: "lock-keyhole" | "key-round";
  badgeIcon: "clock-3" | "refresh-cw" | null;
  accessibleName: string;
}

const SECURITY_MODE_ICONS: Record<SecurityTimerMode, SecurityModeIcon> = {
  off: {
    baseIcon: "lock-keyhole",
    badgeIcon: null,
    accessibleName: "Manual vault lock"
  },
  "password-clear": {
    baseIcon: "key-round",
    badgeIcon: "clock-3",
    accessibleName: "Password auto-clear"
  },
  "idle-lock": {
    baseIcon: "lock-keyhole",
    badgeIcon: "refresh-cw",
    accessibleName: "Automatic idle lock"
  }
};

const WARNING_WINDOW_MS = 60_000;

export class ActivityTargetRegistry<T extends object> {
  private readonly targets = new WeakSet<T>();

  add(target: T): boolean {
    if (this.targets.has(target)) return false;
    this.targets.add(target);
    return true;
  }
}

export function normalizeSecurityTimeout(value: unknown): SecurityTimeoutMinutes {
  const number = typeof value === "number" ? value : Number(value);
  return SECURITY_TIMEOUT_OPTIONS.includes(number as SecurityTimeoutMinutes)
    ? number as SecurityTimeoutMinutes
    : 0;
}

export function getSecurityModeIcon(mode: SecurityTimerMode): SecurityModeIcon {
  return SECURITY_MODE_ICONS[mode];
}

export function normalizeSecurityTimerSettings(
  passwordCacheTimeoutMinutes: unknown,
  idleAutoLockMinutes: unknown
): SecurityTimerSettings {
  const idle = normalizeSecurityTimeout(idleAutoLockMinutes);
  // If data.json was edited manually and enables both modes, prefer the more
  // protective idle-lock mode. The settings UI never persists both at once.
  return {
    passwordCacheTimeoutMinutes:
      idle > 0 ? 0 : normalizeSecurityTimeout(passwordCacheTimeoutMinutes),
    idleAutoLockMinutes: idle
  };
}

export class SessionSecurityClock {
  private passwordCachedAt: number | null = null;
  private lastActivityAt: number;

  constructor(now = Date.now()) {
    this.lastActivityAt = now;
  }

  setPasswordCached(now = Date.now()): void {
    this.passwordCachedAt = now;
    this.lastActivityAt = now;
  }

  clearPassword(): void {
    this.passwordCachedAt = null;
  }

  recordActivity(now = Date.now()): void {
    this.lastActivityAt = now;
  }

  snapshot(
    hasPassword: boolean,
    settings: SecurityTimerSettings,
    now = Date.now()
  ): SecurityTimerSnapshot {
    if (!hasPassword || this.passwordCachedAt === null) {
      return { mode: activeMode(settings), indicator: "locked", action: "none", remainingMs: null };
    }

    const mode = activeMode(settings);
    if (mode === "off") {
      return { mode, indicator: "ready", action: "none", remainingMs: null };
    }

    const timeoutMinutes = mode === "idle-lock"
      ? settings.idleAutoLockMinutes
      : settings.passwordCacheTimeoutMinutes;
    const startedAt = mode === "idle-lock" ? this.lastActivityAt : this.passwordCachedAt;
    const remainingMs = startedAt + timeoutMinutes * 60_000 - now;
    const action = remainingMs <= 0
      ? mode === "idle-lock" ? "auto-lock" : "clear-password"
      : "none";

    return {
      mode,
      indicator: remainingMs <= WARNING_WINDOW_MS ? "warning" : "ready",
      action,
      remainingMs: Math.max(0, remainingMs)
    };
  }
}

function activeMode(settings: SecurityTimerSettings): SecurityTimerMode {
  if (settings.idleAutoLockMinutes > 0) return "idle-lock";
  if (settings.passwordCacheTimeoutMinutes > 0) return "password-clear";
  return "off";
}
