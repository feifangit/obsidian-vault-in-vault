import { App, Modal } from "obsidian";
import { t } from "./i18n";

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
    this.titleEl.setText(t("closed.title"));
    contentEl.createEl("p", {
      text: t("closed.plaintext", { path: summary.filePath })
    });
    contentEl.createEl("p", {
      cls: "vault-in-vault-extension-summary",
      text: t(allFileCount === 1 ? "closed.countOne" : "closed.countMany", { count: allFileCount })
    });
    renderCollapsedPathList(
      contentEl,
      t(allFileCount === 1 ? "protect.showFileOne" : "protect.showFileMany", { count: allFileCount }),
      summary.allFilePaths
    );
    if (summary.ageConfigExcludedPaths.length > 0) {
      renderCollapsedPathList(
        contentEl,
        t(summary.ageConfigExcludedPaths.length === 1 ? "protect.showPathOne" : "protect.showPathMany", { count: summary.ageConfigExcludedPaths.length }),
        summary.ageConfigExcludedPaths
      );
    }
    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: t("closed.forgetPassword")
    });

    const buttons = contentEl.createDiv({ cls: "vault-in-vault-modal-buttons" });
    buttons.createEl("button", { text: t("closed.leavePlaintext") })
      .addEventListener("click", () => this.finish("leave"));
    buttons.createEl("button", {
      text: t("closed.encryptAll", { count: allFileCount })
    }).addEventListener("click", () => this.finish("all"));
    const current = buttons.createEl("button", {
      text: t("closed.encryptThis"),
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
