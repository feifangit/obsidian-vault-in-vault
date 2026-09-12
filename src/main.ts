import {
  FileSystemAdapter,
  FileView,
  MarkdownPostProcessorContext,
  MarkdownView,
  Notice,
  Plugin,
  setIcon,
  TFile,
  WorkspaceLeaf
} from "obsidian";
import { shell } from "electron";

import { AGE_VIEW_TYPE, EncryptedAgeView } from "./age-view";
import { AGE_CONFIG_PATH, AgeConfigPolicy, normalizeExcludeList, parseAgeConfig } from "./age-config";
import { runAutoLockBatch } from "./auto-lock";
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
import {
  ActivityTargetRegistry,
  getSecurityModeIcon,
  normalizeSecurityTimerSettings,
  SecurityTimerMode,
  SecurityTimeoutMinutes,
  SessionSecurityClock
} from "./security-timer";

export interface VaultInVaultSettings {
  extensions: string[];
  excludedPaths: string[];
  autoDecryptEmbeddedImages: boolean;
  passwordCacheTimeoutMinutes: SecurityTimeoutMinutes;
  idleAutoLockMinutes: SecurityTimeoutMinutes;
}

const DEFAULT_SETTINGS: VaultInVaultSettings = {
  extensions: [...DEFAULT_PROTECTED_EXTENSIONS],
  excludedPaths: [],
  autoDecryptEmbeddedImages: true,
  passwordCacheTimeoutMinutes: 0,
  idleAutoLockMinutes: 0
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
  private readonly securityClock = new SessionSecurityClock();
  private readonly trackedActivityDocuments = new ActivityTargetRegistry<Document>();
  private ribbonLockEl: HTMLElement | null = null;
  private ribbonMainIconEl: HTMLElement | null = null;
  private ribbonModeBadgeEl: HTMLElement | null = null;
  private renderedSecurityMode: SecurityTimerMode | null = null;
  private securityTimerCheckRunning = false;
  private autoLockInProgress = false;
  private autoLockGeneration = 0;
  private lastActivityIndicatorUpdateAt = 0;

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

    this.ribbonLockEl = this.addRibbonIcon("lock-keyhole", "Encrypt and lock vault", () => {
      void this.encryptAndLock(false).catch((error) => this.reportError(error));
    });
    this.ribbonLockEl.addClass("vault-in-vault-ribbon-lock");
    this.ribbonLockEl.empty();
    this.ribbonMainIconEl = this.ribbonLockEl.createSpan({
      cls: "vault-in-vault-ribbon-main-icon",
      attr: { "aria-hidden": "true" }
    });
    this.ribbonModeBadgeEl = this.ribbonLockEl.createSpan({
      cls: "vault-in-vault-mode-badge",
      attr: { "aria-hidden": "true" }
    });
    this.ribbonLockEl.createSpan({ cls: "vault-in-vault-lock-indicator" });
    this.updateSecurityIndicator();

    this.app.workspace.onLayoutReady(() => {
      this.captureOpenLeafFiles();
      this.registerExistingActivityWindows();
    });
    this.registerEvent(
      this.app.workspace.on("layout-change", () => this.detectClosedFileTabs())
    );
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => this.recordVaultActivity())
    );
    this.registerEvent(
      this.app.workspace.on("editor-change", () => this.recordVaultActivity())
    );
    this.registerEvent(
      this.app.workspace.on("window-open", (_workspaceWindow, openedWindow) => {
        this.registerActivityWindow(openedWindow);
        this.recordVaultActivity();
      })
    );

    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        this.recordVaultActivity();
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

    this.registerInterval(window.setInterval(() => {
      void this.checkSecurityTimers();
    }, 1_000));
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
    const encryptedSource = this.getFileByPath(file.path);
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
    return adapter.getFullPath(AGE_CONFIG_PATH);
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

  async setPasswordCacheTimeout(minutes: SecurityTimeoutMinutes): Promise<void> {
    this.settings.passwordCacheTimeoutMinutes = minutes;
    if (minutes > 0) this.settings.idleAutoLockMinutes = 0;
    await this.saveSettings();
    await this.checkSecurityTimers();
    this.updateSecurityIndicator();
  }

  async setIdleAutoLockTimeout(minutes: SecurityTimeoutMinutes): Promise<void> {
    this.settings.idleAutoLockMinutes = minutes;
    if (minutes > 0) this.settings.passwordCacheTimeoutMinutes = 0;
    this.securityClock.recordActivity();
    await this.saveSettings();
    this.updateSecurityIndicator();
  }

  requiresRememberedPassword(): boolean {
    return this.settings.idleAutoLockMinutes > 0;
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
    const securityTimers = normalizeSecurityTimerSettings(
      data?.passwordCacheTimeoutMinutes,
      data?.idleAutoLockMinutes
    );
    this.settings = {
      extensions: extensions.length > 0 ? extensions : [...DEFAULT_SETTINGS.extensions],
      excludedPaths,
      autoDecryptEmbeddedImages:
        typeof data?.autoDecryptEmbeddedImages === "boolean"
          ? data.autoDecryptEmbeddedImages
          : DEFAULT_SETTINGS.autoDecryptEmbeddedImages,
      ...securityTimers
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

    const answer = await PasswordModal.ask(
      this.app,
      filePath,
      this.requiresRememberedPassword()
    );
    if (answer === null) throw new PasswordCancelledError();
    try {
      const plaintext = await decryptWithPassphrase(ciphertext, answer.password);
      if (answer.rememberForSession) this.cachePassword(answer.password);
      this.configurationUnlocked = true;
      return { plaintext, password: answer.password };
    } catch {
      this.clearPassword();
      throw new Error("Wrong password, damaged data, or an unsupported age file.");
    }
  }

  private async encryptAndLock(alreadyConfirmed = false): Promise<void> {
    if (this.autoLockInProgress) {
      new Notice("Vault in Vault is already automatically locking this vault.");
      return;
    }
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
    if (this.autoLockInProgress) {
      this.openLeafFiles = current;
      this.leafSnapshotInitialized = true;
      return;
    }
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
    if (this.autoLockInProgress) return;
    await this.requireValidProtectionPolicy();
    const file = this.getFileByPath(path);
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
    const autoLockGeneration = this.autoLockGeneration;
    const decision = await ClosedFileProtectionModal.ask(this.app, {
      filePath: path,
      allFilePaths: allFiles.map((candidate) => candidate.path),
      ageConfigExcludedPaths: this.getAgeConfigExcludedPaths()
    });
    if (this.autoLockInProgress || autoLockGeneration !== this.autoLockGeneration) return;
    if (decision === "leave") return;
    if (decision === "all") {
      await this.encryptAndLock(true);
      return;
    }

    await this.requireValidProtectionPolicy();
    const currentFile = this.getFileByPath(path);
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
        requiresConfirmation: verificationFile === undefined,
        requiresRememberForSession: this.requiresRememberedPassword()
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

      if (answer.rememberForSession) this.cachePassword(answer.password);
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
    const existingTarget = this.getFileByPath(targetPath);
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
    const existingTarget = this.getFileByPath(targetPath);

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
      const source = this.getFileByPath(context.sourcePath);
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

  private getFileByPath(path: string): TFile | null {
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? file : null;
  }

  private clearPassword(): void {
    this.sessionPassword = null;
    this.configurationUnlocked = false;
    this.securityClock.clearPassword();
    this.updateSecurityIndicator();
  }

  private cachePassword(password: string): void {
    this.sessionPassword = password;
    this.securityClock.setPasswordCached();
    this.updateSecurityIndicator();
  }

  private registerExistingActivityWindows(): void {
    this.registerActivityWindow(this.app.workspace.rootSplit.win);
    this.app.workspace.iterateAllLeaves((leaf) => {
      const activityWindow = leaf.view.containerEl.ownerDocument.defaultView;
      if (activityWindow !== null) this.registerActivityWindow(activityWindow);
    });
  }

  private registerActivityWindow(activityWindow: Window): void {
    const { document } = activityWindow;
    if (!this.trackedActivityDocuments.add(document)) return;

    const record = (): void => this.recordVaultActivity();
    this.registerDomEvent(document, "keydown", record, { capture: true });
    this.registerDomEvent(document, "pointerdown", record, { capture: true, passive: true });
    this.registerDomEvent(document, "pointermove", record, { capture: true, passive: true });
    this.registerDomEvent(document, "touchstart", record, { capture: true, passive: true });
    this.registerDomEvent(document, "wheel", record, { capture: true, passive: true });
    this.registerDomEvent(activityWindow, "focus", () => {
      void this.checkSecurityTimers().then(() => {
        if (this.sessionPassword !== null && !this.autoLockInProgress) {
          this.recordVaultActivity();
        }
      });
    });
  }

  private recordVaultActivity(): void {
    if (this.autoLockInProgress) return;
    const now = Date.now();
    this.securityClock.recordActivity(now);
    // Pointer movement can fire many times per frame. The one-second timer keeps
    // the visual countdown current, so DOM writes only need to be throttled here.
    if (now - this.lastActivityIndicatorUpdateAt >= 1_000) {
      this.lastActivityIndicatorUpdateAt = now;
      this.updateSecurityIndicator();
    }
  }

  private async checkSecurityTimers(): Promise<void> {
    if (this.securityTimerCheckRunning) return;
    const snapshot = this.securityClock.snapshot(this.sessionPassword !== null, this.settings);
    this.updateSecurityIndicator(snapshot);
    if (snapshot.action === "none") return;

    this.securityTimerCheckRunning = true;
    try {
      if (snapshot.action === "clear-password") {
        this.clearPassword();
        new Notice("Vault in Vault: cached password expired and was cleared.");
      } else {
        await this.autoLockAfterIdle();
      }
    } finally {
      this.securityTimerCheckRunning = false;
      this.updateSecurityIndicator();
    }
  }

  private async autoLockAfterIdle(): Promise<void> {
    const password = this.sessionPassword;
    if (password === null || this.autoLockInProgress) return;

    this.autoLockInProgress = true;
    this.autoLockGeneration++;
    const progress = new Notice("Vault in Vault: automatically locking idle vault…", 0);
    try {
      let protectedLeaves = new Map<WorkspaceLeaf, string>();
      const result = await runAutoLockBatch({
        prepare: async () => {
          // A valid policy and completed editor saves are required before any
          // source is replaced or any protected leaf is detached.
          await this.requireValidProtectionPolicy();
          await this.saveOpenMarkdownViews();
          await this.requireValidProtectionPolicy();
          protectedLeaves = this.readProtectedPlaintextLeaves();
          return this.getProtectedPlaintextFiles();
        },
        protect: (file) => this.encryptPlaintextFile(file, password),
        afterProtected: (file, completed, total) => {
          this.detachLeavesForEncryptedPath(protectedLeaves, file.path);
          progress.setMessage(`Vault in Vault: automatically locking ${completed}/${total}…`);
        }
      });

      this.captureOpenLeafFiles();
      if (result.failures.length === 0) {
        new Notice(
          result.completed === 0
            ? "Vault locked; no matching plaintext files were found."
            : `Automatically encrypted and locked ${result.completed} ${result.completed === 1 ? "file" : "files"}.`
        );
      } else {
        const messages = result.failures.map(({ file, error }) => {
          const message = error instanceof Error ? error.message : String(error);
          return `${file.path}: ${message}`;
        });
        const preview = messages.slice(0, 3).join("; ");
        const suffix = messages.length > 3 ? `; and ${messages.length - 3} more` : "";
        new Notice(
          `Automatic lock encrypted ${result.completed} files, but ${messages.length} failed. Plaintext was kept. ${preview}${suffix}`,
          15_000
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Vault in Vault: automatic lock stopped safely: ${message}`, 15_000);
    } finally {
      progress.hide();
      this.clearPassword();
      this.autoLockInProgress = false;
    }
  }

  private readProtectedPlaintextLeaves(): Map<WorkspaceLeaf, string> {
    const leaves = new Map<WorkspaceLeaf, string>();
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (
        leaf.view instanceof FileView &&
        leaf.view.file !== null &&
        isProtectedPlainPath(
          leaf.view.file.path,
          this.getProtectedExtensions(),
          this.app.vault.configDir,
          this.getExcludedPaths()
        )
      ) {
        leaves.set(leaf, leaf.view.file.path);
      }
    });
    return leaves;
  }

  private detachLeavesForEncryptedPath(
    leaves: ReadonlyMap<WorkspaceLeaf, string>,
    encryptedPath: string
  ): void {
    for (const [leaf, originalPath] of leaves) {
      if (originalPath !== encryptedPath) continue;
      const currentPath = leaf.view instanceof FileView ? leaf.view.file?.path : undefined;
      if (currentPath === encryptedPath || currentPath === undefined) leaf.detach();
    }
  }

  private updateSecurityIndicator(
    snapshot = this.securityClock.snapshot(this.sessionPassword !== null, this.settings)
  ): void {
    if (this.ribbonLockEl === null) return;
    this.renderRibbonModeIcon(snapshot.mode);
    const remaining = snapshot.remainingMs === null
      ? null
      : Math.max(1, Math.ceil(snapshot.remainingMs / 60_000));
    let label: string;
    if (this.autoLockInProgress) {
      label = "Vault in Vault is encrypting and locking the vault.";
    } else if (snapshot.indicator === "locked") {
      label = this.settings.idleAutoLockMinutes > 0
        ? "Vault password is not cached; automatic idle lock is not armed."
        : "Vault password is not cached.";
    } else if (snapshot.mode === "password-clear") {
      label = `Vault password is cached; it will be cleared in about ${remaining} ${remaining === 1 ? "minute" : "minutes"}.`;
    } else if (snapshot.mode === "idle-lock") {
      label = `Vault password is cached; automatic lock in about ${remaining} ${remaining === 1 ? "minute" : "minutes"} without activity.`;
    } else {
      label = "Vault password is cached for this Obsidian session.";
    }
    this.ribbonLockEl.dataset.vaultLockState = this.autoLockInProgress
      ? "warning"
      : snapshot.indicator;
    this.ribbonLockEl.setAttribute("aria-label", `${label} Click to encrypt and lock now.`);
  }

  private renderRibbonModeIcon(mode: SecurityTimerMode): void {
    if (
      this.renderedSecurityMode === mode ||
      this.ribbonMainIconEl === null ||
      this.ribbonModeBadgeEl === null
    ) return;

    const icons = getSecurityModeIcon(mode);
    this.ribbonMainIconEl.empty();
    setIcon(this.ribbonMainIconEl, icons.baseIcon);
    this.ribbonModeBadgeEl.empty();
    this.ribbonModeBadgeEl.classList.toggle("is-hidden", icons.badgeIcon === null);
    if (icons.badgeIcon !== null) setIcon(this.ribbonModeBadgeEl, icons.badgeIcon);
    this.renderedSecurityMode = mode;
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
