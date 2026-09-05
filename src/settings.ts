import { PluginSettingTab, setIcon, Setting } from "obsidian";

import type VaultInVaultPlugin from "./main";
import { AGE_CONFIG_PATH, normalizeExcludeList } from "./age-config";
import { formatExtensionList, normalizeExtensionList } from "./file-types";
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
    containerEl.createEl("h2", { text: "Vault in Vault" });
    containerEl.createEl("p", {
      text: `These settings belong to this vault. If ${AGE_CONFIG_PATH} exists in the vault root, it supplies the protected file types and excluded paths for both Vault in Vault and the Go CLI.`
    });

    const unlocked = this.plugin.isConfigurationUnlocked();
    const sharedPolicy = this.plugin.isSharedAgeConfigActive();

    new Setting(containerEl)
      .setName("Protection policy source")
      .setDesc(this.plugin.getProtectionPolicySource())
      .addButton((button) => {
        button.setButtonText(`Reload ${AGE_CONFIG_PATH}`).onClick(async () => {
          await this.plugin.reloadAgeConfig();
          this.display();
        });
      });

    new Setting(containerEl)
      .setName(`Edit ${AGE_CONFIG_PATH}`)
      .setDesc(
        this.plugin.canOpenAgeConfigExternally()
          ? "Open the shared policy with the operating system's default editor, or reveal it in the file manager."
          : `Create ${AGE_CONFIG_PATH} in the vault root, then reload the policy to enable these actions.`
      )
      .addButton((button) => {
        button
          .setButtonText("Open in default editor")
          .setDisabled(!this.plugin.canOpenAgeConfigExternally())
          .onClick(() => void this.plugin.openAgeConfigExternally());
      })
      .addButton((button) => {
        button
          .setButtonText("Show in file manager")
          .setDisabled(!this.plugin.canOpenAgeConfigExternally())
          .onClick(() => this.plugin.revealAgeConfigInFileManager());
      });

    new Setting(containerEl)
      .setName("Protected file types")
      .setDesc(
        sharedPolicy
          ? `Managed by ${AGE_CONFIG_PATH}. Edit that file outside this settings page, then reload the policy.`
          : "Matching plaintext files can be encrypted when their last tab closes or when you lock the vault."
      )
      .addText((text) => {
        text.setValue(formatExtensionList(this.plugin.getProtectedExtensions()));
        text.setDisabled(sharedPolicy || !unlocked);
        text.inputEl.setAttribute("aria-label", "Protected file extensions");
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
          button.setButtonText("Lock settings").onClick(() => {
            this.plugin.lockConfiguration();
            this.display();
          });
        } else {
          button.setButtonText(sharedPolicy ? "Unlock other settings" : "Unlock and edit").onClick(async () => {
            if (await this.plugin.unlockConfiguration()) this.display();
          });
        }
      });

    new Setting(containerEl)
      .setName("Excluded files and folders")
      .setDesc(
        sharedPolicy
          ? `Managed by ${AGE_CONFIG_PATH}. Paths are relative to the vault root.`
          : "One vault-relative file or folder path per line. A folder excludes everything inside it. Wildcards are not supported."
      )
      .addTextArea((text) => {
        text.setValue(this.plugin.getExcludedPaths().join("\n"));
        text.setDisabled(sharedPolicy || !unlocked);
        text.inputEl.rows = 4;
        text.inputEl.setAttribute("aria-label", "Excluded vault paths");
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
      .setName("Automatically decrypt embedded images")
      .setDesc(
        "When a decrypted or opened Markdown file references an encrypted image, decrypt the image in place if the vault password is cached."
      )
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.autoDecryptEmbeddedImages);
        toggle.setDisabled(!unlocked);
        toggle.onChange((value) => {
          if (!this.plugin.isConfigurationUnlocked()) return;
          this.plugin.settings.autoDecryptEmbeddedImages = value;
          void this.plugin.saveSettings();
        });
      });

    containerEl.createEl("h3", { text: "Session security" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "These two timers are mutually exclusive. Passwords remain in memory only and are never restored after Obsidian restarts."
    });

    securityTimerSetting(containerEl, "Password auto-clear", "password-clear")
      .setDesc(
        "Clear the cached password after a fixed maximum time. User activity does not extend this timer, and plaintext files remain open. Enabling this disables automatic idle lock."
      )
      .addDropdown((dropdown) => {
        addTimeoutOptions(dropdown);
        dropdown.setValue(String(this.plugin.settings.passwordCacheTimeoutMinutes));
        dropdown.onChange(async (value) => {
          await this.plugin.setPasswordCacheTimeout(Number(value) as SecurityTimeoutMinutes);
          this.display();
        });
      });

    securityTimerSetting(containerEl, "Auto-lock after Vault inactivity", "idle-lock")
      .setDesc(
        "After no keyboard, pointer, touch, scroll, editor, or tab activity in this Vault, save editors, encrypt matching plaintext files, close their tabs, and clear the password. Enabling this disables password auto-clear."
      )
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
      text: `${AGE_CONFIG_PATH} and data.json never contain a password. The UI lock prevents accidental changes; it is not a security boundary.`
    });
  }
}

function securityTimerSetting(
  containerEl: HTMLElement,
  label: string,
  mode: SecurityTimerMode
): Setting {
  const setting = new Setting(containerEl).setName(label);
  const document = containerEl.ownerDocument;
  const icon = document.createElement("span");
  icon.className = "vault-in-vault-setting-mode-icon";
  icon.setAttribute("aria-hidden", "true");

  const icons = getSecurityModeIcon(mode);
  const base = document.createElement("span");
  base.className = "vault-in-vault-setting-base-icon";
  setIcon(base, icons.baseIcon);
  icon.append(base);

  if (icons.badgeIcon !== null) {
    const badge = document.createElement("span");
    badge.className = "vault-in-vault-setting-mode-badge";
    setIcon(badge, icons.badgeIcon);
    icon.append(badge);
  }

  setting.nameEl.prepend(icon);
  setting.nameEl.addClass("vault-in-vault-setting-name");
  setting.nameEl.setAttribute("aria-label", `${label}: ${icons.accessibleName}`);
  return setting;
}

function addTimeoutOptions(dropdown: {
  addOption(value: string, display: string): unknown;
}): void {
  for (const minutes of SECURITY_TIMEOUT_OPTIONS) {
    dropdown.addOption(
      String(minutes),
      minutes === 0
        ? "Off"
        : minutes < 60
          ? `${minutes} minutes`
          : `${minutes / 60} ${minutes === 60 ? "hour" : "hours"}`
    );
  }
}
