import { App, Modal } from "obsidian";

export type ClosedFileProtectionDecision = "current" | "all" | "leave";

export interface ClosedFileProtectionSummary {
  filePath: string;
  allFilePaths: readonly string[];
  ageConfigExcludedPaths: readonly string[];
}

export class ClosedFileProtectionModal extends Modal {
  private settled = false;

  private constructor(
    app: App,
    private readonly summary: ClosedFileProtectionSummary,
    private readonly resolveDecision: (decision: ClosedFileProtectionDecision) => void
  ) {
    super(app);
  }

  static ask(
    app: App,
    summary: ClosedFileProtectionSummary
  ): Promise<ClosedFileProtectionDecision> {
    return new Promise((resolve) => new ClosedFileProtectionModal(app, summary, resolve).open());
  }

  override onOpen(): void {
    const { contentEl, summary } = this;
    const allFileCount = summary.allFilePaths.length;
    this.titleEl.setText("Encrypt closed file?");
    contentEl.createEl("p", {
      text: `${summary.filePath} was closed and is still plaintext.`
    });
    contentEl.createEl("p", {
      cls: "vault-in-vault-extension-summary",
      text: `${allFileCount} matching plaintext ${allFileCount === 1 ? "file is" : "files are"} currently in this vault.`
    });
    renderCollapsedPathList(
      contentEl,
      `Show ${allFileCount} ${allFileCount === 1 ? "file" : "files"} to encrypt`,
      summary.allFilePaths
    );
    if (summary.ageConfigExcludedPaths.length > 0) {
      renderCollapsedPathList(
        contentEl,
        `Show ${summary.ageConfigExcludedPaths.length} ${summary.ageConfigExcludedPaths.length === 1 ? "path" : "paths"} skipped by .ageconfig`,
        summary.ageConfigExcludedPaths
      );
    }
    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "Encrypt all also locks the vault and forgets the password cached for this session."
    });

    const buttons = contentEl.createDiv({ cls: "vault-in-vault-modal-buttons" });
    buttons.createEl("button", { text: "Leave plaintext" })
      .addEventListener("click", () => this.finish("leave"));
    buttons.createEl("button", {
      text: `Encrypt all (${allFileCount})`
    }).addEventListener("click", () => this.finish("all"));
    const current = buttons.createEl("button", {
      text: "Encrypt this file",
      cls: "mod-cta"
    });
    current.addEventListener("click", () => this.finish("current"));
    window.setTimeout(() => current.focus(), 0);
  }

  override onClose(): void {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolveDecision("leave");
    }
  }

  private finish(decision: ClosedFileProtectionDecision): void {
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
  const details = container.createEl("details", {
    cls: "vault-in-vault-file-list"
  });
  details.createEl("summary", { text: label });
  const list = details.createEl("ul");
  for (const path of paths) list.createEl("li", { text: path });
}
