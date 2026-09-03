# Contributing

Contributions and focused bug reports are welcome.

## Development setup

Use Node.js 20 or newer:

```bash
npm ci
npm run check
```

Use `npm run dev` for watch mode. Test changes only in a disposable vault with backups; plugin bugs can rename or remove vault files.

## Pull requests

- Keep changes focused and add tests for behavior changes.
- Run `npm run check` before opening a pull request.
- Do not commit `node_modules`, `main.js`, local vault data, passwords, or decrypted personal content.
- Describe any file lifecycle, compatibility, or security consequences explicitly.

Report potential vulnerabilities according to [SECURITY.md](SECURITY.md), not in a public issue.
