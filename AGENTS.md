# AGENTS.md

This repo is a **Sharkord plugin**: a package that Sharkord loads to extend a
server. A plugin has two halves built from one codebase:

- `src/server/index.ts` runs inside the Sharkord server process. It registers
  chat commands, actions, settings, event listeners and storage, and can push
  data to clients.
- `src/client/` holds React components the Sharkord client renders in the slots
  `src/client/index.ts` declares. They call server actions and receive pushes.
- `manifest.json` is the plugin's identity and the SDK version it targets.

The halves share types, not code: the server declares one `TSharkord` contract
and the client imports it with `import type`. See [README.md](README.md) for
the layout, build and publish steps.

## Code guidance

The plugin SDK lives in the Sharkord monorepo, cloned into `.repos/sharkord` by
`bun run setup`. For how Sharkord's code is organized, its conventions, and the
plugin SDK (`packages/plugin-sdk`), read
[.repos/sharkord/AGENTS.md](.repos/sharkord/AGENTS.md) if present.
