import { App, Modal, Setting, TextComponent } from "obsidian";

import type { PasswordAnswer } from "./password-modal";
import { t } from "./i18n";

export interface VaultPasswordRequest {
  title: string;
  description: string;
  submitLabel: string;
  requiresConfirmation: boolean;
  requiresRememberForSession?: boolean;
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
    new Setting(form).setName(t("password.label")).addText((text) => {
      this.passwordInput = text;
      text.inputEl.type = "password";
      text.inputEl.autocomplete = this.request.requiresConfirmation
        ? "new-password"
        : "current-password";
      text.inputEl.setAttribute("aria-label", t("password.ariaVault"));
    });

    if (this.request.requiresConfirmation) {
      new Setting(form).setName(t("password.confirm")).addText((text) => {
        this.confirmationInput = text;
        text.inputEl.type = "password";
        text.inputEl.autocomplete = "new-password";
        text.inputEl.setAttribute("aria-label", t("password.ariaConfirm"));
      });
    }

    new Setting(form)
      .setName(
        this.request.requiresRememberForSession
          ? t("password.rememberAuto")
          : t("password.rememberSession")
      )
      .setDesc(
        this.request.requiresRememberForSession
          ? t("password.rememberAutoDescription")
          : t("password.rememberDiskDescription")
      )
      .addToggle((toggle) => {
        toggle.setValue(true).setDisabled(this.request.requiresRememberForSession === true).onChange((value) => {
          this.rememberForSession = value;
        });
      });

    this.errorEl = form.createDiv({ cls: "vault-in-vault-modal-error" });
    const buttons = form.createDiv({ cls: "vault-in-vault-modal-buttons" });
    const cancel = buttons.createEl("button", { text: t("common.cancel"), attr: { type: "button" } });
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
        this.showError(t("password.empty"));
        this.passwordInput?.inputEl.focus();
        return;
      }
      if (
        this.request.requiresConfirmation &&
        password !== this.confirmationInput?.getValue()
      ) {
        this.showError(t("password.mismatch"));
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
