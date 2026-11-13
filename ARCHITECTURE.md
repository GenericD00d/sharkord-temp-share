# Architecture

The map of the plugin for agents and contributors. Update it in the same commit as any change that
adds, removes, renames or moves something it lists.

## Overview

```
 uploader ── start (action) ──► a share in memory, an empty file named by its token
          ── chunks (/chunk/<token>?offset=…) ──► appended in order; once complete, a card is posted
 anyone with the link ── GET /d/<token> ──► a page with a Download button (spends nothing)
                      ── POST /d/<token> ──► one download spent, a ticket issued, 303 to:
                      ── GET /f/<token>/<ticket> ──► the file, resumable for 6 hours
```

Shares live in memory, which is the source of truth, so two presses can't both spend the last
download. They are saved to the plugin's storage only to survive a restart. Files live in the
plugin's `dataPath/files`, each named by its share's token.

What each route trusts, and what guards it, is in [SECURITY.md](SECURITY.md#trust-boundaries).

## Layout

```
src/server/index.ts   entry: settings, the attachment hook, actions, routes, events, the sweep
src/rules.ts          pure rules: expiry, staleness, quota, tickets, ranges, names, sizes
src/rules.test.ts     their tests (bun test src)
src/types.ts          TShare, TShareCard, TShareListItem, TShareConfig, TPlugin
src/client/index.ts   the slot (CHAT_ACTIONS), the message component (share) and the tab (shares)
src/client/ui.tsx     ShareSlot, ShareCard, AdminTab
build.ts, publish.ts  Sharkord's builder: build, and publish a release
scripts/setup.ts      clones and links the SDK and the builder into .repos/
scripts/check.sh      every local check; check-docs.py, check-version.py and check-types.sh beside it
manifest.json         the plugin's id, version and SDK version
```

## Modules

- **`src/server/index.ts`**: `onLoad` registers the settings (see README), loads the saved shares,
  and:
  - refuses chat attachments over `oversizedMb` (`ctx.hooks.onBeforeFileSave`), pointing people to
    the button;
  - shows the button to members with `UPLOAD_FILES`, in the file sharing channel or everywhere;
  - registers the actions `start`, `delete`, `config` and `list`;
  - serves `/chunk/*` (authenticated), `/d/*` and `/f/*`;
  - deletes a share when its message is deleted, and forgets the sharing channel when that channel
    is;
  - sweeps every minute: expired, used-up and stale shares go, and files no share owns are removed.
- **`src/rules.ts`**: `canDownload`, `isExpired`, `isStale`, `isUsedUp`, `isTicketValid`,
  `parseRange`, `usedBytes`, `usedBytesBy`, `pendingBy`, `cleanName`, `formatSize`, `formatTimeLeft`, and the constants
  `CHUNK_BYTES` (50 MB), `RESUME_WINDOW_MS` (6 hours) and `MB`.
- **`src/client/ui.tsx`**: `ShareSlot` (the button and its form, uploading in chunks with retries),
  `ShareCard` (Download, Copy link, Delete, and the live downloads-left count), and `AdminTab`
  (usage, and a Delete for every share).

## Flows

### Uploading

1. `start` checks the permissions, the channel, the size, the lifetime and the download count; that
   the share fits under the storage limit and the member's own limit, counting unfinished uploads at
   their full size; and that the member hasn't too many unfinished uploads already.
2. It saves the share and creates an empty file named by a new token.
3. The client sends 50 MB chunks to `/chunk/<token>?offset=<bytes so far>`. Only the uploader's,
   only at the expected offset, one at a time, each capped at what's left.
4. With the last chunk, the share's clock starts and its card is posted in the channel.

### Downloading

1. `GET /d/<token>` shows the name, size, downloads left and expiry, and a Download button. Link
   previews and scanners stop here, so they never spend a download.
2. `POST /d/<token>` spends one download, issues a ticket valid for 6 hours or until the share
   expires, and redirects to `/f/<token>/<ticket>`.
3. `GET /f/<token>/<ticket>` serves the file, with range requests, so a dropped download resumes
   without spending another.

### Cleaning up

The sweep removes a share once it expires, once its downloads are spent and its last ticket has
lapsed, or after an hour without progress on an unfinished upload, and deletes its file.

## Contracts

- **Actions**: `TPlugin` in `src/types.ts`. `start` answers with the token and the chunk size;
  `config` with the sharing channel; `list` with usage and every share.
- **Routes**, under `/plugins/temp-share/`: `/chunk/<token>`, `/d/<token>`, `/f/<token>/<ticket>`.
- **The message component** `share`, whose props are a `TShareCard`.
- **Settings**: `limitToChannel`, `shareChannelId`, `storageLimitMb`, `memberLimitMb`,
  `maxPendingUploads`, `oversizedMb`, `maxFileMb`, `maxHours`, `maxDownloads`.
- **Releases**: `temp-share-<version>.tar.gz` and `<version>.json`, plugin id `temp-share`,
  plugin SDK 2. See [docs/standards.md](docs/standards.md#contracts-between-the-repos).
