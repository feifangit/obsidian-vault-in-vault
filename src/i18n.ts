import { JAPANESE } from "./locales/ja";
import { KOREAN } from "./locales/ko";
import { SIMPLIFIED_CHINESE } from "./locales/zh-CN";
import { TRADITIONAL_CHINESE } from "./locales/zh-TW";

export type PluginLocale = "en" | "zh" | "zh-TW" | "ja" | "ko";

const ENGLISH = {
  "common.cancel": "Cancel",
  "common.decrypt": "Decrypt",
  "common.encrypt": "Encrypt",
  "common.unlock": "Unlock",
  "common.tryAgain": "Try again",
  "common.off": "Off",
  "time.minutes": "{count} minutes",
  "time.hour": "{count} hour",
  "time.hours": "{count} hours",

  "ageView.action": "Decrypt in place and open",
  "ageView.fallbackName": "Encrypted age file",
  "ageView.imageDescription": "This image is encrypted. Decrypt it in place to use Obsidian's native image preview and Markdown embeds.",
  "ageView.fileDescription": "Decrypt this file in place and open it with Obsidian's default view.",
  "ageView.openImage": "Decrypt and open image",
  "ageView.open": "Decrypt and open",
  "ageView.decrypting": "Decrypting…",
  "ageView.openingPlaintext": "The plaintext will be opened with Obsidian's default view.",
  "ageView.failed": "Could not decrypt this file",

  "password.title": "Unlock age file",
  "password.description": "Enter the password for {path}. The password is never saved to disk.",
  "password.label": "Password",
  "password.ariaFile": "age file password",
  "password.ariaVault": "Vault encryption password",
  "password.confirm": "Confirm password",
  "password.ariaConfirm": "Confirm Vault encryption password",
  "password.rememberAuto": "Remember until automatic lock",
  "password.rememberSession": "Remember for this Obsidian session",
  "password.rememberAutoDescription": "Required by automatic idle lock. Stored only in plugin memory and cleared after locking.",
  "password.rememberSessionDescription": "Stored only in plugin memory until you lock the views or unload the plugin.",
  "password.rememberDiskDescription": "Stored only in plugin memory; never written to disk.",
  "password.empty": "Password cannot be empty.",
  "password.mismatch": "Passwords do not match.",

  "protect.title": "Encrypt and lock vault?",
  "protect.summaryOne": "{count} matching plaintext file ({size}) will be encrypted.",
  "protect.summaryMany": "{count} matching plaintext files ({size}) will be encrypted.",
  "protect.showFileOne": "Show {count} file to encrypt",
  "protect.showFileMany": "Show {count} files to encrypt",
  "protect.showPathOne": "Show {count} path skipped by .ageconfig",
  "protect.showPathMany": "Show {count} paths skipped by .ageconfig",
  "protect.forgetPassword": "Locking the vault forgets the password cached for this session.",
  "protect.encryptAndLock": "Encrypt and lock",

  "closed.title": "Encrypt closed file?",
  "closed.plaintext": "{path} was closed and is still plaintext.",
  "closed.countOne": "{count} matching plaintext file is currently in this vault.",
  "closed.countMany": "{count} matching plaintext files are currently in this vault.",
  "closed.forgetPassword": "Encrypt all also locks the vault and forgets the password cached for this session.",
  "closed.leavePlaintext": "Leave plaintext",
  "closed.encryptAll": "Encrypt all ({count})",
  "closed.encryptThis": "Encrypt this file",

  "settings.intro": "These settings belong to this vault. If .ageconfig exists in the vault root, it defines the protected file types and excluded paths.",
  "settings.policySource": "Protection policy source",
  "settings.policyInvalid": ".ageconfig is invalid: {error}",
  "settings.policyLocal": "Plugin settings (data.json)",
  "settings.policyShared": ".ageconfig in the vault root",
  "settings.reloadConfig": "Reload .ageconfig",
  "settings.editConfig": "Edit .ageconfig",
  "settings.editConfigAvailable": "Open the shared policy with the operating system's default editor, or reveal it in the file manager.",
  "settings.editConfigUnavailable": "Create .ageconfig in the vault root, then reload the policy to enable these actions.",
  "settings.openEditor": "Open in default editor",
  "settings.showFileManager": "Show in file manager",
  "settings.protectedTypes": "Protected file types",
  "settings.protectedTypesShared": "Managed by .ageconfig. Edit that file outside this settings page, then reload the policy.",
  "settings.protectedTypesLocal": "Matching plaintext files can be encrypted when their last tab closes or when you lock the vault.",
  "settings.protectedTypesAria": "Protected file extensions",
  "settings.lock": "Lock settings",
  "settings.unlockOther": "Unlock other settings",
  "settings.unlockEdit": "Unlock and edit",
  "settings.excludedPaths": "Excluded files and folders",
  "settings.excludedPathsShared": "Managed by .ageconfig. Paths are relative to the vault root.",
  "settings.excludedPathsLocal": "One vault-relative file or folder path per line. A folder excludes everything inside it. Wildcards are not supported.",
  "settings.excludedPathsAria": "Excluded vault paths",
  "settings.autoImages": "Automatically decrypt embedded images",
  "settings.autoImagesDescription": "When a decrypted or opened Markdown file references an encrypted image, decrypt the image in place if the vault password is cached.",
  "settings.sessionSecurity": "Session security",
  "settings.sessionDescription": "These two timers are mutually exclusive. Passwords remain in memory only and are never restored after Obsidian restarts.",
  "settings.passwordClear": "Password auto-clear",
  "settings.passwordClearDescription": "Clear the cached password after a fixed maximum time. User activity does not extend this timer, and plaintext files remain open. Enabling this disables automatic idle lock.",
  "settings.idleLock": "Auto-lock after Vault inactivity",
  "settings.idleLockDescription": "After no keyboard, pointer, touch, scroll, editor, or tab activity in this Vault, save editors, encrypt matching plaintext files, close their tabs, and clear the password. Enabling this disables password auto-clear.",
  "settings.securityNote": ".ageconfig and data.json never contain a password. The UI lock prevents accidental changes; it is not a security boundary.",
  "settings.modeAria": "{label}: {mode}",

  "security.manual": "Manual vault lock",
  "security.passwordClear": "Password auto-clear",
  "security.idleLock": "Automatic idle lock",
  "security.encrypting": "Vault in Vault is encrypting and locking the vault.",
  "security.notCachedUnarmed": "Vault password is not cached; automatic idle lock is not armed.",
  "security.notCached": "Vault password is not cached.",
  "security.clearOne": "Vault password is cached; it will be cleared in about {count} minute.",
  "security.clearMany": "Vault password is cached; it will be cleared in about {count} minutes.",
  "security.lockOne": "Vault password is cached; automatic lock in about {count} minute without activity.",
  "security.lockMany": "Vault password is cached; automatic lock in about {count} minutes without activity.",
  "security.cached": "Vault password is cached for this Obsidian session.",
  "security.clickLock": "{status} Click to encrypt and lock now.",

  "command.encryptLock": "Encrypt and lock vault now",
  "command.decryptImages": "Decrypt encrypted images in current note",
  "command.forgetPassword": "Forget cached vault password",
  "ribbon.encryptLock": "Encrypt and lock vault",

  "notice.invalidConfig": "Vault in Vault: invalid .ageconfig: {error}",
  "notice.passwordCleared": "Cached vault password cleared; configuration locked.",
  "notice.configMissing": ".ageconfig not found; using plugin settings.",
  "notice.configReloaded": "Reloaded protection policy from .ageconfig.",
  "notice.wrongExistingPassword": "That password could not unlock an existing age file. Try again.",
  "notice.alreadyLocking": "Vault in Vault is already automatically locking this vault.",
  "notice.noPlaintext": "No matching plaintext files found; cached password cleared.",
  "notice.encryptProgress": "Encrypting {done}/{total} files…",
  "notice.encryptedLockedOne": "Encrypted and locked {count} file.",
  "notice.encryptedLockedMany": "Encrypted and locked {count} files.",
  "notice.encryptedFile": "Encrypted {path}.",
  "notice.decryptFileFailed": "Could not decrypt {path}: {error}",
  "notice.passwordExpired": "Vault in Vault: cached password expired and was cleared.",
  "notice.autoLockProgress": "Vault in Vault: automatically locking idle vault…",
  "notice.autoLockCount": "Vault in Vault: automatically locking {done}/{total}…",
  "notice.vaultLockedEmpty": "Vault locked; no matching plaintext files were found.",
  "notice.autoLockedOne": "Automatically encrypted and locked {count} file.",
  "notice.autoLockedMany": "Automatically encrypted and locked {count} files.",
  "notice.moreFailures": "; and {count} more",
  "notice.autoLockFailures": "Automatic lock encrypted {completed} files, but {failed} failed. Plaintext was kept. {details}{suffix}",
  "notice.autoLockStopped": "Vault in Vault: automatic lock stopped safely: {error}",
  "notice.error": "Vault in Vault: {error}",

  "operation.unlockConfigTitle": "Unlock configuration",
  "operation.unlockConfigDescription": "Verify the vault password before editing protected file types.",
  "operation.encryptVaultTitle": "Encrypt vault files",
  "operation.encryptVaultOne": "Enter the vault password for {count} matching plaintext file.",
  "operation.encryptVaultMany": "Enter the vault password for {count} matching plaintext files.",
  "operation.encryptClosedTitle": "Encrypt closed file",
  "operation.encryptClosedDescription": "Enter the vault password for {path}.",
  "operation.decryptImagesTitle": "Decrypt embedded images",
  "operation.decryptImagesOne": "Enter the vault password for {count} encrypted image file.",
  "operation.decryptImagesMany": "Enter the vault password for {count} encrypted image files.",
  "operation.noVerificationFile": "{description} No existing age file is available, so enter it twice.",
  "operation.verifyExistingFile": "{description} It will be verified against an existing age file.",
  "embedded.availableOne": "{count} encrypted image is available. ",
  "embedded.availableMany": "{count} encrypted images are available. ",
  "embedded.decrypt": "Decrypt images",

  "error.cancelled": "Password entry was cancelled.",
  "error.configMissing": ".ageconfig does not exist.",
  "error.desktopOnly": "Opening external files requires a desktop filesystem vault.",
  "error.configTooLarge": "the file is larger than 64 KiB",
  "error.invalidConfig": "Invalid .ageconfig: {error}",
  "error.decryptFailed": "Wrong password, damaged data, or an unsupported age file.",
  "error.targetConflict": "{path} already exists with different content.",
  "error.verifyPlaintext": "Could not verify the decrypted copy of {path}.",
  "error.encryptedConflict": "{target} already exists and does not match {source}.",
  "error.verifyCiphertext": "Could not verify newly encrypted data for {path}.",
  "error.sourceChanged": "{path} changed while it was being encrypted; plaintext was kept.",

  "config.invalidJson": "invalid JSON: {error}",
  "config.rootObject": "the root must be a JSON object",
  "config.unknownField": "unknown field {field}",
  "config.extensionsArray": "extensions must be an array of file extensions",
  "config.extensionsEmpty": "extensions must contain at least one file extension",
  "config.extensionsStrings": "extensions must contain only strings",
  "config.excludeArray": "exclude must be an array of relative paths",
  "config.excludeStrings": "exclude must contain only strings",
  "config.invalidExtension": "invalid file extension {value}",
  "config.emptyExclude": "exclude cannot contain an empty path",
  "config.excludeRelative": "exclude path {value} must be relative to the vault",
  "config.excludeGlob": "exclude path {value} cannot contain glob characters",
  "config.invalidExclude": "invalid exclude path {value}"
} as const;

