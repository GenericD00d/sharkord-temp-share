# Shiver Temp Share: agent guide

## What this repo is

A [Sharkord](https://github.com/sharkord/sharkord) plugin for sharing large files with links that
expire after a time or a number of downloads. A member uploads in chunks from a button beside the
composer; the plugin posts a card in the channel, and anyone with the link can download until it
runs out.

It has two halves built from one codebase. The server half (`src/server/index.ts`) runs inside the
Sharkord server process, as that server's own user, and serves the download pages and files. The
client half (`src/client/`) is React that Sharkord renders: the button, the card and an admin tab.

The download links are public and the files are users', so read SECURITY.md before changing
anything in [Rules that must not break](#rules-that-must-not-break).

## The Shiver family

The four Shiver repos, and the contracts between them, are in
[docs/standards.md](docs/standards.md#the-shiver-family). This repo's side of them:

- It publishes `temp-share-<version>.tar.gz` with `<version>.json`, which the server manager
  installs through its `plugins.json`.
- Its plugin id, `temp-share`, never changes, though the repo was renamed: Sharkord keys the
  plugin's stored shares by it.
- `scripts/setup.ts` builds against the Sharkord release the family is tested against.

## Commands

```bash
bun run setup               # once: clones the Sharkord SDK and builder into .repos/ and links them
scripts/check.sh --quick    # docs, versions and unit tests: seconds
scripts/check.sh            # + install from the lockfile, dependency audit, type check
```

The pieces:

```bash
bun test src                    # the rules: expiry, quotas, tickets, ranges, names
scripts/check-types.sh          # type check: fails on this repo's errors, counts the linked SDK's
bun run build                   # writes the plugin into dist/, and into SHARKORD_PLUGINS_PATH if set
python3 scripts/check-docs.py   # the docs follow docs/standards.md
python3 scripts/check-version.py
```

Releases are in [RELEASING.md](RELEASING.md).

## Layout

```
src/server/index.ts   the plugin's entry: settings, actions, the upload and download routes, the sweep
src/rules.ts          pure rules, tested on their own: expiry, quotas, tickets, ranges, file names
src/types.ts          the types both halves share
src/client/           the composer button, the message card and the admin tab (ui.tsx)
scripts/              setup.ts (the SDK), check.sh, check-docs.py, check-version.py
```

[ARCHITECTURE.md](ARCHITECTURE.md) has the flows and contracts.

## Rules that must not break

SECURITY.md explains why each one matters.

| Rule | Enforced in | Tested by |
|---|---|---|
| A share's token is 18 random bytes, and is its file's only name on disk | `start` in `src/server/index.ts` | Review |
| Files are served only as downloads: `application/octet-stream`, `attachment` and `nosniff` | the `/f/*` route | Review |
| The download page escapes the file's name, under a CSP that allows nothing but its own form | the `/d/*` route, `esc` | Review |
| Starting an upload needs `UPLOAD_FILES` and the right to view and post in that channel; only the uploader can send its chunks, in order | `start`, the `/chunk/*` route | Review |
| Only the uploader or someone with `MANAGE_STORAGE` deletes a share; only `MANAGE_STORAGE` lists them | `delete`, `list` | Review |
| A download is spent before any await, so two presses can't both use the last one | the `/d/*` POST route, `canDownload` | `src/rules.test.ts` |
| Ranges are clamped to the file | `parseRange` in `src/rules.ts` | `src/rules.test.ts` |
| File names lose control characters, slashes, quotes, and invisible and direction-changing marks, and are capped by character | `cleanName` in `src/rules.ts` | `src/rules.test.ts` |
| No member's shares, or unfinished uploads, go over their own limit | `start`, `usedBytesBy` and `pendingBy` in `src/rules.ts` | `src/rules.test.ts` |

## Conventions

- **Bun and TypeScript**, no framework. The SDK comes from Sharkord's repo through `bun run setup`.
- **Pure rules live in `src/rules.ts`** and are tested there; `src/server/index.ts` wires them up.
- **Memory is the source of truth** for shares; storage only survives restarts.
- **Comments say why.** Docs use British spelling.
- **Commits** have a plain-English subject saying what changed and a body saying why.

## When you change something

- **An action, its payload or a share's shape**: `src/types.ts`, and both halves.
- **A setting**: README's Settings table.
- **A rule** in `src/rules.ts`: its test in `src/rules.test.ts`.
- **Something users will notice**: a line under `## Unreleased` in CHANGELOG.md.
- **A release**: bump `manifest.json` and `package.json` together; RELEASING.md has the rest.
- **A decision or a bug worth remembering**: `docs/decisions.md`.
- **docs/standards.md** changes only as its last section describes.

## Further reading

- [ARCHITECTURE.md](ARCHITECTURE.md): uploads, downloads, the sweep, and the contracts
- [SECURITY.md](SECURITY.md): trust boundaries, scope and review history
- [RELEASING.md](RELEASING.md): building, publishing and verifying a release
- [docs/decisions.md](docs/decisions.md): decisions, open items and the bug log
- [docs/standards.md](docs/standards.md): the standard all four Shiver repos follow
