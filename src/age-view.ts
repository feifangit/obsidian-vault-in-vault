import { FileView, Notice, TFile, WorkspaceLeaf } from "obsidian";

import type VaultInVaultPlugin from "./main";
import { classifyAgePath } from "./file-types";

export const AGE_VIEW_TYPE = "vault-in-vault-age-view";

export class EncryptedAgeView extends FileView {
  private opening = false;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: VaultInVaultPlugin
  ) {
    super(leaf);
    this.navigation = true;
    this.addAction("lock-open", "Decrypt in place and open", () => {
      void this.decryptAndOpen();
    });
  }

  override getViewType(): string {
    return AGE_VIEW_TYPE;
  }

  override getDisplayText(): string {
    return this.file ? classifyAgePath(this.file.path).originalName : "Encrypted age file";
  }

  override getIcon(): string {
    return "lock-keyhole";
  }

  override async onLoadFile(file: TFile): Promise<void> {
    await super.onLoadFile(file);
    this.renderLockedState(file);
  }

  private renderLockedState(file: TFile): void {
    const type = classifyAgePath(file.path);
    this.contentEl.empty();
    this.contentEl.addClass("vault-in-vault-age-view");
    const state = this.contentEl.createDiv({ cls: "vault-in-vault-state" });
    state.createEl("h3", { text: type.originalName });
    state.createEl("p", {
      text: type.kind === "image"
        ? "This image is encrypted. Decrypt it in place to use Obsidian's native image preview and Markdown embeds."
        : "Decrypt this file in place and open it with Obsidian's default view."
    });
    const button = state.createEl("button", {
      text: type.kind === "image" ? "Decrypt and open image" : "Decrypt and open",
      cls: "mod-cta"
    });
    button.addEventListener("click", () => void this.decryptAndOpen());
  }

  private async decryptAndOpen(): Promise<void> {
    if (this.opening || this.file === null) return;
    this.opening = true;
    this.renderStatus("Decrypting…", "The plaintext will be opened with Obsidian's default view.");
    try {
      await this.plugin.decryptAndOpenFile(this.file, this.leaf);
    } catch (error) {
      if (this.plugin.isCancelledError(error)) {
        if (this.file !== null) this.renderLockedState(this.file);
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.renderStatus("Could not decrypt this file", message);
      const retry = this.contentEl.querySelector<HTMLElement>(".vault-in-vault-state")
        ?.createEl("button", { text: "Try again", cls: "mod-cta" });
      retry?.addEventListener("click", () => void this.decryptAndOpen());
      new Notice(`Vault in Vault: ${message}`);
    } finally {
      this.opening = false;
    }
  }

  private renderStatus(title: string, detail: string): void {
    this.contentEl.empty();
    this.contentEl.addClass("vault-in-vault-age-view");
    const state = this.contentEl.createDiv({ cls: "vault-in-vault-state" });
    state.createEl("h3", { text: title });
    state.createEl("p", { text: detail });
  }
}
