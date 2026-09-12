import { FileView, Notice, TFile, WorkspaceLeaf } from "obsidian";

import type VaultInVaultPlugin from "./main";
import { classifyAgePath } from "./file-types";
import { t } from "./i18n";

export const AGE_VIEW_TYPE = "vault-in-vault-age-view";

export class EncryptedAgeView extends FileView {
  private opening = false;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: VaultInVaultPlugin
  ) {
    super(leaf);
    this.navigation = true;
    this.addAction("lock-open", t("ageView.action"), () => {
      void this.decryptAndOpen();
    });
  }

  override getViewType(): string {
    return AGE_VIEW_TYPE;
  }

  override getDisplayText(): string {
    return this.file ? classifyAgePath(this.file.path).originalName : t("ageView.fallbackName");
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
        ? t("ageView.imageDescription")
        : t("ageView.fileDescription")
    });
    const button = state.createEl("button", {
      text: type.kind === "image" ? t("ageView.openImage") : t("ageView.open"),
      cls: "mod-cta"
    });
    button.addEventListener("click", () => void this.decryptAndOpen());
  }

  private async decryptAndOpen(): Promise<void> {
    if (this.opening || this.file === null) return;
    this.opening = true;
    this.renderStatus(t("ageView.decrypting"), t("ageView.openingPlaintext"));
    try {
      await this.plugin.decryptAndOpenFile(this.file, this.leaf);
    } catch (error) {
      if (this.plugin.isCancelledError(error)) {
        if (this.file !== null) this.renderLockedState(this.file);
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.renderStatus(t("ageView.failed"), message);
      const retry = this.contentEl.querySelector<HTMLElement>(".vault-in-vault-state")
        ?.createEl("button", { text: t("common.tryAgain"), cls: "mod-cta" });
      retry?.addEventListener("click", () => void this.decryptAndOpen());
      new Notice(t("notice.error", { error: message }));
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
