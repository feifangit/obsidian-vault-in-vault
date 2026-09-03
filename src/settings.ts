import { PluginSettingTab, Setting } from "obsidian";

import type VaultInVaultPlugin from "./main";
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
      text: "These settings belong to this vault. Extension settings are visible, but editing is locked until the vault password is verified."
    });

    const unlocked = this.plugin.isConfigurationUnlocked();
    new Setting(containerEl)
      .setName("Protected file types")
      .setDesc(
        "Matching plaintext files can be encrypted when their last tab closes or when you lock the vault. The configuration folder and files already ending in .age are always excluded."
      )
      .addText((text) => {
        text.setValue(formatExtensionList(this.plugin.settings.extensions));
        text.setDisabled(!unlocked);
        text.inputEl.setAttribute("aria-label", "Protected file extensions");
        text.onChange((value) => {
          if (!this.plugin.isConfigurationUnlocked()) return;
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
          button.setButtonText("Unlock and edit").onClick(async () => {
            if (await this.plugin.unlockConfiguration()) this.display();
          });
        }
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
      text: "This UI lock prevents accidental changes. The extension list itself is not secret and is stored in the plugin data.json; passwords are never stored there."
    });
  }
}