export type MessageKey = keyof typeof ENGLISH;
type MessageVariables = Readonly<Record<string, string | number>>;

const TRANSLATIONS: Record<PluginLocale, Record<MessageKey, string>> = {
  en: ENGLISH,
  zh: SIMPLIFIED_CHINESE,
  "zh-TW": TRADITIONAL_CHINESE,
  ja: JAPANESE,
  ko: KOREAN
};

let currentLocale: PluginLocale = "en";

export function resolveLocale(language: string): PluginLocale {
  const normalized = language.trim().replace(/_/g, "-").toLowerCase();
  if (
    normalized === "zh-tw" ||
    normalized === "zh-hk" ||
    normalized === "zh-mo" ||
    normalized === "zh-hant" ||
    normalized.startsWith("zh-hant-")
  ) {
    return "zh-TW";
  }
  if (normalized === "zh" || normalized.startsWith("zh-")) return "zh";
  if (normalized === "ja" || normalized.startsWith("ja-")) return "ja";
  if (normalized === "ko" || normalized.startsWith("ko-")) return "ko";
  return "en";
}

export function setLanguage(language: string): PluginLocale {
  currentLocale = resolveLocale(language);
  return currentLocale;
}

export function getPluginLocale(): PluginLocale {
  return currentLocale;
}

export function t(key: MessageKey, variables: MessageVariables = {}): string {
  const template = TRANSLATIONS[currentLocale][key] ?? ENGLISH[key];
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (match, name: string) => {
    const value = variables[name];
    return value === undefined ? match : String(value);
  });
}
