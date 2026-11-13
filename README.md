<p align="center"><img src="logo.png" alt="Shiver Temp Share logo" width="160"></p>

# Shiver Temp Share (Sharkord plugin)

Share big files with a link that dies after N hours or N downloads.

## A disclaimer worth reading

**This project is vibecoded.** Almost all of it was written by an LLM working from one person's direction, review and bug reports.

- **No independent security audit has been done.** It stores the files members share and serves them to anyone with a link. Read the code before you trust a server to it. Its internal reviews are listed in [SECURITY.md](SECURITY.md#review-history); they are not an outside audit.
- **Releases are checked only against a checksum published in the same release**, which catches a damaged download but not a compromised account ([RELEASING.md](RELEASING.md#keys)).
- It is early software. Expect rough edges, and expect things to change.

It is offered as-is.

## What it does

- File-with-clock button next to the emoji and paperclip buttons: pick a file, lifetime and max downloads. Uploads go in 50 MB chunks (safe behind Cloudflare/nginx limits) and retry on failure.
- The plugin posts a card in the channel with Download / Copy link / Delete and a live "downloads left" count.
- The copied link opens a small page with a Download button. Only the button press counts as a download, so link previews and scanners don't use any up.
- Pressing Download uses one download and hands the browser a private link that supports pausing and resuming (HTTP range requests) for 6 hours, so a dropped or resumed download doesn't cost another use.
- Normal chat attachments over the **Redirect attachments over (MB)** size (default 25, 0 = off) are refused with a message pointing people to that button.

## Install

With the [Shiver Server Manager](https://github.com/GenericD00d/shiver-server-manager), install it from the server's plugins. By hand: `bun run setup` once, then `bun run build` (see [Building](#building)), copy the built folder into your server's plugins directory, and enable it under Server Settings → Plugins.

If you're behind a reverse proxy, make sure it allows request bodies of at least 50 MB (nginx: `client_max_body_size 60m;`).

## Usage

Press the file-with-clock button beside the composer, pick a file, a lifetime and a number of downloads, and send. Share the card's link with whoever should have the file. The uploader, or an admin, can delete it from the card.

Set **File sharing channel** to show the button only in that channel and keep other chat bars uncluttered. Switch off **Only show in the file sharing channel** (or leave the channel empty) to show it everywhere. Changes apply to everyone right away, no reload needed.

## Settings

| Setting | Default |
|---|---|
| Only show in the file sharing channel | on |
| File sharing channel | empty (every channel) |
| Total storage limit (MB) | 20480 |
| Redirect attachments over (MB) | 25 |
| Max file size (MB) | 4096 |
| Max lifetime (hours) | 168 |
| Max downloads per file | 100 |

## Keeping storage under control

- **Storage limit** setting (default 20 GB): uploads are refused once shared files would exceed it. Uploads still in progress count at their full size.
- Files are deleted when they expire, are deleted by the uploader, or when the chat message is deleted. A file that runs out of downloads is kept until the last download's 6-hour resume window closes (or the file expires, whichever is first), then deleted.
- Admins (`MANAGE_STORAGE`) get a **Shared files** tab in the plugin settings showing usage and a Delete button for every file.
- Abandoned uploads are cleaned up after 1 hour with no progress. Files on disk that the plugin no longer tracks are removed every minute.

Files live in the plugin's `dataPath/files`. Uninstalling the plugin removes them.

## Known limitations

- Anyone holding a link can use it until it runs out; there is no per-person access.
- The storage limit is shared by everyone on the server.

## Building

```bash
bun run setup      # clones the Sharkord SDK + builder into .repos and links them
cp .env.example .env   # set SHARKORD_PLUGINS_PATH
bun run build
bun test src       # rules tests
```

`scripts/check.sh` runs every check; [AGENTS.md](AGENTS.md) has the rules not to break, and [RELEASING.md](RELEASING.md) the release steps.

## The Shiver family

- [Shiver](https://github.com/GenericD00d/Shiver): the desktop and Android client, and the companion plugin
- [shiver-server-manager](https://github.com/GenericD00d/shiver-server-manager): sets up and runs Sharkord servers, with the Shiver plugins
- [shiver-media-player](https://github.com/GenericD00d/shiver-media-player): a plugin for watching videos together in a voice channel
- **shiver-temp-share**, this repo

## Licence

MIT, see [LICENSE](LICENSE).
