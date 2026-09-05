import {
  FileSystemAdapter,
  FileView,
  MarkdownPostProcessorContext,
  MarkdownView,
  Notice,
  Plugin,
  TFile,
  WorkspaceLeaf
} from "obsidian";
import { shell } from "electron";
import { join } from "path";

import { AGE_VIEW_TYPE, EncryptedAgeView } from "./age-view";
import { AGE_CONFIG_PATH, AgeConfigPolicy, normalizeExcludeList, parseAgeConfig } from "./age-config";
import { decryptWithPassphrase, encryptWithPassphrase } from "./crypto";
import { EncryptionPasswordModal } from "./encryption-password-modal";
import {
  classifyAgePath,
  DEFAULT_PROTECTED_EXTENSIONS,
  extractEmbeddedImageLinks,
  isExcludedVaultPath,
  isKnownImagePath,
  isProtectedPlainPath,
  normalizeExtensionList
} from "./file-types";
import { PasswordModal } from "./password-modal";
import { ProtectFilesModal, ProtectionSummary } from "./protect-files-modal";
import { VaultInVaultSettingTab } from "./settings";
import { ClosedFileProtectionModal } from "./tab-close-modal";
import { findLastProtectedClosedPath } from "./tab-close-tracker";

export interface VaultInVaultSettings {
  extensions: string[];
  excludedPaths: string[];
  autoDecryptEmbeddedImages: boolean;
}

const DEFAULT_SETTINGS: VaultInVaultSettings = {
  extensions: [...DEFAULT_PROTECTED_EXTENSIONS],
  excludedPaths: [],
  autoDecryptEmbeddedImages: true
};

class PasswordCancelledError extends Error {
  constructor() {
    super("Password entry was cancelled.");
    this.name = "PasswordCancelledError";
  }
}

export default class VaultInVaultPlugin extends Plugin {
  override settings: VaultInVaultSettings = { ...DEFAULT_SETTINGS };
  private sessionPassword: string | null = null;
  private configurationUnlocked = false;
  private sharedAgeConfig: AgeConfigPolicy | null = null;
  private sharedAgeConfigError: string | null = null;
  private sharedAgeConfigExists = false;
  private readonly decryptJobs = new Map<string, Promise<TFile>>();
  private openLeafFiles = new Map<WorkspaceLeaf, string>();
  private leafSnapshotInitialized = false;
  private closedFilePromptQueue: Promise<void> = Promise.resolve();
  private readonly queuedClosedPaths = new Set<string>();

