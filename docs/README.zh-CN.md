# Vault in Vault

Obsidian 通常把笔记和附件保存为普通文件。这让 Vault 很容易迁移、同步和备份，但也意味着任何能够浏览 Vault 副本的人，都可以直接读取里面的内容。

Vault in Vault 让你用一个密码锁住私密笔记和图片，不需要把它们移出 Vault。锁定后的文件仍留在原来的目录中，但内容已经加密。需要使用时，点击文件、输入密码，就可以继续使用 Obsidian 原生编辑器或图片预览。关闭文件的最后一个 Tab 时，可以选择重新加密当前文件、加密全部暴露的明文，或者暂时保持原样。

它适合保护日记、个人资料、工作笔记和不希望在备份或同步副本中保持可读的图片。文件名和目录结构仍然可见；Vault in Vault 保护的是文件内容，而不是隐藏整个 Vault 的结构。

> [!WARNING]
> 文件解锁期间，明文会真实写入磁盘。请先备份，并在用于重要数据前理解下面的安全边界。本项目尚未经过独立安全审计。

[English](../README.md)

## 快速了解使用方式

### 加密文件仍留在原目录

加密文件会在文件列表中显示 **AGE** 标记。文件名和目录结构仍然可见，但没有密码无法读取内容。

![Obsidian 文件列表中带有 AGE 标记的加密文件](images/encrypted-files.png)

### 点击加密文件即可打开

需要阅读或编辑时，点击 **Decrypt and open**。

![加密 Markdown 文件的 Decrypt and open 按钮](images/decrypt-and-open.png)

输入密码后即可解密。可以选择只在当前 Obsidian 会话的内存中记住密码，密码不会写入磁盘。

![带有当前会话记住密码选项的密码窗口](images/password-prompt.png)

解密完成后，笔记会进入 Obsidian 原生编辑器。文件解锁期间，Markdown、图片预览、链接、搜索和兼容的第三方插件都可以正常工作。

### 关闭 Tab 时决定是否重新加密

关闭受保护明文文件的最后一个 Tab 时，可以只加密当前文件、加密所有匹配的明文文件，或者暂时保留明文。

![关闭 Tab 后选择加密当前文件或全部文件](images/encrypt-on-close.png)

### 选择要保护的文件类型

设置页面会显示 Vault 批量锁定覆盖的文件扩展名。默认可以查看设置，但修改前必须验证密码，避免误操作。

![受保护文件类型和图片自动解密设置](images/protected-file-settings.png)

## 主要功能

- 从文件列表直接打开使用密码加密的 `.age` 文件。
- 原位解密 Markdown 和图片，保留原生编辑、预览、链接、搜索和第三方插件能力。
- 关闭文件的最后一个 Tab 后，可选择加密当前文件、加密全部匹配明文或暂时保留明文。
- 提供 **Encrypt and lock vault now** 命令和 Ribbon 锁按钮。
- 用户明确选择后，密码仅缓存在当前插件会话的内存中。
- 默认保护 `.md`、`.avif`、`.bmp`、`.gif`、`.jpeg`、`.jpg`、`.png`、`.svg` 和 `.webp`，可在设置中调整。
- 保留子目录，排除 Vault 配置目录和已经以 `.age` 结尾的文件。
- 删除源文件前，会重新读取并验证刚生成的明文或密文。

## 文件流程

打开 `notes/private.md.age` 并选择 **Decrypt and open**：

```text
notes/private.md.age
    -> 解密并验证 notes/private.md
    -> 删除 notes/private.md.age
    -> 使用原生编辑器打开 notes/private.md
```

关闭受保护明文文件的最后一个 Tab 时，可以选择：

- **Encrypt this file**：只加密刚关闭的文件；
- **Encrypt all (N)**：加密所有匹配的明文文件；
- **Leave plaintext**：本次保留明文。

Tab 会先关闭，让 Obsidian 完成正常保存，然后在应用仍运行时执行加密。取消密码输入、加密期间文件发生变化或验证失败时，插件都会保留明文源文件。

插件不会依赖应用退出钩子进行交互式加密，因为 Obsidian 不会可靠地等待异步加密完成。退出前请先关闭受保护的 Tab，或运行 **Encrypt and lock vault now**。

## 密码规则

- Vault 中存在 `.age` 文件时，会用其中体积最小的文件验证密码。
- 尚无 `.age` 文件时，首次加密要求输入两遍密码。
- 选择记住密码后，密码只存在于当前插件会话的 JavaScript 内存中。
- 密码不会写入 `data.json`。
- 不提供密码恢复；密码丢失后无法恢复密文。

## 安全边界

- 解锁后的内容是磁盘上的普通明文文件。
- Metadata cache、搜索索引、File Recovery、第三方插件、同步工具和系统备份可能保留明文。
- 崩溃、强制结束、断电或直接退出应用可能留下明文。
- JavaScript 无法保证密码字符串立即从进程内存中清除。
- 插件只会在创建、读回并验证替代文件之后删除源文件。把源明文放入废纸篓会留下未加密副本，因此加密切换不会使用 Obsidian 的常规废纸篓行为。
- 文件解锁期间，插件无法防御能够读取 Obsidian 进程或本地文件的其他软件和用户。

插件没有遥测、广告、账号要求或远程服务，也不会访问当前 Vault 之外的文件。正常使用完全离线。

## 本地安装

需要 Node.js 20 或更新版本：

```bash
npm ci
npm run check
npm run install:vault -- "/你的/Vault/绝对路径"
```

最后一条命令会把 `main.js`、`manifest.json` 和 `styles.css` 复制到：

```text
<Vault>/.obsidian/plugins/vault-in-vault/
```

也可以手动复制这三个文件。随后重启或重新加载 Obsidian，并在 **Settings -> Community plugins** 中启用 **Vault in Vault**。

如果安装过 ID 为 `fileencrypt-age-viewer` 的早期开发版，请先停用旧版。新版 ID 是 `vault-in-vault`，Obsidian 会把它们识别为两个插件。若要保留扩展名配置，可以把旧目录的 `data.json` 复制到新目录；其中不包含密码。

## 开发和发布

```bash
npm ci
npm run dev
npm test
npm run check
```

使用 `npm version patch`、`npm version minor` 或 `npm version major` 更新版本。脚本会同步 `package.json`、`manifest.json` 和 `versions.json`。推送不带 `v` 前缀、与 manifest 版本完全一致的 tag 后，GitHub Actions 会构建并生成一个包含三个插件文件的草稿 Release。

## 许可证

[MIT](../LICENSE)。第三方依赖许可见 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。
