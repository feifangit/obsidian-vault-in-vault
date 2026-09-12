import { PluginSettingTab, setIcon, Setting } from "obsidian";

import type VaultInVaultPlugin from "./main";
import { normalizeExcludeList } from "./age-config";
import { formatExtensionList, normalizeExtensionList } from "./file-types";
import { t } from "./i18n";
import {
  getSecurityModeIcon,
  SECURITY_TIMEOUT_OPTIONS,
  SecurityTimerMode,
  SecurityTimeoutMinutes
} from "./security-timer";

export class VaultInVaultSettingTab extends PluginSettingTab {
  constructor(private readonly plugin: VaultInVaultPlugin) {
    super(plugin.app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("p", {
      text: t("settings.intro")
    });

    const unlocked = this.plugin.isConfigurationUnlocked();
    const sharedPolicy = this.plugin.isSharedAgeConfigActive();

    new Setting(containerEl)
      .setName(t("settings.policySource"))
      .setDesc(this.plugin.getProtectionPolicySource())
      .addButton((button) => {
        button.setButtonText(t("settings.reloadConfig")).onClick(async () => {
          await this.plugin.reloadAgeConfig();
          this.display();
        });
      });

    new Setting(containerEl)
      .setName(t("settings.editConfig"))
      .setDesc(
        this.plugin.canOpenAgeConfigExternally()
          ? t("settings.editConfigAvailable")
          : t("settings.editConfigUnavailable")
      )
      .addButton((button) => {
        button
          .setButtonText(t("settings.openEditor"))
          .setDisabled(!this.plugin.canOpenAgeConfigExternally())
          .onClick(() => void this.plugin.openAgeConfigExternally());
      })
      .addButton((button) => {
        button
          .setButtonText(t("settings.showFileManager"))
          .setDisabled(!this.plugin.canOpenAgeConfigExternally())
          .onClick(() => this.plugin.revealAgeConfigInFileManager());
      });

    new Setting(containerEl)
      .setName(t("settings.protectedTypes"))
      .setDesc(
        sharedPolicy
          ? t("settings.protectedTypesShared")
          : t("settings.protectedTypesLocal")
      )
      .addText((text) => {
        text.setValue(formatExtensionList(this.plugin.getProtectedExtensions()));
        text.setDisabled(sharedPolicy || !unlocked);
        text.inputEl.setAttribute("aria-label", t("settings.protectedTypesAria"));
        text.onChange((value) => {
          if (sharedPolicy || !this.plugin.isConfigurationUnlocked()) return;
          const extensions = normalizeExtensionList(value);
          if (extensions.length === 0) return;
          this.plugin.settings.extensions = extensions;
          void this.plugin.saveSettings();
        });
      })
      .addButton((button) => {
        if (unlocked) {
          button.setButtonText(t("settings.lock")).onClick(() => {
            this.plugin.lockConfiguration();
            this.display();
          });
        } else {
          button.setButtonText(sharedPolicy ? t("settings.unlockOther") : t("settings.unlockEdit")).onClick(async () => {
            if (await this.plugin.unlockConfiguration()) this.display();
          });
        }
      });

    new Setting(containerEl)
      .setName(t("settings.excludedPaths"))
      .setDesc(
        sharedPolicy
          ? t("settings.excludedPathsShared")
          : t("settings.excludedPathsLocal")
      )
      .addTextArea((text) => {
        text.setValue(this.plugin.getExcludedPaths().join("\n"));
        text.setDisabled(sharedPolicy || !unlocked);
        text.inputEl.rows = 4;
        text.inputEl.setAttribute("aria-label", t("settings.excludedPathsAria"));
        text.onChange((value) => {
          if (sharedPolicy || !this.plugin.isConfigurationUnlocked()) return;
          try {
            this.plugin.settings.excludedPaths = normalizeExcludeList(value);
            void this.plugin.saveSettings();
          } catch {
            // Keep the last valid policy while an incomplete path is being typed.
          }
        });
      });

    new Setting(containerEl)
      .setName(t("settings.autoImages"))
      .setDesc(t("settings.autoImagesDescription"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.autoDecryptEmbeddedImages);
        toggle.setDisabled(!unlocked);
        toggle.onChange((value) => {
          if (!this.plugin.isConfigurationUnlocked()) return;
          this.plugin.settings.autoDecryptEmbeddedImages = value;
          void this.plugin.saveSettings();
        });
      });

    new Setting(containerEl).setName(t("settings.sessionSecurity")).setHeading();
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: t("settings.sessionDescription")
    });

    securityTimerSetting(containerEl, t("settings.passwordClear"), "password-clear")
      .setDesc(t("settings.passwordClearDescription"))
      .addDropdown((dropdown) => {
        addTimeoutOptions(dropdown);
        dropdown.setValue(String(this.plugin.settings.passwordCacheTimeoutMinutes));
        dropdown.onChange(async (value) => {
          await this.plugin.setPasswordCacheTimeout(Number(value) as SecurityTimeoutMinutes);
          this.display();
        });
      });

    securityTimerSetting(containerEl, t("settings.idleLock"), "idle-lock")
      .setDesc(t("settings.idleLockDescription"))
      .addDropdown((dropdown) => {
        addTimeoutOptions(dropdown);
        dropdown.setValue(String(this.plugin.settings.idleAutoLockMinutes));
        dropdown.onChange(async (value) => {
          await this.plugin.setIdleAutoLockTimeout(Number(value) as SecurityTimeoutMinutes);
          this.display();
        });
      });

    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: t("settings.securityNote")
    });
  }
}

function securityTimerSetting(
  containerEl: HTMLElement,
  label: string,
  mode: SecurityTimerMode
): Setting {
  const setting = new Setting(containerEl).setName(label);
  const icon = setting.nameEl.createSpan({ cls: "vault-in-vault-setting-mode-icon" });
  icon.setAttribute("aria-hidden", "true");

  const icons = getSecurityModeIcon(mode);
  const base = icon.createSpan({ cls: "vault-in-vault-setting-base-icon" });
  setIcon(base, icons.baseIcon);

  if (icons.badgeIcon !== null) {
    const badge = icon.createSpan({ cls: "vault-in-vault-setting-mode-badge" });
    setIcon(badge, icons.badgeIcon);
  }

  setting.nameEl.prepend(icon);
  setting.nameEl.addClass("vault-in-vault-setting-name");
  const modeName = mode === "password-clear"
    ? t("security.passwordClear")
    : mode === "idle-lock"
      ? t("security.idleLock")
      : t("security.manual");
  setting.nameEl.setAttribute("aria-label", t("settings.modeAria", { label, mode: modeName }));
  return setting;
}

function addTimeoutOptions(dropdown: {
  addOption(value: string, display: string): unknown;
}): void {
  for (const minutes of SECURITY_TIMEOUT_OPTIONS) {
    dropdown.addOption(
      String(minutes),
      minutes === 0
        ? t("common.off")
        : minutes < 60
          ? t("time.minutes", { count: minutes })
          : t(minutes === 60 ? "time.hour" : "time.hours", { count: minutes / 60 })
    );
  }
}
