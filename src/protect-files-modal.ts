import { App, Modal } from "obsidian";

export type ProtectionDecision = "encrypt" | "leave";

export interface ProtectionSummary {
  fileCount: number;
  totalBytes: number;
  countsByExtension: ReadonlyMap<string, number>;
}

export class ProtectFilesModal extends Modal {
  private settled = false;

  private constructor(
    app: App,
    private readonly summary: ProtectionSummary,
    private readonly resolveDecision: (decision: ProtectionDecision) => void
  ) {
    super(app);
  }

  static ask(app: App, summary: ProtectionSummary): Promise<ProtectionDecision> {
    return new Promise((resolve) => new ProtectFilesModal(app, summary, resolve).open());
  }

  override onOpen(): void {
    const { contentEl, summary } = this;
    this.titleEl.setText("Encrypt and lock vault?");
    contentEl.createEl("p", {
      text: `${summary.fileCount} matching plaintext ${summary.fileCount === 1 ? "file" : "files"} (${formatBytes(summary.totalBytes)}) will be encrypted.`
    });
    contentEl.createEl("p", {
      cls: "vault-in-vault-extension-summary",
      text: [...summary.countsByExtension.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([extension, count]) => `.${extension}: ${count}`)
        .join(" · ")
    });

    const buttons = contentEl.createDiv({ cls: "vault-in-vault-modal-buttons" });
    const leave = buttons.createEl("button", {
      text: "Cancel"
    });
    leave.addEventListener("click", () => this.finish("leave"));
    const encrypt = buttons.createEl("button", {
      text: "Encrypt and lock",
      cls: "mod-cta"
    });
    encrypt.addEventListener("click", () => this.finish("encrypt"));
    window.setTimeout(() => encrypt.focus(), 0);
  }

  override onClose(): void {
    this.contentEl.empty();
    if (!this.settled) this.resolveDecision("leave");
  }

  private finish(decision: ProtectionDecision): void {
    if (this.settled) return;
    this.settled = true;
    this.resolveDecision(decision);
    this.close();
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
}
