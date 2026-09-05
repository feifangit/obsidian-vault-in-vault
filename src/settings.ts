import { PluginSettingTab, Setting } from "obsidian";

import type VaultInVaultPlugin from "./main";
import { AGE_CONFIG_PATH, normalizeExcludeList } from "./age-config";
import { formatExtensionList, normalizeExtensionList } from "./file-types";

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

    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: `${AGE_CONFIG_PATH} and data.json never contain a password. The UI lock prevents accidental changes; it is not a security boundary.`
    });
  }
}
