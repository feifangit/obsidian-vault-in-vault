export function shouldAutoOpenEncryptedFile(
  settingEnabled: boolean,
  passwordCached: boolean
): boolean {
  return settingEnabled && passwordCached;
}
