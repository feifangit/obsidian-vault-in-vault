import { App, Modal, Setting, TextComponent } from "obsidian";

import type { PasswordAnswer } from "./password-modal";

export interface VaultPasswordRequest {
  title: string;
  description: string;
  submitLabel: string;
  requiresConfirmation: boolean;
}

export class EncryptionPasswordModal extends Modal {
  private passwordInput: TextComponent | null = null;
  private confirmationInput: TextComponent | null = null;
  private errorEl: HTMLElement | null = null;
  private rememberForSession = true;
  private settled = false;

  private constructor(
    app: App,
    private readonly request: VaultPasswordRequest,
    private readonly resolveAnswer: (answer: PasswordAnswer | null) => void
  ) {
    super(app);
  }

  static ask(app: App, request: VaultPasswordRequest): Promise<PasswordAnswer | null> {
    return new Promise((resolve) => new EncryptionPasswordModal(app, request, resolve).open());
  }

  override onOpen(): void {
    this.titleEl.setText(this.request.title);
    this.contentEl.createEl("p", { text: this.request.description });

    const form = this.contentEl.createEl("form");
    new Setting(form).setName("Password").addText((text) => {
      this.passwordInput = text;
      text.inputEl.type = "password";
      text.inputEl.autocomplete = this.request.requiresConfirmation
        ? "new-password"
        : "current-password";
      text.inputEl.setAttribute("aria-label", "Vault encryption password");
    });

    if (this.request.requiresConfirmation) {
      new Setting(form).setName("Confirm password").addText((text) => {
        this.confirmationInput = text;
        text.inputEl.type = "password";
        text.inputEl.autocomplete = "new-password";
        text.inputEl.setAttribute("aria-label", "Confirm Vault encryption password");
      });
    }

    new Setting(form)
      .setName("Remember for this Obsidian session")
      .setDesc("Stored only in plugin memory; never written to disk.")
      .addToggle((toggle) =>
        toggle.setValue(true).onChange((value) => {
          this.rememberForSession = value;
        })
      );

    this.errorEl = form.createDiv({ cls: "vault-in-vault-modal-error" });
    const buttons = form.createDiv({ cls: "vault-in-vault-modal-buttons" });
    const cancel = buttons.createEl("button", { text: "Cancel", attr: { type: "button" } });
    cancel.addEventListener("click", () => this.close());
    buttons.createEl("button", {
      text: this.request.submitLabel,
      cls: "mod-cta",
      attr: { type: "submit" }
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const password = this.passwordInput?.getValue() ?? "";
      if (password.length === 0) {
        this.showError("Password cannot be empty.");
        this.passwordInput?.inputEl.focus();
        return;
      }
      if (
        this.request.requiresConfirmation &&
        password !== this.confirmationInput?.getValue()
      ) {
        this.showError("Passwords do not match.");
        this.confirmationInput?.inputEl.focus();
        return;
      }
      this.finish({ password, rememberForSession: this.rememberForSession });
    });

    window.setTimeout(() => this.passwordInput?.inputEl.focus(), 0);
  }

  override onClose(): void {
    this.passwordInput?.setValue("");
    this.confirmationInput?.setValue("");
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolveAnswer(null);
    }
  }

  private showError(message: string): void {
    this.errorEl?.setText(message);
  }

  private finish(answer: PasswordAnswer): void {
    if (this.settled) return;
    this.settled = true;
    this.resolveAnswer(answer);
    this.close();
  }
}
