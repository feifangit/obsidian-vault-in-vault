import { App, Modal, Setting, TextComponent } from "obsidian";

export interface PasswordAnswer {
  password: string;
  rememberForSession: boolean;
}

export class PasswordModal extends Modal {
  private passwordInput: TextComponent | null = null;
  private rememberForSession = true;
  private settled = false;

  private constructor(
    app: App,
    private readonly filePath: string,
    private readonly requiresRememberForSession: boolean,
    private readonly resolveAnswer: (answer: PasswordAnswer | null) => void
  ) {
    super(app);
  }

  static ask(
    app: App,
    filePath: string,
    requiresRememberForSession = false
  ): Promise<PasswordAnswer | null> {
    return new Promise((resolve) =>
      new PasswordModal(app, filePath, requiresRememberForSession, resolve).open()
    );
  }

  override onOpen(): void {
    this.titleEl.setText("Unlock age file");
    this.contentEl.addClass("vault-in-vault-password-modal");
    this.contentEl.createEl("p", {
      text: `Enter the password for ${this.filePath}. The password is never saved to disk.`
    });

    const form = this.contentEl.createEl("form");
    new Setting(form).setName("Password").addText((text) => {
      this.passwordInput = text;
      text.inputEl.type = "password";
      text.inputEl.autocomplete = "current-password";
      text.inputEl.setAttribute("aria-label", "age file password");
    });

    new Setting(form)
      .setName(
        this.requiresRememberForSession
          ? "Remember until automatic lock"
          : "Remember for this Obsidian session"
      )
      .setDesc(
        this.requiresRememberForSession
          ? "Required by automatic idle lock. Stored only in plugin memory and cleared after locking."
          : "Stored only in plugin memory until you lock the views or unload the plugin."
      )
      .addToggle((toggle) => {
        toggle.setValue(true).setDisabled(this.requiresRememberForSession).onChange((value) => {
          this.rememberForSession = value;
        });
      });

    const buttons = form.createDiv({ cls: "vault-in-vault-modal-buttons" });
    const cancel = buttons.createEl("button", { text: "Cancel", attr: { type: "button" } });
    cancel.addEventListener("click", () => this.close());
    buttons.createEl("button", {
      text: "Unlock",
      cls: "mod-cta",
      attr: { type: "submit" }
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const password = this.passwordInput?.getValue() ?? "";
      if (password.length === 0) {
        this.passwordInput?.inputEl.focus();
        return;
      }
      this.finish({ password, rememberForSession: this.rememberForSession });
    });

    window.setTimeout(() => this.passwordInput?.inputEl.focus(), 0);
  }

  override onClose(): void {
    this.passwordInput?.setValue("");
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolveAnswer(null);
    }
  }

  private finish(answer: PasswordAnswer): void {
    if (this.settled) return;
    this.settled = true;
    this.resolveAnswer(answer);
    this.close();
  }
}
