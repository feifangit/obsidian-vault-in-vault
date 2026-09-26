import { App, Modal } from "obsidian";

import { t } from "./i18n";

export type FolderDecryptDecision = "decrypt" | "cancel";

export interface FolderDecryptSummary {
  folderPath: string;
  fileCount: number;
  totalBytes: number;
  filePaths: readonly string[];
  skippedPaths: readonly string[];
}

export class DecryptFolderModal extends Modal {
  private settled = false;

  private constructor(
    app: App,
    private readonly summary: FolderDecryptSummary,
    private readonly resolveDecision: (decision: FolderDecryptDecision) => void
  ) {
    super(app);
  }

  static ask(app: App, summary: FolderDecryptSummary): Promise<FolderDecryptDecision> {
    return new Promise((resolve) => new DecryptFolderModal(app, summary, resolve).open());
  }

  override onOpen(): void {
    const { contentEl, summary } = this;
    this.titleEl.setText(t("folderDecrypt.title"));
    contentEl.createEl("p", {
      text: t(
        summary.fileCount === 1
          ? "folderDecrypt.summaryOne"
          : "folderDecrypt.summaryMany",
        {
          count: summary.fileCount,
          size: formatBytes(summary.totalBytes),
          folder: summary.folderPath
        }
      )
    });
    renderCollapsedPathList(
      contentEl,
      t(
        summary.filePaths.length === 1
          ? "folderDecrypt.showFileOne"
          : "folderDecrypt.showFileMany",
        { count: summary.filePaths.length }
      ),
      summary.filePaths
    );
    if (summary.skippedPaths.length > 0) {
      renderCollapsedPathList(
        contentEl,
        t(
          summary.skippedPaths.length === 1
            ? "folderDecrypt.showSkippedOne"
            : "folderDecrypt.showSkippedMany",
          { count: summary.skippedPaths.length }
        ),
        summary.skippedPaths
      );
    }

    const buttons = contentEl.createDiv({ cls: "vault-in-vault-modal-buttons" });
    const cancel = buttons.createEl("button", { text: t("common.cancel") });
    cancel.addEventListener("click", () => this.finish("cancel"));
    const decrypt = buttons.createEl("button", {
      text: t("folderDecrypt.decrypt"),
      cls: "mod-cta"
    });
    decrypt.addEventListener("click", () => this.finish("decrypt"));
    window.setTimeout(() => decrypt.focus(), 0);
  }

  override onClose(): void {
    this.contentEl.empty();
    if (!this.settled) this.resolveDecision("cancel");
  }

  private finish(decision: FolderDecryptDecision): void {
    if (this.settled) return;
    this.settled = true;
    this.resolveDecision(decision);
    this.close();
  }
}

function renderCollapsedPathList(
  container: HTMLElement,
  label: string,
  paths: readonly string[]
): void {
  const details = container.createEl("details", { cls: "vault-in-vault-file-list" });
  details.createEl("summary", { text: label });
  const list = details.createEl("ul");
  for (const path of paths) list.createEl("li", { text: path });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
}