  override async onload(): Promise<void> {
    await this.loadSettings();

    if (this.sharedAgeConfigError !== null) {
      new Notice(`Vault in Vault: invalid ${AGE_CONFIG_PATH}: ${this.sharedAgeConfigError}`);
    }

    this.registerView(AGE_VIEW_TYPE, (leaf) => new EncryptedAgeView(leaf, this));
    this.registerExtensions(["age"], AGE_VIEW_TYPE);
    this.addSettingTab(new VaultInVaultSettingTab(this));

    this.addCommand({
      id: "encrypt-and-lock-vault-now",
      name: "Encrypt and lock vault now",
      callback: () => void this.encryptAndLock(false).catch((error) => this.reportError(error))
    });

    this.addCommand({
      id: "decrypt-images-in-current-note",
      name: "Decrypt encrypted images in current note",
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view?.file === null || view?.file === undefined) return false;
        if (!checking) {
          void this.decryptImagesForMarkdownFile(view.file, true)
            .catch((error) => this.reportError(error));
        }
        return true;
      }
    });

    this.addCommand({
      id: "forget-cached-password",
      name: "Forget cached vault password",
      callback: () => {
        this.clearPassword();
        new Notice("Cached vault password cleared; configuration locked.");
      }
    });

    this.addRibbonIcon("lock-keyhole", "Encrypt and lock vault", () => {
      void this.encryptAndLock(false).catch((error) => this.reportError(error));
    });

    this.app.workspace.onLayoutReady(() => this.captureOpenLeafFiles());
    this.registerEvent(
      this.app.workspace.on("layout-change", () => this.detectClosedFileTabs())
    );

    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (
          file === null ||
          file.extension.toLowerCase() !== "md" ||
          !this.settings.autoDecryptEmbeddedImages ||
          this.sessionPassword === null
        ) {
          return;
        }
        void this.decryptImagesForMarkdownFile(file, false)
          .catch((error) => this.reportError(error));
      })
    );

    this.registerMarkdownPostProcessor(async (element, context) => {
      await this.processEncryptedImageEmbeds(element, context);
    });
  }

  override onunload(): void {
    this.clearPassword();
    this.decryptJobs.clear();
  }

  async decryptAndOpenFile(file: TFile, leaf: WorkspaceLeaf): Promise<void> {
    const ciphertext = new Uint8Array(await this.app.vault.readBinary(file));
    const { plaintext, password } = await this.decryptForFile(ciphertext, file.path);
    const type = classifyAgePath(file.path);
    if (type.kind === "markdown") {
      new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
    }

    // Keep the encrypted source until the replacement is open in this same leaf.
    // Deleting the file backing the active custom view first makes Obsidian restore
    // the previous history entry and can win a race against leaf.openFile().
    const plaintextFile = await this.publishPlaintext(file, plaintext, false);
    if (type.kind === "markdown" && this.settings.autoDecryptEmbeddedImages) {
      const markdown = new TextDecoder().decode(plaintext);
      await this.decryptEmbeddedImages(markdown, plaintextFile.path, password);
    }
    await leaf.openFile(plaintextFile, { active: true });
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
    const encryptedSource = this.app.vault.getFileByPath(file.path);
    if (encryptedSource !== null) await this.app.vault.delete(encryptedSource);
  }

  isConfigurationUnlocked(): boolean {
    return this.configurationUnlocked;
  }

  getProtectedExtensions(): readonly string[] {
    if (this.sharedAgeConfigError !== null) return [];
    return this.sharedAgeConfig?.extensions ?? this.settings.extensions;
  }

  getExcludedPaths(): readonly string[] {
    if (this.sharedAgeConfigError !== null) return [];
    return this.sharedAgeConfig?.exclude ?? this.settings.excludedPaths;
  }

  getProtectionPolicySource(): string {
    if (this.sharedAgeConfigError !== null) {
      return `${AGE_CONFIG_PATH} is invalid: ${this.sharedAgeConfigError}`;
    }
    return this.sharedAgeConfig === null
      ? "Plugin settings (data.json)"
      : `${AGE_CONFIG_PATH} in the vault root`;
  }

  isSharedAgeConfigActive(): boolean {
    return this.sharedAgeConfig !== null;
  }

  canOpenAgeConfigExternally(): boolean {
    return this.sharedAgeConfigExists && this.app.vault.adapter instanceof FileSystemAdapter;
  }

  async openAgeConfigExternally(): Promise<void> {
    try {
      const configPath = this.getAgeConfigSystemPath();
      const error = await shell.openPath(configPath);
      if (error.length > 0) throw new Error(error);
    } catch (error) {
      this.reportError(error);
    }
  }

  revealAgeConfigInFileManager(): void {
    try {
      shell.showItemInFolder(this.getAgeConfigSystemPath());
    } catch (error) {
      this.reportError(error);
    }
  }

  private getAgeConfigSystemPath(): string {
    if (!this.sharedAgeConfigExists) throw new Error(`${AGE_CONFIG_PATH} does not exist.`);
    const { adapter } = this.app.vault;
    if (!(adapter instanceof FileSystemAdapter)) {
      throw new Error("Opening external files requires a desktop filesystem vault.");
    }
    return join(adapter.getBasePath(), AGE_CONFIG_PATH);
  }

  async reloadAgeConfig(showNotice = true): Promise<void> {
    this.sharedAgeConfig = null;
    this.sharedAgeConfigError = null;
    this.sharedAgeConfigExists = false;
    try {
      if (!(await this.app.vault.adapter.exists(AGE_CONFIG_PATH))) {
        if (showNotice) new Notice(`${AGE_CONFIG_PATH} not found; using plugin settings.`);
        return;
      }
      this.sharedAgeConfigExists = true;
      const contents = await this.app.vault.adapter.read(AGE_CONFIG_PATH);
      if (new TextEncoder().encode(contents).byteLength > 64 * 1024) {
        throw new Error("the file is larger than 64 KiB");
      }
      this.sharedAgeConfig = parseAgeConfig(contents);
      if (showNotice) new Notice(`Reloaded protection policy from ${AGE_CONFIG_PATH}.`);
    } catch (error) {
      this.sharedAgeConfigError = error instanceof Error ? error.message : String(error);
      if (showNotice) {
        new Notice(`Vault in Vault: invalid ${AGE_CONFIG_PATH}: ${this.sharedAgeConfigError}`);
      }
    }
  }

  async unlockConfiguration(): Promise<boolean> {
    if (this.configurationUnlocked) return true;
    try {
      await this.getPasswordForVaultOperation(
        "Unlock configuration",
        "Verify the vault password before editing protected file types.",
        "Unlock"
      );
      this.configurationUnlocked = true;
      return true;
    } catch (error) {
      if (!this.isCancelledError(error)) this.reportError(error);
      return false;
    }
  }

  lockConfiguration(): void {
    this.configurationUnlocked = false;
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  isCancelledError(error: unknown): boolean {
    return error instanceof PasswordCancelledError;
  }

  private async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as Partial<VaultInVaultSettings> | null;
    const extensions = normalizeExtensionList(data?.extensions ?? DEFAULT_SETTINGS.extensions);
    let excludedPaths: string[] = [];
    try {
      excludedPaths = normalizeExcludeList(data?.excludedPaths ?? []);
    } catch {
      excludedPaths = [];
    }
    this.settings = {
      extensions: extensions.length > 0 ? extensions : [...DEFAULT_SETTINGS.extensions],
      excludedPaths,
      autoDecryptEmbeddedImages:
        typeof data?.autoDecryptEmbeddedImages === "boolean"
          ? data.autoDecryptEmbeddedImages
          : DEFAULT_SETTINGS.autoDecryptEmbeddedImages
    };
    // Persist the normalized schema and remove obsolete tracking-only fields
    // from pre-0.3 plugin data. Passwords are never part of this object.
    await this.saveSettings();
    await this.reloadAgeConfig(false);
  }

  private async requireValidProtectionPolicy(): Promise<void> {
    await this.reloadAgeConfig(false);
    if (this.sharedAgeConfigError !== null) {
      throw new Error(`Invalid ${AGE_CONFIG_PATH}: ${this.sharedAgeConfigError}`);
    }
  }

  private async decryptForFile(
    ciphertext: Uint8Array,
    filePath: string
  ): Promise<{ plaintext: Uint8Array; password: string }> {
    if (this.sessionPassword !== null) {
      try {
        return {
          plaintext: await decryptWithPassphrase(ciphertext, this.sessionPassword),
          password: this.sessionPassword
        };
      } catch {
        this.clearPassword();
      }
    }

    const answer = await PasswordModal.ask(this.app, filePath);
    if (answer === null) throw new PasswordCancelledError();
    try {
      const plaintext = await decryptWithPassphrase(ciphertext, answer.password);
      if (answer.rememberForSession) this.sessionPassword = answer.password;
      this.configurationUnlocked = true;
      return { plaintext, password: answer.password };
    } catch {
      this.clearPassword();
      throw new Error("Wrong password, damaged data, or an unsupported age file.");
    }
  }

  private async encryptAndLock(alreadyConfirmed = false): Promise<void> {
    await this.requireValidProtectionPolicy();
    let files = this.getProtectedPlaintextFiles();
    if (files.length === 0) {
      this.clearPassword();
      new Notice("No matching plaintext files found; cached password cleared.");
      return;
    }

    if (!alreadyConfirmed) {
      const decision = await ProtectFilesModal.ask(this.app, this.summarize(files));
      if (decision === "leave") return;
    }

    await this.saveOpenMarkdownViews();
    // The user may have edited or created a file while the modal was open.
    // Rescan after flushing every native Markdown editor.
    await this.requireValidProtectionPolicy();
    files = this.getProtectedPlaintextFiles();
    if (files.length === 0) {
      this.clearPassword();
      return;
    }

    const password = await this.getPasswordForVaultOperation(
      "Encrypt vault files",
      `Enter the vault password for ${files.length} matching plaintext ${files.length === 1 ? "file" : "files"}.`,
      "Encrypt"
    );
    const progress = new Notice(`Encrypting 0/${files.length} files…`, 0);
    let completed = 0;
    try {
      for (const file of files) {
        await this.encryptPlaintextFile(file, password);
        completed++;
        progress.setMessage(`Encrypting ${completed}/${files.length} files…`);
      }
    } finally {
      progress.hide();
    }

    this.clearPassword();
    new Notice(`Encrypted and locked ${completed} ${completed === 1 ? "file" : "files"}.`);
  }

  private captureOpenLeafFiles(): void {
    this.openLeafFiles = this.readOpenLeafFiles();
    this.leafSnapshotInitialized = true;
  }

  private detectClosedFileTabs(): void {
    const current = this.readOpenLeafFiles();
    if (!this.leafSnapshotInitialized) {
      this.openLeafFiles = current;
      this.leafSnapshotInitialized = true;
      return;
    }

    const closedPath = findLastProtectedClosedPath(
      this.openLeafFiles,
      current,
      (path) => isProtectedPlainPath(
        path,
        this.getProtectedExtensions(),
        this.app.vault.configDir,
        this.getExcludedPaths()
      )
    );
    this.openLeafFiles = current;
    if (closedPath !== null) this.enqueueClosedFilePrompt(closedPath);
  }

  private readOpenLeafFiles(): Map<WorkspaceLeaf, string> {
    const files = new Map<WorkspaceLeaf, string>();
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof FileView && leaf.view.file !== null) {
        files.set(leaf, leaf.view.file.path);
      }
    });
    return files;
  }

  private enqueueClosedFilePrompt(path: string): void {
    if (this.queuedClosedPaths.has(path)) return;
    this.queuedClosedPaths.add(path);
    this.closedFilePromptQueue = this.closedFilePromptQueue
      .then(() => this.handleClosedFile(path))
      .catch((error) => this.reportError(error))
      .finally(() => this.queuedClosedPaths.delete(path));
  }

  private async handleClosedFile(path: string): Promise<void> {
    // Yield once so the view can finish its normal save before encryption reads it.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    await this.requireValidProtectionPolicy();
    const file = this.app.vault.getFileByPath(path);
    if (
      file === null ||
      !isProtectedPlainPath(
        file.path,
        this.getProtectedExtensions(),
        this.app.vault.configDir,
        this.getExcludedPaths()
      )
    ) return;
    if (this.isPathOpenInAnyLeaf(path)) return;

    const allFiles = this.getProtectedPlaintextFiles();
    const decision = await ClosedFileProtectionModal.ask(this.app, {
      filePath: path,
      allFilePaths: allFiles.map((candidate) => candidate.path),
      ageConfigExcludedPaths: this.getAgeConfigExcludedPaths()
    });
    if (decision === "leave") return;
    if (decision === "all") {
      await this.encryptAndLock(true);
      return;
    }

    await this.requireValidProtectionPolicy();
    const currentFile = this.app.vault.getFileByPath(path);
    if (
      currentFile === null ||
      !isProtectedPlainPath(
        currentFile.path,
        this.getProtectedExtensions(),
        this.app.vault.configDir,
        this.getExcludedPaths()
      ) ||
      this.isPathOpenInAnyLeaf(path)
    ) {
      return;
    }
    const password = await this.getPasswordForVaultOperation(
      "Encrypt closed file",
      `Enter the vault password for ${path}.`,
      "Encrypt"
    );
    await this.encryptPlaintextFile(currentFile, password);
    new Notice(`Encrypted ${path}.`);
  }

  private isPathOpenInAnyLeaf(path: string): boolean {
    let found = false;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof FileView && leaf.view.file?.path === path) found = true;
    });
    return found;
  }

  private async saveOpenMarkdownViews(): Promise<void> {
    const saves: Promise<void>[] = [];
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView && leaf.view.file !== null) {
        saves.push(leaf.view.save());
      }
    });
    await Promise.all(saves);
  }

  private getProtectedPlaintextFiles(): TFile[] {
    return this.app.vault
      .getFiles()
      .filter((file) =>
        isProtectedPlainPath(
          file.path,
          this.getProtectedExtensions(),
          this.app.vault.configDir,
          this.getExcludedPaths()
        )
      )
      .sort((left, right) => left.path.localeCompare(right.path));
  }

  private summarize(files: readonly TFile[]): ProtectionSummary {
    const countsByExtension = new Map<string, number>();
    let totalBytes = 0;
    for (const file of files) {
      totalBytes += file.stat.size;
      const extension = file.extension.toLowerCase();
      countsByExtension.set(extension, (countsByExtension.get(extension) ?? 0) + 1);
    }
    return {
      fileCount: files.length,
      totalBytes,
      countsByExtension,
      filePaths: files.map((file) => file.path),
      ageConfigExcludedPaths: this.getAgeConfigExcludedPaths()
    };
  }

  private getAgeConfigExcludedPaths(): readonly string[] {
    return this.isSharedAgeConfigActive() ? this.getExcludedPaths() : [];
  }

  private async getPasswordForVaultOperation(
    title: string,
    description: string,
    submitLabel: string
  ): Promise<string> {
    if (this.sessionPassword !== null) return this.sessionPassword;

    const verificationFile = this.app.vault
      .getFiles()
      .filter(
        (file) =>
          file.path.toLowerCase().endsWith(".age") &&
          !isExcludedVaultPath(
            classifyAgePath(file.path).originalPath,
            this.getExcludedPaths()
          )
      )
      .sort((left, right) => left.stat.size - right.stat.size)[0];

    while (true) {
      const answer = await EncryptionPasswordModal.ask(this.app, {
        title,
        description: verificationFile === undefined
          ? `${description} No existing age file is available, so enter it twice.`
          : `${description} It will be verified against an existing age file.`,
        submitLabel,
        requiresConfirmation: verificationFile === undefined
      });
      if (answer === null) throw new PasswordCancelledError();

      if (verificationFile !== undefined) {
        try {
          const ciphertext = new Uint8Array(await this.app.vault.readBinary(verificationFile));
          await decryptWithPassphrase(ciphertext, answer.password);
        } catch {
          new Notice("That password could not unlock an existing age file. Try again.");
          continue;
        }
      }

      if (answer.rememberForSession) this.sessionPassword = answer.password;
      this.configurationUnlocked = true;
      return answer.password;
    }
  }

  private async publishPlaintext(
    file: TFile,
    plaintext: Uint8Array,
    removeEncryptedSource = true
  ): Promise<TFile> {
    const targetPath = classifyAgePath(file.path).originalPath;
    const existingTarget = this.app.vault.getFileByPath(targetPath);
    if (existingTarget !== null) {
      const existing = new Uint8Array(await this.app.vault.readBinary(existingTarget));
      if (!bytesEqual(existing, plaintext)) {
        throw new Error(`${targetPath} already exists with different content.`);
      }
      if (removeEncryptedSource) await this.app.vault.delete(file);
      return existingTarget;
    }

    const created = await this.app.vault.createBinary(targetPath, toArrayBuffer(plaintext), {
      ctime: file.stat.ctime,
      mtime: file.stat.mtime
    });
    const published = new Uint8Array(await this.app.vault.readBinary(created));
    if (!bytesEqual(published, plaintext)) {
      await this.app.vault.delete(created);
      throw new Error(`Could not verify the decrypted copy of ${targetPath}.`);
    }
    if (removeEncryptedSource) await this.app.vault.delete(file);
    return created;
  }

  private async encryptPlaintextFile(file: TFile, password: string): Promise<void> {
    const sourcePath = file.path;
    const targetPath = `${sourcePath}.age`;
    const source = new Uint8Array(await this.app.vault.readBinary(file));
    const existingTarget = this.app.vault.getFileByPath(targetPath);

    if (existingTarget !== null) {
      try {
        const existingCiphertext = new Uint8Array(
          await this.app.vault.readBinary(existingTarget)
        );
        const existingPlaintext = await decryptWithPassphrase(existingCiphertext, password);
        if (!bytesEqual(source, existingPlaintext)) throw new Error("content differs");
      } catch {
        throw new Error(`${targetPath} already exists and does not match ${sourcePath}.`);
      }
      await this.app.vault.delete(file);
      return;
    }

    const ciphertext = await encryptWithPassphrase(source, password);
    const created = await this.app.vault.createBinary(targetPath, toArrayBuffer(ciphertext), {
      ctime: file.stat.ctime,
      mtime: file.stat.mtime
    });
    try {
      const publishedCiphertext = new Uint8Array(await this.app.vault.readBinary(created));
      const verifiedPlaintext = await decryptWithPassphrase(publishedCiphertext, password);
      if (!bytesEqual(source, verifiedPlaintext)) {
        throw new Error("content differs after encryption");
      }
    } catch {
      await this.app.vault.delete(created);
      throw new Error(`Could not verify newly encrypted data for ${sourcePath}.`);
    }

    const latestSource = new Uint8Array(await this.app.vault.readBinary(file));
    if (!bytesEqual(source, latestSource)) {
      await this.app.vault.delete(created);
      throw new Error(`${sourcePath} changed while it was being encrypted; plaintext was kept.`);
    }
    await this.app.vault.delete(file);
  }

  private async decryptImagesForMarkdownFile(
    file: TFile,
    promptForPassword: boolean
  ): Promise<number> {
    const markdown = await this.app.vault.cachedRead(file);
    const encryptedImages = this.resolveEncryptedImages(markdown, file.path);
    if (encryptedImages.length === 0) return 0;

    let password = this.sessionPassword;
    if (password === null && promptForPassword) {
      password = await this.getPasswordForVaultOperation(
        "Decrypt embedded images",
        `Enter the vault password for ${encryptedImages.length} encrypted image ${encryptedImages.length === 1 ? "file" : "files"}.`,
        "Decrypt"
      );
    }
    if (password === null) return 0;

    const count = await this.decryptImageFiles(encryptedImages, password);
    if (count > 0) this.rerenderMarkdownFile(file.path);
    return count;
  }

  private async decryptEmbeddedImages(
    markdown: string,
    sourcePath: string,
    password: string
  ): Promise<number> {
    const encryptedImages = this.resolveEncryptedImages(markdown, sourcePath);
    return this.decryptImageFiles(encryptedImages, password);
  }

  private resolveEncryptedImages(markdown: string, sourcePath: string): TFile[] {
    const resolved = new Map<string, TFile>();
    for (const link of extractEmbeddedImageLinks(markdown)) {
      const cleanLink = link.split(/[?#]/, 1)[0];
      const ageLink = cleanLink.toLowerCase().endsWith(".age") ? cleanLink : `${cleanLink}.age`;
      const file = this.app.metadataCache.getFirstLinkpathDest(ageLink, sourcePath);
      if (
        file !== null &&
        isKnownImagePath(classifyAgePath(file.path).originalPath) &&
        isProtectedPlainPath(
          classifyAgePath(file.path).originalPath,
          this.getProtectedExtensions(),
          this.app.vault.configDir,
          this.getExcludedPaths()
        )
      ) {
        resolved.set(file.path, file);
      }
    }
    return [...resolved.values()];
  }

  private async decryptImageFiles(files: readonly TFile[], password: string): Promise<number> {
    let count = 0;
    for (const file of files) {
      try {
        await this.decryptAgeFileWithPassword(file, password);
        count++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        new Notice(`Could not decrypt ${file.path}: ${message}`);
      }
    }
    return count;
  }

  private decryptAgeFileWithPassword(file: TFile, password: string): Promise<TFile> {
    const running = this.decryptJobs.get(file.path);
    if (running !== undefined) return running;

    const job = (async () => {
      const ciphertext = new Uint8Array(await this.app.vault.readBinary(file));
      const plaintext = await decryptWithPassphrase(ciphertext, password);
      return this.publishPlaintext(file, plaintext);
    })().finally(() => this.decryptJobs.delete(file.path));
    this.decryptJobs.set(file.path, job);
    return job;
  }

  private async processEncryptedImageEmbeds(
    element: HTMLElement,
    context: MarkdownPostProcessorContext
  ): Promise<void> {
    const section = context.getSectionInfo(element);
    if (section === null) return;
    const images = this.resolveEncryptedImages(section.text, context.sourcePath);
    if (images.length === 0) return;

    if (this.settings.autoDecryptEmbeddedImages && this.sessionPassword !== null) {
      const count = await this.decryptImageFiles(images, this.sessionPassword);
      if (count > 0) this.rerenderMarkdownFile(context.sourcePath);
      return;
    }

    const control = element.createDiv({ cls: "vault-in-vault-embedded-image-control" });
    control.createSpan({
      text: `${images.length} encrypted ${images.length === 1 ? "image is" : "images are"} available. `
    });
    const button = control.createEl("button", { text: "Decrypt images" });
    button.addEventListener("click", () => {
      const source = this.app.vault.getFileByPath(context.sourcePath);
      if (source === null) return;
      button.disabled = true;
      void this.decryptImagesForMarkdownFile(source, true)
        .catch((error) => this.reportError(error))
        .finally(() => {
          if (button.isConnected) button.disabled = false;
        });
    });
  }

  private rerenderMarkdownFile(path: string): void {
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView && leaf.view.file?.path === path) {
        leaf.view.previewMode.rerender(true);
      }
    });
  }

  private clearPassword(): void {
    this.sessionPassword = null;
    this.configurationUnlocked = false;
  }

  private reportError(error: unknown): void {
    if (this.isCancelledError(error)) return;
    const message = error instanceof Error ? error.message : String(error);
    new Notice(`Vault in Vault: ${message}`);
  }
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
